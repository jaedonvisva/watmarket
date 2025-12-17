from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from uuid import UUID
from datetime import datetime, timezone

from app.database import get_supabase_admin
from app.models.schemas import BetCreate, BetResponse, UserResponse, PositionResponse, PortfolioSummary, SellSharesRequest, SellSharesResponse
from app.services.auth import get_current_user
from app.services.odds import calculate_cpmm_buy, calculate_cpmm_sell, calculate_odds

router = APIRouter(prefix="/bets", tags=["bets"])


@router.post("/place", response_model=BetResponse, status_code=status.HTTP_201_CREATED)
async def place_bet(
    bet_data: BetCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Place a bet (Buy Shares) on a prediction line using CPMM.
    Uses atomic database function to prevent race conditions.
    """
    admin_client = get_supabase_admin()
    
    try:
        # Call atomic bet placement function
        result = admin_client.rpc('place_bet_atomic', {
            'p_user_id': str(current_user.id),
            'p_line_id': str(bet_data.line_id),
            'p_outcome': bet_data.outcome,
            'p_stake': bet_data.stake
        }).execute()
        
        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to place bet")
        
        bet_result = result.data
        
        # Fetch the created bet for full response
        bet_record = admin_client.table("bets").select("*").eq("id", bet_result["bet_id"]).single().execute()
        bet = bet_record.data
        
        return BetResponse(
            id=bet["id"],
            user_id=bet["user_id"],
            line_id=bet["line_id"],
            outcome=bet["outcome"],
            stake=bet["stake"],
            shares=bet_result["shares"],
            created_at=bet["created_at"],
            potential_payout=bet_result["shares"],  # 1:1 payout
            buy_price=bet_result["buy_price"],
            payout=None
        )
        
    except Exception as e:
        error_msg = str(e)
        # Map database errors to HTTP errors
        if "Insufficient balance" in error_msg:
            raise HTTPException(status_code=400, detail="Insufficient GOOSE balance")
        elif "Line not found" in error_msg:
            raise HTTPException(status_code=404, detail="Line not found")
        elif "Line is resolved" in error_msg:
            raise HTTPException(status_code=400, detail="Line resolved")
        elif "Betting closed" in error_msg:
            raise HTTPException(status_code=400, detail="Betting closed")
        elif "User not found" in error_msg:
            raise HTTPException(status_code=404, detail="User not found")
        elif "Invalid outcome" in error_msg:
            raise HTTPException(status_code=400, detail="Invalid outcome: must be yes or no")
        else:
            raise HTTPException(status_code=500, detail=f"Failed to place bet: {error_msg}")


@router.post("/sell", response_model=SellSharesResponse)
async def sell_shares(
    sell_data: SellSharesRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Sell shares from a position using CPMM.
    Uses atomic database function to prevent race conditions.
    """
    admin_client = get_supabase_admin()
    
    try:
        # Call atomic sell function
        result = admin_client.rpc('sell_shares_atomic', {
            'p_user_id': str(current_user.id),
            'p_line_id': str(sell_data.line_id),
            'p_outcome': sell_data.outcome,
            'p_shares': sell_data.shares
        }).execute()
        
        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to sell shares")
        
        sell_result = result.data
        
        return SellSharesResponse(
            shares_sold=sell_result["shares_sold"],
            amount_received=sell_result["amount_received"],
            sell_price=sell_result["sell_price"],
            new_balance=sell_result["new_balance"],
            remaining_shares=sell_result["remaining_shares"]
        )
        
    except Exception as e:
        error_msg = str(e)
        # Map database errors to HTTP errors
        if "Insufficient shares" in error_msg:
            raise HTTPException(status_code=400, detail="Insufficient shares to sell")
        elif "Line not found" in error_msg:
            raise HTTPException(status_code=404, detail="Market not found")
        elif "Cannot sell shares on resolved market" in error_msg:
            raise HTTPException(status_code=400, detail="Cannot sell shares on resolved market")
        elif "Invalid outcome" in error_msg:
            raise HTTPException(status_code=400, detail="Invalid outcome: must be yes or no")
        elif "Sell amount too small" in error_msg:
            raise HTTPException(status_code=400, detail="Sell amount too small")
        else:
            raise HTTPException(status_code=500, detail=f"Failed to sell shares: {error_msg}")


@router.get("/my", response_model=List[BetResponse])
async def get_my_bets(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get all bets placed by the current user."""
    admin_client = get_supabase_admin()
    
    result = admin_client.table("bets")\
        .select("*")\
        .eq("user_id", str(current_user.id))\
        .order("created_at", desc=True)\
        .execute()
    
    bets = []
    for bet in result.data:
        # In CPMM, potential payout is just shares * 1 (if not resolved yet)
        # If resolved, payout is in 'payout' field
        shares = bet.get("shares") or 0
        potential_payout = shares if bet.get("payout") is None else None
        
        bets.append(BetResponse(
            id=bet["id"],
            user_id=bet["user_id"],
            line_id=bet["line_id"],
            outcome=bet["outcome"],
            stake=bet["stake"],
            shares=shares,
            created_at=bet["created_at"],
            potential_payout=potential_payout,
            buy_price=bet.get("buy_price"),
            payout=bet.get("payout")
        ))
    
    return bets


@router.get("/line/{line_id}", response_model=List[BetResponse])
async def get_bets_for_line(
    line_id: UUID,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get current user's bets for a specific line."""
    admin_client = get_supabase_admin()
    
    result = admin_client.table("bets")\
        .select("*")\
        .eq("user_id", str(current_user.id))\
        .eq("line_id", str(line_id))\
        .order("created_at", desc=True)\
        .execute()
    
    # Note: Pydantic will handle optional fields, but old bets might have None shares
    return [BetResponse(**bet) for bet in result.data]


@router.get("/line/{line_id}/all", response_model=List[dict])
async def get_all_bets_for_line(
    line_id: UUID,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get all bets for a specific line (admin only). Includes user email."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    admin_client = get_supabase_admin()
    
    # Get bets with user info
    result = admin_client.table("bets")\
        .select("*, users(email)")\
        .eq("line_id", str(line_id))\
        .order("created_at", desc=True)\
        .execute()
    
    bets = []
    for bet in result.data:
        user_info = bet.pop("users", {}) or {}
        bets.append({
            **bet,
            "user_email": user_info.get("email", "Unknown")
        })
    
    return bets


@router.get("/positions", response_model=List[PositionResponse])
async def get_positions(
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get aggregated positions for the current user.
    Groups bets by (line_id, outcome) and calculates current value based on market prices.
    """
    admin_client = get_supabase_admin()
    
    # Get all bets with line data
    result = admin_client.table("bets")\
        .select("*, lines(*)")\
        .eq("user_id", str(current_user.id))\
        .execute()
    
    # Aggregate by (line_id, outcome)
    positions_map = {}
    
    for bet in result.data:
        line = bet.get("lines", {})
        if not line:
            continue
            
        key = (bet["line_id"], bet["outcome"])
        
        if key not in positions_map:
            positions_map[key] = {
                "line_id": bet["line_id"],
                "line": line,
                "outcome": bet["outcome"],
                "total_shares": 0,
                "total_cost": 0,
                "total_payout": 0,
                "has_payout": False,
            }
        
        shares = bet.get("shares") or 0
        positions_map[key]["total_shares"] += shares
        positions_map[key]["total_cost"] += bet["stake"]
        
        if bet.get("payout") is not None:
            positions_map[key]["total_payout"] += bet["payout"]
            positions_map[key]["has_payout"] = True
    
    # Build response
    positions = []
    for key, pos in positions_map.items():
        line = pos["line"]
        
        # Calculate current price
        odds = calculate_odds(line["yes_pool"], line["no_pool"])
        current_price = odds.yes_probability if pos["outcome"] == "yes" else odds.no_probability
        
        # Calculate values
        total_shares = pos["total_shares"]
        total_cost = pos["total_cost"]
        avg_buy_price = total_cost / total_shares if total_shares > 0 else 0
        
        is_resolved = line["resolved"]
        
        if is_resolved:
            # Use actual payout
            current_value = pos["total_payout"]
            pnl = current_value - total_cost
        else:
            # Use actual sell value from CPMM (what you'd get if you sold now)
            current_value = calculate_cpmm_sell(
                total_shares,
                pos["outcome"],
                line["yes_pool"],
                line["no_pool"]
            )
            pnl = current_value - total_cost
        
        pnl_percent = (pnl / total_cost * 100) if total_cost > 0 else 0
        
        positions.append(PositionResponse(
            line_id=pos["line_id"],
            line_title=line["title"],
            line_resolved=is_resolved,
            line_correct_outcome=line.get("correct_outcome"),
            outcome=pos["outcome"],
            total_shares=total_shares,
            total_cost=total_cost,
            avg_buy_price=avg_buy_price,
            current_price=current_price,
            current_value=current_value,
            pnl=pnl,
            pnl_percent=pnl_percent,
            payout=pos["total_payout"] if pos["has_payout"] else None,
            is_active=not is_resolved
        ))
    
    # Sort: active first, then by P&L
    positions.sort(key=lambda p: (not p.is_active, -p.pnl))
    
    return positions


@router.get("/portfolio", response_model=PortfolioSummary)
async def get_portfolio_summary(
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get overall portfolio summary with P&L calculations.
    
    Aggregates bets by (line_id, outcome) FIRST, then computes liquidation value
    once per position. This matches /bets/positions semantics and ensures
    consistent valuation across the app.
    
    Key distinction:
    - Active positions: value is CPMM liquidation value (what you'd get if you sold now)
    - Resolved positions: payout already added to cash balance, tracked for P&L history
    """
    admin_client = get_supabase_admin()
    
    # Get all bets with line data
    result = admin_client.table("bets")\
        .select("*, lines(*)")\
        .eq("user_id", str(current_user.id))\
        .execute()
    
    # Step 1: Aggregate bets into positions by (line_id, outcome)
    positions_map = {}
    
    for bet in result.data:
        line = bet.get("lines", {})
        if not line:
            continue
        
        key = (bet["line_id"], bet["outcome"])
        
        if key not in positions_map:
            positions_map[key] = {
                "line": line,
                "outcome": bet["outcome"],
                "total_shares": 0,
                "total_cost": 0,
                "total_payout": 0,
            }
        
        shares = bet.get("shares") or 0
        positions_map[key]["total_shares"] += shares
        positions_map[key]["total_cost"] += bet["stake"]
        
        if bet.get("payout") is not None:
            positions_map[key]["total_payout"] += bet["payout"]
    
    # Step 2: Compute metrics from aggregated positions
    active_invested = 0
    active_value = 0
    total_invested = 0
    total_returned = 0
    active_count = 0
    resolved_count = 0
    
    for key, pos in positions_map.items():
        line = pos["line"]
        is_resolved = line["resolved"]
        total_shares = pos["total_shares"]
        total_cost = pos["total_cost"]
        
        total_invested += total_cost
        
        if is_resolved:
            # Use actual payout for resolved positions
            total_returned += pos["total_payout"]
            resolved_count += 1
        else:
            # Compute liquidation value ONCE for the entire aggregated position
            position_value = calculate_cpmm_sell(
                total_shares,
                pos["outcome"],
                line["yes_pool"],
                line["no_pool"]
            )
            active_invested += total_cost
            active_value += position_value
            total_returned += position_value
            active_count += 1
    
    total_pnl = total_returned - total_invested
    total_pnl_percent = (total_pnl / total_invested * 100) if total_invested > 0 else 0
    total_portfolio_value = current_user.karma_balance + active_value
    
    return PortfolioSummary(
        cash_balance=current_user.karma_balance,
        invested_value=active_invested,
        positions_value=active_value,
        total_portfolio_value=total_portfolio_value,
        total_pnl=total_pnl,
        total_pnl_percent=total_pnl_percent,
        active_positions_count=active_count,
        resolved_positions_count=resolved_count
    )

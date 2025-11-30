from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from uuid import UUID
from datetime import datetime, timezone

from app.database import get_supabase_admin
from app.models.schemas import BetCreate, BetResponse, UserResponse, PositionResponse, PortfolioSummary
from app.services.auth import get_current_user
from app.services.odds import calculate_cpmm_buy, calculate_odds

router = APIRouter(prefix="/bets", tags=["bets"])


@router.post("/place", response_model=BetResponse, status_code=status.HTTP_201_CREATED)
async def place_bet(
    bet_data: BetCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Place a bet (Buy Shares) on a prediction line using CPMM.
    """
    admin_client = get_supabase_admin()
    
    # Get the line
    line_result = admin_client.table("lines").select("*").eq("id", str(bet_data.line_id)).single().execute()
    
    if not line_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Line not found"
        )
    
    line = line_result.data
    
    # Check resolution/closing
    if line["resolved"]:
        raise HTTPException(status_code=400, detail="Line resolved")
        
    closes_at = datetime.fromisoformat(line["closes_at"].replace("Z", "+00:00"))
    if closes_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Betting closed")
    
    if current_user.karma_balance < bet_data.stake:
        raise HTTPException(status_code=400, detail="Insufficient GOOSE balance")
    
    # Deduct karma
    new_balance = current_user.karma_balance - bet_data.stake
    admin_client.table("users").update({
        "karma_balance": new_balance
    }).eq("id", str(current_user.id)).execute()
    
    # CPMM Buy
    shares, new_yes, new_no = calculate_cpmm_buy(
        bet_data.stake, 
        bet_data.outcome, 
        line["yes_pool"], 
        line["no_pool"]
    )
    
    # Update pools and volume
    current_volume = line.get("volume", 0) or 0
    admin_client.table("lines").update({
        "yes_pool": new_yes,
        "no_pool": new_no,
        "volume": current_volume + bet_data.stake
    }).eq("id", str(bet_data.line_id)).execute()
    
    # Calculate metrics
    buy_price = bet_data.stake / shares if shares > 0 else 0
    
    # Create bet
    bet_result = admin_client.table("bets").insert({
        "user_id": str(current_user.id),
        "line_id": str(bet_data.line_id),
        "outcome": bet_data.outcome,
        "stake": bet_data.stake,
        "shares": shares,
        "buy_price": buy_price
    }).execute()
    
    bet = bet_result.data[0]
    
    # Transaction
    admin_client.table("transactions").insert({
        "user_id": str(current_user.id),
        "amount": -bet_data.stake,
        "type": "bet",
        "reference_id": bet["id"]
    }).execute()
    
    return BetResponse(
        id=bet["id"],
        user_id=bet["user_id"],
        line_id=bet["line_id"],
        outcome=bet["outcome"],
        stake=bet["stake"],
        shares=shares,
        created_at=bet["created_at"],
        potential_payout=shares, # 1:1 payout
        buy_price=buy_price,
        payout=None
    )


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
            # Use current market value
            current_value = total_shares * current_price
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
    
    Key distinction:
    - Active positions: value is based on current market price (unrealized)
    - Resolved positions: payout already added to cash balance, so we only track for P&L history
    """
    admin_client = get_supabase_admin()
    
    # Get all bets with line data
    result = admin_client.table("bets")\
        .select("*, lines(*)")\
        .eq("user_id", str(current_user.id))\
        .execute()
    
    # Track active positions only for current value
    active_invested = 0  # Cost basis of active positions
    active_value = 0     # Current market value of active positions
    
    # Track all-time P&L (including resolved)
    total_invested = 0   # All-time cost basis
    total_returned = 0   # All-time value (payouts + current value)
    
    active_count = 0
    resolved_count = 0
    seen_positions = set()
    
    for bet in result.data:
        line = bet.get("lines", {})
        if not line:
            continue
        
        shares = bet.get("shares") or 0
        stake = bet["stake"]
        is_resolved = line["resolved"]
        position_key = (bet["line_id"], bet["outcome"])
        
        total_invested += stake
        
        if is_resolved:
            # Resolved: payout already in cash balance
            payout = bet.get("payout") or 0
            total_returned += payout
        else:
            # Active: track separately
            active_invested += stake
            odds = calculate_odds(line["yes_pool"], line["no_pool"])
            current_price = odds.yes_probability if bet["outcome"] == "yes" else odds.no_probability
            position_value = shares * current_price
            active_value += position_value
            total_returned += position_value
        
        # Count unique positions
        if position_key not in seen_positions:
            seen_positions.add(position_key)
            if is_resolved:
                resolved_count += 1
            else:
                active_count += 1
    
    # P&L is all-time: what you got back vs what you put in
    total_pnl = total_returned - total_invested
    total_pnl_percent = (total_pnl / total_invested * 100) if total_invested > 0 else 0
    
    # Portfolio value = cash + active positions value (resolved payouts already in cash)
    total_portfolio_value = current_user.karma_balance + active_value
    
    return PortfolioSummary(
        cash_balance=current_user.karma_balance,
        invested_value=active_invested,      # Only active positions
        positions_value=active_value,        # Only active positions
        total_portfolio_value=total_portfolio_value,
        total_pnl=total_pnl,                 # All-time P&L
        total_pnl_percent=total_pnl_percent,
        active_positions_count=active_count,
        resolved_positions_count=resolved_count
    )

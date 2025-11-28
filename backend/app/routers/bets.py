from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from uuid import UUID
from datetime import datetime, timezone

from app.database import get_supabase_admin
from app.models.schemas import BetCreate, BetResponse, UserResponse
from app.services.auth import get_current_user
from app.services.odds import calculate_cpmm_buy

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
        raise HTTPException(status_code=400, detail="Insufficient karma")
    
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
    
    # Update pools
    admin_client.table("lines").update({
        "yes_pool": new_yes,
        "no_pool": new_no
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
        potential_payout = shares if not bet.get("payout") else None
        
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

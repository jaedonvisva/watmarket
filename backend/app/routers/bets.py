from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from uuid import UUID
from datetime import datetime, timezone

from app.database import get_supabase_admin
from app.models.schemas import BetCreate, BetResponse, UserResponse
from app.services.auth import get_current_user
from app.services.odds import calculate_potential_payout

router = APIRouter(prefix="/bets", tags=["bets"])


@router.post("/place", response_model=BetResponse, status_code=status.HTTP_201_CREATED)
async def place_bet(
    bet_data: BetCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Place a bet on a prediction line.
    
    This will:
    1. Verify user has enough karma
    2. Verify line is open for betting
    3. Deduct karma from user
    4. Update line stakes
    5. Create bet record
    6. Create transaction record
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
    
    # Check if line is resolved
    if line["resolved"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot bet on resolved line"
        )
    
    # Check if line is closed
    closes_at = datetime.fromisoformat(line["closes_at"].replace("Z", "+00:00"))
    if closes_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Betting is closed for this line"
        )
    
    # Check user has enough karma
    if current_user.karma_balance < bet_data.stake:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient karma. You have {current_user.karma_balance}, need {bet_data.stake}"
        )
    
    # Deduct karma from user
    new_balance = current_user.karma_balance - bet_data.stake
    admin_client.table("users").update({
        "karma_balance": new_balance
    }).eq("id", str(current_user.id)).execute()
    
    # Update line stakes
    stake_field = "yes_stake" if bet_data.outcome == "yes" else "no_stake"
    new_stake = line[stake_field] + bet_data.stake
    admin_client.table("lines").update({
        stake_field: new_stake
    }).eq("id", str(bet_data.line_id)).execute()
    
    # Create bet record
    bet_result = admin_client.table("bets").insert({
        "user_id": str(current_user.id),
        "line_id": str(bet_data.line_id),
        "outcome": bet_data.outcome,
        "stake": bet_data.stake
    }).execute()
    
    bet = bet_result.data[0]
    
    # Create transaction record
    admin_client.table("transactions").insert({
        "user_id": str(current_user.id),
        "amount": -bet_data.stake,
        "type": "bet",
        "reference_id": bet["id"]
    }).execute()
    
    # Calculate potential payout with updated stakes
    updated_yes = line["yes_stake"] + (bet_data.stake if bet_data.outcome == "yes" else 0)
    updated_no = line["no_stake"] + (bet_data.stake if bet_data.outcome == "no" else 0)
    potential_payout = calculate_potential_payout(
        bet_data.stake, bet_data.outcome, updated_yes, updated_no
    )
    
    return BetResponse(
        id=bet["id"],
        user_id=bet["user_id"],
        line_id=bet["line_id"],
        outcome=bet["outcome"],
        stake=bet["stake"],
        created_at=bet["created_at"],
        potential_payout=potential_payout
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
        # Get line for potential payout calculation
        line_result = admin_client.table("lines").select("yes_stake, no_stake, resolved").eq("id", bet["line_id"]).single().execute()
        line = line_result.data
        
        potential_payout = None
        if not line["resolved"]:
            potential_payout = calculate_potential_payout(
                bet["stake"], bet["outcome"], line["yes_stake"], line["no_stake"]
            )
        
        bets.append(BetResponse(
            id=bet["id"],
            user_id=bet["user_id"],
            line_id=bet["line_id"],
            outcome=bet["outcome"],
            stake=bet["stake"],
            created_at=bet["created_at"],
            potential_payout=potential_payout
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
    
    return [BetResponse(**bet) for bet in result.data]

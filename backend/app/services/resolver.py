from uuid import UUID
from typing import List, Dict
from supabase import Client

from app.database import get_supabase_admin


def resolve_line(line_id: UUID, correct_outcome: str) -> Dict:
    """
    Resolve a prediction line and distribute payouts.
    
    Payout Logic:
    1. Gather all bets for the winning side
    2. Sum all losing stakes
    3. Distribute losing stakes proportionally to winners based on their stake size
    
    Returns summary of resolution.
    """
    admin_client = get_supabase_admin()
    
    # Get the line
    line_result = admin_client.table("lines").select("*").eq("id", str(line_id)).single().execute()
    line = line_result.data
    
    if not line:
        raise ValueError(f"Line {line_id} not found")
    
    if line["resolved"]:
        raise ValueError(f"Line {line_id} already resolved")
    
    # Get all bets for this line
    bets_result = admin_client.table("bets").select("*").eq("line_id", str(line_id)).execute()
    bets = bets_result.data
    
    if not bets:
        # No bets placed, just mark as resolved
        admin_client.table("lines").update({
            "resolved": True,
            "correct_outcome": correct_outcome
        }).eq("id", str(line_id)).execute()
        
        return {
            "line_id": str(line_id),
            "correct_outcome": correct_outcome,
            "total_bets": 0,
            "winners": 0,
            "losers": 0,
            "total_payout": 0
        }
    
    # Separate winners and losers
    winning_bets = [b for b in bets if b["outcome"] == correct_outcome]
    losing_bets = [b for b in bets if b["outcome"] != correct_outcome]
    
    # Calculate payouts (CPMM: Payout = Shares * 1.0)
    payouts = []
    
    for bet in winning_bets:
        shares = bet.get("shares") or 0
        # GOOSE is int, so we round the payout
        payout = int(round(shares))
        
        payouts.append({
            "user_id": bet["user_id"],
            "bet_id": bet["id"],
            "shares": shares,
            "payout": payout
        })
        
        # Update bet record with payout
        admin_client.table("bets").update({
            "payout": payout
        }).eq("id", bet["id"]).execute()
    
    # Mark losing bets with 0 payout
    for bet in losing_bets:
        admin_client.table("bets").update({
            "payout": 0
        }).eq("id", bet["id"]).execute()
    
    # Update user balances and create transactions
    for payout_info in payouts:
        user_id = payout_info["user_id"]
        payout_amount = payout_info["payout"]
        
        if payout_amount > 0:
            # Get current balance
            user_result = admin_client.table("users").select("karma_balance").eq("id", user_id).single().execute()
            current_balance = user_result.data["karma_balance"]
            
            # Update balance
            admin_client.table("users").update({
                "karma_balance": current_balance + payout_amount
            }).eq("id", user_id).execute()
            
            # Create payout transaction
            admin_client.table("transactions").insert({
                "user_id": user_id,
                "amount": payout_amount,
                "type": "payout",
                "reference_id": str(line_id)
            }).execute()
    
    # Mark line as resolved
    admin_client.table("lines").update({
        "resolved": True,
        "correct_outcome": correct_outcome
    }).eq("id", str(line_id)).execute()
    
    return {
        "line_id": str(line_id),
        "correct_outcome": correct_outcome,
        "total_bets": len(bets),
        "winners": len(winning_bets),
        "losers": len(losing_bets),
        "total_payout": sum(p["payout"] for p in payouts),
        "payouts": payouts
    }

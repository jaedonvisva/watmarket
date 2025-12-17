from uuid import UUID
from typing import List, Dict
from supabase import Client

from app.database import get_supabase_admin


def resolve_line(line_id: UUID, correct_outcome: str) -> Dict:
    """
    Resolve a prediction line and distribute payouts.
    Uses atomic database function to prevent race conditions and double-resolution.
    
    Payout Logic (CPMM):
    - Winners receive shares * 1.0 (rounded to integer GOOS)
    - Losers receive 0
    
    Returns summary of resolution.
    """
    if correct_outcome not in ('yes', 'no'):
        raise ValueError(f"Invalid outcome: {correct_outcome}. Must be 'yes' or 'no'")
    
    admin_client = get_supabase_admin()
    
    try:
        # Call atomic resolution function
        result = admin_client.rpc('resolve_line_atomic', {
            'p_line_id': str(line_id),
            'p_correct_outcome': correct_outcome
        }).execute()
        
        if not result.data:
            raise ValueError(f"Failed to resolve line {line_id}")
        
        resolution_result = result.data
        
        return {
            "line_id": resolution_result["line_id"],
            "correct_outcome": resolution_result["correct_outcome"],
            "total_bets": resolution_result["winners"] + resolution_result["losers"],
            "winners": resolution_result["winners"],
            "losers": resolution_result["losers"],
            "total_payout": resolution_result["total_payout"]
        }
        
    except Exception as e:
        error_msg = str(e)
        if "Line not found" in error_msg:
            raise ValueError(f"Line {line_id} not found")
        elif "Line already resolved" in error_msg:
            raise ValueError(f"Line {line_id} already resolved")
        elif "Invalid outcome" in error_msg:
            raise ValueError(f"Invalid outcome: {correct_outcome}. Must be 'yes' or 'no'")
        else:
            raise ValueError(f"Failed to resolve line: {error_msg}")

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID

from app.database import get_service_client, get_jwt_client, get_anon_client
from app.services.auth import get_current_user_with_token, AuthenticatedUser
from app.models.schemas import UserResponse

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])

# Optional auth - doesn't raise if no token provided
optional_security = HTTPBearer(auto_error=False)


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security)
) -> Optional[AuthenticatedUser]:
    """Get current user if authenticated, otherwise return None."""
    if not credentials:
        return None
    
    token = credentials.credentials
    try:
        supabase = get_anon_client()
        user_response = supabase.auth.get_user(token)
        
        if not user_response or not user_response.user:
            return None
        
        auth_user = user_response.user
        user_client = get_jwt_client(token)
        result = user_client.table("users").select("*").eq("id", str(auth_user.id)).single().execute()
        
        if not result.data:
            return None
        
        return AuthenticatedUser(
            user=UserResponse(**result.data),
            token=token
        )
    except Exception:
        return None


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: UUID
    display_name: str
    skill_score: float
    total_profit: float
    markets_participated: int
    win_rate: float
    avg_return_per_market: float
    is_current_user: bool = False


class LeaderboardResponse(BaseModel):
    entries: List[LeaderboardEntry]
    total_participants: int
    min_markets_required: int


class UserLeaderboardStats(BaseModel):
    rank: Optional[int]
    skill_score: float
    total_profit: float
    markets_participated: int
    win_rate: float
    avg_return_per_market: float
    qualifies: bool
    min_markets_required: int


@router.get("", response_model=LeaderboardResponse)
async def get_leaderboard(
    limit: int = Query(default=100, ge=1, le=500),
    min_markets: int = Query(default=3, ge=1, le=50),
    auth: Optional[AuthenticatedUser] = Depends(get_optional_current_user)
):
    """
    Get the skill score leaderboard.
    
    The leaderboard ranks users by Risk-Adjusted Return (Skill Score),
    computed as the sum of log returns across all resolved markets.
    
    - Only includes users who have participated in at least `min_markets` resolved markets
    - Excludes voided/invalid markets
    - Returns anonymized display names
    """
    try:
        # Use service client to call the RPC (it's SECURITY DEFINER anyway)
        supabase = get_service_client()
        
        # Call the fast leaderboard RPC (uses pre-computed stats)
        result = supabase.rpc(
            'get_leaderboard_fast',
            {'p_limit': limit, 'p_min_markets': min_markets}
        ).execute()
        
        current_user_id = str(auth.user.id) if auth else None
        
        entries = []
        for row in result.data or []:
            entry = LeaderboardEntry(
                rank=row['rank'],
                user_id=row['user_id'],
                display_name=row['display_name'],
                skill_score=float(row['skill_score'] or 0),
                total_profit=float(row['total_profit'] or 0),
                markets_participated=row['markets_participated'],
                win_rate=float(row['win_rate'] or 0),
                avg_return_per_market=float(row['avg_return_per_market'] or 0),
                is_current_user=(str(row['user_id']) == current_user_id) if current_user_id else False
            )
            entries.append(entry)
        
        return LeaderboardResponse(
            entries=entries,
            total_participants=len(entries),
            min_markets_required=min_markets
        )
        
    except Exception as e:
        error_msg = str(e)
        print(f"Leaderboard error: {error_msg}")
        
        # Check if it's a function not found error
        if "function" in error_msg.lower() and "does not exist" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="Leaderboard feature is being set up. Please try again later."
            )
        
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch leaderboard"
        )


@router.get("/me", response_model=UserLeaderboardStats)
async def get_my_leaderboard_stats(
    min_markets: int = Query(default=3, ge=1, le=50),
    auth: AuthenticatedUser = Depends(get_current_user_with_token)
):
    """
    Get the current user's leaderboard statistics.
    
    Returns the user's skill score, rank (if qualified), and other metrics.
    """
    try:
        supabase = get_service_client()
        
        # Call the user stats RPC
        result = supabase.rpc(
            'get_user_leaderboard_stats',
            {'p_user_id': str(auth.user.id), 'p_min_markets': min_markets}
        ).execute()
        
        if not result.data or len(result.data) == 0:
            return UserLeaderboardStats(
                rank=None,
                skill_score=0.0,
                total_profit=0.0,
                markets_participated=0,
                win_rate=0.0,
                avg_return_per_market=0.0,
                qualifies=False,
                min_markets_required=min_markets
            )
        
        row = result.data[0]
        return UserLeaderboardStats(
            rank=row['rank'],
            skill_score=float(row['skill_score'] or 0),
            total_profit=float(row['total_profit'] or 0),
            markets_participated=row['markets_participated'],
            win_rate=float(row['win_rate'] or 0),
            avg_return_per_market=float(row['avg_return_per_market'] or 0),
            qualifies=row['qualifies'],
            min_markets_required=min_markets
        )
        
    except Exception as e:
        error_msg = str(e)
        print(f"User leaderboard stats error: {error_msg}")
        
        if "function" in error_msg.lower() and "does not exist" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="Leaderboard feature is being set up. Please try again later."
            )
        
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch your leaderboard stats"
        )

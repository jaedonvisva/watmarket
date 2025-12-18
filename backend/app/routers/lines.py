from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from uuid import UUID
from datetime import datetime, timezone

from app.database import get_supabase_admin
from app.models.schemas import (
    LineCreate, LineResponse, LineResolve, LineInvalidateResponse, UserResponse, PriceHistoryPoint
)
from app.services.auth import get_current_user, get_current_admin
from app.services.odds import calculate_odds
from app.services.resolver import resolve_line, invalidate_line

router = APIRouter(prefix="/lines", tags=["lines"])


def _enrich_line_with_odds(line_data: dict) -> LineResponse:
    """Add calculated odds to line data."""
    odds = calculate_odds(line_data["yes_pool"], line_data["no_pool"])
    return LineResponse(
        id=line_data["id"],
        title=line_data["title"],
        description=line_data["description"],
        closes_at=line_data["closes_at"],
        yes_pool=line_data["yes_pool"],
        no_pool=line_data["no_pool"],
        volume=line_data.get("volume", 0) or 0,
        resolved=line_data["resolved"],
        correct_outcome=line_data["correct_outcome"],
        created_at=line_data["created_at"],
        odds=odds
    )


@router.get("/{line_id}/history", response_model=List[PriceHistoryPoint])
async def get_line_history(
    line_id: UUID,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get price history for a line."""
    admin_client = get_supabase_admin()
    
    result = admin_client.table("price_history")\
        .select("*")\
        .eq("line_id", str(line_id))\
        .order("created_at", desc=False)\
        .execute()
    
    return [PriceHistoryPoint(**point) for point in result.data]


@router.get("", response_model=List[LineResponse])
async def get_lines(
    resolved: bool | None = None,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get all prediction lines with dynamic odds.
    Optionally filter by resolved status.
    """
    admin_client = get_supabase_admin()
    
    query = admin_client.table("lines").select("*").order("created_at", desc=True)
    
    if resolved is not None:
        query = query.eq("resolved", resolved)
    
    result = query.execute()
    
    return [_enrich_line_with_odds(line) for line in result.data]


@router.get("/{line_id}", response_model=LineResponse)
async def get_line(
    line_id: UUID,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get a specific prediction line with odds."""
    admin_client = get_supabase_admin()
    
    result = admin_client.table("lines").select("*").eq("id", str(line_id)).single().execute()
    
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Line not found"
        )
    
    return _enrich_line_with_odds(result.data)


@router.post("", response_model=LineResponse, status_code=status.HTTP_201_CREATED)
async def create_line(
    line_data: LineCreate,
    current_user: UserResponse = Depends(get_current_admin)
):
    """Create a new prediction line (admin only)."""
    admin_client = get_supabase_admin()
    
    # Validate closes_at is in the future
    if line_data.closes_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="closes_at must be in the future"
        )
    
    result = admin_client.table("lines").insert({
        "title": line_data.title,
        "description": line_data.description,
        "closes_at": line_data.closes_at.isoformat(),
        "created_by": str(current_user.id),
        "yes_pool": line_data.initial_liquidity,
        "no_pool": line_data.initial_liquidity
    }).execute()
    
    return _enrich_line_with_odds(result.data[0])


@router.post("/{line_id}/resolve")
async def resolve_prediction_line(
    line_id: UUID,
    resolution: LineResolve,
    current_user: UserResponse = Depends(get_current_admin)
):
    """
    Resolve a prediction line and distribute payouts (admin only).
    
    This will:
    1. Mark the line as resolved with the correct outcome
    2. Calculate payouts for winning bets
    3. Update user GOOS balances
    4. Create payout transactions
    """
    try:
        result = resolve_line(line_id, resolution.correct_outcome)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Resolution failed: {str(e)}"
        )


@router.post("/{line_id}/invalidate", response_model=LineInvalidateResponse)
async def invalidate_prediction_line(
    line_id: UUID,
    current_user: UserResponse = Depends(get_current_admin)
):
    """
    Invalidate (cancel) a prediction line and refund users (admin only).
    
    This will:
    1. Mark the line as resolved with outcome='invalid'
    2. Calculate net investment for each user (buys - sells)
    3. Refund each user their net investment (clamped to >= 0)
    4. Create refund transaction records
    5. Zero out the liquidity pools
    
    Trade history is preserved. Users who profited from sells
    before invalidation keep their profits (refund = 0).
    """
    try:
        result = invalidate_line(line_id, resolved_by=current_user.id)
        return LineInvalidateResponse(
            line_id=result["line_id"],
            correct_outcome="invalid",
            users_refunded=result["users_refunded"],
            total_refunded=result["total_refunded"],
            resolved_at=result["resolved_at"]
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Invalidation failed: {str(e)}"
        )

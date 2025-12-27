from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from uuid import UUID
from datetime import datetime, timezone

from app.database import get_service_client, get_jwt_client
from app.models.schemas import (
    SuggestedLineCreate, SuggestedLineResponse, SuggestedLineReview,
    LineResponse, UserResponse
)
from app.services.auth import get_current_user, get_current_admin, get_current_user_with_token, AuthenticatedUser
from app.services.odds import calculate_odds

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


def _format_suggestion(data: dict) -> SuggestedLineResponse:
    """Format a suggestion database row to response model."""
    return SuggestedLineResponse(
        id=data["id"],
        user_id=data["user_id"],
        title=data["title"],
        description=data["description"],
        closes_at=data["closes_at"],
        status=data["status"],
        rejection_reason=data.get("rejection_reason"),
        reviewed_by=data.get("reviewed_by"),
        reviewed_at=data.get("reviewed_at"),
        approved_line_id=data.get("approved_line_id"),
        created_at=data["created_at"]
    )


@router.post("", response_model=SuggestedLineResponse, status_code=status.HTTP_201_CREATED)
async def create_suggestion(
    suggestion: SuggestedLineCreate,
    auth: AuthenticatedUser = Depends(get_current_user_with_token)
):
    """
    Submit a new line suggestion.
    Any authenticated user can suggest a line for admin review.
    """
    # Use JWT-scoped client for user operation
    user_client = get_jwt_client(auth.token)
    current_user = auth.user
    
    # Validate closes_at is in the future
    if suggestion.closes_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="closes_at must be in the future"
        )
    
    result = user_client.table("suggested_lines").insert({
        "user_id": str(current_user.id),
        "title": suggestion.title,
        "description": suggestion.description,
        "closes_at": suggestion.closes_at.isoformat(),
        "status": "pending"
    }).execute()
    
    return _format_suggestion(result.data[0])


@router.get("/my", response_model=List[SuggestedLineResponse])
async def get_my_suggestions(
    auth: AuthenticatedUser = Depends(get_current_user_with_token)
):
    """
    Get all suggestions submitted by the current user.
    Shows status (pending/approved/rejected) and rejection reasons.
    """
    # Use JWT-scoped client - RLS ensures user only sees their own
    user_client = get_jwt_client(auth.token)
    current_user = auth.user
    
    result = user_client.table("suggested_lines")\
        .select("*")\
        .eq("user_id", str(current_user.id))\
        .order("created_at", desc=True)\
        .execute()
    
    return [_format_suggestion(s) for s in result.data]


@router.get("/pending", response_model=List[SuggestedLineResponse])
async def get_pending_suggestions(
    current_user: UserResponse = Depends(get_current_admin)
):
    """
    Get all pending suggestions (admin only).
    Admins can review and approve/reject these.
    """
    admin_client = get_service_client()
    
    result = admin_client.table("suggested_lines")\
        .select("*")\
        .eq("status", "pending")\
        .order("created_at", desc=False)\
        .execute()
    
    return [_format_suggestion(s) for s in result.data]


@router.get("/all", response_model=List[SuggestedLineResponse])
async def get_all_suggestions(
    status_filter: str | None = None,
    current_user: UserResponse = Depends(get_current_admin)
):
    """
    Get all suggestions with optional status filter (admin only).
    """
    admin_client = get_service_client()
    
    query = admin_client.table("suggested_lines")\
        .select("*")\
        .order("created_at", desc=True)
    
    if status_filter:
        query = query.eq("status", status_filter)
    
    result = query.execute()
    
    return [_format_suggestion(s) for s in result.data]


@router.post("/{suggestion_id}/review", response_model=SuggestedLineResponse)
async def review_suggestion(
    suggestion_id: UUID,
    review: SuggestedLineReview,
    current_user: UserResponse = Depends(get_current_admin)
):
    """
    Review a suggestion - approve or reject it (admin only).
    
    If approved:
    - Creates a new line from the suggestion
    - Links the approved line to the suggestion
    
    If rejected:
    - Requires a rejection_reason
    - Updates the suggestion status
    """
    admin_client = get_service_client()
    
    # Get the suggestion
    suggestion_result = admin_client.table("suggested_lines")\
        .select("*")\
        .eq("id", str(suggestion_id))\
        .single()\
        .execute()
    
    if not suggestion_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Suggestion not found"
        )
    
    suggestion = suggestion_result.data
    
    if suggestion["status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Suggestion has already been {suggestion['status']}"
        )
    
    now = datetime.now(timezone.utc)
    
    if review.action == "reject":
        if not review.rejection_reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="rejection_reason is required when rejecting"
            )
        
        # Update suggestion as rejected
        update_result = admin_client.table("suggested_lines")\
            .update({
                "status": "rejected",
                "rejection_reason": review.rejection_reason,
                "reviewed_by": str(current_user.id),
                "reviewed_at": now.isoformat()
            })\
            .eq("id", str(suggestion_id))\
            .execute()
        
        return _format_suggestion(update_result.data[0])
    
    else:  # approve
        # Validate closes_at is still in the future
        closes_at = datetime.fromisoformat(suggestion["closes_at"].replace("Z", "+00:00"))
        if closes_at <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The suggested close date has passed. Please reject with reason or ask user to resubmit."
            )
        
        # Calculate pool sizes based on initial_probability
        if review.initial_probability is not None:
            # Use initial_probability to skew the pools
            # Total depth = 2 * initial_liquidity (same as 50/50 case)
            p = review.initial_probability
            total_depth = 2 * review.initial_liquidity
            yes_pool = (1 - p) * total_depth
            no_pool = p * total_depth
        else:
            # Default 50/50 split
            yes_pool = review.initial_liquidity
            no_pool = review.initial_liquidity
        
        # Create the line
        line_result = admin_client.table("lines").insert({
            "title": suggestion["title"],
            "description": suggestion["description"],
            "closes_at": suggestion["closes_at"],
            "created_by": str(current_user.id),
            "yes_pool": yes_pool,
            "no_pool": no_pool
        }).execute()
        
        new_line_id = line_result.data[0]["id"]
        
        # Update suggestion as approved
        update_result = admin_client.table("suggested_lines")\
            .update({
                "status": "approved",
                "reviewed_by": str(current_user.id),
                "reviewed_at": now.isoformat(),
                "approved_line_id": new_line_id
            })\
            .eq("id", str(suggestion_id))\
            .execute()
        
        return _format_suggestion(update_result.data[0])


@router.get("/{suggestion_id}", response_model=SuggestedLineResponse)
async def get_suggestion(
    suggestion_id: UUID,
    auth: AuthenticatedUser = Depends(get_current_user_with_token)
):
    """
    Get a specific suggestion.
    Users can only view their own suggestions. Admins can view any.
    """
    current_user = auth.user
    
    # For admins, use service role to bypass RLS and see all suggestions
    # For regular users, use JWT-scoped client (RLS will enforce ownership)
    if current_user.is_admin:
        client = get_service_client()
    else:
        client = get_jwt_client(auth.token)
    
    result = client.table("suggested_lines")\
        .select("*")\
        .eq("id", str(suggestion_id))\
        .single()\
        .execute()
    
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Suggestion not found"
        )
    
    # Double-check access for non-admins (belt-and-suspenders with RLS)
    if not current_user.is_admin and str(result.data["user_id"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return _format_suggestion(result.data)

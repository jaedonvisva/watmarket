from fastapi import APIRouter, HTTPException, status, Depends, Request
from typing import List

from app.database import get_anon_client, get_jwt_client
from app.models.schemas import (
    UserCreate, UserLogin, UserResponse, AuthResponse, TradeHistoryItem
)
from app.services.auth import get_current_user, get_current_user_with_token, AuthenticatedUser
from app.rate_limit import limiter, RATE_LIMITS

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(RATE_LIMITS["register"])
async def register(request: Request, user_data: UserCreate):
    """
    Register a new user account.
    Creates auth user and profile with starting GOOS balance (1000).
    
    Rate limited: 3 requests per minute per IP to prevent abuse.
    """
    try:
        supabase = get_anon_client()
        
        # Create auth user (trigger will create profile)
        auth_response = supabase.auth.sign_up({
            "email": user_data.email,
            "password": user_data.password
        })
        
        if not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user"
            )
        
        # Get the created user profile using the new session's JWT
        user_client = get_jwt_client(auth_response.session.access_token)
        user_result = user_client.table("users").select("*").eq("id", str(auth_response.user.id)).single().execute()
        
        return AuthResponse(
            access_token=auth_response.session.access_token,
            user=UserResponse(**user_result.data)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/login", response_model=AuthResponse)
@limiter.limit(RATE_LIMITS["login"])
async def login(request: Request, credentials: UserLogin):
    """
    Login with email and password.
    
    Rate limited: 5 requests per minute per IP to prevent brute force attacks.
    """
    try:
        supabase = get_anon_client()
        
        auth_response = supabase.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })
        
        if not auth_response.user or not auth_response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        
        # Get user profile using the session's JWT (respects RLS)
        user_client = get_jwt_client(auth_response.session.access_token)
        user_result = user_client.table("users").select("*").eq("id", str(auth_response.user.id)).single().execute()
        
        return AuthResponse(
            access_token=auth_response.session.access_token,
            user=UserResponse(**user_result.data)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: UserResponse = Depends(get_current_user)):
    """Get current user profile."""
    return current_user


@router.get("/me/trades", response_model=List[TradeHistoryItem])
async def get_my_trades(auth: AuthenticatedUser = Depends(get_current_user_with_token)):
    """Get current user's trade history - buys and sells merged."""
    # Use JWT-scoped client to respect RLS
    user_client = get_jwt_client(auth.token)
    current_user = auth.user
    
    trades = []
    
    # Get all bets (buys) - RLS ensures user only sees their own
    bets_result = user_client.table("bets")\
        .select("*, lines(id, title, resolved, correct_outcome)")\
        .eq("user_id", str(current_user.id))\
        .order("created_at", desc=True)\
        .execute()
    
    for bet in bets_result.data:
        line = bet.get("lines", {}) or {}
        if not line:
            continue
        
        is_resolved = line.get("resolved", False)
        correct_outcome = line.get("correct_outcome")
        
        # Determine result and payout
        result = None
        payout = None
        if is_resolved and correct_outcome:
            if correct_outcome == "invalid":
                result = "refunded"
                payout = None
            elif bet["outcome"] == correct_outcome:
                result = "won"
                payout = bet.get("payout") or bet.get("shares") or 0
            else:
                result = "lost"
                payout = 0
        
        trades.append(TradeHistoryItem(
            id=bet["id"],
            created_at=bet["created_at"],
            line_id=bet["line_id"],
            line_title=line.get("title", "Unknown"),
            outcome=bet["outcome"],
            type="buy",
            shares=bet.get("shares") or 0,
            price=bet.get("buy_price") or 0,
            amount=bet["stake"],
            is_resolved=is_resolved,
            result=result,
            payout=payout
        ))
    
    # Get sell transactions - RLS ensures user only sees their own
    sells_result = user_client.table("transactions")\
        .select("*")\
        .eq("user_id", str(current_user.id))\
        .eq("type", "sell")\
        .order("created_at", desc=True)\
        .execute()

    sell_line_ids = [str(tx["reference_id"]) for tx in sells_result.data if tx.get("reference_id")]
    unique_sell_line_ids = list(dict.fromkeys(sell_line_ids))
    sell_line_titles: dict[str, str] = {}
    if unique_sell_line_ids:
        # Lines are publicly readable, so this works with JWT client
        lines_result = user_client.table("lines")\
            .select("id, title")\
            .in_("id", unique_sell_line_ids)\
            .execute()
        sell_line_titles = {str(line["id"]): line.get("title") for line in (lines_result.data or []) if line.get("id")}
    
    for tx in sells_result.data:
        metadata = tx.get("metadata") or {}
        reference_id = tx.get("reference_id")
        line_title = sell_line_titles.get(str(reference_id)) if reference_id else None
        if not line_title:
            line_title = metadata.get("line_title")
        trades.append(TradeHistoryItem(
            id=tx["id"],
            created_at=tx["created_at"],
            line_id=tx["reference_id"],
            line_title=line_title or "Unknown",
            outcome=metadata.get("outcome", "yes"),
            type="sell",
            shares=metadata.get("shares", 0),
            price=metadata.get("sell_price", 0),
            amount=tx["amount"],
            is_resolved=False,
            result=None,
            payout=None
        ))
    
    trades.sort(key=lambda t: t.created_at, reverse=True)
    return trades

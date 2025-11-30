from fastapi import APIRouter, HTTPException, status, Depends
from typing import List

from app.database import get_supabase_client, get_supabase_admin
from app.models.schemas import (
    UserCreate, UserLogin, UserResponse, AuthResponse, TransactionResponse
)
from app.services.auth import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """
    Register a new user account.
    Creates auth user and profile with starting GOOSE balance (1000).
    """
    try:
        supabase = get_supabase_client()
        
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
        
        # Get the created user profile
        admin_client = get_supabase_admin()
        user_result = admin_client.table("users").select("*").eq("id", str(auth_response.user.id)).single().execute()
        
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
async def login(credentials: UserLogin):
    """Login with email and password."""
    try:
        supabase = get_supabase_client()
        
        auth_response = supabase.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })
        
        if not auth_response.user or not auth_response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        
        # Get user profile
        admin_client = get_supabase_admin()
        user_result = admin_client.table("users").select("*").eq("id", str(auth_response.user.id)).single().execute()
        
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


@router.get("/me/transactions", response_model=List[TransactionResponse])
async def get_my_transactions(current_user: UserResponse = Depends(get_current_user)):
    """Get current user's transaction history."""
    admin_client = get_supabase_admin()
    
    result = admin_client.table("transactions")\
        .select("*")\
        .eq("user_id", str(current_user.id))\
        .order("created_at", desc=True)\
        .execute()
    
    return [TransactionResponse(**t) for t in result.data]

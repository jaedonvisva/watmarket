from dataclasses import dataclass
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.database import get_anon_client, get_jwt_client
from app.models.schemas import UserResponse

security = HTTPBearer()


@dataclass
class AuthenticatedUser:
    """Container for authenticated user info and their JWT token."""
    user: UserResponse
    token: str


async def get_current_user_with_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> AuthenticatedUser:
    """
    Verify JWT token and return current user with their token.
    
    Uses JWT-scoped Supabase client to fetch user profile, respecting RLS.
    The token is included so endpoints can create JWT-scoped clients for
    subsequent database operations.
    """
    token = credentials.credentials
    
    try:
        supabase = get_anon_client()
        # Verify the token with Supabase Auth
        user_response = supabase.auth.get_user(token)
        
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token"
            )
        
        auth_user = user_response.user
        
        # Get user profile using JWT-scoped client (respects RLS)
        user_client = get_jwt_client(token)
        result = user_client.table("users").select("*").eq("id", str(auth_user.id)).single().execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
        
        return AuthenticatedUser(
            user=UserResponse(**result.data),
            token=token
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )


async def get_current_user(
    auth: AuthenticatedUser = Depends(get_current_user_with_token)
) -> UserResponse:
    """
    Verify JWT token and return current user.
    
    Convenience wrapper that just returns the user without the token.
    Use get_current_user_with_token if you need the token for JWT-scoped queries.
    """
    return auth.user


async def get_current_admin(
    current_user: UserResponse = Depends(get_current_user)
) -> UserResponse:
    """Verify current user is an admin."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def get_current_admin_with_token(
    auth: AuthenticatedUser = Depends(get_current_user_with_token)
) -> AuthenticatedUser:
    """Verify current user is an admin and return with token."""
    if not auth.user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return auth


def get_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract the bearer token."""
    return credentials.credentials

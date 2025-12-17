from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.database import get_supabase_client, get_supabase_admin
from app.models.schemas import UserResponse

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> UserResponse:
    """Verify JWT token and return current user."""
    token = credentials.credentials
    
    try:
        supabase = get_supabase_client()
        # Verify the token with Supabase
        user_response = supabase.auth.get_user(token)
        
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token"
            )
        
        auth_user = user_response.user
        
        # Get user profile from our users table
        admin_client = get_supabase_admin()
        result = admin_client.table("users").select("*").eq("id", str(auth_user.id)).single().execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )
        
        return UserResponse(**result.data)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )


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


def get_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract the bearer token."""
    return credentials.credentials

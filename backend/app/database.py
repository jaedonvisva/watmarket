from supabase import create_client, Client
from app.config import get_settings

settings = get_settings()


def get_anon_client() -> Client:
    """
    Get Supabase client with anon key (for unauthenticated requests).
    
    Use for:
    - Login/register (before user has a JWT)
    - Public data that doesn't need auth
    """
    return create_client(settings.supabase_url, settings.supabase_anon_key)


def get_jwt_client(access_token: str) -> Client:
    """
    Get Supabase client authenticated with a user's JWT.
    
    This client RESPECTS RLS policies — use for all user-scoped operations.
    The JWT is passed in the Authorization header, allowing Supabase to
    identify the user via auth.uid() in RLS policies.
    
    Use for:
    - Reading user's own data (bets, positions, trades, suggestions)
    - Reading public data as an authenticated user
    - Any operation that should be constrained by RLS
    """
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    client.postgrest.auth(access_token)
    return client


def get_service_client() -> Client:
    """
    Get Supabase client with service role key (BYPASSES RLS).
    
    ⚠️  DANGER: This client has full database access!
    
    ONLY use for:
    - Admin-only endpoints (with explicit admin guard)
    - SECURITY DEFINER RPCs (place_bet_atomic, sell_shares_atomic, etc.)
    - Background jobs/cron (if any)
    
    NEVER use for:
    - User-scoped reads/writes
    - Anything exposed to non-admin users without RPC protection
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


# Legacy aliases - DEPRECATED, do not use in new code
# These exist only for any external code that might reference them
# All internal code should use: get_anon_client, get_jwt_client, get_service_client
get_supabase_client = get_anon_client  # DEPRECATED
get_supabase_admin = get_service_client  # DEPRECATED

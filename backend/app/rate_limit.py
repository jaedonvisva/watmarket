"""
Rate limiting configuration for the API.

Uses SlowAPI to implement rate limits on sensitive endpoints:
- Login/Register: Prevent brute force and credential stuffing
- Place bet/Sell: Prevent market manipulation and abuse

Rate limits are per-IP address by default.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse

from app.config import get_settings


def get_client_ip(request: Request) -> str:
    """
    Get client IP address, handling proxies.
    
    Checks X-Forwarded-For header first (for requests behind proxy/load balancer),
    falls back to direct client IP.
    """
    settings = get_settings()

    remote_ip = get_remote_address(request)

    # Only trust X-Forwarded-For if explicitly enabled AND the request comes from
    # a trusted proxy. Otherwise, user-supplied XFF allows trivial spoofing.
    if settings.trust_x_forwarded_for:
        trusted = {ip.strip() for ip in settings.trusted_proxy_ips.split(",") if ip.strip()}
        if trusted and remote_ip in trusted:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                # X-Forwarded-For can contain multiple IPs; first is the client
                return forwarded.split(",")[0].strip()

    return remote_ip


# Initialize the limiter with IP-based key function
limiter = Limiter(key_func=get_client_ip)


# Rate limit configurations (customize as needed)
# Format: "X per Y" where Y can be: second, minute, hour, day
RATE_LIMITS = {
    # Auth endpoints - stricter limits to prevent brute force
    "login": "5/minute",      # 5 login attempts per minute per IP
    "register": "3/minute",   # 3 registrations per minute per IP
    
    # Trading endpoints - prevent rapid-fire trading/manipulation
    "place_bet": "30/minute", # 30 bets per minute per IP
    "sell": "30/minute",      # 30 sells per minute per IP
}


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """
    Custom handler for rate limit exceeded errors.
    Returns a JSON response with retry information.
    """
    # Extract retry-after from the exception if available
    retry_after = getattr(exc, 'retry_after', 60)
    
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded. Please slow down.",
            "retry_after_seconds": retry_after,
        },
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Limit": str(exc.detail) if hasattr(exc, 'detail') else "unknown",
        }
    )

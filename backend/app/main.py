from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.routers import users, lines, bets, suggestions, leaderboard
from app.rate_limit import limiter

app = FastAPI(
    title="WatMarket Prediction Market API",
    description="University-specific prediction market using GOOS tokens",
    version="1.0.0"
)

# Rate limiting setup
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:50499",  # Windsurf browser preview
    ],
    allow_origin_regex=r"http://127\.0\.0\.1:\d+",  # Allow any localhost port for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router)
app.include_router(lines.router)
app.include_router(bets.router)
app.include_router(suggestions.router)
app.include_router(leaderboard.router)


@app.get("/")
async def root():
    return {
        "name": "WatMarket API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}

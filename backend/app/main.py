from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import users, lines, bets

app = FastAPI(
    title="WatMarket Prediction Market API",
    description="University-specific prediction market using GOOSE tokens",
    version="1.0.0"
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router)
app.include_router(lines.router)
app.include_router(bets.router)


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

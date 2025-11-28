from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal
from uuid import UUID


# ============ User Schemas ============

class UserBase(BaseModel):
    email: str


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserLogin(UserBase):
    password: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    karma_balance: int
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserPublic(BaseModel):
    id: UUID
    karma_balance: int


# ============ Line Schemas ============

class LineBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    closes_at: datetime


class LineCreate(LineBase):
    initial_liquidity: float = 100.0


class LineOdds(BaseModel):
    yes_probability: float
    no_probability: float
    yes_odds: float
    no_odds: float


class LineResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str]
    closes_at: datetime
    yes_pool: float
    no_pool: float
    resolved: bool
    correct_outcome: Optional[Literal["yes", "no"]]
    created_at: datetime
    odds: LineOdds

    class Config:
        from_attributes = True


class LineResolve(BaseModel):
    correct_outcome: Literal["yes", "no"]


# ============ Bet Schemas ============

class BetCreate(BaseModel):
    line_id: UUID
    outcome: Literal["yes", "no"]
    stake: int = Field(..., gt=0)


class BetResponse(BaseModel):
    id: UUID
    user_id: UUID
    line_id: UUID
    outcome: Literal["yes", "no"]
    stake: int
    created_at: datetime
    potential_payout: Optional[float] = None
    buy_price: Optional[float] = None
    payout: Optional[float] = None

    class Config:
        from_attributes = True


# ============ Transaction Schemas ============

class TransactionResponse(BaseModel):
    id: UUID
    user_id: UUID
    amount: int
    type: Literal["bet", "payout", "initial"]
    reference_id: Optional[UUID]
    created_at: datetime

    class Config:
        from_attributes = True


# ============ Auth Schemas ============

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenPayload(BaseModel):
    sub: str
    exp: int


class PriceHistoryPoint(BaseModel):
    yes_price: float
    no_price: float
    created_at: datetime

    class Config:
        from_attributes = True

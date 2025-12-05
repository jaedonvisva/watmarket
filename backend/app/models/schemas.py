from pydantic import BaseModel, Field, ConfigDict
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

    model_config = ConfigDict(from_attributes=True)


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
    volume: float = 0
    resolved: bool
    correct_outcome: Optional[Literal["yes", "no"]]
    created_at: datetime
    odds: LineOdds

    model_config = ConfigDict(from_attributes=True)


class LineResolve(BaseModel):
    correct_outcome: Literal["yes", "no"]


# ============ Bet Schemas ============

class BetCreate(BaseModel):
    line_id: UUID
    outcome: Literal["yes", "no"]
    stake: int = Field(..., gt=0)


class SellSharesRequest(BaseModel):
    """Request to sell shares from a position."""
    line_id: UUID
    outcome: Literal["yes", "no"]
    shares: float = Field(..., gt=0)


class SellSharesResponse(BaseModel):
    """Response after selling shares."""
    shares_sold: float
    amount_received: float  # GOOSE received
    sell_price: float  # amount_received / shares_sold
    new_balance: int
    remaining_shares: float


class BetResponse(BaseModel):
    id: UUID
    user_id: UUID
    line_id: UUID
    outcome: Literal["yes", "no"]
    stake: int
    shares: Optional[float] = None
    created_at: datetime
    potential_payout: Optional[float] = None
    buy_price: Optional[float] = None
    payout: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class PositionResponse(BaseModel):
    """Aggregated position for a user on a specific market."""
    line_id: UUID
    line_title: str
    line_resolved: bool
    line_correct_outcome: Optional[Literal["yes", "no"]]
    outcome: Literal["yes", "no"]
    total_shares: float
    total_cost: float  # Total stake spent
    avg_buy_price: float
    current_price: float
    current_value: float  # shares * current_price
    pnl: float  # current_value - total_cost (or payout - total_cost if resolved)
    pnl_percent: float
    payout: Optional[float] = None  # If resolved
    is_active: bool  # Not resolved yet

    model_config = ConfigDict(from_attributes=True)


class PortfolioSummary(BaseModel):
    """Overall portfolio metrics."""
    cash_balance: int
    invested_value: float  # Sum of all position costs
    positions_value: float  # Sum of current values
    total_portfolio_value: float  # cash + positions_value
    total_pnl: float
    total_pnl_percent: float
    active_positions_count: int
    resolved_positions_count: int


# ============ Transaction Schemas ============

class TransactionResponse(BaseModel):
    id: UUID
    user_id: UUID
    amount: int
    type: Literal["bet", "payout", "initial", "sell"]
    reference_id: Optional[UUID]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TradeHistoryItem(BaseModel):
    """A single trade (bet or sell) with details."""
    id: UUID
    created_at: datetime
    line_id: UUID
    line_title: str
    outcome: Literal["yes", "no"]
    type: Literal["buy", "sell"]
    shares: float
    price: float
    amount: float  # Cost for buy, Revenue for sell
    
    # Resolution info (mostly for buys)
    is_resolved: bool
    result: Optional[Literal["won", "lost"]] = None
    payout: Optional[float] = None  # Amount received if resolved

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)

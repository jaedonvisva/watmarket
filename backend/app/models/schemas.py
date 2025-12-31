from pydantic import BaseModel, Field, ConfigDict, field_validator
from datetime import datetime
from typing import Optional, Literal, Union
from uuid import UUID
from decimal import Decimal

import math


# ============ User Schemas ============

class UserBase(BaseModel):
    email: str


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)
    display_name: str = Field(..., min_length=3, max_length=30, pattern="^[a-zA-Z0-9_]+$")


class UserLogin(UserBase):
    password: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    display_name: str
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
    initial_probability: Optional[float] = None
    
    @field_validator("initial_probability")
    @classmethod
    def _validate_initial_probability(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            if not (0.01 <= v <= 0.99):
                raise ValueError("initial_probability must be between 0.01 and 0.99")
        return v


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
    yes_pool: Union[float, Decimal]
    no_pool: Union[float, Decimal]
    volume: Union[float, Decimal] = 0
    resolved: bool
    correct_outcome: Optional[Literal["yes", "no", "invalid"]]
    created_at: datetime
    odds: LineOdds

    model_config = ConfigDict(from_attributes=True)


class LineResolve(BaseModel):
    correct_outcome: Literal["yes", "no"]


class LineInvalidateResponse(BaseModel):
    """Response after invalidating a market."""
    line_id: UUID
    correct_outcome: Literal["invalid"]
    users_refunded: int
    total_refunded: float
    resolved_at: datetime


# ============ Bet Schemas ============

class BetCreate(BaseModel):
    line_id: UUID
    outcome: Literal["yes", "no"]
    stake: int = Field(..., gt=0)
    min_shares_out: float = Field(..., gt=0, description="Minimum shares to receive (slippage protection)")

    @field_validator("min_shares_out")
    @classmethod
    def _min_shares_out_must_be_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("min_shares_out must be a finite number")
        return v


class SellSharesRequest(BaseModel):
    """Request to sell shares from a position."""
    line_id: UUID
    outcome: Literal["yes", "no"]
    shares: float = Field(..., gt=0)
    min_amount_out: int = Field(..., gt=0, description="Minimum GOOS to receive (slippage protection)")

    @field_validator("shares")
    @classmethod
    def _shares_must_be_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("shares must be a finite number")
        return v


class SellSharesResponse(BaseModel):
    """Response after selling shares."""
    shares_sold: float
    amount_received: int  # GOOS received
    sell_price: float  # amount_received / shares_sold
    new_balance: int
    remaining_shares: float


class BetResponse(BaseModel):
    id: UUID
    user_id: UUID
    line_id: UUID
    outcome: Literal["yes", "no"]
    stake: int
    shares: Optional[Union[float, Decimal]] = None
    created_at: datetime
    potential_payout: Optional[Union[float, Decimal]] = None
    buy_price: Optional[Union[float, Decimal]] = None
    payout: Optional[Union[float, Decimal]] = None

    model_config = ConfigDict(from_attributes=True)


class PositionResponse(BaseModel):
    """Aggregated position for a user on a specific market."""
    line_id: UUID
    line_title: str
    line_resolved: bool
    line_correct_outcome: Optional[Literal["yes", "no", "invalid"]]
    outcome: Literal["yes", "no"]
    total_shares: float
    total_cost: float  # Total stake spent
    avg_buy_price: float
    current_price: float
    current_value: float  # CPMM liquidation value (what you'd receive if you sold now)
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


class QuoteResponse(BaseModel):
    """Response for a price quote."""
    line_id: UUID
    outcome: Literal["yes", "no"]
    type: Literal["buy", "sell"]
    amount_in: float  # Stake (buy) or Shares (sell)
    amount_out: float  # Shares (buy) or GOOS (sell)
    price_per_share: float
    fees: float = 0
    new_pool_yes: float
    new_pool_no: float

    model_config = ConfigDict(from_attributes=True)


# ============ Transaction Schemas ============

class TransactionResponse(BaseModel):
    id: UUID
    user_id: UUID
    amount: int
    type: Literal["bet", "payout", "initial", "sell", "refund"]
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
    result: Optional[Literal["won", "lost", "refunded"]] = None
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
    yes_price: Union[float, Decimal]
    no_price: Union[float, Decimal]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============ Suggested Line Schemas ============

class SuggestedLineCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    closes_at: datetime


class SuggestedLineResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    description: Optional[str]
    closes_at: datetime
    status: Literal["pending", "approved", "rejected"]
    rejection_reason: Optional[str]
    reviewed_by: Optional[UUID]
    reviewed_at: Optional[datetime]
    approved_line_id: Optional[UUID]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SuggestedLineReview(BaseModel):
    action: Literal["approve", "reject"]
    rejection_reason: Optional[str] = None
    initial_liquidity: float = 100.0
    initial_probability: Optional[float] = None
    
    @field_validator("initial_probability")
    @classmethod
    def _validate_initial_probability(cls, v: Optional[float]) -> Optional[float]:
        if v is not None:
            if not (0.01 <= v <= 0.99):
                raise ValueError("initial_probability must be between 0.01 and 0.99")
        return v

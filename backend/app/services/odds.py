from app.models.schemas import LineOdds
from typing import Tuple

def calculate_odds(yes_pool: float, no_pool: float) -> LineOdds:
    """
    Calculate CPMM price (probability).
    Price(Yes) = No / (Yes + No)
    Price(No) = Yes / (Yes + No)
    """
    # Avoid division by zero
    if yes_pool <= 0 or no_pool <= 0:
        # Default 50/50 if empty
        return LineOdds(
            yes_probability=0.5,
            no_probability=0.5,
            yes_odds=2.0,
            no_odds=2.0
        )

    total = yes_pool + no_pool
    p_yes = no_pool / total
    p_no = yes_pool / total
    
    return LineOdds(
        yes_probability=round(p_yes, 4),
        no_probability=round(p_no, 4),
        yes_odds=round(1/p_yes, 4) if p_yes > 0 else 0,
        no_odds=round(1/p_no, 4) if p_no > 0 else 0
    )

def calculate_cpmm_buy(
    investment: float,
    outcome: str,
    yes_pool: float,
    no_pool: float
) -> Tuple[float, float, float]:
    """
    Calculate shares bought and new pool state using CPMM (k = y * n).
    
    Returns: (shares_bought, new_yes_pool, new_no_pool)
    """
    # Invariant k
    k = yes_pool * no_pool
    
    if outcome == "yes":
        # Buying YES:
        # Mint 'investment' YES & NO. Swap NO for YES.
        new_no_pool = no_pool + investment
        new_yes_pool = k / new_no_pool
        shares_from_pool = yes_pool - new_yes_pool
        shares_bought = investment + shares_from_pool
        
        return shares_bought, new_yes_pool, new_no_pool
        
    else:
        # Buying NO:
        # Mint 'investment' YES & NO. Swap YES for NO.
        new_yes_pool = yes_pool + investment
        new_no_pool = k / new_yes_pool
        shares_from_pool = no_pool - new_no_pool
        shares_bought = investment + shares_from_pool
        
        return shares_bought, new_yes_pool, new_no_pool

def _calculate_cost_to_buy_shares(
    shares: float,
    outcome: str,
    yes_pool: float,
    no_pool: float
) -> float:
    """
    Calculate cost required to buy a specific number of shares.
    Uses quadratic formula derived from CPMM invariant.
    
    Given: shares = investment + (pool_outcome - new_pool_outcome)
    Where: new_pool_outcome = k / (pool_opposite + investment)
    Solving for investment gives a quadratic.
    """
    if shares <= 0:
        return 0.0
    
    if outcome == "yes":
        Y, N = yes_pool, no_pool
    else:
        Y, N = no_pool, yes_pool
    
    # Quadratic: I^2 + I(Y + N - S) - S*N = 0
    a = 1
    b = Y + N - shares
    c = -shares * N
    
    discriminant = b * b - 4 * a * c
    if discriminant < 0:
        return 0.0
    
    return (-b + (discriminant ** 0.5)) / (2 * a)


def calculate_cpmm_sell(
    shares: float,
    outcome: str,
    yes_pool: float,
    no_pool: float
) -> float:
    """
    Calculate amount received when selling shares.
    
    Uses "buy opposite outcome" approach (matches Manifold's internal logic):
    - Selling YES shares = buy the same number of NO shares, then combine
    - The cost to buy opposite shares is what you "pay" to exit
    - You receive: shares - cost_to_buy_opposite
    
    This guarantees buy/sell symmetry and eliminates subtle algebra bugs.
    """
    if shares <= 0:
        return 0.0
    
    # To sell `shares` of `outcome`, compute cost to buy `shares` of opposite outcome
    opposite_outcome = "no" if outcome == "yes" else "yes"
    cost_to_buy_opposite = _calculate_cost_to_buy_shares(
        shares, opposite_outcome, yes_pool, no_pool
    )
    
    # When you combine shares of YES + NO, they redeem for 1 each
    # So selling S shares of YES means: buy S shares of NO for cost C,
    # then combine S YES + S NO = S currency units
    # Net received = S - C
    amount_received = shares - cost_to_buy_opposite
    
    return max(0, amount_received)


def calculate_cpmm_sell_with_pools(
    shares: float,
    outcome: str,
    yes_pool: float,
    no_pool: float
) -> Tuple[float, float, float]:
    """Calculate amount received and new pool state when selling shares."""
    if shares <= 0:
        return 0.0, yes_pool, no_pool
    
    amount_received = calculate_cpmm_sell(shares, outcome, yes_pool, no_pool)
    
    if amount_received <= 0:
        return 0.0, yes_pool, no_pool
    
    if outcome == "yes":
        new_yes_pool = yes_pool + (shares - amount_received)
        new_no_pool = no_pool - amount_received
    else:
        new_no_pool = no_pool + (shares - amount_received)
        new_yes_pool = yes_pool - amount_received
    
    return amount_received, new_yes_pool, new_no_pool


def calculate_potential_payout(shares: float) -> float:
    """
    Calculate potential payout. In CPMM with p=1 payout, it's just shares * 1.
    """
    return shares

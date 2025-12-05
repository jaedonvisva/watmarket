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

def calculate_cpmm_sell(
    shares: float,
    outcome: str,
    yes_pool: float,
    no_pool: float
) -> float:
    """
    Calculate amount received when selling shares. Inverse of calculate_cpmm_buy.
    Solves: c^2 - c(yes + s + no) + s*no = 0 using quadratic formula.
    """
    if shares <= 0:
        return 0.0
    
    if outcome == "yes":
        b = -(yes_pool + shares + no_pool)
        c_term = shares * no_pool
    else:
        b = -(no_pool + shares + yes_pool)
        c_term = shares * yes_pool
    
    discriminant = b * b - 4 * c_term
    if discriminant < 0:
        return 0.0
    
    amount_received = (-b - (discriminant ** 0.5)) / 2
    
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

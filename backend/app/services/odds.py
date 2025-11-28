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

def calculate_potential_payout(shares: float) -> float:
    """
    Calculate potential payout. In CPMM with p=1 payout, it's just shares * 1.
    """
    return shares

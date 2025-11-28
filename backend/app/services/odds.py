from app.models.schemas import LineOdds


def calculate_odds(yes_stake: int, no_stake: int) -> LineOdds:
    """
    Calculate dynamic odds using Laplace smoothing.
    
    Formula:
    P_yes = (yes_stake + 10) / (yes_stake + no_stake + 20)
    P_no  = (no_stake + 10) / (yes_stake + no_stake + 20)
    
    odds_yes = 1 / P_yes
    odds_no  = 1 / P_no
    """
    total = yes_stake + no_stake + 20
    
    p_yes = (yes_stake + 10) / total
    p_no = (no_stake + 10) / total
    
    odds_yes = 1 / p_yes
    odds_no = 1 / p_no
    
    return LineOdds(
        yes_probability=round(p_yes, 4),
        no_probability=round(p_no, 4),
        yes_odds=round(odds_yes, 4),
        no_odds=round(odds_no, 4)
    )


def calculate_potential_payout(stake: int, outcome: str, yes_stake: int, no_stake: int) -> float:
    """
    Calculate potential payout for a bet.
    
    If the bet wins, the payout is:
    - Original stake returned
    - Plus proportional share of losing stakes
    """
    odds = calculate_odds(yes_stake, no_stake)
    
    if outcome == "yes":
        return round(stake * odds.yes_odds, 2)
    else:
        return round(stake * odds.no_odds, 2)

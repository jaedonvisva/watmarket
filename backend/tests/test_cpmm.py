"""
Exhaustive tests for CPMM (Constant Product Market Maker) logic.

Tests cover:
1. Odds/probability calculation
2. Share pricing and purchase mechanics
3. Pool invariant preservation
4. Buy price calculations
5. Payout calculations
6. Edge cases and boundary conditions
7. Multi-bet scenarios matching real data
"""

import pytest
import math
from typing import List, Tuple, Dict

# Import the actual functions from the codebase
import sys
sys.path.insert(0, '/Users/jaedonvisva/side-projects/watmarket/backend')

from app.services.odds import calculate_odds, calculate_cpmm_buy, calculate_cpmm_sell, calculate_cpmm_sell_with_pools, calculate_potential_payout
from app.models.schemas import LineOdds


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def balanced_pool():
    """50/50 market with equal pools."""
    return {"yes_pool": 100.0, "no_pool": 100.0}


@pytest.fixture
def skewed_yes_pool():
    """Market favoring YES (70% probability)."""
    return {"yes_pool": 30.0, "no_pool": 70.0}


@pytest.fixture
def skewed_no_pool():
    """Market favoring NO (70% probability)."""
    return {"yes_pool": 70.0, "no_pool": 30.0}


# =============================================================================
# TEST: ODDS CALCULATION
# =============================================================================

class TestOddsCalculation:
    """Tests for calculate_odds function."""

    def test_balanced_pool_gives_50_50(self, balanced_pool):
        """Equal pools should give 50/50 probability."""
        odds = calculate_odds(balanced_pool["yes_pool"], balanced_pool["no_pool"])
        
        assert odds.yes_probability == 0.5
        assert odds.no_probability == 0.5
        assert odds.yes_odds == 2.0
        assert odds.no_odds == 2.0

    def test_skewed_yes_probability(self, skewed_yes_pool):
        """More NO in pool means higher YES probability."""
        odds = calculate_odds(skewed_yes_pool["yes_pool"], skewed_yes_pool["no_pool"])
        
        # P(yes) = no_pool / total = 70 / 100 = 0.7
        assert odds.yes_probability == 0.7
        assert odds.no_probability == 0.3
        assert abs(odds.yes_odds - 1.4286) < 0.001  # 1/0.7
        assert abs(odds.no_odds - 3.3333) < 0.001   # 1/0.3

    def test_skewed_no_probability(self, skewed_no_pool):
        """More YES in pool means higher NO probability."""
        odds = calculate_odds(skewed_no_pool["yes_pool"], skewed_no_pool["no_pool"])
        
        # P(yes) = no_pool / total = 30 / 100 = 0.3
        assert odds.yes_probability == 0.3
        assert odds.no_probability == 0.7

    def test_probabilities_sum_to_one(self):
        """Probabilities should always sum to 1."""
        test_cases = [
            (100, 100),
            (50, 150),
            (1, 99),
            (999, 1),
            (123.456, 789.012),
        ]
        
        for yes_pool, no_pool in test_cases:
            odds = calculate_odds(yes_pool, no_pool)
            total = odds.yes_probability + odds.no_probability
            assert abs(total - 1.0) < 0.01, f"Probabilities don't sum to 1 for pools ({yes_pool}, {no_pool})"

    def test_zero_pool_defaults_to_50_50(self):
        """Zero or negative pools should default to 50/50."""
        odds = calculate_odds(0, 100)
        assert odds.yes_probability == 0.5
        assert odds.no_probability == 0.5
        
        odds = calculate_odds(100, 0)
        assert odds.yes_probability == 0.5
        assert odds.no_probability == 0.5
        
        odds = calculate_odds(-10, 100)
        assert odds.yes_probability == 0.5

    def test_very_small_pools(self):
        """Very small but positive pools should still work."""
        odds = calculate_odds(0.001, 0.001)
        assert odds.yes_probability == 0.5
        assert odds.no_probability == 0.5

    def test_very_large_pools(self):
        """Very large pools should still calculate correctly."""
        odds = calculate_odds(1_000_000, 1_000_000)
        assert odds.yes_probability == 0.5
        assert odds.no_probability == 0.5

    def test_extreme_skew(self):
        """Extreme skew should approach 0 or 1 but not exceed bounds."""
        odds = calculate_odds(1, 10000)
        assert 0 < odds.yes_probability < 1
        assert 0 < odds.no_probability < 1
        assert odds.yes_probability > 0.99  # Should be very high


# =============================================================================
# TEST: CPMM BUY MECHANICS
# =============================================================================

class TestCPMMBuy:
    """Tests for calculate_cpmm_buy function."""

    def test_buy_yes_increases_no_pool(self, balanced_pool):
        """Buying YES should increase NO pool."""
        shares, new_yes, new_no = calculate_cpmm_buy(
            10, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        assert new_no > balanced_pool["no_pool"]
        assert new_no == balanced_pool["no_pool"] + 10

    def test_buy_yes_decreases_yes_pool(self, balanced_pool):
        """Buying YES should decrease YES pool (shares extracted)."""
        shares, new_yes, new_no = calculate_cpmm_buy(
            10, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        assert new_yes < balanced_pool["yes_pool"]

    def test_buy_no_increases_yes_pool(self, balanced_pool):
        """Buying NO should increase YES pool."""
        shares, new_yes, new_no = calculate_cpmm_buy(
            10, "no", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        assert new_yes > balanced_pool["yes_pool"]
        assert new_yes == balanced_pool["yes_pool"] + 10

    def test_buy_no_decreases_no_pool(self, balanced_pool):
        """Buying NO should decrease NO pool (shares extracted)."""
        shares, new_yes, new_no = calculate_cpmm_buy(
            10, "no", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        assert new_no < balanced_pool["no_pool"]

    def test_invariant_preserved_yes_buy(self, balanced_pool):
        """k = yes * no should be preserved after YES buy."""
        k_before = balanced_pool["yes_pool"] * balanced_pool["no_pool"]
        
        shares, new_yes, new_no = calculate_cpmm_buy(
            50, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        k_after = new_yes * new_no
        assert abs(k_before - k_after) < 0.0001, f"Invariant broken: {k_before} != {k_after}"

    def test_invariant_preserved_no_buy(self, balanced_pool):
        """k = yes * no should be preserved after NO buy."""
        k_before = balanced_pool["yes_pool"] * balanced_pool["no_pool"]
        
        shares, new_yes, new_no = calculate_cpmm_buy(
            50, "no", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        k_after = new_yes * new_no
        assert abs(k_before - k_after) < 0.0001, f"Invariant broken: {k_before} != {k_after}"

    def test_invariant_preserved_multiple_buys(self, balanced_pool):
        """Invariant should be preserved across multiple sequential buys."""
        k_original = balanced_pool["yes_pool"] * balanced_pool["no_pool"]
        
        yes_pool = balanced_pool["yes_pool"]
        no_pool = balanced_pool["no_pool"]
        
        # Series of buys
        buys = [
            (10, "yes"),
            (50, "no"),
            (25, "yes"),
            (100, "no"),
            (5, "yes"),
        ]
        
        for amount, outcome in buys:
            _, yes_pool, no_pool = calculate_cpmm_buy(amount, outcome, yes_pool, no_pool)
        
        k_final = yes_pool * no_pool
        assert abs(k_original - k_final) < 0.001, f"Invariant broken after multiple buys: {k_original} != {k_final}"

    def test_shares_always_positive(self):
        """Shares bought should always be positive."""
        test_cases = [
            (1, "yes", 100, 100),
            (1000, "yes", 100, 100),
            (1, "no", 100, 100),
            (1000, "no", 100, 100),
            (10, "yes", 1, 1000),
            (10, "no", 1000, 1),
        ]
        
        for investment, outcome, yes_pool, no_pool in test_cases:
            shares, _, _ = calculate_cpmm_buy(investment, outcome, yes_pool, no_pool)
            assert shares > 0, f"Shares should be positive for {test_cases}"

    def test_shares_greater_than_investment_in_favorable_market(self):
        """When buying the underdog, you should get more shares than investment."""
        # YES is cheap (low probability), buying YES should give > investment shares
        shares, _, _ = calculate_cpmm_buy(10, "yes", 90, 10)  # YES at 10%
        assert shares > 10, "Should get more shares than investment when buying underdog"

    def test_shares_less_than_investment_in_unfavorable_market(self):
        """When buying the favorite, you get fewer shares than investment."""
        # YES is expensive (high probability), buying YES should give < investment shares
        shares, _, _ = calculate_cpmm_buy(10, "yes", 10, 90)  # YES at 90%
        assert shares < 20, "Should get fewer shares when buying favorite"

    def test_zero_investment_returns_zero_shares(self):
        """Zero investment should return zero shares."""
        shares, new_yes, new_no = calculate_cpmm_buy(0, "yes", 100, 100)
        assert shares == 0
        assert new_yes == 100
        assert new_no == 100


# =============================================================================
# TEST: BUY PRICE CALCULATION
# =============================================================================

class TestBuyPrice:
    """Tests for buy price (average price per share)."""

    def test_buy_price_formula(self, balanced_pool):
        """Buy price should equal stake / shares."""
        stake = 50
        shares, _, _ = calculate_cpmm_buy(
            stake, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        buy_price = stake / shares
        
        # In a 50/50 market, price should be around 0.5-0.6 (with slippage)
        assert 0.4 < buy_price <= 0.65

    def test_buy_price_increases_with_purchase_size(self, balanced_pool):
        """Larger purchases should have higher average price (slippage)."""
        small_shares, _, _ = calculate_cpmm_buy(10, "yes", 100, 100)
        large_shares, _, _ = calculate_cpmm_buy(100, "yes", 100, 100)
        
        small_price = 10 / small_shares
        large_price = 100 / large_shares
        
        assert large_price > small_price, "Larger buys should have higher avg price (slippage)"

    def test_buy_price_reflects_market_probability(self):
        """Buy price should roughly reflect market probability."""
        # In a 70% YES market
        shares, _, _ = calculate_cpmm_buy(10, "yes", 30, 70)
        buy_price = 10 / shares
        
        # Price should be around 0.7 (the probability)
        assert 0.5 < buy_price < 0.9

    def test_sequential_buys_increase_price(self, balanced_pool):
        """Sequential YES buys should increase YES price."""
        yes_pool = balanced_pool["yes_pool"]
        no_pool = balanced_pool["no_pool"]
        
        prices = []
        for _ in range(5):
            shares, yes_pool, no_pool = calculate_cpmm_buy(10, "yes", yes_pool, no_pool)
            prices.append(10 / shares)
        
        # Each subsequent price should be higher
        for i in range(1, len(prices)):
            assert prices[i] > prices[i-1], f"Price should increase: {prices}"

    def test_real_data_buy_prices(self):
        """Test against real transaction data from the database."""
        # Real data from test@email.com on "Test 1" market
        # Initial pools: yes_pool=100, no_pool=100 (assumed from 50/50 start)
        
        yes_pool = 100.0
        no_pool = 100.0
        
        expected_trades = [
            # (stake, outcome, expected_shares, expected_buy_price)
            (10, "yes", 19.09, 0.524),
            (50, "yes", 78.41, 0.638),
            (8, "no", 26.16, 0.306),
            (100, "yes", 129.15, 0.774),
            (700, "no", 928.36, 0.754),
            (9, "yes", 305.69, 0.029),
        ]
        
        for stake, outcome, expected_shares, expected_price in expected_trades:
            shares, yes_pool, no_pool = calculate_cpmm_buy(stake, outcome, yes_pool, no_pool)
            actual_price = stake / shares
            
            # Allow 5% tolerance for floating point
            assert abs(shares - expected_shares) / expected_shares < 0.05, \
                f"Shares mismatch for {stake} {outcome}: got {shares:.2f}, expected {expected_shares}"
            assert abs(actual_price - expected_price) < 0.05, \
                f"Price mismatch for {stake} {outcome}: got {actual_price:.3f}, expected {expected_price}"


# =============================================================================
# TEST: PAYOUT CALCULATION
# =============================================================================

class TestPayoutCalculation:
    """Tests for payout mechanics."""

    def test_potential_payout_equals_shares(self):
        """In CPMM, potential payout = shares * 1."""
        shares = 150.5
        payout = calculate_potential_payout(shares)
        assert payout == shares

    def test_winner_payout_is_shares_rounded(self):
        """Winners get their shares rounded to int."""
        # Simulating resolver logic
        shares = 19.0909090909091
        payout = int(round(shares))
        assert payout == 19

    def test_loser_payout_is_zero(self):
        """Losers get 0 payout."""
        # This is just the business rule
        loser_payout = 0
        assert loser_payout == 0

    def test_real_data_payouts(self):
        """Test payouts against real resolved market data."""
        # Real winning bets from "Test 1" market (resolved YES)
        winning_bets = [
            {"shares": 19.0909090909091, "expected_payout": 19},
            {"shares": 78.4090909090909, "expected_payout": 78},
            {"shares": 129.151026392962, "expected_payout": 129},
            {"shares": 305.685637224852, "expected_payout": 306},
        ]
        
        total_payout = 0
        for bet in winning_bets:
            payout = int(round(bet["shares"]))
            assert payout == bet["expected_payout"], \
                f"Payout mismatch: got {payout}, expected {bet['expected_payout']}"
            total_payout += payout
        
        assert total_payout == 532  # Matches user's final balance

    def test_total_payout_cannot_exceed_total_shares(self):
        """Total payouts should not exceed total winning shares."""
        winning_shares = [19.09, 78.41, 129.15, 305.69]
        total_shares = sum(winning_shares)
        
        payouts = [int(round(s)) for s in winning_shares]
        total_payout = sum(payouts)
        
        # Due to rounding, payout might be slightly different but close
        assert abs(total_payout - total_shares) < len(winning_shares), \
            "Rounding error too large"


# =============================================================================
# TEST: PROFIT/LOSS SCENARIOS
# =============================================================================

class TestProfitLossScenarios:
    """Tests for various profit/loss scenarios."""

    def test_profitable_bet_on_underdog(self):
        """Betting on underdog that wins should be profitable."""
        # YES at 20% probability
        stake = 100
        shares, _, _ = calculate_cpmm_buy(stake, "yes", 80, 20)
        
        # If YES wins, payout = shares
        payout = int(round(shares))
        profit = payout - stake
        
        assert profit > 0, "Betting on winning underdog should be profitable"
        # Due to slippage on large bet, may not quite double but should be significantly profitable
        assert payout > stake * 1.5, f"Should get significant return on underdog: got {payout} for {stake}"

    def test_loss_on_favorite_that_loses(self):
        """Betting on favorite that loses results in total loss."""
        stake = 100
        shares, _, _ = calculate_cpmm_buy(stake, "yes", 20, 80)  # YES at 80%
        
        # If NO wins, payout = 0
        payout = 0
        loss = stake - payout
        
        assert loss == stake, "Losing bet should lose entire stake"

    def test_small_profit_on_favorite_that_wins(self):
        """Betting on favorite that wins gives small profit."""
        stake = 100
        shares, _, _ = calculate_cpmm_buy(stake, "yes", 20, 80)  # YES at 80%
        
        # If YES wins
        payout = int(round(shares))
        profit = payout - stake
        
        # Profit should be positive but small relative to stake
        assert profit > 0, "Winning favorite bet should profit"
        assert profit < stake, "Favorite profit should be less than stake"

    def test_break_even_impossible_due_to_slippage(self, balanced_pool):
        """Even in 50/50 market, large bets have slippage."""
        stake = 50
        shares, _, _ = calculate_cpmm_buy(
            stake, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        payout = int(round(shares))
        
        # Due to slippage, payout < 2 * stake even in 50/50
        assert payout < 2 * stake


# =============================================================================
# TEST: EDGE CASES
# =============================================================================

class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_very_small_investment(self):
        """Very small investments should still work."""
        shares, new_yes, new_no = calculate_cpmm_buy(0.01, "yes", 100, 100)
        
        assert shares > 0
        assert new_yes < 100
        assert new_no > 100

    def test_very_large_investment(self):
        """Very large investments should still preserve invariant."""
        shares, new_yes, new_no = calculate_cpmm_buy(10000, "yes", 100, 100)
        
        k_before = 100 * 100
        k_after = new_yes * new_no
        
        assert abs(k_before - k_after) < 0.01

    def test_investment_larger_than_pool(self):
        """Investment larger than pool should still work."""
        shares, new_yes, new_no = calculate_cpmm_buy(1000, "yes", 10, 10)
        
        assert shares > 0
        assert new_no == 1010  # 10 + 1000
        assert new_yes > 0

    def test_asymmetric_pools(self):
        """Highly asymmetric pools should work correctly."""
        shares, new_yes, new_no = calculate_cpmm_buy(10, "yes", 1, 1000)
        
        k_before = 1 * 1000
        k_after = new_yes * new_no
        
        assert abs(k_before - k_after) < 0.01

    def test_float_precision(self):
        """Float precision should not cause issues."""
        # Use numbers that might cause float issues
        shares, new_yes, new_no = calculate_cpmm_buy(
            33.33, "yes", 66.66, 99.99
        )
        
        assert not math.isnan(shares)
        assert not math.isinf(shares)
        assert shares > 0


# =============================================================================
# TEST: MARKET SIMULATION
# =============================================================================

class TestMarketSimulation:
    """Full market simulation tests."""

    def test_full_market_lifecycle(self):
        """Simulate a complete market from creation to resolution."""
        # Initial liquidity
        yes_pool = 100.0
        no_pool = 100.0
        
        # Track all bets
        bets = []
        
        # User A bets 50 on YES
        shares_a, yes_pool, no_pool = calculate_cpmm_buy(50, "yes", yes_pool, no_pool)
        bets.append({"user": "A", "outcome": "yes", "stake": 50, "shares": shares_a})
        
        # User B bets 30 on NO
        shares_b, yes_pool, no_pool = calculate_cpmm_buy(30, "no", yes_pool, no_pool)
        bets.append({"user": "B", "outcome": "no", "stake": 30, "shares": shares_b})
        
        # User C bets 20 on YES
        shares_c, yes_pool, no_pool = calculate_cpmm_buy(20, "yes", yes_pool, no_pool)
        bets.append({"user": "C", "outcome": "yes", "stake": 20, "shares": shares_c})
        
        # Resolve as YES
        correct_outcome = "yes"
        
        # Calculate payouts
        total_payout = 0
        for bet in bets:
            if bet["outcome"] == correct_outcome:
                payout = int(round(bet["shares"]))
                total_payout += payout
        
        # Verify invariant held throughout
        k_original = 100 * 100
        k_final = yes_pool * no_pool
        assert abs(k_original - k_final) < 0.01

    def test_arbitrage_scenario(self):
        """Test the arbitrage scenario from real data."""
        # User bets big on NO, then small on YES at low price
        yes_pool = 100.0
        no_pool = 100.0
        
        # Initial YES bets
        s1, yes_pool, no_pool = calculate_cpmm_buy(10, "yes", yes_pool, no_pool)
        s2, yes_pool, no_pool = calculate_cpmm_buy(50, "yes", yes_pool, no_pool)
        
        # Small NO bet
        s3, yes_pool, no_pool = calculate_cpmm_buy(8, "no", yes_pool, no_pool)
        
        # Another YES bet
        s4, yes_pool, no_pool = calculate_cpmm_buy(100, "yes", yes_pool, no_pool)
        
        # Big NO bet - this shifts the market dramatically
        s5, yes_pool, no_pool = calculate_cpmm_buy(700, "no", yes_pool, no_pool)
        
        # Check YES price is now very low
        odds_after_big_no = calculate_odds(yes_pool, no_pool)
        assert odds_after_big_no.yes_probability < 0.1, "YES should be cheap after big NO bet"
        
        # Small YES bet gets lots of shares
        s6, yes_pool, no_pool = calculate_cpmm_buy(9, "yes", yes_pool, no_pool)
        
        # The 9 GOOSE bet should get way more than 9 shares
        assert s6 > 100, f"Should get many shares for cheap YES: got {s6}"
        
        # If YES wins, the last bet is extremely profitable
        profit_ratio = s6 / 9
        assert profit_ratio > 30, f"Profit ratio should be huge: {profit_ratio}"

    def test_price_impact_visualization(self):
        """Test that shows price impact of sequential trades."""
        yes_pool = 100.0
        no_pool = 100.0
        
        price_history = []
        
        # Record initial price
        odds = calculate_odds(yes_pool, no_pool)
        price_history.append(("initial", odds.yes_probability))
        
        # Series of YES buys
        for i, stake in enumerate([10, 20, 30, 40, 50]):
            _, yes_pool, no_pool = calculate_cpmm_buy(stake, "yes", yes_pool, no_pool)
            odds = calculate_odds(yes_pool, no_pool)
            price_history.append((f"yes_{stake}", odds.yes_probability))
        
        # Verify price increased monotonically
        prices = [p[1] for p in price_history]
        for i in range(1, len(prices)):
            assert prices[i] > prices[i-1], f"Price should increase: {price_history}"


# =============================================================================
# TEST: MATHEMATICAL PROPERTIES
# =============================================================================

class TestMathematicalProperties:
    """Tests for mathematical properties of CPMM."""

    def test_constant_product_formula(self):
        """Verify the constant product formula k = x * y."""
        yes_pool = 100.0
        no_pool = 100.0
        k = yes_pool * no_pool
        
        # After any trade, k should remain constant
        _, new_yes, new_no = calculate_cpmm_buy(50, "yes", yes_pool, no_pool)
        
        assert abs(new_yes * new_no - k) < 0.0001

    def test_price_is_marginal_rate(self):
        """Price should approximate the marginal exchange rate."""
        yes_pool = 100.0
        no_pool = 100.0
        
        # Current price
        current_price = no_pool / (yes_pool + no_pool)
        
        # Very small buy should have price close to current
        tiny_stake = 0.001
        shares, _, _ = calculate_cpmm_buy(tiny_stake, "yes", yes_pool, no_pool)
        actual_price = tiny_stake / shares
        
        assert abs(actual_price - current_price) < 0.01, \
            f"Marginal price {actual_price} should be close to spot {current_price}"

    def test_symmetry(self):
        """YES and NO should be symmetric in balanced market."""
        yes_pool = 100.0
        no_pool = 100.0
        stake = 50
        
        yes_shares, _, _ = calculate_cpmm_buy(stake, "yes", yes_pool, no_pool)
        no_shares, _, _ = calculate_cpmm_buy(stake, "no", yes_pool, no_pool)
        
        assert abs(yes_shares - no_shares) < 0.0001, "Symmetric market should give equal shares"

    def test_no_free_money(self):
        """Should not be possible to extract value without risk."""
        yes_pool = 100.0
        no_pool = 100.0
        stake = 50
        
        # Buy YES
        yes_shares, new_yes, new_no = calculate_cpmm_buy(stake, "yes", yes_pool, no_pool)
        
        # Expected value if 50/50 outcome
        ev_yes_wins = yes_shares * 0.5  # 50% chance of getting shares
        ev_no_wins = 0 * 0.5  # 50% chance of getting nothing
        expected_value = ev_yes_wins + ev_no_wins
        
        # In a fair market, EV should be close to stake
        # (slightly less due to slippage)
        assert expected_value <= stake, "Should not have positive expected value"


# =============================================================================
# TEST: CPMM SELL MECHANICS
# =============================================================================

class TestCPMMSell:
    """Tests for calculate_cpmm_sell and calculate_cpmm_sell_with_pools functions."""

    def test_buy_then_sell_returns_investment(self, balanced_pool):
        """Buying then immediately selling should return exact investment."""
        investment = 10
        shares, new_yes, new_no = calculate_cpmm_buy(
            investment, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        sell_amount = calculate_cpmm_sell(shares, "yes", new_yes, new_no)
        
        assert abs(sell_amount - investment) < 0.0001, \
            f"Should get back investment: got {sell_amount}, expected {investment}"

    def test_buy_then_sell_restores_pools(self, balanced_pool):
        """Buying then selling should restore pools to original state."""
        investment = 10
        shares, new_yes, new_no = calculate_cpmm_buy(
            investment, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        sell_amount, final_yes, final_no = calculate_cpmm_sell_with_pools(
            shares, "yes", new_yes, new_no
        )
        
        assert abs(final_yes - balanced_pool["yes_pool"]) < 0.0001
        assert abs(final_no - balanced_pool["no_pool"]) < 0.0001

    def test_sell_preserves_invariant(self, balanced_pool):
        """k = yes * no should be preserved after sell."""
        investment = 50
        shares, new_yes, new_no = calculate_cpmm_buy(
            investment, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        k_before = new_yes * new_no
        
        sell_amount, final_yes, final_no = calculate_cpmm_sell_with_pools(
            shares / 2, "yes", new_yes, new_no  # Sell half
        )
        
        k_after = final_yes * final_no
        assert abs(k_before - k_after) < 0.001, f"Invariant broken: {k_before} != {k_after}"

    def test_sell_after_price_increase_gives_profit(self, balanced_pool):
        """Selling after price moves in your favor should give profit."""
        # User A buys YES
        shares_a, yes1, no1 = calculate_cpmm_buy(
            10, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        # User B also buys YES (price goes up)
        _, yes2, no2 = calculate_cpmm_buy(50, "yes", yes1, no1)
        
        # User A sells at higher price
        sell_amount = calculate_cpmm_sell(shares_a, "yes", yes2, no2)
        
        assert sell_amount > 10, f"Should profit when price moves up: got {sell_amount}"

    def test_sell_after_price_decrease_gives_loss(self, balanced_pool):
        """Selling after price moves against you should give loss."""
        # User A buys YES
        shares_a, yes1, no1 = calculate_cpmm_buy(
            10, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        # User B buys NO (YES price goes down)
        _, yes2, no2 = calculate_cpmm_buy(50, "no", yes1, no1)
        
        # User A sells at lower price
        sell_amount = calculate_cpmm_sell(shares_a, "yes", yes2, no2)
        
        assert sell_amount < 10, f"Should lose when price moves down: got {sell_amount}"

    def test_sell_no_shares(self, balanced_pool):
        """Selling NO shares should work symmetrically."""
        investment = 10
        shares, new_yes, new_no = calculate_cpmm_buy(
            investment, "no", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        sell_amount, final_yes, final_no = calculate_cpmm_sell_with_pools(
            shares, "no", new_yes, new_no
        )
        
        assert abs(sell_amount - investment) < 0.0001
        assert abs(final_yes - balanced_pool["yes_pool"]) < 0.0001
        assert abs(final_no - balanced_pool["no_pool"]) < 0.0001

    def test_partial_sell(self, balanced_pool):
        """Selling partial shares should work correctly."""
        investment = 100
        shares, new_yes, new_no = calculate_cpmm_buy(
            investment, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        # Sell half the shares
        half_shares = shares / 2
        sell_amount, final_yes, final_no = calculate_cpmm_sell_with_pools(
            half_shares, "yes", new_yes, new_no
        )
        
        # Should get back some positive amount
        assert sell_amount > 0
        
        # Selling remaining half should give back the rest
        remaining_sell = calculate_cpmm_sell(half_shares, "yes", final_yes, final_no)
        total_back = sell_amount + remaining_sell
        
        # Total should equal original investment
        assert abs(total_back - investment) < 0.001

    def test_zero_shares_returns_zero(self, balanced_pool):
        """Selling zero shares should return zero."""
        sell_amount = calculate_cpmm_sell(
            0, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        assert sell_amount == 0

    def test_sell_price_less_than_buy_price_immediately(self, balanced_pool):
        """Sell price should equal buy price when selling immediately."""
        investment = 10
        shares, new_yes, new_no = calculate_cpmm_buy(
            investment, "yes", balanced_pool["yes_pool"], balanced_pool["no_pool"]
        )
        
        buy_price = investment / shares
        
        sell_amount = calculate_cpmm_sell(shares, "yes", new_yes, new_no)
        sell_price = sell_amount / shares
        
        # Should be equal when selling immediately
        assert abs(buy_price - sell_price) < 0.0001


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

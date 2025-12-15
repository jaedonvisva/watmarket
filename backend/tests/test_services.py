"""
Unit tests for backend services.

Tests cover:
- odds.py: CPMM calculations (calculate_odds, calculate_cpmm_buy, calculate_cpmm_sell)
- auth.py: Authentication and authorization logic
- resolver.py: Line resolution logic

All external dependencies (Supabase) are mocked.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from uuid import uuid4
from datetime import datetime, timezone

import sys
sys.path.insert(0, '/Users/jaedonvisva/side-projects/watmarket/backend')

from app.services.odds import (
    calculate_odds,
    calculate_cpmm_buy,
    calculate_cpmm_sell,
    calculate_cpmm_sell_with_pools,
    calculate_potential_payout
)
from app.services.resolver import resolve_line
from app.models.schemas import LineOdds, UserResponse


# =============================================================================
# TEST: ODDS SERVICE - calculate_odds
# =============================================================================

class TestCalculateOdds:
    """Tests for calculate_odds function."""

    @pytest.mark.unit
    def test_balanced_pools_return_50_50(self):
        """Equal pools should return 50/50 probability."""
        odds = calculate_odds(100.0, 100.0)
        
        assert odds.yes_probability == 0.5
        assert odds.no_probability == 0.5
        assert odds.yes_odds == 2.0
        assert odds.no_odds == 2.0

    @pytest.mark.unit
    @pytest.mark.parametrize("yes_pool,no_pool,expected_yes_prob,expected_no_prob", [
        (30.0, 70.0, 0.7, 0.3),      # YES favored
        (70.0, 30.0, 0.3, 0.7),      # NO favored
        (10.0, 90.0, 0.9, 0.1),      # Heavily YES favored
        (90.0, 10.0, 0.1, 0.9),      # Heavily NO favored
        (50.0, 150.0, 0.75, 0.25),   # 3:1 ratio
    ])
    def test_skewed_pools_calculate_correctly(self, yes_pool, no_pool, expected_yes_prob, expected_no_prob):
        """Skewed pools should calculate correct probabilities."""
        odds = calculate_odds(yes_pool, no_pool)
        
        assert abs(odds.yes_probability - expected_yes_prob) < 0.01
        assert abs(odds.no_probability - expected_no_prob) < 0.01

    @pytest.mark.unit
    def test_probabilities_always_sum_to_one(self):
        """Probabilities should always sum to 1."""
        test_cases = [
            (100, 100), (1, 99), (99, 1), (50, 150),
            (0.5, 0.5), (1000, 1000), (123.456, 789.012)
        ]
        
        for yes_pool, no_pool in test_cases:
            odds = calculate_odds(yes_pool, no_pool)
            total = odds.yes_probability + odds.no_probability
            assert abs(total - 1.0) < 0.01, f"Failed for pools ({yes_pool}, {no_pool})"

    @pytest.mark.unit
    def test_zero_pool_returns_default_50_50(self):
        """Zero or negative pools should return default 50/50."""
        # Zero yes pool
        odds = calculate_odds(0, 100)
        assert odds.yes_probability == 0.5
        assert odds.no_probability == 0.5
        
        # Zero no pool
        odds = calculate_odds(100, 0)
        assert odds.yes_probability == 0.5
        assert odds.no_probability == 0.5
        
        # Both zero
        odds = calculate_odds(0, 0)
        assert odds.yes_probability == 0.5

    @pytest.mark.unit
    def test_negative_pool_returns_default_50_50(self):
        """Negative pools should return default 50/50."""
        odds = calculate_odds(-10, 100)
        assert odds.yes_probability == 0.5
        
        odds = calculate_odds(100, -10)
        assert odds.yes_probability == 0.5

    @pytest.mark.unit
    def test_returns_line_odds_model(self):
        """Should return a LineOdds model instance."""
        odds = calculate_odds(100, 100)
        assert isinstance(odds, LineOdds)

    @pytest.mark.unit
    def test_odds_are_inverse_of_probability(self):
        """Decimal odds should be 1/probability."""
        odds = calculate_odds(30, 70)  # YES at 70%
        
        expected_yes_odds = 1 / 0.7
        expected_no_odds = 1 / 0.3
        
        assert abs(odds.yes_odds - expected_yes_odds) < 0.01
        assert abs(odds.no_odds - expected_no_odds) < 0.01


# =============================================================================
# TEST: ODDS SERVICE - calculate_cpmm_buy
# =============================================================================

class TestCalculateCPMMBuy:
    """Tests for calculate_cpmm_buy function."""

    @pytest.mark.unit
    def test_buy_yes_returns_positive_shares(self):
        """Buying YES should return positive shares."""
        shares, new_yes, new_no = calculate_cpmm_buy(100, "yes", 100, 100)
        
        assert shares > 0
        assert new_yes > 0
        assert new_no > 0

    @pytest.mark.unit
    def test_buy_no_returns_positive_shares(self):
        """Buying NO should return positive shares."""
        shares, new_yes, new_no = calculate_cpmm_buy(100, "no", 100, 100)
        
        assert shares > 0
        assert new_yes > 0
        assert new_no > 0

    @pytest.mark.unit
    def test_buy_yes_increases_no_pool(self):
        """Buying YES should increase NO pool by investment amount."""
        investment = 50
        shares, new_yes, new_no = calculate_cpmm_buy(investment, "yes", 100, 100)
        
        assert new_no == 150  # 100 + 50

    @pytest.mark.unit
    def test_buy_no_increases_yes_pool(self):
        """Buying NO should increase YES pool by investment amount."""
        investment = 50
        shares, new_yes, new_no = calculate_cpmm_buy(investment, "no", 100, 100)
        
        assert new_yes == 150  # 100 + 50

    @pytest.mark.unit
    def test_k_invariant_preserved_yes_buy(self):
        """k = yes_pool * no_pool should be preserved after YES buy."""
        yes_pool, no_pool = 100.0, 100.0
        k_before = yes_pool * no_pool
        
        shares, new_yes, new_no = calculate_cpmm_buy(50, "yes", yes_pool, no_pool)
        k_after = new_yes * new_no
        
        assert abs(k_before - k_after) < 0.001

    @pytest.mark.unit
    def test_k_invariant_preserved_no_buy(self):
        """k = yes_pool * no_pool should be preserved after NO buy."""
        yes_pool, no_pool = 100.0, 100.0
        k_before = yes_pool * no_pool
        
        shares, new_yes, new_no = calculate_cpmm_buy(50, "no", yes_pool, no_pool)
        k_after = new_yes * new_no
        
        assert abs(k_before - k_after) < 0.001

    @pytest.mark.unit
    def test_shares_greater_than_investment_for_underdog(self):
        """Buying underdog should yield more shares than investment."""
        # YES is cheap (10% probability)
        shares, _, _ = calculate_cpmm_buy(10, "yes", 90, 10)
        
        assert shares > 10, "Should get more shares when buying underdog"

    @pytest.mark.unit
    def test_larger_investment_has_higher_avg_price(self):
        """Larger investments should have higher average price (slippage)."""
        small_shares, _, _ = calculate_cpmm_buy(10, "yes", 100, 100)
        large_shares, _, _ = calculate_cpmm_buy(100, "yes", 100, 100)
        
        small_price = 10 / small_shares
        large_price = 100 / large_shares
        
        assert large_price > small_price, "Larger buys should have more slippage"

    @pytest.mark.unit
    def test_symmetric_market_gives_equal_shares(self):
        """In balanced market, YES and NO buys should give equal shares."""
        yes_shares, _, _ = calculate_cpmm_buy(50, "yes", 100, 100)
        no_shares, _, _ = calculate_cpmm_buy(50, "no", 100, 100)
        
        assert abs(yes_shares - no_shares) < 0.001

    @pytest.mark.unit
    def test_zero_investment_returns_zero_shares(self):
        """Zero investment should return zero shares and unchanged pools."""
        shares, new_yes, new_no = calculate_cpmm_buy(0, "yes", 100, 100)
        
        assert shares == 0
        assert new_yes == 100
        assert new_no == 100


# =============================================================================
# TEST: ODDS SERVICE - calculate_cpmm_sell
# =============================================================================

class TestCalculateCPMMSell:
    """Tests for calculate_cpmm_sell function."""

    @pytest.mark.unit
    def test_sell_returns_positive_amount(self):
        """Selling shares should return positive amount."""
        amount = calculate_cpmm_sell(50, "yes", 100, 100)
        
        assert amount > 0

    @pytest.mark.unit
    def test_zero_shares_returns_zero(self):
        """Selling zero shares should return zero."""
        amount = calculate_cpmm_sell(0, "yes", 100, 100)
        
        assert amount == 0

    @pytest.mark.unit
    def test_negative_shares_returns_zero(self):
        """Selling negative shares should return zero."""
        amount = calculate_cpmm_sell(-10, "yes", 100, 100)
        
        assert amount == 0

    @pytest.mark.unit
    def test_buy_then_sell_returns_investment(self):
        """Buying then immediately selling should return original investment."""
        investment = 50
        shares, new_yes, new_no = calculate_cpmm_buy(investment, "yes", 100, 100)
        
        sell_amount = calculate_cpmm_sell(shares, "yes", new_yes, new_no)
        
        assert abs(sell_amount - investment) < 0.001

    @pytest.mark.unit
    def test_sell_after_price_increase_gives_profit(self):
        """Selling after favorable price movement should give profit."""
        # User A buys YES
        shares_a, yes1, no1 = calculate_cpmm_buy(10, "yes", 100, 100)
        
        # User B also buys YES (price goes up)
        _, yes2, no2 = calculate_cpmm_buy(50, "yes", yes1, no1)
        
        # User A sells at higher price
        sell_amount = calculate_cpmm_sell(shares_a, "yes", yes2, no2)
        
        assert sell_amount > 10, "Should profit when price moves favorably"

    @pytest.mark.unit
    def test_sell_after_price_decrease_gives_loss(self):
        """Selling after unfavorable price movement should give loss."""
        # User A buys YES
        shares_a, yes1, no1 = calculate_cpmm_buy(10, "yes", 100, 100)
        
        # User B buys NO (YES price goes down)
        _, yes2, no2 = calculate_cpmm_buy(50, "no", yes1, no1)
        
        # User A sells at lower price
        sell_amount = calculate_cpmm_sell(shares_a, "yes", yes2, no2)
        
        assert sell_amount < 10, "Should lose when price moves unfavorably"


# =============================================================================
# TEST: ODDS SERVICE - calculate_cpmm_sell_with_pools
# =============================================================================

class TestCalculateCPMMSellWithPools:
    """Tests for calculate_cpmm_sell_with_pools function."""

    @pytest.mark.unit
    def test_returns_amount_and_new_pools(self):
        """Should return amount received and new pool states."""
        amount, new_yes, new_no = calculate_cpmm_sell_with_pools(50, "yes", 100, 100)
        
        assert amount > 0
        assert new_yes > 0
        assert new_no > 0

    @pytest.mark.unit
    def test_buy_then_sell_restores_pools(self):
        """Buying then selling should restore pools to original state."""
        original_yes, original_no = 100.0, 100.0
        
        shares, yes1, no1 = calculate_cpmm_buy(50, "yes", original_yes, original_no)
        _, final_yes, final_no = calculate_cpmm_sell_with_pools(shares, "yes", yes1, no1)
        
        assert abs(final_yes - original_yes) < 0.001
        assert abs(final_no - original_no) < 0.001

    @pytest.mark.unit
    def test_k_invariant_preserved_after_sell(self):
        """k = yes * no should be preserved after sell."""
        shares, yes1, no1 = calculate_cpmm_buy(50, "yes", 100, 100)
        k_before = yes1 * no1
        
        _, final_yes, final_no = calculate_cpmm_sell_with_pools(shares / 2, "yes", yes1, no1)
        k_after = final_yes * final_no
        
        assert abs(k_before - k_after) < 0.01

    @pytest.mark.unit
    def test_zero_shares_returns_unchanged_pools(self):
        """Selling zero shares should return unchanged pools."""
        amount, new_yes, new_no = calculate_cpmm_sell_with_pools(0, "yes", 100, 100)
        
        assert amount == 0
        assert new_yes == 100
        assert new_no == 100


# =============================================================================
# TEST: ODDS SERVICE - calculate_potential_payout
# =============================================================================

class TestCalculatePotentialPayout:
    """Tests for calculate_potential_payout function."""

    @pytest.mark.unit
    def test_payout_equals_shares(self):
        """Potential payout should equal shares (1:1 payout)."""
        shares = 150.5
        payout = calculate_potential_payout(shares)
        
        assert payout == shares

    @pytest.mark.unit
    @pytest.mark.parametrize("shares", [0, 1, 100, 999.99, 0.001])
    def test_payout_for_various_share_amounts(self, shares):
        """Payout should equal shares for any amount."""
        payout = calculate_potential_payout(shares)
        assert payout == shares


# =============================================================================
# TEST: RESOLVER SERVICE
# =============================================================================

class TestResolverService:
    """Tests for resolve_line function."""

    @pytest.mark.unit
    def test_invalid_outcome_raises_value_error(self):
        """Invalid outcome should raise ValueError."""
        with pytest.raises(ValueError) as exc_info:
            resolve_line(uuid4(), "maybe")
        
        assert "Invalid outcome" in str(exc_info.value)
        assert "Must be 'yes' or 'no'" in str(exc_info.value)

    @pytest.mark.unit
    def test_valid_yes_outcome_accepted(self):
        """'yes' outcome should be accepted."""
        line_id = uuid4()
        
        mock_result = {
            "line_id": str(line_id),
            "correct_outcome": "yes",
            "winners": 5,
            "losers": 3,
            "total_payout": 500
        }
        
        with patch('app.services.resolver.get_supabase_admin') as mock_admin:
            mock_client = MagicMock()
            mock_client.rpc.return_value.execute.return_value.data = mock_result
            mock_admin.return_value = mock_client
            
            result = resolve_line(line_id, "yes")
            
            assert result["correct_outcome"] == "yes"
            assert result["winners"] == 5
            assert result["losers"] == 3

    @pytest.mark.unit
    def test_valid_no_outcome_accepted(self):
        """'no' outcome should be accepted."""
        line_id = uuid4()
        
        mock_result = {
            "line_id": str(line_id),
            "correct_outcome": "no",
            "winners": 3,
            "losers": 5,
            "total_payout": 300
        }
        
        with patch('app.services.resolver.get_supabase_admin') as mock_admin:
            mock_client = MagicMock()
            mock_client.rpc.return_value.execute.return_value.data = mock_result
            mock_admin.return_value = mock_client
            
            result = resolve_line(line_id, "no")
            
            assert result["correct_outcome"] == "no"

    @pytest.mark.unit
    def test_line_not_found_raises_value_error(self):
        """Non-existent line should raise ValueError."""
        line_id = uuid4()
        
        with patch('app.services.resolver.get_supabase_admin') as mock_admin:
            mock_client = MagicMock()
            mock_client.rpc.return_value.execute.side_effect = Exception("Line not found")
            mock_admin.return_value = mock_client
            
            with pytest.raises(ValueError) as exc_info:
                resolve_line(line_id, "yes")
            
            assert "not found" in str(exc_info.value)

    @pytest.mark.unit
    def test_already_resolved_raises_value_error(self):
        """Already resolved line should raise ValueError."""
        line_id = uuid4()
        
        with patch('app.services.resolver.get_supabase_admin') as mock_admin:
            mock_client = MagicMock()
            mock_client.rpc.return_value.execute.side_effect = Exception("Line already resolved")
            mock_admin.return_value = mock_client
            
            with pytest.raises(ValueError) as exc_info:
                resolve_line(line_id, "yes")
            
            assert "already resolved" in str(exc_info.value)

    @pytest.mark.unit
    def test_returns_resolution_summary(self):
        """Should return complete resolution summary."""
        line_id = uuid4()
        
        mock_result = {
            "line_id": str(line_id),
            "correct_outcome": "yes",
            "winners": 10,
            "losers": 5,
            "total_payout": 1000
        }
        
        with patch('app.services.resolver.get_supabase_admin') as mock_admin:
            mock_client = MagicMock()
            mock_client.rpc.return_value.execute.return_value.data = mock_result
            mock_admin.return_value = mock_client
            
            result = resolve_line(line_id, "yes")
            
            assert "line_id" in result
            assert "correct_outcome" in result
            assert "total_bets" in result
            assert "winners" in result
            assert "losers" in result
            assert "total_payout" in result
            assert result["total_bets"] == 15  # winners + losers


# =============================================================================
# TEST: AUTH SERVICE
# =============================================================================

class TestAuthService:
    """Tests for auth service functions."""

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_current_user_with_valid_token(self):
        """Valid token should return user."""
        from app.services.auth import get_current_user
        from fastapi.security import HTTPAuthorizationCredentials
        
        user_id = str(uuid4())
        mock_user_data = {
            "id": user_id,
            "email": "test@example.com",
            "karma_balance": 1000,
            "is_admin": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Mock credentials
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid_token")
        
        with patch('app.services.auth.get_supabase_client') as mock_client, \
             patch('app.services.auth.get_supabase_admin') as mock_admin:
            
            # Mock auth verification
            mock_auth_user = MagicMock()
            mock_auth_user.id = user_id
            mock_client.return_value.auth.get_user.return_value.user = mock_auth_user
            
            # Mock user profile fetch
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = mock_user_data
            
            result = await get_current_user(credentials)
            
            from uuid import UUID
            assert result.id == UUID(user_id)
            assert result.email == "test@example.com"
            assert result.karma_balance == 1000

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_current_user_with_invalid_token(self):
        """Invalid token should raise HTTPException."""
        from app.services.auth import get_current_user
        from fastapi.security import HTTPAuthorizationCredentials
        from fastapi import HTTPException
        
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid_token")
        
        with patch('app.services.auth.get_supabase_client') as mock_client:
            mock_client.return_value.auth.get_user.return_value.user = None
            
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(credentials)
            
            assert exc_info.value.status_code == 401

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_current_admin_with_admin_user(self):
        """Admin user should pass admin check."""
        from app.services.auth import get_current_admin
        from app.models.schemas import UserResponse
        
        admin_user = UserResponse(
            id=uuid4(),
            email="admin@example.com",
            karma_balance=1000,
            is_admin=True,
            created_at=datetime.now(timezone.utc)
        )
        
        result = await get_current_admin(admin_user)
        
        assert result.is_admin is True
        assert result.email == "admin@example.com"

    @pytest.mark.unit
    @pytest.mark.asyncio
    async def test_get_current_admin_with_non_admin_user(self):
        """Non-admin user should raise HTTPException."""
        from app.services.auth import get_current_admin
        from app.models.schemas import UserResponse
        from fastapi import HTTPException
        
        regular_user = UserResponse(
            id=uuid4(),
            email="user@example.com",
            karma_balance=1000,
            is_admin=False,
            created_at=datetime.now(timezone.utc)
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await get_current_admin(regular_user)
        
        assert exc_info.value.status_code == 403
        assert "Admin access required" in str(exc_info.value.detail)


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

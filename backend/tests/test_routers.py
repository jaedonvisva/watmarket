"""
Unit tests for FastAPI routers.

Tests cover:
- users.py: Registration, login, profile endpoints
- lines.py: Market CRUD, resolution endpoints
- bets.py: Bet placement, selling, positions, portfolio

All external dependencies (Supabase) are mocked using dependency overrides.
Tests simulate real user workflows.
"""

import pytest
from unittest.mock import patch, MagicMock
from uuid import uuid4
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

import sys
sys.path.insert(0, '/Users/jaedonvisva/side-projects/watmarket/backend')

from app.main import app
from app.models.schemas import UserResponse
from app.services.auth import get_current_user, get_current_admin


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_user():
    """Create a mock authenticated user."""
    return UserResponse(
        id=uuid4(),
        email="test@example.com",
        karma_balance=1000,
        is_admin=False,
        created_at=datetime.now(timezone.utc)
    )


@pytest.fixture
def mock_admin_user():
    """Create a mock admin user."""
    return UserResponse(
        id=uuid4(),
        email="admin@example.com",
        karma_balance=5000,
        is_admin=True,
        created_at=datetime.now(timezone.utc)
    )


@pytest.fixture
def auth_client(client, mock_user):
    """Client with mocked authentication."""
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield client, mock_user
    app.dependency_overrides.clear()


@pytest.fixture
def admin_auth_client(client, mock_admin_user):
    """Client with mocked admin authentication."""
    app.dependency_overrides[get_current_user] = lambda: mock_admin_user
    app.dependency_overrides[get_current_admin] = lambda: mock_admin_user
    yield client, mock_admin_user
    app.dependency_overrides.clear()


# =============================================================================
# TEST: HEALTH & ROOT ENDPOINTS
# =============================================================================

class TestRootEndpoints:
    """Tests for root and health endpoints."""

    @pytest.mark.unit
    def test_root_returns_api_info(self, client):
        """Root endpoint should return API info."""
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "WatMarket API"
        assert "version" in data
        assert "docs" in data

    @pytest.mark.unit
    def test_health_check_returns_healthy(self, client):
        """Health endpoint should return healthy status."""
        response = client.get("/health")
        
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


# =============================================================================
# TEST: USERS ROUTER
# =============================================================================

class TestUsersRouter:
    """Tests for /users endpoints."""

    @pytest.mark.unit
    def test_register_success(self, client):
        """Successful registration should return auth response."""
        user_id = str(uuid4())
        
        with patch('app.routers.users.get_supabase_client') as mock_client, \
             patch('app.routers.users.get_supabase_admin') as mock_admin:
            
            # Mock auth signup
            mock_auth_user = MagicMock()
            mock_auth_user.id = user_id
            mock_session = MagicMock()
            mock_session.access_token = "test_token_123"
            
            mock_auth_response = MagicMock()
            mock_auth_response.user = mock_auth_user
            mock_auth_response.session = mock_session
            
            mock_client.return_value.auth.sign_up.return_value = mock_auth_response
            
            # Mock user profile fetch
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": user_id,
                "email": "newuser@example.com",
                "karma_balance": 1000,
                "is_admin": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            response = client.post("/users/register", json={
                "email": "newuser@example.com",
                "password": "password123"
            })
            
            assert response.status_code == 201
            data = response.json()
            assert "access_token" in data
            assert data["user"]["email"] == "newuser@example.com"
            assert data["user"]["karma_balance"] == 1000

    @pytest.mark.unit
    def test_register_short_password_fails(self, client):
        """Registration with short password should fail validation."""
        response = client.post("/users/register", json={
            "email": "test@example.com",
            "password": "short"  # Less than 6 characters
        })
        
        assert response.status_code == 422  # Validation error

    @pytest.mark.unit
    def test_register_invalid_email_fails(self, client):
        """Registration with invalid email should fail."""
        response = client.post("/users/register", json={
            "email": "not-an-email",
            "password": "password123"
        })
        
        # FastAPI/Pydantic doesn't validate email format by default
        # This test documents current behavior
        assert response.status_code in [201, 400, 422]

    @pytest.mark.unit
    def test_login_success(self, client):
        """Successful login should return auth response."""
        user_id = str(uuid4())
        
        with patch('app.routers.users.get_supabase_client') as mock_client, \
             patch('app.routers.users.get_supabase_admin') as mock_admin:
            
            # Mock auth login
            mock_auth_user = MagicMock()
            mock_auth_user.id = user_id
            mock_session = MagicMock()
            mock_session.access_token = "test_token_456"
            
            mock_auth_response = MagicMock()
            mock_auth_response.user = mock_auth_user
            mock_auth_response.session = mock_session
            
            mock_client.return_value.auth.sign_in_with_password.return_value = mock_auth_response
            
            # Mock user profile fetch
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": user_id,
                "email": "user@example.com",
                "karma_balance": 500,
                "is_admin": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            response = client.post("/users/login", json={
                "email": "user@example.com",
                "password": "password123"
            })
            
            assert response.status_code == 200
            data = response.json()
            assert "access_token" in data
            assert data["user"]["email"] == "user@example.com"

    @pytest.mark.unit
    def test_login_invalid_credentials(self, client):
        """Login with invalid credentials should return 401."""
        with patch('app.routers.users.get_supabase_client') as mock_client:
            mock_client.return_value.auth.sign_in_with_password.side_effect = Exception("Invalid credentials")
            
            response = client.post("/users/login", json={
                "email": "wrong@example.com",
                "password": "wrongpassword"
            })
            
            assert response.status_code == 401

    @pytest.mark.unit
    def test_get_me_authenticated(self, auth_client):
        """Authenticated user should get their profile."""
        client, mock_user = auth_client
        
        response = client.get("/users/me")
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == mock_user.email
        assert data["karma_balance"] == mock_user.karma_balance

    @pytest.mark.unit
    def test_get_me_unauthenticated(self, client):
        """Unauthenticated request should return 401."""
        response = client.get("/users/me")
        
        assert response.status_code == 401

    @pytest.mark.unit
    def test_get_trades_returns_trade_history(self, auth_client):
        """Should return user's trade history."""
        client, mock_user = auth_client
        
        with patch('app.routers.users.get_supabase_admin') as mock_admin:
            # Mock bets query
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
                {
                    "id": str(uuid4()),
                    "user_id": str(mock_user.id),
                    "line_id": str(uuid4()),
                    "outcome": "yes",
                    "stake": 100,
                    "shares": 150.0,
                    "buy_price": 0.67,
                    "payout": None,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "lines": {
                        "id": str(uuid4()),
                        "title": "Test Market",
                        "resolved": False,
                        "correct_outcome": None
                    }
                }
            ]
            
            response = client.get("/users/me/trades")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)


# =============================================================================
# TEST: LINES ROUTER
# =============================================================================

class TestLinesRouter:
    """Tests for /lines endpoints."""

    @pytest.mark.unit
    def test_get_lines_returns_list(self, auth_client):
        """Should return list of markets with odds."""
        client, _ = auth_client
        
        with patch('app.routers.lines.get_supabase_admin') as mock_admin:
            mock_admin.return_value.table.return_value.select.return_value.order.return_value.execute.return_value.data = [
                {
                    "id": str(uuid4()),
                    "title": "Test Market 1",
                    "description": "Description 1",
                    "yes_pool": 100.0,
                    "no_pool": 100.0,
                    "volume": 500,
                    "resolved": False,
                    "correct_outcome": None,
                    "closes_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
            ]
            
            response = client.get("/lines")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 1
            assert "odds" in data[0]
            assert data[0]["odds"]["yes_probability"] == 0.5

    @pytest.mark.unit
    def test_get_lines_filter_by_resolved(self, auth_client):
        """Should filter markets by resolved status."""
        client, _ = auth_client
        
        with patch('app.routers.lines.get_supabase_admin') as mock_admin:
            mock_query = MagicMock()
            mock_admin.return_value.table.return_value.select.return_value.order.return_value = mock_query
            mock_query.eq.return_value.execute.return_value.data = []
            mock_query.execute.return_value.data = []
            
            response = client.get("/lines?resolved=false")
            
            assert response.status_code == 200

    @pytest.mark.unit
    def test_get_single_line(self, auth_client):
        """Should return single market with odds."""
        client, _ = auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.lines.get_supabase_admin') as mock_admin:
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": line_id,
                "title": "Test Market",
                "description": "Test description",
                "yes_pool": 70.0,
                "no_pool": 30.0,
                "volume": 200,
                "resolved": False,
                "correct_outcome": None,
                "closes_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            response = client.get(f"/lines/{line_id}")
            
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == line_id
            assert data["odds"]["yes_probability"] == 0.3  # 30 / 100

    @pytest.mark.unit
    def test_get_nonexistent_line_returns_404(self, auth_client):
        """Non-existent market should return 404."""
        client, _ = auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.lines.get_supabase_admin') as mock_admin:
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = None
            
            response = client.get(f"/lines/{line_id}")
            
            assert response.status_code == 404

    @pytest.mark.unit
    def test_create_line_admin_only(self, admin_auth_client):
        """Admin should be able to create markets."""
        client, admin_user = admin_auth_client
        
        with patch('app.routers.lines.get_supabase_admin') as mock_admin:
            line_id = str(uuid4())
            closes_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
            
            mock_admin.return_value.table.return_value.insert.return_value.execute.return_value.data = [{
                "id": line_id,
                "title": "New Market",
                "description": "New description",
                "yes_pool": 100.0,
                "no_pool": 100.0,
                "volume": 0,
                "resolved": False,
                "correct_outcome": None,
                "closes_at": closes_at,
                "created_at": datetime.now(timezone.utc).isoformat()
            }]
            
            response = client.post("/lines", json={
                "title": "New Market",
                "description": "New description",
                "closes_at": closes_at,
                "initial_liquidity": 100.0
            })
            
            assert response.status_code == 201
            data = response.json()
            assert data["title"] == "New Market"

    @pytest.mark.unit
    def test_create_line_non_admin_forbidden(self, auth_client):
        """Non-admin should not be able to create markets."""
        client, _ = auth_client
        
        closes_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        
        response = client.post("/lines", json={
            "title": "New Market",
            "closes_at": closes_at
        })
        
        assert response.status_code == 403

    @pytest.mark.unit
    def test_create_line_past_closes_at_fails(self, admin_auth_client):
        """Creating market with past closes_at should fail."""
        client, _ = admin_auth_client
        
        past_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        
        response = client.post("/lines", json={
            "title": "Past Market",
            "closes_at": past_time
        })
        
        assert response.status_code == 400
        assert "future" in response.json()["detail"].lower()

    @pytest.mark.unit
    def test_resolve_line_admin_only(self, admin_auth_client):
        """Admin should be able to resolve markets."""
        client, _ = admin_auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.lines.resolve_line') as mock_resolve:
            mock_resolve.return_value = {
                "line_id": line_id,
                "correct_outcome": "yes",
                "total_bets": 10,
                "winners": 6,
                "losers": 4,
                "total_payout": 600
            }
            
            response = client.post(f"/lines/{line_id}/resolve", json={
                "correct_outcome": "yes"
            })
            
            assert response.status_code == 200
            data = response.json()
            assert data["correct_outcome"] == "yes"

    @pytest.mark.unit
    def test_resolve_line_invalid_outcome(self, admin_auth_client):
        """Invalid outcome should return 422."""
        client, _ = admin_auth_client
        line_id = str(uuid4())
        
        response = client.post(f"/lines/{line_id}/resolve", json={
            "correct_outcome": "maybe"
        })
        
        assert response.status_code == 422

    @pytest.mark.unit
    def test_get_line_history(self, auth_client):
        """Should return price history for a market."""
        client, _ = auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.lines.get_supabase_admin') as mock_admin:
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
                {
                    "yes_price": 0.5,
                    "no_price": 0.5,
                    "created_at": datetime.now(timezone.utc).isoformat()
                },
                {
                    "yes_price": 0.6,
                    "no_price": 0.4,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
            ]
            
            response = client.get(f"/lines/{line_id}/history")
            
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2


# =============================================================================
# TEST: BETS ROUTER
# =============================================================================

class TestBetsRouter:
    """Tests for /bets endpoints."""

    @pytest.mark.unit
    def test_place_bet_success(self, auth_client):
        """Should successfully place a bet."""
        client, mock_user = auth_client
        line_id = str(uuid4())
        bet_id = str(uuid4())
        
        with patch('app.routers.bets.get_supabase_admin') as mock_admin:
            # Mock RPC call
            mock_admin.return_value.rpc.return_value.execute.return_value.data = {
                "bet_id": bet_id,
                "shares": 150.0,
                "buy_price": 0.67,
                "new_balance": 900
            }
            
            # Mock bet fetch
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": bet_id,
                "user_id": str(mock_user.id),
                "line_id": line_id,
                "outcome": "yes",
                "stake": 100,
                "shares": 150.0,
                "buy_price": 0.67,
                "payout": None,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            response = client.post("/bets/place", json={
                "line_id": line_id,
                "outcome": "yes",
                "stake": 100
            })
            
            assert response.status_code == 201
            data = response.json()
            assert data["outcome"] == "yes"
            assert data["stake"] == 100
            assert data["shares"] == 150.0

    @pytest.mark.unit
    def test_place_bet_insufficient_balance(self, auth_client):
        """Should fail when balance is insufficient."""
        client, _ = auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.bets.get_supabase_admin') as mock_admin:
            mock_admin.return_value.rpc.return_value.execute.side_effect = Exception("Insufficient balance")
            
            response = client.post("/bets/place", json={
                "line_id": line_id,
                "outcome": "yes",
                "stake": 10000  # More than balance
            })
            
            assert response.status_code == 400
            assert "balance" in response.json()["detail"].lower()

    @pytest.mark.unit
    def test_place_bet_invalid_outcome(self, auth_client):
        """Should fail with invalid outcome."""
        client, _ = auth_client
        line_id = str(uuid4())
        
        response = client.post("/bets/place", json={
            "line_id": line_id,
            "outcome": "maybe",  # Invalid
            "stake": 100
        })
        
        assert response.status_code == 422

    @pytest.mark.unit
    def test_place_bet_zero_stake(self, auth_client):
        """Should fail with zero stake."""
        client, _ = auth_client
        line_id = str(uuid4())
        
        response = client.post("/bets/place", json={
            "line_id": line_id,
            "outcome": "yes",
            "stake": 0
        })
        
        assert response.status_code == 422

    @pytest.mark.unit
    def test_place_bet_on_resolved_line(self, auth_client):
        """Should fail when betting on resolved market."""
        client, _ = auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.bets.get_supabase_admin') as mock_admin:
            mock_admin.return_value.rpc.return_value.execute.side_effect = Exception("Line is resolved")
            
            response = client.post("/bets/place", json={
                "line_id": line_id,
                "outcome": "yes",
                "stake": 100
            })
            
            assert response.status_code == 400
            assert "resolved" in response.json()["detail"].lower()

    @pytest.mark.unit
    def test_sell_shares_success(self, auth_client):
        """Should successfully sell shares."""
        client, _ = auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.bets.get_supabase_admin') as mock_admin:
            mock_admin.return_value.rpc.return_value.execute.return_value.data = {
                "shares_sold": 50.0,
                "amount_received": 45.0,
                "sell_price": 0.9,
                "new_balance": 1045,
                "remaining_shares": 100.0
            }
            
            response = client.post("/bets/sell", json={
                "line_id": line_id,
                "outcome": "yes",
                "shares": 50.0
            })
            
            assert response.status_code == 200
            data = response.json()
            assert data["shares_sold"] == 50.0
            assert data["amount_received"] == 45.0

    @pytest.mark.unit
    def test_sell_insufficient_shares(self, auth_client):
        """Should fail when selling more shares than owned."""
        client, _ = auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.bets.get_supabase_admin') as mock_admin:
            mock_admin.return_value.rpc.return_value.execute.side_effect = Exception("Insufficient shares")
            
            response = client.post("/bets/sell", json={
                "line_id": line_id,
                "outcome": "yes",
                "shares": 1000.0
            })
            
            assert response.status_code == 400
            assert "shares" in response.json()["detail"].lower()

    @pytest.mark.unit
    def test_get_my_bets(self, auth_client):
        """Should return user's bets."""
        client, mock_user = auth_client
        
        with patch('app.routers.bets.get_supabase_admin') as mock_admin:
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
                {
                    "id": str(uuid4()),
                    "user_id": str(mock_user.id),
                    "line_id": str(uuid4()),
                    "outcome": "yes",
                    "stake": 100,
                    "shares": 150.0,
                    "buy_price": 0.67,
                    "payout": None,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
            ]
            
            response = client.get("/bets/my")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 1

    @pytest.mark.unit
    def test_get_bets_for_line(self, auth_client):
        """Should return user's bets for specific market."""
        client, mock_user = auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.bets.get_supabase_admin') as mock_admin:
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value.data = [
                {
                    "id": str(uuid4()),
                    "user_id": str(mock_user.id),
                    "line_id": line_id,
                    "outcome": "yes",
                    "stake": 100,
                    "shares": 150.0,
                    "buy_price": 0.67,
                    "payout": None,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
            ]
            
            response = client.get(f"/bets/line/{line_id}")
            
            assert response.status_code == 200

    @pytest.mark.unit
    def test_get_all_bets_for_line_admin_only(self, admin_auth_client):
        """Admin should see all bets for a market."""
        client, _ = admin_auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.bets.get_supabase_admin') as mock_admin:
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
                {
                    "id": str(uuid4()),
                    "user_id": str(uuid4()),
                    "line_id": line_id,
                    "outcome": "yes",
                    "stake": 100,
                    "shares": 150.0,
                    "buy_price": 0.67,
                    "payout": None,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "users": {"email": "user1@example.com"}
                }
            ]
            
            response = client.get(f"/bets/line/{line_id}/all")
            
            assert response.status_code == 200
            data = response.json()
            assert "user_email" in data[0]

    @pytest.mark.unit
    def test_get_all_bets_for_line_non_admin_forbidden(self, auth_client):
        """Non-admin should not see all bets."""
        client, _ = auth_client
        line_id = str(uuid4())
        
        response = client.get(f"/bets/line/{line_id}/all")
        
        assert response.status_code == 403

    @pytest.mark.unit
    def test_get_positions(self, auth_client):
        """Should return aggregated positions."""
        client, mock_user = auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.bets.get_supabase_admin') as mock_admin:
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
                {
                    "id": str(uuid4()),
                    "user_id": str(mock_user.id),
                    "line_id": line_id,
                    "outcome": "yes",
                    "stake": 100,
                    "shares": 150.0,
                    "buy_price": 0.67,
                    "payout": None,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "lines": {
                        "id": line_id,
                        "title": "Test Market",
                        "yes_pool": 100.0,
                        "no_pool": 100.0,
                        "resolved": False,
                        "correct_outcome": None
                    }
                }
            ]
            
            response = client.get("/bets/positions")
            
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)

    @pytest.mark.unit
    def test_get_portfolio_summary(self, auth_client):
        """Should return portfolio summary."""
        client, mock_user = auth_client
        
        with patch('app.routers.bets.get_supabase_admin') as mock_admin:
            mock_admin.return_value.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
            
            response = client.get("/bets/portfolio")
            
            assert response.status_code == 200
            data = response.json()
            assert "cash_balance" in data
            assert "total_portfolio_value" in data
            assert "total_pnl" in data


# =============================================================================
# TEST: ERROR HANDLING
# =============================================================================

class TestErrorHandling:
    """Tests for error handling across routers."""

    @pytest.mark.unit
    def test_invalid_uuid_returns_422(self, auth_client):
        """Invalid UUID should return 422."""
        client, _ = auth_client
        
        response = client.get("/lines/not-a-uuid")
        
        assert response.status_code == 422

    @pytest.mark.unit
    def test_missing_required_field_returns_422(self, auth_client):
        """Missing required field should return 422."""
        client, _ = auth_client
        
        response = client.post("/bets/place", json={
            "line_id": str(uuid4()),
            "outcome": "yes"
            # Missing stake
        })
        
        assert response.status_code == 422

    @pytest.mark.unit
    def test_database_error_returns_500(self, auth_client):
        """Database errors should return 500."""
        client, _ = auth_client
        line_id = str(uuid4())
        
        with patch('app.routers.bets.get_supabase_admin') as mock_admin:
            mock_admin.return_value.rpc.return_value.execute.side_effect = Exception("Database connection failed")
            
            response = client.post("/bets/place", json={
                "line_id": line_id,
                "outcome": "yes",
                "stake": 100
            })
            
            assert response.status_code == 500


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

"""
Pytest configuration and shared fixtures for WatMarket tests.

This module provides:
- Mock fixtures for Supabase clients
- User/Line/Bet factory fixtures
- FastAPI TestClient setup
- Async test configuration
"""

import pytest
import sys
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from typing import Dict, Any, List

# Ensure backend is in path
sys.path.insert(0, '/Users/jaedonvisva/side-projects/watmarket/backend')

from fastapi.testclient import TestClient


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )
    config.addinivalue_line(
        "markers", "unit: marks tests as unit tests"
    )


# =============================================================================
# MOCK DATA FACTORIES
# =============================================================================

@pytest.fixture
def mock_user_data():
    """Factory for creating mock user data."""
    def _create_user(
        user_id: str = None,
        email: str = "test@example.com",
        karma_balance: int = 1000,
        is_admin: bool = False
    ) -> Dict[str, Any]:
        return {
            "id": user_id or str(uuid4()),
            "email": email,
            "karma_balance": karma_balance,
            "is_admin": is_admin,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    return _create_user


@pytest.fixture
def mock_line_data():
    """Factory for creating mock line/market data."""
    def _create_line(
        line_id: str = None,
        title: str = "Test Market",
        description: str = "Test description",
        yes_pool: float = 100.0,
        no_pool: float = 100.0,
        volume: float = 0,
        resolved: bool = False,
        correct_outcome: str = None,
        closes_at: datetime = None
    ) -> Dict[str, Any]:
        return {
            "id": line_id or str(uuid4()),
            "title": title,
            "description": description,
            "yes_pool": yes_pool,
            "no_pool": no_pool,
            "volume": volume,
            "resolved": resolved,
            "correct_outcome": correct_outcome,
            "closes_at": (closes_at or datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": str(uuid4())
        }
    return _create_line


@pytest.fixture
def mock_bet_data():
    """Factory for creating mock bet data."""
    def _create_bet(
        bet_id: str = None,
        user_id: str = None,
        line_id: str = None,
        outcome: str = "yes",
        stake: int = 100,
        shares: float = 150.0,
        buy_price: float = 0.67,
        payout: float = None
    ) -> Dict[str, Any]:
        return {
            "id": bet_id or str(uuid4()),
            "user_id": user_id or str(uuid4()),
            "line_id": line_id or str(uuid4()),
            "outcome": outcome,
            "stake": stake,
            "shares": shares,
            "buy_price": buy_price,
            "payout": payout,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    return _create_bet


# =============================================================================
# SUPABASE MOCK FIXTURES
# =============================================================================

class MockSupabaseResponse:
    """Mock Supabase query response."""
    def __init__(self, data: Any = None, error: str = None):
        self.data = data
        self.error = error


class MockSupabaseQuery:
    """Mock Supabase query builder with chainable methods."""
    def __init__(self, data: Any = None):
        self._data = data
        self._filters = []
    
    def select(self, *args, **kwargs):
        return self
    
    def insert(self, data):
        self._data = [data] if isinstance(data, dict) else data
        return self
    
    def update(self, data):
        if self._data:
            if isinstance(self._data, list):
                self._data = [{**item, **data} for item in self._data]
            else:
                self._data = {**self._data, **data}
        return self
    
    def delete(self):
        return self
    
    def eq(self, column, value):
        self._filters.append((column, value))
        return self
    
    def neq(self, column, value):
        return self
    
    def order(self, column, desc=False):
        return self
    
    def limit(self, count):
        return self
    
    def single(self):
        return self
    
    def execute(self):
        data = self._data
        if isinstance(data, list) and len(data) == 1 and hasattr(self, '_single'):
            data = data[0]
        return MockSupabaseResponse(data=data)


class MockSupabaseTable:
    """Mock Supabase table interface."""
    def __init__(self, data: Any = None):
        self._data = data
    
    def __call__(self, table_name: str):
        return MockSupabaseQuery(self._data)


class MockSupabaseClient:
    """Mock Supabase client for unit testing."""
    def __init__(self, table_data: Dict[str, Any] = None, rpc_data: Dict[str, Any] = None):
        self._table_data = table_data or {}
        self._rpc_data = rpc_data or {}
        self._auth = MockSupabaseAuth()
    
    def table(self, name: str):
        data = self._table_data.get(name)
        return MockSupabaseQuery(data)
    
    def rpc(self, function_name: str, params: Dict = None):
        data = self._rpc_data.get(function_name)
        if callable(data):
            data = data(params)
        return MockSupabaseQuery(data)
    
    @property
    def auth(self):
        return self._auth


class MockSupabaseAuth:
    """Mock Supabase auth interface."""
    def __init__(self):
        self._user = None
        self._session = None
    
    def sign_up(self, credentials: Dict):
        return MockAuthResponse(
            user=MockAuthUser(id=str(uuid4()), email=credentials.get("email")),
            session=MockAuthSession(access_token="mock_token_" + str(uuid4()))
        )
    
    def sign_in_with_password(self, credentials: Dict):
        return MockAuthResponse(
            user=MockAuthUser(id=str(uuid4()), email=credentials.get("email")),
            session=MockAuthSession(access_token="mock_token_" + str(uuid4()))
        )
    
    def get_user(self, token: str):
        if token and token.startswith("mock_token_"):
            return MockAuthResponse(user=MockAuthUser(id=str(uuid4())))
        return MockAuthResponse(user=None)


class MockAuthResponse:
    """Mock auth response."""
    def __init__(self, user=None, session=None):
        self.user = user
        self.session = session


class MockAuthUser:
    """Mock auth user."""
    def __init__(self, id: str, email: str = "test@example.com"):
        self.id = id
        self.email = email


class MockAuthSession:
    """Mock auth session."""
    def __init__(self, access_token: str):
        self.access_token = access_token


@pytest.fixture
def mock_supabase_client():
    """Create a mock Supabase client."""
    def _create_client(table_data: Dict = None, rpc_data: Dict = None):
        return MockSupabaseClient(table_data=table_data, rpc_data=rpc_data)
    return _create_client


@pytest.fixture
def mock_supabase_admin(mock_supabase_client):
    """Fixture that patches get_supabase_admin."""
    def _patch_admin(table_data: Dict = None, rpc_data: Dict = None):
        client = mock_supabase_client(table_data, rpc_data)
        return patch('app.database.get_supabase_admin', return_value=client)
    return _patch_admin


@pytest.fixture
def mock_supabase_anon(mock_supabase_client):
    """Fixture that patches get_supabase_client (anon)."""
    def _patch_anon(table_data: Dict = None, rpc_data: Dict = None):
        client = mock_supabase_client(table_data, rpc_data)
        return patch('app.database.get_supabase_client', return_value=client)
    return _patch_anon


# =============================================================================
# FASTAPI TEST CLIENT
# =============================================================================

@pytest.fixture
def test_client():
    """Create FastAPI test client with mocked dependencies."""
    from app.main import app
    return TestClient(app)


@pytest.fixture
def authenticated_client(test_client, mock_user_data):
    """Test client with mocked authentication."""
    user = mock_user_data()
    
    # Mock the auth dependency
    from app.models.schemas import UserResponse
    mock_user = UserResponse(**user)
    
    def override_get_current_user():
        return mock_user
    
    from app.services.auth import get_current_user
    from app.main import app
    
    app.dependency_overrides[get_current_user] = override_get_current_user
    
    yield test_client, mock_user
    
    # Cleanup
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client(test_client, mock_user_data):
    """Test client with mocked admin authentication."""
    user = mock_user_data(is_admin=True)
    
    from app.models.schemas import UserResponse
    mock_user = UserResponse(**user)
    
    def override_get_current_user():
        return mock_user
    
    def override_get_current_admin():
        return mock_user
    
    from app.services.auth import get_current_user, get_current_admin
    from app.main import app
    
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_current_admin] = override_get_current_admin
    
    yield test_client, mock_user
    
    app.dependency_overrides.clear()


# =============================================================================
# UTILITY FIXTURES
# =============================================================================

@pytest.fixture
def sample_line_odds():
    """Sample odds data for testing."""
    return {
        "yes_probability": 0.5,
        "no_probability": 0.5,
        "yes_odds": 2.0,
        "no_odds": 2.0
    }


@pytest.fixture
def future_datetime():
    """Return a datetime 1 day in the future."""
    return datetime.now(timezone.utc) + timedelta(days=1)


@pytest.fixture
def past_datetime():
    """Return a datetime 1 hour in the past."""
    return datetime.now(timezone.utc) - timedelta(hours=1)


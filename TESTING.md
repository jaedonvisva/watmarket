# WatMarket Testing Guide

This document describes the comprehensive test suite for the WatMarket prediction market application.

## Overview

The test suite covers both backend (FastAPI/Python) and frontend (React/TypeScript) with:
- **Unit tests** for isolated function/component testing
- **Integration tests** for API endpoint testing
- **Mock-based tests** to avoid external dependencies (Supabase)

---

## Backend Tests

### Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Running Tests

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_services.py

# Run specific test class
pytest tests/test_services.py::TestCalculateOdds

# Run with coverage
pytest --cov=app --cov-report=html

# Run only unit tests (skip integration)
pytest -m "unit"

# Run only integration tests
pytest -m "integration"
```

### Test Structure

```
backend/tests/
├── conftest.py          # Shared fixtures, mock factories, test client setup
├── test_services.py     # Unit tests for services (odds, auth, resolver)
├── test_routers.py      # Unit tests for API endpoints
├── test_cpmm.py         # Comprehensive CPMM algorithm tests
└── test_audit_fixes.py  # Integration tests (requires Supabase)
```

### Key Test Files

#### `test_services.py`
Tests for pure business logic:
- `TestCalculateOdds` - CPMM probability calculations
- `TestCalculateCPMMBuy` - Share purchase mechanics
- `TestCalculateCPMMSell` - Share selling mechanics
- `TestResolverService` - Market resolution logic
- `TestAuthService` - Authentication/authorization

#### `test_routers.py`
Tests for API endpoints with mocked Supabase:
- `TestUsersRouter` - Registration, login, profile
- `TestLinesRouter` - Market CRUD, resolution
- `TestBetsRouter` - Bet placement, selling, positions

### Mocking Strategy

The backend tests use:
1. **Dependency overrides** for FastAPI's dependency injection
2. **`unittest.mock.patch`** for Supabase client mocking
3. **Factory fixtures** for generating test data

Example mock usage:
```python
@pytest.fixture
def auth_client(client, mock_user):
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield client, mock_user
    app.dependency_overrides.clear()
```

---

## Frontend Tests

### Setup

```bash
cd frontend

# Install dependencies
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run in watch mode
npm test -- --watch

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- src/context/AuthContext.test.tsx
```

### Test Structure

```
frontend/src/
├── test/
│   ├── setup.ts           # Vitest setup, MSW server init
│   ├── utils.tsx          # Render helpers with providers
│   └── mocks/
│       ├── handlers.ts    # MSW request handlers
│       └── server.ts      # MSW server setup
├── api/
│   └── client.test.ts     # API client tests
├── context/
│   └── AuthContext.test.tsx
├── components/
│   ├── LoadingSpinner.test.tsx
│   ├── EmptyState.test.tsx
│   └── PriceChart.test.tsx
└── pages/
    ├── Dashboard.test.tsx
    └── LineDetail.test.tsx
```

### Key Test Files

#### `AuthContext.test.tsx`
- Initial state from localStorage
- Login/register flows
- Logout behavior
- Token refresh
- Error handling

#### `Dashboard.test.tsx`
- Authenticated rendering
- Tab navigation (Positions/Trades)
- Empty states
- Loading states
- Data display

#### `LineDetail.test.tsx`
- Market data display
- Buy/Sell form interactions
- Outcome selection
- Price calculations
- Error handling
- Resolved market states

#### `client.test.ts`
- Axios configuration
- Request interceptors (auth token)
- Response interceptors (401 handling)
- API wrapper functions

### MSW (Mock Service Worker)

Frontend tests use MSW to intercept network requests:

```typescript
// handlers.ts - Define mock responses
export const handlers = [
  http.post(`${API_URL}/users/login`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      access_token: 'mock_token_123',
      user: createMockUser({ email: body.email }),
    });
  }),
  // ... more handlers
];
```

### Test Utilities

The `utils.tsx` file provides:
- `renderWithProviders()` - Renders with all context providers
- `setupAuthenticatedUser()` - Sets up localStorage for auth
- `createMemoryRouterWrapper()` - For testing specific routes

---

## Test Coverage Goals

| Area | Target | Description |
|------|--------|-------------|
| Services | 90%+ | Pure business logic |
| Routers | 80%+ | API endpoints |
| Components | 80%+ | UI components |
| Context | 90%+ | State management |
| API Client | 70%+ | Network layer |

---

## Writing New Tests

### Backend Test Template

```python
import pytest
from unittest.mock import patch, MagicMock

class TestMyFeature:
    """Tests for my feature."""

    @pytest.mark.unit
    def test_happy_path(self):
        """Description of what this tests."""
        # Arrange
        input_data = {...}
        
        # Act
        result = my_function(input_data)
        
        # Assert
        assert result == expected

    @pytest.mark.unit
    def test_edge_case(self):
        """Test edge case behavior."""
        with pytest.raises(ValueError):
            my_function(invalid_input)
```

### Frontend Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('MyComponent', () => {
  it('renders correctly', async () => {
    render(<MyComponent />);
    
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    render(<MyComponent />);
    
    await user.click(screen.getByRole('button'));
    
    await waitFor(() => {
      expect(screen.getByText('Updated')).toBeInTheDocument();
    });
  });
});
```

---

## CI/CD Integration

Add to your CI pipeline:

```yaml
# Backend tests
- name: Run Backend Tests
  run: |
    cd backend
    pip install -r requirements.txt
    pytest --cov=app --cov-report=xml

# Frontend tests
- name: Run Frontend Tests
  run: |
    cd frontend
    npm ci
    npm run test:coverage
```

---

## Troubleshooting

### Backend

**Import errors**: Ensure you're in the virtual environment and have installed dependencies.

**Async test failures**: Make sure `pytest-asyncio` is installed and tests are marked with `@pytest.mark.asyncio`.

### Frontend

**Module not found errors**: Run `npm install` to install test dependencies.

**MSW not intercepting**: Ensure the server is started in `setup.ts` and handlers match your API URLs.

**React Query issues**: Tests use a fresh QueryClient with `retry: false` to avoid flaky tests.

/**
 * Unit tests for Dashboard page.
 * 
 * Tests cover:
 * - Rendering with authenticated user
 * - Tab switching between positions and trades
 * - Empty states
 * - Loading states
 * - Data display
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import Dashboard from './Dashboard';
import { server } from '../test/mocks/server';
import { http, HttpResponse } from 'msw';

const API_URL = 'http://localhost:8000';

// Test wrapper with all providers
function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  // Setup authenticated user
  localStorage.setItem('access_token', 'mock_token_123');
  localStorage.setItem('user', JSON.stringify({
    id: 'user-123',
    email: 'test@example.com',
    karma_balance: 1000,
    is_admin: false,
    created_at: new Date().toISOString(),
  }));

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Dashboard />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Rendering', () => {
    it('renders nothing when user is not authenticated', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <BrowserRouter>
                <Dashboard />
              </BrowserRouter>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders dashboard header when authenticated', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Portfolio')).toBeInTheDocument();
      });
    });

    it('displays user GOOS balance', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('1,000')).toBeInTheDocument();
      });
    });

    it('displays stat tiles', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('GOOS Balance')).toBeInTheDocument();
        expect(screen.getByText('Total Bets')).toBeInTheDocument();
        expect(screen.getByText('Active Positions')).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('shows Positions tab as active by default', async () => {
      renderDashboard();

      await waitFor(() => {
        const positionsTab = screen.getByRole('button', { name: 'Positions' });
        expect(positionsTab).toHaveClass('active');
      });
    });

    it('switches to Trade History tab on click', async () => {
      const user = userEvent.setup();
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Trade History' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Trade History' }));

      expect(screen.getByRole('button', { name: 'Trade History' })).toHaveClass('active');
      expect(screen.getByRole('button', { name: 'Positions' })).not.toHaveClass('active');
    });

    it('switches back to Positions tab', async () => {
      const user = userEvent.setup();
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Trade History' })).toBeInTheDocument();
      });

      // Switch to trades
      await user.click(screen.getByRole('button', { name: 'Trade History' }));
      // Switch back to positions
      await user.click(screen.getByRole('button', { name: 'Positions' }));

      expect(screen.getByRole('button', { name: 'Positions' })).toHaveClass('active');
    });
  });

  describe('Empty States', () => {
    it('shows empty state when no bets exist', async () => {
      server.use(
        http.get(`${API_URL}/bets/my`, () => {
          return HttpResponse.json([]);
        })
      );

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('No positions yet')).toBeInTheDocument();
      });
    });

    it('shows empty state action button', async () => {
      server.use(
        http.get(`${API_URL}/bets/my`, () => {
          return HttpResponse.json([]);
        })
      );

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Browse Markets')).toBeInTheDocument();
      });
    });

    it('shows empty state for trades tab', async () => {
      const user = userEvent.setup();
      
      server.use(
        http.get(`${API_URL}/users/me/trades`, () => {
          return HttpResponse.json([]);
        })
      );

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Trade History' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Trade History' }));

      await waitFor(() => {
        expect(screen.getByText('No trades found')).toBeInTheDocument();
      });
    });
  });

  describe('Data Display', () => {
    it('displays bets in table format', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Market')).toBeInTheDocument();
        expect(screen.getByText('Side')).toBeInTheDocument();
        expect(screen.getByText('Shares')).toBeInTheDocument();
        expect(screen.getByText('Cost')).toBeInTheDocument();
      });
    });

    it('displays bet outcome correctly', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('YES')).toBeInTheDocument();
      });
    });

    it('displays link to market', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('View Market')).toBeInTheDocument();
      });
    });

    it('displays trades in table when tab is active', async () => {
      const user = userEvent.setup();
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Trade History' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Trade History' }));

      await waitFor(() => {
        expect(screen.getByText('Test Market')).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('shows loading spinner while fetching data', async () => {
      // Delay the response
      server.use(
        http.get(`${API_URL}/bets/my`, async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return HttpResponse.json([]);
        })
      );

      renderDashboard();

      // Should show spinner initially
      expect(document.querySelector('.spinner')).toBeInTheDocument();

      // Wait for loading to complete
      await waitFor(() => {
        expect(document.querySelector('.spinner')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      server.use(
        http.get(`${API_URL}/bets/my`, () => {
          return HttpResponse.json({ detail: 'Server error' }, { status: 500 });
        })
      );

      renderDashboard();

      // Should not crash, may show empty state or error
      await waitFor(() => {
        expect(screen.getByText('Portfolio')).toBeInTheDocument();
      });
    });
  });
});

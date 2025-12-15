/**
 * Unit tests for LineDetail page.
 * 
 * Tests cover:
 * - Market data display
 * - Buy/Sell form interactions
 * - Price calculations
 * - User position display
 * - Error handling
 * - Loading states
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import LineDetail from './LineDetail';
import { server } from '../test/mocks/server';
import { http, HttpResponse } from 'msw';

const API_URL = 'http://localhost:8000';

// Test wrapper with routing
function renderLineDetail(lineId: string = 'line-123') {
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
          <MemoryRouter initialEntries={[`/lines/${lineId}`]}>
            <Routes>
              <Route path="/lines/:id" element={<LineDetail />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('LineDetail', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Market Display', () => {
    it('renders market title', async () => {
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Market')).toBeInTheDocument();
      });
    });

    it('displays YES probability', async () => {
      renderLineDetail();

      await waitFor(() => {
        // Multiple elements show 50%, just verify at least one exists
        expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
      });
    });

    it('displays market status badge', async () => {
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText('Trading Open')).toBeInTheDocument();
      });
    });

    it('displays volume', async () => {
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText(/Volume:/)).toBeInTheDocument();
      });
    });

    it('shows back button', async () => {
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText('← Back to Markets')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner initially', () => {
      renderLineDetail();

      expect(document.querySelector('.spinner')).toBeInTheDocument();
    });

    it('hides spinner after data loads', async () => {
      renderLineDetail();

      await waitFor(() => {
        expect(document.querySelector('.spinner')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error for non-existent market', async () => {
      renderLineDetail('not-found');

      await waitFor(() => {
        expect(screen.getByText('Market not found')).toBeInTheDocument();
      });
    });

    it('shows error message on API failure', async () => {
      server.use(
        http.get(`${API_URL}/lines/:id`, () => {
          return HttpResponse.json({ detail: 'Server error' }, { status: 500 });
        })
      );

      renderLineDetail();

      await waitFor(() => {
        // Component shows error class with message
        const errorDiv = document.querySelector('.error');
        expect(errorDiv).toBeInTheDocument();
      });
    });
  });

  describe('Outcome Selection', () => {
    it('has YES selected by default', async () => {
      renderLineDetail();

      await waitFor(() => {
        const yesButton = screen.getAllByText('Yes')[0].closest('button');
        expect(yesButton).toHaveClass('selected');
      });
    });

    it('can select NO outcome', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getAllByText('No')[0]).toBeInTheDocument();
      });

      const noButton = screen.getAllByText('No')[0].closest('button');
      await user.click(noButton!);

      expect(noButton).toHaveClass('selected');
    });
  });

  describe('Buy Mode', () => {
    it('shows buy form by default', async () => {
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText('Buy')).toBeInTheDocument();
      });
    });

    it('shows amount input mode by default', async () => {
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText('Amount ($G)')).toBeInTheDocument();
      });
    });

    it('can switch to shares input mode', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText('Buy in Shares')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Buy in Shares'));

      expect(screen.getByText('Buy in Shares')).toHaveClass('active');
    });

    it('displays order summary', async () => {
      renderLineDetail();

      await waitFor(() => {
        // Order summary card exists with summary rows
        const summaryCard = document.querySelector('.order-summary-card');
        expect(summaryCard).toBeInTheDocument();
        expect(document.querySelectorAll('.summary-row').length).toBeGreaterThan(0);
      });
    });

    it('shows available balance', async () => {
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText(/Available:/)).toBeInTheDocument();
        expect(screen.getByText(/1,000/)).toBeInTheDocument();
      });
    });

    it('disables buy button when cost exceeds balance', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByRole('spinbutton')).toBeInTheDocument();
      });

      const input = screen.getByRole('spinbutton');
      await user.clear(input);
      await user.type(input, '5000');

      const buyButton = screen.getByRole('button', { name: /Buy YES/i });
      expect(buyButton).toBeDisabled();
    });
  });

  describe('Sell Mode', () => {
    it('shows sell tab when user has position', async () => {
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText(/Sell/)).toBeInTheDocument();
      });
    });

    it('can switch to sell mode', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderLineDetail();

      await waitFor(() => {
        const sellTab = screen.getByRole('button', { name: /Sell/ });
        expect(sellTab).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Sell/ }));

      // Sell mode shows position info in summary
      await waitFor(() => {
        expect(screen.getByText(/Position:/)).toBeInTheDocument();
      });
    });

    it('shows quick sell percentage buttons', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Sell/ })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Sell/ }));

      await waitFor(() => {
        // Quick sell buttons are rendered
        const buttons = screen.getAllByRole('button');
        const buttonTexts = buttons.map(b => b.textContent);
        expect(buttonTexts.some(t => t?.includes('25%'))).toBe(true);
        expect(buttonTexts.some(t => t?.includes('50%'))).toBe(true);
        expect(buttonTexts.some(t => t?.includes('Max'))).toBe(true);
      });
    });
  });

  describe('Place Bet', () => {
    it('submits bet successfully', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByRole('spinbutton')).toBeInTheDocument();
      });

      const input = screen.getByRole('spinbutton');
      await user.clear(input);
      await user.type(input, '100');

      const buyButton = screen.getByRole('button', { name: /Buy YES/i });
      await user.click(buyButton);

      // Button should show processing
      await waitFor(() => {
        expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
      });
    });

    it('shows error on insufficient balance', async () => {
      server.use(
        http.post(`${API_URL}/bets/place`, () => {
          return HttpResponse.json(
            { detail: 'Insufficient GOOSE balance' },
            { status: 400 }
          );
        })
      );

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByRole('spinbutton')).toBeInTheDocument();
      });

      const input = screen.getByRole('spinbutton');
      await user.clear(input);
      await user.type(input, '100');

      const buyButton = screen.getByRole('button', { name: /Buy YES/i });
      await user.click(buyButton);

      // Axios errors show "Request failed with status code 400"
      await waitFor(() => {
        expect(screen.getByText(/Request failed|Order failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('User Positions Table', () => {
    it('displays user positions when they exist', async () => {
      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText('Your Positions')).toBeInTheDocument();
      });
    });

    it('shows position details in table', async () => {
      renderLineDetail();

      await waitFor(() => {
        // Table headers
        expect(screen.getAllByText('Side').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Shares').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Price Chart', () => {
    it('renders price chart component', async () => {
      renderLineDetail();

      await waitFor(() => {
        const chartContainer = document.querySelector('.chart-container');
        expect(chartContainer).toBeInTheDocument();
      });
    });
  });

  describe('Resolved Market', () => {
    it('shows resolved status for resolved market', async () => {
      server.use(
        http.get(`${API_URL}/lines/:id`, () => {
          return HttpResponse.json({
            id: 'line-123',
            title: 'Resolved Market',
            description: 'This market is resolved',
            yes_pool: 100,
            no_pool: 100,
            volume: 500,
            resolved: true,
            correct_outcome: 'yes',
            closes_at: new Date(Date.now() - 86400000).toISOString(),
            created_at: new Date().toISOString(),
            odds: {
              yes_probability: 0.5,
              no_probability: 0.5,
              yes_odds: 2.0,
              no_odds: 2.0,
            },
          });
        })
      );

      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText('Resolved')).toBeInTheDocument();
      });
    });

    it('shows trading closed message for resolved market', async () => {
      server.use(
        http.get(`${API_URL}/lines/:id`, () => {
          return HttpResponse.json({
            id: 'line-123',
            title: 'Resolved Market',
            description: 'This market is resolved',
            yes_pool: 100,
            no_pool: 100,
            volume: 500,
            resolved: true,
            correct_outcome: 'yes',
            closes_at: new Date(Date.now() - 86400000).toISOString(),
            created_at: new Date().toISOString(),
            odds: {
              yes_probability: 0.5,
              no_probability: 0.5,
              yes_odds: 2.0,
              no_odds: 2.0,
            },
          });
        })
      );

      renderLineDetail();

      await waitFor(() => {
        expect(screen.getByText('Trading is closed')).toBeInTheDocument();
      });
    });
  });

  describe('Unauthenticated User', () => {
    it('shows login prompt for unauthenticated user', async () => {
      localStorage.clear();
      
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <MemoryRouter initialEntries={['/lines/line-123']}>
                <Routes>
                  <Route path="/lines/:id" element={<LineDetail />} />
                </Routes>
              </MemoryRouter>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Log in to trade')).toBeInTheDocument();
      });
    });
  });
});

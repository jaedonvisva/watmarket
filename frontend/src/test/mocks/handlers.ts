/**
 * MSW request handlers for mocking API responses.
 * 
 * These handlers intercept network requests and return mock data,
 * simulating real user workflows without hitting the actual backend.
 */

import { http, HttpResponse } from 'msw';

const API_URL = 'http://localhost:8000';

// Mock data factories
export const createMockUser = (overrides = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  karma_balance: 1000,
  is_admin: false,
  created_at: new Date().toISOString(),
  ...overrides,
});

export const createMockLine = (overrides = {}) => ({
  id: 'line-123',
  title: 'Test Market',
  description: 'Test description',
  yes_pool: 100,
  no_pool: 100,
  volume: 500,
  resolved: false,
  correct_outcome: null,
  closes_at: new Date(Date.now() + 86400000).toISOString(),
  created_at: new Date().toISOString(),
  odds: {
    yes_probability: 0.5,
    no_probability: 0.5,
    yes_odds: 2.0,
    no_odds: 2.0,
  },
  ...overrides,
});

export const createMockBet = (overrides = {}) => ({
  id: 'bet-123',
  user_id: 'user-123',
  line_id: 'line-123',
  outcome: 'yes',
  stake: 100,
  shares: 150,
  buy_price: 0.67,
  potential_payout: 150,
  payout: null,
  created_at: new Date().toISOString(),
  ...overrides,
});

export const createMockPosition = (overrides = {}) => ({
  line_id: 'line-123',
  line_title: 'Test Market',
  line_resolved: false,
  line_correct_outcome: null,
  outcome: 'yes',
  total_shares: 150,
  total_cost: 100,
  avg_buy_price: 0.67,
  current_price: 0.5,
  current_value: 75,
  pnl: -25,
  pnl_percent: -25,
  payout: null,
  is_active: true,
  ...overrides,
});

export const createMockPortfolio = (overrides = {}) => ({
  cash_balance: 1000,
  invested_value: 100,
  positions_value: 75,
  total_portfolio_value: 1075,
  total_pnl: -25,
  total_pnl_percent: -25,
  active_positions_count: 1,
  resolved_positions_count: 0,
  ...overrides,
});

export const createMockTrade = (overrides = {}) => ({
  id: 'trade-123',
  created_at: new Date().toISOString(),
  line_id: 'line-123',
  line_title: 'Test Market',
  outcome: 'yes',
  type: 'buy',
  shares: 150,
  price: 0.67,
  amount: 100,
  is_resolved: false,
  result: null,
  payout: null,
  ...overrides,
});

export const createMockPriceHistory = () => [
  { yes_price: 0.5, no_price: 0.5, created_at: new Date(Date.now() - 86400000).toISOString() },
  { yes_price: 0.55, no_price: 0.45, created_at: new Date(Date.now() - 43200000).toISOString() },
  { yes_price: 0.6, no_price: 0.4, created_at: new Date().toISOString() },
];

// Default handlers
export const handlers = [
  // Auth endpoints
  http.post(`${API_URL}/users/register`, async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    return HttpResponse.json({
      access_token: 'mock_token_123',
      token_type: 'bearer',
      user: createMockUser({ email: body.email }),
    }, { status: 201 });
  }),

  http.post(`${API_URL}/users/login`, async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    if (body.email === 'invalid@example.com') {
      return HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 });
    }
    return HttpResponse.json({
      access_token: 'mock_token_123',
      token_type: 'bearer',
      user: createMockUser({ email: body.email }),
    });
  }),

  http.get(`${API_URL}/users/me`, () => {
    return HttpResponse.json(createMockUser());
  }),

  http.get(`${API_URL}/users/me/trades`, () => {
    return HttpResponse.json([createMockTrade()]);
  }),

  // Lines endpoints
  http.get(`${API_URL}/lines`, ({ request }) => {
    const url = new URL(request.url);
    const resolved = url.searchParams.get('resolved');
    
    const lines = [
      createMockLine({ id: 'line-1', title: 'Market 1' }),
      createMockLine({ id: 'line-2', title: 'Market 2', resolved: true, correct_outcome: 'yes' }),
    ];
    
    if (resolved === 'true') {
      return HttpResponse.json(lines.filter(l => l.resolved));
    } else if (resolved === 'false') {
      return HttpResponse.json(lines.filter(l => !l.resolved));
    }
    
    return HttpResponse.json(lines);
  }),

  http.get(`${API_URL}/lines/:id`, ({ params }) => {
    const { id } = params;
    if (id === 'not-found') {
      return HttpResponse.json({ detail: 'Line not found' }, { status: 404 });
    }
    return HttpResponse.json(createMockLine({ id: id as string }));
  }),

  http.get(`${API_URL}/lines/:id/history`, () => {
    return HttpResponse.json(createMockPriceHistory());
  }),

  http.post(`${API_URL}/lines`, async ({ request }) => {
    const body = await request.json() as { title: string; description?: string; closes_at: string };
    return HttpResponse.json(createMockLine({ 
      title: body.title,
      description: body.description,
    }), { status: 201 });
  }),

  http.post(`${API_URL}/lines/:id/resolve`, async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as { correct_outcome: 'yes' | 'no' };
    return HttpResponse.json({
      line_id: id,
      correct_outcome: body.correct_outcome,
      total_bets: 10,
      winners: 6,
      losers: 4,
      total_payout: 600,
    });
  }),

  // Bets endpoints
  http.post(`${API_URL}/bets/place`, async ({ request }) => {
    const body = await request.json() as { line_id: string; outcome: string; stake: number };
    
    if (body.stake > 1000) {
      return HttpResponse.json({ detail: 'Insufficient GOOSE balance' }, { status: 400 });
    }
    
    return HttpResponse.json(createMockBet({
      line_id: body.line_id,
      outcome: body.outcome,
      stake: body.stake,
      shares: body.stake * 1.5,
    }), { status: 201 });
  }),

  http.post(`${API_URL}/bets/sell`, async ({ request }) => {
    const body = await request.json() as { line_id: string; outcome: string; shares: number };
    
    if (body.shares > 150) {
      return HttpResponse.json({ detail: 'Insufficient shares to sell' }, { status: 400 });
    }
    
    return HttpResponse.json({
      shares_sold: body.shares,
      amount_received: body.shares * 0.9,
      sell_price: 0.9,
      new_balance: 1000 + body.shares * 0.9,
      remaining_shares: 150 - body.shares,
    });
  }),

  http.get(`${API_URL}/bets/my`, () => {
    return HttpResponse.json([createMockBet()]);
  }),

  http.get(`${API_URL}/bets/line/:lineId`, () => {
    return HttpResponse.json([createMockBet()]);
  }),

  http.get(`${API_URL}/bets/line/:lineId/all`, () => {
    return HttpResponse.json([
      { ...createMockBet(), user_email: 'user1@example.com' },
      { ...createMockBet({ id: 'bet-456', user_id: 'user-456' }), user_email: 'user2@example.com' },
    ]);
  }),

  http.get(`${API_URL}/bets/positions`, () => {
    return HttpResponse.json([createMockPosition()]);
  }),

  http.get(`${API_URL}/bets/portfolio`, () => {
    return HttpResponse.json(createMockPortfolio());
  }),
];

// Error handlers for testing error states
export const errorHandlers = {
  networkError: http.get(`${API_URL}/lines`, () => {
    return HttpResponse.error();
  }),
  
  serverError: http.get(`${API_URL}/lines`, () => {
    return HttpResponse.json({ detail: 'Internal server error' }, { status: 500 });
  }),
  
  unauthorized: http.get(`${API_URL}/users/me`, () => {
    return HttpResponse.json({ detail: 'Invalid authentication token' }, { status: 401 });
  }),
};

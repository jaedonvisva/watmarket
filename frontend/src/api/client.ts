import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Types
export interface User {
  id: string;
  email: string;
  karma_balance: number;
  is_admin: boolean;
  created_at: string;
}

export interface LineOdds {
  yes_probability: number;
  no_probability: number;
  yes_odds: number;
  no_odds: number;
}

export interface Line {
  id: string;
  title: string;
  description: string | null;
  closes_at: string;
  yes_pool: number;
  no_pool: number;
  volume: number;
  resolved: boolean;
  correct_outcome: 'yes' | 'no' | null;
  created_at: string;
  odds: LineOdds;
}

export interface Bet {
  id: string;
  user_id: string;
  line_id: string;
  outcome: 'yes' | 'no';
  stake: number;
  shares?: number;
  created_at: string;
  potential_payout: number | null;
  buy_price?: number;
  payout?: number;
}

export interface AdminBet extends Bet {
  user_email: string;
}

export interface Trade {
  id: string;
  created_at: string;
  line_id: string;
  line_title: string;
  outcome: 'yes' | 'no';
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  amount: number;  // Cost for buy, Revenue for sell
  is_resolved: boolean;
  result: 'won' | 'lost' | null;
  payout: number | null;
}

export interface Position {
  line_id: string;
  line_title: string;
  line_resolved: boolean;
  line_correct_outcome: 'yes' | 'no' | null;
  outcome: 'yes' | 'no';
  total_shares: number;
  total_cost: number;
  avg_buy_price: number;
  current_price: number;
  current_value: number;
  pnl: number;
  pnl_percent: number;
  payout: number | null;
  is_active: boolean;
}

export interface PortfolioSummary {
  cash_balance: number;
  invested_value: number;
  positions_value: number;
  total_portfolio_value: number;
  total_pnl: number;
  total_pnl_percent: number;
  active_positions_count: number;
  resolved_positions_count: number;
}

export interface PriceHistoryPoint {
  yes_price: number;
  no_price: number;
  created_at: string;
}

export interface SellSharesRequest {
  line_id: string;
  outcome: 'yes' | 'no';
  shares: number;
}

export interface SellSharesResponse {
  shares_sold: number;
  amount_received: number;
  sell_price: number;
  new_balance: number;
  remaining_shares: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// API functions
export const authApi = {
  register: (email: string, password: string) =>
    api.post<AuthResponse>('/users/register', { email, password }),
  
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/users/login', { email, password }),
  
  getMe: () => api.get<User>('/users/me'),
  
  getTrades: () => api.get<Trade[]>('/users/me/trades'),
};

export const linesApi = {
  getAll: (resolved?: boolean) =>
    api.get<Line[]>('/lines', { params: resolved !== undefined ? { resolved } : {} }),
  
  getOne: (id: string) => api.get<Line>(`/lines/${id}`),
  
  getHistory: (id: string) => api.get<PriceHistoryPoint[]>(`/lines/${id}/history`),
  
  create: (data: { title: string; description?: string; closes_at: string; initial_liquidity?: number }) =>
    api.post<Line>('/lines', data),
  
  resolve: (id: string, correct_outcome: 'yes' | 'no') =>
    api.post(`/lines/${id}/resolve`, { correct_outcome }),
};

export const betsApi = {
  place: (line_id: string, outcome: 'yes' | 'no', stake: number) =>
    api.post<Bet>('/bets/place', { line_id, outcome, stake }),
  
  sell: (line_id: string, outcome: 'yes' | 'no', shares: number) =>
    api.post<SellSharesResponse>('/bets/sell', { line_id, outcome, shares }),
  
  getMy: () => api.get<Bet[]>('/bets/my'),
  
  getForLine: (line_id: string) => api.get<Bet[]>(`/bets/line/${line_id}`),
  
  getAllForLine: (line_id: string) => api.get<AdminBet[]>(`/bets/line/${line_id}/all`),
  
  getPositions: () => api.get<Position[]>('/bets/positions'),
  
  getPortfolio: () => api.get<PortfolioSummary>('/bets/portfolio'),
};

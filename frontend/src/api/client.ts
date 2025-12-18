import axios from 'axios';
import type {
  User,
  Line,
  Bet,
  AdminBet,
  Trade,
  Position,
  PortfolioSummary,
  PriceHistoryPoint,
  SellSharesResponse,
  AuthResponse,
  SuggestedLine,
  SuggestedLineCreateRequest,
  SuggestionReviewRequest,
  LineInvalidateResponse,
} from './types';

// Re-export all types for backwards compatibility
export * from './types';

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
      // Don't redirect if we're already trying to login/register
      const isAuthEndpoint = error.config?.url?.includes('/users/login') ||
        error.config?.url?.includes('/users/register');

      if (!isAuthEndpoint) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

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

  invalidate: (id: string) =>
    api.post<LineInvalidateResponse>(`/lines/${id}/invalidate`),
};

export const betsApi = {
  place: (line_id: string, outcome: 'yes' | 'no', stake: number, min_shares_out: number) =>
    api.post<Bet>('/bets/place', { line_id, outcome, stake, min_shares_out }),

  sell: (line_id: string, outcome: 'yes' | 'no', shares: number, min_amount_out: number) =>
    api.post<SellSharesResponse>('/bets/sell', { line_id, outcome, shares, min_amount_out }),

  getMy: () => api.get<Bet[]>('/bets/my'),

  getForLine: (line_id: string) => api.get<Bet[]>(`/bets/line/${line_id}`),

  getAllForLine: (line_id: string) => api.get<AdminBet[]>(`/bets/line/${line_id}/all`),

  getPositions: () => api.get<Position[]>('/bets/positions'),

  getPortfolio: () => api.get<PortfolioSummary>('/bets/portfolio'),
};

export const suggestionsApi = {
  create: (data: SuggestedLineCreateRequest) =>
    api.post<SuggestedLine>('/suggestions', data),

  getMy: () => api.get<SuggestedLine[]>('/suggestions/my'),

  getPending: () => api.get<SuggestedLine[]>('/suggestions/pending'),

  getAll: (status?: string) =>
    api.get<SuggestedLine[]>('/suggestions/all', { params: status ? { status_filter: status } : {} }),

  getOne: (id: string) => api.get<SuggestedLine>(`/suggestions/${id}`),

  review: (id: string, data: SuggestionReviewRequest) =>
    api.post<SuggestedLine>(`/suggestions/${id}/review`, data),
};

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

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'bet' | 'payout' | 'initial';
  reference_id: string | null;
  created_at: string;
}

export interface PriceHistoryPoint {
  yes_price: number;
  no_price: number;
  created_at: string;
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
  
  getTransactions: () => api.get<Transaction[]>('/users/me/transactions'),
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
  
  getMy: () => api.get<Bet[]>('/bets/my'),
  
  getForLine: (line_id: string) => api.get<Bet[]>(`/bets/line/${line_id}`),
};

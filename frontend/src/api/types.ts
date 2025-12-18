/**
 * API Types
 * Centralized type definitions for API responses and requests
 */

// ============ User Types ============

export interface User {
  id: string;
  email: string;
  karma_balance: number;
  is_admin: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ============ Market/Line Types ============

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
  correct_outcome: 'yes' | 'no' | 'invalid' | null;
  created_at: string;
  odds: LineOdds;
}

export interface LineInvalidateResponse {
  line_id: string;
  correct_outcome: 'invalid';
  users_refunded: number;
  total_refunded: number;
  resolved_at: string;
}

export interface PriceHistoryPoint {
  yes_price: number;
  no_price: number;
  created_at: string;
}

export interface LineCreateRequest {
  title: string;
  description?: string;
  closes_at: string;
  initial_liquidity?: number;
}

// ============ Bet Types ============

export type Outcome = 'yes' | 'no';

export interface Bet {
  id: string;
  user_id: string;
  line_id: string;
  outcome: Outcome;
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

export interface SellSharesRequest {
  line_id: string;
  outcome: Outcome;
  shares: number;
}

export interface SellSharesResponse {
  shares_sold: number;
  amount_received: number;
  sell_price: number;
  new_balance: number;
  remaining_shares: number;
}

// ============ Trade Types ============

export type TradeType = 'buy' | 'sell';
export type TradeResult = 'won' | 'lost' | 'refunded' | null;

export interface Trade {
  id: string;
  created_at: string;
  line_id: string;
  line_title: string;
  outcome: Outcome;
  type: TradeType;
  shares: number;
  price: number;
  amount: number;
  is_resolved: boolean;
  result: TradeResult;
  payout: number | null;
}

// ============ Position Types ============

export type ResolutionOutcome = 'yes' | 'no' | 'invalid';

export interface Position {
  line_id: string;
  line_title: string;
  line_resolved: boolean;
  line_correct_outcome: ResolutionOutcome | null;
  outcome: Outcome;
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

// ============ Portfolio Types ============

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

// ============ Suggestion Types ============

export type SuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface SuggestedLine {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  closes_at: string;
  status: SuggestionStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_line_id: string | null;
  created_at: string;
}

export interface SuggestedLineCreateRequest {
  title: string;
  description?: string;
  closes_at: string;
}

export interface SuggestionReviewRequest {
  action: 'approve' | 'reject';
  rejection_reason?: string;
  initial_liquidity?: number;
}

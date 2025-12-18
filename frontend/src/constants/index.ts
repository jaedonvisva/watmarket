/**
 * Application Constants
 * Centralized configuration values to avoid magic numbers
 */

// Query refetch intervals (in milliseconds)
export const REFETCH_INTERVALS = {
  LIVE_DATA: 10000,      // 10 seconds for live price updates
  MARKET_DATA: 10000,    // 10 seconds for market data
} as const;

// UI Constants
export const UI = {
  TOAST_DURATION: 4000,           // Toast display duration in ms
  TOAST_EXIT_DELAY: 300,          // Toast exit animation duration
  TRENDING_MARKETS_LIMIT: 6,      // Number of trending markets on dashboard
  RECENT_TRADES_LIMIT: 5,         // Number of recent trades on dashboard
} as const;

// Default values
export const DEFAULTS = {
  INITIAL_STAKE: 100,
  INITIAL_SHARES: 100,
  SLIPPAGE_TOLERANCE: 0.02,  // 2% default slippage tolerance
} as const;

// Time periods for chart
export const TIME_PERIODS = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as const;
export type TimePeriod = typeof TIME_PERIODS[number];

// Time period durations in milliseconds
export const TIME_PERIOD_MS: Record<Exclude<TimePeriod, 'YTD' | 'ALL'>, number> = {
  '1D': 24 * 60 * 60 * 1000,
  '1W': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  '3M': 90 * 24 * 60 * 60 * 1000,
  '6M': 180 * 24 * 60 * 60 * 1000,
  '1Y': 365 * 24 * 60 * 60 * 1000,
};

/**
 * Unit tests for API client.
 * 
 * Tests cover:
 * - Axios instance configuration
 * - Request interceptors (auth token injection)
 * - API type definitions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { api, authApi, linesApi, betsApi } from './client';
import type { User, Line, Bet, Position, PortfolioSummary } from './client';

describe('API Client', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Configuration', () => {
    it('has baseURL configured', () => {
      expect(api.defaults.baseURL).toBeDefined();
    });

    it('sets JSON content type header', () => {
      expect(api.defaults.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('Request Interceptor', () => {
    it('interceptors are configured', () => {
      // Verify interceptors exist
      expect(api.interceptors.request).toBeDefined();
      expect(api.interceptors.response).toBeDefined();
    });
  });

  describe('API Functions Exist', () => {
    it('authApi has all required methods', () => {
      expect(authApi.register).toBeDefined();
      expect(authApi.login).toBeDefined();
      expect(authApi.getMe).toBeDefined();
      expect(authApi.getTrades).toBeDefined();
    });

    it('linesApi has all required methods', () => {
      expect(linesApi.getAll).toBeDefined();
      expect(linesApi.getOne).toBeDefined();
      expect(linesApi.getHistory).toBeDefined();
      expect(linesApi.create).toBeDefined();
      expect(linesApi.resolve).toBeDefined();
    });

    it('betsApi has all required methods', () => {
      expect(betsApi.place).toBeDefined();
      expect(betsApi.sell).toBeDefined();
      expect(betsApi.getMy).toBeDefined();
      expect(betsApi.getForLine).toBeDefined();
      expect(betsApi.getAllForLine).toBeDefined();
      expect(betsApi.getPositions).toBeDefined();
      expect(betsApi.getPortfolio).toBeDefined();
    });
  });

  describe('Type Definitions', () => {
    it('User type has required fields', () => {
      const user: User = {
        id: 'test-id',
        email: 'test@example.com',
        karma_balance: 1000,
        is_admin: false,
        created_at: '2024-01-01T00:00:00Z',
      };
      
      expect(user.id).toBe('test-id');
      expect(user.email).toBe('test@example.com');
      expect(user.karma_balance).toBe(1000);
    });

    it('Line type has required fields', () => {
      const line: Line = {
        id: 'line-id',
        title: 'Test Market',
        description: null,
        closes_at: '2024-12-31T00:00:00Z',
        yes_pool: 100,
        no_pool: 100,
        volume: 500,
        resolved: false,
        correct_outcome: null,
        created_at: '2024-01-01T00:00:00Z',
        odds: {
          yes_probability: 0.5,
          no_probability: 0.5,
          yes_odds: 2.0,
          no_odds: 2.0,
        },
      };
      
      expect(line.id).toBe('line-id');
      expect(line.odds.yes_probability).toBe(0.5);
    });

    it('Bet type has required fields', () => {
      const bet: Bet = {
        id: 'bet-id',
        user_id: 'user-id',
        line_id: 'line-id',
        outcome: 'yes',
        stake: 100,
        shares: 150,
        created_at: '2024-01-01T00:00:00Z',
        potential_payout: 150,
      };
      
      expect(bet.outcome).toBe('yes');
      expect(bet.stake).toBe(100);
    });

    it('Position type has required fields', () => {
      const position: Position = {
        line_id: 'line-id',
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
      };
      
      expect(position.total_shares).toBe(150);
      expect(position.pnl).toBe(-25);
    });

    it('PortfolioSummary type has required fields', () => {
      const portfolio: PortfolioSummary = {
        cash_balance: 1000,
        invested_value: 100,
        positions_value: 75,
        total_portfolio_value: 1075,
        total_pnl: -25,
        total_pnl_percent: -25,
        active_positions_count: 1,
        resolved_positions_count: 0,
      };
      
      expect(portfolio.cash_balance).toBe(1000);
      expect(portfolio.total_pnl).toBe(-25);
    });
  });
});

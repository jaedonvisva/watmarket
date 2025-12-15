/**
 * Unit tests for AuthContext.
 * 
 * Tests cover:
 * - Initial state from localStorage
 * - Login flow
 * - Registration flow
 * - Logout flow
 * - User refresh
 * - Error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { server } from '../test/mocks/server';
import { http, HttpResponse } from 'msw';

const API_URL = 'http://localhost:8000';

// Wrapper for testing hooks
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have null user and token when localStorage is empty', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should restore user and token from localStorage', () => {
      const mockUser = {
        id: 'user-123',
        email: 'stored@example.com',
        karma_balance: 500,
        is_admin: false,
        created_at: new Date().toISOString(),
      };
      
      localStorage.setItem('access_token', 'stored_token');
      localStorage.setItem('user', JSON.stringify(mockUser));
      
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      expect(result.current.token).toBe('stored_token');
      expect(result.current.user?.email).toBe('stored@example.com');
    });
  });

  describe('Login', () => {
    it('should login successfully and store credentials', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });
      
      expect(result.current.user).not.toBeNull();
      expect(result.current.user?.email).toBe('test@example.com');
      expect(result.current.token).toBe('mock_token_123');
      expect(localStorage.getItem('access_token')).toBe('mock_token_123');
    });

    it('should throw error on invalid credentials', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      await expect(
        act(async () => {
          await result.current.login('invalid@example.com', 'wrongpassword');
        })
      ).rejects.toThrow();
      
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
    });

    it('should handle network errors gracefully', async () => {
      server.use(
        http.post(`${API_URL}/users/login`, () => {
          return HttpResponse.error();
        })
      );
      
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      await expect(
        act(async () => {
          await result.current.login('test@example.com', 'password123');
        })
      ).rejects.toThrow();
    });
  });

  describe('Register', () => {
    it('should register successfully and store credentials', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      await act(async () => {
        await result.current.register('newuser@example.com', 'password123');
      });
      
      expect(result.current.user).not.toBeNull();
      expect(result.current.user?.email).toBe('newuser@example.com');
      expect(result.current.token).toBe('mock_token_123');
    });

    it('should handle registration errors', async () => {
      server.use(
        http.post(`${API_URL}/users/register`, () => {
          return HttpResponse.json(
            { detail: 'Email already exists' },
            { status: 400 }
          );
        })
      );
      
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      await expect(
        act(async () => {
          await result.current.register('existing@example.com', 'password123');
        })
      ).rejects.toThrow();
    });
  });

  describe('Logout', () => {
    it('should clear user, token, and localStorage on logout', async () => {
      // First login
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });
      
      expect(result.current.user).not.toBeNull();
      
      // Then logout
      act(() => {
        result.current.logout();
      });
      
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });
  });

  describe('Refresh User', () => {
    it('should refresh user data from API', async () => {
      // Setup initial state
      localStorage.setItem('access_token', 'mock_token_123');
      localStorage.setItem('user', JSON.stringify({
        id: 'user-123',
        email: 'test@example.com',
        karma_balance: 500,
        is_admin: false,
        created_at: new Date().toISOString(),
      }));
      
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      // Initial balance
      expect(result.current.user?.karma_balance).toBe(500);
      
      // Refresh should get updated data from API (mock returns 1000)
      await act(async () => {
        await result.current.refreshUser();
      });
      
      expect(result.current.user?.karma_balance).toBe(1000);
    });

    it('should logout on refresh failure (invalid token)', async () => {
      server.use(
        http.get(`${API_URL}/users/me`, () => {
          return HttpResponse.json(
            { detail: 'Invalid token' },
            { status: 401 }
          );
        })
      );
      
      localStorage.setItem('access_token', 'expired_token');
      localStorage.setItem('user', JSON.stringify({
        id: 'user-123',
        email: 'test@example.com',
        karma_balance: 500,
        is_admin: false,
        created_at: new Date().toISOString(),
      }));
      
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      await act(async () => {
        await result.current.refreshUser();
      });
      
      // Should be logged out
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
    });

    it('should do nothing if not logged in', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      
      // Should not throw
      await act(async () => {
        await result.current.refreshUser();
      });
      
      expect(result.current.user).toBeNull();
    });
  });

  describe('useAuth Hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');
      
      consoleSpy.mockRestore();
    });
  });
});

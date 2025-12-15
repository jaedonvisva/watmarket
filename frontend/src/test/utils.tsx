/**
 * Test utilities for rendering components with providers.
 * 
 * Provides wrapper components that include all necessary context providers
 * (AuthContext, ThemeContext, QueryClient, Router) for testing.
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

// Create a fresh QueryClient for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface WrapperProps {
  children: React.ReactNode;
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string;
  withRouter?: boolean;
}

/**
 * All providers wrapper for testing components that need full context.
 */
export function AllProviders({ children }: WrapperProps) {
  const queryClient = createTestQueryClient();
  
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>{children}</BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/**
 * Wrapper with MemoryRouter for testing specific routes.
 */
export function createMemoryRouterWrapper(initialRoute: string = '/') {
  return function MemoryRouterWrapper({ children }: WrapperProps) {
    const queryClient = createTestQueryClient();
    
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={[initialRoute]}>
              {children}
            </MemoryRouter>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };
}

/**
 * Custom render function that wraps components with all providers.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: CustomRenderOptions = {}
) {
  const { initialRoute, withRouter = true, ...renderOptions } = options;
  
  const Wrapper = initialRoute 
    ? createMemoryRouterWrapper(initialRoute)
    : AllProviders;
  
  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    // Return the query client for test assertions
    queryClient: createTestQueryClient(),
  };
}

/**
 * Render without router for testing isolated components.
 */
export function renderWithoutRouter(
  ui: ReactElement,
  options: Omit<RenderOptions, 'wrapper'> = {}
) {
  const queryClient = createTestQueryClient();
  
  function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }
  
  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Helper to set up authenticated state in localStorage before rendering.
 */
export function setupAuthenticatedUser(user = {
  id: 'user-123',
  email: 'test@example.com',
  karma_balance: 1000,
  is_admin: false,
  created_at: new Date().toISOString(),
}) {
  localStorage.setItem('access_token', 'mock_token_123');
  localStorage.setItem('user', JSON.stringify(user));
  return user;
}

/**
 * Helper to clear authenticated state.
 */
export function clearAuthenticatedUser() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
}

/**
 * Wait for loading states to resolve.
 */
export async function waitForLoadingToFinish() {
  // Small delay to allow React Query to settle
  await new Promise(resolve => setTimeout(resolve, 0));
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

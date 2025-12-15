/**
 * Unit tests for PriceChart component.
 * 
 * Note: Recharts components are complex to test directly.
 * These tests focus on rendering behavior and data transformation.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PriceChart from './PriceChart';
import type { PriceHistoryPoint } from '../api/client';

describe('PriceChart', () => {
  const mockData: PriceHistoryPoint[] = [
    { yes_price: 0.5, no_price: 0.5, created_at: '2024-01-01T00:00:00Z' },
    { yes_price: 0.6, no_price: 0.4, created_at: '2024-01-02T00:00:00Z' },
    { yes_price: 0.7, no_price: 0.3, created_at: '2024-01-03T00:00:00Z' },
  ];

  it('renders empty state when no data provided', () => {
    render(<PriceChart data={[]} />);
    
    expect(screen.getByText('Not enough data to display chart')).toBeInTheDocument();
  });

  it('renders chart container when data is provided', () => {
    render(<PriceChart data={mockData} />);
    
    const container = document.querySelector('.chart-container');
    expect(container).toBeInTheDocument();
  });

  it('does not show empty message when data exists', () => {
    render(<PriceChart data={mockData} />);
    
    expect(screen.queryByText('Not enough data to display chart')).not.toBeInTheDocument();
  });

  it('renders with single data point', () => {
    const singlePoint: PriceHistoryPoint[] = [
      { yes_price: 0.5, no_price: 0.5, created_at: '2024-01-01T00:00:00Z' },
    ];
    
    render(<PriceChart data={singlePoint} />);
    
    const container = document.querySelector('.chart-container');
    expect(container).toBeInTheDocument();
  });

  it('handles data with extreme values', () => {
    const extremeData: PriceHistoryPoint[] = [
      { yes_price: 0.01, no_price: 0.99, created_at: '2024-01-01T00:00:00Z' },
      { yes_price: 0.99, no_price: 0.01, created_at: '2024-01-02T00:00:00Z' },
    ];
    
    render(<PriceChart data={extremeData} />);
    
    const container = document.querySelector('.chart-container');
    expect(container).toBeInTheDocument();
  });

  it('has correct container dimensions', () => {
    render(<PriceChart data={mockData} />);
    
    const container = document.querySelector('.chart-container');
    expect(container).toHaveStyle({ height: '300px', width: '100%' });
  });
});

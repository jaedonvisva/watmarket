/**
 * Unit tests for EmptyState component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No data found" />);
    
    expect(screen.getByText('No data found')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <EmptyState 
        title="No data" 
        description="Try adding some items" 
      />
    );
    
    expect(screen.getByText('Try adding some items')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<EmptyState title="No data" />);
    
    const description = document.querySelector('.empty-state p');
    expect(description).not.toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="No data" icon="📭" />);
    
    expect(screen.getByText('📭')).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(
      <EmptyState 
        title="No data" 
        action={<button>Add Item</button>} 
      />
    );
    
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
  });

  it('renders all props together', () => {
    render(
      <EmptyState 
        title="Empty Cart"
        description="Your cart is empty"
        icon="🛒"
        action={<button>Shop Now</button>}
      />
    );
    
    expect(screen.getByText('Empty Cart')).toBeInTheDocument();
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.getByText('🛒')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shop Now' })).toBeInTheDocument();
  });

  it('has correct CSS class structure', () => {
    render(<EmptyState title="Test" icon="🔍" />);
    
    expect(document.querySelector('.empty-state')).toBeInTheDocument();
    expect(document.querySelector('.empty-icon')).toBeInTheDocument();
  });
});

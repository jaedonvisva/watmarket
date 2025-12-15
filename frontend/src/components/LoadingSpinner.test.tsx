/**
 * Unit tests for LoadingSpinner component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders spinner element', () => {
    render(<LoadingSpinner />);
    
    const spinner = document.querySelector('.spinner');
    expect(spinner).toBeInTheDocument();
  });

  it('renders in default (non-fullscreen) mode', () => {
    render(<LoadingSpinner />);
    
    const container = document.querySelector('.loading-container');
    expect(container).toBeInTheDocument();
    expect(container).not.toHaveClass('full-screen');
  });

  it('renders in fullscreen mode when prop is true', () => {
    render(<LoadingSpinner fullScreen={true} />);
    
    const container = document.querySelector('.loading-container');
    expect(container).toBeInTheDocument();
    expect(container).toHaveClass('full-screen');
  });

  it('renders in non-fullscreen mode when prop is false', () => {
    render(<LoadingSpinner fullScreen={false} />);
    
    const container = document.querySelector('.loading-container');
    expect(container).not.toHaveClass('full-screen');
  });
});

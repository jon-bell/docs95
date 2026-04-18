import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import React from 'react';
import { StatusBar } from './StatusBar.js';
import { useUIStore } from '../stores/ui-store.js';

afterEach(() => {
  cleanup();
  // Reset the store
  act(() => {
    useUIStore.getState().setPagination(1, 1);
    useUIStore.getState().setStatus('');
  });
});

describe('StatusBar', () => {
  it('displays Page 1 of 1 by default', () => {
    render(<StatusBar />);
    expect(screen.getByText('Page 1 of 1')).toBeTruthy();
  });

  it('displays Page X of Y from store', () => {
    act(() => {
      useUIStore.getState().setPagination(3, 10);
    });
    render(<StatusBar />);
    expect(screen.getByText('Page 3 of 10')).toBeTruthy();
  });

  it('has role=status', () => {
    render(<StatusBar />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('displays statusText when set', () => {
    act(() => {
      useUIStore.getState().setStatus('Saving...');
    });
    render(<StatusBar />);
    expect(screen.getByText('Saving...')).toBeTruthy();
  });

  it('does not render status text region when statusText is empty', () => {
    act(() => {
      useUIStore.getState().setStatus('');
    });
    render(<StatusBar />);
    // "Saving..." or any status text should not appear
    expect(screen.queryByText('Saving...')).toBeNull();
  });
});

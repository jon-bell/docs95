import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { AppShell } from './AppShell.js';

afterEach(() => {
  cleanup();
});

describe('AppShell', () => {
  it('has exactly one role=menubar', () => {
    render(<AppShell onCommand={vi.fn()} />);
    const menubars = screen.getAllByRole('menubar');
    expect(menubars).toHaveLength(1);
  });

  it('has exactly one role=status', () => {
    render(<AppShell onCommand={vi.fn()} />);
    const statusbars = screen.getAllByRole('status');
    expect(statusbars).toHaveLength(1);
  });

  it('has a main landmark', () => {
    render(<AppShell onCommand={vi.fn()} />);
    const main = screen.getByRole('main');
    expect(main).toBeTruthy();
  });

  it('renders children inside the main area', () => {
    render(
      <AppShell onCommand={vi.fn()}>
        <div data-testid="child-content">hello</div>
      </AppShell>,
    );
    const main = screen.getByRole('main');
    expect(main.querySelector('[data-testid="child-content"]')).toBeTruthy();
  });

  it('has a banner landmark wrapping the menubar', () => {
    render(<AppShell onCommand={vi.fn()} />);
    const banner = screen.getByRole('banner');
    expect(banner).toBeTruthy();
    // The menubar should be inside the banner
    const menubar = screen.getByRole('menubar');
    expect(banner.contains(menubar)).toBe(true);
  });
});

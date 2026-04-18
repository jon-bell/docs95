import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MenuBar } from './MenuBar.js';

afterEach(() => {
  cleanup();
});

// Accessible names from RTL include text content of child elements joined by whitespace.
// <u>F</u>ile becomes "F ile", <u>N</u>ew becomes "N ew", etc.
// We match with flexible regexes that tolerate this.

describe('MenuBar', () => {
  it('renders a menubar', () => {
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);
    expect(screen.getByRole('menubar')).toBeTruthy();
  });

  it('File/Edit/View/Help top-level items are all present', () => {
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);
    // These are top-level menubar items; their names have the mnemonic letter separated
    const items = screen.getAllByRole('menuitem');
    const names = items.map((el) => el.textContent ?? '');
    expect(names.some((n) => /file/i.test(n))).toBe(true);
    expect(names.some((n) => /edit/i.test(n))).toBe(true);
    expect(names.some((n) => /view/i.test(n))).toBe(true);
    expect(names.some((n) => /help/i.test(n))).toBe(true);
  });

  it('Alt+F opens the File menu', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    await user.keyboard('{Alt>}f{/Alt}');

    expect(screen.getByRole('menu', { name: /file/i })).toBeTruthy();
  });

  it('after opening File menu the first item is focused', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    await user.keyboard('{Alt>}f{/Alt}');

    // First visible menu item under File should be focused
    // Its text content is "New" with possible spacing from <u>
    const allMenuItems = screen.getAllByRole('menuitem');
    const inMenuItems = allMenuItems.filter((el) => el.tagName === 'LI');
    expect(document.activeElement).toBe(inMenuItems[0]);
  });

  it('Escape closes the menu', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    await user.keyboard('{Alt>}f{/Alt}');
    expect(screen.getByRole('menu', { name: /file/i })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: /file/i })).toBeNull();
  });

  it('clicking Open... item dispatches app.file.open', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    // Open File menu by clicking the bar item
    const allItems = screen.getAllByRole('menuitem');
    const fileBarItem = allItems.find((el) => /file/i.test(el.textContent ?? ''))!;
    await user.click(fileBarItem);

    // Find Open item in the menu (LI element with textContent matching Open)
    const openItem = screen
      .getAllByRole('menuitem')
      .find((el) => el.tagName === 'LI' && /open/i.test(el.textContent ?? ''))!;
    await user.click(openItem);

    expect(onCommand).toHaveBeenCalledWith('app.file.open');
  });

  it('Page Layout menu item is aria-disabled', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    const allItems = screen.getAllByRole('menuitem');
    const viewBarItem = allItems.find((el) => /view/i.test(el.textContent ?? ''))!;
    await user.click(viewBarItem);

    const pageLayout = screen
      .getAllByRole('menuitem')
      .find((el) => el.tagName === 'LI' && /page layout/i.test(el.textContent ?? ''))!;
    expect(pageLayout.getAttribute('aria-disabled')).toBe('true');
  });

  it('clicking a disabled item does not dispatch command', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    const allItems = screen.getAllByRole('menuitem');
    const viewBarItem = allItems.find((el) => /view/i.test(el.textContent ?? ''))!;
    await user.click(viewBarItem);

    const pageLayout = screen
      .getAllByRole('menuitem')
      .find((el) => el.tagName === 'LI' && /page layout/i.test(el.textContent ?? ''))!;
    await user.click(pageLayout);

    expect(onCommand).not.toHaveBeenCalled();
  });

  it('clicking outside closes the menu', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(
      <div>
        <MenuBar onCommand={onCommand} />
        <div data-testid="outside">outside</div>
      </div>,
    );

    const allItems = screen.getAllByRole('menuitem');
    const fileBarItem = allItems.find((el) => /file/i.test(el.textContent ?? ''))!;
    await user.click(fileBarItem);
    expect(screen.getByRole('menu', { name: /file/i })).toBeTruthy();

    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu', { name: /file/i })).toBeNull();
  });
});

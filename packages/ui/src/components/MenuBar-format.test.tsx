import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MenuBar } from './MenuBar.js';

afterEach(() => {
  cleanup();
});

describe('MenuBar — Format menu', () => {
  it('Format top-level item is present', () => {
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);
    const items = screen.getAllByRole('menuitem');
    const names = items.map((el) => el.textContent ?? '');
    expect(names.some((n) => /format/i.test(n))).toBe(true);
  });

  it('clicking Format menu shows Font... item', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    const allItems = screen.getAllByRole('menuitem');
    const formatBarItem = allItems.find((el) => /format/i.test(el.textContent ?? ''))!;
    await user.click(formatBarItem);

    const fontItem = screen
      .getAllByRole('menuitem')
      .find((el) => el.tagName === 'LI' && /font\.\.\./i.test(el.textContent ?? ''));
    expect(fontItem).toBeTruthy();
  });

  it('clicking Font... dispatches app.format.font.dialog', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    const allItems = screen.getAllByRole('menuitem');
    const formatBarItem = allItems.find((el) => /format/i.test(el.textContent ?? ''))!;
    await user.click(formatBarItem);

    const fontItem = screen
      .getAllByRole('menuitem')
      .find((el) => el.tagName === 'LI' && /font\.\.\./i.test(el.textContent ?? ''))!;
    await user.click(fontItem);

    expect(onCommand).toHaveBeenCalledWith('app.format.font.dialog');
  });

  it('clicking Paragraph... dispatches app.format.paragraph.dialog', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    const allItems = screen.getAllByRole('menuitem');
    const formatBarItem = allItems.find((el) => /format/i.test(el.textContent ?? ''))!;
    await user.click(formatBarItem);

    const paraItem = screen
      .getAllByRole('menuitem')
      .find((el) => el.tagName === 'LI' && /paragraph\.\.\./i.test(el.textContent ?? ''))!;
    await user.click(paraItem);

    expect(onCommand).toHaveBeenCalledWith('app.format.paragraph.dialog');
  });
});

describe('MenuBar — Edit Find/Replace', () => {
  it('Edit menu shows Find... item', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    const allItems = screen.getAllByRole('menuitem');
    const editBarItem = allItems.find((el) => /^edit/i.test(el.textContent ?? ''))!;
    await user.click(editBarItem);

    const findItem = screen
      .getAllByRole('menuitem')
      .find((el) => el.tagName === 'LI' && /find\.\.\./i.test(el.textContent ?? ''));
    expect(findItem).toBeTruthy();
  });

  it('clicking Find... dispatches app.edit.find', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    const allItems = screen.getAllByRole('menuitem');
    const editBarItem = allItems.find((el) => /^edit/i.test(el.textContent ?? ''))!;
    await user.click(editBarItem);

    const findItem = screen
      .getAllByRole('menuitem')
      .find((el) => el.tagName === 'LI' && /find\.\.\./i.test(el.textContent ?? ''))!;
    await user.click(findItem);

    expect(onCommand).toHaveBeenCalledWith('app.edit.find');
  });

  it('clicking Replace... dispatches app.edit.replace', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<MenuBar onCommand={onCommand} />);

    const allItems = screen.getAllByRole('menuitem');
    const editBarItem = allItems.find((el) => /^edit/i.test(el.textContent ?? ''))!;
    await user.click(editBarItem);

    const replaceItem = screen
      .getAllByRole('menuitem')
      .find((el) => el.tagName === 'LI' && /replace\.\.\./i.test(el.textContent ?? ''))!;
    await user.click(replaceItem);

    expect(onCommand).toHaveBeenCalledWith('app.edit.replace');
  });
});

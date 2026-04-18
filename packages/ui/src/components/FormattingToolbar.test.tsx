import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { FormattingToolbar } from './FormattingToolbar.js';
import type { ActiveFormatting } from '../hooks/use-active-formatting.js';

afterEach(() => {
  cleanup();
});

const emptyFormatting: ActiveFormatting = {};

describe('FormattingToolbar', () => {
  it('renders a toolbar landmark', () => {
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    expect(screen.getByRole('toolbar')).toBeTruthy();
  });

  it('all toggle buttons have accessible names', () => {
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('clicking Bold calls onCommand with app.format.bold', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const boldBtn = screen.getByRole('button', { name: /bold/i });
    await user.click(boldBtn);
    expect(onCommand).toHaveBeenCalledWith('app.format.bold');
  });

  it('clicking Italic calls onCommand with app.format.italic', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const btn = screen.getByRole('button', { name: /italic/i });
    await user.click(btn);
    expect(onCommand).toHaveBeenCalledWith('app.format.italic');
  });

  it('clicking Underline calls onCommand with app.format.underline', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const btn = screen.getByRole('button', { name: /underline/i });
    await user.click(btn);
    expect(onCommand).toHaveBeenCalledWith('app.format.underline');
  });

  it('clicking Strikethrough calls onCommand with app.format.strikethrough', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const btn = screen.getByRole('button', { name: /strikethrough/i });
    await user.click(btn);
    expect(onCommand).toHaveBeenCalledWith('app.format.strikethrough');
  });

  it('clicking Align left calls onCommand with app.format.alignment and left', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const btn = screen.getByRole('button', { name: /align left/i });
    await user.click(btn);
    expect(onCommand).toHaveBeenCalledWith('app.format.alignment', 'left');
  });

  it('clicking Align center calls onCommand with app.format.alignment and center', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const btn = screen.getByRole('button', { name: /align center/i });
    await user.click(btn);
    expect(onCommand).toHaveBeenCalledWith('app.format.alignment', 'center');
  });

  it('clicking Align right calls onCommand with app.format.alignment and right', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const btn = screen.getByRole('button', { name: /align right/i });
    await user.click(btn);
    expect(onCommand).toHaveBeenCalledWith('app.format.alignment', 'right');
  });

  it('clicking Justify calls onCommand with app.format.alignment and justify', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const btn = screen.getByRole('button', { name: /justify/i });
    await user.click(btn);
    expect(onCommand).toHaveBeenCalledWith('app.format.alignment', 'justify');
  });

  it('clicking Numbered list calls onCommand with app.format.list.numbered', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const btn = screen.getByRole('button', { name: /numbered list/i });
    await user.click(btn);
    expect(onCommand).toHaveBeenCalledWith('app.format.list.numbered');
  });

  it('clicking Bulleted list calls onCommand with app.format.list.bulleted', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const btn = screen.getByRole('button', { name: /bulleted list/i });
    await user.click(btn);
    expect(onCommand).toHaveBeenCalledWith('app.format.list.bulleted');
  });

  it('clicking Increase indent calls app.format.indent.right', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const btn = screen.getByRole('button', { name: /increase indent/i });
    await user.click(btn);
    expect(onCommand).toHaveBeenCalledWith('app.format.indent.right');
  });

  it('clicking Decrease indent calls app.format.indent.left', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const btn = screen.getByRole('button', { name: /decrease indent/i });
    await user.click(btn);
    expect(onCommand).toHaveBeenCalledWith('app.format.indent.left');
  });

  it('Bold button shows aria-pressed true when bold is active', () => {
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={{ bold: true }} />);
    const boldBtn = screen.getByRole('button', { name: /bold/i });
    expect(boldBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('Bold button shows aria-pressed false when bold is inactive', () => {
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={{ bold: false }} />);
    const boldBtn = screen.getByRole('button', { name: /bold/i });
    expect(boldBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('font size select change fires onCommand with halfPoints', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const select = screen.getByRole('combobox', { name: /font size/i });
    await user.selectOptions(select, '24');
    expect(onCommand).toHaveBeenCalledWith('app.format.fontSize', { halfPoints: 48 });
  });

  it('style picker change fires app.format.applyStyle', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={emptyFormatting} />);
    const select = screen.getByRole('combobox', { name: /paragraph style/i });
    await user.selectOptions(select, 'Heading1');
    expect(onCommand).toHaveBeenCalledWith('app.format.applyStyle', { styleId: 'Heading1' });
  });

  it('alignment button with active alignment shows aria-pressed true', () => {
    const onCommand = vi.fn();
    render(<FormattingToolbar onCommand={onCommand} activeFormatting={{ alignment: 'center' }} />);
    const centerBtn = screen.getByRole('button', { name: /align center/i });
    expect(centerBtn.getAttribute('aria-pressed')).toBe('true');
    const leftBtn = screen.getByRole('button', { name: /align left/i });
    expect(leftBtn.getAttribute('aria-pressed')).toBe('false');
  });
});

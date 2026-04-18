import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { FontDialog } from './FontDialog.js';

afterEach(() => {
  cleanup();
});

describe('FontDialog', () => {
  it('renders a dialog with aria-labelledby', () => {
    render(<FontDialog initialValues={{}} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('clicking OK calls onConfirm with current values', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <FontDialog
        initialValues={{ fontName: 'Arial', sizePt: 12 }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const okBtn = screen.getByRole('button', { name: /ok/i });
    await user.click(okBtn);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ fontName: 'Arial', sizePt: 12 }),
    );
  });

  it('clicking Cancel calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<FontDialog initialValues={{}} onConfirm={vi.fn()} onCancel={onCancel} />);
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });

  it('pressing Escape calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<FontDialog initialValues={{}} onConfirm={vi.fn()} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog');
    dialog.focus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('strikethrough checkbox toggles strikethrough in confirmed values', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <FontDialog
        initialValues={{ strikethrough: false }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: /strikethrough/i });
    await user.click(checkbox);
    const okBtn = screen.getByRole('button', { name: /ok/i });
    await user.click(okBtn);
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ strikethrough: true }));
  });
});

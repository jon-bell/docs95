import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { BulletsAndNumberingDialog } from './BulletsAndNumberingDialog.js';

afterEach(() => {
  cleanup();
});

describe('BulletsAndNumberingDialog', () => {
  it('renders a dialog with aria-labelledby', () => {
    render(<BulletsAndNumberingDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('has Bulleted and Numbered tabs', () => {
    render(<BulletsAndNumberingDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /bulleted/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /numbered/i })).toBeTruthy();
  });

  it('OK on Bulleted tab calls onConfirm with bullet kind', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<BulletsAndNumberingDialog onConfirm={onConfirm} onCancel={vi.fn()} />);

    const okBtn = screen.getByRole('button', { name: /ok/i });
    await user.click(okBtn);

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'bullet' }));
  });

  it('switching to Numbered and clicking OK calls onConfirm with numbering kind', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<BulletsAndNumberingDialog onConfirm={onConfirm} onCancel={vi.fn()} />);

    const numberedTab = screen.getByRole('tab', { name: /numbered/i });
    await user.click(numberedTab);

    const okBtn = screen.getByRole('button', { name: /ok/i });
    await user.click(okBtn);

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'numbering' }));
  });

  it('Cancel calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<BulletsAndNumberingDialog onConfirm={vi.fn()} onCancel={onCancel} />);

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelBtn);

    expect(onCancel).toHaveBeenCalled();
  });

  it('pressing Escape calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<BulletsAndNumberingDialog onConfirm={vi.fn()} onCancel={onCancel} />);

    const dialog = screen.getByRole('dialog');
    dialog.focus();
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
  });
});

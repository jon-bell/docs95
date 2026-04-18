import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ParagraphDialog } from './ParagraphDialog.js';

afterEach(() => {
  cleanup();
});

describe('ParagraphDialog', () => {
  it('renders a dialog with aria-labelledby', () => {
    render(<ParagraphDialog initialValues={{}} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('OK button confirms with current values', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ParagraphDialog
        initialValues={{ alignment: 'center', indentLeftTwips: 720 }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const okBtn = screen.getByRole('button', { name: /ok/i });
    await user.click(okBtn);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ alignment: 'center', indentLeftTwips: 720 }),
    );
  });

  it('Cancel calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ParagraphDialog initialValues={{}} onConfirm={vi.fn()} onCancel={onCancel} />);
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });

  it('pressing Escape calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ParagraphDialog initialValues={{}} onConfirm={vi.fn()} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog');
    dialog.focus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('alignment dropdown can be changed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ParagraphDialog
        initialValues={{ alignment: 'left' }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const alignmentSelect = screen.getByRole('combobox', { name: /alignment/i });
    await user.selectOptions(alignmentSelect, 'right');

    const okBtn = screen.getByRole('button', { name: /ok/i });
    await user.click(okBtn);
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ alignment: 'right' }));
  });
});

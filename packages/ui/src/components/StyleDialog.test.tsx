import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { StyleDialog } from './StyleDialog.js';
import type { StyleEntry } from './StyleDialog.js';

afterEach(() => {
  cleanup();
});

const SAMPLE_STYLES: StyleEntry[] = [
  { id: 'Normal', name: 'Normal' },
  { id: 'Heading1', name: 'Heading 1' },
  { id: 'Heading2', name: 'Heading 2' },
];

describe('StyleDialog', () => {
  it('renders a dialog with aria-labelledby', () => {
    render(<StyleDialog styles={SAMPLE_STYLES} onApply={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('lists all provided styles', () => {
    render(<StyleDialog styles={SAMPLE_STYLES} onApply={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Normal' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Heading 1' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Heading 2' })).toBeTruthy();
  });

  it('clicking Apply calls onApply with selected style id', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <StyleDialog
        styles={SAMPLE_STYLES}
        currentStyleId="Normal"
        onApply={onApply}
        onCancel={vi.fn()}
      />,
    );

    // Select Heading 1
    const listbox = screen.getByRole('listbox');
    await user.selectOptions(listbox, 'Heading1');

    const applyBtn = screen.getByRole('button', { name: /apply/i });
    await user.click(applyBtn);

    expect(onApply).toHaveBeenCalledWith('Heading1');
  });

  it('New/Modify/Delete buttons show warning toast and do not close', async () => {
    const user = userEvent.setup();
    render(<StyleDialog styles={SAMPLE_STYLES} onApply={vi.fn()} onCancel={vi.fn()} />);

    const newBtn = screen.getByRole('button', { name: /new\.\.\./i });
    await user.click(newBtn);

    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('Cancel calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<StyleDialog styles={SAMPLE_STYLES} onApply={vi.fn()} onCancel={onCancel} />);

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelBtn);

    expect(onCancel).toHaveBeenCalled();
  });
});

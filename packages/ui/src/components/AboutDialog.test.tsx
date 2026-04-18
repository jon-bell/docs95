import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { AboutDialog } from './AboutDialog.js';

afterEach(() => {
  cleanup();
});

describe('AboutDialog', () => {
  it('renders the title, version, and tagline', () => {
    render(<AboutDialog version="1.2.3" onClose={() => {}} />);

    // The dialog title is "About Word" (in the title bar element).
    expect(screen.getByRole('dialog', { name: 'About Word' })).toBeDefined();

    // Version string appears in the body.
    expect(screen.getByText('Version 1.2.3')).toBeDefined();

    // Tagline.
    expect(
      screen.getByText('A desktop word processor with feature parity to Microsoft Word 95.'),
    ).toBeDefined();
  });

  it('calls onClose when the OK button is clicked', () => {
    const onClose = vi.fn();
    render(<AboutDialog version="0.1.1" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<AboutDialog version="0.1.1" onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'About Word' }), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has aria-modal="true" on the dialog element', () => {
    render(<AboutDialog version="0.1.1" onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'About Word' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
});

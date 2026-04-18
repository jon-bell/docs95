import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { FindReplaceDialog } from './FindReplaceDialog.js';

afterEach(() => {
  cleanup();
});

describe('FindReplaceDialog', () => {
  it('renders a dialog with aria-labelledby', () => {
    const onCommand = vi.fn();
    render(<FindReplaceDialog onCommand={onCommand} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('has Find and Replace tabs', () => {
    const onCommand = vi.fn();
    render(<FindReplaceDialog onCommand={onCommand} onClose={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /find/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /replace/i })).toBeTruthy();
  });

  it('typing query and clicking Find Next dispatches app.edit.findNext with query', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FindReplaceDialog onCommand={onCommand} onClose={vi.fn()} />);

    const queryInput = screen.getByLabelText(/find what/i);
    await user.clear(queryInput);
    await user.type(queryInput, 'hello');

    const findNextBtn = screen.getByRole('button', { name: /find next/i });
    await user.click(findNextBtn);

    expect(onCommand).toHaveBeenCalledWith('app.edit.findNext', {
      query: 'hello',
      options: { matchCase: false, wholeWord: false, regex: false },
    });
  });

  it('clicking Find Previous dispatches app.edit.findPrev', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FindReplaceDialog onCommand={onCommand} onClose={vi.fn()} />);

    const queryInput = screen.getByLabelText(/find what/i);
    await user.type(queryInput, 'world');

    const findPrevBtn = screen.getByRole('button', { name: /find previous/i });
    await user.click(findPrevBtn);

    expect(onCommand).toHaveBeenCalledWith('app.edit.findPrev', {
      query: 'world',
      options: { matchCase: false, wholeWord: false, regex: false },
    });
  });

  it('switching to Replace tab shows replacement field', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FindReplaceDialog onCommand={onCommand} onClose={vi.fn()} />);

    const replaceTab = screen.getByRole('tab', { name: /replace/i });
    await user.click(replaceTab);

    expect(screen.getByLabelText(/replace with/i)).toBeTruthy();
  });

  it('Replace All from Replace tab dispatches app.edit.replaceAll with query and replacement', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FindReplaceDialog initialTab="replace" onCommand={onCommand} onClose={vi.fn()} />);

    const queryInput = screen.getByLabelText(/find what/i);
    await user.clear(queryInput);
    await user.type(queryInput, 'foo');

    const replacementInput = screen.getByLabelText(/replace with/i);
    await user.clear(replacementInput);
    await user.type(replacementInput, 'bar');

    const replaceAllBtn = screen.getByRole('button', { name: /replace all/i });
    await user.click(replaceAllBtn);

    expect(onCommand).toHaveBeenCalledWith('app.edit.replaceAll', {
      query: 'foo',
      replacement: 'bar',
      options: { matchCase: false, wholeWord: false, regex: false },
    });
  });

  it('Replace button in Replace tab dispatches app.edit.replace', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FindReplaceDialog initialTab="replace" onCommand={onCommand} onClose={vi.fn()} />);

    const queryInput = screen.getByLabelText(/find what/i);
    await user.type(queryInput, 'cat');

    const replaceBtn = screen.getByRole('button', { name: /^replace$/i });
    await user.click(replaceBtn);

    expect(onCommand).toHaveBeenCalledWith('app.edit.replace', {
      query: 'cat',
      replacement: '',
      options: { matchCase: false, wholeWord: false, regex: false },
    });
  });

  it('matchCase checkbox toggles option', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<FindReplaceDialog onCommand={onCommand} onClose={vi.fn()} />);

    const matchCaseCheckbox = screen.getByRole('checkbox', { name: /match case/i });
    await user.click(matchCaseCheckbox);

    const queryInput = screen.getByLabelText(/find what/i);
    await user.type(queryInput, 'test');

    const findNextBtn = screen.getByRole('button', { name: /find next/i });
    await user.click(findNextBtn);

    expect(onCommand).toHaveBeenCalledWith('app.edit.findNext', {
      query: 'test',
      options: { matchCase: true, wholeWord: false, regex: false },
    });
  });

  it('pressing Escape calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCommand = vi.fn();
    render(<FindReplaceDialog onCommand={onCommand} onClose={onClose} />);

    const dialog = screen.getByRole('dialog');
    dialog.focus();
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('dialog is not modal (aria-modal false)', () => {
    const onCommand = vi.fn();
    render(<FindReplaceDialog onCommand={onCommand} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
  });
});

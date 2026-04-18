import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKeyboardDispatcher } from './dispatcher.js';

function fireKeydown(
  target: EventTarget,
  key: string,
  opts: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): void {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
}

describe('createKeyboardDispatcher — formatting shortcuts', () => {
  let onCommand: ReturnType<typeof vi.fn>;
  let dispose: () => void;

  beforeEach(() => {
    onCommand = vi.fn();
    const dispatcher = createKeyboardDispatcher({ onCommand });
    dispose = dispatcher.dispose;
  });

  afterEach(() => {
    dispose();
    onCommand.mockReset();
  });

  it('Ctrl+B dispatches app.format.bold', () => {
    fireKeydown(window, 'B', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.format.bold');
  });

  it('Ctrl+I dispatches app.format.italic', () => {
    fireKeydown(window, 'I', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.format.italic');
  });

  it('Ctrl+U dispatches app.format.underline', () => {
    fireKeydown(window, 'U', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.format.underline');
  });

  it('Ctrl+F dispatches app.edit.find', () => {
    fireKeydown(window, 'F', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.edit.find');
  });

  it('Ctrl+H dispatches app.edit.replace', () => {
    fireKeydown(window, 'H', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.edit.replace');
  });

  it('Ctrl+E dispatches app.format.alignment with center', () => {
    fireKeydown(window, 'E', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.format.alignment', 'center');
  });

  it('Ctrl+R dispatches app.format.alignment with right', () => {
    fireKeydown(window, 'R', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.format.alignment', 'right');
  });

  it('Ctrl+L dispatches app.format.alignment with left', () => {
    fireKeydown(window, 'L', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.format.alignment', 'left');
  });

  it('Ctrl+J dispatches app.format.alignment with justify', () => {
    fireKeydown(window, 'J', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.format.alignment', 'justify');
  });

  it('Ctrl+B inside an input does not dispatch', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKeydown(input, 'B', { ctrlKey: true });
    expect(onCommand).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});

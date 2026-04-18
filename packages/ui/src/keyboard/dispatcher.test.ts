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

describe('createKeyboardDispatcher', () => {
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

  it('Ctrl+O on window calls onCommand with app.file.open', () => {
    fireKeydown(window, 'O', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.file.open');
  });

  it('Ctrl+N calls app.file.new', () => {
    fireKeydown(window, 'N', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.file.new');
  });

  it('Ctrl+S calls app.file.save', () => {
    fireKeydown(window, 'S', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.file.save');
  });

  it('Ctrl+Shift+S calls app.file.saveAs', () => {
    fireKeydown(window, 'S', { ctrlKey: true, shiftKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.file.saveAs');
  });

  it('Ctrl+P calls app.file.print', () => {
    fireKeydown(window, 'P', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.file.print');
  });

  it('Ctrl+Z calls app.edit.undo', () => {
    fireKeydown(window, 'Z', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.edit.undo');
  });

  it('Ctrl+Y calls app.edit.redo', () => {
    fireKeydown(window, 'Y', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.edit.redo');
  });

  it('Ctrl+X calls app.edit.cut', () => {
    fireKeydown(window, 'X', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.edit.cut');
  });

  it('Ctrl+C calls app.edit.copy', () => {
    fireKeydown(window, 'C', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.edit.copy');
  });

  it('Ctrl+V calls app.edit.paste', () => {
    fireKeydown(window, 'V', { ctrlKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.edit.paste');
  });

  it('Alt+F4 calls app.file.exit', () => {
    fireKeydown(window, 'F4', { altKey: true });
    expect(onCommand).toHaveBeenCalledWith('app.file.exit');
  });

  it('Ctrl+O inside an input does NOT call onCommand', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKeydown(input, 'O', { ctrlKey: true });
    expect(onCommand).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('Ctrl+O inside a textarea does NOT call onCommand', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    fireKeydown(ta, 'O', { ctrlKey: true });
    expect(onCommand).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it('dispose removes the listener', () => {
    dispose();
    fireKeydown(window, 'O', { ctrlKey: true });
    expect(onCommand).not.toHaveBeenCalled();
    // Set dispose to a no-op so afterEach doesn't double-dispose
    dispose = () => undefined;
  });
});

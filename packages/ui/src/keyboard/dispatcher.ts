export interface KeyboardDispatcherOptions {
  readonly onCommand: (commandId: string, params?: unknown) => void;
}

export interface KeyboardDispatcher {
  dispose(): void;
}

/** Targets that receive keydown events and should suppress global accelerators. */
function isInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Maps keyboard accelerators to command ids and calls onCommand.
 * Does not swallow keys while focus is in an input element.
 * Handles Alt+F4 by emitting a command (the main process handles the actual quit).
 */
export function createKeyboardDispatcher(options: KeyboardDispatcherOptions): KeyboardDispatcher {
  const { onCommand } = options;

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (isInputTarget(e.target)) return;

    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
    const ctrlShift = e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey;
    const altOnly = e.altKey && !e.ctrlKey && !e.metaKey;

    // Alt+F4 — emit command, let main process handle quit
    if (altOnly && e.key === 'F4') {
      e.preventDefault();
      onCommand('app.file.exit');
      return;
    }

    if (ctrlShift) {
      if (e.key === 'S' || e.key === 's') {
        e.preventDefault();
        onCommand('app.file.saveAs');
        return;
      }
    }

    if (ctrl) {
      switch (e.key.toUpperCase()) {
        case 'N':
          e.preventDefault();
          onCommand('app.file.new');
          return;
        case 'O':
          e.preventDefault();
          onCommand('app.file.open');
          return;
        case 'S':
          e.preventDefault();
          onCommand('app.file.save');
          return;
        case 'P':
          e.preventDefault();
          onCommand('app.file.print');
          return;
        case 'Z':
          e.preventDefault();
          onCommand('app.edit.undo');
          return;
        case 'Y':
          e.preventDefault();
          onCommand('app.edit.redo');
          return;
        case 'X':
          e.preventDefault();
          onCommand('app.edit.cut');
          return;
        case 'C':
          e.preventDefault();
          onCommand('app.edit.copy');
          return;
        case 'V':
          e.preventDefault();
          onCommand('app.edit.paste');
          return;
        case 'B':
          e.preventDefault();
          onCommand('app.format.bold');
          return;
        case 'I':
          e.preventDefault();
          onCommand('app.format.italic');
          return;
        case 'U':
          e.preventDefault();
          onCommand('app.format.underline');
          return;
        case 'F':
          e.preventDefault();
          onCommand('app.edit.find');
          return;
        case 'H':
          e.preventDefault();
          onCommand('app.edit.replace');
          return;
        case 'E':
          e.preventDefault();
          onCommand('app.format.alignment', 'center');
          return;
        case 'R':
          e.preventDefault();
          onCommand('app.format.alignment', 'right');
          return;
        case 'L':
          e.preventDefault();
          onCommand('app.format.alignment', 'left');
          return;
        case 'J':
          e.preventDefault();
          onCommand('app.format.alignment', 'justify');
          return;
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  return {
    dispose(): void {
      window.removeEventListener('keydown', handleKeyDown);
    },
  };
}

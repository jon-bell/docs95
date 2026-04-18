import React from 'react';

export interface ImeSurfaceProps {
  /** Caret position in viewport coordinates. */
  readonly caretX: number;
  readonly caretY: number;
  /** Called on beforeinput events (non-composition direct input). */
  readonly onBeforeInput?: (event: InputEvent) => void;
  readonly onCompositionStart?: (event: CompositionEvent) => void;
  readonly onCompositionUpdate?: (event: CompositionEvent) => void;
  readonly onCompositionEnd?: (event: CompositionEvent) => void;
}

/**
 * Hidden contentEditable surface used exclusively as an IME intake point.
 * Positioned at the logical caret location so the OS positions the IME
 * candidate window correctly.
 *
 * Must never be used as the primary document editing surface — the layout
 * engine owns document content. This element is aria-hidden.
 */
export const ImeSurface = React.forwardRef<HTMLSpanElement, ImeSurfaceProps>(function ImeSurface(
  { caretX, caretY, onBeforeInput, onCompositionStart, onCompositionUpdate, onCompositionEnd },
  ref,
) {
  const handleBeforeInput = React.useCallback(
    (e: React.FormEvent<HTMLSpanElement>) => {
      if (onBeforeInput !== undefined) {
        onBeforeInput(e.nativeEvent as InputEvent);
      }
    },
    [onBeforeInput],
  );

  const handleCompositionStart = React.useCallback(
    (e: React.CompositionEvent<HTMLSpanElement>) => {
      if (onCompositionStart !== undefined) {
        onCompositionStart(e.nativeEvent);
      }
    },
    [onCompositionStart],
  );

  const handleCompositionUpdate = React.useCallback(
    (e: React.CompositionEvent<HTMLSpanElement>) => {
      if (onCompositionUpdate !== undefined) {
        onCompositionUpdate(e.nativeEvent);
      }
    },
    [onCompositionUpdate],
  );

  const handleCompositionEnd = React.useCallback(
    (e: React.CompositionEvent<HTMLSpanElement>) => {
      // Clear the surface content after composition ends to prevent
      // stale characters from accumulating.
      const target = e.currentTarget;
      if (onCompositionEnd !== undefined) {
        onCompositionEnd(e.nativeEvent);
      }
      // Defer clear so the handler can read compositionend data first.
      Promise.resolve().then(() => {
        if (target.textContent !== '') {
          target.textContent = '';
        }
      });
    },
    [onCompositionEnd],
  );

  return (
    <span
      ref={ref}
      aria-hidden="true"
      // contentEditable is the ONLY place this attribute is used in render.
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      data-ime-surface="true"
      onBeforeInput={handleBeforeInput}
      onCompositionStart={handleCompositionStart}
      onCompositionUpdate={handleCompositionUpdate}
      onCompositionEnd={handleCompositionEnd}
      style={{
        position: 'fixed',
        left: caretX,
        top: caretY,
        width: 1,
        height: 1,
        overflow: 'hidden',
        outline: 'none',
        caretColor: 'transparent',
        opacity: 0,
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    />
  );
});

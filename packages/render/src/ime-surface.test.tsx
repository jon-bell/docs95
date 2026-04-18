import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { ImeSurface } from './ime-surface.js';

describe('ImeSurface', () => {
  it('renders a contenteditable span', () => {
    const { container } = render(<ImeSurface caretX={10} caretY={20} />);
    const el = container.querySelector('[data-ime-surface]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.getAttribute('contenteditable')).toBe('true');
  });

  it('is aria-hidden', () => {
    const { container } = render(<ImeSurface caretX={0} caretY={0} />);
    const el = container.querySelector('[data-ime-surface]');
    expect(el!.getAttribute('aria-hidden')).toBe('true');
  });

  it('is positioned fixed at caretX and caretY', () => {
    const { container } = render(<ImeSurface caretX={42} caretY={99} />);
    const el = container.querySelector('[data-ime-surface]') as HTMLElement;
    expect(el.style.position).toBe('fixed');
    expect(el.style.left).toBe('42px');
    expect(el.style.top).toBe('99px');
  });

  it('forwards compositionstart events', () => {
    const onStart = vi.fn();
    const { container } = render(<ImeSurface caretX={0} caretY={0} onCompositionStart={onStart} />);
    const el = container.querySelector('[data-ime-surface]') as HTMLElement;
    fireEvent.compositionStart(el);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('forwards compositionupdate events', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <ImeSurface caretX={0} caretY={0} onCompositionUpdate={onUpdate} />,
    );
    const el = container.querySelector('[data-ime-surface]') as HTMLElement;
    fireEvent.compositionUpdate(el);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('forwards compositionend events', () => {
    const onEnd = vi.fn();
    const { container } = render(<ImeSurface caretX={0} caretY={0} onCompositionEnd={onEnd} />);
    const el = container.querySelector('[data-ime-surface]') as HTMLElement;
    fireEvent.compositionEnd(el);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('exposes a ref to the underlying span', () => {
    const ref = React.createRef<HTMLSpanElement>();
    render(<ImeSurface caretX={0} caretY={0} ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.tagName).toBe('SPAN');
  });

  it('has spellCheck attribute set to false', () => {
    const { container } = render(<ImeSurface caretX={0} caretY={0} />);
    const el = container.querySelector('[data-ime-surface]') as HTMLSpanElement;
    // React renders spellCheck={false} as spellcheck="false" attribute in jsdom.
    expect(el.getAttribute('spellcheck')).toBe('false');
  });
});

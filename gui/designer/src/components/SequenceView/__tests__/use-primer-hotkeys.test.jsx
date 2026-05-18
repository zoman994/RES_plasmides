/**
 * use-primer-hotkeys.test.jsx — Игорь 18.05.2026: «в сиквенс вивере
 * горячие клавиши с праймерами так же должны работать».
 *
 * Ctrl+R (pcr-primer-forward) / Ctrl+Alt+R (pcr-primer-reverse) route
 * the current selection through requestWritePrimer (→ the same modal
 * the right-click «primer» item opens). No-op without a selection or
 * without a write channel (consumer-gated, mirrors usePieceHotkey).
 */
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { runHotkeyResolver } from '../../../lib/hotkeys';
import { usePrimerHotkeys } from '../hooks/usePrimerHotkeys';

afterEach(cleanup);

function Host(props) {
  usePrimerHotkeys(props);
  return null;
}

const press = (alt) => {
  const ev = {
    ctrlKey: true, altKey: !!alt, shiftKey: false, metaKey: false,
    key: 'r', code: 'KeyR',
    target: document.body,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
  act(() => { runHotkeyResolver(ev); });
};
const pressFwd = () => press(false);
const pressRev = () => press(true);

describe('usePrimerHotkeys', () => {
  it('Ctrl+R → requestWritePrimer(forward) with the normalized range', () => {
    const requestWritePrimer = vi.fn();
    render(
      <Host
        onWritePrimer={() => {}}
        requestWritePrimer={requestWritePrimer}
        caretAnchor={120}
        caretPos={40}
      />,
    );
    pressFwd();
    expect(requestWritePrimer).toHaveBeenCalledWith({
      direction: 'forward', start: 40, end: 120,
    });
  });

  it('Ctrl+Alt+R → requestWritePrimer(reverse)', () => {
    const requestWritePrimer = vi.fn();
    render(
      <Host
        onWritePrimer={() => {}}
        requestWritePrimer={requestWritePrimer}
        caretAnchor={10}
        caretPos={30}
      />,
    );
    pressRev();
    expect(requestWritePrimer).toHaveBeenCalledWith({
      direction: 'reverse', start: 10, end: 30,
    });
  });

  it('no selection (anchor === pos) → no-op', () => {
    const requestWritePrimer = vi.fn();
    render(
      <Host
        onWritePrimer={() => {}}
        requestWritePrimer={requestWritePrimer}
        caretAnchor={50}
        caretPos={50}
      />,
    );
    pressFwd();
    expect(requestWritePrimer).not.toHaveBeenCalled();
  });

  it('no onWritePrimer (read-only consumer) → no-op', () => {
    const requestWritePrimer = vi.fn();
    render(
      <Host
        onWritePrimer={undefined}
        requestWritePrimer={requestWritePrimer}
        caretAnchor={10}
        caretPos={30}
      />,
    );
    pressFwd();
    expect(requestWritePrimer).not.toHaveBeenCalled();
  });

  it('no requestWritePrimer → no-op (no throw)', () => {
    render(
      <Host onWritePrimer={() => {}} requestWritePrimer={undefined} caretAnchor={1} caretPos={9} />,
    );
    expect(() => pressFwd()).not.toThrow();
  });

  it('unregisters on unmount (resolver no-op)', () => {
    const requestWritePrimer = vi.fn();
    const { unmount } = render(
      <Host
        onWritePrimer={() => {}}
        requestWritePrimer={requestWritePrimer}
        caretAnchor={1}
        caretPos={9}
      />,
    );
    unmount();
    pressFwd();
    expect(requestWritePrimer).not.toHaveBeenCalled();
  });
});

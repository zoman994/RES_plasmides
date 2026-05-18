/**
 * use-piece-hotkey.test.jsx — T5 K3. The «P» hotkey fires onCreatePiece
 * for the current selection; no-op without selection / without the
 * consumer callback (DEC-T5-13 lifecycle-scoped).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { runHotkeyResolver } from '../../../lib/hotkeys';
import { usePieceHotkey } from '../hooks/usePieceHotkey';

afterEach(cleanup);

function Host({ onCreatePiece, caretAnchor, caretPos }) {
  usePieceHotkey({ onCreatePiece, caretAnchor, caretPos });
  return null;
}
const pressP = () => {
  const ev = {
    ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
    key: 'p', code: 'KeyP',
    target: document.body,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
  act(() => { runHotkeyResolver(ev); });
};

describe('T5 K3 usePieceHotkey', () => {
  it('fires onCreatePiece with the normalized selection range', () => {
    const onCreatePiece = vi.fn();
    render(<Host onCreatePiece={onCreatePiece} caretAnchor={120} caretPos={40} />);
    pressP();
    expect(onCreatePiece).toHaveBeenCalledWith({
      origin: 'selection', rangeStart: 40, rangeEnd: 120, orientation: 'forward',
    });
  });

  it('no selection (anchor === pos) → no-op', () => {
    const onCreatePiece = vi.fn();
    render(<Host onCreatePiece={onCreatePiece} caretAnchor={50} caretPos={50} />);
    pressP();
    expect(onCreatePiece).not.toHaveBeenCalled();
  });

  it('no consumer callback → no-op (no throw)', () => {
    render(<Host onCreatePiece={undefined} caretAnchor={10} caretPos={30} />);
    expect(() => pressP()).not.toThrow();
  });

  it('unregisters on unmount (handler gone → resolver no-op)', () => {
    const onCreatePiece = vi.fn();
    const { unmount } = render(<Host onCreatePiece={onCreatePiece} caretAnchor={1} caretPos={9} />);
    unmount();
    pressP();
    expect(onCreatePiece).not.toHaveBeenCalled();
  });
});

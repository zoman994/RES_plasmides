/**
 * use-primer-hotkeys.test.jsx — Игорь 18.05.2026: «в сиквенс вивере
 * горячие клавиши с праймерами так же должны работать».
 *
 * PRIMER-LIVE-1 changed what these keys DO. They used to open the review
 * modal, which meant the fastest way to make a primer still cost a dialog:
 * the user had already chosen the strand and already chosen the bases, and
 * the dialog asked them both again. Now Ctrl+R / Ctrl+Alt+R WRITE.
 *
 * The old expectation — «Ctrl+R routes through requestWritePrimer» — is
 * therefore obsolete, and is replaced here by the stronger one: the write
 * channel is called with the host's fully-built draft, and the modal path is
 * NOT taken. The modal remains for editing, which is a different intent.
 */
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import {
  _clearHandlersForTests, registerHandler, runHotkeyResolver,
} from '../../../lib/hotkeys';
import { usePrimerHotkeys } from '../hooks/usePrimerHotkeys';

afterEach(() => {
  cleanup();
  _clearHandlersForTests();
});

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
  it('Ctrl+R WRITES a forward primer for the normalized selection', () => {
    const onWritePrimer = vi.fn();
    render(<Host onWritePrimer={onWritePrimer} caretAnchor={120} caretPos={40} />);
    pressFwd();
    expect(onWritePrimer).toHaveBeenCalledWith({
      direction: 'forward', start: 40, end: 120,
    });
  });

  it('Ctrl+Alt+R WRITES a reverse primer', () => {
    const onWritePrimer = vi.fn();
    render(<Host onWritePrimer={onWritePrimer} caretAnchor={10} caretPos={30} />);
    pressRev();
    expect(onWritePrimer).toHaveBeenCalledWith({
      direction: 'reverse', start: 10, end: 30,
    });
  });

  it('writes the canonical monotonic range for an origin-crossing selection', () => {
    const onWritePrimer = vi.fn();
    render(
      <Host
        onWritePrimer={onWritePrimer}
        caretAnchor={-287}
        caretPos={13}
        selectionRange={{
          start: 2399, end: 2699, length: 300, wrapsOrigin: true,
        }}
      />,
    );
    pressFwd();
    expect(onWritePrimer).toHaveBeenCalledWith({
      direction: 'forward', start: 2399, end: 2699,
    });
  });

  it('hands over the HOST-built draft when the host can build one', () => {
    // The host owns the sequence, so only it can turn a range into an anchored
    // record. The hook must forward that draft verbatim rather than a bare range.
    const onWritePrimer = vi.fn();
    const buildPrimerDraft = vi.fn(({ direction, start, end }) => ({
      direction, start, end, sequence: 'ACGT', binding: 'ACGT', tail: '', sites: [{ id: 's' }],
    }));
    render(
      <Host
        onWritePrimer={onWritePrimer}
        buildPrimerDraft={buildPrimerDraft}
        caretAnchor={40}
        caretPos={48}
      />,
    );
    pressFwd();
    expect(buildPrimerDraft).toHaveBeenCalledWith({ direction: 'forward', start: 40, end: 48 });
    expect(onWritePrimer).toHaveBeenCalledWith(expect.objectContaining({
      sequence: 'ACGT', sites: [{ id: 's' }],
    }));
  });

  it('does NOT open the review modal — the key is a write, not a dialog', () => {
    const requestWritePrimer = vi.fn();
    render(
      <Host
        onWritePrimer={vi.fn()}
        requestWritePrimer={requestWritePrimer}
        caretAnchor={10}
        caretPos={30}
      />,
    );
    pressFwd();
    pressRev();
    expect(requestWritePrimer).not.toHaveBeenCalled();
  });

  it('writes nothing when the host says this range yields no primer', () => {
    const onWritePrimer = vi.fn();
    render(
      <Host
        onWritePrimer={onWritePrimer}
        buildPrimerDraft={() => null}
        caretAnchor={10}
        caretPos={30}
      />,
    );
    pressFwd();
    expect(onWritePrimer).not.toHaveBeenCalled();
  });

  it('no selection (anchor === pos) → no-op', () => {
    const onWritePrimer = vi.fn();
    render(<Host onWritePrimer={onWritePrimer} caretAnchor={50} caretPos={50} />);
    pressFwd();
    expect(onWritePrimer).not.toHaveBeenCalled();
  });

  it('no onWritePrimer (read-only consumer) → no-op (no throw)', () => {
    render(<Host onWritePrimer={undefined} caretAnchor={10} caretPos={30} />);
    expect(() => pressFwd()).not.toThrow();
  });

  it('unregisters on unmount (resolver no-op)', () => {
    const onWritePrimer = vi.fn();
    const { unmount } = render(
      <Host onWritePrimer={onWritePrimer} caretAnchor={1} caretPos={9} />,
    );
    unmount();
    pressFwd();
    expect(onWritePrimer).not.toHaveBeenCalled();
  });

  it('a read-only nested viewer hands Ctrl+R back to the underlying writer on unmount', () => {
    const underlyingWriter = vi.fn();
    const unregisterUnderlying = registerHandler('pcr-primer-forward', underlyingWriter);
    const { unmount } = render(
      <Host onWritePrimer={undefined} caretAnchor={1} caretPos={9} />,
    );

    pressFwd();
    expect(underlyingWriter).not.toHaveBeenCalled();
    unmount();
    pressFwd();
    expect(underlyingWriter).toHaveBeenCalledTimes(1);
    unregisterUnderlying();
  });
});

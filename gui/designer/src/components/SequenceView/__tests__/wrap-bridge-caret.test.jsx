/**
 * wrap-bridge-caret.test.jsx — M-X.5 hotfix #2 (07.05.2026).
 *
 * SelectionOverlay round-13 (06.05.2026) handles the bridge wrap-half
 * (the row carrying `data-wraps-origin="true"` whose cols
 * [wrapAt..cpl) physically continue plasmid coords [0..cpl-wrapAt)
 * past the orange origin divider). Round-10 folded the trailing
 * wrap-tail into this bridge row; CaretOverlay was still looking for
 * vanished `data-wraptail-kind="trailing-wrap"` rows for any caretPos
 * > seqLength → caret stayed invisible / stuck on the last main
 * position.
 *
 * The fix mirrors SelectionOverlay's bridge lookup: when the
 * extended-domain caretPos is in (seqLength, seqLength + (cpl - wrapAt)],
 * render directly on the bridge row at column wrapAt + (caretPos -
 * seqLength).
 *
 * Test approach — direct CaretOverlay unit. Build a minimal scaffold
 * with three rows tagged `data-wraptail-kind` + the bridge row's
 * `data-wraps-origin / data-wrap-at` attributes; assert the rendered
 * caret box's translate3d() X coordinate against the expected
 * column.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { useRef, useEffect, useState } from 'react';
import CaretOverlay from '../overlays/CaretOverlay';
import { LABEL_WIDTH } from '../constants.js';

const CHARS_PER_LINE = 20;
const SEQ_LEN = 100;
const WRAP_AT = 12;
const CHAR_PX = 7.2;

// Three rows: leading-wrap → main (with bridge) → trailing-wrap.
// Each row has the strand sub-elements CaretOverlay reads when
// computing top/height. Container is the parent div with ref.
function Scaffold({ caretPos, charsPerLine = CHARS_PER_LINE, seqLength = SEQ_LEN }) {
  const ref = useRef(null);
  // React 19 effect ordering: child useLayoutEffect (CaretOverlay)
  // runs before parent ref attachment is observable from inside the
  // child. Force a second mount via a `mounted` state flag so
  // CaretOverlay's effect re-runs with a populated containerRef.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Bridge line covers [80..100) plus wrap-half showing [0..8) at
  // cols [12..20). lineStart=80, wrapAt=12. Trailing-wrap row also
  // exists per round-12 — covers plasmid coord 8 onwards (after
  // bridge wrap-half) at lineStart=8.
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Leading wrap row — covers plasmid [80..100) shifted negative */}
      <div
        data-testid="sequence-view-line"
        data-wraptail-kind="leading-wrap"
        data-line-start="80"
        style={{ position: 'relative', height: 18 }}
      >
        <div data-testid="sequence-view-strands-top" style={{ height: 9 }} />
        <div data-testid="sequence-view-strands-bottom" style={{ height: 9 }} />
      </div>
      {/* Main band — last main row is the bridge */}
      <div
        data-testid="sequence-view-line"
        data-wraptail-kind="main"
        data-line-start="0"
        style={{ position: 'relative', height: 18 }}
      >
        <div data-testid="sequence-view-strands-top" style={{ height: 9 }} />
        <div data-testid="sequence-view-strands-bottom" style={{ height: 9 }} />
      </div>
      <div
        data-testid="sequence-view-line"
        data-wraptail-kind="main"
        data-wraps-origin="true"
        data-wrap-at={String(WRAP_AT)}
        data-line-start="80"
        style={{ position: 'relative', height: 18 }}
      >
        <div data-testid="sequence-view-strands-top" style={{ height: 9 }} />
        <div data-testid="sequence-view-strands-bottom" style={{ height: 9 }} />
      </div>
      {/* Trailing wrap row — restored by round-12 BELOW the bridge */}
      <div
        data-testid="sequence-view-line"
        data-wraptail-kind="trailing-wrap"
        data-line-start="8"
        style={{ position: 'relative', height: 18 }}
      >
        <div data-testid="sequence-view-strands-top" style={{ height: 9 }} />
        <div data-testid="sequence-view-strands-bottom" style={{ height: 9 }} />
      </div>
      {mounted ? (
        <CaretOverlay
          caretPos={caretPos}
          charPx={CHAR_PX}
          containerRef={ref}
          showBottomStrand
          seqLength={seqLength}
          charsPerLine={charsPerLine}
        />
      ) : null}
    </div>
  );
}

beforeEach(() => {
  // happy-dom returns 0 for offsetTop/offsetLeft/offsetHeight by
  // default — stub them so CaretOverlay's measureStrandBand math
  // produces non-zero values.
  Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get() { return 0; },
  });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get() { return 0; },
  });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() { return 18; },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function renderAndWait(scaffold) {
  render(scaffold);
  // Scaffold uses a `mounted` flag to defer CaretOverlay's mount by
  // one tick — that gives the parent ref time to attach (React 19
  // child-effects-before-parent-ref ordering). waitFor polls until
  // the caret appears (or fails after 1s).
  return waitFor(() => {
    const caret = screen.queryByTestId('sequence-view-caret');
    expect(caret).toBeTruthy();
    return caret;
  }, { timeout: 1000 });
}

describe('M-X.5 hotfix #2 — CaretOverlay bridge wrap-half', () => {
  it('1) renders caret on bridge wrap-half when caretPos > seqLength (in wrap-half range)', async () => {
    // caretPos = 105 → wrap offset 5 from plasmid start → bridge col
    // wrapAt + 5 = 17. Expected translate3d X = (LABEL_WIDTH + 17) ×
    // CHAR_PX.
    const caret = await renderAndWait(<Scaffold caretPos={105} />);
    expect(caret.getAttribute('data-caret-pos')).toBe('105');
    const transform = caret.style.transform || '';
    const expectedX = (LABEL_WIDTH + 17) * CHAR_PX;
    expect(transform).toContain(`translate3d(${expectedX}px,`);
  });

  it('2) caret in main row unchanged for caretPos in [0, seqLength]', async () => {
    // caretPos = 50 → main row, lineStart=0, offsetCh=50. The caret
    // resolves on the second main row (lineStart=0, since 80>50 break
    // and target stays the row with start=0). Expected X = (LABEL_WIDTH
    // + 50) × CHAR_PX.
    const caret = await renderAndWait(<Scaffold caretPos={50} />);
    const transform = caret.style.transform || '';
    const expectedX = (LABEL_WIDTH + 50) * CHAR_PX;
    expect(transform).toContain(`translate3d(${expectedX}px,`);
  });

  it('3) caret falls back to legacy trailing-wrap row when wrap offset exceeds bridge wrap-half', async () => {
    // bridge wrap-half range = cpl - wrapAt = 20 - 12 = 8 chars. So
    // caretPos > seqLength + 8 = 108 means we hop into the legacy
    // trailing-wrap row that round-12 restored. caretPos = 110 →
    // realPos = 110 - 100 = 10; trailing-wrap row at lineStart=8
    // covers it (offsetCh = 10 - 8 = 2). Expected X = (LABEL_WIDTH + 2)
    // × CHAR_PX.
    const caret = await renderAndWait(<Scaffold caretPos={110} />);
    const transform = caret.style.transform || '';
    const expectedX = (LABEL_WIDTH + 2) * CHAR_PX;
    expect(transform).toContain(`translate3d(${expectedX}px,`);
  });

  it('4) caret in leading-wrap unchanged for caretPos < 0 (regression guard)', async () => {
    // caretPos = -5 → realPos = -5 + 100 = 95 → leading-wrap row at
    // lineStart=80 covers it (offsetCh = 95 - 80 = 15). Expected X =
    // (LABEL_WIDTH + 15) × CHAR_PX.
    const caret = await renderAndWait(<Scaffold caretPos={-5} />);
    const transform = caret.style.transform || '';
    const expectedX = (LABEL_WIDTH + 15) * CHAR_PX;
    expect(transform).toContain(`translate3d(${expectedX}px,`);
  });
});

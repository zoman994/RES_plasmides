/**
 * wrap-bridge-veil-v102.test.jsx — SPEC_V102_WRAPTAIL_GATE (23.05 final).
 *
 * The wrap-bridge line (last main row of a circular plasmid, kind:'main',
 * extended past the origin with wrap chars from the start) is NOT shaded
 * by the row-level `kind !== 'main'` dimming. V102 adds an overlay veil
 * over the wrap-half [wrapAt, end) so the pseudo-start after the ▶1
 * divider reads as dimmed context, in line with the trailing-wrap rows
 * below it. Pins: veil present + correct left/width on a bridge line;
 * absent on normal / wrap-tail lines; absent on a full-cpl bridge.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceLine from '../SequenceLine';
import { LABEL_WIDTH } from '../constants.js';

afterEach(cleanup);

const CHAR_PX = 7.2;

function renderLine(line, extra = {}) {
  return render(
    <SequenceLine
      line={line}
      kind={extra.kind || 'main'}
      nextKind="main"
      fullSeq={'A'.repeat(100)}
      features={[]}
      primers={[]}
      reSites={[]}
      selectedPrimerKeys={new Set()}
      charPx={CHAR_PX}
      showBottomStrand
      framesMode="single"
      primerStyle="filled"
      reOrientation="vertical"
      visibleFrames={{}}
      orfRanges={[]}
      renderHybrid={false}
      tracksReady={false}
      seqLength={100}
    />,
  );
}

// Bridge line: real end [80,100) (20 chars) + 20 wrap chars from start →
// seq length 40, wrapAt 20, wrapsOrigin true.
const bridgeLine = {
  start: 80, seq: 'A'.repeat(20) + 'C'.repeat(20), wrapAt: 20, kind: 'main', wrapsOrigin: true,
};

describe('V102 — wrap-bridge veil', () => {
  it('renders the veil over the wrap-half with correct left / width', () => {
    renderLine(bridgeLine);
    const veil = screen.getByTestId('wrap-bridge-veil');
    expect(veil).toBeTruthy();
    // left = (LABEL_WIDTH + wrapAt) * charPx (same column as the ▶1 divider)
    expect(veil.style.left).toBe(`${(LABEL_WIDTH + 20) * CHAR_PX}px`);
    // width = (seq.length - wrapAt) * charPx = 20 chars
    expect(veil.style.width).toBe(`${20 * CHAR_PX}px`);
    // must not eat drag-selection; sits below the ▶1 divider (zIndex 3)
    expect(veil.style.pointerEvents).toBe('none');
    expect(veil.style.zIndex).toBe('2');
  });

  it('does NOT render the veil on a normal main line', () => {
    renderLine({ start: 0, seq: 'A'.repeat(40), kind: 'main' });
    expect(screen.queryByTestId('wrap-bridge-veil')).toBeNull();
  });

  it('does NOT render the veil on a wrap-tail (trailing) line', () => {
    renderLine({ start: 0, seq: 'A'.repeat(40), kind: 'trailing-wrap' }, { kind: 'trailing-wrap' });
    expect(screen.queryByTestId('wrap-bridge-veil')).toBeNull();
  });

  it('does NOT render the veil when the bridge has no wrap chars (wrapAt >= seq.length)', () => {
    renderLine({
      start: 60, seq: 'A'.repeat(40), wrapAt: 40, kind: 'main', wrapsOrigin: true,
    });
    expect(screen.queryByTestId('wrap-bridge-veil')).toBeNull();
  });
});

/**
 * Terminal staircase must be COVERED by the segment highlight (Игорь 22.06:
 * «конца должны быть покрыты выделением. Сейчас левый конец нормально выделяется
 * а правый нет»).
 *
 * The purple зона-band (SegmentZonesOverlay) spans the duplex columns
 * [zone.start, zone.end). StrandsTrack draws an OUTWARD overhang past that edge
 * only when `protruding === 'bottom'` (a 5′ end protrudes bottom-right, a 3′ end
 * protrudes bottom-left). That stuck-out base used to escape the band. Now the
 * terminal-most zone extends by the overhang length at the protruding end, so the
 * highlight covers the whole staircase — uniformly on both ends.
 *
 * Width is `(toCh - fromCh) * charPx` (layout-independent), so we assert it
 * directly: a 16-bp zone is the charPx ruler, the extension is len/16 of it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';

afterEach(cleanup);

const SEQ = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT'; // 32 bp → one line
const ZONES = [
  { zoneId: 'a', start: 0, end: 16, color: '#8b5cf6' },
  { zoneId: 'b', start: 16, end: 32, color: '#ec4899' },
];

// terminalStagger output for a 5′ HindIII-like construct: left end recesses the
// bottom (protruding top → no outward bases), right end protrudes bottom (TCGA
// sticks out single-stranded past the duplex).
const STAGGER_5PRIME = {
  left: { end: 'left', protruding: 'top', recessed: 'bottom', len: 4, seq: 'AGCT', type: '5prime' },
  right: { end: 'right', protruding: 'bottom', recessed: 'top', len: 4, seq: 'AGCT', type: '5prime' },
};
// 3′ end: mirrored — the LEFT end protrudes bottom (outward), the right recesses.
const STAGGER_3PRIME = {
  left: { end: 'left', protruding: 'bottom', recessed: 'top', len: 4, seq: 'TGCA', type: '3prime' },
  right: { end: 'right', protruding: 'top', recessed: 'bottom', len: 4, seq: 'TGCA', type: '3prime' },
};

const widthOf = (zoneId) => {
  const el = screen.getAllByTestId('sequence-view-zone').find((n) => n.getAttribute('data-zone-id') === zoneId);
  return parseFloat(el.style.width);
};

const renderWith = (terminalStagger) => render(
  <SequenceTab sequence={SEQ} annotations={[]} topology="linear" name="x"
    coloredZones={ZONES} onZoneClick={() => {}} terminalStagger={terminalStagger} />,
);

describe('SegmentZonesOverlay — terminal staircase covered by the highlight', () => {
  it('right overhang (protruding bottom) → the rightmost band extends by the overhang length', () => {
    renderWith(undefined);
    const baseRight = widthOf('b'); // 16 bp = the charPx ruler
    cleanup();
    renderWith(STAGGER_5PRIME);
    // band 'b' grows by 4/16 of its base width; band 'a' (recessed top left) unchanged.
    expect(widthOf('b')).toBeCloseTo(baseRight * (20 / 16));
    expect(widthOf('a')).toBeCloseTo(baseRight); // 16 bp, no left extension for protruding-top
  });

  it('left overhang (protruding bottom, 3′) → the leftmost band extends outward', () => {
    renderWith(undefined);
    const base = widthOf('a');
    cleanup();
    renderWith(STAGGER_3PRIME);
    expect(widthOf('a')).toBeCloseTo(base * (20 / 16)); // grows leftward by the overhang
    expect(widthOf('b')).toBeCloseTo(base); // right end recesses (protruding top) → unchanged
  });

  it('no terminalStagger → bands are exactly the duplex span (back-compat)', () => {
    renderWith(undefined);
    const a = widthOf('a');
    const b = widthOf('b');
    expect(a).toBeCloseTo(b); // both 16 bp, no extension anywhere
  });
});

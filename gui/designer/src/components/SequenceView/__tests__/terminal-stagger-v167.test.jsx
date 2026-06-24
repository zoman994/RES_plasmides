/**
 * Terminal sticky-end staircase (Игорь 22.06 «физическая ступенька»): a linear
 * fragment's free ENDS render a physical strand step on the BOTTOM strand —
 * protruding=top → the recessed bottom is blanked (top bases stand alone);
 * protruding=bottom → the overhang bases stick out past the duplex edge.
 * Driven by the `terminalStagger` prop (output of segment-overhangs::terminalStagger).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';

afterEach(cleanup);

const SEQ = `AAGCTT${'A'.repeat(20)}AAGCTT`; // 32 bp linear, HindIII at both ends

// What terminalStagger() yields for a HindIII (5′ AGCT) linearized fragment.
const STAGGER = {
  left: { end: 'left', protruding: 'top', recessed: 'bottom', len: 4, seq: 'AGCT', type: '5prime' },
  right: { end: 'right', protruding: 'bottom', recessed: 'top', len: 4, seq: 'AGCT', type: '5prime' },
};

describe('SequenceView — terminal sticky-end staircase', () => {
  it('5′ ends: recess box at the left, protruding overhang bases at the right', () => {
    render(<SequenceTab sequence={SEQ} annotations={[]} topology="linear" name="x" terminalStagger={STAGGER} />);
    // left end (protruding top) → the bottom strand is blanked = the step
    const rec = screen.getByTestId('sequence-view-terminal-recess');
    expect(rec.getAttribute('data-end')).toBe('left');
    // right end (protruding bottom) → overhang bases stick out single-stranded,
    // shown COMPLEMENTED (bottom strand) — AGCT → TCGA; tooltip keeps the real seq.
    const oh = screen.getByTestId('sequence-view-terminal-overhang');
    expect(oh.getAttribute('data-end')).toBe('right');
    expect(oh.textContent).toBe('TCGA');
    expect(oh.getAttribute('title')).toMatch(/AGCT/);
  });

  it('no terminalStagger → no staircase (every existing consumer unchanged)', () => {
    render(<SequenceTab sequence={SEQ} annotations={[]} topology="linear" name="x" />);
    expect(screen.queryByTestId('sequence-view-terminal-recess')).toBeNull();
    expect(screen.queryByTestId('sequence-view-terminal-overhang')).toBeNull();
  });
});

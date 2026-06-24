/**
 * V160 «визуализировать стык» — the assembly Sequence view renders a JUNCTION
 * SEAM at each internal boundary whose two RE fragments carry an `interlock`
 * (precomputed upstream in AssemblyShellBody). The seam shows a verdict badge
 * (✓ compatible / ✕ incompatible / «тупой») so the biolog SEES whether the two
 * sticky-end steps mate. Geometry (bars/rungs) is layout-dependent and verified
 * in the browser; here we assert the verdict badge + divider render through the
 * real SequenceTab → SegmentZonesOverlay path.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';

afterEach(cleanup);

const SEQ = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT'; // 32 bp → one line

const zonesWith = (interlock) => ([
  { zoneId: 'a', start: 0, end: 16, color: '#8b5cf6', interlock },
  { zoneId: 'b', start: 16, end: 32, color: '#ec4899' },
]);

const renderZones = (interlock) => render(
  <SequenceTab sequence={SEQ} annotations={[]} topology="linear" name="x"
    coloredZones={zonesWith(interlock)} onZoneClick={() => {}} />,
);

const COMPAT = {
  verdict: 'compatible', length: 4, message: 'Совместимы: 5′ AATT', overhang: 'AATT',
  side: 'afterP', topOwner: 'next', botOwner: 'this',
};
const INCOMPAT = {
  verdict: 'incompatible', length: 4, message: 'Несовместимые липкие концы: 5′ AATT ≠ 5′ TCGA',
  overhang: '', side: null, topOwner: null, botOwner: null,
};
const BLUNT = { verdict: 'blunt', length: 0, message: 'Тупые концы — стыкуются в любой ориентации', overhang: '', side: null, topOwner: null, botOwner: null };

describe('V160 — junction seam render', () => {
  it('compatible interlock → a seam badge with data-verdict="compatible" + the overhang label', () => {
    renderZones(COMPAT);
    const seam = screen.getByTestId('sequence-view-junction-seam');
    expect(seam.getAttribute('data-verdict')).toBe('compatible');
    expect(seam.textContent).toMatch(/AATT/);
    expect(seam.getAttribute('title')).toMatch(/Совместим/i);
  });

  it('incompatible interlock → data-verdict="incompatible" + a red seam divider + tooltip naming both ends', () => {
    renderZones(INCOMPAT);
    const seam = screen.getByTestId('sequence-view-junction-seam');
    expect(seam.getAttribute('data-verdict')).toBe('incompatible');
    expect(seam.getAttribute('title')).toMatch(/Несовместим/i);
    expect(screen.getByTestId('sequence-view-seam-divider')).toBeTruthy();
  });

  it('blunt interlock → data-verdict="blunt" + «тупой»', () => {
    renderZones(BLUNT);
    const seam = screen.getByTestId('sequence-view-junction-seam');
    expect(seam.getAttribute('data-verdict')).toBe('blunt');
    expect(seam.textContent).toMatch(/тупой/i);
  });

  it('unknown / no interlock → NO seam badge', () => {
    renderZones({ verdict: 'unknown', length: 0, message: '', overhang: '', side: null, topOwner: null, botOwner: null });
    expect(screen.queryByTestId('sequence-view-junction-seam')).toBeNull();
  });
});

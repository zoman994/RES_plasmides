/**
 * RC-B2 (Игорь 24.06) — «визуализировать на стыке нуклеотидный сиквенс». The
 * assembly junction seam now shows the actual bases of the join (left │ right)
 * and, when a reading frame is pinned, the codon/AA that straddles it with a red
 * ⚠ STOP marker if translation hits a premature stop across the junction. Data
 * (zone.seam = junctionSeamView output) is precomputed upstream in AssemblyShellBody.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';

afterEach(cleanup);

const SEQ = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT'; // 32 bp → one line
const COMPAT = {
  verdict: 'compatible', length: 4, message: 'Совместимы: 5′ AATT', overhang: 'AATT',
  side: 'afterP', topOwner: 'next', botOwner: 'this',
};

const zonesWith = (seam) => ([
  { zoneId: 'a', start: 0, end: 16, color: '#8b5cf6', interlock: COMPAT, seam },
  { zoneId: 'b', start: 16, end: 32, color: '#ec4899' },
]);

const renderSeam = (seam) => render(
  <SequenceTab sequence={SEQ} annotations={[]} topology="linear" name="x"
    coloredZones={zonesWith(seam)} onZoneClick={() => {}} />,
);

describe('RC-B2 — junction-seam nucleotide readout', () => {
  it('renders the bases on each side of the seam', () => {
    renderSeam({ left: 'CCGG', right: 'AATT', boundaryPos: 16, onCodonBoundary: null, codonAtSeam: null, stopAtSeam: false });
    const el = screen.getByTestId('sequence-view-seam-seq');
    expect(el.textContent).toMatch(/CCGG/);
    expect(el.textContent).toMatch(/AATT/);
  });

  it('with a pinned frame → shows the straddling codon AA, no STOP marker', () => {
    renderSeam({ left: 'CCGG', right: 'AATT', boundaryPos: 16, onCodonBoundary: false, codonAtSeam: { dna: 'GGA', aa: 'G', isStop: false, start: 14 }, stopAtSeam: false });
    expect(screen.getByTestId('sequence-view-seam-aa').textContent).toBe('G');
    expect(screen.queryByTestId('sequence-view-seam-stop')).toBeNull();
  });

  it('flags a premature STOP that straddles the seam', () => {
    renderSeam({ left: 'CCAT', right: 'GACC', boundaryPos: 16, onCodonBoundary: false, codonAtSeam: { dna: 'TGA', aa: '*', isStop: true, start: 14 }, stopAtSeam: true });
    expect(screen.getByTestId('sequence-view-seam-stop')).toBeTruthy();
  });

  it('no seam data → no readout (only the V160 verdict badge)', () => {
    renderSeam(null);
    expect(screen.queryByTestId('sequence-view-seam-seq')).toBeNull();
    expect(screen.getByTestId('sequence-view-junction-seam')).toBeTruthy();
  });
});

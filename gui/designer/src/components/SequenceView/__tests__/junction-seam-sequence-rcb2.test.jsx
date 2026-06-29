/**
 * RC-B2 (Игорь 24.06) — «визуализировать на стыке нуклеотидный сиквенс». The
 * junction seam carries the actual bases of the join (left │ right) and, when a
 * reading frame is pinned, the codon/AA that straddles it + a premature-STOP flag.
 *
 * RC-SEP-SEAM (Игорь 25.06 «там букв в принципе не должно быть») — these bases /
 * codon / AA are NO LONGER painted at the seam; they live in the hover TOOLTIP
 * (the seam element's `title`). A premature STOP keeps a non-letter visual marker
 * (a red dot, `sequence-view-seam-stop`) because it's a hard error, with the words
 * in the tooltip. Data (zone.seam = junctionSeamView output) is precomputed upstream.
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

describe('RC-B2 — junction-seam nucleotide readout (в тултипе, без букв на экране)', () => {
  it('the bases on each side of the seam live in the TOOLTIP, not on screen', () => {
    renderSeam({ left: 'CCGG', right: 'AATT', boundaryPos: 16, onCodonBoundary: null, codonAtSeam: null, stopAtSeam: false });
    // нет текстового бокса с нуклеотидами на стыке.
    expect(screen.queryByTestId('sequence-view-seam-seq')).toBeNull();
    // базы стыка читаются в тултипе hotspot'а.
    const seam = screen.getByTestId('sequence-view-junction-seam');
    expect(seam.getAttribute('title')).toMatch(/CCGG/);
    expect(seam.getAttribute('title')).toMatch(/AATT/);
    expect(seam.textContent.trim()).toBe('');
  });

  it('with a pinned frame → straddling codon AA в ТУЛТИПЕ, no STOP marker', () => {
    renderSeam({ left: 'CCGG', right: 'AATT', boundaryPos: 16, onCodonBoundary: false, codonAtSeam: { dna: 'GGA', aa: 'G', isStop: false, start: 14 }, stopAtSeam: false });
    const seam = screen.getByTestId('sequence-view-junction-seam');
    expect(seam.getAttribute('title')).toMatch(/GGA/);   // кодон на стыке
    expect(seam.getAttribute('title')).toMatch(/→\s*G/); // → AA
    expect(screen.queryByTestId('sequence-view-seam-aa')).toBeNull(); // не отрисован буквой
    expect(screen.queryByTestId('sequence-view-seam-stop')).toBeNull();
  });

  it('flags a premature STOP — нетекстовый красный маркер + слова в тултипе', () => {
    renderSeam({ left: 'CCAT', right: 'GACC', boundaryPos: 16, onCodonBoundary: false, codonAtSeam: { dna: 'TGA', aa: '*', isStop: true, start: 14 }, stopAtSeam: true });
    const stop = screen.getByTestId('sequence-view-seam-stop');
    expect(stop).toBeTruthy();
    expect(stop.textContent.trim()).toBe('');           // маркер, не буквы «STOP»
    const seam = screen.getByTestId('sequence-view-junction-seam');
    expect(seam.getAttribute('title')).toMatch(/STOP/i);
  });

  it('no seam data → no readout (только визуальный verdict hotspot)', () => {
    renderSeam(null);
    expect(screen.queryByTestId('sequence-view-seam-seq')).toBeNull();
    expect(screen.getByTestId('sequence-view-junction-seam')).toBeTruthy();
  });
});

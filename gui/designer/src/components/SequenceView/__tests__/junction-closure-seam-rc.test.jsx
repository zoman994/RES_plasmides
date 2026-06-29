/**
 * RC-CLOSE-GATE (Игорь 25.06) — the assembly Sequence view renders a CLOSURE seam
 * verdict at the construct origin for a CIRCULAR assembly: a self-/ring-closure
 * whose two ends do NOT mate (blunt + sticky) reads as un-closable ON the strand.
 *
 * RC-SEP-SEAM (Игорь 26.06 «приводи closure к тому же визуальному языку») — the
 * closure seam is now PURELY VISUAL like the inter-fragment seam: compatible =
 * green join, incompatible = a tooth + an EMPTY socket («выбитый зуб») + a neutral
 * divider, blunt = a flush line. The ⟳ / verdict / overhang move into a hover
 * TOOLTIP (the seam element's `title`); NO letters are painted at the origin.
 * Fed via the real SequenceTab → SequenceView → SegmentZonesOverlay path.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';

afterEach(cleanup);

const SEQ = 'AAAACCCCGGGGTTTTAAAACCCC'; // 24 bp → one line
const oneZone = [{ zoneId: 'only', start: 0, end: 24, color: '#8b5cf6', label: 'insert' }];
// self-closure zone carrying its two physical ends (blunt left + 5′ AATT right) so the
// overlay can draw the «выбитый зуб» geometry at the origin.
const zoneWithEnds = [{
  zoneId: 'only', start: 0, end: 24, color: '#8b5cf6', label: 'insert',
  reOverhangs: {
    left: { type: 'blunt', seq: null, label: 'тупой' },
    right: { enzyme: 'EcoRI', type: '5prime', delta: 4, seq: 'AATT', label: '5′ AATT' },
  },
}];

const renderClosure = (closureSeam, zones = oneZone) => render(
  <SequenceTab sequence={SEQ} annotations={[]} topology="circular" name="x"
    coloredZones={zones} closureSeam={closureSeam} onZoneClick={() => {}} />,
);

const INCOMPAT = {
  interlock: { verdict: 'incompatible', message: 'Несовместимые концы: 5′ AATT ≠ тупой', overhang: '' },
  kind: 're_ligation', selfClosure: true, leftLabel: 'insert', rightLabel: 'insert',
};
const COMPAT = {
  interlock: { verdict: 'compatible', message: 'Совместимы: 5′ AATT', overhang: 'AATT' },
  kind: 're_ligation', selfClosure: true, leftLabel: 'insert', rightLabel: 'insert',
};

describe('RC-CLOSE-GATE — closure seam render (чисто визуальный, текст → тултип)', () => {
  it('incompatible self-closure → data-verdict, БЕЗ букв и без ⟳/✕, вердикт в тултипе + НЕЙТРАЛЬНЫЙ divider', () => {
    renderClosure(INCOMPAT);
    const seam = screen.getByTestId('sequence-view-closure-seam');
    expect(seam.getAttribute('data-verdict')).toBe('incompatible');
    expect(seam.getAttribute('title')).toMatch(/Замыкание кольца.*само-замыкание/i);
    // Игорь «там букв в принципе не должно быть» — ни ⟳, ни ✕, ни overhang-букв на origin.
    expect(seam.textContent.trim()).toBe('');
    expect(seam.textContent).not.toContain('⟳');
    expect(seam.textContent).not.toContain('✕');
    const divider = screen.getByTestId('sequence-view-closure-divider');
    expect(divider).toBeTruthy();
    // дело не в колористике, но красного алярма тут больше нет — нейтральный серый.
    expect(divider.style.background).not.toContain('220, 38, 38');
    expect(divider.style.background).not.toContain('#dc2626');
  });

  it('incompatible с overhang-концами → зуб + ПУСТОЙ socket («выбитый зуб») на origin', () => {
    renderClosure(INCOMPAT, zoneWithEnds);
    expect(screen.getByTestId('sequence-view-closure-mismatch')).toBeTruthy();
    // «просто буквы убрать» (Игорь 26.06): NO cover box — the recessed strand bases are blanked in
    // StrandsTrack (genuine single-stranded staircase), so there's no socket div over the letters.
    expect(screen.queryByTestId('sequence-view-closure-socket')).toBeNull();
  });

  it('compatible closure → data-verdict, overhang AATT в ТУЛТИПЕ + зелёный join (без divider), без букв', () => {
    renderClosure(COMPAT);
    const seam = screen.getByTestId('sequence-view-closure-seam');
    expect(seam.getAttribute('data-verdict')).toBe('compatible');
    expect(seam.getAttribute('title')).toMatch(/AATT/);
    expect(seam.textContent.trim()).toBe('');
    expect(screen.getByTestId('sequence-view-closure-join')).toBeTruthy();
    expect(screen.queryByTestId('sequence-view-closure-divider')).toBeNull();
  });

  it('no closureSeam / unknown verdict → NO closure badge (back-compat: linear / Library)', () => {
    renderClosure(null);
    expect(screen.queryByTestId('sequence-view-closure-seam')).toBeNull();
    cleanup();
    renderClosure({ interlock: { verdict: 'unknown' }, kind: 'overlap', selfClosure: true });
    expect(screen.queryByTestId('sequence-view-closure-seam')).toBeNull();
  });
});

/**
 * StickyEndFragment — VERT-3 Variant C (Игорь 27.06: «третий вариант хороший» — буквы
 * концов из вьювера + тело тонкими цепями той же высоты, шов исчезает). The end render
 * is GENERIC over the junction kind so non-RE joins fit the same picture (Игорь: «у нас
 * ещё будут варианты когда слияние не через РЕ а через оверлап… предусмотри»):
 *   - overhang (RE/Golden Gate) → terminalStagger staircase + protruding letters;
 *   - blunt (KLD/blunt)         → flush end letters, no step;
 *   - overlap (Gibson/OV-PCR)   → homology band on the end letters (StrandsTrack overhangs).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StickyEndFragment from '../StickyEndFragment';

afterEach(cleanup);

const tip = (o) => ({
  end: o.end, type: o.type, seq: o.seq, len: o.seq.length,
  protruding: o.protruding, recessed: o.protruding === 'top' ? 'bottom' : 'top',
  label: `${o.type === '3prime' ? '3′' : '5′'} ${o.seq}`,
});
const ecoRI = {
  left: tip({ end: 'left', type: '5prime', seq: 'AATT', protruding: 'top' }),
  right: tip({ end: 'right', type: '5prime', seq: 'AATT', protruding: 'bottom' }),
};
const pstI = {
  left: tip({ end: 'left', type: '3prime', seq: 'TGCA', protruding: 'bottom' }),
  right: tip({ end: 'right', type: '3prime', seq: 'TGCA', protruding: 'top' }),
};
const SEQ = 'GAATTCATGCGTACGCGAATTC'; // 22 bp → two end windows + a body

describe('StickyEndFragment — Variant C (literal ends + thin feature body)', () => {
  it('renders top + bottom strand rows from StrandsTrack at both ends', () => {
    render(<StickyEndFragment stagger={ecoRI} sequence={SEQ} />);
    expect(screen.getByTestId('sticky-end-fragment')).toBeTruthy();
    expect(screen.getAllByTestId('sequence-view-strands-top').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByTestId('sequence-view-strands-bottom').length).toBeGreaterThanOrEqual(2);
  });

  it('5′ overhang (EcoRI): right terminus protrudes (overhang), left recesses', () => {
    render(<StickyEndFragment stagger={ecoRI} sequence={SEQ} />);
    expect(screen.getByTestId('sequence-view-terminal-overhang').getAttribute('data-end')).toBe('right');
    expect(screen.getByTestId('sequence-view-terminal-recess').getAttribute('data-end')).toBe('left');
  });

  it('3′ overhang (PstI): left terminus protrudes (overhang), right recesses', () => {
    render(<StickyEndFragment stagger={pstI} sequence={SEQ} />);
    expect(screen.getByTestId('sequence-view-terminal-overhang').getAttribute('data-end')).toBe('left');
    expect(screen.getByTestId('sequence-view-terminal-recess').getAttribute('data-end')).toBe('right');
  });

  it('Ф4.3 — hideRightEnd/hideLeftEnd подавляют обращённое окно (под меш-шов)', () => {
    const { rerender } = render(<StickyEndFragment stagger={ecoRI} sequence={SEQ} hideRightEnd />);
    expect(screen.queryByTestId('sticky-end-fragment-end-right')).toBeNull();
    expect(screen.getByTestId('sticky-end-fragment-end-left')).toBeTruthy();
    rerender(<StickyEndFragment stagger={ecoRI} sequence={SEQ} hideLeftEnd />);
    expect(screen.queryByTestId('sticky-end-fragment-end-left')).toBeNull();
    expect(screen.getByTestId('sticky-end-fragment-end-right')).toBeTruthy();
  });

  it('nucleotide ends PROTRUDE fully past the box border (absolute, beyond 100%)', () => {
    render(<StickyEndFragment stagger={ecoRI} sequence={SEQ} />);
    const left = screen.getByTestId('sticky-end-fragment-end-left');
    const right = screen.getByTestId('sticky-end-fragment-end-right');
    expect(left.style.position).toBe('absolute');
    // Pushed OUT past the card's padding+border (calc(100% + Npx)) so the border line
    // never crosses the letters (Игорь 27.06 «аккуратно работать с границами»).
    expect(left.style.right).toContain('100%');
    expect(left.style.right).toContain('calc');
    expect(right.style.position).toBe('absolute');
    expect(right.style.left).toContain('100%');
    expect(right.style.left).toContain('calc');
  });

  it('the body is a thin feature strand bar (not the fat MiniPlasmidMap strip)', () => {
    const annotations = [{
      id: 'a1', level: 'region', type: 'CDS', name: 'gene', start: 8, end: 14,
    }];
    render(<StickyEndFragment stagger={ecoRI} sequence={SEQ} annotations={annotations} />);
    const body = screen.getByTestId('sticky-end-fragment-body');
    expect(body).toBeTruthy();
    const rects = [...body.querySelectorAll('rect')];
    const colored = rects.some((r) => /^#/.test(r.getAttribute('fill') || ''));
    expect(colored).toBe(true);
    // Variant C abandons the fat strip.
    expect(body.getAttribute('data-shape')).not.toBe('linear');
  });

  it('terminal recess is transparent (no white box on the tinted card)', () => {
    render(<StickyEndFragment stagger={ecoRI} sequence={SEQ} />);
    // EcoRI left is 5′ (top protrudes) → recess on the bottom strand. It must NOT paint a
    // white cover box on the tinted card; the recessed bases are blanked instead.
    expect(screen.getByTestId('sequence-view-terminal-recess').style.background).toBe('transparent');
  });

  it('blanked (recessed) cells carry NO feature tint — the step is not coloured', () => {
    // pstI right = 3′ (top protrudes) → bottom strand recessed/blanked at the right end.
    const annotations = [{
      id: 'a', level: 'region', type: 'CDS', name: 'g', start: 0, end: SEQ.length,
    }];
    render(<StickyEndFragment stagger={pstI} sequence={SEQ} annotations={annotations} />);
    const blankRun = screen.getAllByTestId('sequence-view-nt-run')
      .find((r) => r.getAttribute('data-strand') === 'bottom' && /^\s+$/.test(r.textContent || ''));
    expect(blankRun).toBeTruthy();
    expect(blankRun.style.background).toBe('transparent');
  });

  it('gutter line-number is suppressed (no shifting «1» on the ends)', () => {
    render(<StickyEndFragment stagger={ecoRI} sequence={SEQ} />);
    const tops = screen.getAllByTestId('sequence-view-strands-top');
    expect(tops.some((t) => /\d/.test(t.textContent || ''))).toBe(false);
  });

  it('feature tint flows onto the end-window letters too', () => {
    const annotations = [{
      id: 'a1', level: 'region', type: 'CDS', name: 'gene', start: 0, end: 6,
    }];
    render(<StickyEndFragment stagger={ecoRI} sequence={SEQ} annotations={annotations} />);
    const tinted = screen.getAllByTestId('sequence-view-nt-run').some((r) => {
      const bg = r.style.background || '';
      return bg && bg !== 'transparent';
    });
    expect(tinted).toBe(true);
  });

  // GENERIC junction kinds — non-RE joins fit the same picture.
  it('blunt ends (no stagger) → flush letters, no staircase', () => {
    render(<StickyEndFragment stagger={null} sequence={SEQ} />);
    expect(screen.getByTestId('sticky-end-fragment').getAttribute('data-sticky')).toBe('false');
    expect(screen.queryByTestId('sequence-view-terminal-overhang')).toBeNull();
    expect(screen.queryByTestId('sequence-view-terminal-recess')).toBeNull();
  });

  it('overlap join (Gibson/OV-PCR) → homology band on the end letters', () => {
    render(<StickyEndFragment
      sequence={SEQ}
      ends={{ left: { kind: 'blunt' }, right: { kind: 'overlap', len: 4 } }}
    />);
    // StrandsTrack draws the band via its `overhangs` prop → strand-overhang testid.
    expect(screen.getAllByTestId('sequence-view-strand-overhang').length).toBeGreaterThanOrEqual(1);
    // overlap is not an RE staircase.
    expect(screen.queryByTestId('sequence-view-terminal-recess')).toBeNull();
  });
});

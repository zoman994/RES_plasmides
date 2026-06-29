/**
 * DAG bp→bar scale (Игорь 26.06 «передать масштаб на DAG — чтобы кольца были
 * больше линейных фрагментов; сейчас даже небольшие линейки выглядят огромными»).
 * The linear fragment strip width is scaled by bp on a SHARED scale across the DAG
 * (maxBp), so a 469 bp fragment cut from a 7904 bp plasmid no longer fills the card
 * full-width. Rings are left readable (this minimal variant scales ONLY bars).
 * Opt-in: no maxBp → full width (back-compat for the main canvas / Library).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MiniPlasmidMap, { linearBarWidth } from '../MiniPlasmidMap';

afterEach(cleanup);

describe('linearBarWidth — DAG bp→bar scale', () => {
  it('no maxBp → full width (opt-out, back-compat)', () => {
    expect(linearBarWidth(469, null, 202)).toBe(202);
    expect(linearBarWidth(469, 0, 202)).toBe(202);
  });
  it('proportional to bp / maxBp', () => {
    expect(linearBarWidth(7904, 7904, 202)).toBe(202);   // largest → full
    expect(linearBarWidth(3952, 7904, 202)).toBe(101);   // half
  });
  it('floors tiny fragments so они остаются видимым баром', () => {
    expect(linearBarWidth(469, 7904, 202, 24)).toBe(24); // 12px → floor 24
  });
  it('never exceeds full width even if bp > maxBp', () => {
    expect(linearBarWidth(10000, 7904, 202)).toBe(202);
  });
});

describe('MiniPlasmidMap — linear strip honours maxBp', () => {
  it('without maxBp → strip spans (almost) the full width', () => {
    render(<MiniPlasmidMap length={469} width={210} height={90} testId="m1" />);
    const strip = screen.getByTestId('mini-plasmid-strip');
    expect(parseFloat(strip.getAttribute('width'))).toBeGreaterThan(180);
  });
  it('with a big maxBp → a small fragment renders a SHORT strip', () => {
    render(<MiniPlasmidMap length={469} maxBp={7904} width={210} height={90} testId="m2" />);
    const strip = screen.getByTestId('mini-plasmid-strip');
    expect(parseFloat(strip.getAttribute('width'))).toBeLessThan(60);
  });
  it('a short (scaled) strip is CENTERED, not jammed at the left padX (Игорь 26.06)', () => {
    render(<MiniPlasmidMap length={469} maxBp={7904} width={210} height={90} testId="m2c" />);
    const strip = screen.getByTestId('mini-plasmid-strip');
    // left-aligned would sit at padX=4; centered short bar starts well to the right.
    expect(parseFloat(strip.getAttribute('x'))).toBeGreaterThan(40);
  });
  it('the bar is THIN (≤ 12px), not a chunky block', () => {
    render(<MiniPlasmidMap length={3000} maxBp={7904} width={210} height={90} testId="m2h" />);
    const strip = screen.getByTestId('mini-plasmid-strip');
    expect(parseFloat(strip.getAttribute('height'))).toBeLessThanOrEqual(12);
  });
  it('full-width (no maxBp) strip stays at left padX', () => {
    render(<MiniPlasmidMap length={469} width={210} height={90} testId="m2f" />);
    const strip = screen.getByTestId('mini-plasmid-strip');
    expect(parseFloat(strip.getAttribute('x'))).toBeLessThan(6); // ~padX
  });
  it('circular ignores maxBp (rings stay readable in this minimal variant)', () => {
    render(<MiniPlasmidMap length={469} maxBp={7904} circular width={210} height={90} testId="m3" />);
    // a ring renders (data-shape=circle), no linear strip to scale.
    expect(screen.getByTestId('m3').getAttribute('data-shape')).toBe('circle');
  });
});

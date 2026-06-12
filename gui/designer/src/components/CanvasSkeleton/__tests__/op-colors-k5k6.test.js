/**
 * op-colors-k5k6.test.js — M-CANVAS-FIX.1 K5 + K6.
 *
 * One canonical reaction colour (Игорь §0.6: junction-styles = chemistry class).
 *   K5 — operationColor(kind): a JUNCTION op (gibson/golden_gate/ligate/kld)
 *     reads the junction-styles canon; a NON-junction op (pcr/cut/mutagenesis)
 *     gets its OWN distinct colour (design-sense, deliberately NOT grey, NOT
 *     colliding with the chemistry set); unknown → a WARM neutral, never grey
 *     (grey reads as "inactive/disabled" — Игорь).
 *   K6 — edgeColorFor(fromNode,toNode): a graph edge inherits the colour of the
 *     operation it connects to (the wire is part of that reaction).
 */
import { describe, it, expect } from 'vitest';
import { operationColor, edgeColorFor, OP_NEUTRAL } from '../canvas/op-colors';
import { junctionStroke } from '../canvas/junction-styles';

describe('K5 — operationColor: junction ops read the chemistry canon', () => {
  it('gibson → overlap colour, golden_gate → GG, ligate → ligation, kld → kld', () => {
    expect(operationColor('gibson').stroke).toBe(junctionStroke('overlap'));
    expect(operationColor('golden_gate').stroke).toBe(junctionStroke('golden_gate'));
    expect(operationColor('ligate').stroke).toBe(junctionStroke('ligation'));
    expect(operationColor('kld').stroke).toBe(junctionStroke('kld'));
  });

  it('non-junction ops (pcr/cut/mutagenesis) get their OWN distinct colours', () => {
    const pcr = operationColor('pcr').stroke;
    const cut = operationColor('cut').stroke;
    const mut = operationColor('mutagenesis').stroke;
    // distinct from each other
    expect(new Set([pcr, cut, mut]).size).toBe(3);
    // not borrowing a chemistry-canon colour
    const canon = ['overlap', 'golden_gate', 're_ligation', 'ligation', 'kld'].map(junctionStroke);
    for (const c of [pcr, cut, mut]) expect(canon).not.toContain(c);
  });

  it('unknown kind → WARM neutral, NOT grey (grey = inactive, bad)', () => {
    const n = operationColor(undefined);
    expect(n).toEqual(OP_NEUTRAL);
    expect(n.stroke).not.toBe('#a8a29e'); // the old grey
    // warm = red channel dominates blue
    const hex = n.stroke.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    expect(r).toBeGreaterThan(b);
  });
});

describe('K6 — edgeColorFor: edge inherits the connected operation colour', () => {
  const opNode = (kind) => ({ kind: 'operation', data: { operation: { id: 'o', kind } } });
  const cnt = (id) => ({ kind: 'container', id, data: { container: { id } } });

  it('container → gibson-op edge is overlap-coloured', () => {
    expect(edgeColorFor(cnt('c'), opNode('gibson'))).toBe(junctionStroke('overlap'));
  });

  it('op → container edge takes the op colour too (either endpoint)', () => {
    expect(edgeColorFor(opNode('golden_gate'), cnt('c'))).toBe(junctionStroke('golden_gate'));
  });

  it('container → container edge (no op) → warm neutral', () => {
    expect(edgeColorFor(cnt('a'), cnt('b'))).toBe(OP_NEUTRAL.stroke);
  });
});

/**
 * blunt-op — GAP-1 wiring (Игорь /loop 28.06). The `blunt` op kind: an
 * exonuclease/polymerase end-blunting reaction that takes ONE fragment with
 * sticky ends → ONE blunt-ended fragment. Engine biology lives in
 * lib/end-blunting.js (tested in end-blunting.test.js); here we pin the OP:
 * registry registration + the executeBlunt adapter (container in → container out).
 *
 * Container model note: overhangs are METADATA at the container `ends` level
 * (cut slices at the top cut, V155/V159), so blunting flips ends → blunt and
 * KEEPS the stored sequence — a naive trim would be biologically wrong.
 */
import { describe, it, expect } from 'vitest';
import { executeBlunt } from '../canvas/operations/adapters/blunt';
import {
  getAdapter, getPopupComponent, isKnownKind, KNOWN_OP_KINDS,
} from '../canvas/operations/op-kinds-registry';
import { operationColor, OP_NEUTRAL } from '../canvas/op-colors';

const fragWith = (ends) => ({
  id: 'c1', kind: 'molecule', name: 'frag', sequence: 'ACGTACGTACGTACGT', annotations: [], ends,
});
const ctxWith = (container) => ({ containers: { [container.id]: container } });
const op = (params) => ({ id: 'op1', kind: 'blunt', params });
const FIVE = { overhang: 'AATT', type: '5overhang', enzymeUsed: 'EcoRI' };
const THREE = { overhang: 'TGCA', type: '3overhang', enzymeUsed: 'PstI' };

describe('blunt op — registry wiring', () => {
  it("'blunt' is a registered, executable op kind with a popup", () => {
    expect(isKnownKind('blunt')).toBe(true);
    expect(KNOWN_OP_KINDS.has('blunt')).toBe(true);
    expect(typeof getAdapter('blunt')).toBe('function');
    expect(getPopupComponent('blunt')).toBeTruthy();
  });
  it("'blunt' has its own colour (not the neutral fallback)", () => {
    expect(operationColor('blunt').stroke).not.toBe(OP_NEUTRAL.stroke);
  });
});

describe('executeBlunt — overhang fragment → blunt fragment', () => {
  it('5′ left + 3′ right + T4 pol → both ends blunt, sequence kept', () => {
    const frag = fragWith({ fivePrime: FIVE, threePrime: THREE });
    const r = executeBlunt(op({ templateId: 'c1', enzyme: 'T4pol' }), ctxWith(frag));
    expect(r.error).toBeUndefined();
    expect(r.outputs).toHaveLength(1);
    const out = r.outputs[0];
    expect(out.sequence).toBe(frag.sequence); // overhang is metadata → footprint kept
    expect(out.ends.fivePrime.type).toBe('blunt');
    expect(out.ends.threePrime.type).toBe('blunt');
    expect(out.origin.kind).toBe('op_blunt');
    expect(out.origin.enzyme).toBe('T4pol');
    expect(out.origin.parentContainerId).toBe('c1');
  });
  it('3′ overhang + Klenow → error (no 3′ exo)', () => {
    const frag = fragWith({ fivePrime: FIVE, threePrime: THREE });
    const r = executeBlunt(op({ templateId: 'c1', enzyme: 'Klenow' }), ctxWith(frag));
    expect(r.error).toBeTruthy();
    expect(r.outputs).toBeUndefined();
  });
  it('5′ overhang + Klenow → ok (fills the 5′ overhang)', () => {
    const frag = fragWith({ fivePrime: FIVE, threePrime: { overhang: '', type: 'blunt' } });
    const r = executeBlunt(op({ templateId: 'c1', enzyme: 'Klenow' }), ctxWith(frag));
    expect(r.error).toBeUndefined();
    expect(r.outputs[0].ends.fivePrime.type).toBe('blunt');
  });
  it('records per-end mode + overhangsRemoved (chew shrinks footprint, fill does not)', () => {
    const frag = fragWith({ fivePrime: FIVE, threePrime: THREE });
    const r = executeBlunt(op({ templateId: 'c1', enzyme: 'T4pol' }), ctxWith(frag));
    expect(r.outputs[0].origin.leftMode).toBe('fill'); // 5′ filled
    expect(r.outputs[0].origin.rightMode).toBe('chew'); // 3′ chewed
    expect(r.outputs[0].origin.overhangsRemoved).toBe(4);
  });
  it('default enzyme = T4 pol when none given', () => {
    const frag = fragWith({ fivePrime: FIVE, threePrime: null });
    const r = executeBlunt(op({ templateId: 'c1' }), ctxWith(frag));
    expect(r.error).toBeUndefined();
    expect(r.outputs[0].origin.enzyme).toBe('T4pol');
  });
  it('already-blunt fragment (no ends) → no-op blunt product', () => {
    const r = executeBlunt(op({ templateId: 'c1', enzyme: 'T4pol' }), ctxWith(fragWith(null)));
    expect(r.error).toBeUndefined();
    expect(r.outputs[0].ends.fivePrime.type).toBe('blunt');
    expect(r.outputs[0].origin.overhangsRemoved).toBe(0);
  });
  it('missing template → error', () => {
    const r = executeBlunt(op({ templateId: 'nope', enzyme: 'T4pol' }), ctxWith(fragWith(null)));
    expect(r.error).toBeTruthy();
  });
  it('unknown enzyme → error', () => {
    const r = executeBlunt(op({ templateId: 'c1', enzyme: 'Zzz' }), ctxWith(fragWith(null)));
    expect(r.error).toBeTruthy();
  });
});

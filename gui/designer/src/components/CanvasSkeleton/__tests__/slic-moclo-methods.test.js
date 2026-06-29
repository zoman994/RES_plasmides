/**
 * slic-moclo-methods — #111 (Игорь /loop 28.06): «SLIC и MoClo (по идее тот же
 * Golden Gate)». Both are thin method additions reusing existing op kinds:
 *   • SLIC — overlap-homology assembly (Gibson family): junction kind 'overlap',
 *     op kind 'gibson'. Difference is the wet-lab chemistry (T4 pol exo chew-back,
 *     no in-vitro ligase), surfaced as a distinct labelled method/protocol.
 *   • MoClo — standardized Type IIS one-pot assembly = Golden Gate preset (BsaI):
 *     junction kind 'golden_gate', op kind 'golden_gate', default enzyme BsaI.
 * Selectable in CircularizeModal (CLOSURE_METHODS), realise via the gibson /
 * golden_gate ops, primers via the overlap / GG tails. No new op kind / engine path.
 */
import { describe, it, expect } from 'vitest';
import {
  CLOSURE_METHODS, INTERNAL_METHODS, defaultEnzymeForMethod, junctionKindForMethod,
} from '../lib/junction-derive';
import { METHOD_TO_JUNCTION, METHOD_TO_OP_KIND, realiseAssembly } from '../lib/zone-pieces-to-dag';
import { KNOWN_OP_KINDS } from '../canvas/operations/op-kinds-registry';
import { validateClosure } from '../lib/circularize-validate';
import { buildInitialState } from '../store/skeleton-state';

describe('SLIC + MoClo — method registration', () => {
  it('both are ring-closing (CLOSURE) methods', () => {
    expect(CLOSURE_METHODS).toContain('slic');
    expect(CLOSURE_METHODS).toContain('moclo');
  });
  it('NOT added as internal-fuse methods (they map to existing overlap / GG kinds — no dup picker tiles)', () => {
    expect(INTERNAL_METHODS).not.toContain('slic');
    expect(INTERNAL_METHODS).not.toContain('moclo');
  });
  it('SLIC → overlap junction + gibson op; MoClo → golden_gate junction + golden_gate op', () => {
    expect(METHOD_TO_JUNCTION.slic).toBe('overlap');
    expect(METHOD_TO_OP_KIND.slic).toBe('gibson');
    expect(METHOD_TO_JUNCTION.moclo).toBe('golden_gate');
    expect(METHOD_TO_OP_KIND.moclo).toBe('golden_gate');
    expect(junctionKindForMethod('slic')).toBe('overlap');
    expect(junctionKindForMethod('moclo')).toBe('golden_gate');
  });
  it('every method op kind is registered (consistency)', () => {
    expect(KNOWN_OP_KINDS.has(METHOD_TO_OP_KIND.slic)).toBe(true);
    expect(KNOWN_OP_KINDS.has(METHOD_TO_OP_KIND.moclo)).toBe(true);
  });
  it('MoClo seeds BsaI (Type IIS); SLIC needs no enzyme', () => {
    expect(defaultEnzymeForMethod('moclo')).toBe('BsaI');
    expect(defaultEnzymeForMethod('slic')).toBeNull();
  });
});

describe('SLIC + MoClo — closure validation', () => {
  const frag = (id, seq) => ({ id, label: id, sequence: seq });
  it('SLIC validates like overlap homology (distinct ends, enough length → ok)', () => {
    const segs = [frag('a', 'AAAACCCCGGGGTTTTAAAA'), frag('b', 'TTTTGGGGCCCCAAAATTTT')];
    const v = validateClosure({ method: 'slic', segments: segs, circular: true });
    expect(v.level).toBe('ok');
  });
  it('MoClo validates like Golden Gate (no internal BsaI site → ok)', () => {
    const segs = [frag('a', 'AAAACCCCGGGGTTTT'), frag('b', 'TTTTGGGGCCCCAAAA')];
    const v = validateClosure({ method: 'moclo', segments: segs, circular: true, enzyme: 'BsaI' });
    expect(v.level).toBe('ok');
  });
});

describe('SLIC + MoClo — realise via existing ops', () => {
  const SEQ1 = 'AAAACCCCGGGGTTTT'.repeat(2);
  const SEQ2 = 'TTTTGGGGCCCCAAAA'.repeat(2);
  const src = (id, seq) => ({
    id, kind: 'molecule', name: id, sequence: seq, annotations: [], topology: { circular: false }, pinned: true,
  });
  const piece = (id, sid) => ({
    id, kind: 'sourced', name: id, sourceIds: [sid],
    ranges: [{ sourceId: sid, start: 0, end: 32, orientation: 'forward' }],
    origin: 'selection', acquisitionMethod: 'undefined', zoneId: 'zn-1', createdAt: 1, updatedAt: 1,
  });
  const stateWith = () => {
    const s = buildInitialState();
    return {
      ...s,
      containers: [...s.containers, src('s1', SEQ1), src('s2', SEQ2)],
      zones: [{
        id: 'zn-1', name: 'Z', viewMode: 'sequence', bounds: { x: 0, y: 0, width: 600, height: 400 },
        topology: { circular: true },
      }],
      pieces: [piece('p1', 's1'), piece('p2', 's2')],
    };
  };
  const closureJun = (r) => r.diff.junctions.find((j) => j.realisedFrom && j.realisedFrom.role === 'closure');
  const asmOp = (r) => r.diff.operations.find((o) => o.origin && o.origin.kind === 'realised-assembly');

  it('SLIC closure → gibson op, overlap junction kept (not coerced)', () => {
    const r = realiseAssembly(stateWith(), 'zn-1', { 0: 'slic', 1: 'slic' }, {});
    expect(r.ok).toBe(true);
    expect(closureJun(r).realisedFrom.method).toBe('slic');
    expect(asmOp(r).kind).toBe('gibson');
  });
  it('MoClo closure → golden_gate op + BsaI enzyme', () => {
    const r = realiseAssembly(stateWith(), 'zn-1', { 0: 'moclo', 1: 'moclo' }, {});
    expect(r.ok).toBe(true);
    expect(closureJun(r).realisedFrom.method).toBe('moclo');
    expect(asmOp(r).kind).toBe('golden_gate');
    expect(asmOp(r).params.enzyme).toBe('BsaI');
  });
});

/**
 * closure-method-guard-v171 — F2 / V171 (audit assembly-logic-audit
 * wf_cf2017e5-072, method-topology, 28.06). realiseAssembly's ring-closing path
 * took the closure method from perBoundaryMethods / draft.assemblyMethod WITHOUT
 * validating it against the topology. Two biologically-invalid closures could slip
 * through the backend (the UI gates them, but a programmatic / mutated draft does not):
 *   • overlap_pcr — makes a LINEAR product; its ring counterpart is Gibson.
 *   • kld — whole-plasmid self-closure of a SINGLE fragment; cannot join N>1 fragments.
 * Both → fall back to gibson. direct_ligation (blunt) IS a valid closure and must
 * survive (so a membership-in-CLOSURE_METHODS check would be wrong — it omits blunt).
 */
import { describe, it, expect } from 'vitest';
import { realiseAssembly } from '../lib/zone-pieces-to-dag';
import { buildInitialState } from '../store/skeleton-state';

const SEQ1 = 'AAAACCCCGGGGTTTT'.repeat(2); // 32 nt
const SEQ2 = 'TTTTGGGGCCCCAAAA'.repeat(2);
const SEQ3 = 'ACGTACGTACGTACGT'.repeat(2);
const src = (id, seq, name) => ({
  id, kind: 'molecule', name, sequence: seq, annotations: [], topology: { circular: false }, pinned: true,
});
const piece = (id, sid, len) => ({
  id, kind: 'sourced', name: id, sourceIds: [sid],
  ranges: [{ sourceId: sid, start: 0, end: len, orientation: 'forward' }],
  origin: 'selection', acquisitionMethod: 'undefined', zoneId: 'zn-1', createdAt: 1, updatedAt: 1,
});

function circularZone(pieces, sources) {
  const s = buildInitialState();
  return {
    ...s,
    containers: [...s.containers, ...sources],
    zones: [{
      id: 'zn-1', name: 'Z', viewMode: 'sequence', bounds: { x: 0, y: 0, width: 600, height: 400 },
      topology: { circular: true },
    }],
    pieces,
  };
}

const two = () => circularZone(
  [piece('pc1', 'src1', 32), piece('pc2', 'src2', 32)],
  [src('src1', SEQ1, 'p1'), src('src2', SEQ2, 'p2')],
);
const three = () => circularZone(
  [piece('pc1', 'src1', 32), piece('pc2', 'src2', 32), piece('pc3', 'src3', 32)],
  [src('src1', SEQ1, 'p1'), src('src2', SEQ2, 'p2'), src('src3', SEQ3, 'p3')],
);
const closureJun = (r) => r.diff.junctions.find((j) => j.realisedFrom && j.realisedFrom.role === 'closure');
const asmOp = (r) => r.diff.operations.find((o) => o.origin && o.origin.kind === 'realised-assembly');

describe('V171/F2 — closure method guard in realiseAssembly', () => {
  it('overlap_pcr closure on a circular multi-fragment → falls back to gibson', () => {
    const r = realiseAssembly(two(), 'zn-1', { 0: 'overlap_pcr', 1: 'overlap_pcr' }, {});
    expect(r.ok).toBe(true);
    expect(closureJun(r).realisedFrom.method).toBe('gibson');
    expect(asmOp(r).params.method).toBe('gibson'); // op no longer mislabels a linear method on a ring
  });

  it('kld closure on a MULTI-fragment ring → falls back to gibson (kld is single-fragment only)', () => {
    const r = realiseAssembly(three(), 'zn-1', { 0: 'kld', 1: 'kld', 2: 'kld' }, {});
    expect(r.ok).toBe(true);
    expect(closureJun(r).realisedFrom.method).toBe('gibson');
  });

  it('gibson closure stays gibson (valid ring-former untouched)', () => {
    const r = realiseAssembly(two(), 'zn-1', { 0: 'gibson', 1: 'gibson' }, {});
    expect(closureJun(r).realisedFrom.method).toBe('gibson');
  });

  it('restriction closure stays restriction (RE sticky ligation closes a ring)', () => {
    const r = realiseAssembly(two(), 'zn-1', { 0: 'restriction', 1: 'restriction' }, {});
    expect(closureJun(r).realisedFrom.method).toBe('restriction');
  });

  it('direct_ligation (blunt) closure SURVIVES — blunt ligation is a valid ring closure', () => {
    const r = realiseAssembly(two(), 'zn-1', { 0: 'direct_ligation', 1: 'direct_ligation' }, {});
    expect(closureJun(r).realisedFrom.method).toBe('direct_ligation');
  });

  it('single-fragment self-closure with overlap_pcr → gibson; kld stays (valid for 1 frag)', () => {
    const oneFrag = circularZone([piece('pc1', 'src1', 32)], [src('src1', SEQ1, 'p1')]);
    const rOv = realiseAssembly(oneFrag, 'zn-1', { 0: 'overlap_pcr' }, {});
    const selfOv = rOv.diff.operations.find((o) => o.params && o.params.selfClosure);
    expect(selfOv.params.method).toBe('gibson');
    const rKld = realiseAssembly(oneFrag, 'zn-1', { 0: 'kld' }, {});
    const selfKld = rKld.diff.operations.find((o) => o.params && o.params.selfClosure);
    expect(selfKld.params.method).toBe('kld'); // kld valid for a single fragment
  });
});

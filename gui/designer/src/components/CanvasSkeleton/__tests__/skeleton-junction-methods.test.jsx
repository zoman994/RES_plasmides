/**
 * Junction visualization + assembly-method selection logic.
 *
 * 12.05.2026 (NOTES_CANVAS_V2_KICKOFF §2 «Connection auto-detect»):
 *
 *  - `detectJunctionKind(from, to)` — эвристика по `container.ends`.
 *  - `RECONCILE_AUTO_JUNCTIONS` использует detector при создании
 *    новой auto-junction (новое поле `autoDetectedKind`).
 *  - `SET_JUNCTION_KIND` — manual override через popover.
 *  - JunctionMethodPicker рендерит 6 method buttons (overlap / GG /
 *    re_ligation / kld / ligation / blunt).
 *  - StitchMarkers рендерится в SVG для каждого kind (overlap zone /
 *    GG arrows / RE zigzag / KLD dots / blunt bars).
 */
import { describe, it, expect } from 'vitest';
import {
  detectJunctionKind,
  junctionLabel,
  junctionStroke,
} from '../canvas/junction-styles';
import {
  skeletonReducer,
  buildInitialState,
} from '../store/skeleton-state';

// Test-local container builders.
const C = (id, opts = {}) => ({
  id,
  kind: 'molecule',
  name: id,
  sequence: opts.sequence || 'ATGC',
  topology: { circular: opts.circular || false },
  annotations: [],
  ends: opts.ends || null,
});

describe('detectJunctionKind heuristic', () => {
  it('both circular → auto', () => {
    expect(detectJunctionKind(C('a', { circular: true }), C('b', { circular: true }))).toBe('auto');
  });

  it('mixed circular + linear → overlap (Gibson default)', () => {
    expect(detectJunctionKind(C('a', { circular: true }), C('b'))).toBe('overlap');
    expect(detectJunctionKind(C('a'), C('b', { circular: true }))).toBe('overlap');
  });

  it('two linear no-ends → overlap (Gibson default)', () => {
    expect(detectJunctionKind(C('a'), C('b'))).toBe('overlap');
  });

  it('both ends 4-nt cohesive, NO enzyme → re_ligation; a Type IIS enzyme → golden_gate (JC-5)', () => {
    const a = C('a', { ends: { threePrime: { overhang: 'GATC', type: '5overhang' } } });
    const b = C('b', { ends: { fivePrime: { overhang: 'CTAG', type: '5overhang' } } });
    // No enzyme provenance → classic RE cohesive ends, not Golden Gate.
    expect(detectJunctionKind(a, b)).toBe('re_ligation');
    const ggA = C('a', { ends: { threePrime: { overhang: 'GATC', type: '5overhang', enzymeUsed: 'BsaI' } } });
    expect(detectJunctionKind(ggA, b)).toBe('golden_gate');
  });

  it('one side has long overhang (RE digest sticky) → re_ligation', () => {
    const a = C('a', { ends: { threePrime: { overhang: 'AATTC', type: '5overhang' } } });
    const b = C('b', { ends: { fivePrime: { overhang: '', type: 'blunt' } } });
    expect(detectJunctionKind(a, b)).toBe('re_ligation');
  });

  it('both blunt ends → ligation', () => {
    const a = C('a', { ends: { threePrime: { overhang: '', type: 'blunt' } } });
    const b = C('b', { ends: { fivePrime: { overhang: '', type: 'blunt' } } });
    expect(detectJunctionKind(a, b)).toBe('ligation');
  });
});

describe('RECONCILE_AUTO_JUNCTIONS uses detector', () => {
  it('auto-junction created with kind from detector + autoDetectedKind preserved (JC-5: BsaI → golden_gate)', () => {
    let s = buildInitialState();
    // Inject 2 filled containers with Type IIS (BsaI) cohesive ends → golden_gate.
    s = {
      ...s,
      containers: [
        ...s.containers,
        C('test-a', { ends: { threePrime: { overhang: 'GATC', type: '5overhang', enzymeUsed: 'BsaI' } } }),
        C('test-b', { ends: { fivePrime: { overhang: 'CTAG', type: '5overhang', enzymeUsed: 'BsaI' } } }),
      ],
    };
    s = skeletonReducer(s, {
      type: 'RECONCILE_AUTO_JUNCTIONS',
      pairs: [{ fromContainerId: 'test-a', toContainerId: 'test-b' }],
    });
    expect(s.junctions).toHaveLength(1);
    expect(s.junctions[0].kind).toBe('golden_gate');
    expect(s.junctions[0].autoDetectedKind).toBe('golden_gate');
  });

  it('default detection (no ends) → overlap', () => {
    let s = buildInitialState();
    s = {
      ...s,
      containers: [
        ...s.containers,
        C('test-a'),
        C('test-b'),
      ],
    };
    s = skeletonReducer(s, {
      type: 'RECONCILE_AUTO_JUNCTIONS',
      pairs: [{ fromContainerId: 'test-a', toContainerId: 'test-b' }],
    });
    expect(s.junctions[0].kind).toBe('overlap');
  });
});

describe('SET_JUNCTION_KIND', () => {
  it('manual override changes kind, autoDetectedKind preserved', () => {
    let s = buildInitialState();
    s = {
      ...s,
      containers: [...s.containers, C('a'), C('b')],
    };
    s = skeletonReducer(s, {
      type: 'RECONCILE_AUTO_JUNCTIONS',
      pairs: [{ fromContainerId: 'a', toContainerId: 'b' }],
    });
    const jid = s.junctions[0].id;
    expect(s.junctions[0].kind).toBe('overlap');
    expect(s.junctions[0].autoDetectedKind).toBe('overlap');

    s = skeletonReducer(s, { type: 'SET_JUNCTION_KIND', junctionId: jid, kind: 'kld' });
    expect(s.junctions[0].kind).toBe('kld');
    expect(s.junctions[0].autoDetectedKind).toBe('overlap'); // unchanged
  });

  it('same kind → state unchanged (ref equality)', () => {
    let s = buildInitialState();
    s = {
      ...s,
      junctions: [{ id: 'j1', fromContainerId: 'a', toContainerId: 'b', kind: 'overlap' }],
    };
    const s1 = skeletonReducer(s, {
      type: 'SET_JUNCTION_KIND',
      junctionId: 'j1',
      kind: 'overlap',
    });
    expect(s1).toBe(s);
  });

  it('unknown junctionId → no-op', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, { type: 'SET_JUNCTION_KIND', junctionId: 'nope', kind: 'kld' });
    expect(s1).toBe(s0);
  });
});

describe('junction-styles palette parity (v0.5 colors preserved)', () => {
  it('overlap → blue family', () => {
    expect(junctionStroke('overlap')).toMatch(/^#[0-9a-f]+$/i);
    expect(junctionLabel('overlap')).toBe('overlap');
  });
  it('golden_gate → green family + GG label', () => {
    expect(junctionStroke('golden_gate')).toBe('#22c55e');
    expect(junctionLabel('golden_gate')).toBe('GG');
  });
  it('re_ligation → orange + RE label', () => {
    expect(junctionStroke('re_ligation')).toBe('#f97316');
    expect(junctionLabel('re_ligation')).toBe('RE');
  });
  it('kld → purple + KLD label', () => {
    expect(junctionStroke('kld')).toBe('#a855f7');
    expect(junctionLabel('kld')).toBe('KLD');
  });
});

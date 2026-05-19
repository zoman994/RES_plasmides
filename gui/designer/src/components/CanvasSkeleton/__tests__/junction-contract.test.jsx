/**
 * junction-contract.test.jsx — F2 M-CANVAS-JUNCTION Junction Contract +
 * Reactive Cascade.
 *
 * Spec: docs/SPRINT_M-CANVAS-JUNCTION.md §5.
 *
 * Coverage:
 *  K1 — junction shape extension + reducer (defaultJunctionParams,
 *       SET_JUNCTION_KIND reset, SET_JUNCTION_PARAMS mutex,
 *       RESET_JUNCTION_TO_AUTO, RECONCILE status-aware, schema v2→v3).
 *  K2 — reactive selectors (tails / endsRequirements / validation).
 *  K3 — JunctionPopover sections.
 *  K4 — validation warnings + red-dot badge.
 *  K5 — corner toast on auto-recompute.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from '@testing-library/react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import {
  detectJunctionKind,
  defaultJunctionParams,
  inferEndRequirements,
} from '../canvas/junction-styles';
import {
  normalizeJunction,
  selectTailsForJunction,
  selectEndsRequirementsForContainer,
  selectJunctionValidation,
} from '../store/selectors-junction';
import { reverseComplement } from '../../../sequence-utils';
import JunctionPopover from '../canvas/JunctionPopover';
import CanvasLayoutView from '../canvas/CanvasLayoutView';
import { SkeletonProvider, useSkeletonActions } from '../store/skeleton-context';
import { useEffect } from 'react';
import { migrateSnapshot, SCHEMA_VERSION_CURRENT } from '../store/skeleton-persistence';

afterEach(cleanup);
import { bootstrapStore } from '../../../store';
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

// Build a state with explicit filled containers + one junction.
function withJunction(jOverrides = {}) {
  const s = buildInitialState();
  const containers = [
    { id: 'c-from', kind: 'molecule', name: 'FROM', sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT', topology: { circular: false }, annotations: [], ends: {} },
    { id: 'c-to', kind: 'molecule', name: 'TO', sequence: 'TTTTGGGGCCCCAAAATTTTGGGGCCCCAAAA', topology: { circular: false }, annotations: [], ends: {} },
  ];
  const junction = {
    id: 'j1',
    fromContainerId: 'c-from',
    toContainerId: 'c-to',
    kind: 'overlap',
    autoDetectedKind: 'overlap',
    status: 'auto',
    overlapTarget: 'right',
    overlapLength: 30,
    overlapTm: null,
    endRequirements: null,
    ...jOverrides,
  };
  return { ...s, containers, junctions: [junction] };
}

// ════════════════════════════════════════════════════════════════════
// K1 — Shape extension + reducer
// ════════════════════════════════════════════════════════════════════
describe('K1 — defaultJunctionParams (DEC-JUNC-01)', () => {
  it('returns spec defaults per kind', () => {
    expect(defaultJunctionParams('overlap')).toMatchObject({ overlapTarget: 'right', overlapLength: 30, overlapTm: null });
    expect(defaultJunctionParams('re_ligation')).toMatchObject({ overlapTarget: 'right', overlapLength: 30 });
    expect(defaultJunctionParams('golden_gate')).toMatchObject({ overlapTarget: 'right', overlapLength: 4 });
    expect(defaultJunctionParams('kld')).toMatchObject({ overlapTarget: 'both', overlapLength: 0 });
    expect(defaultJunctionParams('ligation')).toMatchObject({ overlapTarget: 'right', overlapLength: 0 });
    expect(defaultJunctionParams('sticky_end')).toMatchObject({ overlapTarget: 'right', overlapLength: 4 });
    expect(defaultJunctionParams('preformed')).toMatchObject({ overlapLength: null, overlapTm: null });
  });
});

describe('K1 — inferEndRequirements', () => {
  it('returns {fromEnd,toEnd} shape with type field', () => {
    const er = inferEndRequirements('overlap', 'right', 30);
    expect(er).toHaveProperty('fromEnd.type');
    expect(er).toHaveProperty('toEnd.type');
    expect(inferEndRequirements('ligation', 'right', 0).fromEnd.type).toBe('blunt');
    expect(inferEndRequirements('golden_gate', 'right', 4).toEnd.type).toBe('overhang');
  });
});

describe('K1 — detectJunctionKind regression (existing 4 rules)', () => {
  it('both circular → auto; both linear no ends → overlap; GG-ish 4nt → golden_gate', () => {
    expect(detectJunctionKind({ topology: { circular: true } }, { topology: { circular: true } })).toBe('auto');
    expect(detectJunctionKind({ topology: { circular: false } }, { topology: { circular: false } })).toBe('overlap');
    expect(detectJunctionKind(
      { topology: { circular: false }, ends: { threePrime: { overhang: 'GATC' } } },
      { topology: { circular: false }, ends: { fivePrime: { overhang: 'CTAG' } } },
    )).toBe('golden_gate');
  });
});

describe('K1 — SET_JUNCTION_KIND (DEC-JUNC-01/02)', () => {
  it('kind change → params reset to new-kind defaults + status=manual; autoDetectedKind preserved', () => {
    let s = withJunction({ kind: 'overlap', autoDetectedKind: 'overlap', status: 'auto', overlapLength: 30 });
    s = skeletonReducer(s, { type: 'SET_JUNCTION_KIND', junctionId: 'j1', kind: 'golden_gate' });
    const j = s.junctions[0];
    expect(j.kind).toBe('golden_gate');
    expect(j.autoDetectedKind).toBe('overlap');
    expect(j.status).toBe('manual');
    expect(j.overlapLength).toBe(4); // GG default
  });

  it('same kind → state unchanged (ref equality preserved)', () => {
    const s = { ...buildInitialState(), junctions: [{ id: 'j1', fromContainerId: 'a', toContainerId: 'b', kind: 'overlap' }] };
    const s1 = skeletonReducer(s, { type: 'SET_JUNCTION_KIND', junctionId: 'j1', kind: 'overlap' });
    expect(s1).toBe(s);
  });

  it('unknown junctionId → no-op', () => {
    const s0 = buildInitialState();
    expect(skeletonReducer(s0, { type: 'SET_JUNCTION_KIND', junctionId: 'nope', kind: 'kld' })).toBe(s0);
  });
});

describe('K1 — SET_JUNCTION_PARAMS mutex (DEC-JUNC-01)', () => {
  it('setting overlapLength clears overlapTm; status→manual', () => {
    let s = withJunction({ overlapLength: null, overlapTm: 60, status: 'auto' });
    s = skeletonReducer(s, { type: 'SET_JUNCTION_PARAMS', junctionId: 'j1', patch: { overlapLength: 25 } });
    const j = s.junctions[0];
    expect(j.overlapLength).toBe(25);
    expect(j.overlapTm).toBeNull();
    expect(j.status).toBe('manual');
  });

  it('setting overlapTm clears overlapLength', () => {
    let s = withJunction({ overlapLength: 30, overlapTm: null });
    s = skeletonReducer(s, { type: 'SET_JUNCTION_PARAMS', junctionId: 'j1', patch: { overlapTm: 58 } });
    const j = s.junctions[0];
    expect(j.overlapTm).toBe(58);
    expect(j.overlapLength).toBeNull();
  });

  it('overlapTarget patch does not clear length/Tm', () => {
    let s = withJunction({ overlapLength: 30, overlapTm: null });
    s = skeletonReducer(s, { type: 'SET_JUNCTION_PARAMS', junctionId: 'j1', patch: { overlapTarget: 'both' } });
    expect(s.junctions[0].overlapTarget).toBe('both');
    expect(s.junctions[0].overlapLength).toBe(30);
  });

  it('unknown junctionId → junctions slice untouched (no-op)', () => {
    const s0 = withJunction();
    // Whole-state ref isn't stable (router ghost-placeholder finalizer);
    // the precise SET_JUNCTION_PARAMS no-op contract is: junctions
    // array reference is preserved.
    const s1 = skeletonReducer(s0, { type: 'SET_JUNCTION_PARAMS', junctionId: 'nope', patch: { overlapLength: 1 } });
    expect(s1.junctions).toBe(s0.junctions);
  });
});

describe('K1 — RESET_JUNCTION_TO_AUTO (DEC-JUNC-02)', () => {
  it('restores autoDetectedKind + defaults + status auto', () => {
    let s = withJunction({ kind: 'kld', autoDetectedKind: 'overlap', status: 'manual', overlapLength: 0, overlapTarget: 'both' });
    s = skeletonReducer(s, { type: 'RESET_JUNCTION_TO_AUTO', junctionId: 'j1' });
    const j = s.junctions[0];
    expect(j.kind).toBe('overlap');
    expect(j.status).toBe('auto');
    expect(j.overlapLength).toBe(30); // overlap default
    expect(j.overlapTarget).toBe('right');
  });
});

describe('K1 — RECONCILE_AUTO_JUNCTIONS status-aware (DEC-JUNC-02/07)', () => {
  it('new auto-junction gets status=auto + default params', () => {
    let s = buildInitialState();
    s = { ...s, containers: [...s.containers,
      { id: 'a', kind: 'molecule', name: 'A', sequence: 'ATGC', topology: { circular: false }, annotations: [], ends: {} },
      { id: 'b', kind: 'molecule', name: 'B', sequence: 'ATGC', topology: { circular: false }, annotations: [], ends: {} },
    ] };
    s = skeletonReducer(s, { type: 'RECONCILE_AUTO_JUNCTIONS', pairs: [{ fromContainerId: 'a', toContainerId: 'b' }] });
    const j = s.junctions.find((x) => x.fromContainerId === 'a');
    expect(j.status).toBe('auto');
    expect(j.kind).toBe('overlap');
    expect(j.overlapLength).toBe(30);
    expect(j.autoDetectedKind).toBe('overlap');
  });

  it('manual junction NOT overwritten on reconcile (status=manual)', () => {
    let s = withJunction({ id: 'j1', fromContainerId: 'x', toContainerId: 'y', kind: 'kld', status: 'manual' });
    s = skeletonReducer(s, { type: 'RECONCILE_AUTO_JUNCTIONS', pairs: [] });
    expect(s.junctions).toHaveLength(1);
    expect(s.junctions[0].kind).toBe('kld');
    expect(s.junctions[0].status).toBe('manual');
  });

  it('legacy junction (no status, kind≠auto) preserved on reconcile', () => {
    let s = { ...buildInitialState(), junctions: [{ id: 'jm', fromContainerId: 'x', toContainerId: 'y', kind: 'gibson' }] };
    s = skeletonReducer(s, { type: 'RECONCILE_AUTO_JUNCTIONS', pairs: [] });
    expect(s.junctions).toHaveLength(1);
    expect(s.junctions[0].kind).toBe('gibson');
  });

  it('auto-junction dropped when pair no longer present', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'RECONCILE_AUTO_JUNCTIONS', pairs: [{ fromContainerId: 'a', toContainerId: 'b' }] });
    expect(s.junctions).toHaveLength(1);
    s = skeletonReducer(s, { type: 'RECONCILE_AUTO_JUNCTIONS', pairs: [] });
    expect(s.junctions).toHaveLength(0);
  });

  it('idempotent — same pairs → same state ref', () => {
    let s = skeletonReducer(buildInitialState(), { type: 'RECONCILE_AUTO_JUNCTIONS', pairs: [{ fromContainerId: 'a', toContainerId: 'b' }] });
    const s1 = s;
    s = skeletonReducer(s, { type: 'RECONCILE_AUTO_JUNCTIONS', pairs: [{ fromContainerId: 'a', toContainerId: 'b' }] });
    expect(s).toBe(s1);
  });
});

describe('K1 — normalizeJunction + schema v2→v3 migration (DEC-JUNC-08)', () => {
  it('normalizeJunction fills missing fields with defaults', () => {
    const n = normalizeJunction({ id: 'j', fromContainerId: 'a', toContainerId: 'b', kind: 'overlap' });
    expect(n.status).toBe('manual'); // kind≠auto → manual (legacy preserve)
    expect(n.overlapTarget).toBe('right');
    expect(n.overlapLength).toBe(30);
    expect(n.autoDetectedKind).toBe('overlap');
  });

  it('normalizeJunction kind=auto → status auto', () => {
    expect(normalizeJunction({ id: 'j', kind: 'auto' }).status).toBe('auto');
  });

  it('already-normalized junction → same reference (identity)', () => {
    const j = normalizeJunction({ id: 'j', kind: 'overlap' });
    expect(normalizeJunction(j)).toBe(j);
  });

  it('SCHEMA_VERSION_CURRENT is 7 (A1=4, T1=5, T2=6, T3=7); v2→v3 still normalizes junctions through the chain', () => {
    expect(SCHEMA_VERSION_CURRENT).toBe(11); // M-CANVAS-WORKFLOW-UX K1: bump 10→11
    const v2 = {
      containers: [], operations: [], positions: {}, cascadeIndex: 0, toasts: [],
      junctions: [{ id: 'j1', fromContainerId: 'a', toContainerId: 'b', kind: 'overlap' }],
    };
    const migrated = migrateSnapshot(v2, 2);
    expect(migrated).toBeTruthy();
    expect(migrated.junctions[0].status).toBe('manual');
    expect(migrated.junctions[0].overlapLength).toBe(30);
  });

  it('full chain v1→v3 still adds toasts + normalizes junctions', () => {
    const v1 = { containers: [], operations: [], positions: {}, junctions: [{ id: 'j1', fromContainerId: 'a', toContainerId: 'b' }], cascadeIndex: 0 };
    const migrated = migrateSnapshot(v1, 1);
    expect(migrated.toasts).toEqual([]);
    expect(migrated.junctions[0].overlapTarget).toBe('right');
  });
});

// ════════════════════════════════════════════════════════════════════
// K2 — Reactive selectors (DEC-JUNC-03)
// ════════════════════════════════════════════════════════════════════
describe('K2 — selectTailsForJunction', () => {
  it('overlap kind length=10 → from 3′ last 10, to 5′ first 10 rev-comp', () => {
    const s = withJunction({ kind: 'overlap', overlapLength: 10, overlapTm: null });
    const t = selectTailsForJunction(s, 'j1');
    const from = s.containers[0].sequence;
    const to = s.containers[1].sequence;
    expect(t).toBeTruthy();
    expect(t.forwardTail).toBe(from.slice(-10));
    expect(t.reverseTail).toBe(reverseComplement(to.slice(0, 10)));
    expect(t.source).toBe('overlap');
  });

  it('golden_gate → 4-nt overhang pattern', () => {
    const s = withJunction({ kind: 'golden_gate', overlapLength: 4, overlapTm: null });
    const t = selectTailsForJunction(s, 'j1');
    expect(t.forwardTail).toHaveLength(4);
    expect(t.source).toBe('golden_gate');
  });

  it('preformed kind → null', () => {
    const s = withJunction({ kind: 'preformed', overlapLength: null });
    expect(selectTailsForJunction(s, 'j1')).toBeNull();
  });

  it('overlapTm set (no length) → derives a positive-length tail', () => {
    const s = withJunction({ kind: 'overlap', overlapLength: null, overlapTm: 50 });
    const t = selectTailsForJunction(s, 'j1');
    expect(t).toBeTruthy();
    expect(t.forwardTail.length).toBeGreaterThan(0);
  });

  it('unknown junction → null', () => {
    expect(selectTailsForJunction(withJunction(), 'nope')).toBeNull();
  });
});

describe('K2 — selectEndsRequirementsForContainer', () => {
  it('aggregates incoming toEnd as required5′, outgoing fromEnd as required3′; no conflict', () => {
    const s = buildInitialState();
    const st = {
      ...s,
      containers: [
        { id: 'A', kind: 'molecule', name: 'A', sequence: 'ATGC', topology: { circular: false }, annotations: [] },
        { id: 'C', kind: 'molecule', name: 'C', sequence: 'ATGC', topology: { circular: false }, annotations: [] },
        { id: 'B', kind: 'molecule', name: 'B', sequence: 'ATGC', topology: { circular: false }, annotations: [] },
      ],
      junctions: [
        normalizeJunction({ id: 'L', fromContainerId: 'A', toContainerId: 'C', kind: 'overlap', endRequirements: { fromEnd: { type: 'overhang' }, toEnd: { type: 'overhang', overhang: 'ATCG' } } }),
        normalizeJunction({ id: 'R', fromContainerId: 'C', toContainerId: 'B', kind: 'overlap', endRequirements: { fromEnd: { type: 'overhang', overhang: 'GGTT' }, toEnd: { type: 'overhang' } } }),
      ],
    };
    const r = selectEndsRequirementsForContainer(st, 'C');
    expect(r.required5prime).toMatchObject({ overhang: 'ATCG' });
    expect(r.required3prime).toMatchObject({ overhang: 'GGTT' });
    expect(r.conflicts).toEqual([]);
  });
});

describe('K2 — selectJunctionValidation (DEC-JUNC-04)', () => {
  it('compatible / no neighbour → ok:true, no warnings', () => {
    const s = withJunction({ kind: 'overlap' });
    const v = selectJunctionValidation(s, 'j1');
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
  });

  it('sticky overhang sequence mismatch around shared container → warning', () => {
    const st = {
      ...buildInitialState(),
      containers: [
        { id: 'A', kind: 'molecule', name: 'A', sequence: 'ATGC', topology: { circular: false }, annotations: [] },
        { id: 'C', kind: 'molecule', name: 'C', sequence: 'ATGC', topology: { circular: false }, annotations: [] },
        { id: 'B', kind: 'molecule', name: 'B', sequence: 'ATGC', topology: { circular: false }, annotations: [] },
      ],
      junctions: [
        normalizeJunction({ id: 'L', fromContainerId: 'A', toContainerId: 'C', kind: 're_ligation', status: 'manual', endRequirements: { fromEnd: { type: 'overhang' }, toEnd: { type: 'overhang', overhang: 'ATCG' } } }),
        normalizeJunction({ id: 'R', fromContainerId: 'C', toContainerId: 'B', kind: 're_ligation', status: 'manual', endRequirements: { fromEnd: { type: 'overhang', overhang: 'ATCC' }, toEnd: { type: 'overhang' } } }),
      ],
    };
    const v = selectJunctionValidation(st, 'L');
    expect(v.ok).toBe(false);
    expect(v.warnings.join(' ')).toMatch(/sticky|overhang|mismatch|несовмест/i);
  });

  it('both neighbours overlapTarget="both" → NOT a conflict (DEC-JUNC-04)', () => {
    const st = {
      ...buildInitialState(),
      containers: [
        { id: 'A', kind: 'molecule', name: 'A', sequence: 'ATGC', topology: { circular: false }, annotations: [] },
        { id: 'C', kind: 'molecule', name: 'C', sequence: 'ATGC', topology: { circular: false }, annotations: [] },
        { id: 'B', kind: 'molecule', name: 'B', sequence: 'ATGC', topology: { circular: false }, annotations: [] },
      ],
      junctions: [
        normalizeJunction({ id: 'L', fromContainerId: 'A', toContainerId: 'C', kind: 'overlap', overlapTarget: 'both' }),
        normalizeJunction({ id: 'R', fromContainerId: 'C', toContainerId: 'B', kind: 'overlap', overlapTarget: 'both' }),
      ],
    };
    const v = selectJunctionValidation(st, 'L');
    expect(v.warnings.join(' ')).not.toMatch(/overlap target conflict/i);
  });
});

// ════════════════════════════════════════════════════════════════════
// K3 — JunctionPopover (DEC-JUNC-06)
// ════════════════════════════════════════════════════════════════════
function J(over = {}) {
  return {
    id: 'j1', fromContainerId: 'A', toContainerId: 'B',
    kind: 'overlap', autoDetectedKind: 'overlap', status: 'auto',
    overlapTarget: 'right', overlapLength: 30, overlapTm: null,
    endRequirements: null, ...over,
  };
}
function renderPopover(props = {}) {
  return render(
    <JunctionPopover
      junction={props.junction || J()}
      position={{ x: 100, y: 100 }}
      warnings={props.warnings || []}
      onPick={props.onPick || (() => {})}
      onSetParams={props.onSetParams || (() => {})}
      onResetAuto={props.onResetAuto || (() => {})}
      onCancel={props.onCancel || (() => {})}
    />,
  );
}

describe('K3 — JunctionPopover sections', () => {
  it('renders header + kind picker + overlap params + ends preview for overlap', () => {
    renderPopover();
    expect(screen.getByTestId('junction-popover')).toBeTruthy();
    expect(screen.getByTestId('junction-popover-kinds')).toBeTruthy();
    expect(screen.getByTestId('junction-popover-overlap-params')).toBeTruthy();
    expect(screen.getByTestId('junction-popover-ends-preview')).toBeTruthy();
  });

  it('overlap params section hidden for kind=preformed', () => {
    renderPopover({ junction: J({ kind: 'preformed', overlapLength: null }) });
    expect(screen.queryByTestId('junction-popover-overlap-params')).toBeNull();
  });

  it('click a kind button → onPick(kind)', () => {
    let picked = null;
    renderPopover({ onPick: (k) => { picked = k; } });
    fireEvent.click(screen.getByTestId('junction-popover-kind-golden_gate'));
    expect(picked).toBe('golden_gate');
  });

  it('overlapTarget toggle → onSetParams({overlapTarget})', () => {
    let patch = null;
    renderPopover({ onSetParams: (p) => { patch = p; } });
    fireEvent.click(screen.getByTestId('junction-popover-target-both'));
    expect(patch).toEqual({ overlapTarget: 'both' });
  });

  it('length active → Tm input disabled; switching to Tm calls onSetParams with overlapTm', () => {
    let patch = null;
    renderPopover({ junction: J({ overlapLength: 30, overlapTm: null }), onSetParams: (p) => { patch = p; } });
    const tmInput = screen.getByTestId('junction-popover-tm-input');
    expect(tmInput.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('junction-popover-mode-tm'));
    expect(patch).toHaveProperty('overlapTm');
    expect(patch.overlapTm).toBeGreaterThan(0);
  });

  it('editing length input → onSetParams({overlapLength:N})', () => {
    let patch = null;
    renderPopover({ onSetParams: (p) => { patch = p; } });
    const lenInput = screen.getByTestId('junction-popover-length-input');
    fireEvent.change(lenInput, { target: { value: '22' } });
    expect(patch).toEqual({ overlapLength: 22 });
  });

  it('status indicator reflects auto vs manual', () => {
    const { rerender } = renderPopover({ junction: J({ status: 'auto' }) });
    expect(screen.getByTestId('junction-popover-status').getAttribute('data-status')).toBe('auto');
    rerender(
      <JunctionPopover junction={J({ status: 'manual' })} position={{ x: 0, y: 0 }} warnings={[]}
        onPick={() => {}} onSetParams={() => {}} onResetAuto={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByTestId('junction-popover-status').getAttribute('data-status')).toBe('manual');
  });

  it('Reset to auto → onResetAuto; close → onCancel', () => {
    let reset = false; let cancelled = false;
    renderPopover({ onResetAuto: () => { reset = true; }, onCancel: () => { cancelled = true; } });
    fireEvent.click(screen.getByTestId('junction-popover-reset-auto'));
    expect(reset).toBe(true);
    fireEvent.click(screen.getByTestId('junction-popover-close'));
    expect(cancelled).toBe(true);
  });

  it('validation warnings → section 4 renders bullets', () => {
    renderPopover({ warnings: ['Несовместимые sticky-overhang: ATCG ↔ ATCC'] });
    const sec = screen.getByTestId('junction-popover-validation');
    expect(sec.textContent).toMatch(/sticky-overhang/);
  });

  it('no warnings → validation section absent', () => {
    renderPopover({ warnings: [] });
    expect(screen.queryByTestId('junction-popover-validation')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// K4 — Validation red-dot on junction badge (DEC-JUNC-04)
// ════════════════════════════════════════════════════════════════════
let k4Actions = null;
function K4Harness() {
  k4Actions = useSkeletonActions();
  useEffect(() => {
    const mk = (id) => ({
      id, kind: 'molecule', name: id,
      sequence: 'ATGCATGCATGCATGC', topology: { circular: false }, annotations: [], ends: {},
    });
    k4Actions.addContainer(mk('A'), { x: 40, y: 100 });
    k4Actions.addContainer(mk('C'), { x: 340, y: 100 });
    k4Actions.addContainer(mk('B'), { x: 640, y: 100 });
    k4Actions.setPosition('A', { x: 40, y: 100 });
    k4Actions.setPosition('C', { x: 340, y: 100 });
    k4Actions.setPosition('B', { x: 640, y: 100 });
    k4Actions.reconcileAutoJunctions([
      { fromContainerId: 'A', toContainerId: 'C' },
      { fromContainerId: 'C', toContainerId: 'B' },
    ]);
    // Force an end-TYPE mismatch around shared container C:
    // L (A→C) blunt-ended ligation vs R (C→B) overhang overlap.
    k4Actions.setJunctionKind('j-auto-A-C', 'ligation');
    k4Actions.setJunctionKind('j-auto-C-B', 'overlap');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// ════════════════════════════════════════════════════════════════════
// K5 — Corner toast on auto-recompute (DEC-JUNC-05)
// ════════════════════════════════════════════════════════════════════
describe('K5 — RECONCILE auto kind-change pushes info toast', () => {
  const CC = (id, ends) => ({
    id, kind: 'molecule', name: id, sequence: 'ATGCATGC',
    topology: { circular: false }, annotations: [], ends: ends || {},
  });

  it('status=auto junction whose detected kind flips → info toast in state.toasts', () => {
    let s = buildInitialState();
    s = { ...s, containers: [...s.containers, CC('A'), CC('C')] };
    s = skeletonReducer(s, { type: 'RECONCILE_AUTO_JUNCTIONS', pairs: [{ fromContainerId: 'A', toContainerId: 'C' }] });
    const j0 = s.junctions.find((x) => x.fromContainerId === 'A');
    expect(j0.kind).toBe('overlap');
    expect(j0.status).toBe('auto');

    // Give the containers GG-like 4-nt overhangs so detectJunctionKind
    // now returns golden_gate, then reconcile the same pair again.
    s = {
      ...s,
      containers: s.containers.map((c) => {
        if (c.id === 'A') return { ...c, ends: { threePrime: { overhang: 'GATC' } } };
        if (c.id === 'C') return { ...c, ends: { fivePrime: { overhang: 'CTAG' } } };
        return c;
      }),
    };
    s = skeletonReducer(s, { type: 'RECONCILE_AUTO_JUNCTIONS', pairs: [{ fromContainerId: 'A', toContainerId: 'C' }] });
    const j1 = s.junctions.find((x) => x.fromContainerId === 'A');
    expect(j1.kind).toBe('golden_gate'); // recomputed
    expect((s.toasts || []).some((t) => t.kind === 'info')).toBe(true);
  });

  it('status=manual junction is NOT recomputed → no toast', () => {
    let s = buildInitialState();
    s = { ...s, containers: [...s.containers, CC('A'), CC('C')] };
    s = skeletonReducer(s, { type: 'RECONCILE_AUTO_JUNCTIONS', pairs: [{ fromContainerId: 'A', toContainerId: 'C' }] });
    const jid = s.junctions.find((x) => x.fromContainerId === 'A').id;
    s = skeletonReducer(s, { type: 'SET_JUNCTION_KIND', junctionId: jid, kind: 'kld' }); // → manual
    const toastsBefore = (s.toasts || []).length;
    s = {
      ...s,
      containers: s.containers.map((c) => {
        if (c.id === 'A') return { ...c, ends: { threePrime: { overhang: 'GATC' } } };
        if (c.id === 'C') return { ...c, ends: { fivePrime: { overhang: 'CTAG' } } };
        return c;
      }),
    };
    s = skeletonReducer(s, { type: 'RECONCILE_AUTO_JUNCTIONS', pairs: [{ fromContainerId: 'A', toContainerId: 'C' }] });
    expect(s.junctions.find((x) => x.fromContainerId === 'A').kind).toBe('kld'); // untouched
    expect((s.toasts || []).length).toBe(toastsBefore); // no new toast
  });
});

describe('K4 — junction badge red-dot from selectJunctionValidation', () => {
  it('conflicting pair → red dot on the flagged junction; clean junction has none', () => {
    render(
      <SkeletonProvider>
        <K4Harness />
        <CanvasLayoutView />
      </SkeletonProvider>,
    );
    // L = j-auto-A-C: its toEnd (blunt) vs neighbour R fromEnd (overhang)
    // → warning → red dot.
    expect(screen.getByTestId('skeleton-junction-warning-j-auto-A-C')).toBeTruthy();
    const gL = screen.getByTestId('skeleton-junction-j-auto-A-C');
    expect(gL.getAttribute('data-warn')).toBe('true');
    // R = j-auto-C-B has no downstream neighbour sharing B → no warning.
    expect(screen.queryByTestId('skeleton-junction-warning-j-auto-C-B')).toBeNull();
    const gR = screen.getByTestId('skeleton-junction-j-auto-C-B');
    expect(gR.getAttribute('data-warn')).toBe('false');
  });
});

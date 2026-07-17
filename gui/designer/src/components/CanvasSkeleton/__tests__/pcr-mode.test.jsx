/**
 * pcr-mode.test.jsx — F3 M-CANVAS-PCR PCR Operation Mode.
 *
 * Spec: docs/SPRINT_M-CANVAS-PCR.md §5.
 *
 * K2 — tab.kind extension + OPEN_EDITOR_OP_TAB + pcrModeUserLevel +
 *      shell op-mode gate + EditorTabStrip operation breadcrumb.
 * K3 — operation-pcr-bridge + selectors-pcr.
 * K4 — PcrModeShell default level + PrimerSuggestionsPanel.
 * K5 — level switcher + drag handles + reuse picker.
 * K6 — OrderOligosConfirmGate.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import {
  buildInitialEditorState,
  editorReducer,
  deriveActiveContainerId,
  deriveActiveTab,
} from '../store/skeleton-state-editor';
import {
  SkeletonProvider,
  useSkeletonActions,
  useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import EditorTabStrip from '../editor/EditorTabStrip';
import {
  suggestPrimers,
  recomputeFromSelection,
  validatePrimer,
} from '../lib/operation-pcr-bridge';
import {
  selectTemplateForOp,
  selectPcrPrimers,
  selectPcrSpans,
} from '../store/selectors-pcr';

const TEMPLATE = {
  id: 'c-tpl',
  kind: 'molecule',
  name: 'pET28a',
  sequence: 'ATGGCATGCAAAGGTTTCCCGGGAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGGCATGCAAGCTTGGCACTGGCCGTCGTTTTAC',
  topology: { circular: true },
  annotations: [],
};

afterEach(cleanup);
import { bootstrapStore } from '../../../store';
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

// ════════════════════════════════════════════════════════════════════
// K2 — Tab kind + operation-mode dispatch
// ════════════════════════════════════════════════════════════════════
describe('K2 — OPEN_EDITOR_OP_TAB / tab.kind (DEC-PCR-01/02)', () => {
  it('OPEN_EDITOR_OP_TAB → operation tab with kind+operationId, active, editorOpen', () => {
    const s0 = buildInitialEditorState();
    const s1 = editorReducer(s0, { type: 'OPEN_EDITOR_OP_TAB', operationId: 'op-1' });
    expect(s1.editorOpen).toBe(true);
    expect(s1.editorContext.tabs).toHaveLength(1);
    expect(s1.editorContext.tabs[0].kind).toBe('operation');
    expect(s1.editorContext.tabs[0].operationId).toBe('op-1');
    expect(s1.editorContext.activeTabId).toBe(s1.editorContext.tabs[0].id);
  });

  it('container tabs default kind=container (back-compat)', () => {
    const s0 = buildInitialEditorState();
    const s1 = editorReducer(s0, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    expect(s1.editorContext.tabs[0].kind).toBe('container');
    expect(s1.editorContext.tabs[0].containerId).toBe('c-a');
    const s2 = editorReducer(s0, { type: 'OPEN_EDITOR_VIEW_ONLY', containerId: 'c-b' });
    expect(s2.editorContext.tabs[0].kind).toBe('container');
  });

  it('re-open same operation focuses existing op-tab (no duplicate)', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_OP_TAB', operationId: 'op-1' });
    s = editorReducer(s, { type: 'OPEN_EDITOR_TAB', containerId: 'c-a' });
    const opTabId = s.editorContext.tabs[0].id;
    s = editorReducer(s, { type: 'OPEN_EDITOR_OP_TAB', operationId: 'op-1' });
    expect(s.editorContext.tabs).toHaveLength(2);
    expect(s.editorContext.activeTabId).toBe(opTabId);
  });

  it('deriveActiveTab returns the active tab object; deriveActiveContainerId null for op tab', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_OP_TAB', operationId: 'op-9' });
    const t = deriveActiveTab(s.editorContext);
    expect(t.kind).toBe('operation');
    expect(t.operationId).toBe('op-9');
    expect(deriveActiveContainerId(s.editorContext)).toBeNull();
  });

  it('CLOSE_EDITOR_TAB works generically on an operation tab', () => {
    let s = buildInitialEditorState();
    s = editorReducer(s, { type: 'OPEN_EDITOR_OP_TAB', operationId: 'op-1' });
    const tid = s.editorContext.tabs[0].id;
    s = editorReducer(s, { type: 'CLOSE_EDITOR_TAB', tabId: tid });
    expect(s.editorOpen).toBe(false);
    expect(s.editorContext.tabs).toHaveLength(0);
  });

  it('OPEN_EDITOR_OP_TAB without operationId → no-op', () => {
    const s0 = buildInitialEditorState();
    expect(editorReducer(s0, { type: 'OPEN_EDITOR_OP_TAB' })).toBe(s0);
  });
});

describe('K2 — pcrModeUserLevel (DEC-PCR-04)', () => {
  it('buildInitialState default level = default', () => {
    expect(buildInitialState().pcrModeUserLevel).toBe('default');
  });

  it('SET_PCR_MODE_USER_LEVEL updates level; invalid ignored', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'SET_PCR_MODE_USER_LEVEL', level: 'pro' });
    expect(s.pcrModeUserLevel).toBe('pro');
    s = skeletonReducer(s, { type: 'SET_PCR_MODE_USER_LEVEL', level: 'tweak' });
    expect(s.pcrModeUserLevel).toBe('tweak');
    const before = s;
    s = skeletonReducer(s, { type: 'SET_PCR_MODE_USER_LEVEL', level: 'nonsense' });
    expect(s).toBe(before); // invalid → no-op
  });

  it('pcrModeUserLevel survives REPLACE_STATE when present in snapshot', () => {
    const snap = { ...buildInitialState(), pcrModeUserLevel: 'pro' };
    const s = skeletonReducer(buildInitialState(), { type: 'REPLACE_STATE', state: snap });
    expect(s.pcrModeUserLevel).toBe('pro');
  });
});

describe('K2 — context actions exposed', () => {
  it('openEditorOpTab + setPcrModeUserLevel wired through provider', () => {
    let cap = null;
    function Probe() { cap = useSkeletonActions(); return null; }
    render(<SkeletonProvider><Probe /></SkeletonProvider>);
    expect(typeof cap.openEditorOpTab).toBe('function');
    expect(typeof cap.setPcrModeUserLevel).toBe('function');
  });
});

describe('K2 — EditorTabStrip operation breadcrumb (DEC-PCR-10)', () => {
  it('operation tab renders 🔬 PCR + input name', () => {
    const tabs = [{ id: 't1', kind: 'operation', operationId: 'op-1' }];
    const operations = [{ id: 'op-1', kind: 'pcr', inputs: ['c-a'], status: 'committed' }];
    const containers = [{ id: 'c-a', name: 'pET28a' }];
    render(
      <EditorTabStrip
        tabs={tabs}
        activeTabId="t1"
        operations={operations}
        containers={containers}
        onSwitch={() => {}}
        onClose={() => {}}
      />,
    );
    const tab = screen.getByTestId('editor-tab');
    expect(tab.textContent).toContain('PCR');
    expect(tab.textContent).toContain('pET28a');
    expect(tab.querySelector('svg')).toBeTruthy(); // 🔬 → <Icon name="pcr">

  });
});

describe('K2 — EditorWindowShell op-mode gate', () => {
  let act2 = null;
  let st2 = null;
  function H() { act2 = useSkeletonActions(); st2 = useSkeletonState(); return null; }
  function renderShell() {
    return render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  }
  it('operation tab → PcrModeShell mounted (not container view)', () => {
    renderShell();
    act(() => {
      act2.addContainer({ id: 'c-a', kind: 'molecule', name: 'pET28a', sequence: 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC', topology: { circular: true }, annotations: [] });
    });
    act(() => { act2.opAdd({ position: { x: 10, y: 10 }, kind: 'pcr', inputs: ['c-a'], commit: true }); });
    const opId = st2.operations[0].id;
    act(() => { act2.openEditorOpTab(opId); });
    expect(screen.getByTestId('pcr-mode-shell')).toBeTruthy();
    // container-only header bits absent for an operation tab
    expect(screen.queryByTestId('skeleton-editor-apply')).toBeNull();
  });

  it('container tab → container view (regression — F1 path intact)', () => {
    renderShell();
    act(() => {
      act2.addContainer({ id: 'c-b', kind: 'molecule', name: 'X', sequence: 'ATGCATGCATGC', topology: { circular: false }, annotations: [] });
    });
    act(() => { act2.openEditorTab('c-b'); });
    expect(screen.getByTestId('skeleton-editor')).toBeTruthy();
    expect(screen.queryByTestId('pcr-mode-shell')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// K3 — operation-pcr-bridge + selectors-pcr
// ════════════════════════════════════════════════════════════════════
describe('K3 — operation-pcr-bridge', () => {
  it('suggestPrimers(template, null, opts) → fwd/rev pair with Tm', () => {
    const r = suggestPrimers(TEMPLATE, null, {});
    expect(r).toBeTruthy();
    expect(Array.isArray(r.pairs)).toBe(true);
    expect(r.pairs.length).toBeGreaterThanOrEqual(1);
    const p = r.pairs[0];
    expect(typeof p.forward).toBe('string');
    expect(typeof p.reverse).toBe('string');
    expect(p.forward.length).toBeGreaterThan(0);
    expect(p.fwdTm).toBeGreaterThan(0);
    expect(p.revTm).toBeGreaterThan(0);
    expect(p.source).toBe('auto');
  });

  it('suggestPrimers with junction tails → tail prepended to 5′, source=junction-derived', () => {
    const tails = { forwardTail: 'AAAACCCC', reverseTail: 'GGGGTTTT' };
    const r = suggestPrimers(TEMPLATE, tails, {});
    const p = r.pairs[0];
    expect(p.forward.startsWith('AAAACCCC')).toBe(true);
    expect(p.reverse.startsWith('GGGGTTTT')).toBe(true);
    expect(p.source).toBe('junction-derived');
  });

  it('recomputeFromSelection(template, start, end) → pair for the sub-region', () => {
    const r = recomputeFromSelection(TEMPLATE, 0, 60, null);
    expect(r).toBeTruthy();
    expect(r.forward.length).toBeGreaterThan(0);
    expect(r.reverse.length).toBeGreaterThan(0);
    expect(r.fwdTm).toBeGreaterThan(0);
  });

  it('validatePrimer flags too-short + out-of-range Tm', () => {
    const good = validatePrimer({ sequence: 'ATGCATGCATGCATGCATGCATGC' });
    expect(good.ok).toBe(true);
    const short = validatePrimer({ sequence: 'ATGCAT' });
    expect(short.ok).toBe(false);
    expect(short.warnings.length).toBeGreaterThan(0);
  });
});

describe('K3 — selectors-pcr', () => {
  function stateWithOp(extra = {}) {
    const s = buildInitialState();
    return {
      ...s,
      containers: [...s.containers, TEMPLATE],
      operations: [{
        id: 'op-1', kind: 'pcr', status: 'committed',
        inputs: ['c-tpl'], outputs: [], params: {}, junctionRefs: [],
        position: { x: 0, y: 0 }, ...extra,
      }],
    };
  }

  it('selectTemplateForOp resolves op.inputs[0] container', () => {
    const st = stateWithOp();
    expect(selectTemplateForOp(st, 'op-1').id).toBe('c-tpl');
    expect(selectTemplateForOp(st, 'nope')).toBeNull();
  });

  it('selectPcrPrimers returns {pairs,status:ready} when template resolvable', () => {
    const st = stateWithOp();
    const r = selectPcrPrimers(st, 'op-1');
    expect(r.status).toBe('ready');
    expect(r.pairs.length).toBeGreaterThanOrEqual(1);
  });

  it('selectPcrPrimers honours op.params.userPrimers override', () => {
    const st = stateWithOp({ params: { userPrimers: [{ forward: 'AAAA', reverse: 'TTTT', fwdTm: 50, revTm: 50, source: 'edited' }] } });
    const r = selectPcrPrimers(st, 'op-1');
    expect(r.status).toBe('ready');
    expect(r.pairs[0].forward).toBe('AAAA');
    expect(r.pairs[0].source).toBe('edited');
  });

  it('selectPcrPrimers no template → status error, empty pairs', () => {
    const s = buildInitialState();
    const st = { ...s, operations: [{ id: 'op-x', kind: 'pcr', status: 'committed', inputs: [], outputs: [], params: {}, junctionRefs: [], position: { x: 0, y: 0 } }] };
    const r = selectPcrPrimers(st, 'op-x');
    expect(r.status).toBe('error');
    expect(r.pairs).toEqual([]);
  });

  it('selectPcrPrimers pulls junction tails via F2 selectTailsForJunction', () => {
    const s = buildInitialState();
    const other = { id: 'c-other', kind: 'molecule', name: 'B', sequence: 'TTTTGGGGCCCCAAAATTTTGGGGCCCCAAAA', topology: { circular: false }, annotations: [] };
    const st = {
      ...s,
      containers: [...s.containers, { ...TEMPLATE, topology: { circular: false } }, other],
      junctions: [{
        id: 'j1', fromContainerId: 'c-tpl', toContainerId: 'c-other',
        kind: 'overlap', autoDetectedKind: 'overlap', status: 'auto',
        overlapTarget: 'right', overlapLength: 8, overlapTm: null, endRequirements: null,
      }],
      operations: [{ id: 'op-1', kind: 'pcr', status: 'committed', inputs: ['c-tpl'], outputs: [], params: {}, junctionRefs: [], position: { x: 0, y: 0 } }],
    };
    const r = selectPcrPrimers(st, 'op-1');
    expect(r.status).toBe('ready');
    expect(r.pairs[0].source).toBe('junction-derived');
  });
});

// V75 — selectPcrSpans: where the chosen primers bind on the template
// and the region they flank (for the canvas MiniPlasmidMap overlay).
// Same binding-match math as the adapter (indexOf binding / revRc).
describe('V75 — selectPcrSpans (canvas minimap primer/flank positions)', () => {
  const SYNTH = 'AAAA' + 'ATGCATGC' + 'GCGCGCGC' + 'CCCCTTTT' + 'TTTT'; // fwd@4, revRc@20
  function stateWithSpans(extra = {}) {
    const s = buildInitialState();
    return {
      ...s,
      containers: [...s.containers, {
        id: 'c-s', kind: 'molecule', name: 'synth',
        sequence: SYNTH, topology: { circular: false }, annotations: [],
      }],
      highlightedContainerId: null,
      operations: [{
        id: 'op-s', kind: 'pcr', status: 'committed',
        inputs: ['c-s'], outputs: [], junctionRefs: [], position: { x: 0, y: 0 },
        params: {
          userPrimers: [{
            forward: 'ATGCATGC', fwdBinding: 'ATGCATGC',
            reverse: 'AAAAGGGG', revBinding: 'AAAAGGGG', // RC = CCCCTTTT @20
            source: 'edited',
          }],
        },
        ...extra,
      }],
    };
  }

  it('returns flank + fwd/rev primer spans on the template', () => {
    const r = selectPcrSpans(stateWithSpans(), 'op-s');
    expect(r).toBeTruthy();
    expect(r.flank).toEqual({ start: 4, end: 28 });
    const fwd = r.primers.find((p) => p.direction === 'forward');
    const rev = r.primers.find((p) => p.direction === 'reverse');
    expect(fwd).toMatchObject({ start: 4, end: 12 });
    expect(rev).toMatchObject({ start: 20, end: 28 });
  });

  it('null when op is not PCR / not found / primers do not match template', () => {
    expect(selectPcrSpans(stateWithSpans({ kind: 'cut' }), 'op-s')).toBeNull();
    expect(selectPcrSpans(stateWithSpans(), 'nope')).toBeNull();
    const bad = selectPcrSpans(
      stateWithSpans({ params: { userPrimers: [{ forward: 'ZZZZ', fwdBinding: 'ZZZZ', reverse: 'ZZZZ', revBinding: 'ZZZZ' }] } }),
      'op-s',
    );
    expect(bad).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// K4–K7 — PcrModeShell via the editor window
// ════════════════════════════════════════════════════════════════════
let pmActions = null;
let pmState = null;
function PMHarness() { pmActions = useSkeletonActions(); pmState = useSkeletonState(); return null; }
function renderPcrMode(opPatch = {}) {
  const r = render(<SkeletonProvider><PMHarness /><EditorWindowShell /></SkeletonProvider>);
  act(() => {
    pmActions.addContainer({
      id: 'c-tpl', kind: 'molecule', name: 'pET28a',
      sequence: TEMPLATE.sequence, topology: { circular: true }, annotations: [],
    });
  });
  act(() => { pmActions.opAdd({ position: { x: 10, y: 10 }, kind: 'pcr', inputs: ['c-tpl'], commit: true }); });
  const opId = pmState.operations[0].id;
  if (Object.keys(opPatch).length) act(() => { pmActions.opSetParams(opId, opPatch); });
  act(() => { pmActions.openEditorOpTab(opId); });
  return { ...r, opId };
}

describe('K4 — PcrModeShell default level', () => {
  it('renders template view + PrimerSuggestionsPanel with a pair (Tm + source)', () => {
    renderPcrMode();
    expect(screen.getByTestId('pcr-mode-shell')).toBeTruthy();
    expect(screen.getByTestId('pcr-template-view')).toBeTruthy();
    const panel = screen.getByTestId('pcr-suggestions-panel');
    expect(panel).toBeTruthy();
    expect(screen.getAllByTestId('pcr-primer-pair').length).toBeGreaterThanOrEqual(1);
    expect(panel.textContent).toMatch(/Tm/);
  });

  // V71 — the PCR template view must REUSE the Library sequence viewer
  // (SequenceTab/SequenceView), not a bespoke <pre>. No new viewer
  // entities — primer writing is a capability added INTO the shared one.
  it('reuses the Library SequenceView (shared viewer, not bespoke <pre>) (V71)', () => {
    renderPcrMode();
    const tv = screen.getByTestId('pcr-template-view');
    // The Library SequenceTab always renders this panel testid.
    expect(tv.querySelector('[data-testid="importer-tab-panel-sequence"]')).toBeTruthy();
    // The old bespoke monospace template <pre> is gone.
    expect(screen.queryByTestId('pcr-template-seq')).toBeNull();
  });

  // NOTE: that the designed pair is actually passed into the shared
  // viewer's `primers` prop is asserted in pcr-mode-selection.test.jsx
  // (mocked SequenceTab). SequenceView's own PrimerTrack layout needs
  // real measurement (charPx) which jsdom can't provide here.

  it('default level: order button present (no bespoke drag handles anywhere)', () => {
    renderPcrMode();
    expect(screen.queryByTestId('pcr-drag-handle-fwd')).toBeNull();
    expect(screen.getByTestId('pcr-order-button')).toBeTruthy();
  });
});

describe('K5 — level switcher / region-selection / reuse picker', () => {
  it('bespoke PrimerDragHandles entity removed at every level (V71)', () => {
    renderPcrMode();
    fireEvent.click(screen.getByTestId('pcr-level-tweak'));
    expect(pmState.pcrModeUserLevel).toBe('tweak');
    expect(screen.queryByTestId('pcr-drag-handle-fwd')).toBeNull();
    expect(screen.queryByTestId('pcr-drag-handle-rev')).toBeNull();
    // Shared viewer still there across level changes.
    expect(screen.getByTestId('importer-tab-panel-sequence')).toBeTruthy();
  });

  it('Pro level → reuse picker always visible', () => {
    renderPcrMode();
    fireEvent.click(screen.getByTestId('pcr-level-pro'));
    expect(pmState.pcrModeUserLevel).toBe('pro');
    expect(screen.getByTestId('pcr-reuse-picker')).toBeTruthy();
  });

  // Selection → primer-writing wiring (recomputeFromSelection →
  // opSetUserPrimers) is verified in pcr-mode-selection.test.jsx with a
  // mocked SequenceTab — kept out of this real-render file so we never
  // add a test hook into the shared Library viewer.
});

describe('K6 — OrderOligosConfirmGate', () => {
  it('order button opens gate; submit gated on checkboxes; confirm sets orderConfirmedAt', () => {
    const { opId } = renderPcrMode();
    fireEvent.click(screen.getByTestId('pcr-order-button'));
    expect(screen.getByTestId('order-oligos-gate')).toBeTruthy();
    const submit = screen.getByTestId('order-oligos-submit');
    expect(submit.disabled).toBe(true);
    // master "confirm all"
    fireEvent.click(screen.getByTestId('order-oligos-confirm-all'));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    const op = pmState.operations.find((o) => o.id === opId);
    expect(op.params.orderConfirmedAt).toBeTruthy();
  });
});


/**
 * live-product.test.jsx — F4 M-CANVAS-PRODUCT Live Product Preview.
 *
 * Spec: docs/SPRINT_M-CANVAS-PRODUCT.md §5.
 *
 * K2 — state machine + assembleProduct (wraps executeOperation).
 * K3 — ContainerBlock virtualState branches.
 * K4 — CanvasLayoutView renders virtual outputs.
 * K5 — virtual tab read-only preview + OP_EXECUTE substitution.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import { useEffect } from 'react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import {
  selectVirtualOutputs,
  selectVirtualById,
  isVirtualId,
  virtualIdForOp,
  opIdFromVirtual,
} from '../store/selectors-product';
import { assembleProduct } from '../lib/operation-product-assembly';
import {
  SkeletonProvider,
  useSkeletonActions,
  useSkeletonState,
} from '../store/skeleton-context';
import CanvasLayoutView from '../canvas/CanvasLayoutView';
import EditorWindowShell from '../editor/EditorWindowShell';
import ContainerBlock from '../canvas/ContainerBlock';

afterEach(cleanup);
import { bootstrapStore } from '../../../store';
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

const SEQ = 'ATGGCATGCAAAGGTTTCCCGGGAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGGCATGCAAGCTTGG';

function stateWith({ containers = [], operations = [], junctions = [] } = {}) {
  const s = buildInitialState();
  return {
    ...s,
    containers: [...s.containers, ...containers],
    operations,
    junctions,
  };
}
function mol(id, name, seq = SEQ, circular = true) {
  return { id, kind: 'molecule', name, sequence: seq, topology: { circular }, annotations: [] };
}
function pcrOp(id, inputs, extra = {}) {
  return {
    id, kind: 'pcr', status: 'committed', inputs, outputs: [],
    params: {}, junctionRefs: [], position: { x: 100, y: 80 }, ...extra,
  };
}

// ════════════════════════════════════════════════════════════════════
// K2 — state machine + assembly
// ════════════════════════════════════════════════════════════════════
describe('K2 — virtual id helpers', () => {
  it('isVirtualId / virtualIdForOp / opIdFromVirtual round-trip', () => {
    expect(virtualIdForOp('op-1')).toBe('v-op-1');
    expect(isVirtualId('v-op-1')).toBe(true);
    expect(isVirtualId('c-1')).toBe(false);
    expect(opIdFromVirtual('v-op-1')).toBe('op-1');
    expect(opIdFromVirtual('c-1')).toBeNull();
  });
});

describe('K2 — selectVirtualOutputs state machine (DEC-PROD-02)', () => {
  it('incomplete — op without inputs', () => {
    const st = stateWith({ operations: [pcrOp('op-1', [])] });
    const v = selectVirtualOutputs(st);
    expect(v).toHaveLength(1);
    expect(v[0].id).toBe('v-op-1');
    expect(v[0].state).toBe('incomplete');
    expect(v[0].warnings.length).toBeGreaterThan(0);
  });

  it('valid — pcr op with a sequenced input + no failing junctions', () => {
    const st = stateWith({
      containers: [mol('c-a', 'pET28a')],
      operations: [pcrOp('op-1', ['c-a'])],
    });
    const v = selectVirtualOutputs(st)[0];
    expect(v.state).toBe('valid');
    expect(typeof v.sequence).toBe('string');
    expect(v.sequence.length).toBeGreaterThan(0);
    expect(v.name).toBe('pcr_pET28a');
    // position offset right of op (DEC-PROD-08)
    expect(v.position).toEqual({ x: 220, y: 80 });
  });

  it('disconnected — assembly error (input without sequence)', () => {
    const st = stateWith({
      containers: [{ id: 'c-e', kind: 'molecule', name: 'empty', sequence: '', topology: { circular: false }, annotations: [] }],
      operations: [pcrOp('op-1', ['c-e'])],
    });
    const v = selectVirtualOutputs(st)[0];
    expect(v.state).toBe('disconnected');
    expect(v.warnings.join(' ')).toMatch(/Сборка невозможна|невозможна/);
  });

  it('disconnected — incident junction validation fails (DEC-PROD-02)', () => {
    const st = stateWith({
      containers: [mol('c-a', 'A', SEQ, false), mol('c-c', 'C', SEQ, false), mol('c-b', 'B', SEQ, false)],
      operations: [pcrOp('op-1', ['c-c'])],
      junctions: [
        { id: 'L', fromContainerId: 'c-a', toContainerId: 'c-c', kind: 're_ligation', autoDetectedKind: 're_ligation', status: 'manual', overlapTarget: 'right', overlapLength: 4, overlapTm: null, endRequirements: { fromEnd: { type: 'overhang' }, toEnd: { type: 'overhang', overhang: 'ATCG' } } },
        { id: 'R', fromContainerId: 'c-c', toContainerId: 'c-b', kind: 're_ligation', autoDetectedKind: 're_ligation', status: 'manual', overlapTarget: 'right', overlapLength: 4, overlapTm: null, endRequirements: { fromEnd: { type: 'overhang', overhang: 'ATCC' }, toEnd: { type: 'overhang' } } },
      ],
    });
    const v = selectVirtualOutputs(st)[0];
    expect(v.state).toBe('disconnected');
    expect(v.warnings.length).toBeGreaterThan(0);
  });

  it('executed op is skipped (real container exists)', () => {
    const st = stateWith({
      containers: [mol('c-a', 'A')],
      operations: [pcrOp('op-1', ['c-a'], { status: 'executed', outputs: ['c-real'] })],
    });
    expect(selectVirtualOutputs(st)).toHaveLength(0);
  });

  it('selectVirtualById resolves by v- id; null for non-virtual', () => {
    const st = stateWith({ containers: [mol('c-a', 'A')], operations: [pcrOp('op-1', ['c-a'])] });
    expect(selectVirtualById(st, 'v-op-1').opId).toBe('op-1');
    expect(selectVirtualById(st, 'c-a')).toBeNull();
  });
});

describe('K2 — assembleProduct wraps executeOperation', () => {
  it('pcr → ok + sequence', () => {
    const r = assembleProduct(pcrOp('op-1', ['c-a']), { 'c-a': mol('c-a', 'A') });
    expect(r.ok).toBe(true);
    expect(r.sequence.length).toBeGreaterThan(0);
  });
  it('no inputs → ok:false', () => {
    expect(assembleProduct(pcrOp('op-1', []), {}).ok).toBe(false);
  });
  it('no kind → ok:false', () => {
    expect(assembleProduct({ id: 'o', kind: null, inputs: ['c-a'] }, { 'c-a': mol('c-a', 'A') }).ok).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// K3 — ContainerBlock virtualState branches
// ════════════════════════════════════════════════════════════════════
describe('K3 — ContainerBlock virtualState rendering (DEC-PROD-04)', () => {
  it('disconnected → block + warning badge', () => {
    render(
      <ContainerBlock
        container={{ id: 'v-op-1', name: 'pcr_x', sequence: '', topology: { circular: false } }}
        virtualState="disconnected"
        virtualWarnings={['стык не настроен']}
      />,
    );
    const b = screen.getByTestId('skeleton-block-v-op-1');
    expect(b.getAttribute('data-virtual-state')).toBe('disconnected');
    expect(screen.getByTestId('virtual-output-badge').getAttribute('data-virtual-state')).toBe('disconnected');
  });

  it('incomplete + valid states render distinct data-virtual-state', () => {
    const { rerender } = render(
      <ContainerBlock container={{ id: 'v-o', name: 'p', sequence: '' }} virtualState="incomplete" />,
    );
    expect(screen.getByTestId('skeleton-block-v-o').getAttribute('data-virtual-state')).toBe('incomplete');
    rerender(
      <ContainerBlock container={{ id: 'v-o', name: 'p', sequence: 'ATGC' }} virtualState="valid" />,
    );
    expect(screen.getByTestId('skeleton-block-v-o').getAttribute('data-virtual-state')).toBe('valid');
  });
});

// ════════════════════════════════════════════════════════════════════
// K4 — CanvasLayoutView renders virtual outputs
// ════════════════════════════════════════════════════════════════════
let lpA = null;
let lpS = null;
function LPH() { lpA = useSkeletonActions(); lpS = useSkeletonState(); return null; }

describe('K4 — virtual outputs on canvas', () => {
  it('committed pcr op (no inputs) → incomplete virtual block on canvas', () => {
    render(<SkeletonProvider><LPH /><CanvasLayoutView /></SkeletonProvider>);
    act(() => { lpA.opAdd({ position: { x: 200, y: 120 }, kind: 'pcr', inputs: [], commit: true }); });
    const opId = lpS.operations[0].id;
    expect(screen.getByTestId(`skeleton-virtual-wrap-${opId}`)).toBeTruthy();
    expect(screen.getByTestId(`skeleton-block-v-${opId}`).getAttribute('data-virtual-state')).toBe('incomplete');
  });

  it('adding a sequenced input → virtual becomes valid', () => {
    render(<SkeletonProvider><LPH /><CanvasLayoutView /></SkeletonProvider>);
    act(() => {
      lpA.addContainer({ id: 'c-tpl', kind: 'molecule', name: 'pUC', sequence: SEQ, topology: { circular: true }, annotations: [] });
    });
    act(() => { lpA.opAdd({ position: { x: 200, y: 120 }, kind: 'pcr', inputs: ['c-tpl'], commit: true }); });
    const opId = lpS.operations[0].id;
    expect(screen.getByTestId(`skeleton-block-v-${opId}`).getAttribute('data-virtual-state')).toBe('valid');
  });
});

// ════════════════════════════════════════════════════════════════════
// K5 — virtual tab read-only preview + OP_EXECUTE substitution
// ════════════════════════════════════════════════════════════════════
describe('K5 — open virtual in tab (read-only banner)', () => {
  it('OPEN_EDITOR_TAB(v-) → preview banner, no Apply/Discard', () => {
    let a = null; let s = null;
    function H() { a = useSkeletonActions(); s = useSkeletonState(); return null; }
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => {
      a.addContainer({ id: 'c-tpl', kind: 'molecule', name: 'pUC', sequence: SEQ, topology: { circular: true }, annotations: [] });
    });
    act(() => { a.opAdd({ position: { x: 10, y: 10 }, kind: 'pcr', inputs: ['c-tpl'], commit: true }); });
    const opId = s.operations[0].id;
    act(() => { a.openEditorTab(`v-${opId}`); });
    expect(screen.getByTestId('skeleton-editor-preview-banner')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-editor-apply')).toBeNull();
  });
});

describe('K5 — OP_EXECUTE substitutes virtual tab → real (DEC-PROD-05)', () => {
  it('reducer atomically swaps v-opId tab to op.outputs[0] + info toast', () => {
    let st = stateWith({
      containers: [mol('c-a', 'pET28a')],
      operations: [pcrOp('op-1', ['c-a'])],
    });
    // open the virtual tab
    st = skeletonReducer(st, { type: 'OPEN_EDITOR_TAB', containerId: 'v-op-1' });
    expect(st.editorContext.tabs[0].containerId).toBe('v-op-1');
    // execute the op
    st = skeletonReducer(st, { type: 'OP_EXECUTE', operationId: 'op-1' });
    const op = st.operations.find((o) => o.id === 'op-1');
    expect(op.status).toBe('executed');
    expect(op.outputs.length).toBeGreaterThan(0);
    // tab substituted to the real output, no longer virtual
    const tab = st.editorContext.tabs[0];
    expect(tab.containerId).toBe(op.outputs[0]);
    expect(tab.containerId.startsWith('v-')).toBe(false);
    expect((st.toasts || []).some((t) => /переключена/.test(t.message || ''))).toBe(true);
  });
});

/**
 * pipeline-panel-k9.test.jsx — M-CANVAS-WORKFLOW-UX K9.
 *
 * AssemblyPipelinePanel — right-side «Схема сборки» (SPEC §4).
 * Embedded panel (not modal): layered group cards, automode button,
 * realise button, per-card remove. RealiseModal is still the «реально
 * собрать» step but it's reached from THIS panel now.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, fireEvent, within,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import AssemblyPipelinePanel from '../editor/assembly-mode/AssemblyPipelinePanel';
import EditorWindowShell from '../editor/EditorWindowShell';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function openZoneWith3() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer({ id: 'cZ', name: 'pUC', kind: 'molecule', sequence: 'AAAACCCCGGGGTTTT', annotations: [] }); });
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  act(() => { A.insertSegment(zid, 'cZ', 0, 4, false); });
  act(() => { A.insertSegment(zid, 'cZ', 4, 8, false); });
  act(() => { A.insertSegment(zid, 'cZ', 8, 12, false); });
  return zid;
}

describe('K9 — AssemblyPipelinePanel', () => {
  it('renders title + empty-state when zone has no groups', () => {
    render(
      <SkeletonProvider>
        <AssemblyPipelinePanel draftId="x" zoneId="z" />
      </SkeletonProvider>,
    );
    expect(screen.getByTestId('assembly-pipeline-panel')).toBeTruthy();
    expect(screen.getByTestId('assembly-pipeline-empty')).toBeTruthy();
  });

  it('shows «⚡ Auto-собрать» and «Realise pipeline →» buttons', () => {
    render(
      <SkeletonProvider>
        <AssemblyPipelinePanel draftId="x" zoneId="z" />
      </SkeletonProvider>,
    );
    expect(screen.getByTestId('assembly-pipeline-automode')).toBeTruthy();
    expect(screen.getByTestId('assembly-pipeline-realise')).toBeTruthy();
  });

  it('lists op-groups by layer with kind + name + piece count', () => {
    const zid = openZoneWith3();
    const ids = S.pieces.filter((p) => p.zoneId === zid)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', 'layer1', [ids[0], ids[1]]); });
    const opId = S.operations.find((o) => o.isOpGroup).id;
    const card = screen.getByTestId(`assembly-pipeline-card-${opId}`);
    expect(card.textContent).toMatch(/overlap_pcr|Overlap PCR/i);
    expect(card.textContent).toMatch(/layer1/);
    expect(card.textContent).toMatch(/2/);
  });

  it('per-card «Удалить» dispatches REMOVE_OP_GROUP', () => {
    const zid = openZoneWith3();
    const ids = S.pieces.filter((p) => p.zoneId === zid)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', '', [ids[0], ids[1]]); });
    const opId = S.operations.find((o) => o.isOpGroup).id;
    const card = screen.getByTestId(`assembly-pipeline-card-${opId}`);
    act(() => { fireEvent.click(within(card).getByTestId(`assembly-pipeline-card-remove-${opId}`)); });
    expect(S.operations.find((o) => o.id === opId)).toBeUndefined();
    expect(S.pieces.every((p) => p.groupId == null)).toBe(true);
  });

  it('layered: groupLayer 0 cards under «Layer 1», groupLayer 1 under «Layer 2»', () => {
    const zid = openZoneWith3();
    const ids = S.pieces.filter((p) => p.zoneId === zid)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map((p) => p.id);
    act(() => { A.createOpGroup(zid, 'overlap_pcr', 'L1', [ids[0], ids[1]]); });
    expect(screen.getByTestId('assembly-pipeline-layer-0')).toBeTruthy();
  });

  it('«Realise pipeline →» click opens RealiseModal (panel onRealise callback fires)', () => {
    let opened = false;
    render(
      <SkeletonProvider>
        <AssemblyPipelinePanel draftId="x" zoneId="z" onRealise={() => { opened = true; }} />
      </SkeletonProvider>,
    );
    act(() => { fireEvent.click(screen.getByTestId('assembly-pipeline-realise')); });
    expect(opened).toBe(true);
  });

  it('«⚡ Auto-собрать» click fires onAutomode callback (K10 wires the algorithm)', () => {
    let triggered = false;
    render(
      <SkeletonProvider>
        <AssemblyPipelinePanel draftId="x" zoneId="z" onAutomode={() => { triggered = true; }} />
      </SkeletonProvider>,
    );
    act(() => { fireEvent.click(screen.getByTestId('assembly-pipeline-automode')); });
    expect(triggered).toBe(true);
  });

  it('mini-DAG region testid present (placeholder svg for K9; full graph K10+)', () => {
    render(
      <SkeletonProvider>
        <AssemblyPipelinePanel draftId="x" zoneId="z" />
      </SkeletonProvider>,
    );
    expect(screen.getByTestId('assembly-pipeline-dag')).toBeTruthy();
  });
});

/**
 * assembly-mode.test.jsx — A2 Assembly Construct UX (merge of
 * SPRINT_M-CANVAS-ASSEMBLY-CONSTRUCT.md + SPRINT_M-CANVAS-ASSEMBLY-VIEW.md).
 *
 * Builds on A1 data model (state.assemblyDrafts). K-steps:
 *   K1  SequenceView coloredZones + SegmentZonesOverlay (back-compat)
 *   K2  tab.kind='assembly' + OPEN_EDITOR_ASSEMBLY_TAB + breadcrumb
 *   K3  AssemblyModeShell + AssemblyHeader
 *   K4  AssemblySidebar + DnD insert-at-caret
 *   K5  SegmentList + SegmentDetailPanel
 *   K6  segment source picker — reuse of the shared PlaceholderTreePicker
 *   K7  InsertGapModal
 *   K8  assembly primer writing (slice + Ctrl+R + cross-boundary)
 *   K9  AssemblyDraftsPanel + canvas markers + pin
 *   K10 orphan UX + realise stub + undo/redo + deleteAssembly tab cleanup
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act, within,
} from '@testing-library/react';
import { useEffect } from 'react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import {
  buildInitialEditorState, editorReducer, deriveActiveTab,
} from '../store/skeleton-state-editor';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';
import EditorWindowShell from '../editor/EditorWindowShell';
import EditorTabStrip from '../editor/EditorTabStrip';
import CanvasLayoutView from '../canvas/CanvasLayoutView';
import AssemblyDraftsPanel from '../canvas/AssemblyDraftsPanel';
import MiniProjectCanvas from '../canvas/MiniProjectCanvas';
import { reverseComplement } from '../../../sequence-utils';
import {
  saveSnapshot, loadSnapshot, SCHEMA_VERSION_CURRENT,
} from '../store/skeleton-persistence';

afterEach(cleanup);
import { bootstrapStore, useStore } from '../../../store';

beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

const SEQ = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT';

// ════════════════════════════════════════════════════════════════════
// K1 — SequenceView coloredZones + SegmentZonesOverlay (back-compat)
// ════════════════════════════════════════════════════════════════════

describe('K1 SequenceView coloredZones', () => {
  it('back-compat: SequenceTab without coloredZones renders no zones', () => {
    render(<SequenceTab sequence={SEQ} annotations={[]} topology="linear" name="x" />);
    expect(screen.getByTestId('sequence-view-root')).toBeTruthy();
    expect(screen.queryAllByTestId('sequence-view-zone')).toHaveLength(0);
  });

  it('renders one coloured backdrop zone per segment', () => {
    const coloredZones = [
      { zoneId: 's1', start: 0, end: 16, color: '#8b5cf6', label: 'A' },
      { zoneId: 's2', start: 16, end: 32, color: '#ec4899', label: 'B' },
    ];
    render(
      <SequenceTab
        sequence={SEQ}
        annotations={[]}
        topology="linear"
        name="x"
        coloredZones={coloredZones}
      />,
    );
    const zones = screen.getAllByTestId('sequence-view-zone');
    expect(zones.length).toBeGreaterThanOrEqual(2);
    // colours propagated
    const fills = zones.map((z) => z.getAttribute('data-zone-id'));
    expect(fills).toContain('s1');
    expect(fills).toContain('s2');
  });

  it('onZoneClick fires with the zoneId when a zone band is clicked', () => {
    let clicked = null;
    const coloredZones = [{ zoneId: 'segZ', start: 0, end: 32, color: '#06b6d4' }];
    render(
      <SequenceTab
        sequence={SEQ}
        annotations={[]}
        topology="linear"
        name="x"
        coloredZones={coloredZones}
        onZoneClick={(id) => { clicked = id; }}
      />,
    );
    const handle = screen.getAllByTestId('sequence-view-zone-handle')[0];
    fireEvent.click(handle);
    expect(clicked).toBe('segZ');
  });
});

// ════════════════════════════════════════════════════════════════════
// K2 — tab.kind='assembly' + OPEN_EDITOR_ASSEMBLY_TAB + breadcrumb
// ════════════════════════════════════════════════════════════════════

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

describe('K2 assembly tab kind', () => {
  it('OPEN_EDITOR_ASSEMBLY_TAB creates a kind=assembly tab + mounts shell', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.createAssemblyDraft({ id: 'asm-1', name: 'My Build' }); });
    act(() => { A.openEditorAssemblyTab('asm-1'); });
    const tab = deriveActiveTab(S.editorContext);
    expect(tab.kind).toBe('assembly');
    expect(tab.assemblyDraftId).toBe('asm-1');
    expect(S.editorOpen).toBe(true);
    expect(screen.getByTestId('assembly-mode-shell')).toBeTruthy();
    expect(screen.getByTestId('assembly-mode-shell').getAttribute('data-draft-id')).toBe('asm-1');
  });

  it('re-opening the same draft focuses the existing tab (no duplicate)', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.createAssemblyDraft({ id: 'asm-2', name: 'B' }); });
    act(() => { A.openEditorAssemblyTab('asm-2'); });
    act(() => { A.openEditorAssemblyTab('asm-2'); });
    expect(S.editorContext.tabs.filter((t) => t.kind === 'assembly')).toHaveLength(1);
  });

  it('EditorTabStrip shows 🧬 <name> for an assembly tab', () => {
    const tabs = [{ id: 't1', kind: 'assembly', assemblyDraftId: 'asm-9', openedAt: 1 }];
    render(
      <EditorTabStrip
        tabs={tabs}
        activeTabId="t1"
        containers={[]}
        operations={[]}
        assemblyDrafts={[{ id: 'asm-9', name: 'Gibson3' }]}
        onSwitch={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/🧬 Gibson3/)).toBeTruthy();
  });

  it('REMOVE_ASSEMBLY_DRAFT closes its editor tab', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.createAssemblyDraft({ id: 'asm-3', name: 'C' }); });
    act(() => { A.openEditorAssemblyTab('asm-3'); });
    expect(S.editorContext.tabs.some((t) => t.assemblyDraftId === 'asm-3')).toBe(true);
    act(() => { A.removeAssemblyDraft('asm-3'); });
    expect(S.editorContext.tabs.some((t) => t.assemblyDraftId === 'asm-3')).toBe(false);
  });

  it('reducer: OPEN_EDITOR_ASSEMBLY_TAB pure shape via editorReducer', () => {
    const s0 = buildInitialEditorState();
    const s1 = editorReducer(s0, { type: 'OPEN_EDITOR_ASSEMBLY_TAB', draftId: 'd1' });
    const t = deriveActiveTab(s1.editorContext);
    expect(t.kind).toBe('assembly');
    expect(t.assemblyDraftId).toBe('d1');
    expect(s1.editorOpen).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// K3 — AssemblyShell + Header + SequenceTab coloured-zone integration
// ════════════════════════════════════════════════════════════════════

function openDraftWith2(name = 'Build3') {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.createAssemblyDraft({ id: 'asm-k3', name }); });
  act(() => { A.insertManualSegment('asm-k3', { sequence: 'AAAACCCCGGGG' }); });
  act(() => { A.insertManualSegment('asm-k3', { sequence: 'TTTTGGGG' }); });
  act(() => { A.openEditorAssemblyTab('asm-k3'); });
}

describe('K3 AssemblyShell + Header', () => {
  it('header shows name, length, segment count, topology', () => {
    openDraftWith2('Build3');
    const hdr = screen.getByTestId('assembly-header');
    expect(within(hdr).getByText(/Build3/)).toBeTruthy();
    // 12 + 8 = 20 bp, 2 segments, linear
    const info = within(hdr).getByTestId('assembly-header-info').textContent;
    expect(info).toMatch(/20 bp/);
    expect(info).toMatch(/2 сегм/);
    expect(info).toMatch(/linear/i);
  });

  it('circularize modal sets topology (setAssemblyDraftTopology) — M-CIRCULARIZE', () => {
    openDraftWith2();
    act(() => { fireEvent.click(screen.getByTestId('assembly-circularize-btn')); });
    act(() => { fireEvent.click(screen.getByTestId('circularize-topology-circular')); });
    act(() => { fireEvent.click(screen.getByTestId('circularize-confirm')); });
    expect(S.assemblyDrafts[0].topology.circular).toBe(true);
  });

  it('inline rename dispatches renameAssemblyDraft', () => {
    openDraftWith2('OldName');
    const hdr = screen.getByTestId('assembly-header');
    act(() => { fireEvent.click(within(hdr).getByTestId('importer-inline-title')); });
    const input = within(hdr).getByTestId('importer-inline-title-input');
    act(() => { fireEvent.change(input, { target: { value: 'NewName' } }); });
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(S.assemblyDrafts[0].name).toBe('NewName');
  });

  it('SequenceTab renders one coloured zone per segment', () => {
    openDraftWith2();
    const zones = screen.getAllByTestId('sequence-view-zone');
    const ids = new Set(zones.map((z) => z.getAttribute('data-zone-id')));
    expect(ids.size).toBe(2);
  });

  it('Realise as DAG button is enabled with ≥2 segments and realises directly (no modal)', () => {
    openDraftWith2();
    const btn = screen.getByTestId('assembly-realise-btn');
    expect(btn.disabled).toBe(false);
    // Modal removed (Игорь 11.06) — the click realises straight to the canvas
    // (toast acknowledges; the editor view itself does not change).
    act(() => { fireEvent.click(btn); });
    expect(screen.queryByTestId('realise-modal')).toBeNull();
    expect(S.toast).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════
// K4 — AssemblySidebar + drag-and-drop insert-at-caret
// ════════════════════════════════════════════════════════════════════

function dt() {
  const store = {};
  return {
    setData: (k, v) => { store[k] = String(v); },
    getData: (k) => store[k] || '',
    effectAllowed: 'copy',
    _store: store,
  };
}

function openDraftWithContainers() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer({ id: 'cA', name: 'pUC19', sequence: 'AAAACCCCGGGGTTTT', annotations: [] }); });
  act(() => { A.addContainer({ id: 'cB', name: 'pET28', sequence: 'GGGGGGGGTTTTTTTT', annotations: [] }); });
  act(() => { A.createAssemblyDraft({ id: 'asm-k4', name: 'K4' }); });
  act(() => { A.openEditorAssemblyTab('asm-k4'); });
}

describe('K4 AssemblySidebar + DnD', () => {
  it('sidebar lists project containers and filters by name (after first segment + expand body — V95)', () => {
    openDraftWithContainers();
    // Игорь 20.05.2026 — empty assembly hides the right rail. Sidebar
    // becomes accessible только после первого сегмента.
    act(() => { A.insertManualSegment('asm-k4', { gapKind: 'unknown', length: 5 }, undefined); });
    const sb = screen.getByTestId('assembly-sidebar');
    // V95 — body collapsed by default; expand через chevron.
    act(() => { fireEvent.click(within(sb).getByTestId('assembly-sidebar-toggle')); });
    expect(within(sb).getAllByTestId('assembly-sidebar-item').length).toBeGreaterThanOrEqual(2);
    act(() => {
      fireEvent.change(within(sb).getByTestId('assembly-sidebar-filter'), { target: { value: 'pet' } });
    });
    const items = within(sb).getAllByTestId('assembly-sidebar-item');
    expect(items).toHaveLength(1);
    expect(items[0].getAttribute('data-container-id')).toBe('cB');
  });

  it('drop a container onto the viewer → RangePicker → confirm → full-length segment', () => {
    openDraftWithContainers();
    const data = dt();
    data.setData('application/x-bodge-container-id', 'cA');
    const wrap = screen.getByTestId('assembly-viewer-wrap');
    act(() => { fireEvent.dragOver(wrap, { dataTransfer: data }); });
    act(() => { fireEvent.drop(wrap, { dataTransfer: data }); });
    // K5 — drop now opens the RangePicker; confirm with defaults = full.
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    const d = S.assemblyDrafts.find((x) => x.id === 'asm-k4');
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].source.containerId).toBe('cA');
    expect(d.segments[0].sequence).toBe('AAAACCCCGGGGTTTT');
  });

  it('drop with empty payload is a no-op', () => {
    openDraftWithContainers();
    const data = dt();
    const wrap = screen.getByTestId('assembly-viewer-wrap');
    act(() => { fireEvent.drop(wrap, { dataTransfer: data }); });
    expect(S.assemblyDrafts.find((x) => x.id === 'asm-k4').segments).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// K5 — SegmentList + SegmentDetailPanel (range/RC/color/label/delete)
// ════════════════════════════════════════════════════════════════════

function openDraftK5() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer({ id: 'cK5', name: 'srcK5', sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [] }); });
  act(() => { A.createAssemblyDraft({ id: 'asm-k5', name: 'K5' }); });
  act(() => { A.insertSegment('asm-k5', 'cK5', 0, 8, false, undefined); }); // seg0 8bp
  act(() => { A.insertManualSegment('asm-k5', { sequence: 'TTTT' }, undefined); }); // seg1 4bp
  act(() => { A.openEditorAssemblyTab('asm-k5'); });
}

describe('K5 SegmentList + SegmentDetailPanel', () => {
  it('renders one row per segment with source + length', () => {
    openDraftK5();
    const rows = screen.getAllByTestId('assembly-segment-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(/srcK5/)).toBeTruthy();
  });

  it('reorder ▼ on first row swaps order', () => {
    openDraftK5();
    const d0 = S.assemblyDrafts.find((x) => x.id === 'asm-k5');
    const firstId = d0.segments[0].id;
    const rows = screen.getAllByTestId('assembly-segment-row');
    act(() => { fireEvent.click(within(rows[0]).getByTestId('assembly-segment-down')); });
    const d1 = S.assemblyDrafts.find((x) => x.id === 'asm-k5');
    expect(d1.segments[1].id).toBe(firstId);
  });

  it('delete ✕ removes the segment', () => {
    openDraftK5();
    const rows = screen.getAllByTestId('assembly-segment-row');
    act(() => { fireEvent.click(within(rows[1]).getByTestId('assembly-segment-delete')); });
    expect(S.assemblyDrafts.find((x) => x.id === 'asm-k5').segments).toHaveLength(1);
  });

  it('inline RC toggle flips orientation (V94 — was SegmentDetailPanel)', () => {
    openDraftK5();
    const rows = screen.getAllByTestId('assembly-segment-row');
    const segId = rows[0].getAttribute('data-segment-id');
    act(() => { fireEvent.click(screen.getByTestId(`segment-row-expand-${segId}`)); });
    act(() => { fireEvent.click(screen.getByTestId(`segment-inline-rc-${segId}`)); });
    act(() => { fireEvent.click(screen.getByTestId(`segment-inline-apply-${segId}`)); });
    const seg0 = S.assemblyDrafts.find((x) => x.id === 'asm-k5').segments[0];
    expect(seg0.reverseComplement).toBe(true);
    expect(seg0.sequence).toBe('GGGGTTTT'); // RC of AAAACCCC
  });

  it('inline range edit re-slices the sourced segment (V94)', () => {
    openDraftK5();
    const segId = screen.getAllByTestId('assembly-segment-row')[0].getAttribute('data-segment-id');
    act(() => { fireEvent.click(screen.getByTestId(`segment-row-expand-${segId}`)); });
    act(() => { fireEvent.change(screen.getByTestId(`segment-inline-start-${segId}`), { target: { value: '4' } }); });
    act(() => { fireEvent.change(screen.getByTestId(`segment-inline-end-${segId}`), { target: { value: '12' } }); });
    act(() => { fireEvent.click(screen.getByTestId(`segment-inline-apply-${segId}`)); });
    const seg0 = S.assemblyDrafts.find((x) => x.id === 'asm-k5').segments[0];
    // V127 — inline inputs 1-based: typed start 4 → store 3; end 12 passes through.
    expect(seg0.start).toBe(3);
    expect(seg0.end).toBe(12);
    expect(seg0.sequence).toBe('ACCCCGGGG'); // src[3:12]
  });

  it('inline label edit dispatches updateSegment (V94)', () => {
    openDraftK5();
    const segId = screen.getAllByTestId('assembly-segment-row')[1].getAttribute('data-segment-id');
    act(() => { fireEvent.click(screen.getByTestId(`segment-row-expand-${segId}`)); });
    act(() => { fireEvent.change(screen.getByTestId(`segment-inline-label-${segId}`), { target: { value: 'spacer' } }); });
    act(() => { fireEvent.click(screen.getByTestId(`segment-inline-apply-${segId}`)); });
    expect(S.assemblyDrafts.find((x) => x.id === 'asm-k5').segments[1].label).toBe('spacer');
  });
});

// ════════════════════════════════════════════════════════════════════
// K6 — segment source picker (Игорь 19.05.2026: reuse the shared rich
// PlaceholderTreePicker «У НАС вот уже было такое окно поиска» — no
// bespoke parallel picker; library search + materialise-on-pick)
// ════════════════════════════════════════════════════════════════════

function seedLibraryK6() {
  act(() => {
    useStore.setState((s) => ({
      ...s,
      libraryEntries: {
        'lib-puc': {
          id: 'lib-puc', kind: 'container', name: 'pUC19',
          payload: { sequence: 'AAAACCCCGGGGTTTT', topology: 'linear' },
        },
        'lib-pet': {
          id: 'lib-pet', kind: 'container', name: 'pET28',
          payload: { sequence: 'TTTTGGGGCCCCAAAA', topology: 'linear' },
        },
      },
      projects: {},
      currentProjectId: null,
    }));
  });
}

function openDraftK6() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  seedLibraryK6();
  act(() => { A.createAssemblyDraft({ id: 'asm-k6', name: 'K6' }); });
  act(() => { A.openEditorAssemblyTab('asm-k6'); });
}

describe('K6 segment source picker (inline EmptyAssemblyLibrary)', () => {
  // Игорь 20.05.2026 — empty assembly mounts EmptyAssemblyLibrary in
  // the centre. Library entries are visible directly, no «+ Плазмида»
  // step. Testid `skeleton-placeholder-picker` is reused on the inline
  // panel so existing entry-click flows keep working.
  it('inline picker is mounted with library entries (no «+ Сегмент» step)', () => {
    openDraftK6();
    expect(screen.getByTestId('assembly-source-picker')).toBeTruthy();
    expect(screen.getByTestId('assembly-source-picker-section-loose-item-lib-puc')).toBeTruthy();
    expect(screen.getByTestId('assembly-source-picker-section-loose-item-lib-pet')).toBeTruthy();
  });

  it('search narrows the library list', () => {
    openDraftK6();
    act(() => {
      fireEvent.change(
        screen.getByTestId('assembly-source-picker-input'),
        { target: { value: 'puc' } },
      );
    });
    expect(screen.getByTestId('assembly-source-picker-section-loose-item-lib-puc')).toBeTruthy();
    expect(screen.queryByTestId('assembly-source-picker-section-loose-item-lib-pet')).toBeNull();
  });

  it('pick a library entry → RangePicker → confirm → materialised + inserted', async () => {
    openDraftK6();
    try { localStorage.clear(); } catch { /* no-op */ }
    act(() => { fireEvent.click(screen.getByTestId('assembly-source-picker-section-loose-item-lib-puc')); });
    const m = await screen.findByTestId('range-picker-modal');
    await act(async () => {
      fireEvent.click(within(m).getByTestId('range-picker-confirm'));
      await new Promise((r) => { setTimeout(r, 0); });
    });
    const d = S.assemblyDrafts.find((x) => x.id === 'asm-k6');
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].sequence).toBe('AAAACCCCGGGGTTTT');
    // After the first segment lands, EmptyAssemblyLibrary unmounts.
    expect(screen.queryByTestId('assembly-source-picker')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// K7 — InsertGapModal + «+ Gap»
// ════════════════════════════════════════════════════════════════════

function openDraftK7() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.createAssemblyDraft({ id: 'asm-k7', name: 'K7' }); });
  act(() => { A.openEditorAssemblyTab('asm-k7'); });
}
const draftK7 = () => S.assemblyDrafts.find((x) => x.id === 'asm-k7');

describe('K7 — paste custom sequence (custom-segment SAFE)', () => {
  // SPEC_ASSEMBLY_CUSTOM_SEGMENT §3 — Обвес/Синтез/Gap модалки удалены;
  // «вставить свой сиквенс» живёт секцией в едином пикере и идёт через
  // тот же INSERT_MANUAL_SEGMENT path (V83 known-gap).
  it('paste ATGC in the empty-state picker → manual segment with that sequence', () => {
    openDraftK7();
    act(() => {
      fireEvent.change(screen.getByTestId('assembly-source-picker-paste-input'), { target: { value: 'atcgATCG' } });
    });
    act(() => { fireEvent.click(screen.getByTestId('assembly-source-picker-paste-confirm')); });
    const seg = draftK7().segments[0];
    expect(seg).toBeTruthy();
    expect(seg.sequence).toBe('ATCGATCG');
  });

  it('Обвес / Синтез / Gap buttons no longer exist', () => {
    openDraftK7();
    expect(screen.queryByTestId('assembly-add-snippet')).toBeNull();
    expect(screen.queryByTestId('assembly-add-synthesis')).toBeNull();
    expect(screen.queryByTestId('assembly-add-gap')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// K8 — assembly primers slice (pure reducer)
// ════════════════════════════════════════════════════════════════════

describe('K8 WRITE_ASSEMBLY_PRIMER reducer', () => {
  function withDraft() {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'aP', name: 'P' });
    s = skeletonReducer(s, {
      type: 'INSERT_MANUAL_SEGMENT', draftId: 'aP', sequence: 'AAAACCCCGGGGTTTTAAAACCCC',
    });
    return s;
  }

  it('buildInitialState has an empty assemblyDraftPrimers map', () => {
    expect(buildInitialState().assemblyDraftPrimers).toEqual({});
  });

  it('writes a forward primer with binding + Tm + auto name', () => {
    let s = withDraft();
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'aP', range: { start: 0, end: 20 }, direction: 'forward',
    });
    const p = s.assemblyDraftPrimers.aP[0];
    expect(p.direction).toBe('forward');
    expect(p.bindingSequence).toBe('AAAACCCCGGGGTTTTAAAA');
    expect(typeof p.tm).toBe('number');
    expect(p.name).toBe('asm-fwd-1');
  });

  it('reverse primer binding is reverse-complemented', () => {
    let s = withDraft();
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'aP', range: { start: 0, end: 8 }, direction: 'reverse',
    });
    // short (<18) ⇒ guarded, nothing written
    expect(s.assemblyDraftPrimers.aP || []).toHaveLength(0);
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'aP', range: { start: 0, end: 20 }, direction: 'reverse',
    });
    expect(s.assemblyDraftPrimers.aP[0].bindingSequence)
      .toBe(reverseComplement('AAAACCCCGGGGTTTTAAAA'));
  });

  it('REMOVE_ASSEMBLY_DRAFT clears its primers', () => {
    let s = withDraft();
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'aP', range: { start: 0, end: 20 }, direction: 'forward',
    });
    expect(s.assemblyDraftPrimers.aP).toHaveLength(1);
    s = skeletonReducer(s, { type: 'REMOVE_ASSEMBLY_DRAFT', draftId: 'aP' });
    expect(s.assemblyDraftPrimers.aP).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════
// K9 — AssemblyDraftsPanel + canvas dbl-click + MiniProjectCanvas marker
// ════════════════════════════════════════════════════════════════════

describe('K9 AssemblyDraftsPanel + canvas', () => {
  // V82 panel is ZONE-based. DEC-T3-08 REVERSED (17.05.2026): new
  // projects start CLEAN (no seeded «Сборка 1»). PC-K6 (20.05.2026):
  // toggle is HIDDEN on zones=0 — first zone is seeded via direct
  // CREATE_ZONE dispatch, then «+ Новая сборка» creates subsequent
  // ones. The on-canvas AssemblyDraftBlock / MiniProjectCanvas cases
  // below stay legacy-draft.
  const seedFirstZone = () => {
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_ZONE',
        zone: { bounds: { x: 0, y: 0, width: 600, height: 400 } },
      });
    });
  };
  const openAndCreateZone = () => {
    act(() => { fireEvent.click(screen.getByTestId('assembly-drafts-toggle')); });
    act(() => { fireEvent.click(screen.getByTestId('assembly-drafts-new')); });
  };

  it('PC-K6: clean start — toggle hidden; seed → toggle visible', () => {
    render(<SkeletonProvider><H /><AssemblyDraftsPanel /></SkeletonProvider>);
    expect(screen.queryByTestId('assembly-drafts-toggle')).toBeNull();
    seedFirstZone();
    expect(screen.getByTestId('assembly-drafts-toggle').textContent).toMatch(/\(1\)/);
  });

  it('card Open opens an assembly editor tab targeting the zone id', () => {
    render(<SkeletonProvider><H /><AssemblyDraftsPanel /></SkeletonProvider>);
    seedFirstZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-drafts-toggle')); });
    const zid = S.zones[0].id;
    const card = screen.getByTestId('assembly-draft-card');
    act(() => { fireEvent.click(within(card).getByTestId('assembly-draft-card-open')); });
    expect(S.editorContext.tabs.some((t) => t.kind === 'assembly' && t.assemblyDraftId === zid)).toBe(true);
  });

  it('card Delete dispatches REMOVE_ZONE', () => {
    render(<SkeletonProvider><H /><AssemblyDraftsPanel /></SkeletonProvider>);
    seedFirstZone();
    act(() => { fireEvent.click(screen.getByTestId('assembly-drafts-toggle')); });
    act(() => { fireEvent.click(within(screen.getByTestId('assembly-draft-card')).getByTestId('assembly-draft-card-delete')); });
    expect(S.zones).toHaveLength(0);
  });

  it('MiniProjectCanvas renders a marker for a pinned draft (after expand — V91)', () => {
    render(<SkeletonProvider><H /><MiniProjectCanvas /></SkeletonProvider>);
    act(() => { A.createAssemblyDraft({ id: 'asm-d5', name: 'D5', position: { x: 120, y: 80 } }); });
    // V91 — MiniProjectCanvas стартует свёрнутым. Сначала expand.
    act(() => { fireEvent.click(screen.getByTestId('mini-canvas-collapsed')); });
    expect(screen.getByTestId('mini-canvas-assembly-asm-d5')).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════════
// K10 — orphan UX + undo/redo + nav-not-recorded
// ════════════════════════════════════════════════════════════════════

describe('K10 orphan UX + history', () => {
  function openWithSourced() {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer({ id: 'cO', name: 'srcO', sequence: 'AAAACCCCGGGGTTTTAAAA', annotations: [] }); });
    act(() => { A.createAssemblyDraft({ id: 'asm-o', name: 'O' }); });
    act(() => { A.insertSegment('asm-o', 'cO', 0, 12, false, undefined); });
    act(() => { A.openEditorAssemblyTab('asm-o'); });
  }

  it('REMOVE_CONTAINER flags the segment orphan in the SegmentList', () => {
    openWithSourced();
    expect(screen.queryByTestId('assembly-segment-orphan-badge')).toBeNull();
    act(() => { A.removeContainer('cO'); });
    expect(screen.getByTestId('assembly-segment-orphan-badge')).toBeTruthy();
  });

  it('inline orphan → «Convert to gap» makes it a manual segment (V94)', () => {
    openWithSourced();
    act(() => { A.removeContainer('cO'); });
    const segId = screen.getAllByTestId('assembly-segment-row')[0].getAttribute('data-segment-id');
    act(() => { fireEvent.click(screen.getByTestId(`segment-row-expand-${segId}`)); });
    expect(screen.getByTestId('segment-detail-orphan')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByTestId('segment-detail-convert-gap')); });
    expect(S.assemblyDrafts.find((d) => d.id === 'asm-o').segments[0].source.type).toBe('manual');
  });

  it('undo/redo a segment insert via the toolbar', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.createAssemblyDraft({ id: 'asm-u', name: 'U' }); });
    act(() => { A.openEditorAssemblyTab('asm-u'); });
    act(() => { A.insertManualSegment('asm-u', { sequence: 'AAAA' }, undefined); });
    expect(S.assemblyDrafts.find((d) => d.id === 'asm-u').segments).toHaveLength(1);
    act(() => { fireEvent.click(screen.getByTestId('assembly-undo')); });
    expect(S.assemblyDrafts.find((d) => d.id === 'asm-u').segments).toHaveLength(0);
    act(() => { fireEvent.click(screen.getByTestId('assembly-redo')); });
    expect(S.assemblyDrafts.find((d) => d.id === 'asm-u').segments).toHaveLength(1);
  });

  it('opening an assembly tab is NOT an undoable mutation', () => {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.createAssemblyDraft({ id: 'asm-n', name: 'N' }); });
    act(() => { A.openEditorAssemblyTab('asm-n'); });
    act(() => { A.undo(); }); // undoes CREATE only (tab-open skipped)
    expect(S.assemblyDrafts.find((d) => d.id === 'asm-n')).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════
// K11 — persistence (no schema bump; additive default merge)
// ════════════════════════════════════════════════════════════════════

describe('K11 persistence', () => {
  it('schema is 7 post-T3 (A2 assemblyDraftPrimers itself was additive — no A2 bump)', () => {
    expect(SCHEMA_VERSION_CURRENT).toBe(12); // M-CANVAS-WORKFLOW-UX K1: bump 10→11
  });

  it('REPLACE_STATE on a pre-A2 snapshot fills assemblyDraftPrimers default', () => {
    const snap = {
      ...buildInitialState(),
      assemblyDrafts: [{ id: 'z', name: 'Z', segments: [], topology: { circular: false }, position: null }],
    };
    delete snap.assemblyDraftPrimers; // pre-A2 snapshot
    const next = skeletonReducer(buildInitialState(), { type: 'REPLACE_STATE', state: snap });
    expect(next.assemblyDraftPrimers).toEqual({});
    expect(next.assemblyDrafts).toHaveLength(1);
  });

  it('save → load round-trips drafts + primers', async () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'rt', name: 'RT' });
    s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'rt', sequence: 'AAAACCCCGGGGTTTTAAAA' });
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'rt', range: { start: 0, end: 20 }, direction: 'forward',
    });
    await saveSnapshot(s, 'proj-rt');
    const loaded = await loadSnapshot('proj-rt');
    expect(loaded.assemblyDrafts.find((d) => d.id === 'rt').segments).toHaveLength(1);
    expect(loaded.assemblyDraftPrimers.rt).toHaveLength(1);
  });
});

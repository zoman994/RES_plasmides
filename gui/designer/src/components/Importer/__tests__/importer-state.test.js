/**
 * Sprint M-B.2 K1 — useImporterState hook unit tests.
 *
 * Covers the state-shape rewrite: append-not-replace addFiles, tab/source/query
 * mutations, SessionSummary dedupe, reset behaviour. Pure unit tests via
 * @testing-library/react renderHook — no DOM, no parseFile (mocked at module
 * boundary, FASTA path triggered by .fasta extension).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImporterState, isCatalogFlatMode } from '../lib/importer-state';

vi.mock('../../../auto-annotate', () => ({
  autoAnnotate: vi.fn(({ annotations = [] }) => annotations),
  enrichWithCommonFeatures: vi.fn(async (_seq, anns) => anns),
}));

function fileFromText(name, text) {
  return new File([text], name, { type: 'text/plain' });
}

const FASTA_A = '>a\nATGCATGCATGC\n';
const FASTA_B = '>b\nGGGGTTTTAAAA\n';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('M-B.2 K1 — useImporterState', () => {
  it('1) addFiles appends, does not replace — sequential calls accumulate parsedItems', async () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    expect(result.current.parsedItems).toEqual([]);

    await act(async () => {
      await result.current.addFiles([fileFromText('a.fasta', FASTA_A)]);
    });
    expect(result.current.parsedItems.length).toBe(1);
    expect(result.current.parsedItems[0]._fileName).toBe('a.fasta');
    expect(result.current.parsedItems[0]._source).toBe('file');

    await act(async () => {
      await result.current.addFiles([fileFromText('b.fasta', FASTA_B)]);
    });
    expect(result.current.parsedItems.length).toBe(2);
    expect(result.current.parsedItems.map(p => p._fileName)).toEqual(['a.fasta', 'b.fasta']);
  });

  it('2) setActiveTab switches between the four tab values; invalid values are ignored', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    expect(result.current.activeTab).toBe('overview');

    act(() => result.current.setActiveTab('sequence'));
    expect(result.current.activeTab).toBe('sequence');

    act(() => result.current.setActiveTab('annotations'));
    expect(result.current.activeTab).toBe('annotations');

    act(() => result.current.setActiveTab('history'));
    expect(result.current.activeTab).toBe('history');

    act(() => result.current.setActiveTab('overview'));
    expect(result.current.activeTab).toBe('overview');

    act(() => result.current.setActiveTab('garbage'));
    expect(result.current.activeTab).toBe('overview');
  });

  it('3) activeSource drill-down survives empty query; flat-mode selector reads catalogQuery', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));

    act(() => result.current.setActiveSource({ kind: 'mine', value: 'promoter' }));
    expect(result.current.activeSource).toEqual({ kind: 'mine', value: 'promoter' });
    expect(isCatalogFlatMode(result.current)).toBe(false);

    act(() => result.current.setCatalogQuery(''));
    expect(result.current.activeSource).toEqual({ kind: 'mine', value: 'promoter' });
    expect(isCatalogFlatMode(result.current)).toBe(false);

    act(() => result.current.setActiveSource(null));
    expect(result.current.activeSource).toBe(null);
  });

  it('4) catalogQuery non-empty puts state into flat-mode (selector returns true)', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));

    act(() => result.current.setCatalogQuery('promoter'));
    expect(result.current.catalogQuery).toBe('promoter');
    expect(isCatalogFlatMode(result.current)).toBe(true);

    act(() => result.current.setCatalogQuery('   '));
    expect(isCatalogFlatMode(result.current)).toBe(false);

    act(() => result.current.setCatalogQuery(''));
    expect(isCatalogFlatMode(result.current)).toBe(false);
  });

  it('5) appendAddedItem dedupes annotate-action with same name and zero deltaRegions', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));

    act(() => result.current.appendAddedItem({ name: 'pUC19', action: 'annotate', regionsAdded: 3 }));
    expect(result.current.addedItems).toHaveLength(1);
    expect(result.current.addedItems[0].regionsAdded).toBe(3);

    // Repeat annotate on same name, zero delta — drop the new entry.
    act(() => result.current.appendAddedItem({ name: 'pUC19', action: 'annotate', regionsAdded: 0 }));
    expect(result.current.addedItems).toHaveLength(1);
    expect(result.current.addedItems[0].regionsAdded).toBe(3);

    // Repeat annotate with non-zero delta — replace entry with fresh delta.
    act(() => result.current.appendAddedItem({ name: 'pUC19', action: 'annotate', regionsAdded: 5 }));
    expect(result.current.addedItems).toHaveLength(1);
    expect(result.current.addedItems[0].regionsAdded).toBe(5);

    // Different name — append separate entry.
    act(() => result.current.appendAddedItem({ name: 'pET28a', action: 'canvas' }));
    expect(result.current.addedItems).toHaveLength(2);
  });

  it('6) reset() clears parsedItems, edits, flags, addedItems, query, source, tab → defaults', async () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));

    await act(async () => {
      await result.current.addFiles([fileFromText('x.fasta', FASTA_A)]);
    });
    act(() => result.current.updateFlags('x.fasta', { autoAnnotate: false }));
    act(() => result.current.updateEdits('x.fasta', { editedAnnotations: [{ id: 'a' }] }));
    act(() => result.current.setActiveTab('annotations'));
    act(() => result.current.setActiveSource({ kind: 'mine', value: 'cds' }));
    act(() => result.current.setCatalogQuery('term'));
    act(() => result.current.appendAddedItem({ name: 'x', action: 'library' }));

    expect(result.current.parsedItems.length).toBe(1);
    expect(result.current.addedItems.length).toBe(1);

    act(() => result.current.reset());

    expect(result.current.parsedItems).toEqual([]);
    expect(result.current.perFileFlags).toEqual({});
    expect(result.current.perFileEdits).toEqual({});
    expect(result.current.activeTab).toBe('overview');
    expect(result.current.activeSource).toBe(null);
    expect(result.current.catalogQuery).toBe('');
    expect(result.current.addedItems).toEqual([]);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBe(null);
  });
});

// ─── Sprint M-X.3 K1 — pendingImport state machine ──────────────────
// PreImportModal sits between an entry-point (paste / drop / catalog
// click) and the Inspector. The hook holds a `pendingImport` envelope
// while the modal is open; `commitPendingImport(meta)` applies the
// user-chosen metadata and promotes the parsed item into `parsedItems`
// (the existing terminal state). `clearPendingImport()` is the cancel
// path. K1 covers ONLY the paste flow — file / catalog paths land in
// K2 / K2a.
describe('M-X.3 K1 — pendingImport for paste flow', () => {
  it('addPasteItem populates pendingImport, NOT parsedItems', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    expect(result.current.pendingImport).toBeNull();

    act(() => result.current.addPasteItem('ATGCATGCATGCATGC'));
    expect(result.current.parsedItems).toEqual([]);
    expect(result.current.pendingImport).toBeTruthy();
    expect(result.current.pendingImport.kind).toBe('paste');
    expect(result.current.pendingImport.parsedItem.sequence).toBe('ATGCATGCATGCATGC');
    expect(result.current.pendingImport.parsedItem._source).toBe('paste');
    expect(result.current.pendingImport.suggestedName).toBe('pasted');
    expect(result.current.pendingImport.defaultTopology).toBe('linear');
    expect(result.current.pendingImport.hasAnnotations).toBe(false);
  });

  it('addPasteItem with empty / whitespace-only input is a no-op', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.addPasteItem(''));
    act(() => result.current.addPasteItem('   \n\t  '));
    expect(result.current.pendingImport).toBeNull();
    expect(result.current.parsedItems).toEqual([]);
  });

  it('clearPendingImport drops the envelope without touching parsedItems', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.addPasteItem('ATGCATGCATGC'));
    expect(result.current.pendingImport).toBeTruthy();

    act(() => result.current.clearPendingImport());
    expect(result.current.pendingImport).toBeNull();
    expect(result.current.parsedItems).toEqual([]);
  });

  it('commitPendingImport applies meta + promotes parsedItem into parsedItems', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.addPasteItem('ATGCATGCATGCATGC'));

    act(() => result.current.commitPendingImport({
      name: 'pTest',
      topology: 'circular',
      tags: ['vec', 'lab'],
      annotateNow: false,
    }));

    expect(result.current.pendingImport).toBeNull();
    expect(result.current.parsedItems).toHaveLength(1);
    const it = result.current.parsedItems[0];
    expect(it.name).toBe('pTest');
    expect(it.topology).toBe('circular');
    expect(it.sequence).toBe('ATGCATGCATGCATGC');
    expect(it._source).toBe('paste');
    // perFileFlags + perFileEdits seeded so MetaColumn / OverviewTab
    // see the chosen tags + autoAnnotate flag.
    expect(result.current.perFileFlags[it._fileName]?.autoAnnotate).toBe(false);
    expect(result.current.perFileEdits[it._fileName]?.editedTags).toEqual(['vec', 'lab']);
  });

  it('commitPendingImport with annotateNow=true defaults the autoAnnotate flag ON', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.addPasteItem('ATGCATGCATGC'));
    act(() => result.current.commitPendingImport({
      name: 'p', topology: 'linear', tags: [], annotateNow: true,
    }));
    const it = result.current.parsedItems[0];
    expect(result.current.perFileFlags[it._fileName]?.autoAnnotate).toBe(true);
  });

  it('commitPendingImport without an open envelope is a safe no-op', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.commitPendingImport({
      name: 'x', topology: 'linear', tags: [], annotateNow: false,
    }));
    expect(result.current.parsedItems).toEqual([]);
    expect(result.current.pendingImport).toBeNull();
  });

  it('reset() clears any open pendingImport too', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.addPasteItem('ATGCATGCATGC'));
    expect(result.current.pendingImport).toBeTruthy();
    act(() => result.current.reset());
    expect(result.current.pendingImport).toBeNull();
  });
});

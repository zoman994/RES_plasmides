/**
 * Sprint M-B.2 K1 — useImporterState hook unit tests.
 *
 * Covers the state-shape rewrite: append-not-replace addFiles, tab/source/query
 * mutations, SessionSummary dedupe, reset behaviour. Pure unit tests via
 * @testing-library/react renderHook — no DOM, no parseFile (mocked at module
 * boundary, FASTA path triggered by .fasta extension).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
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

    // K2: single-file `addFiles` opens PreImportModal envelope; the
    // commit step is what writes to parsedItems. Mirror the live
    // flow here — parse → commit, parse → commit.
    await act(async () => {
      await result.current.addFiles([fileFromText('a.fasta', FASTA_A)]);
    });
    expect(result.current.parsedItems).toEqual([]);
    expect(result.current.pendingImport?.kind).toBe('file');
    act(() => result.current.commitPendingImport({
      name: 'a', topology: 'linear', tags: [], annotateNow: true,
    }));
    expect(result.current.parsedItems.length).toBe(1);
    expect(result.current.parsedItems[0]._fileName).toBe('a.fasta');
    expect(result.current.parsedItems[0]._source).toBe('file');

    await act(async () => {
      await result.current.addFiles([fileFromText('b.fasta', FASTA_B)]);
    });
    act(() => result.current.commitPendingImport({
      name: 'b', topology: 'linear', tags: [], annotateNow: true,
    }));
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
    // K2 — addFiles opens the modal; commit to land in parsedItems.
    act(() => result.current.commitPendingImport({
      name: 'x', topology: 'linear', tags: [], annotateNow: true,
    }));
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

  // StrictMode regression — biolog «загружаю 1 сиквенс а на выходе
  // два». React 18 StrictMode in dev double-invokes state updaters
  // to surface impure logic. Pre-fix, `commitPendingImport` called
  // `setParsedItems` (and friends) INSIDE the `setPendingImport`
  // updater — the inner setters fired twice, doubling parsedItems
  // every commit. This test wraps the hook in <StrictMode> so the
  // regression would re-surface here.
  it('StrictMode: paste + commit lands EXACTLY one item (no double-fire)', () => {
    const { result } = renderHook(
      () => useImporterState({ mode: 'advanced' }),
      { wrapper: StrictMode },
    );
    act(() => result.current.addPasteItem('ATGCATGCATGC'));
    act(() => result.current.commitPendingImport({
      name: 'pStrict', topology: 'linear', tags: [], annotateNow: true,
    }));
    expect(result.current.parsedItems).toHaveLength(1);
    expect(result.current.parsedItems[0].name).toBe('pStrict');
  });
});

// ─── Sprint M-X.3 K2 — pendingImport for file flow ───────────────────
// (catalog flow intentionally bypasses the modal — biolog «при
// открытии плазмид из каталога не надо давать модалку с названием»;
// catalog items are already named, topology'd and annotated, no
// metadata to capture.)
describe('M-X.3 K2 — addCatalogItem skips PreImportModal (revert from K2 routing)', () => {
  it('addCatalogItem writes directly to parsedItems (no modal envelope)', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.addCatalogItem({
      id: 'cat-1', name: 'pUC19', sequence: 'ATGC'.repeat(50),
      length: 200, topology: 'circular',
      annotations: [
        { id: 'a1', name: 'AmpR', type: 'CDS', start: 10, end: 100, level: 'region' },
        { id: 'a2', name: 'lac', type: 'promoter', start: 110, end: 150, level: 'region' },
      ],
      _source: 'mine',
    }));
    expect(result.current.pendingImport).toBeNull();
    expect(result.current.parsedItems).toHaveLength(1);
    const it = result.current.parsedItems[0];
    expect(it.name).toBe('pUC19');
    expect(it.topology).toBe('circular');
    expect(it.annotations).toHaveLength(2);
    expect(it._source).toBe('catalog');
    expect(it._libraryEntryId).toBe('cat-1');
  });

  it('addCatalogItem with no sequence is a no-op', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.addCatalogItem({ id: 'x', name: 'empty' }));
    expect(result.current.pendingImport).toBeNull();
    expect(result.current.parsedItems).toEqual([]);
  });

  it('addCatalogItem from snapgene preserves annotations as-is', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    const annotations = [
      { id: 'a1', name: 'AmpR', type: 'CDS', start: 10, end: 100, level: 'region' },
    ];
    act(() => result.current.addCatalogItem({
      id: 'c1', name: 'pX', sequence: 'ATGC'.repeat(50),
      length: 200, topology: 'circular', annotations, _source: 'snapgene',
    }));
    expect(result.current.parsedItems[0].annotations).toEqual(annotations);
    expect(result.current.parsedItems[0]._fromFileCount).toBe(1);
    expect(result.current.perFileFlags[result.current.parsedItems[0]._fileName]?.autoAnnotate).toBe(true);
  });
});

describe('M-X.3 K2 — pendingImport for file flow (single)', () => {
  it('addFiles with one file routes through pendingImport (kind=file)', async () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    await act(async () => {
      await result.current.addFiles([fileFromText('a.fasta', FASTA_A)]);
    });
    expect(result.current.parsedItems).toEqual([]);
    const env = result.current.pendingImport;
    expect(env).toBeTruthy();
    expect(env.kind).toBe('file');
    expect(env.parsedItem._fileName).toBe('a.fasta');
    expect(env.parsedItem._source).toBe('file');
    expect(env.suggestedName).toBeTruthy();
  });

  it('addFiles with one file: hasAnnotations reflects parsedItem.annotations', async () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    await act(async () => {
      await result.current.addFiles([fileFromText('a.fasta', FASTA_A)]);
    });
    // FASTA path produces no annotations.
    expect(result.current.pendingImport.hasAnnotations).toBe(false);
  });

  it('addFiles with targetFolderPath carries it through commit as folderPath (not as a tag)', async () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    await act(async () => {
      await result.current.addFiles(
        [fileFromText('a.fasta', FASTA_A)],
        { targetFolderPath: 'Vectors/CRISPR' }
      );
    });
    expect(result.current.pendingImport.suggestedFolderPath).toBe('Vectors/CRISPR');
    expect(result.current.pendingImport.suggestedTags).toEqual([]);
    act(() => result.current.commitPendingImport({
      name: 'a', topology: 'linear', tags: [], folderPath: 'Vectors/CRISPR', annotateNow: true,
    }));
    const it = result.current.parsedItems[0];
    expect(result.current.perFileEdits[it._fileName]?.editedFolderPath).toBe('Vectors/CRISPR');
    expect(result.current.perFileEdits[it._fileName]?.editedTags || []).toEqual([]);
  });
});

// ─── Sprint M-X.3 K2a — multi-file pendingImport ─────────────────────
describe('M-X.3 K2a — pendingImport for multi-file flow', () => {
  it('addFiles with multiple files routes through pendingImport.kind=multi', async () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    await act(async () => {
      await result.current.addFiles([
        fileFromText('a.fasta', FASTA_A),
        fileFromText('b.fasta', FASTA_B),
        fileFromText('c.fasta', FASTA_A),
      ]);
    });
    expect(result.current.parsedItems).toEqual([]);
    const env = result.current.pendingImport;
    expect(env).toBeTruthy();
    expect(env.kind).toBe('multi');
    expect(Array.isArray(env.parsedItems)).toBe(true);
    expect(env.parsedItems).toHaveLength(3);
    expect(env.parsedItems.map((p) => p._fileName)).toEqual(['a.fasta', 'b.fasta', 'c.fasta']);
  });

  it('multi commit applies tags + topology + folderPath to ALL items', async () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    await act(async () => {
      await result.current.addFiles([
        fileFromText('a.fasta', FASTA_A),
        fileFromText('b.fasta', FASTA_B),
      ]);
    });
    act(() => result.current.commitPendingImport({
      topology: 'circular',
      tags: ['lab', 'batch-2026'],
      folderPath: 'Vectors',
      annotateNow: false,
    }));
    expect(result.current.parsedItems).toHaveLength(2);
    expect(result.current.parsedItems.every((p) => p.topology === 'circular')).toBe(true);
    for (const it of result.current.parsedItems) {
      const edits = result.current.perFileEdits[it._fileName] || {};
      const tags = edits.editedTags || [];
      expect(tags).not.toContain('Vectors'); // folder is no longer auto-tagged
      expect(tags).toContain('lab');
      expect(tags).toContain('batch-2026');
      expect(edits.editedFolderPath).toBe('Vectors');
      expect(result.current.perFileFlags[it._fileName]?.autoAnnotate).toBe(false);
    }
  });

  it('multi commit with perFileNames overrides each parsedItem name', async () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    await act(async () => {
      await result.current.addFiles([
        fileFromText('a.fasta', FASTA_A),
        fileFromText('b.fasta', FASTA_B),
      ]);
    });
    act(() => result.current.commitPendingImport({
      topology: 'linear',
      tags: [],
      annotateNow: true,
      perFileNames: { 'a.fasta': 'pAlpha', 'b.fasta': 'pBeta' },
    }));
    expect(result.current.parsedItems[0].name).toBe('pAlpha');
    expect(result.current.parsedItems[1].name).toBe('pBeta');
  });

  it('multi commit without perFileNames keeps each parsedItem original name', async () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    await act(async () => {
      await result.current.addFiles([
        fileFromText('a.fasta', FASTA_A),
        fileFromText('b.fasta', FASTA_B),
      ]);
    });
    const orig = result.current.pendingImport.parsedItems.map((p) => p.name);
    act(() => result.current.commitPendingImport({
      topology: 'linear', tags: [], annotateNow: true,
    }));
    expect(result.current.parsedItems.map((p) => p.name)).toEqual(orig);
  });

  it('multi envelope hasAnnotations is true if ANY parsed item has annotations', async () => {
    // Both inputs are FASTA — neither has annotations. So hasAnnotations
    // should be false. Drop the assertion through to make sure the
    // envelope shape is right.
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    await act(async () => {
      await result.current.addFiles([
        fileFromText('a.fasta', FASTA_A),
        fileFromText('b.fasta', FASTA_B),
      ]);
    });
    expect(result.current.pendingImport.hasAnnotations).toBe(false);
  });
});

// ─── Sprint M-X.3 follow-up — annotateNow auto-opens the Annotator ────
// Biolog 05.05.2026: «после добавления сиквенса тебя бросает на обзор
// но это же не логично! открываться сразу должен аннотатор, мы же явно
// указали галкой что надо аннотировать». PreImportModal already has the
// "Аннотировать сейчас" checkbox; commitPendingImport with annotateNow=
// true stashes the just-committed item's _fileName into
// `pendingAnnotatorFile` so the Importer container can pick it up and
// dispatch `openAnnotator` for that sequence. Multi-file commits do NOT
// set the flag — we'd have to pick one of N files arbitrarily, and the
// per-file annotate flag still routes through MultiInspector's per-row
// flow. The "Annotator on first file" behaviour is single + paste only.
describe('M-X.3 follow-up — pendingAnnotatorFile post-commit signal', () => {
  it('default value is null', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    expect(result.current.pendingAnnotatorFile).toBeNull();
  });

  it('paste commit with annotateNow=true sets pendingAnnotatorFile to the new item _fileName', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.addPasteItem('ATGCATGCATGCATGC'));
    act(() => result.current.commitPendingImport({
      name: 'pAnno', topology: 'linear', tags: [], annotateNow: true,
    }));
    const it = result.current.parsedItems[0];
    expect(result.current.pendingAnnotatorFile).toBe(it._fileName);
  });

  it('paste commit with annotateNow=false leaves pendingAnnotatorFile null', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.addPasteItem('ATGCATGCATGC'));
    act(() => result.current.commitPendingImport({
      name: 'pSilent', topology: 'linear', tags: [], annotateNow: false,
    }));
    expect(result.current.pendingAnnotatorFile).toBeNull();
  });

  it('single file commit with annotateNow=true sets pendingAnnotatorFile', async () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    await act(async () => {
      await result.current.addFiles([fileFromText('a.fasta', FASTA_A)]);
    });
    act(() => result.current.commitPendingImport({
      name: 'a', topology: 'linear', tags: [], annotateNow: true,
    }));
    expect(result.current.pendingAnnotatorFile).toBe('a.fasta');
  });

  it('multi commit with annotateNow=true does NOT set pendingAnnotatorFile (stays null)', async () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    await act(async () => {
      await result.current.addFiles([
        fileFromText('a.fasta', FASTA_A),
        fileFromText('b.fasta', FASTA_B),
      ]);
    });
    act(() => result.current.commitPendingImport({
      topology: 'linear', tags: [], annotateNow: true,
    }));
    expect(result.current.pendingAnnotatorFile).toBeNull();
  });

  it('clearPendingAnnotator() drops the stashed file name', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.addPasteItem('ATGCATGCATGC'));
    act(() => result.current.commitPendingImport({
      name: 'p', topology: 'linear', tags: [], annotateNow: true,
    }));
    expect(result.current.pendingAnnotatorFile).toBeTruthy();
    act(() => result.current.clearPendingAnnotator());
    expect(result.current.pendingAnnotatorFile).toBeNull();
  });

  it('reset() clears pendingAnnotatorFile', () => {
    const { result } = renderHook(() => useImporterState({ mode: 'advanced' }));
    act(() => result.current.addPasteItem('ATGCATGCATGC'));
    act(() => result.current.commitPendingImport({
      name: 'p', topology: 'linear', tags: [], annotateNow: true,
    }));
    expect(result.current.pendingAnnotatorFile).toBeTruthy();
    act(() => result.current.reset());
    expect(result.current.pendingAnnotatorFile).toBeNull();
  });
});

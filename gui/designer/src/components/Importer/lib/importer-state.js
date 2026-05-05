import { useRef, useState, useCallback } from 'react';
import { parseFile } from '../../../file-import';
import { sanitizeWithReport } from '../../../sequence-utils';
import { detectFormat } from '../../../format-detect';
import { appendSessionEntry } from '../inspector/lib/session-log';
import { useStore } from '../../../store';

/**
 * Importer-local state hook (M-B.2 K1 rewrite).
 *
 * Was: step semantic (1=Source, 2=Combined) + per-file flags/edits.
 * Now: single-screen state with activeTab + CatalogColumn drill-down +
 * SessionSummary accumulator. Step semantic is gone — the biolog sees
 * Catalog / Inspector / Meta / Footer simultaneously, and расширенные
 * виды (sequence / annotations / history) живут табами внутри Inspector
 * с lazy mount (V49 fix).
 *
 * Shape:
 *   parsedItems       : Array<ParsedItem & { _fileName, _error?, _source? }>
 *   currentIdx        : number
 *   perFileFlags      : { [fileName]: { autoAnnotate: boolean } }
 *   perFileEdits      : { [fileName]: { editedAnnotations?, editedSequence?, enrichedCache? } }
 *   activeTab         : 'overview' | 'sequence' | 'annotations' | 'history'
 *   activeSource      : { kind, value } | null      — CatalogColumn drill-down
 *   catalogQuery      : string                       — CatalogColumn search input
 *   addedItems        : SessionEntry[]               — SessionSummary accumulator
 *   busy, error
 *
 * Methods:
 *   setCurrentIdx, setActiveTab, setActiveSource, setCatalogQuery
 *   addFiles(files)        — append parsedItems
 *   addCatalogItem(item)   — silent replace single (or batch via confirm at call site)
 *   addPasteItem(text)     — sanitize + append (single replacement on solo state)
 *   removeFile(fileName)
 *   updateFlags(fileName, patch)
 *   updateEdits(fileName, patch)
 *   appendAddedItem(entry) — SessionSummary entry (deduped per session-log.js)
 *   reset()
 *
 * Mode (advanced/simple) lives in the global ui slice; passed in here for
 * branching but not duplicated.
 */
export function useImporterState({ mode } = {}) { // eslint-disable-line no-unused-vars
  const [parsedItems, setParsedItems] = useState([]);
  const [currentIdx, setCurrentIdxState] = useState(0);
  const [perFileFlags, setPerFileFlags] = useState({});
  const [perFileEdits, setPerFileEdits] = useState({});
  const [activeTab, setActiveTabState] = useState('overview');
  const [activeSource, setActiveSourceState] = useState(null);
  const [catalogQuery, setCatalogQueryState] = useState('');
  const [addedItems, setAddedItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Sprint M-X.3 K1 — PreImportModal envelope. While non-null, the
  // user is inside the metadata modal; on commit it's promoted into
  // `parsedItems` (the existing terminal state). On clear it's just
  // dropped (cancel path). Shape:
  //   { kind: 'paste' | 'file' | 'catalog' | 'multi',
  //     parsedItem?, parsedItems?,
  //     suggestedName, defaultTopology, hasAnnotations,
  //     suggestedTags?, source }
  const [pendingImport, setPendingImport] = useState(null);
  // Sprint M-X.3 follow-up (05.05.2026) — biolog: «после добавления
  // сиквенса тебя бросает на обзор но это же не логично! открываться
  // сразу должен аннотатор, мы же явно указали галкой что надо
  // аннотировать». commitPendingImport stashes the just-committed
  // item's _fileName here when annotateNow=true (single + paste only;
  // multi-file batches don't auto-open Annotator — see comment in
  // commitPendingImport). Importer/index.jsx watches the field and
  // dispatches `openAnnotator({ kind: 'full', sequenceId })` once,
  // then calls `clearPendingAnnotator()`.
  const [pendingAnnotatorFile, setPendingAnnotatorFile] = useState(null);
  const cancelToken = useRef(0);

  const reset = useCallback(() => {
    cancelToken.current += 1;
    setParsedItems([]);
    setCurrentIdxState(0);
    setPerFileFlags({});
    setPerFileEdits({});
    setActiveTabState('overview');
    setActiveSourceState(null);
    setCatalogQueryState('');
    setAddedItems([]);
    setBusy(false);
    setError(null);
    setPendingImport(null);
    setPendingAnnotatorFile(null);
  }, []);

  /** Drop the pending envelope without writing to parsedItems (cancel). */
  const clearPendingImport = useCallback(() => {
    setPendingImport(null);
  }, []);

  /**
   * Clear the post-commit «open Annotator for this file» flag once the
   * Importer container has dispatched `openAnnotator` for it.
   */
  const clearPendingAnnotator = useCallback(() => {
    setPendingAnnotatorFile(null);
  }, []);

  /**
   * Apply the user-chosen meta to the pending parsedItem(s) and
   * promote into `parsedItems`. Meta shape:
   *   { name, topology, tags: string[], folderPath?, annotateNow,
   *     keepExistingAnnotations? }  // last only relevant for file/catalog
   *
   * Multi-file (kind: 'multi') applies tags + folderPath + annotateNow
   * to ALL items but leaves per-file `name` untouched (those are
   * pre-edited inline in the modal's file list).
   *
   * Tags and folder placement are independent dimensions — the
   * folder picker writes `folderPath`, the tags chips write `tags`.
   * Either can be empty.
   *
   * StrictMode safety (regression «загружаю 1 сиквенс а на выходе
   * два», 04.05.2026 evening): React 18 StrictMode dev mode double-
   * invokes state updaters to surface impure logic. Pre-fix this
   * function was implemented as one big `setPendingImport` updater
   * with `setParsedItems` / `setPerFileFlags` / `setPerFileEdits`
   * nested INSIDE — every inner setter fired twice, doubling every
   * commit. The fix snapshots the pending envelope via the closed-
   * over `pendingImport` ref and runs all setX calls at the top
   * level, where their own updaters are pure.
   */
  const commitPendingImport = useCallback((meta) => {
    if (!pendingImport) return;
    const prev = pendingImport;
    const m = meta || {};
    const tags = Array.isArray(m.tags) ? m.tags.filter(Boolean) : [];
    const folderPath = typeof m.folderPath === 'string' ? m.folderPath : '';
    const annotateNow = m.annotateNow !== false; // default ON
    const keepExisting = m.keepExistingAnnotations !== false; // default keep

    const perFileNames = m.perFileNames && typeof m.perFileNames === 'object'
      ? m.perFileNames
      : null;

    const applyToOne = (parsed) => {
      const next = { ...parsed };
      // Per-file name override (multi mode) wins over the shared
      // `name` field — that field is hidden in multi mode anyway.
      const fileNameOverride = perFileNames && perFileNames[parsed._fileName];
      if (typeof fileNameOverride === 'string' && fileNameOverride.trim()) {
        next.name = fileNameOverride.trim();
      } else if (typeof m.name === 'string' && m.name.trim()) {
        next.name = m.name.trim();
      }
      if (m.topology === 'circular' || m.topology === 'linear') {
        next.topology = m.topology;
      }
      if (!keepExisting) {
        next.annotations = [];
        next._fromFileCount = 0;
      }
      return next;
    };

    const newItems = prev.kind === 'multi'
      ? (prev.parsedItems || []).map(applyToOne)
      : [applyToOne(prev.parsedItem)];

    // Top-level setX calls — each updater is pure (just transforms
    // its own previous value). StrictMode-safe because React only
    // re-runs the updater itself, not the surrounding code.
    setParsedItems((prevItems) => [...prevItems, ...newItems]);
    setPerFileFlags((prevFlags) => {
      const next = { ...prevFlags };
      for (const it of newItems) {
        next[it._fileName] = { ...(next[it._fileName] || {}), autoAnnotate: annotateNow };
      }
      return next;
    });
    setPerFileEdits((prevEdits) => {
      const next = { ...prevEdits };
      for (const it of newItems) {
        const cur = next[it._fileName] || {};
        next[it._fileName] = {
          ...cur,
          ...(tags.length > 0 ? { editedTags: tags } : {}),
          ...(folderPath ? { editedFolderPath: folderPath } : {}),
        };
      }
      return next;
    });
    setActiveTabState('overview');
    setPendingImport(null); // close the modal
    // Single-file / paste with annotateNow=true → arm the post-commit
    // signal so Importer/index.jsx opens the Annotator on the new
    // item. Multi-file batches are skipped: there's no "the" file
    // to annotate, and the per-file autoAnnotate flag still routes
    // through MultiInspector's per-row controls.
    if (annotateNow && prev.kind !== 'multi' && newItems.length > 0) {
      setPendingAnnotatorFile(newItems[0]._fileName);
    }
  }, [pendingImport]);

  /**
   * Parse a batch of files in parallel, append to parsedItems, default
   * `autoAnnotate=true` per file. Failures land as `{ _fileName, _error }`.
   *
   * `opts.targetFolderPath` (optional) pre-fills the parsed item's
   * folder path — used by per-folder import buttons in the
   * CatalogColumn so dropped files land inside the target folder once
   * confirmed to Library. Tags are no longer auto-derived from the
   * folder path (biolog: «такги просто атрибут … папки с названиями
   * тагов не создавать»).
   */
  const addFiles = useCallback(async (files, opts = {}) => {
    if (!files || files.length === 0) return [];
    const myToken = ++cancelToken.current;
    setBusy(true);
    setError(null);
    const results = await Promise.all((files || []).map(async (f) => {
      try {
        const item = await parseFile(f);
        return { ...item, _fileName: f.name, _source: 'file' };
      } catch (err) {
        return {
          _fileName: f.name,
          _error: err.message || String(err),
          _source: 'file',
          name: f.name, sequence: '', length: 0, annotations: [], topology: 'linear',
        };
      }
    }));
    if (cancelToken.current !== myToken) return [];

    // Sprint M-X.3 K2 — single file routes through PreImportModal
    // envelope instead of straight to parsedItems. Multi-file
    // (length > 1) opens a `kind: 'multi'` envelope with shared
    // metadata + per-file name list (PreImportModal handles the
    // multi mode in K2a).
    setBusy(false);
    if (results.length === 1) {
      const r = results[0];
      // Errored parse — still surface it without the modal so the
      // user sees the toast / inspector error path. (Failed parses
      // can't be «edited» into something useful via metadata.)
      if (r._error) {
        setParsedItems(prev => [...prev, r]);
        setPerFileFlags(prev => ({ ...prev, [r._fileName]: { autoAnnotate: true } }));
        return results;
      }
      setPendingImport({
        kind: 'file',
        parsedItem: r,
        suggestedName: r.name || r._fileName,
        defaultTopology: r.topology || 'linear',
        hasAnnotations: Array.isArray(r.annotations) && r.annotations.length > 0,
        suggestedTags: [],
        suggestedFolderPath: typeof opts.targetFolderPath === 'string' ? opts.targetFolderPath : '',
        source: 'file',
      });
      return results;
    }

    // Multi-file (length > 1) — K2a routes through pendingImport
    // with `kind: 'multi'`. Errored parses are kept in the envelope
    // so the modal can show them in the file list (greyed out); the
    // commit path skips them since there's nothing useful to land.
    const usable = results.filter((r) => !r._error);
    if (usable.length === 0) {
      // All-failed batch: surface errors directly.
      setParsedItems(prev => [...prev, ...results]);
      setPerFileFlags(prev => {
        const next = { ...prev };
        for (const r of results) {
          if (!next[r._fileName]) next[r._fileName] = { autoAnnotate: true };
        }
        return next;
      });
      return results;
    }
    setPendingImport({
      kind: 'multi',
      parsedItems: usable,
      // Multi mode hides the single-name input — hint values for
      // shared fields land on the envelope so the modal seeds them.
      suggestedName: '',
      defaultTopology: 'linear',
      hasAnnotations: usable.some((r) => Array.isArray(r.annotations) && r.annotations.length > 0),
      suggestedTags: [],
      suggestedFolderPath: typeof opts.targetFolderPath === 'string' ? opts.targetFolderPath : '',
      source: 'file',
    });
    return results;
  }, []);

  /**
   * Add a catalog item — Sprint M-X.3 follow-up: catalog items
   * (SnapGene / demo / user library / this-project) bypass the
   * PreImportModal entirely. Biolog «при открытии плазмид из
   * каталога не надо давать модалку с названием» — these items
   * already have a name + topology + annotations from their source,
   * so there's nothing for the metadata modal to capture. Drops
   * straight into parsedItems just like pre-K2.
   */
  const addCatalogItem = useCallback((item) => {
    if (!item || !item.sequence) return;
    const fn = item._fileName || `${item.name || 'catalog'}.dna`;
    const annotations = Array.isArray(item.annotations) ? item.annotations : [];
    const next = {
      name: item.name || 'catalog',
      sequence: item.sequence,
      length: item.length || item.sequence.length,
      topology: item.topology || 'linear',
      annotations,
      organism: item.organism || '',
      description: (item.description || '').replace(/<[^>]*>/g, '').trim(),
      _fileName: fn,
      _source: 'catalog',
      // MetaColumn reads _fromFileCount to show «Из файла: N». Catalog
      // items already carry annotations from their source (SnapGene /
      // Library entry), so count them here — without this the column
      // shows 0 and biolog thinks the entry is empty.
      _fromFileCount: annotations.length,
      // Preserve source library-entry id for Mine items so ActionsBar can
      // hide «В библиотеку» — биолог: «всё что в библиотеке НЕ ИМЕЕТ
      // этой клавиши, импорт со стороны — имеет». For Demo/SnapGene the
      // item.id is a synthetic catalog id (not in libraryEntries) — we
      // only carry it when source is the user's own library.
      _libraryEntryId: item._source === 'mine' && item.id ? item.id : undefined,
    };
    setParsedItems([next]);
    setCurrentIdxState(0);
    setActiveTabState('overview');
    setPerFileFlags({ [fn]: { autoAnnotate: true } });
    // Sprint M-X.3 follow-up — biolog: «при клике на левой панели мы
    // сразу не попадали в аннотатор базово - превью. в аннотатор мы
    // попадаем для свежезагруженных последоватльностей». Catalog
    // items are pre-annotated; nothing to auto-annotate. Stomp any
    // leftover annotator.open state from a prior PreImportModal flow
    // so the modal doesn't surface over the new catalog item.
    try { useStore.getState().closeAnnotator?.(); } catch { /* ignore */ }
    setPendingAnnotatorFile(null);
    // Carry library entry's existing tags through the perFileEdits
    // override so they show up in MetaColumn / TagsEditor without
    // re-typing. Only meaningful for 'mine' (user library); demo /
    // snapgene don't carry user-defined tags.
    const tags = Array.isArray(item._tags) ? item._tags : [];
    setPerFileEdits(tags.length > 0 ? { [fn]: { editedTags: [...tags] } } : {});
  }, []);

  /**
   * Add a pasted text fragment as parsedItem. Sanitizes raw text;
   * GenBank/FASTA detection lifted from v0.5 ImportStartScreen handlePasteText.
   */
  const addPasteItem = useCallback((text) => {
    if (!text || !text.trim()) return;
    const fmt = detectFormat(text);
    const fn = `paste-${Date.now()}.txt`;
    if (fmt === 'raw') {
      const report = sanitizeWithReport(text);
      const next = {
        name: 'pasted',
        sequence: report.sequence,
        length: report.sequence.length,
        topology: 'linear',
        annotations: [],
        _fileName: fn,
        _source: 'paste',
        _sanitizeReport: report,
      };
      // Sprint M-X.3 K1 — route through PreImportModal envelope.
      // Pre-K1 this called setParsedItems directly; now the user
      // confirms metadata in PreImportModal first, then
      // commitPendingImport promotes the item.
      setPendingImport({
        kind: 'paste',
        parsedItem: next,
        suggestedName: 'pasted',
        defaultTopology: 'linear',
        hasAnnotations: false,
        source: 'paste',
      });
    }
    // GenBank/FASTA pasted text could be parsed via parseFile by wrapping
    // in a Blob/File — out of scope for K1 minimal port; stays raw-only.
  }, []);

  const removeFile = useCallback((fileName) => {
    setParsedItems(prev => prev.filter(p => p._fileName !== fileName));
    setPerFileFlags(prev => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });
    setPerFileEdits(prev => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });
    setCurrentIdxState(prev => Math.max(0, prev - 1));
  }, []);

  const updateFlags = useCallback((fileName, patch) => {
    setPerFileFlags(prev => ({
      ...prev,
      [fileName]: { ...(prev[fileName] || {}), ...patch },
    }));
  }, []);

  const updateEdits = useCallback((fileName, patch) => {
    setPerFileEdits(prev => ({
      ...prev,
      [fileName]: { ...(prev[fileName] || {}), ...patch },
    }));
  }, []);

  const setActiveTab = useCallback((tab) => {
    if (tab !== 'overview' && tab !== 'sequence' && tab !== 'annotations' && tab !== 'history') return;
    setActiveTabState(tab);
  }, []);

  const setActiveSource = useCallback((source) => {
    setActiveSourceState(source || null);
  }, []);

  const setCatalogQuery = useCallback((q) => {
    setCatalogQueryState(typeof q === 'string' ? q : '');
  }, []);

  const setCurrentIdx = useCallback((idx) => {
    setCurrentIdxState(idx);
    setActiveTabState('overview');
  }, []);

  const appendAddedItem = useCallback((entry) => {
    if (!entry || !entry.name || !entry.action) return;
    setAddedItems(prev => appendSessionEntry(prev, entry));
  }, []);

  return {
    parsedItems,
    currentIdx,
    perFileFlags,
    perFileEdits,
    activeTab,
    activeSource,
    catalogQuery,
    addedItems,
    busy,
    error,
    pendingImport,
    pendingAnnotatorFile,
    setCurrentIdx,
    setActiveTab,
    setActiveSource,
    setCatalogQuery,
    addFiles,
    addCatalogItem,
    addPasteItem,
    removeFile,
    updateFlags,
    updateEdits,
    appendAddedItem,
    clearPendingImport,
    commitPendingImport,
    clearPendingAnnotator,
    reset,
    setError,
  };
}

/**
 * Selector: catalog flat-search mode is active when the search input is
 * non-empty. Used by CatalogColumn to overlay flat results above the tree.
 */
export function isCatalogFlatMode(state) {
  return !!(state.catalogQuery && state.catalogQuery.trim().length > 0);
}

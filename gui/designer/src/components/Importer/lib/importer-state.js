import { useRef, useState, useCallback } from 'react';
import { parseFile } from '../../../file-import';
import { sanitizeWithReport } from '../../../sequence-utils';
import { detectFormat } from '../../../format-detect';
import { appendSessionEntry } from '../inspector/lib/session-log';

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
  }, []);

  /**
   * Parse a batch of files in parallel, append to parsedItems, default
   * `autoAnnotate=true` per file. Failures land as `{ _fileName, _error }`.
   */
  const addFiles = useCallback(async (files) => {
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
    setParsedItems(prev => [...prev, ...results]);
    setPerFileFlags(prev => {
      const next = { ...prev };
      for (const r of results) {
        if (!next[r._fileName]) next[r._fileName] = { autoAnnotate: true };
      }
      return next;
    });
    setBusy(false);
    return results;
  }, []);

  /**
   * Add a catalog item as a parsedItem (silent single replacement).
   * Multi-mode confirm is the caller's responsibility.
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
    };
    setParsedItems([next]);
    setCurrentIdxState(0);
    setActiveTabState('overview');
    setPerFileFlags({ [fn]: { autoAnnotate: true } });
    setPerFileEdits({});
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
      setParsedItems(prev => prev.length === 0 ? [next] : [...prev, next]);
      setPerFileFlags(prev => ({ ...prev, [fn]: { autoAnnotate: true } }));
      setActiveTabState('overview');
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

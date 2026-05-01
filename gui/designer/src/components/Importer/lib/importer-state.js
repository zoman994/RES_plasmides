import { useRef, useState, useCallback } from 'react';
import { parseFile } from '../../../file-import';

/**
 * Importer-local state hook (M-B.1 K2).
 *
 * Lives outside the global store: nothing here persists past Confirm.
 * On Confirm, K6 will call into librarySlice / projectSlice / primerSlice
 * to commit. Until then everything stays in this hook so cancel = clean exit.
 *
 * Shape:
 *   parsedItems   : Array<ParsedItem & { _fileName, _error? }>
 *   currentIdx    : number  — active file in multi-file mode (0 if single)
 *   step          : 1 | 2   — 2 in advanced; 1 in simple (instant)
 *   perFileFlags  : { [fileName]: { autoAnnotate: boolean } }
 *   perFileEdits  : { [fileName]: { editedAnnotations?, originOffset?, name? } }
 *
 * Mode (advanced/simple) lives in the global ui slice (persisted in
 * localStorage) — passed in here for branching, not duplicated.
 */
export function useImporterState({ mode } = {}) {
  const [parsedItems, setParsedItems] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [step, setStep] = useState(1);
  const [perFileFlags, setPerFileFlags] = useState({});
  const [perFileEdits, setPerFileEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cancelToken = useRef(0);

  const reset = useCallback(() => {
    cancelToken.current += 1;
    setParsedItems([]);
    setCurrentIdx(0);
    setStep(1);
    setPerFileFlags({});
    setPerFileEdits({});
    setBusy(false);
    setError(null);
  }, []);

  /**
   * Parse a batch of files in parallel, append to parsedItems, default
   * `autoAnnotate=true` per file (one checkbox controls enrichment in K5).
   * Failures land as `{ _fileName, _error }` entries.
   */
  const addFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return [];
    const myToken = ++cancelToken.current;
    setBusy(true);
    setError(null);
    const results = await Promise.all((files || []).map(async (f) => {
      try {
        const item = await parseFile(f);
        return { ...item, _fileName: f.name };
      } catch (err) {
        return {
          _fileName: f.name,
          _error: err.message || String(err),
          name: f.name, sequence: '', length: 0, annotations: [], topology: 'linear',
        };
      }
    }));
    if (cancelToken.current !== myToken) return [];
    setParsedItems(prev => {
      const next = [...prev, ...results];
      return next;
    });
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
    setCurrentIdx(prev => Math.max(0, prev - 1));
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

  const goNext = useCallback(() => {
    setStep(s => (mode === 'simple' ? 1 : Math.min(2, s + 1)));
  }, [mode]);

  const goBack = useCallback(() => setStep(s => Math.max(1, s - 1)), []);

  return {
    parsedItems,
    currentIdx,
    step: mode === 'simple' ? 1 : step,
    perFileFlags,
    perFileEdits,
    busy,
    error,
    setCurrentIdx,
    setStep,
    addFiles,
    removeFile,
    updateFlags,
    updateEdits,
    goNext,
    goBack,
    reset,
    setError,
  };
}

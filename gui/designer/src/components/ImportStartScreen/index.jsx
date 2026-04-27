import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store';
import { handleFileImport } from '../../file-import';
import { sanitizeWithReport } from '../../sequence-utils';
import { detectFormat } from '../../format-detect';
import { rotateOriginToPosition } from '../../rotate-origin';
import { getRegions } from '../../annotation-model';
import { exportGenBank } from '../../exports';
import InputZone from './InputZone';
import MetaColumn from './MetaColumn';
import ActionsBar from './ActionsBar';
import MultiFileList from './MultiFileList';
import CatalogTree from './CatalogTree';
import SessionSummary from './SessionSummary';
import FileSummaryCard from './FileSummaryCard';
import { appendSessionEntry } from './session-log';

/**
 * InlineEditableTitle — Polish §1. Click-to-edit single-line title.
 *   default: text + ✎ icon (opacity 0 until parent hover, then 0.6)
 *   click  : transitions to <input>, autofocus + select-all
 *   Enter  : commit (calls onCommit with trimmed value, blank kept blank)
 *   Esc    : cancel (resets draft to current value)
 *   blur   : commit (treated like Enter)
 */
export function InlineEditableTitle({ value, onCommit, placeholder = '(без имени)' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value || '');
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if ((draft || '') !== (value || '')) onCommit?.(draft);
  };
  const cancel = () => {
    setDraft(value || '');
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        className="text-lg font-semibold text-gray-800 bg-white border border-emerald-500 rounded px-2 py-0.5 outline-none w-full"
        data-testid="title-input"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 text-left max-w-full"
      data-testid="title-display"
    >
      <span className="text-lg font-semibold text-gray-800 truncate" title={value || placeholder}>
        {value || <span className="text-gray-400 italic font-normal">{placeholder}</span>}
      </span>
      <span className="text-gray-400 opacity-0 group-hover:opacity-60 transition-opacity text-sm" aria-hidden="true">
        ✎
      </span>
    </button>
  );
}

/**
 * ImportStartScreen — single entry point for file import + paste + catalog
 * browse + library access. Replaces ImportDecisionModal + CatalogPanel.
 *
 * State branches (driven by parsedItems.length and catalogExpanded):
 *  - empty            → full primary InputZone, catalog row collapsed below
 *  - catalogExpanded  → compact InputZone strip + full CatalogTree
 *  - single (length 1)→ filled InputZone + MetaColumn + ActionsBar
 *  - multi (length >1)→ MultiFileList + restricted ActionsBar
 *
 * Local state — no Zustand slice. Modal-scoped only; resets on close.
 */
export default function ImportStartScreen({ open, onClose, presetFiles, catalogExpandedInitial }) {
  const addPart = useStore((s) => s.addPart);
  const addFragmentDirect = useStore((s) => s.addFragmentDirect);
  const partsCount = useStore((s) => s.parts.length);
  const autoAnnotateOnImport = useStore((s) => s.autoAnnotateOnImport);

  const [parsedItems, setParsedItems] = useState([]);
  const [topology, setTopology] = useState('linear');
  const [originOffset, setOriginOffset] = useState(1);
  const [name, setName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [sanitizeReport, setSanitizeReport] = useState(null);
  const [catalogExpanded, setCatalogExpanded] = useState(!!catalogExpandedInitial);
  // Kfix-5: addedItems replaces addedToCanvasNames + Toast — accumulates
  // every successful action of the current session (canvas / library /
  // annotate) for the in-modal SessionSummary.
  const [addedItems, setAddedItems] = useState([]);
  const [pendingMultiAnnotate, setPendingMultiAnnotate] = useState(() => new Set());
  const [importError, setImportError] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  // Kfix-3 (F-I) single-file action status — keeps MetaColumn after
  // canvas/library/annotate, info-card shows what just happened in green.
  const [lastActionStatus, setLastActionStatus] = useState(null);
  // Kfix-7 (F-F) batch parsing progress for InputZone empty/compact modes.
  const [pendingMultiParse, setPendingMultiParse] = useState(null);

  const handleFilesImport = useCallback(async (files) => {
    if (!files?.length) return;
    setImportError(null);
    // Kfix-7 (F-F): surface progress for batch parsing (>1 file).
    if (files.length > 1) setPendingMultiParse({ current: 0, total: files.length });
    try {
      const results = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        // Polish §7: F5 toggle gates enrichWithCommonFeatures + autoAnnotate
        // detail enrichment in handleFileImport.
        const data = await handleFileImport(f, { autoAnnotate: autoAnnotateOnImport });
        results.push({ ...data, _fileName: f.name });
        if (files.length > 1) setPendingMultiParse({ current: i + 1, total: files.length });
      }
      setParsedItems(results);
      if (results.length === 1) {
        const r = results[0];
        setTopology(r.topology || 'linear');
        setName(r.name || '');
        setOriginOffset(1);
      } else {
        const next = new Set();
        for (const r of results) next.add(r.name || r._fileName);
        setPendingMultiAnnotate(next);
      }
    } catch (err) {
      setImportError(err.message || String(err));
    } finally {
      setPendingMultiParse(null);
    }
  }, [autoAnnotateOnImport]);

  // Mount-driven init: presetFiles → import; catalogExpandedInitial → expand.
  useEffect(() => {
    if (!open) return;
    if (presetFiles && presetFiles.length > 0) {
      handleFilesImport(presetFiles);
    }
    if (catalogExpandedInitial) setCatalogExpanded(true);
    // intentional: only on open transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resetSession = () => {
    setParsedItems([]);
    setTopology('linear');
    setOriginOffset(1);
    setName('');
    setPasteText('');
    setSanitizeReport(null);
    setPendingMultiAnnotate(new Set());
    setImportError(null);
    setLastActionStatus(null);
  };

  const handleClose = () => {
    resetSession();
    setAddedItems([]);
    setCatalogExpanded(false);
    onClose?.();
  };

  const handlePasteText = (text) => {
    setPasteText(text);
    const fmt = detectFormat(text);
    if (fmt === 'raw') {
      const report = sanitizeWithReport(text);
      setSanitizeReport(report);
      setParsedItems([{
        name: '',
        sequence: report.sequence,
        length: report.sequence.length,
        topology: 'linear',
        annotations: [],
        _pasted: true,
      }]);
      setTopology('linear');
      setOriginOffset(1);
    } else if (fmt === 'genbank' || fmt === 'fasta') {
      // Leave actual parsing to ParsedItem-aware handler in K6 (file-import extension);
      // for now keep raw pasteText so K3 skeleton is operable.
      setSanitizeReport(null);
    } else {
      setSanitizeReport(null);
    }
  };

  const handleApplyOrigin = () => {
    if (parsedItems.length !== 1) return;
    const item = parsedItems[0];
    if (topology !== 'circular') return;
    if (!originOffset || originOffset === 1) return;
    const { sequence, annotations } = rotateOriginToPosition(
      item.sequence,
      item.annotations || [],
      originOffset,
      { topology: 'circular' },
    );
    setParsedItems([{ ...item, sequence, annotations, length: sequence.length, topology: 'circular' }]);
    setOriginOffset(1);
  };

  const buildPartFromItem = (item, index) => {
    const baseName = (name || item.name || `part_${partsCount + index + 1}`).trim() || `part_${partsCount + index + 1}`;
    const top = topology || item.topology || 'linear';
    return {
      id: `import_${Date.now()}_${index}`,
      name: baseName,
      type: top === 'circular' ? 'plasmid' : 'misc_feature',
      sequence: item.sequence,
      length: item.length || item.sequence?.length || 0,
      annotations: item.annotations || [],
      topology: top,
      organism: item.organism || '',
      description: item.description || '',
      source: 'import',
      status: 'draft',
    };
  };

  const annotateItem = useCallback(async (item) => {
    if (!item?.sequence) return item;
    try {
      const { autoAnnotate, enrichWithCommonFeatures } = await import('../../auto-annotate');
      const base = item.annotations?.length
        ? item.annotations
        : autoAnnotate({ name: item.name || 'imported', type: 'misc_feature', sequence: item.sequence });
      const enriched = await enrichWithCommonFeatures(item.sequence, base);
      return { ...item, annotations: enriched };
    } catch {
      return item;
    }
  }, []);

  const handleAction = useCallback(async (actionId) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      if (actionId === 'canvas') {
        if (parsedItems.length !== 1) return;
        let item = parsedItems[0];
        if (topology === 'circular' && originOffset && originOffset !== 1) {
          const { sequence, annotations } = rotateOriginToPosition(
            item.sequence, item.annotations || [], originOffset, { topology: 'circular' },
          );
          item = { ...item, sequence, annotations, length: sequence.length, topology: 'circular' };
        }
        const part = buildPartFromItem(item, 0);
        try {
          addFragmentDirect(part);
        } catch (err) {
          setImportError(err?.message || String(err));
          return;
        }
        // F-C: push only after successful add (not optimistic).
        const miniMapData = { length: part.length, topology: part.topology, annotations: part.annotations };
        setAddedItems((prev) => [...prev, { name: part.name, action: 'canvas', miniMapData }]);
        // F-I: keep MetaColumn for single-file, just flag status.
        setLastActionStatus({ type: 'canvas' });
      } else if (actionId === 'library') {
        if (parsedItems.length !== 1) return;
        const part = buildPartFromItem(parsedItems[0], 0);
        addPart(part);
        const miniMapData = { length: part.length, topology: part.topology, annotations: part.annotations };
        setAddedItems((prev) => [...prev, { name: part.name, action: 'library', miniMapData }]);
        setLastActionStatus({ type: 'library' });
      } else if (actionId === 'annotate') {
        if (parsedItems.length !== 1) return;
        const before = getRegions(parsedItems[0].annotations || []).length;
        const annotated = await annotateItem(parsedItems[0]);
        const part = buildPartFromItem(annotated, 0);
        addPart(part);
        const after = getRegions(annotated.annotations || []).length;
        const regionsAdded = Math.max(0, after - before);
        // Update parsedItem in-place so MetaColumn re-renders with new mini-map.
        setParsedItems([annotated]);
        const miniMapData = { length: part.length, topology: part.topology, annotations: part.annotations };
        // V41 mini-fix-2: appendSessionEntry dedupes repeat-annotate clicks
        // on the same name (delta=0 → keep prior row; delta>0 → replace).
        setAddedItems((prev) => appendSessionEntry(prev, { name: part.name, action: 'annotate', miniMapData, regionsAdded }));
        setLastActionStatus({ type: 'annotate', regionsBefore: before, regionsAfter: after });
      } else if (actionId === 'library-batch') {
        // Kfix-3 (F-E): single batch action honours per-row checkbox —
        // items in pendingMultiAnnotate get autoAnnotate + enrichment
        // before addPart, others go in raw.
        for (let i = 0; i < parsedItems.length; i++) {
          const item = parsedItems[i];
          const include = pendingMultiAnnotate.has(item.name || item._fileName);
          const next = include ? await annotateItem(item) : item;
          addPart(buildPartFromItem(next, i));
        }
        resetSession();
      } else if (actionId === 'replace') {
        // Polish §6: «Заменить файл» mirrors the ↻ link — clear card so
        // empty mode reappears with file picker / drop target.
        resetSession();
      } else if (actionId === 'download-gb') {
        // Polish §6: export current parsedItem as .gb via existing helper.
        if (parsedItems.length !== 1) return;
        const item = parsedItems[0];
        const part = buildPartFromItem(item, 0);
        try {
          exportGenBank([part], part.name || 'imported', part.topology === 'circular');
        } catch (err) {
          setImportError(err?.message || String(err));
        }
      } else if (actionId === 'delete') {
        // Polish §6: V42 «удалить из сессии» semantic — confirm + clear.
        // eslint-disable-next-line no-alert
        if (typeof window !== 'undefined' && !window.confirm('Удалить файл из сессии?')) return;
        resetSession();
      }
    } finally {
      setActionBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedItems, topology, originOffset, name, partsCount, pendingMultiAnnotate, actionBusy, addFragmentDirect, addPart, annotateItem]);

  const originHints = useMemo(() => {
    if (parsedItems.length !== 1) return '';
    const item = parsedItems[0];
    const seqLen = item.length || item.sequence?.length || 0;
    if (!seqLen) return '';
    const regions = getRegions(item.annotations || [])
      .slice()
      .sort((a, b) => a.start - b.start);
    if (!regions.length) return '';
    const gaps = [];
    let cursor = 0;
    for (const r of regions) {
      if (r.start > cursor + 30) gaps.push(`${cursor + 1}–${r.start}`);
      if (r.end > cursor) cursor = r.end;
    }
    if (seqLen > cursor + 30) gaps.push(`${cursor + 1}–${seqLen}`);
    return gaps.slice(0, 4).join(', ');
  }, [parsedItems]);

  if (!open) return null;

  const single = parsedItems.length === 1;
  const multi = parsedItems.length > 1;
  const empty = parsedItems.length === 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-6" onClick={handleClose}>
      <div
        className="w-[1200px] max-w-[95vw] max-h-[92vh] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="text-sm font-semibold text-gray-700">📂 Старт сборки</div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {importError && (
            <div className="px-3 py-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
              Ошибка импорта: {importError}
            </div>
          )}

          {/* Primary input area */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            {empty && !catalogExpanded && (
              <InputZone
                mode="empty"
                onFiles={handleFilesImport}
                onPasteText={handlePasteText}
                pasteValue={pasteText}
                onPasteValueChange={(v) => { setPasteText(v); handlePasteText(v); }}
                onExpandCatalog={() => setCatalogExpanded(true)}
                progress={pendingMultiParse}
              />
            )}
            {empty && catalogExpanded && (
              <InputZone
                mode="compact"
                onFiles={handleFilesImport}
                onPasteText={handlePasteText}
                progress={pendingMultiParse}
              />
            )}
            {empty && catalogExpanded && (
              <>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setCatalogExpanded(false)}
                    className="text-[11px] px-2 py-1 rounded text-purple-700 hover:bg-purple-50"
                    data-testid="catalog-collapse"
                  >
                    ▲ Свернуть каталог
                  </button>
                </div>
                <CatalogTree
                  onSelectItem={(it) => {
                    const item = {
                      name: it.name,
                      sequence: it.sequence || '',
                      length: it.length || it.sequence?.length || 0,
                      topology: it.topology || 'linear',
                      annotations: it.annotations || [],
                      organism: it.organism || '',
                      description: (it.description || '').replace(/<[^>]*>/g, '').trim(),
                      _fileName: `${it.name}.dna`,
                    };
                    setParsedItems([item]);
                    setTopology(item.topology);
                    setName(item.name);
                    setOriginOffset(1);
                    setCatalogExpanded(false);
                  }}
                  query={catalogQuery}
                  onQueryChange={setCatalogQuery}
                />
              </>
            )}
            {single && (() => {
              const removed = sanitizeReport?.removed;
              const removedSummary = removed
                ? [
                    removed.digits && `${removed.digits} цифр`,
                    removed.whitespace && `${removed.whitespace} пробелов`,
                    removed.punctuation && `${removed.punctuation} знаков`,
                    removed.bom && `${removed.bom} BOM`,
                    removed.other && `${removed.other} прочих`,
                  ].filter(Boolean).join(', ')
                : '';
              return (
              <div className="grid grid-cols-[1fr_280px] gap-3 items-start">
                <div className="flex flex-col gap-3">
                  <InputZone
                    mode="filled"
                    onFiles={handleFilesImport}
                    filledHeader={
                      <div className="flex flex-col gap-0.5 w-full" data-testid="single-title-row">
                        <InlineEditableTitle
                          value={name}
                          onCommit={(next) => setName(next)}
                          placeholder="(без имени)"
                        />
                        {removedSummary && (
                          <div
                            className="text-[10px] italic text-gray-400"
                            data-testid="single-sanitize-summary"
                          >
                            убрано: {removedSummary}
                          </div>
                        )}
                      </div>
                    }
                    filledBody={
                      <div className="flex flex-col gap-0.5 leading-relaxed">
                        <div className="text-xs text-gray-600">
                          {(parsedItems[0]?.length || 0).toLocaleString()} п.н. · {topology}
                          {parsedItems[0]?.annotations?.length > 0 && (
                            <> · {getRegions(parsedItems[0].annotations).length} регионов</>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={resetSession}
                          className="self-start text-[11px] text-gray-400 hover:text-emerald-700 underline-offset-2 hover:underline cursor-pointer"
                          data-testid="replace-file-link"
                        >
                          ↻ замена файла
                        </button>
                      </div>
                    }
                  />
                  <SessionSummary
                    addedItems={addedItems}
                    onOpenCanvas={handleClose}
                  />
                  <FileSummaryCard parsedItem={parsedItems[0]} />
                </div>
                <MetaColumn
                  length={parsedItems[0]?.length || parsedItems[0]?.sequence?.length || 0}
                  topology={topology}
                  onTopologyChange={setTopology}
                  originOffset={originOffset}
                  onOriginOffsetChange={setOriginOffset}
                  onApplyOrigin={handleApplyOrigin}
                  originHints={originHints}
                  annotations={parsedItems[0]?.annotations || []}
                  hasIUPAC={!!sanitizeReport?.hasIUPAC}
                  iupacChars={sanitizeReport?.iupacChars || []}
                  fromFileFeatures={parsedItems[0]?._fromFileCount || 0}
                  enrichedFeatures={parsedItems[0]?._enrichedCount || 0}
                  lastActionStatus={lastActionStatus}
                />
              </div>
              );
            })()}
            {multi && (
              <MultiFileList
                items={parsedItems}
                annotateSet={pendingMultiAnnotate}
                onRename={(item, nextName) => {
                  setParsedItems((prev) => {
                    const next = [...prev];
                    const idx = next.findIndex((x) => x === item);
                    if (idx >= 0) {
                      const oldKey = item.name || item._fileName;
                      next[idx] = { ...next[idx], name: nextName };
                      setPendingMultiAnnotate((set) => {
                        const out = new Set(set);
                        if (out.has(oldKey)) {
                          out.delete(oldKey);
                          out.add(nextName);
                        }
                        return out;
                      });
                    }
                    return next;
                  });
                }}
                onAnnotateToggle={(key) => {
                  setPendingMultiAnnotate((set) => {
                    const out = new Set(set);
                    if (out.has(key)) out.delete(key);
                    else out.add(key);
                    return out;
                  });
                }}
                onAllAnnotate={() => {
                  const all = new Set();
                  for (const it of parsedItems) all.add(it.name || it._fileName);
                  setPendingMultiAnnotate(all);
                }}
                onNoneAnnotate={() => setPendingMultiAnnotate(new Set())}
              />
            )}

            {single && (
              <ActionsBar
                mode="single"
                onAction={handleAction}
                count={1}
                hasParsedItem={!!parsedItems[0]?.sequence}
                exportEnabled
              />
            )}
            {multi && (
              <ActionsBar
                mode="multi"
                onAction={handleAction}
                count={parsedItems.length}
                hasParsedItem={parsedItems.length > 0}
                exportEnabled={false}
              />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}


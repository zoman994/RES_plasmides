import { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store';
import { handleFileImport } from '../../file-import';
import { sanitizeWithReport } from '../../sequence-utils';
import { detectFormat } from '../../format-detect';
import { rotateOriginToPosition } from '../../rotate-origin';
import { getRegions } from '../../annotation-model';
import InputZone from './InputZone';
import MetaColumn from './MetaColumn';
import ActionsBar from './ActionsBar';
import Toast from './Toast';
import MultiFileList from './MultiFileList';

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
  const addFragment = useStore((s) => s.addFragment);
  const partsCount = useStore((s) => s.parts.length);

  const [parsedItems, setParsedItems] = useState([]);
  const [topology, setTopology] = useState('linear');
  const [originOffset, setOriginOffset] = useState(1);
  const [name, setName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [sanitizeReport, setSanitizeReport] = useState(null);
  const [catalogExpanded, setCatalogExpanded] = useState(!!catalogExpandedInitial);
  const [addedToCanvasNames, setAddedToCanvasNames] = useState([]);
  const [toastVisible, setToastVisible] = useState(true);
  const [pendingMultiAnnotate, setPendingMultiAnnotate] = useState(() => new Set());
  const [importError, setImportError] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const handleFilesImport = useCallback(async (files) => {
    if (!files?.length) return;
    setImportError(null);
    try {
      const results = [];
      for (const f of files) {
        const data = await handleFileImport(f);
        results.push({ ...data, _fileName: f.name });
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
    }
  }, []);

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
  };

  const handleClose = () => {
    resetSession();
    setAddedToCanvasNames([]);
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
        addFragment(part);
        setAddedToCanvasNames((prev) => [...prev, part.name]);
        setToastVisible(true);
        resetSession();
      } else if (actionId === 'library') {
        if (parsedItems.length !== 1) return;
        const part = buildPartFromItem(parsedItems[0], 0);
        addPart(part);
        resetSession();
      } else if (actionId === 'annotate') {
        if (parsedItems.length !== 1) return;
        const annotated = await annotateItem(parsedItems[0]);
        const part = buildPartFromItem(annotated, 0);
        addPart(part);
        resetSession();
      } else if (actionId === 'library-batch') {
        for (let i = 0; i < parsedItems.length; i++) {
          addPart(buildPartFromItem(parsedItems[i], i));
        }
        resetSession();
      } else if (actionId === 'annotate-batch') {
        for (let i = 0; i < parsedItems.length; i++) {
          const item = parsedItems[i];
          const include = pendingMultiAnnotate.has(item.name || item._fileName);
          const next = include ? await annotateItem(item) : item;
          addPart(buildPartFromItem(next, i));
        }
        resetSession();
      }
    } finally {
      setActionBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedItems, topology, originOffset, name, partsCount, pendingMultiAnnotate, actionBusy, addFragment, addPart, annotateItem]);

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
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            {empty && !catalogExpanded && (
              <InputZone
                mode="empty"
                onFiles={handleFilesImport}
                onPasteText={handlePasteText}
                pasteValue={pasteText}
                onPasteValueChange={(v) => { setPasteText(v); handlePasteText(v); }}
              />
            )}
            {empty && catalogExpanded && (
              <InputZone
                mode="compact"
                onFiles={handleFilesImport}
                onPasteText={handlePasteText}
              />
            )}
            {single && (
              <div className="grid grid-cols-[1fr_280px] gap-3 items-start">
                <InputZone
                  mode="filled"
                  onFiles={handleFilesImport}
                  filledHeader={
                    <div className="flex items-center justify-between w-full">
                      <span className="font-medium text-gray-700 text-xs">
                        {parsedItems[0]?.name || parsedItems[0]?._fileName || 'Загружено'}
                      </span>
                      <button
                        onClick={resetSession}
                        className="text-[11px] px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-100"
                      >
                        Заменить
                      </button>
                    </div>
                  }
                  filledBody={
                    <div className="text-xs text-gray-600 leading-relaxed">
                      {(parsedItems[0]?.length || 0).toLocaleString()} п.н. · {topology}
                      {parsedItems[0]?.annotations?.length > 0 && (
                        <> · {getRegions(parsedItems[0].annotations).length} регионов</>
                      )}
                    </div>
                  }
                />
                <MetaColumn
                  length={parsedItems[0]?.length || parsedItems[0]?.sequence?.length || 0}
                  topology={topology}
                  onTopologyChange={setTopology}
                  originOffset={originOffset}
                  onOriginOffsetChange={setOriginOffset}
                  onApplyOrigin={handleApplyOrigin}
                  originHints={originHints}
                  name={name}
                  onNameChange={setName}
                  annotations={parsedItems[0]?.annotations || []}
                  sanitizeReport={sanitizeReport}
                  hasIUPAC={!!sanitizeReport?.hasIUPAC}
                  iupacChars={sanitizeReport?.iupacChars || []}
                  fromFileFeatures={parsedItems[0]?._fromFileCount || 0}
                  enrichedFeatures={parsedItems[0]?._enrichedCount || 0}
                />
              </div>
            )}
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
              <ActionsBar mode="single" onAction={handleAction} count={1} />
            )}
            {multi && (
              <ActionsBar mode="multi" onAction={handleAction} count={parsedItems.length} />
            )}
          </div>
        </div>
      </div>

      {toastVisible && addedToCanvasNames.length > 0 && (
        <Toast
          items={addedToCanvasNames}
          onOpenCanvas={() => { setToastVisible(false); handleClose(); }}
          onClose={() => setToastVisible(false)}
        />
      )}
    </div>
  );
}


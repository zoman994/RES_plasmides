import { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store';
import { handleFileImport } from '../../file-import';
import { sanitizeWithReport } from '../../sequence-utils';
import { detectFormat } from '../../format-detect';
import { rotateOriginToPosition } from '../../rotate-origin';
import { getRegions } from '../../annotation-model';
import { exportGenBank } from '../../exports';
import CatalogPanel from './CatalogPanel';
import SingleInspector from './SingleInspector';
import MultiInspector from './MultiInspector';
import { appendSessionEntry } from './session-log';

export { InlineEditableTitle } from './InlineEditableTitle';

/**
 * ImportStartScreen — single entry point for file import + paste + catalog
 * browse + library access. Replaces ImportDecisionModal + CatalogPanel.
 *
 * Sprint IS-Final K4: catalog-first layout. Left column (CatalogPanel,
 * 320 px) is always visible; right column (Inspector) switches between:
 *   - empty  → EmptyInspector placeholder
 *   - single → SingleInspector
 *   - multi  → MultiInspector
 *
 * Local state — no Zustand slice. Modal-scoped only; resets on close.
 */

function EmptyInspector() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2 p-8 text-center"
      data-testid="empty-inspector"
    >
      <div className="text-4xl opacity-30">👈</div>
      <div className="text-sm">
        Выберите плазмиду из каталога слева
      </div>
      <div className="text-xs">
        или перетащите файл / Ctrl+V в зону внизу
      </div>
    </div>
  );
}

export default function ImportStartScreen({ open, onClose, presetFiles }) {
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
  const [addedItems, setAddedItems] = useState([]);
  const [pendingMultiAnnotate, setPendingMultiAnnotate] = useState(() => new Set());
  const [importError, setImportError] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [lastActionStatus, setLastActionStatus] = useState(null);
  const [pendingMultiParse, setPendingMultiParse] = useState(null);

  const handleFilesImport = useCallback(async (files) => {
    if (!files?.length) return;
    setImportError(null);
    if (files.length > 1) setPendingMultiParse({ current: 0, total: files.length });
    try {
      const results = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const data = await handleFileImport(f, { autoAnnotate: autoAnnotateOnImport });
        results.push({ ...data, _fileName: f.name });
        if (files.length > 1) setPendingMultiParse({ current: i + 1, total: files.length });
      }
      // Append-to-existing semantic: in single mode, ask before replacing.
      // In empty / multi → merge with existing (drag-drop more on top of multi).
      if (parsedItems.length === 1 && results.length >= 1) {
        // eslint-disable-next-line no-alert
        if (typeof window !== 'undefined' && !window.confirm('Заменить текущий файл?')) {
          return;
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
        return;
      }
      const merged = parsedItems.length >= 2
        ? [...parsedItems, ...results]
        : results;
      setParsedItems(merged);
      if (merged.length === 1) {
        const r = merged[0];
        setTopology(r.topology || 'linear');
        setName(r.name || '');
        setOriginOffset(1);
      } else if (merged.length > 1) {
        const next = new Set(pendingMultiAnnotate);
        for (const r of results) next.add(r.name || r._fileName);
        setPendingMultiAnnotate(next);
      }
    } catch (err) {
      setImportError(err.message || String(err));
    } finally {
      setPendingMultiParse(null);
    }
  }, [autoAnnotateOnImport, parsedItems, pendingMultiAnnotate]);

  // Mount-driven init: presetFiles → import.
  useEffect(() => {
    if (!open) return;
    if (presetFiles && presetFiles.length > 0) {
      handleFilesImport(presetFiles);
    }
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
        const miniMapData = { length: part.length, topology: part.topology, annotations: part.annotations };
        setAddedItems((prev) => [...prev, { name: part.name, action: 'canvas', miniMapData }]);
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
        setParsedItems([annotated]);
        const miniMapData = { length: part.length, topology: part.topology, annotations: part.annotations };
        setAddedItems((prev) => appendSessionEntry(prev, { name: part.name, action: 'annotate', miniMapData, regionsAdded }));
        setLastActionStatus({ type: 'annotate', regionsBefore: before, regionsAfter: after });
      } else if (actionId === 'library-batch') {
        for (let i = 0; i < parsedItems.length; i++) {
          const item = parsedItems[i];
          const include = pendingMultiAnnotate.has(item.name || item._fileName);
          const next = include ? await annotateItem(item) : item;
          addPart(buildPartFromItem(next, i));
        }
        resetSession();
      } else if (actionId === 'replace' || actionId === 'replace-all') {
        resetSession();
      } else if (actionId === 'download-gb') {
        if (parsedItems.length !== 1) return;
        const item = parsedItems[0];
        const part = buildPartFromItem(item, 0);
        try {
          exportGenBank([part], part.name || 'imported', part.topology === 'circular');
        } catch (err) {
          setImportError(err?.message || String(err));
        }
      } else if (actionId === 'delete') {
        // eslint-disable-next-line no-alert
        if (typeof window !== 'undefined' && !window.confirm('Удалить файл из сессии?')) return;
        resetSession();
      } else if (actionId === 'delete-all') {
        // confirm уже сделан в MultiInspector
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

  // Catalog → inspector binding.
  const handleCatalogSelectItem = (it) => {
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
    if (multi) {
      // disabled in multi mode (catalog buttons themselves are still clickable
      // since we don't render them disabled — surface a confirm to swap to single).
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && !window.confirm('Заменить весь batch одним файлом из каталога?')) return;
      setParsedItems([item]);
      setTopology(item.topology);
      setName(item.name);
      setOriginOffset(1);
      setPendingMultiAnnotate(new Set());
      return;
    }
    if (single) {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && !window.confirm('Заменить текущий файл?')) return;
    }
    setParsedItems([item]);
    setTopology(item.topology);
    setName(item.name);
    setOriginOffset(1);
  };

  const handleRemoveMultiItem = (item) => {
    setParsedItems((prev) => {
      const next = prev.filter((x) => x !== item);
      if (next.length === 1) {
        const r = next[0];
        setTopology(r.topology || 'linear');
        setName(r.name || '');
        setOriginOffset(1);
      } else if (next.length === 0) {
        resetSession();
        return [];
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-6" onClick={handleClose}>
      <div
        className="w-[1200px] max-w-[95vw] max-h-[92vh] h-[800px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50 shrink-0">
          <div className="text-sm font-semibold text-gray-700">📂 Старт сборки</div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* Body — two-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: catalog panel (always visible) */}
          <div className="w-[320px] shrink-0 border-r border-gray-200 flex flex-col bg-white">
            <CatalogPanel
              onSelectItem={handleCatalogSelectItem}
              onFiles={handleFilesImport}
              onPasteText={handlePasteText}
              progress={pendingMultiParse}
            />
          </div>

          {/* Right: inspector */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {importError && (
              <div className="px-3 py-2 mx-3 mt-3 rounded bg-red-50 border border-red-200 text-red-700 text-xs" data-testid="import-error">
                Ошибка импорта: {importError}
              </div>
            )}
            {empty && <EmptyInspector />}
            {single && (
              <SingleInspector
                parsedItem={parsedItems[0]}
                topology={topology}
                onTopologyChange={setTopology}
                originOffset={originOffset}
                onOriginOffsetChange={setOriginOffset}
                onApplyOrigin={handleApplyOrigin}
                originHints={originHints}
                name={name}
                onNameChange={setName}
                sanitizeReport={sanitizeReport}
                lastActionStatus={lastActionStatus}
                addedItems={addedItems}
                onAction={handleAction}
                onCloseSession={resetSession}
                exportEnabled
                hasParsedItem={!!parsedItems[0]?.sequence}
              />
            )}
            {multi && (
              <MultiInspector
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
                onAnnotateMaster={(mode) => {
                  if (mode === 'all') {
                    const all = new Set();
                    for (const it of parsedItems) all.add(it.name || it._fileName);
                    setPendingMultiAnnotate(all);
                  } else {
                    setPendingMultiAnnotate(new Set());
                  }
                }}
                onRemoveItem={handleRemoveMultiItem}
                onAction={handleAction}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

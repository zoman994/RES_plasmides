import { useEffect, useState, useCallback } from 'react';
import { handleFileImport } from '../../file-import';
import { sanitizeWithReport } from '../../sequence-utils';
import { detectFormat } from '../../format-detect';
import InputZone from './InputZone';

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
  const [parsedItems, setParsedItems] = useState([]);
  const [topology, setTopology] = useState('linear');
  const [originOffset, setOriginOffset] = useState(1);
  const [name, setName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [sanitizeReport, setSanitizeReport] = useState(null);
  const [catalogExpanded, setCatalogExpanded] = useState(!!catalogExpandedInitial);
  const [addedToCanvasNames, setAddedToCanvasNames] = useState([]);
  const [pendingMultiAnnotate, setPendingMultiAnnotate] = useState(() => new Set());
  const [importError, setImportError] = useState(null);

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
              <div className="grid grid-cols-[1fr_280px] gap-3 items-stretch">
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
                      {parsedItems[0]?.length || 0} п.н. · {topology}
                      {parsedItems[0]?.annotations?.length > 0 && (
                        <> · {parsedItems[0].annotations.filter(a => a.level === 'region').length} регионов</>
                      )}
                    </div>
                  }
                />
                <div className="text-[11px] text-gray-400 italic">
                  meta-column → K4
                </div>
              </div>
            )}
            {multi && (
              <div className="text-xs text-gray-600">
                Загружено {parsedItems.length} файл(ов) → multi-list (K6)
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


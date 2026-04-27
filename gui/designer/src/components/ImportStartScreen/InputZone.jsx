import { useState } from 'react';

/**
 * InputZone — dual-purpose dropzone + textarea for ImportStartScreen.
 *
 * mode='empty'   → big dashed dropzone with hint text (paste or drop)
 * mode='compact' → one-line strip (catalog is expanded — claim less space)
 * mode='filled'  → solid border with file name + replace button (filled by parent)
 *
 * Kfix-6 (F-H): in 'empty' mode the parent may pass `onExpandCatalog` —
 *   InputZone then renders a purple disclosure strip below the dropzone
 *   («▼ Выбрать из каталога (2800+ плазмид)»). Kfix-7 (F-F): in 'empty' /
 *   'compact' modes a `progress` payload renders an inline progress bar.
 */
export default function InputZone({
  mode = 'empty',
  onFiles,
  onPasteText,
  filledHeader = null,
  filledBody = null,
  pasteValue = '',
  onPasteValueChange,
  status = null,
  onExpandCatalog = null,
  progress = null, // { current, total }
}) {
  const [isOver, setIsOver] = useState(false);

  const handleDragEnter = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setIsOver(true);
  };
  const handleDragOver = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDragLeave = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    setIsOver(false);
  };
  const handleDrop = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setIsOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length && typeof onFiles === 'function') onFiles(files);
  };
  const handlePaste = (e) => {
    const text = e.clipboardData?.getData('text') || '';
    if (text.length > 50 && typeof onPasteText === 'function') {
      e.preventDefault();
      onPasteText(text);
    }
  };

  const baseBorder = mode === 'filled'
    ? 'border border-solid border-gray-200 bg-white'
    : isOver
      ? 'border-2 border-dashed border-emerald-600 bg-emerald-50'
      : 'border-2 border-dashed border-gray-300 bg-amber-50/40';

  const progressBar = progress && progress.total > 1 ? (
    <div className="px-3 py-2 bg-emerald-50 border-t border-emerald-100" data-testid="import-progress">
      <div className="flex items-center justify-between text-[11px] text-emerald-800 mb-1">
        <span>Обрабатываем {progress.total} файлов: {progress.current} из {progress.total}</span>
        <span className="font-mono">{Math.round((progress.current / progress.total) * 100)}%</span>
      </div>
      <div className="h-1 bg-emerald-100 rounded overflow-hidden">
        <div
          className="h-full bg-emerald-600 transition-all"
          style={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>
    </div>
  ) : null;

  if (mode === 'compact') {
    return (
      <div
        className={`rounded ${baseBorder}`}
        onDragEnter={handleDragEnter} onDragOver={handleDragOver}
        onDragLeave={handleDragLeave} onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="opacity-60">⬇</span>
            <span>Или вставьте свой файл / последовательность</span>
          </div>
          <div>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 border border-gray-200 font-mono">Ctrl+V</span>
            <span className="ml-2 text-[10px] text-gray-400">в любом месте окна</span>
          </div>
        </div>
        {progressBar}
      </div>
    );
  }

  if (mode === 'filled') {
    return (
      <div
        className={`flex flex-col rounded ${baseBorder} overflow-hidden`}
        onDragEnter={handleDragEnter} onDragOver={handleDragOver}
        onDragLeave={handleDragLeave} onDrop={handleDrop}
      >
        {filledHeader && (
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between text-xs text-gray-600">
            {filledHeader}
          </div>
        )}
        <div className="flex-1 p-3">{filledBody}</div>
        {status && (
          <div className="px-3 py-1.5 border-t border-gray-100 text-[11px] flex items-center justify-between bg-gray-50">
            {status}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex flex-col rounded ${baseBorder} min-h-[200px] overflow-hidden transition-colors`}
        onDragEnter={handleDragEnter} onDragOver={handleDragOver}
        onDragLeave={handleDragLeave} onDrop={handleDrop}
        data-testid="import-input-zone"
      >
        {pasteValue ? (
          <textarea
            className="flex-1 w-full p-3 bg-transparent border-0 outline-none font-mono text-xs resize-none text-gray-700"
            value={pasteValue}
            onChange={(e) => onPasteValueChange?.(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-1.5 p-8 text-center text-gray-500"
            onPaste={handlePaste}
            tabIndex={0}
          >
            <div className="text-3xl opacity-40 leading-none">⬇</div>
            <div className="text-sm font-medium text-gray-700">Перетащите файл сюда</div>
            <div className="text-[11px] text-gray-400">.dna · .gb · .gbk · .fasta — формат определится сам</div>
            <div className="text-[11px] text-gray-400 mt-2">
              или вставьте последовательность{' '}
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 border border-gray-200 font-mono">Ctrl+V</span>
            </div>
          </div>
        )}
        {progressBar}
        {status && (
          <div className="px-3 py-1.5 border-t border-gray-100 text-[11px] flex items-center justify-between bg-gray-50">
            {status}
          </div>
        )}
      </div>
      {onExpandCatalog && (
        <button
          type="button"
          onClick={onExpandCatalog}
          className="flex items-center justify-between gap-3 px-3 py-2 rounded bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-800 transition"
          data-testid="catalog-disclosure"
        >
          <span className="text-xs font-medium flex items-center gap-2">
            <span>📚</span>
            <span>Выбрать из каталога</span>
            <span className="text-[10px] text-purple-600 font-normal">(2800+ плазмид)</span>
          </span>
          <span className="text-xs">▼</span>
        </button>
      )}
    </div>
  );
}

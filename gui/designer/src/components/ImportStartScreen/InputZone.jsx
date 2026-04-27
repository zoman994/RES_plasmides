import { useState } from 'react';

/**
 * InputZone — dual-purpose dropzone + textarea for ImportStartScreen.
 *
 * mode='empty'   → big dashed dropzone with hint text (paste or drop)
 * mode='compact' → one-line strip (catalog is expanded — claim less space)
 * mode='filled'  → solid border with file name + replace button (filled by parent)
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

  if (mode === 'compact') {
    return (
      <div
        className={`flex items-center justify-between gap-3 px-3 py-2 rounded text-xs text-gray-500 ${baseBorder}`}
        onDragEnter={handleDragEnter} onDragOver={handleDragOver}
        onDragLeave={handleDragLeave} onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <div className="flex items-center gap-2">
          <span className="opacity-60">⬇</span>
          <span>Или вставьте свой файл / последовательность</span>
        </div>
        <div>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 border border-gray-200 font-mono">Ctrl+V</span>
          <span className="ml-2 text-[10px] text-gray-400">в любом месте окна</span>
        </div>
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
      {status && (
        <div className="px-3 py-1.5 border-t border-gray-100 text-[11px] flex items-center justify-between bg-gray-50">
          {status}
        </div>
      )}
    </div>
  );
}

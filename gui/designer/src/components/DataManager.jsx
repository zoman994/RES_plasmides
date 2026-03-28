/** DataManager — export/import modal for projects, primers, parts. */
import { useState, useRef } from 'react';
import { exportAllData, exportProjects, exportPrimers, exportParts, parseImportFile, applyImport } from '../exports';

export default function DataManager({ onClose, parts, projectName }) {
  const [status, setStatus] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseImportFile(text);
      const msg = applyImport(parsed);
      setStatus(msg);
    } catch (err) {
      setStatus(`Ошибка: ${err.message}`);
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[480px] p-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-sm">Экспорт / Импорт данных</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">{'✕'}</button>
        </div>

        {/* Export section */}
        <div className="space-y-2 mb-4">
          <div className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">Экспорт</div>

          <button onClick={() => exportAllData(projectName)}
            className="w-full text-left text-xs px-3 py-2 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-200 transition flex items-center gap-2">
            <span className="text-blue-500 text-base">{'💾'}</span>
            <div>
              <div className="font-semibold">Полный бэкап</div>
              <div className="text-gray-400 text-[10px]">Проекты, праймеры, запчасти, настройки — всё в одном файле</div>
            </div>
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={exportProjects}
              className="text-xs px-3 py-2 rounded-lg border border-gray-200 hover:bg-green-50 hover:border-green-200 transition text-center">
              <div className="text-green-500 text-base mb-0.5">{'📁'}</div>
              <div className="font-medium">Проекты</div>
            </button>
            <button onClick={exportPrimers}
              className="text-xs px-3 py-2 rounded-lg border border-gray-200 hover:bg-purple-50 hover:border-purple-200 transition text-center">
              <div className="text-purple-500 text-base mb-0.5">{'🧬'}</div>
              <div className="font-medium">Праймеры</div>
            </button>
            <button onClick={() => exportParts(parts)}
              className="text-xs px-3 py-2 rounded-lg border border-gray-200 hover:bg-amber-50 hover:border-amber-200 transition text-center">
              <div className="text-amber-500 text-base mb-0.5">{'📦'}</div>
              <div className="font-medium">Запчасти</div>
            </button>
          </div>
        </div>

        {/* Import section */}
        <div className="space-y-2 mb-4">
          <div className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">Импорт</div>
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-blue-300 hover:bg-blue-50/50 transition cursor-pointer"
            onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
            <div className="text-gray-400 text-2xl mb-1">{'📂'}</div>
            <div className="text-xs text-gray-600 font-medium">
              {importing ? 'Импорт...' : 'Нажмите для выбора .json файла'}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Поддерживается: полный бэкап, проекты, праймеры, запчасти</div>
          </div>
        </div>

        {/* Status */}
        {status && (
          <div className={`text-xs p-2 rounded-lg ${status.startsWith('Ошибка') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {status}
            {status.includes('Перезагрузите') && (
              <button onClick={() => window.location.reload()}
                className="ml-2 underline font-semibold">Перезагрузить</button>
            )}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="text-xs text-gray-500 px-3 py-1.5">Закрыть</button>
        </div>
      </div>
    </div>
  );
}

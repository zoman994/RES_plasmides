import { useEffect, useRef, useState } from 'react';
import PlasmidMiniMap from '../PlasmidMiniMap';
import { getRegions } from '../../annotation-model';

/**
 * MultiInspector — right-pane inspector when N>1 files were imported.
 *
 * Replaces MultiFileList in the primary role (Sprint IS-Final K2).
 *
 * Layout:
 *   Header: «Загружено N файлов» + ↻ заменить все
 *   Table:  Имя (inline-rename) · Длина · Регионов · ☑ Аннотация · ✕ удалить
 *           «Аннотация» column has tristate master-checkbox in header
 *   Footer: [На канвас (disabled)] [В библиотеку (N)]   ⋯
 *           ⋯ → 📁 Заменить весь batch · 🗑 Удалить весь batch (confirm)
 *
 * V35 closes here — single tristate master-checkbox replaces «☑ всем / ☐ никому».
 * Cycle by click: none → all, some → all, all → none.
 */

const TIP_NEEDS_SINGLE = 'доступно для одиночной загрузки';

function MasterCheckbox({ state, onCycle }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'all'}
      onChange={() => {
        // Cycle: none|some → all, all → none
        if (state === 'all') onCycle?.('none');
        else onCycle?.('all');
      }}
      data-testid="multi-master-checkbox"
      title="Авто-аннотация всем"
    />
  );
}

export default function MultiInspector({
  items = [],
  annotateSet = new Set(),
  onRename,
  onAnnotateToggle,
  onAnnotateMaster,
  onRemoveItem,
  onAction,
}) {
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  if (!items.length) return null;

  const annotatedCount = items.reduce(
    (n, it) => n + (annotateSet?.has(it.name || it._fileName) ? 1 : 0),
    0,
  );
  const masterState = annotatedCount === 0
    ? 'none'
    : annotatedCount === items.length
      ? 'all'
      : 'some';

  const handleBlur = (item, e) => {
    const next = e.currentTarget.textContent.trim();
    if (next && next !== item.name) onRename?.(item, next);
    else if (!next) e.currentTarget.textContent = item.name || item._fileName || '';
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const fire = (id) => {
    setSecondaryOpen(false);
    if (id === 'delete-all') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && !window.confirm('Удалить весь batch файлов?')) return;
    }
    onAction?.(id);
  };

  return (
    <div className="flex flex-col h-full" data-testid="multi-inspector">
      {/* header */}
      <div
        className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between"
        data-testid="multi-inspector-header"
      >
        <div className="text-sm font-semibold text-gray-700">
          Загружено {items.length} файл{items.length === 1 ? '' : items.length < 5 ? 'а' : 'ов'}
        </div>
        <button
          type="button"
          onClick={() => fire('replace-all')}
          className="text-[11px] text-gray-400 hover:text-emerald-700 underline-offset-2 hover:underline"
        >
          ↻ заменить все
        </button>
      </div>

      {/* table */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-3">
        <div className="rounded border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_70px_70px_auto_auto] gap-2 items-center px-3 py-2 border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 font-medium">
            <span></span>
            <span>Имя</span>
            <span className="text-right">Длина</span>
            <span className="text-right">Регионов</span>
            <span className="flex items-center gap-1 justify-center" title="Авто-аннотация всем">
              <MasterCheckbox state={masterState} onCycle={onAnnotateMaster} />
              <span>Аннот.</span>
            </span>
            <span></span>
          </div>
          {items.map((item) => {
            const key = item.name || item._fileName;
            const regions = getRegions(item.annotations || []);
            const length = item.length || item.sequence?.length || 0;
            const top = item.topology || 'linear';
            const checked = annotateSet?.has(key);
            return (
              <div
                key={item.id || key}
                className="grid grid-cols-[auto_1fr_70px_70px_auto_auto] gap-2 items-center px-3 py-2 border-b border-gray-100 last:border-b-0 text-xs"
              >
                <PlasmidMiniMap
                  length={length}
                  topology={top}
                  annotations={item.annotations || []}
                  size={40}
                  mode="inline"
                  name={item.name || item._fileName}
                />
                <div
                  className="font-medium text-gray-700 outline-none rounded px-1 -mx-1 hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-emerald-300 truncate"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  onBlur={(e) => handleBlur(item, e)}
                  onKeyDown={handleKeyDown}
                  data-testid={`multi-name-${key}`}
                >
                  {item.name || item._fileName}
                </div>
                <div className="text-right text-[11px] text-gray-500 font-mono">{length.toLocaleString()}</div>
                <div className="text-right text-[11px] text-gray-500">
                  {top === 'circular' ? regions.length : '—'}
                </div>
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={!!checked}
                    onChange={() => onAnnotateToggle?.(key)}
                    data-testid={`multi-annot-${key}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveItem?.(item)}
                  className="text-gray-400 hover:text-red-600 px-1"
                  title="Удалить из списка"
                  data-testid={`multi-remove-${key}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* footer */}
      <div className="border-t border-gray-200 bg-white px-4 py-2 flex items-center justify-end gap-2">
        <button
          disabled
          title={TIP_NEEDS_SINGLE}
          className="text-xs px-3 py-1.5 rounded bg-white border border-gray-200 text-gray-400 cursor-not-allowed"
          data-testid="action-canvas-disabled"
        >
          На канвас
        </button>
        <button
          onClick={() => fire('library-batch')}
          className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700"
          data-testid="action-library-batch"
        >
          В библиотеку ({items.length})
        </button>
        <div className="relative">
          <button
            onClick={() => setSecondaryOpen((v) => !v)}
            className="text-base leading-none px-2.5 py-1.5 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="Дополнительно"
            title="Дополнительно"
            data-testid="multi-secondary-toggle"
          >
            ⋯
          </button>
          {secondaryOpen && (
            <div
              className="absolute right-0 bottom-full mb-1 z-10 bg-white border border-gray-200 rounded shadow-lg w-56 py-1"
              data-testid="multi-secondary-popup"
            >
              <button
                type="button"
                onClick={() => fire('replace-all')}
                className="w-full text-left text-xs px-3 py-1.5 hover:bg-gray-50"
                data-testid="multi-action-replace-all"
              >
                📁 Заменить весь batch
              </button>
              <button
                type="button"
                onClick={() => fire('delete-all')}
                className="w-full text-left text-xs px-3 py-1.5 hover:bg-red-50 text-red-700"
                data-testid="multi-action-delete-all"
              >
                🗑 Удалить весь batch
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

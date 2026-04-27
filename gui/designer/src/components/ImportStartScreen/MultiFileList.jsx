import PlasmidMiniMap from '../PlasmidMiniMap';
import { getRegions } from '../../annotation-model';

/**
 * MultiFileList — list of parsed items shown when N files were imported at once.
 *
 * Each row:
 *   [PlasmidMiniMap 46 px] [inline-rename name + meta] [auto-annotate checkbox]
 *
 * Footer batch-toggle:
 *   [☑ всем] [☐ никому]
 *
 * Inline rename: contenteditable span, save on blur.
 */
export default function MultiFileList({ items, annotateSet, onRename, onAnnotateToggle, onAllAnnotate, onNoneAnnotate }) {
  if (!items?.length) return null;

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

  return (
    <div className="space-y-2" data-testid="import-multi-list">
      <div className="flex items-start gap-2 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs">
        <span className="text-base leading-none">⚠</span>
        <span>
          Несколько файлов сразу можно только в библиотеку. Для других действий
          загружайте по одному.
        </span>
      </div>
      <div className="rounded border border-gray-200 bg-white overflow-hidden">
        {items.map((item) => {
          const key = item.name || item._fileName;
          const regions = getRegions(item.annotations || []);
          const length = item.length || item.sequence?.length || 0;
          const top = item.topology || 'linear';
          const checked = annotateSet?.has(key);
          return (
            <div
              key={item.id || key}
              className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3 py-2 border-b border-gray-100 last:border-b-0"
            >
              <PlasmidMiniMap
                length={length}
                topology={top}
                annotations={item.annotations || []}
                size={46}
              />
              <div className="min-w-0">
                <div
                  className="text-sm font-medium text-gray-700 outline-none rounded px-1 -mx-1 hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-emerald-300"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  onBlur={(e) => handleBlur(item, e)}
                  onKeyDown={handleKeyDown}
                  data-testid={`multi-name-${key}`}
                >
                  {item.name || item._fileName}
                </div>
                <div className="text-[11px] text-gray-500">
                  {length.toLocaleString()} п.н. ·{' '}
                  {top === 'circular' ? `${regions.length} регионов` : 'линейный'}
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!checked}
                  onChange={() => onAnnotateToggle?.(key)}
                  data-testid={`multi-annot-${key}`}
                />
                <span>авто-аннотация</span>
              </label>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onAllAnnotate}
          className="text-[11px] px-2 py-1 rounded bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
          data-testid="multi-all-annotate"
        >
          ☑ всем
        </button>
        <button
          onClick={onNoneAnnotate}
          className="text-[11px] px-2 py-1 rounded bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
          data-testid="multi-none-annotate"
        >
          ☐ никому
        </button>
      </div>
    </div>
  );
}

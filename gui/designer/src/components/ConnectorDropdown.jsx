/**
 * ConnectorDropdown — MIRO-style part picker for racetrack connector points.
 * Appears at junction midpoint when user clicks "+".
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_ICONS, groupByCategory } from '../part-categories';
import { getColor } from '../theme';

export default function ConnectorDropdown({ position, afterIdx, parts, onInsert, onClose, onImport }) {
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  const groups = useMemo(() => {
    const filtered = (parts || []).filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.type.toLowerCase().includes(query.toLowerCase())
    );
    return groupByCategory(filtered);
  }, [parts, query]);

  // Flip if off-screen
  const style = { position: 'fixed', zIndex: 9999 };
  style.left = position.x + 220 > window.innerWidth ? position.x - 220 : position.x;
  style.top = position.y + 300 > window.innerHeight ? position.y - 300 : position.y;

  return createPortal(
    <div ref={ref} style={style}
      className="bg-white rounded-lg shadow-xl border border-gray-200 min-w-[200px] max-w-[260px] select-none overflow-hidden">
      {/* Search */}
      <div className="p-2 border-b border-gray-100">
        <input ref={inputRef} type="text" value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search library..."
          className="w-full text-xs border rounded px-2 py-1.5 outline-none focus:border-blue-400" />
      </div>

      {/* Parts list */}
      <div className="max-h-[240px] overflow-y-auto py-1">
        {CATEGORY_ORDER.filter(cat => groups[cat]?.length > 0).map(cat => (
          <div key={cat}>
            <div className="text-[9px] text-gray-400 uppercase tracking-wider px-3 pt-2 pb-0.5 font-semibold">
              {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
            </div>
            {groups[cat].map(p => (
              <button key={p.id}
                onClick={() => { onInsert(afterIdx, p); onClose(); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getColor(p) }} />
                <span className="truncate flex-1">{p.name}</span>
                <span className="text-[10px] text-gray-400 shrink-0">{p.length || ''}</span>
              </button>
            ))}
          </div>
        ))}
        {Object.values(groups).every(g => !g?.length) && (
          <div className="text-xs text-gray-400 text-center py-4">Nothing found</div>
        )}
      </div>

      {/* Import from file */}
      {onImport && (
        <div className="border-t border-gray-100">
          <button onClick={() => { onImport(); onClose(); }}
            className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition">
            {'📂'} Import from file...
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

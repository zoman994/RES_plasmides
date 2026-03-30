/**
 * ContextMenu — universal right-click menu via createPortal.
 *
 * Props:
 *   items    — [{ label, icon?, onClick, disabled?, divider? }]
 *   position — { x, y } (client coords from e.clientX/Y)
 *   onClose  — called on click outside, Escape, or item click
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function ContextMenu({ items, position, onClose }) {
  const ref = useRef(null);

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

  // Flip if menu would go off-screen
  const style = { position: 'fixed', zIndex: 9999 };
  const menuW = 200, menuH = items.length * 30 + 8;
  style.left = position.x + menuW > window.innerWidth ? position.x - menuW : position.x;
  style.top = position.y + menuH > window.innerHeight ? position.y - menuH : position.y;

  return createPortal(
    <div ref={ref} style={style}
      className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px] text-sm select-none">
      {items.map((item, i) => {
        if (item.divider) {
          return <div key={i} className="border-t border-gray-100 my-1" />;
        }
        return (
          <button key={i} disabled={item.disabled}
            onClick={() => { item.onClick?.(); onClose(); }}
            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition
              ${item.disabled
                ? 'text-gray-300 cursor-default'
                : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
              }`}>
            {item.icon && <span className="text-sm w-5 text-center">{item.icon}</span>}
            <span className="flex-1 truncate">{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

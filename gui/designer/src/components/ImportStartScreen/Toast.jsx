/**
 * Toast — persistent (no auto-dismiss) bottom-center notification listing
 * names of plasmids the user has just sent to canvas during this modal session.
 *
 * Subsequent additions extend the list separated by «·».
 */
export default function Toast({ items, onOpenCanvas, onClose }) {
  if (!items || items.length === 0) return null;
  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 max-w-[600px] bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-2xl"
      role="status"
      data-testid="import-toast"
    >
      <div className="flex flex-wrap gap-2 items-center text-xs">
        {items.map((n, i) => (
          <span key={`${n}-${i}`} className="inline-flex items-center gap-1">
            <span className="text-emerald-400">✓</span>
            <span>{n}</span>
            {i < items.length - 1 && <span className="text-gray-500 ml-1">·</span>}
          </span>
        ))}
      </div>
      <button
        onClick={onOpenCanvas}
        className="text-xs px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
      >
        Открыть холст →
      </button>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-white text-base leading-none"
        aria-label="Скрыть"
      >
        ✕
      </button>
    </div>
  );
}

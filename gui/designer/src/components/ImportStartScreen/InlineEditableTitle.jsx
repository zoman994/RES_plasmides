import { useEffect, useRef, useState } from 'react';

/**
 * InlineEditableTitle — Polish §1. Click-to-edit single-line title.
 *   default: text + ✎ icon (opacity 0 until parent hover, then 0.6)
 *   click  : transitions to <input>, autofocus + select-all
 *   Enter  : commit (calls onCommit with trimmed value, blank kept blank)
 *   Esc    : cancel (resets draft to current value)
 *   blur   : commit (treated like Enter)
 */
export function InlineEditableTitle({ value, onCommit, placeholder = '(без имени)' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value || '');
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if ((draft || '') !== (value || '')) onCommit?.(draft);
  };
  const cancel = () => {
    setDraft(value || '');
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        className="text-lg font-semibold text-gray-800 bg-white border border-emerald-500 rounded px-2 py-0.5 outline-none w-full"
        data-testid="title-input"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 text-left max-w-full"
      data-testid="title-display"
    >
      <span className="text-lg font-semibold text-gray-800 truncate" title={value || placeholder}>
        {value || <span className="text-gray-400 italic font-normal">{placeholder}</span>}
      </span>
      <span className="text-gray-400 opacity-0 group-hover:opacity-60 transition-opacity text-sm" aria-hidden="true">
        ✎
      </span>
    </button>
  );
}

export default InlineEditableTitle;

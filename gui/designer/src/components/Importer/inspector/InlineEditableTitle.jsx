import { useEffect, useRef, useState } from 'react';
import { STRINGS } from '../../../lib/strings';

const S = STRINGS.importer;

/**
 * InlineEditableTitle — click-to-edit single-line title (M-B.2 K3).
 * Adapted 1:1 from v0.5 ImportStartScreen/InlineEditableTitle.
 *
 *   default: text + ✎ icon (visible on hover)
 *   click  : transitions to <input>, autofocus + select-all
 *   Enter  : commit (calls onCommit with trimmed value)
 *   Esc    : cancel (resets draft to current value)
 *   blur   : commit (treated like Enter)
 */
export default function InlineEditableTitle({ value, onCommit, placeholder }) {
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

  const fallback = placeholder ?? S.untitledItem;

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        data-testid="importer-inline-title-input"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        aria-label={S.inlineTitleAria}
        style={{
          fontSize: 14, fontWeight: 600,
          color: 'var(--text-primary)',
          padding: '2px 8px',
          border: '0.5px solid var(--accent-500)',
          borderRadius: 'var(--radius-md)',
          width: '100%',
          background: 'var(--surface-1)',
          outline: 'none',
        }}
      />
    );
  }

  return (
    <button
      type="button"
      data-testid="importer-inline-title"
      onClick={() => setEditing(true)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'transparent', border: 'none',
        padding: 0, margin: 0, cursor: 'text',
        textAlign: 'left', maxWidth: '100%',
      }}
    >
      <span
        title={value || fallback}
        style={{
          fontSize: 14, fontWeight: 600,
          color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
          fontStyle: value ? 'normal' : 'italic',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >{value || fallback}</span>
      <span
        aria-hidden
        style={{ fontSize: 11, color: 'var(--text-tertiary)', opacity: 0.6 }}
      >✎</span>
    </button>
  );
}

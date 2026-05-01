import { useState } from 'react';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';
import TagsInlineEditor from './TagsInlineEditor';

function topologyIcon(topology) {
  if (topology === 'circular') return '○';
  if (topology === 'linear') return '—';
  return '·';
}

function formatLength(payload) {
  if (!payload) return '';
  const len = typeof payload.length === 'number'
    ? payload.length
    : (typeof payload.sequence === 'string' ? payload.sequence.length : null);
  return len != null ? `${len} bp` : '';
}

function formatPrimerSubtitle(payload) {
  if (!payload) return '';
  const parts = [];
  if (typeof payload.tm === 'number') parts.push(`Tm ${payload.tm.toFixed(1)}°C`);
  if (typeof payload.gc === 'number') parts.push(`GC ${Math.round(payload.gc)}%`);
  if (parts.length === 0 && typeof payload.sequence === 'string') {
    parts.push(`${payload.sequence.length} nt`);
  }
  return parts.join(' · ');
}

export default function LibraryListRow({ entry }) {
  const editingTagsEntryId = useStore(s => s.editingTagsEntryId);
  const setEditingTagsEntry = useStore(s => s.setEditingTagsEntry);
  const markLibraryEntryPendingDelete = useStore(s => s.markLibraryEntryPendingDelete);
  const unmarkLibraryEntryPendingDelete = useStore(s => s.unmarkLibraryEntryPendingDelete);
  const commitLibraryEntryPendingDelete = useStore(s => s.commitLibraryEntryPendingDelete);
  const showToast = useStore(s => s.showToast);

  const [hovered, setHovered] = useState(false);
  const isEditingTags = editingTagsEntryId === entry.id;

  function handleTagsClick(e) {
    e.stopPropagation();
    setEditingTagsEntry(entry.id);
  }

  function handleDelete(e) {
    e.stopPropagation();
    const id = entry.id;
    const name = entry.name || '';
    markLibraryEntryPendingDelete(id);
    showToast(STRINGS.library.entryDeletedToast(name), 'info', {
      onUndo: () => unmarkLibraryEntryPendingDelete(id),
      onAutoDismiss: () => {
        Promise.resolve(commitLibraryEntryPendingDelete(id)).catch(err => {
          // eslint-disable-next-line no-console
          console.error('[bodgegene] commitLibraryEntryPendingDelete failed', err);
        });
      },
      autoDismissMs: 5000,
    });
  }

  const subtitle = entry.kind === 'primer'
    ? formatPrimerSubtitle(entry.payload)
    : [topologyIcon(entry.payload?.topology), formatLength(entry.payload)].filter(Boolean).join('  ');

  return (
    <div
      data-testid={`library-row-${entry.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-1)',
      }}
    >
      <div style={{ flex: '0 0 auto', minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
          {entry.name || STRINGS.startScreen.untitled}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {subtitle}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          minHeight: 28,
        }}
      >
        {isEditingTags ? (
          <TagsInlineEditor entry={entry} />
        ) : (
          <button
            type="button"
            onClick={handleTagsClick}
            data-testid={`library-row-tags-${entry.id}`}
            aria-label={STRINGS.library.editTagsAria(entry.name || '')}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              background: 'transparent',
              border: 'none',
              padding: '4px 6px',
              cursor: 'pointer',
              minHeight: 22,
              borderRadius: 'var(--radius-md)',
              textAlign: 'left',
            }}
          >
            {(entry.tags || []).length === 0 ? (
              <span style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                fontStyle: 'italic',
              }}>{STRINGS.library.addTagPlaceholder}</span>
            ) : (
              (entry.tags || []).map(tag => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-flex',
                    fontSize: 11, padding: '2px 8px',
                    borderRadius: 'var(--radius-pill, 9999px)',
                    background: 'var(--surface-3, #e7e5e4)',
                    color: 'var(--text-primary)',
                  }}
                >{tag}</span>
              ))
            )}
          </button>
        )}
      </div>

      {hovered && !isEditingTags && (
        <button
          type="button"
          onClick={handleDelete}
          data-testid={`library-row-delete-${entry.id}`}
          title={STRINGS.library.deleteEntryTitle}
          aria-label={STRINGS.library.deleteEntryAria(entry.name || '')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: 14,
            lineHeight: 1,
            color: 'var(--text-tertiary)',
            borderRadius: 'var(--radius-md)',
          }}
        >×</button>
      )}
    </div>
  );
}

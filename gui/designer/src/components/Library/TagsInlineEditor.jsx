import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { LIBRARY_TAGS_SOFT_LIMIT, selectAllLibraryTags } from '../../store/librarySlice';
import { STRINGS } from '../../lib/strings';

const TAG_MAX_CHARS = 50;

function normalizeTag(raw) {
  return (raw || '').trim().toLowerCase();
}

export default function TagsInlineEditor({ entry }) {
  const libraryEntries = useStore(s => s.libraryEntries);
  const updateLibraryEntryTags = useStore(s => s.updateLibraryEntryTags);
  const setEditingTagsEntry = useStore(s => s.setEditingTagsEntry);
  const allTags = selectAllLibraryTags({ libraryEntries });

  const initialTags = Array.isArray(entry.tags) ? entry.tags : [];
  const [tags, setTags] = useState(initialTags);
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  function commitAndClose(nextTags) {
    if (JSON.stringify(nextTags) !== JSON.stringify(initialTags)) {
      updateLibraryEntryTags(entry.id, nextTags);
    }
    setEditingTagsEntry(null);
  }

  function addFromInput() {
    const norm = normalizeTag(input);
    setInput('');
    if (!norm) return;
    if (norm.length > TAG_MAX_CHARS) return;
    if (tags.includes(norm)) return;
    if (tags.length >= LIBRARY_TAGS_SOFT_LIMIT) return;
    setTags([...tags, norm]);
  }

  function addFromSuggestion(tag) {
    const norm = normalizeTag(tag);
    if (!norm) return;
    if (tags.includes(norm)) return;
    if (tags.length >= LIBRARY_TAGS_SOFT_LIMIT) return;
    setTags([...tags, norm]);
  }

  function removeTag(tag) {
    setTags(tags.filter(t => t !== tag));
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addFromInput();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      commitAndClose(tags);
    }
  }

  function onBlur(e) {
    // Don't close when focus moves to the suggestion buttons or remove buttons
    // inside this editor.
    const next = e.relatedTarget;
    if (next && e.currentTarget.contains(next)) return;
    commitAndClose(tags);
  }

  const tagsFull = tags.length >= LIBRARY_TAGS_SOFT_LIMIT;
  const suggestions = allTags.filter(t => !tags.includes(t)).slice(0, 6);

  return (
    <div
      data-testid={`library-tags-editor-${entry.id}`}
      onBlur={onBlur}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 10px',
        background: 'var(--surface-2)',
        border: '0.5px solid var(--accent-500)',
        borderRadius: 'var(--radius-md)',
        minWidth: 240,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {tags.map(tag => (
          <span
            key={tag}
            data-testid={`library-tag-${entry.id}-${tag}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              fontSize: 11, padding: '2px 4px 2px 8px',
              borderRadius: 'var(--radius-pill, 9999px)',
              background: 'var(--surface-3, #e7e5e4)',
              color: 'var(--text-primary)',
            }}
          >
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              data-testid={`library-tag-remove-${entry.id}-${tag}`}
              aria-label={STRINGS.library.tagRemoveAria(tag)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 12, lineHeight: 1, padding: '0 4px',
                color: 'var(--text-tertiary)',
              }}
            >×</button>
          </span>
        ))}
      </div>

      <input
        ref={inputRef}
        data-testid={`library-tag-input-${entry.id}`}
        type="text"
        value={input}
        placeholder={tagsFull ? STRINGS.library.tagsLimit(LIBRARY_TAGS_SOFT_LIMIT) : STRINGS.library.addTagPlaceholder}
        disabled={tagsFull}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={TAG_MAX_CHARS}
        style={{
          padding: '4px 8px', fontSize: 12,
          border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
        }}
      />

      {suggestions.length > 0 && !tagsFull && (
        <div
          data-testid={`library-tag-suggestions-${entry.id}`}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}
        >
          {suggestions.map(tag => (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addFromSuggestion(tag)}
              data-testid={`library-tag-suggestion-${entry.id}-${tag}`}
              style={{
                fontSize: 11, padding: '2px 8px',
                borderRadius: 'var(--radius-pill, 9999px)',
                border: '0.5px dashed var(--border-default)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >+ {tag}</button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useStore } from '../../../store';
import { LIBRARY_TAGS_SOFT_LIMIT, selectAllLibraryTags } from '../../../store/librarySlice';
import { STRINGS } from '../../../lib/strings';

const S = STRINGS.importer;
const TAG_MAX_CHARS = 50;

function normalizeTag(raw) {
  return (raw || '').trim().toLowerCase();
}

// UX-012 — guard against junk that polluted the suggestion pool
// (biolog spotted a stale `332123` tag from an earlier session
// surfaced as a chip everywhere). A real biological tag has at least
// one letter; pure-numeric / single-character / leading-symbol
// strings are almost always typos that nobody intends to reuse.
function isMeaningfulTag(t) {
  if (typeof t !== 'string') return false;
  const s = t.trim();
  if (s.length < 2) return false;
  if (/^\d+$/.test(s)) return false;          // pure numeric → junk
  if (!/[a-zа-я]/i.test(s)) return false;     // must contain a letter
  return true;
}

/**
 * TagsEditor — inline tag chips + add-input (M-B.2 follow-up).
 *
 * Lives in SingleInspector under the title row. On every change calls
 * onChange(nextTags) — parent writes through to perFileEdits.editedTags.
 * Confirm flow promotes edits.editedTags into entry.tags for the
 * LibraryEntry. Library fullscreen is gone, so this editor is the only
 * place biolog can tag a container — applied at import time before
 * Confirm. Suggestions pull from existing Library tag pool so
 * vocabulary stays consistent.
 */
export default function TagsEditor({ tags = [], onChange }) {
  const libraryEntries = useStore((s) => s.libraryEntries);
  const allTags = selectAllLibraryTags({ libraryEntries });
  const [input, setInput] = useState('');

  function addFromInput() {
    const norm = normalizeTag(input);
    setInput('');
    if (!norm) return;
    if (norm.length > TAG_MAX_CHARS) return;
    if (!isMeaningfulTag(norm)) return;
    if (tags.includes(norm)) return;
    if (tags.length >= LIBRARY_TAGS_SOFT_LIMIT) return;
    onChange?.([...tags, norm]);
  }

  function addFromSuggestion(tag) {
    const norm = normalizeTag(tag);
    if (!norm || tags.includes(norm) || tags.length >= LIBRARY_TAGS_SOFT_LIMIT) return;
    onChange?.([...tags, norm]);
  }

  function removeTag(tag) {
    onChange?.(tags.filter((t) => t !== tag));
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addFromInput();
    }
  }

  const tagsFull = tags.length >= LIBRARY_TAGS_SOFT_LIMIT;
  // UX-012 — filter the suggestion pool by `isMeaningfulTag` so legacy
  // junk tags (e.g. a stray `332123` typo) stop bubbling up in every
  // editor instance. The underlying library tag is left in place — we
  // only hide the suggestion chip.
  const suggestions = allTags
    .filter((t) => !tags.includes(t) && isMeaningfulTag(t))
    .slice(0, 6);

  return (
    <div
      data-testid="importer-tags-editor"
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4,
        marginTop: 6,
      }}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          data-testid={`importer-tag-${tag}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            fontSize: 11, padding: '2px 4px 2px 8px',
            borderRadius: 9999,
            background: 'var(--accent-50)',
            color: 'var(--accent-text)',
          }}
        >
          <span>{tag}</span>
          <button
            type="button"
            onClick={() => removeTag(tag)}
            data-testid={`importer-tag-remove-${tag}`}
            aria-label={S.tagRemoveAria(tag)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 12, lineHeight: 1, padding: '0 4px',
              color: 'var(--accent-text)',
            }}
          >×</button>
        </span>
      ))}

      <input
        type="text"
        data-testid="importer-tag-input"
        value={input}
        placeholder={tagsFull ? S.tagsLimit(LIBRARY_TAGS_SOFT_LIMIT) : S.addTagPlaceholder}
        disabled={tagsFull}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => { if (input.trim()) addFromInput(); }}
        maxLength={TAG_MAX_CHARS}
        style={{
          fontSize: 11,
          padding: '2px 6px',
          minWidth: 80,
          border: '0.5px dashed var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'transparent',
          outline: 'none',
        }}
      />

      {suggestions.length > 0 && !tagsFull && (
        <div
          data-testid="importer-tag-suggestions"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}
        >
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => addFromSuggestion(tag)}
              data-testid={`importer-tag-suggestion-${tag}`}
              style={{
                fontSize: 10, padding: '1px 6px',
                borderRadius: 9999,
                border: '0.5px dashed var(--border-default)',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
            >+ {tag}</button>
          ))}
        </div>
      )}
    </div>
  );
}

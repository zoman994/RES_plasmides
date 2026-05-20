/**
 * NotebookToolbar — markdown insert buttons + Esc/Ctrl shortcuts.
 *
 * Spec §5.2. 16 base buttons + 3 special buttons (📎 attach / @@ ref
 * picker / 👁 preview toggle).
 *
 * The toolbar is stateless. It hands every action back to the parent
 * via `onInsert(snippet)` (the parent has the textarea ref and knows
 * how to insertAtCursor). Special actions go through their own props.
 */

const BASE_BUTTONS = [
  { id: 'bold',     label: 'B',   title: 'Bold (Ctrl+B)',          snippet: '**${sel}**' },
  { id: 'italic',   label: 'I',   title: 'Italic (Ctrl+I)',        snippet: '_${sel}_' },
  { id: 'strike',   label: 'S',   title: 'Strikethrough',          snippet: '~~${sel}~~' },
  { id: 'mark',     label: '==',  title: 'Highlight',              snippet: '==${sel}==' },
  { id: 'h1',       label: 'H1',  title: 'Heading 1',              snippet: '\n# ${sel}\n' },
  { id: 'h2',       label: 'H2',  title: 'Heading 2',              snippet: '\n## ${sel}\n' },
  { id: 'h3',       label: 'H3',  title: 'Heading 3',              snippet: '\n### ${sel}\n' },
  { id: 'ul',       label: '•',   title: 'Bulleted list',          snippet: '\n- ${sel}\n' },
  { id: 'ol',       label: '1.',  title: 'Numbered list',          snippet: '\n1. ${sel}\n' },
  { id: 'task',     label: '☐',   title: 'Task list',              snippet: '\n- [ ] ${sel}\n' },
  { id: 'link',     label: '🔗',  title: 'Link',                   snippet: '[${sel}](url)' },
  { id: 'code',     label: '<>',  title: 'Inline code',            snippet: '`${sel}`' },
  { id: 'block-dna', label: 'DNA', title: 'DNA code block',        snippet: '\n```dna\n${sel}\n```\n' },
  { id: 'block-aa', label: 'AA',  title: 'Amino-acid code block',  snippet: '\n```aa\n${sel}\n```\n' },
  { id: 'table',    label: '⊞',   title: 'Table (3×2)',
    snippet: '\n| h1 | h2 |\n|---|---|\n| a | b |\n| c | d |\n' },
  { id: 'footnote', label: 'fn',  title: 'Footnote',               snippet: '[^${sel}]' },
];

export default function NotebookToolbar({
  onInsert,
  onAttachmentClick,
  onRefPickerClick,
  onTogglePreview,
  previewVisible = true,
  disabled = false,
}) {
  const callInsert = (b) => () => {
    if (typeof onInsert === 'function') onInsert(b.snippet, b.id);
  };
  return (
    <div
      data-testid="notebook-toolbar"
      style={styles.bar}
    >
      {BASE_BUTTONS.map(b => (
        <button
          key={b.id}
          type="button"
          data-testid={`nb-tb-${b.id}`}
          title={b.title}
          onClick={callInsert(b)}
          disabled={disabled}
          style={styles.btn}
        >
          {b.label}
        </button>
      ))}
      <div style={styles.spacer} />
      <button
        type="button"
        data-testid="nb-tb-attach"
        title="Attach file (drag-drop also works)"
        onClick={onAttachmentClick}
        disabled={disabled}
        style={styles.btn}
      >
        📎
      </button>
      <button
        type="button"
        data-testid="nb-tb-ref"
        title="Insert @@ref to entity"
        onClick={onRefPickerClick}
        disabled={disabled}
        style={styles.btn}
      >
        @@
      </button>
      <button
        type="button"
        data-testid="nb-tb-preview"
        title={previewVisible ? 'Hide preview' : 'Show preview'}
        onClick={onTogglePreview}
        style={{
          ...styles.btn,
          background: previewVisible ? 'var(--accent-100, #eed2c1)' : 'transparent',
        }}
      >
        👁
      </button>
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    padding: '6px 8px',
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--surface-2)',
  },
  btn: {
    minWidth: 28,
    height: 26,
    padding: '0 6px',
    fontSize: 11.5,
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  spacer: { flex: 1 },
};

export { BASE_BUTTONS };

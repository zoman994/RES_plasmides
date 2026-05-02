import { useCallback, useRef, useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import { ACCEPT_STRING } from '../../../file-import';

const S = STRINGS.importer;

/**
 * CatalogColumn — sticky-search header + 4-source tree + drop zone + paste
 * textarea (M-B.2 K1 placeholder; full 4-source implementation in K2).
 *
 * K1 ships a working dropzone + paste box + search input so the orchestrator
 * is end-to-end testable. The 4 source groups (Этот проект / Учебные / Моя
 * библиотека / Каталог SnapGene) and length-pattern search land in K2.
 */
export default function CatalogColumn({
  query = '',
  onQueryChange,
  // eslint-disable-next-line no-unused-vars
  activeSource,
  // eslint-disable-next-line no-unused-vars
  onActiveSourceChange,
  // eslint-disable-next-line no-unused-vars
  onSelectItem,
  onFiles,
  onPasteText,
  busy = false,
}) {
  const fileInputRef = useRef(null);
  const [pasteDraft, setPasteDraft] = useState('');
  const [hover, setHover] = useState(false);

  const onPick = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onFiles) onFiles(files);
    e.target.value = '';
  }, [onFiles]);

  const onDrop = useCallback((e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    setHover(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0 && onFiles) onFiles(files);
  }, [onFiles]);

  const submitPaste = useCallback(() => {
    const text = pasteDraft.trim();
    if (!text || !onPasteText) return;
    onPasteText(text);
    setPasteDraft('');
  }, [pasteDraft, onPasteText]);

  return (
    <aside
      data-testid="importer-catalog-column"
      style={{
        width: 320, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-1, #fff)',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '0.5px solid var(--border-subtle)',
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange?.(e.target.value)}
          placeholder={S.catalogSearchPlaceholder}
          data-testid="importer-catalog-search"
          style={{
            width: '100%', fontSize: 12,
            padding: '6px 10px',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            outline: 'none',
          }}
        />
      </div>

      <div
        style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}
        data-testid="importer-catalog-tree"
      >
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          {S.catalogPlaceholderK1}
        </div>
      </div>

      <div
        data-testid="importer-catalog-dropzone"
        data-hover={hover ? 'true' : 'false'}
        onDragEnter={(e) => {
          if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
          e.preventDefault();
          setHover(true);
        }}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={() => setHover(false)}
        onDrop={onDrop}
        style={{
          flexShrink: 0,
          borderTop: '2px dashed var(--border-default)',
          background: hover ? 'var(--accent-50)' : 'var(--surface-2)',
          padding: '10px',
        }}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          data-testid="importer-catalog-pick-files"
          style={{
            width: '100%',
            padding: '6px 8px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {hover ? S.dropzoneHover : S.dropzoneIdle}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={onPick}
          hidden
          data-testid="importer-catalog-file-input"
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <textarea
            value={pasteDraft}
            onChange={(e) => setPasteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitPaste();
              }
            }}
            placeholder={S.catalogPastePlaceholder}
            rows={2}
            data-testid="importer-catalog-paste"
            style={{
              flex: 1, fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              padding: '4px 6px',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              resize: 'none', outline: 'none',
            }}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={submitPaste}
            disabled={!pasteDraft.trim()}
            data-testid="importer-catalog-paste-submit"
            style={{
              fontSize: 11,
              padding: '0 10px',
              background: 'var(--accent-500)',
              color: 'var(--surface-1)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: pasteDraft.trim() ? 'pointer' : 'not-allowed',
              opacity: pasteDraft.trim() ? 1 : 0.4,
            }}
          >{S.catalogPasteSubmit}</button>
        </div>
        {busy && (
          <div
            data-testid="importer-catalog-busy"
            style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}
          >{S.busyParsing}</div>
        )}
      </div>
    </aside>
  );
}

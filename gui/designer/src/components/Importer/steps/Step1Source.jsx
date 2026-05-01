import { useRef, useState, useCallback } from 'react';
import { STRINGS } from '../../../lib/strings';
import { ACCEPT_STRING } from '../../../file-import';

const S = STRINGS.importer;

/**
 * Step 1 of the Importer (M-B.1 K2). Drop zone + file picker + paste mockup.
 *
 * In Simple mode: confirming on Step 1 means "submit immediately" and the
 * parent runs `handleSimpleImport` (K3). In Advanced mode: Step 1 transitions
 * to Step 2 Combined view (K5).
 *
 * This component owns no parsedItems state itself — files are pushed up via
 * `onFilesSelected(files)`. Parent ImporterRoot keeps the useImporterState
 * hook and decides what to do on Next.
 */
export default function Step1Source({
  parsedItems,
  busy,
  error,
  onFilesSelected,
  mode,
  target,
  onNext,
  onCancel,
}) {
  const inputRef = useRef(null);
  const [hover, setHover] = useState(false);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setHover(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    onFilesSelected(files);
  }, [onFilesSelected]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    if (Array.from(e.dataTransfer?.types || []).includes('Files')) setHover(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    if (e.relatedTarget == null) setHover(false);
  }, []);

  const onPickClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onInputChange = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onFilesSelected(files);
    e.target.value = ''; // allow re-selecting the same file
  }, [onFilesSelected]);

  const hasFiles = parsedItems.length > 0;
  const errorCount = parsedItems.filter(p => p._error).length;

  return (
    <div
      data-testid="importer-step1"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: 24,
        minHeight: 0,
        overflowY: 'auto',
      }}
    >
      <div
        data-testid="importer-dropzone"
        data-hover={hover ? 'true' : 'false'}
        onClick={onPickClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPickClick(); }}
        style={{
          border: hover
            ? '2px solid var(--accent-500, #f59e0b)'
            : '2px dashed var(--border-default, #d6d3d1)',
          borderRadius: 'var(--radius-lg, 10px)',
          background: hover ? 'var(--accent-50, #fef3c7)' : 'var(--surface-2, #f5f5f4)',
          padding: '48px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          color: 'var(--text-secondary, #57534e)',
          fontSize: 14,
          transition: 'background 80ms, border-color 80ms',
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.5, marginBottom: 12 }}>↓</div>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>
          {hover ? S.dropzoneHover : S.dropzoneIdle}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary, #78716c)' }}>
          {S.dropzoneAccepts}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={onInputChange}
          data-testid="importer-file-input"
          style={{ display: 'none' }}
        />
      </div>

      <details
        data-testid="importer-paste-mockup"
        style={{
          border: '0.5px dashed var(--border-default, #d6d3d1)',
          borderRadius: 'var(--radius-md, 6px)',
          padding: '10px 14px',
          color: 'var(--text-tertiary, #78716c)',
          fontSize: 13,
          background: 'var(--surface-1, #fff)',
        }}
      >
        <summary style={{ cursor: 'not-allowed' }}>{S.pasteTitle}</summary>
        <textarea
          disabled
          placeholder={S.pasteDisabledHint}
          rows={4}
          style={{
            width: '100%',
            marginTop: 8,
            border: '0.5px solid var(--border-subtle, #e7e5e4)',
            borderRadius: 'var(--radius-md)',
            padding: 8,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            background: 'var(--surface-2)',
            color: 'var(--text-tertiary)',
            resize: 'none',
          }}
        />
      </details>

      {busy && (
        <div data-testid="importer-busy" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          {S.busyParsing}
        </div>
      )}

      {hasFiles && (
        <div
          data-testid="importer-files-list"
          style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            border: '0.5px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-1)',
            padding: '10px 14px',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {S.filesReady(parsedItems.length)}
          </div>
          {parsedItems.map(p => (
            <div
              key={p._fileName}
              data-testid={`importer-file-row-${p._fileName}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, color: p._error ? 'var(--danger-text, #b91c1c)' : 'var(--text-primary)',
              }}
            >
              <span style={{ flex: 1 }}>
                {p.name || p._fileName}
                {p._error && <span style={{ marginLeft: 8 }}>· {p._error}</span>}
              </span>
              {!p._error && (
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {p.length} bp · {p.topology}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div data-testid="importer-error" style={{ color: 'var(--danger-text, #b91c1c)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button
          type="button"
          data-testid="importer-cancel"
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >{S.cancel}</button>
        <button
          type="button"
          data-testid="importer-next"
          disabled={!hasFiles || errorCount === parsedItems.length}
          onClick={onNext}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            border: '0.5px solid var(--accent-500, #f59e0b)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-500, #f59e0b)',
            color: 'var(--surface-1, #fff)',
            cursor: hasFiles ? 'pointer' : 'not-allowed',
            opacity: hasFiles ? 1 : 0.45,
          }}
        >
          {mode === 'simple' ? S.confirm : S.next}
        </button>
      </div>

      <div style={{ display: 'none' }} data-testid="importer-target">{target}</div>
    </div>
  );
}

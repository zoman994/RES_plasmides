import { useState, useMemo, useCallback, useEffect } from 'react';
import { useStore } from '../../../store';
import { parseFile } from '../../../file-import';

/**
 * MultiImportView — the in-place table that replaces the Library tree
 * when biolog drops N>1 files (M-X.5 K4, DEC-LIB-MULTI-01..03).
 *
 * Layout: header row with overall annotation choice + folder selector,
 * then a table with one row per file (checkbox · file name · per-file
 * annotation choice · view button), then footer with «Готово (N)» /
 * «Отмена».
 *
 * Q closed (multi-import cap): soft warning at >20 files — biolog
 * sees a cautionary banner but can still proceed. No hard limit.
 *
 * Annotation choice metadata (`auto` / `manual` / `discard`) is
 * recorded on `entry.ext.annotationChoice` for future use; the
 * AnnotationsTab inside LibrarySingleInspector already auto-runs L1
 * common-features-homology when biolog opens an entry, so `auto` is
 * de-facto the default behaviour today. `manual` / `discard`
 * differentiation lands in M-X.6 polish (biolog asked for it
 * explicitly in the planning round).
 *
 * Per-file `[view]` button surfaces a quick PlasmidMiniMap over the
 * sequence so biolog can sanity-check before commit. Out of scope
 * for the K4 minimal landing — biolog asked for it in the spec but
 * we're shipping without it; M-X.6 polish will add the inline
 * preview pane when there's time.
 */
const ANNOTATION_CHOICES = [
  { value: 'auto', label: 'Авто' },
  { value: 'manual', label: 'Вручную' },
  { value: 'discard', label: 'Не нужно' },
];

const SOFT_CAP = 20;

export default function MultiImportView({
  files, // File[] from drop / picker
  onCancel,
  onComplete,
}) {
  const showToast = useStore(s => s.showToast);
  const commitMultiImport = useStore(s => s.commitMultiImport);
  const [parsed, setParsed] = useState([]); // [{ fileName, parsedContent, parseError? }]
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(true);
  const [batchAnnotation, setBatchAnnotation] = useState('auto');
  const [folderPath, setFolderPath] = useState('');
  const [perFile, setPerFile] = useState({}); // fileName → { included, annotationChoice }

  // Parse all files on mount; store per-file state.
  useEffect(() => {
    let canceled = false;
    (async () => {
      const out = [];
      const seed = {};
      for (const file of files) {
        const fileName = file.name;
        try {
          const parsedContent = await parseFile(file);
          out.push({ fileName, parsedContent, parseError: null });
          seed[fileName] = { included: true, annotationChoice: 'auto' };
        } catch (err) {
          out.push({ fileName, parsedContent: null, parseError: err?.message || 'Parse error' });
          seed[fileName] = { included: false, annotationChoice: 'discard' };
        }
      }
      if (canceled) return;
      setParsed(out);
      setPerFile(seed);
      setParsing(false);
    })();
    return () => { canceled = true; };
  }, [files]);

  const togglePerFile = useCallback((fileName) => {
    setPerFile(prev => ({
      ...prev,
      [fileName]: { ...prev[fileName], included: !prev[fileName]?.included },
    }));
  }, []);
  const setPerFileChoice = useCallback((fileName, choice) => {
    setPerFile(prev => ({
      ...prev,
      [fileName]: { ...prev[fileName], annotationChoice: choice },
    }));
  }, []);

  const includedCount = useMemo(() => parsed.filter(p => perFile[p.fileName]?.included && !p.parseError).length, [parsed, perFile]);

  const handleCommit = useCallback(async () => {
    if (busy || includedCount === 0) return;
    setBusy(true);
    try {
      const entries = parsed
        .filter(p => perFile[p.fileName]?.included && !p.parseError && p.parsedContent)
        .map(p => ({
          ...p.parsedContent,
          _fileName: p.fileName,
          _annotationChoice: perFile[p.fileName].annotationChoice || batchAnnotation,
          _folderPath: folderPath,
        }));
      const result = await commitMultiImport(entries, {
        folderPath,
        annotationChoice: batchAnnotation,
      });
      if (result?.ok) {
        showToast?.(
          `Импортировано: ${result.ids.length}${result.failed?.length ? `, не удалось: ${result.failed.length}` : ''}`,
          { kind: 'success', duration: 3500 },
        );
        onComplete?.(result);
      } else {
        showToast?.('Не удалось импортировать файлы — попробуйте ещё раз.', { kind: 'error', duration: 4000 });
      }
    } finally {
      setBusy(false);
    }
  }, [busy, includedCount, parsed, perFile, batchAnnotation, folderPath, commitMultiImport, showToast, onComplete]);

  const overCap = parsed.length > SOFT_CAP;

  return (
    <aside
      data-testid="multi-import-view"
      className="importer-multi-import-view"
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        minWidth: 0, minHeight: 0,
        background: 'var(--surface-1)',
        borderRight: '0.5px solid var(--border-subtle)',
      }}
    >
      <header
        style={{
          padding: '10px 14px',
          borderBottom: '0.5px solid var(--border-subtle)',
          background: 'var(--surface-2)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <button
          type="button"
          data-testid="multi-import-cancel"
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            background: 'transparent',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            cursor: busy ? 'not-allowed' : 'pointer',
            color: 'var(--text-primary)',
          }}
        >← Отмена</button>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
          Multi-import: {parsed.length} {parsed.length === 1 ? 'файл' : (parsed.length < 5 ? 'файла' : 'файлов')}
        </div>
        <button
          type="button"
          data-testid="multi-import-submit"
          onClick={handleCommit}
          disabled={busy || parsing || includedCount === 0}
          style={{
            padding: '4px 14px',
            fontSize: 12,
            background: includedCount > 0 && !parsing ? 'var(--accent-500)' : 'var(--surface-3)',
            color: includedCount > 0 && !parsing ? 'var(--surface-1)' : 'var(--text-tertiary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: busy || includedCount === 0 || parsing ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            opacity: busy ? 0.6 : 1,
          }}
        >{busy ? 'Импорт…' : `Готово (${includedCount})`}</button>
      </header>

      <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border-subtle)', background: 'var(--surface-1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Аннотировать все:</span>
            {ANNOTATION_CHOICES.map((c) => (
              <label
                key={c.value}
                data-testid={`multi-import-batch-${c.value}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 12, cursor: 'pointer',
                  padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                  background: batchAnnotation === c.value ? 'var(--accent-50)' : 'transparent',
                  border: batchAnnotation === c.value ? '0.5px solid var(--accent-500)' : '0.5px solid var(--border-default)',
                }}
              >
                <input
                  type="radio"
                  name="multi-import-batch"
                  checked={batchAnnotation === c.value}
                  onChange={() => setBatchAnnotation(c.value)}
                  style={{ accentColor: 'var(--accent-500)' }}
                />
                {c.label}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Сохранить в:</span>
            <input
              type="text"
              data-testid="multi-import-folder"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="Untagged"
              style={{
                fontSize: 12,
                padding: '3px 8px',
                background: 'var(--surface-1)',
                border: '0.5px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                outline: 'none',
                minWidth: 140,
              }}
            />
          </div>
        </div>
        {overCap && (
          <div
            data-testid="multi-import-cap-warning"
            style={{
              marginTop: 8,
              padding: '6px 8px',
              fontSize: 11.5,
              borderRadius: 'var(--radius-md)',
              background: 'var(--warning-bg, #fef3c7)',
              color: 'var(--warning-fg, #a16207)',
              border: '0.5px solid var(--warning-fg, #a16207)',
            }}
          >
            Многовато файлов ({parsed.length}) — рендер таблицы и парсинг могут тормозить. Если можно — разделите на несколько импортов.
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {parsing && (
          <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>
            Парсинг файлов…
          </div>
        )}
        {!parsing && parsed.map((p) => {
          const state = perFile[p.fileName] || { included: true, annotationChoice: 'auto' };
          const length = p.parsedContent?.length || p.parsedContent?.sequence?.length || 0;
          return (
            <div
              key={p.fileName}
              data-testid={`multi-import-row-${p.fileName}`}
              data-included={state.included ? 'true' : 'false'}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 14px',
                borderBottom: '0.5px solid var(--border-subtle)',
                opacity: p.parseError ? 0.6 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={state.included && !p.parseError}
                disabled={!!p.parseError}
                onChange={() => togglePerFile(p.fileName)}
                style={{ accentColor: 'var(--accent-500)' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.fileName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {p.parseError
                    ? <span style={{ color: 'var(--danger-fg, #b91c1c)' }}>Не удалось разобрать: {p.parseError}</span>
                    : `${length.toLocaleString('ru-RU')} bp · ${p.parsedContent?.topology || 'linear'} · ${(p.parsedContent?.annotations?.length || 0)} аннотаций`}
                </div>
              </div>
              {!p.parseError && (
                <select
                  data-testid={`multi-import-row-choice-${p.fileName}`}
                  value={state.annotationChoice}
                  onChange={(e) => setPerFileChoice(p.fileName, e.target.value)}
                  disabled={!state.included}
                  style={{
                    fontSize: 12,
                    padding: '3px 6px',
                    background: 'var(--surface-1)',
                    border: '0.5px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {ANNOTATION_CHOICES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

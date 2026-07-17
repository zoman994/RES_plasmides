/**
 * AlignInputPanel — left panel of the align workspace, redesigned to the
 * BodgeGene design system (DESIGN_SYSTEM.md): sentence-case labels (no ALL
 * CAPS), the list-item pattern (§3.9), amber accent, custom line-icons (§6).
 *
 * Sequences are shown as list rows with the A/B role chosen INLINE (А/Б), and
 * the three sources (paste / file / library) live in one segmented control. The
 * whole panel is a drop target for FASTA / .ab1 files; the library tab has a
 * name filter (the unfiltered list was the main pain point).
 */
import { useState, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore, selectVisibleLibraryEntries } from '../../store';
import { MAX_ALIGN_INPUTS } from '../../store/alignmentSlice';
import { STRINGS } from '../../lib/strings';
import { parseMultiFasta } from '../../lib/alignment/parse-multi-fasta';
import { parseAbif } from '../../lib/alignment/abif-parse';
import { rankHomologs } from '../../lib/alignment/homologs';
import {
  IconX, IconUpload, IconWave, IconHelix, IconCircle, IconLinear,
} from './icons';
// Reuse the CANONICAL sequence-picker component (Игорь — «поиск из сиквенс-
// пикера, ВОТ ЭТОТ»): the same rich library picker the assembly/canvas use
// (search by name + DNA, filter pills, favorites/recent/project/collection
// sections, mini-map cards). Static import is safe ONLY because the picker's
// graph was made light — TREE_DRAG_MIME lives in a dependency-free module, so
// the picker does not pull the CanvasSkeleton store into the align chunk. Do NOT lazy-load it: a React.lazy
// nested inside the already-lazy align chunk deadlocks the outer lazy under
// vite-node (align-routing hangs on Suspense).
import LibrarySearchBar from '../CanvasSkeleton/canvas/LibrarySearchBar';

const label = { fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary, #78716c)', margin: '0 0 8px' };
const mono = { fontFamily: 'var(--font-mono, monospace)' };

const subLabel = { fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary, #78716c)', margin: '14px 0 6px' };

export default function AlignInputPanel() {
  const inputs = useStore((s) => s.align?.inputs || []);
  // Explicit reference + reads selection (Игорь — «вместо А/Б окошко выбора
  // референса и окошко выбора выравниваний»).
  const refId = useStore((s) => s.align?.refId || null);
  const readIds = useStore(useShallow((s) => s.align?.readIds || []));
  const addAlignInput = useStore((s) => s.addAlignInput);
  const addTraceInput = useStore((s) => s.addTraceInput);
  const removeAlignInput = useStore((s) => s.removeAlignInput);
  const setReference = useStore((s) => s.setReference);
  const toggleRead = useStore((s) => s.toggleRead);
  const libraryEntries = useStore(useShallow(selectVisibleLibraryEntries));
  // Raw map + project context for the canonical LibrarySearchBar (it does its
  // own grouping/filtering; same wiring as the assembly source picker).
  const libraryEntriesById = useStore((s) => s.libraryEntries);
  const projectsById = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);

  const [paste, setPaste] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState(null);
  // Homology suggestion («Найти похожие»): null = browse mode, array = ranked
  // homologs of the reference. On-demand (Игорь chose a button, not auto-scan).
  const [homologs, setHomologs] = useState(null);

  const addFromPaste = useCallback(() => {
    const recs = parseMultiFasta(paste);
    recs.forEach((r) => addAlignInput({ name: r.name, sequence: r.sequence, source: 'paste' }));
    if (recs.length) setPaste('');
  }, [paste, addAlignInput]);

  const handleFiles = useCallback(async (files) => {
    setFileError(null);
    for (const f of files) {
      const name = f.name || 'файл';
      if (/\.ab1$/i.test(name)) {
        try { addTraceInput(parseAbif(await f.arrayBuffer()), { name }); }
        catch (e) { setFileError(`${name}: ${e?.message || 'не удалось прочитать .ab1'}`); }
      } else {
        try {
          const recs = parseMultiFasta(await f.text());
          if (!recs.length) setFileError(`${name}: не найдено последовательностей`);
          recs.forEach((r) => addAlignInput({ name: r.name || name, sequence: r.sequence, source: 'file' }));
        } catch (e) { setFileError(`${name}: ${e?.message || 'не удалось прочитать файл'}`); }
      }
    }
  }, [addAlignInput, addTraceInput]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) handleFiles(files);
  }, [handleFiles]);

  const addLibraryEntry = useCallback((entry) => {
    addAlignInput({
      name: entry.name,
      sequence: entry.payload?.sequence || '',
      source: 'library',
      annotations: entry.payload?.annotations || [],
      libraryEntryId: entry.id,
    });
  }, [addAlignInput]);

  // The reference whose homologs we'd look for: the chosen reference, or the
  // lone input (standalone «pick reference first» flow).
  const refInput = useMemo(() => {
    if (refId) return inputs.find((x) => x.id === refId) || null;
    return inputs.length === 1 ? inputs[0] : null;
  }, [inputs, refId]);
  const canFindHomologs = !!(refInput && (refInput.sequence || '').length >= 8 && libraryEntries.length > 0);

  const findHomologs = useCallback(() => {
    if (!refInput) return;
    const entries = libraryEntries.map((e) => ({ id: e.id, name: e.name, sequence: e.payload?.sequence || '' }));
    setHomologs(rankHomologs(refInput.sequence, entries, { excludeId: refInput.libraryEntryId }));
  }, [refInput, libraryEntries]);

  const homologEntries = useMemo(() => {
    if (!homologs) return null;
    const byId = new Map(libraryEntries.map((e) => [e.id, e]));
    return homologs.map((h) => ({ ...h, entry: byId.get(h.entryId) })).filter((h) => h.entry);
  }, [homologs, libraryEntries]);

  // Reference floats to the TOP of the list and stays there (Игорь: «при выборе
  // референса он должен наверх убегать и там сидеть»). Display-only ordering.
  const orderedInputs = useMemo(() => {
    const ref = inputs.find((x) => x.id === refId);
    if (!ref) return inputs;
    return [ref, ...inputs.filter((x) => x.id !== refId)];
  }, [inputs, refId]);

  // Already-in-list library entries + the cap — so rows can't pile up the same
  // sequence endlessly (Игорь). `addAlignInput` enforces this too (belt + braces).
  const addedEntryIds = useMemo(() => new Set(inputs.map((x) => x.libraryEntryId).filter(Boolean)), [inputs]);
  const atCap = inputs.length >= MAX_ALIGN_INPUTS;

  return (
    <div
      data-testid="align-dropzone"
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 16,
        outline: dragOver ? '2px dashed var(--accent-500, #f59e0b)' : 'none', outlineOffset: 4, borderRadius: 8,
      }}
    >
      {/* ── Sequences ── */}
      <div>
        <p style={label}>
          Последовательности · {inputs.length}
          {atCap && <span style={{ color: 'var(--accent-700, #b45309)' }}>{` · максимум ${MAX_ALIGN_INPUTS}`}</span>}
        </p>
        {inputs.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary, #78716c)', margin: 0 }}>
            Пока пусто — добавьте вставкой, файлом или из библиотеки.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {orderedInputs.map((x) => {
            const isTrace = x.kind === 'trace';
            return (
              <div
                key={x.id}
                data-testid={`align-input-${x.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px',
                  background: 'var(--surface-1, #fff)', border: '1px solid var(--border-subtle, #e7e5e4)', borderRadius: 6,
                }}
              >
                <span style={{
                  width: 26, height: 26, flex: '0 0 26px', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--surface-2, #f5f5f4)', color: isTrace ? 'var(--accent-700, #b45309)' : 'var(--text-secondary, #57534e)',
                }}>{isTrace ? <IconWave /> : <IconHelix />}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-primary, #1c1917)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary, #78716c)' }}>
                    {isTrace ? 'Sanger' : 'ДНК'} · <span style={mono}>{x.sequence.length} bp</span>
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <label title="Сделать референсом" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: refId === x.id ? 'var(--accent-700, #b45309)' : 'var(--text-tertiary, #78716c)', fontWeight: refId === x.id ? 600 : 400 }}>
                    <input type="radio" name="align-reference" data-testid={`align-ref-radio-${x.id}`} checked={refId === x.id} onChange={() => setReference(x.id)} />
                    реф
                  </label>
                  {refId !== x.id && (
                    <label title="Выравнивать на референс" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: readIds.includes(x.id) ? 'var(--text-primary, #1c1917)' : 'var(--text-tertiary, #78716c)' }}>
                      <input type="checkbox" data-testid={`align-read-check-${x.id}`} checked={readIds.includes(x.id)} onChange={() => toggleRead(x.id)} />
                      выровнять
                    </label>
                  )}
                </span>
                <button type="button" data-testid={`align-input-remove-${x.id}`} aria-label="Убрать" onClick={() => removeAlignInput(x.id)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-disabled, #a8a29e)', display: 'flex', padding: 0 }}>
                  <IconX />
                </button>
              </div>
            );
          })}
        </div>
        {inputs.length < 2 && (
          <p data-testid="align-need-more" style={{ fontSize: 12, color: 'var(--text-tertiary, #78716c)', margin: '8px 0 0' }}>
            {STRINGS.align?.needMore || 'Нужно минимум две последовательности.'}
          </p>
        )}
      </div>

      {/* ── Add source (unified — paste / file-drop / library all visible, no tabs) ── */}
      <div>
        <p style={label}>Добавить источник</p>

        {/* Paste box; the whole panel is also a drop target (onDrop on root). */}
        <textarea
          data-testid="align-paste-input"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Вставьте FASTA или последовательность — или перетащите .fasta / .ab1 сюда"
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', ...mono, fontSize: 12, padding: 8, resize: 'vertical', background: 'var(--surface-1, #fff)', border: '1px solid var(--border-default, #d6d3d1)', borderRadius: 6, color: 'var(--text-primary, #1c1917)' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <button type="button" data-testid="align-paste-add" onClick={addFromPaste}
            style={{ padding: '7px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border-default, #d6d3d1)', background: 'var(--surface-2, #f5f5f4)', color: 'var(--text-primary, #1c1917)', borderRadius: 6 }}
          >Добавить</button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary, #57534e)', cursor: 'pointer' }}>
            <IconUpload size={14} /> Файл…
            <input type="file" multiple data-testid="align-file-input" accept=".fasta,.fa,.fna,.ab1,.txt"
              onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) handleFiles(fs); e.target.value = ''; }}
              style={{ display: 'none' }} />
          </label>
        </div>

        {/* Library — canonical search (name + DNA) + on-demand homology suggestion. */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <p style={subLabel}>Из библиотеки</p>
          <button
            type="button" data-testid="align-find-homologs" onClick={findHomologs} disabled={!canFindHomologs}
            title={canFindHomologs ? 'Найти в библиотеке последовательности, похожие на референс' : 'Сначала выберите референс (роль А)'}
            style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
              cursor: canFindHomologs ? 'pointer' : 'not-allowed',
              border: '1px solid var(--border-default, #d6d3d1)',
              background: canFindHomologs ? 'var(--surface-2, #f5f5f4)' : 'var(--surface-1, #fff)',
              color: canFindHomologs ? 'var(--text-primary, #1c1917)' : 'var(--text-disabled, #a8a29e)',
            }}
          >≈ Найти похожие</button>
        </div>

        {homologEntries ? (
          <div data-testid="align-homologs" style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 6px' }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary, #78716c)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Похожие на <strong style={{ color: 'var(--text-secondary, #57534e)' }}>{refInput?.name}</strong>
              </span>
              <button type="button" data-testid="align-homologs-clear" onClick={() => setHomologs(null)}
                style={{ fontSize: 11, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--accent-700, #b45309)', whiteSpace: 'nowrap' }}>← весь список</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 200, overflow: 'auto', background: 'var(--surface-1, #fff)', border: '1px solid var(--border-subtle, #e7e5e4)', borderRadius: 6 }}>
              {homologEntries.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary, #78716c)', padding: '8px 10px' }}>Похожих в библиотеке не найдено.</div>
              )}
              {homologEntries.map(({ entryId, entry, identity }) => {
                const pct = Math.round(identity * 100);
                const linear = entry.payload?.topology === 'linear';
                const c = pct >= 90 ? '#27500A' : (pct >= 70 ? '#633806' : '#791F1F');
                const added = addedEntryIds.has(entryId);
                const disabled = added || atCap;
                return (
                  <button key={entryId} type="button" data-testid={`align-homolog-${entryId}`} disabled={disabled}
                    onClick={disabled ? undefined : () => addLibraryEntry(entry)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', textAlign: 'left', cursor: disabled ? 'default' : 'pointer', opacity: disabled && !added ? 0.5 : 1, border: 'none', borderBottom: '1px solid var(--border-subtle, #e7e5e4)', background: 'transparent', fontSize: 12, color: 'var(--text-primary, #1c1917)' }}>
                    <span style={{ color: 'var(--text-tertiary, #78716c)', display: 'flex' }}>{linear ? <IconLinear /> : <IconCircle />}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                    {added
                      ? <span style={{ fontSize: 11, color: 'var(--accent-700, #b45309)' }}>✓ добавлено</span>
                      : <span style={{ fontSize: 11, fontWeight: 600, color: c }}>{pct}% похоже</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div data-testid="align-lib-picker-host" style={{ marginTop: 8 }}>
            {/* Canonical sequence-picker — same component as assembly/canvas.
                Selecting an entry adds it as an input (slice dedups + caps). */}
            <LibrarySearchBar
              inline
              testId="align-lib-picker"
              libraryEntries={libraryEntriesById}
              projectsById={projectsById}
              currentProjectId={currentProjectId}
              onSelectEntry={({ entry }) => { if (entry) addLibraryEntry(entry); }}
            />
          </div>
        )}

        {fileError && (
          <div data-testid="align-file-error" style={{ fontSize: 11, color: 'var(--danger-fg, #b91c1c)', marginTop: 8 }}>{fileError}</div>
        )}
      </div>
    </div>
  );
}

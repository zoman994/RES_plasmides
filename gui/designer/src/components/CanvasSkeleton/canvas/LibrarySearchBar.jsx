/**
 * LibrarySearchBar — shared library picker used by the assembly editor
 * (AssemblyShellBody) and alignment input (AlignInputPanel).
 *
 * Богатая модель (объединение фич обоих пикеров):
 *   - MiniPlasmidMap-минимапа в строке + dropdown/inline shell;
 *   - фильтр-пилюли Все / Circular / Linear / Primer;
 *   - поиск по имени И по последовательности (ATGC);
 *   - <mark>-подсветка совпадения;
 *   - Избранное / Недавно (persist через picker-prefs.js);
 *   - entry-centric секции: Из проекта · {name} / Коллекция / Другие проекты;
 *   - drag-out с TREE_DRAG_MIME for hosts that accept library drops;
 *   - prop `extraSections` lets a host add domain-specific groups.
 *
 * Режимы:
 *   - dropdown (по умолчанию): input, на focus раскрывается dropdown,
 *     Esc / outside-click закрывают. Used by compact picker surfaces.
 *   - inline (`inline`): список всегда виден (без dropdown). Empty-state
 *     ассемблера.
 *
 * onSelectEntry({kind, id, entry}) — единый колбэк. Библиотечный entry →
 * kind:'library'; extraSection-строки несут свой kind (container/zone/
 * primer).
 */
import {
  useState, useMemo, useEffect, useRef, useCallback,
} from 'react';
// Keep the MIME constant in a dependency-free module; importing the skeleton
// store/layout graph here would bloat the lazy align chunk.
import { TREE_DRAG_MIME } from './tree-drag-mime';
import MiniPlasmidMap from './MiniPlasmidMap';
import {
  getRecent, getFavorites, recordRecent, toggleFavorite,
} from './picker-prefs';
import { useStore } from '../../../store';
// Pure matchers live in a lightweight util now (single source of truth) so
// lighter consumers can reuse them without pulling this whole picker. Imported
// for internal use AND re-exported below for back-compat with existing callers.
import { matchesQuery, matchesType, groupLibraryEntries } from '../../../lib/library-match';
// The smart metadata matcher the rest of the app uses (tree filter, topbar):
// name / tag / type / status / feature / qualifiers via classifyQuery. The picker
// composes it with its own DNA-substring path (see smartMatch below), so a fragment
// can be found by a tag or feature name, not only by its own plasmid name.
import { makeEntryMatcher } from '../../../lib/library-search';
import { Icon } from '../../icons/Icon';

export { matchesQuery, matchesType, groupLibraryEntries };

// Nucleotide alphabet the substring path accepts. Kept to literal A/C/G/T so a
// text query («amp», «экспрессия») routes through the metadata matcher only, while
// a real motif still matches by sequence. Length ≥3 mirrors the old picker's
// «search by sequence» without turning 1–2 char queries into match-everything.
const DNA_SUBSTRING_RE = /^[ACGT]+$/;
function seqOf(entry) {
  return String(entry?.payload?.sequence || entry?.sequence || '').toUpperCase();
}

const TYPE_FILTERS = [
  { id: 'all', label: 'Все', icon: null },
  { id: 'circular', label: 'Circular', icon: 'circular' },
  { id: 'linear', label: 'Linear', icon: 'linear' },
  { id: 'primer', label: 'Primer', icon: 'primer' },
];

// Mirrors file-import.js ACCEPT_STRING. Duplicated as a bare string on
// purpose — importing file-import here would pull genbank-parser +
// auto-annotate into this picker's graph, and this picker is in the
// align lazy chunk (the tree-drag-mime extraction kept it light). The
// actual parsing happens in the CONSUMER via onImportFiles.
const IMPORT_ACCEPT = '.gb,.gbk,.genbank,.dna,.fasta,.fa,.fna';

// Sections expanded by default (library core); other-projects + canvas
// extraSections collapse by default to keep the dropdown scannable.
const DEFAULT_EXPANDED = ['favorites', 'recent', 'project', 'loose'];

function entryDisplay(entry, kind) {
  if (!entry) return { length: 0, topology: 'linear', annotations: [], name: '?' };
  const name = entry.name || entry.id || '(без имени)';
  if (kind === 'library') {
    const p = entry.payload || {};
    return {
      name,
      length: p.length || (p.sequence ? p.sequence.length : 0),
      topology: p.topology || 'linear',
      annotations: Array.isArray(p.annotations) ? p.annotations : [],
    };
  }
  if (kind === 'container') {
    return {
      name,
      length: (entry.sequence ? entry.sequence.length : entry.length) || 0,
      topology: entry.topology?.circular ? 'circular' : (entry.topology || 'linear'),
      annotations: Array.isArray(entry.annotations) ? entry.annotations : [],
    };
  }
  if (kind === 'zone') return { name, length: 0, topology: 'linear', annotations: [] };
  return { name, length: (entry.sequence || '').length, topology: 'linear', annotations: [] };
}

function HighlightedText({ text, query }) {
  const t = String(text || '');
  if (!query || !t) return <span>{t}</span>;
  const idx = t.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <span>{t}</span>;
  return (
    <span>
      {t.slice(0, idx)}
      <mark style={{ background: '#fef08a', color: 'inherit', padding: '0 1px', borderRadius: 2 }}>
        {t.slice(idx, idx + query.length)}
      </mark>
      {t.slice(idx + query.length)}
    </span>
  );
}

function EntryThumbnail({ display, kind }) {
  if (kind === 'primer') {
    return <div data-testid="library-search-thumb-primer" style={styles.thumbPlaceholder} aria-hidden><Icon name="primer" size={16} /></div>;
  }
  if (kind === 'zone') {
    return <div data-testid="library-search-thumb-zone" style={styles.thumbPlaceholder} aria-hidden>🧱</div>;
  }
  return (
    <MiniPlasmidMap
      testId="library-search-thumb-map"
      length={Math.max(1, display.length)}
      annotations={display.annotations}
      circular={display.topology === 'circular'}
      width={32}
      height={32}
      showLabels={false}
    />
  );
}

function PickerRow({
  entry, kind, query, onPick, fav, onToggleFav, sectionTestId,
}) {
  const display = entryDisplay(entry, kind);
  const isLibrary = kind === 'library';
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        data-testid={`${sectionTestId}-item-${entry.id}`}
        onClick={() => onPick({ kind, id: entry.id, entry })}
        draggable={isLibrary}
        onDragStart={(ev) => {
          if (!isLibrary) return;
          try {
            ev.dataTransfer.setData(TREE_DRAG_MIME, entry.id);
            ev.dataTransfer.setData('text/plain', entry.id);
            ev.dataTransfer.effectAllowed = 'copy';
          } catch { /* jsdom dataTransfer */ }
        }}
        style={{ ...styles.row, paddingLeft: isLibrary ? 28 : 8 }}
      >
        <span style={styles.rowThumb}><EntryThumbnail display={display} kind={kind} /></span>
        <span style={styles.rowMain}>
          <span style={styles.rowName}><HighlightedText text={display.name} query={query} /></span>
          <span style={styles.rowMeta}>
            {display.length > 0 ? `${display.length} bp` : '—'}
            {display.topology !== 'linear' && ` · ${display.topology}`}
            {display.annotations.length > 0 && ` · ${display.annotations.length} features`}
          </span>
        </span>
      </button>
      {isLibrary && onToggleFav && (
        <button
          type="button"
          data-testid={`${sectionTestId}-fav-${entry.id}`}
          onClick={(e) => { e.stopPropagation(); onToggleFav(entry.id); }}
          title={fav ? 'Убрать из избранного' : 'Добавить в избранное'}
          style={{ ...styles.favBtn, color: fav ? '#d97706' : 'var(--text-tertiary)' }}
        ><Icon name="star" size={14} filled={fav} /></button>
      )}
    </div>
  );
}

function PickerSection({
  id, title, entries, kind, query, onPick, favSet, onToggleFav,
  expanded, onToggle, testId, badgeFor,
}) {
  const count = entries ? entries.length : 0;
  const disabled = count === 0;
  const isOpen = expanded && !disabled;
  return (
    <div data-testid={testId} data-expanded={isOpen ? 'true' : 'false'} style={styles.section}>
      <button
        type="button"
        data-testid={`${testId}-header`}
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        style={{
          ...styles.sectionHeader,
          cursor: disabled ? 'default' : 'pointer',
          color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)',
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <span style={styles.sectionChevron} aria-hidden>
          {disabled ? '·' : <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={12} />}
        </span>
        <span style={{ flex: 1 }}>{title}</span>
        <span style={styles.sectionCount}>· {count}</span>
      </button>
      {isOpen && entries.map((e) => (
        <div key={e.id} style={{ position: 'relative' }}>
          <PickerRow
            entry={e}
            kind={kind}
            query={query}
            onPick={onPick}
            fav={favSet ? favSet.has(e.id) : false}
            onToggleFav={onToggleFav}
            sectionTestId={testId}
          />
          {badgeFor && badgeFor(e) && (
            <span style={styles.projBadge}>{badgeFor(e)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function LibrarySearchBar({
  libraryEntries,
  projectsById,
  currentProjectId,
  onSelectEntry,
  extraSections = [],
  // SPEC_ASSEMBLY_CUSTOM_SEGMENT §3 (SAFE) — opt-in «вставить свой
  // сиквенс» секция. Только assembly-контекст её передаёт; canvas нет.
  onPasteSequence,
  // Opt-in inline file-import (Игорь 17.06.2026): assembly picker passes
  // this so a .gb/.fasta/.dna can be imported without a detour through
  // the Library. Receives File[]; the consumer parses + adds to the
  // library. Presentational only here (no file-import import).
  onImportFiles,
  inline = false,
  autoFocus = false,
  testId = 'canvas-library-search-bar',
  // V106 (variant D) — opt-in for the CANVAS surface only. When set, this
  // search claims the app-global Ctrl+F (`modals.sequenceSearch`, set by
  // App.jsx) instead of letting it open the viewer-only sequence-search
  // modal that the canvas never renders. The assembly inline picker leaves
  // it false so it doesn't fight LibraryWorkspace for the same flag.
  bindFindHotkey = false,
}) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [pasteValue, setPasteValue] = useState('');
  const [isOpen, setIsOpen] = useState(inline);
  const [expanded, setExpanded] = useState(() => new Set(DEFAULT_EXPANDED));
  const [favIds, setFavIds] = useState(() => getFavorites());
  const [recentIds, setRecentIds] = useState(() => getRecent());
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  // Inline file-import wiring (opt-in via onImportFiles). The component
  // only surfaces the File[]; the consumer parses + persists.
  const emitImport = useCallback((fileList) => {
    if (typeof onImportFiles !== 'function') return;
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    onImportFiles(files);
  }, [onImportFiles]);
  const onFileInputChange = useCallback((e) => {
    emitImport(e.target.files);
    e.target.value = ''; // allow re-importing the same file
  }, [emitImport]);
  const onListDrop = useCallback((e) => {
    if (typeof onImportFiles !== 'function') return;
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || files.length === 0) return; // entry-drag (no files) → ignore
    e.preventDefault();
    e.stopPropagation();
    emitImport(files);
  }, [onImportFiles, emitImport]);
  const onListDragOver = useCallback((e) => {
    if (typeof onImportFiles !== 'function') return;
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault();
    }
  }, [onImportFiles]);

  // V106 (variant D) — claim the global Ctrl+F flag on the canvas. App.jsx's
  // handler sets `modals.sequenceSearch`; on the canvas there's no viewer to
  // consume it, so we focus + open this search and reset the flag. No
  // hotkey-id is registered here (App keeps ownership), so LibraryWorkspace's
  // Ctrl+F is never clobbered.
  const findRequested = useStore((s) => s.modals?.sequenceSearch);
  const closeSequenceSearch = useStore((s) => s.closeSequenceSearch);
  useEffect(() => {
    if (!bindFindHotkey || !findRequested) return;
    setIsOpen(true);
    inputRef.current?.focus();
    closeSequenceSearch?.();
  }, [bindFindHotkey, findRequested, closeSequenceSearch]);

  // Smart query predicate: the shared metadata matcher (name/tag/type/status/
  // feature/qualifiers) OR — for a real nucleotide query — a literal sequence
  // substring. matchesEntry returns false for a bare DNA query (no seq engine on
  // this path), so the substring branch is what keeps «search by sequence» alive.
  const smartMatch = useMemo(() => {
    const q = (query || '').trim();
    const meta = makeEntryMatcher(q);
    const qUp = q.toUpperCase();
    const dnaish = qUp.length >= 3 && DNA_SUBSTRING_RE.test(qUp);
    return (entry) => {
      if (!q) return true;
      if (meta(entry)) return true;
      return dnaish && seqOf(entry).includes(qUp);
    };
  }, [query]);

  const grouped = useMemo(
    () => groupLibraryEntries({
      libraryEntries, currentProjectId, query, typeFilter, matcher: smartMatch,
    }),
    [libraryEntries, currentProjectId, query, typeFilter, smartMatch],
  );

  const favEntries = useMemo(() => favIds
    .map((id) => libraryEntries?.[id])
    .filter((e) => e && !e._pendingDelete && smartMatch(e) && matchesType(e, typeFilter)),
  [favIds, libraryEntries, smartMatch, typeFilter]);
  const recentEntries = useMemo(() => recentIds
    .map((id) => libraryEntries?.[id])
    .filter((e) => e && !e._pendingDelete && smartMatch(e) && matchesType(e, typeFilter)),
  [recentIds, libraryEntries, smartMatch, typeFilter]);

  // Canvas extraSections are name-filtered only (not library-shaped).
  const filteredExtra = useMemo(() => (Array.isArray(extraSections) ? extraSections : []).map((s) => ({
    ...s,
    entries: (Array.isArray(s.entries) ? s.entries : [])
      .filter(Boolean)
      .filter((e) => matchesQuery(e, query))
      .slice(0, 50),
  })), [extraSections, query]);

  const favSet = useMemo(() => new Set(favIds), [favIds]);
  const trimmedQuery = (query || '').trim();

  const allSectionIds = useMemo(() => ([
    'favorites', 'recent', 'project', 'loose', 'other-projects',
    ...filteredExtra.map((s) => s.id),
  ]), [filteredExtra]);

  const counts = useMemo(() => ({
    favorites: favEntries.length,
    recent: recentEntries.length,
    project: grouped.project.length,
    loose: grouped.loose.length,
    'other-projects': grouped.other.length,
    ...Object.fromEntries(filteredExtra.map((s) => [s.id, s.entries.length])),
  }), [favEntries, recentEntries, grouped, filteredExtra]);

  const countsKey = allSectionIds.map((id) => `${id}:${counts[id] || 0}`).join('|');
  // Auto-expand sections with matches while typing; reset to defaults
  // when the query is cleared.
  useEffect(() => {
    if (!trimmedQuery) { setExpanded(new Set(DEFAULT_EXPANDED)); return; }
    const next = new Set(DEFAULT_EXPANDED);
    for (const id of allSectionIds) if ((counts[id] || 0) > 0) next.add(id);
    setExpanded(next);
  }, [trimmedQuery, countsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dropdown mode: close on Esc / outside-click.
  useEffect(() => {
    if (inline || !isOpen) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [inline, isOpen]);

  const onToggleFav = useCallback((entryId) => {
    toggleFavorite(entryId);
    setFavIds(getFavorites());
  }, []);

  const handlePick = useCallback((descriptor) => {
    if (descriptor.kind === 'library') {
      recordRecent(descriptor.id);
      setRecentIds(getRecent());
    }
    if (!inline) setIsOpen(false);
    onSelectEntry?.(descriptor);
  }, [inline, onSelectEntry]);

  const toggleSection = useCallback((sectionId) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(sectionId)) n.delete(sectionId); else n.add(sectionId);
      return n;
    });
  }, []);

  const totalCount = allSectionIds.reduce((sum, id) => sum + (counts[id] || 0), 0);
  const projectName = currentProjectId
    ? (projectsById?.[currentProjectId]?.name || currentProjectId)
    : null;
  const badgeForOther = useCallback(
    (e) => (projectsById?.[e.projectId]?.name || e.projectId || ''),
    [projectsById],
  );

  const pasteClean = pasteValue.replace(/\s+/g, '').toUpperCase();
  const pasteValid = pasteClean.length > 0 && /^[ACGT]+$/.test(pasteClean);
  const pasteInvalid = pasteClean.length > 0 && !pasteValid;
  const submitPaste = useCallback(() => {
    const clean = pasteValue.replace(/\s+/g, '').toUpperCase();
    if (!clean || !/^[ACGT]+$/.test(clean)) return;
    onPasteSequence?.(clean);
    setPasteValue('');
  }, [pasteValue, onPasteSequence]);

  const sections = (
    <>
      {typeof onImportFiles === 'function' && (
        <div data-testid={`${testId}-import-section`} style={styles.importSection}>
          <input
            ref={fileInputRef}
            type="file"
            accept={IMPORT_ACCEPT}
            multiple
            data-testid={`${testId}-import-input`}
            style={{ display: 'none' }}
            onChange={onFileInputChange}
          />
          <button
            type="button"
            data-testid={`${testId}-import-btn`}
            onClick={() => fileInputRef.current?.click()}
            style={styles.importBtn}
          ><Icon name="import" size={13} />Импортировать файл (.gb · .fasta · .dna)</button>
          <span style={styles.importHint}>или перетащите файл сюда</span>
        </div>
      )}
      {totalCount === 0 && (
        <div data-testid={`${testId}-empty`} style={styles.empty}>
          {trimmedQuery ? 'Ничего не найдено.' : 'Начните вводить — найду плазмиду в библиотеке или в проекте.'}
        </div>
      )}
      <PickerSection
        id="favorites" title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Избранное <Icon name="star" size={11} filled /></span>} entries={favEntries} kind="library"
        query={query} onPick={handlePick} favSet={favSet} onToggleFav={onToggleFav}
        expanded={expanded.has('favorites')} onToggle={() => toggleSection('favorites')}
        testId={`${testId}-section-favorites`}
      />
      <PickerSection
        id="recent" title="Недавно" entries={recentEntries} kind="library"
        query={query} onPick={handlePick} favSet={favSet} onToggleFav={onToggleFav}
        expanded={expanded.has('recent')} onToggle={() => toggleSection('recent')}
        testId={`${testId}-section-recent`}
      />
      <PickerSection
        id="project" title={projectName ? `Из проекта · ${projectName}` : 'Из проекта'}
        entries={grouped.project} kind="library"
        query={query} onPick={handlePick} favSet={favSet} onToggleFav={onToggleFav}
        expanded={expanded.has('project')} onToggle={() => toggleSection('project')}
        testId={`${testId}-section-project`}
      />
      <PickerSection
        id="loose" title="Коллекция" entries={grouped.loose} kind="library"
        query={query} onPick={handlePick} favSet={favSet} onToggleFav={onToggleFav}
        expanded={expanded.has('loose')} onToggle={() => toggleSection('loose')}
        testId={`${testId}-section-loose`}
      />
      <PickerSection
        id="other-projects" title="Другие проекты" entries={grouped.other} kind="library"
        query={query} onPick={handlePick} favSet={favSet} onToggleFav={onToggleFav}
        expanded={expanded.has('other-projects')} onToggle={() => toggleSection('other-projects')}
        testId={`${testId}-section-other-projects`} badgeFor={badgeForOther}
      />
      {filteredExtra.map((s) => (
        <PickerSection
          key={s.id} id={s.id} title={s.title} entries={s.entries} kind={s.kind || 'container'}
          query={query} onPick={handlePick} favSet={null} onToggleFav={null}
          expanded={expanded.has(s.id)} onToggle={() => toggleSection(s.id)}
          testId={`${testId}-section-${s.id}`}
        />
      ))}
      {typeof onPasteSequence === 'function' && (
        <div data-testid={`${testId}-paste-section`} style={styles.pasteSection}>
          <div style={styles.pasteHeader}>Вставить свой сиквенс</div>
          <textarea
            data-testid={`${testId}-paste-input`}
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            placeholder="ATGC… (только A/C/G/T)"
            rows={3}
            style={{
              ...styles.pasteInput,
              borderColor: pasteInvalid ? '#dc2626' : 'var(--border-default, #d6d3d1)',
            }}
          />
          <div style={styles.pasteFooter}>
            <span data-testid={`${testId}-paste-counter`} style={styles.pasteCounter}>
              {pasteClean.length} bp
            </span>
            {pasteInvalid && (
              <span data-testid={`${testId}-paste-invalid`} style={styles.pasteInvalidMsg}>
                Только A / C / G / T
              </span>
            )}
            <button
              type="button"
              data-testid={`${testId}-paste-confirm`}
              onClick={submitPaste}
              disabled={!pasteValid}
              style={{
                ...styles.pasteConfirm,
                opacity: pasteValid ? 1 : 0.5,
                cursor: pasteValid ? 'pointer' : 'not-allowed',
              }}
            >Вставить сегмент</button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div ref={wrapRef} data-testid={testId} style={inline ? styles.wrapInline : styles.wrap}>
      <input
        ref={inputRef}
        type="search"
        data-testid={`${testId}-input`}
        value={query}
        onChange={(e) => { setQuery(e.target.value); if (!inline) setIsOpen(true); }}
        onFocus={() => { if (!inline) setIsOpen(true); }}
        placeholder="🔍 Поиск: имя · тег · фича · последовательность (ATGC…)"
        style={styles.input}
      />
      <div style={styles.filters}>
        {TYPE_FILTERS.map((f) => {
          const active = typeFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              data-testid={`${testId}-filter-${f.id}`}
              onClick={() => setTypeFilter(f.id)}
              style={{
                ...styles.filterPill,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: `1px solid ${active ? 'var(--accent-500, #d97706)' : 'var(--border-default, #d6d3d1)'}`,
                background: active ? 'var(--accent-50, #fef3c7)' : 'var(--surface-1)',
                color: active ? 'var(--accent-700, #b45309)' : 'var(--text-secondary)',
                fontWeight: active ? 600 : 400,
              }}
            >{f.icon && <Icon name={f.icon} size={12} />}{f.label}</button>
          );
        })}
      </div>
      {inline ? (
        <div
          data-testid={`${testId}-list`}
          style={styles.inlineList}
          onDrop={onListDrop}
          onDragOver={onListDragOver}
        >{sections}</div>
      ) : (
        isOpen && (
          <div
            data-testid={`${testId}-dropdown`}
            style={styles.dropdown}
            onDrop={onListDrop}
            onDragOver={onListDragOver}
          >{sections}</div>
        )
      )}
    </div>
  );
}

const styles = {
  wrap: {
    position: 'relative', padding: '8px 12px', background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
  },
  wrapInline: {
    position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0,
    flex: 1, width: '100%', maxWidth: 560, margin: '0 auto',
    background: 'var(--surface-1)', border: '1px solid var(--border-default, #d6d3d1)',
    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', overflow: 'hidden',
  },
  input: {
    width: '100%', padding: '8px 12px', fontSize: 12.5,
    border: '1px solid var(--border-subtle)', borderRadius: 6,
    background: 'var(--surface-1)', color: 'var(--text-primary)', outline: 'none',
    boxSizing: 'border-box',
  },
  filters: { display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  filterPill: { padding: '3px 8px', borderRadius: 999, fontSize: 10.5, cursor: 'pointer' },
  dropdown: {
    position: 'absolute', top: 'calc(100% - 1px)', left: 12, right: 12, zIndex: 60,
    maxHeight: 460, overflowY: 'auto', background: 'var(--surface-1)',
    border: '1px solid var(--border-subtle)', borderRadius: 6,
    boxShadow: '0 6px 18px rgba(28,25,23,0.18)', padding: 6,
  },
  inlineList: { flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 8 },
  empty: { padding: 12, fontSize: 11.5, color: 'var(--text-tertiary)' },
  importSection: {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    marginBottom: 6, padding: '8px', background: 'var(--surface-2)',
    border: '1px dashed var(--border-default, #d6d3d1)', borderRadius: 4,
  },
  importBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', fontSize: 11.5, fontWeight: 600,
    background: 'var(--surface-1)', color: 'var(--accent-700, #b45309)',
    border: '1px solid var(--accent-300, #fcd34d)', borderRadius: 4, cursor: 'pointer',
  },
  importHint: { fontSize: 10.5, color: 'var(--text-tertiary)' },
  section: { marginBottom: 4 },
  sectionHeader: {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px',
    background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 4,
    fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'left',
  },
  sectionChevron: {
    fontSize: 9, color: 'var(--text-tertiary)', minWidth: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  sectionCount: { fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500, marginLeft: 4 },
  row: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px',
    background: 'var(--surface-1)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 4,
    cursor: 'pointer', marginTop: 3, textAlign: 'left', fontSize: 12,
  },
  rowThumb: {
    flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  rowMain: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 },
  rowName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 12 },
  rowMeta: { color: 'var(--text-tertiary)', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  favBtn: {
    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
    background: 'transparent', border: 'none', fontSize: 14, cursor: 'pointer', padding: 2, lineHeight: 1,
  },
  projBadge: {
    position: 'absolute', right: 10, top: 8, fontSize: 9.5, color: 'var(--text-tertiary)',
    pointerEvents: 'none', background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 2,
  },
  thumbPlaceholder: {
    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: '50%', fontSize: 14,
  },
  pasteSection: {
    marginTop: 6, padding: '8px', background: 'var(--surface-2)',
    border: '1px solid var(--border-subtle)', borderRadius: 4,
  },
  pasteHeader: {
    fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
    color: 'var(--text-secondary)', marginBottom: 6,
  },
  pasteInput: {
    width: '100%', padding: '6px 8px', fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    border: '1px solid var(--border-default, #d6d3d1)', borderRadius: 4,
    background: 'var(--surface-1)', color: 'var(--text-primary)', boxSizing: 'border-box', resize: 'vertical',
  },
  pasteFooter: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 },
  pasteCounter: { fontSize: 10.5, color: 'var(--text-tertiary)' },
  pasteInvalidMsg: { fontSize: 10.5, color: '#dc2626', flex: 1 },
  pasteConfirm: {
    marginLeft: 'auto', padding: '5px 12px', fontSize: 11.5,
    background: 'var(--accent-500, #b85c3e)', color: '#fff', fontWeight: 600,
    border: '1px solid var(--accent-500, #b85c3e)', borderRadius: 4,
  },
};

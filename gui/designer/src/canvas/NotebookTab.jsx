/**
 * NotebookTab — host component that ties together NotebookList +
 * NotebookSearch + NotebookEntryEditor + NotebookRefPickerModal.
 *
 * Spec §K16 (under Igor's responsibility): this tab gets lazy-loaded
 * into CanvasLayoutView / EditorWindowShell. To keep the change
 * surface small, the tab ships here as a standalone composer that
 * receives notebook state + entity state via props. The CanvasLayoutView
 * integration is a follow-up wiring task — once Igor wants the tab
 * visible in his main canvas, mount this component there.
 *
 * Props:
 *   notebookEntries        — Array of notebook entries (from state).
 *   attachments            — Map<attId, {blobUrl, blob, manifest}>.
 *   entityState            — { containers, zones, pieces, operations, primers, externalRefs }.
 *   onChange(entries)      — propagate updated entries array.
 *   onCreateEntry()        — create new entry (parent decides shape).
 *   onAttachmentAdded({attId}) — notify parent of new attachment.
 *   onRefNavigate({kind,id}) — react to clicked @@ref badges
 *                              (open container editor / focus zone / etc).
 */
import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import NotebookList from './NotebookList';
import NotebookSearch from './NotebookSearch';
import NotebookRefPickerModal from './NotebookRefPickerModal';
import { useMarkdownRefResolver } from '../hooks/useMarkdownRefResolver';

// Lazy-load the editor + markdown stack so biolog without notebook open
// doesn't pay the ~60 KB markdown bundle on first paint (spec §13).
const NotebookEntryEditor = lazy(() => import('./NotebookEntryEditor'));

export default function NotebookTab({
  notebookEntries = [],
  attachments,
  entityState,
  onChange,
  onCreateEntry,
  onAttachmentAdded,
  onRefNavigate,
  testId = 'notebook-tab',
}) {
  // Drive @@ref display labels from entityState (containers/zones/etc).
  useMarkdownRefResolver(entityState);

  const [activeEntryId, setActiveEntryId] = useState(notebookEntries[0]?.id || null);
  const [filtered, setFiltered] = useState(notebookEntries);
  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const [refPickerResolve, setRefPickerResolve] = useState(null);

  const activeEntry = useMemo(
    () => notebookEntries.find(e => e.id === activeEntryId) || notebookEntries[0] || null,
    [notebookEntries, activeEntryId],
  );

  const handleSelect = useCallback((entry) => {
    setActiveEntryId(entry.id);
  }, []);

  const handleEntryChange = useCallback((updatedEntry) => {
    if (typeof onChange !== 'function') return;
    const next = notebookEntries.map(e => e.id === updatedEntry.id ? updatedEntry : e);
    onChange(next);
  }, [notebookEntries, onChange]);

  const handleCreate = useCallback(() => {
    if (typeof onCreateEntry === 'function') {
      const newId = onCreateEntry();
      if (typeof newId === 'string') setActiveEntryId(newId);
    }
  }, [onCreateEntry]);

  const handleRefPicker = useCallback(() => {
    setRefPickerOpen(true);
    return new Promise((resolve) => {
      setRefPickerResolve(() => resolve);
    });
  }, []);

  const handleRefPicked = useCallback((picked) => {
    setRefPickerOpen(false);
    refPickerResolve?.(picked);
    setRefPickerResolve(null);
  }, [refPickerResolve]);

  const handleRefPickerCancel = useCallback(() => {
    setRefPickerOpen(false);
    refPickerResolve?.(null);
    setRefPickerResolve(null);
  }, [refPickerResolve]);

  return (
    <div data-testid={testId} style={styles.shell}>
      <div style={styles.sidebar}>
        <NotebookSearch entries={notebookEntries} onFiltered={setFiltered} />
        <NotebookList
          entries={filtered}
          activeEntryId={activeEntryId}
          onSelect={handleSelect}
          onCreate={handleCreate}
        />
      </div>
      <div style={styles.main}>
        {activeEntry ? (
          <Suspense fallback={<div style={styles.spinner}>Загрузка редактора…</div>}>
            <NotebookEntryEditor
              entry={activeEntry}
              attachments={attachments}
              onChange={handleEntryChange}
              onAttachmentAdded={onAttachmentAdded}
              onRefPicker={handleRefPicker}
              onRefClick={onRefNavigate}
            />
          </Suspense>
        ) : (
          <div data-testid="notebook-empty" style={styles.empty}>
            Нет открытой записи. Создайте новую через «+ Запись».
          </div>
        )}
      </div>
      {refPickerOpen && (
        <NotebookRefPickerModal
          state={entityState}
          onPick={handleRefPicked}
          onCancel={handleRefPickerCancel}
        />
      )}
    </div>
  );
}

const styles = {
  shell: { display: 'flex', height: '100%', background: 'var(--surface-1)' },
  sidebar: { width: 280, display: 'flex', flexDirection: 'column',
    borderRight: '1px solid var(--border-subtle)' },
  main: { flex: 1, display: 'flex', flexDirection: 'column' },
  empty: { padding: 24, fontSize: 12.5, color: 'var(--text-tertiary)' },
  spinner: { padding: 24, fontSize: 12.5, color: 'var(--text-secondary)' },
};

import { useEffect } from 'react';
import { useStore, selectVisibleLibraryEntries } from '../../store';
import { STRINGS } from '../../lib/strings';
import LibraryToolbar from './LibraryToolbar';
import LibraryListRow from './LibraryListRow';

export default function Library() {
  const hydrateLibrary = useStore(s => s.hydrateLibrary);
  const libraryEntries = useStore(s => s.libraryEntries);
  const filterKind = useStore(s => s.filterKind);
  const filterTopology = useStore(s => s.filterTopology);
  const entries = selectVisibleLibraryEntries({ libraryEntries, filterKind, filterTopology });

  useEffect(() => {
    hydrateLibrary().catch(err => {
      // eslint-disable-next-line no-console
      console.error('[bodgegene] hydrateLibrary failed', err);
    });
  }, [hydrateLibrary]);

  return (
    <div
      data-testid="library-fullscreen"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--surface-base, #fafaf9)',
      }}
    >
      <LibraryToolbar />
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {entries.length === 0 ? (
          <div
            data-testid="library-empty"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 40,
              fontSize: 13,
              color: 'var(--text-tertiary)',
              fontStyle: 'italic',
              textAlign: 'center',
            }}
          >
            {STRINGS.library.empty}
          </div>
        ) : (
          entries.map(entry => (
            <LibraryListRow key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}

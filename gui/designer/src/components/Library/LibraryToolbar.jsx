import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';

export default function LibraryToolbar() {
  const filterKind = useStore(s => s.filterKind);
  const filterTopology = useStore(s => s.filterTopology);
  const setLibraryFilterKind = useStore(s => s.setLibraryFilterKind);
  const setLibraryFilterTopology = useStore(s => s.setLibraryFilterTopology);

  const tabBtnStyle = (active) => ({
    padding: '6px 14px',
    fontSize: 13,
    border: '0.5px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    background: active ? 'var(--accent-50)' : 'transparent',
    color: active ? 'var(--accent-text)' : 'var(--text-primary)',
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
  });

  return (
    <div
      data-testid="library-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 18px',
        borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-1, #ffffff)',
      }}
    >
      <div role="tablist" style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          role="tab"
          aria-selected={filterKind === 'container'}
          data-testid="library-tab-containers"
          onClick={() => setLibraryFilterKind('container')}
          style={tabBtnStyle(filterKind === 'container')}
        >{STRINGS.library.tabContainers}</button>
        <button
          type="button"
          role="tab"
          aria-selected={filterKind === 'primer'}
          data-testid="library-tab-primers"
          onClick={() => setLibraryFilterKind('primer')}
          style={tabBtnStyle(filterKind === 'primer')}
        >{STRINGS.library.tabPrimers}</button>
      </div>

      {filterKind === 'container' && (
        <select
          data-testid="library-topology-filter"
          value={filterTopology}
          onChange={(e) => setLibraryFilterTopology(e.target.value)}
          style={{
            padding: '6px 10px',
            fontSize: 13,
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-2)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <option value="all">{STRINGS.library.topologyAll}</option>
          <option value="circular">{STRINGS.library.topologyCircular}</option>
          <option value="linear">{STRINGS.library.topologyLinear}</option>
        </select>
      )}

      <div style={{ flex: 1 }} />

      <button
        type="button"
        disabled
        data-testid="library-import-button"
        title={STRINGS.library.importDisabledTooltip}
        style={{
          padding: '6px 14px',
          fontSize: 13,
          border: '0.5px dashed var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'transparent',
          color: 'var(--text-tertiary)',
          cursor: 'not-allowed',
        }}
      >{STRINGS.library.importButton}</button>
    </div>
  );
}

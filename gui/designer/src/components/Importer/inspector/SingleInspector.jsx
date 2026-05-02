import { STRINGS } from '../../../lib/strings';

const S = STRINGS.importer;

/**
 * SingleInspector — title + TabBar + active tab content (M-B.2 K1
 * placeholder; full Overview / Sequence / Annotations / History tabs land
 * in K3 + K4).
 *
 * K1 ships:
 *   - title (read-only display; InlineEditableTitle in K3)
 *   - subtitle (length · topology · regionCount)
 *   - TabBar with 3 tabs (Обзор / Последовательность / Аннотации) — История
 *     conditional (rendered only if commits.length>0; always false in K1).
 *   - Tab content panels: overview text-aggregate placeholder, sequence
 *     placeholder, annotations placeholder (real wiring in K3/K4).
 *
 * Critical: tab panels use conditional render (`{activeTab === 'sequence'
 * && ...}`) — heavy components that ship in K4 must NOT exist in DOM until
 * activeTab matches. This is the V49 50-sec hang fix scaffold.
 */
export default function SingleInspector({
  item,
  flags, // eslint-disable-line no-unused-vars
  edits, // eslint-disable-line no-unused-vars
  activeTab,
  onActiveTabChange,
  onUpdateFlags, // eslint-disable-line no-unused-vars
  onUpdateEdits, // eslint-disable-line no-unused-vars
  onAppendAdded, // eslint-disable-line no-unused-vars
}) {
  if (!item) return null;
  const length = item.length || item.sequence?.length || 0;
  const topology = item.topology || 'linear';
  const regionCount = Array.isArray(item.annotations) ? item.annotations.length : 0;
  const showHistory = Array.isArray(item.commits) && item.commits.length > 0;

  return (
    <div
      data-testid="importer-single-inspector"
      data-current-file={item._fileName}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <div
        data-testid="importer-single-title"
        style={{
          padding: '10px 14px',
          borderBottom: '0.5px solid var(--border-subtle)',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {item.name || item._fileName || S.untitledItem}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {length.toLocaleString()} bp · {topology}{regionCount > 0 && ` · ${S.summaryRegionCount(regionCount)}`}
        </div>
      </div>

      <TabBar
        activeTab={activeTab}
        onChange={onActiveTabChange}
        showHistory={showHistory}
      />

      <div
        data-testid="importer-single-tab-content"
        style={{ flex: 1, overflowY: 'auto', padding: 14, minHeight: 0 }}
      >
        {activeTab === 'overview' && (
          <div data-testid="importer-tab-panel-overview" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {S.tabOverviewPlaceholderK1}
          </div>
        )}
        {activeTab === 'sequence' && (
          <div data-testid="importer-tab-panel-sequence" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {S.tabSequencePlaceholderK1}
          </div>
        )}
        {activeTab === 'annotations' && (
          <div data-testid="importer-tab-panel-annotations" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {S.tabAnnotationsPlaceholderK1}
          </div>
        )}
        {activeTab === 'history' && showHistory && (
          <div data-testid="importer-tab-panel-history" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {S.tabHistoryPlaceholder}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBar({ activeTab, onChange, showHistory }) {
  const tabs = [
    { id: 'overview', label: S.tabOverview },
    { id: 'sequence', label: S.tabSequence },
    { id: 'annotations', label: S.tabAnnotations },
  ];
  if (showHistory) tabs.push({ id: 'history', label: S.tabHistory });

  return (
    <div
      data-testid="importer-tab-bar"
      role="tablist"
      style={{
        display: 'flex', gap: 0,
        borderBottom: '0.5px solid var(--border-subtle)',
        background: 'var(--surface-2, #f5f5f4)',
      }}
    >
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={activeTab === t.id}
          data-testid={`importer-tab-${t.id}`}
          data-active={activeTab === t.id ? 'true' : 'false'}
          onClick={() => onChange?.(t.id)}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            background: activeTab === t.id ? 'var(--surface-1)' : 'transparent',
            color: activeTab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: 'none',
            borderRight: '0.5px solid var(--border-subtle)',
            borderBottom: activeTab === t.id ? '2px solid var(--accent-500)' : '2px solid transparent',
            fontWeight: activeTab === t.id ? 500 : 400,
            cursor: 'pointer',
            marginBottom: -1,
          }}
        >{t.label}</button>
      ))}
    </div>
  );
}

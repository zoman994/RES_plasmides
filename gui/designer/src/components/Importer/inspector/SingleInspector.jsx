import { STRINGS } from '../../../lib/strings';
import InlineEditableTitle from './InlineEditableTitle';
import TabBar from './tabs/TabBar';
import OverviewTab from './tabs/OverviewTab';
import { getRegions } from '../../../annotation-model';

const S = STRINGS.importer;

/**
 * SingleInspector — wrapper for the active parsedItem (M-B.2 K3).
 *
 * Layout:
 *   [title row — InlineEditableTitle + subtitle (length · topology · regions)]
 *   [TabBar — Обзор · Последовательность · Аннотации (· История conditional)]
 *   [active tab content — OverviewTab eager; SequenceTab + AnnotationsTab
 *    + HistoryTab land in K4 with lazy mount that fixes V49 50-sec hang]
 *
 * MetaColumn renders sibling-of-this in Importer/index.jsx (the 4-region
 * layout has CatalogColumn / Inspector / MetaColumn — Inspector wraps title
 * + tabs only).
 */
export default function SingleInspector({
  item,
  flags, // eslint-disable-line no-unused-vars
  edits, // eslint-disable-line no-unused-vars
  activeTab,
  onActiveTabChange,
  onUpdateFlags, // eslint-disable-line no-unused-vars
  onUpdateEdits,
  onAppendAdded, // eslint-disable-line no-unused-vars
  onRenameItem,
}) {
  if (!item) return null;
  const length = item.length || item.sequence?.length || 0;
  const topology = item.topology || 'linear';
  const regionCount = getRegions(item.annotations || []).length;
  const showHistory = Array.isArray(item.commits) && item.commits.length > 0;
  // Use edited annotations if present (live edit), otherwise fall back to file's.
  const displayAnnotations = Array.isArray(edits?.editedAnnotations)
    ? edits.editedAnnotations
    : (item.annotations || []);
  const displayItem = { ...item, annotations: displayAnnotations };

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
          background: 'var(--surface-1)',
        }}
      >
        <InlineEditableTitle
          value={item.name || item._fileName || ''}
          onCommit={(name) => onRenameItem?.(name)}
        />
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
          {length.toLocaleString()} п.н. · {topology}
          {regionCount > 0 && ` · ${S.summaryRegionCount(regionCount)}`}
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
        {activeTab === 'overview' && <OverviewTab item={displayItem} />}
        {/* SequenceTab + AnnotationsTab + HistoryTab land in K4 — lazy
            mount keeps V49 fix invariant: heavy components don't exist in
            DOM until activeTab matches. K3 stub kept here so the orchestra-
            tor still mounts something for non-overview activeTab values. */}
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

// onUpdateEdits surface stays available for K4 AnnotationsTab; suppress lint.
// eslint-disable-next-line no-unused-vars
function _onUpdateEditsRef(p) { return p; }

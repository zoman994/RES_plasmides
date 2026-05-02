import { STRINGS } from '../../../lib/strings';
import InlineEditableTitle from './InlineEditableTitle';
import TagsEditor from './TagsEditor';
import TabBar from './tabs/TabBar';
import OverviewTab from './tabs/OverviewTab';
import SequenceTab from './tabs/SequenceTab';
import AnnotationsTab from './tabs/AnnotationsTab';
import HistoryTab from './tabs/HistoryTab';
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
      {/* Title row compacted (Medium polish): padding 10/14 → 6/14, title +
          subtitle on a single flex row with subtitle right-aligned to the
          left of free space (saves ~26px vertical). TagsEditor stays on
          its own row underneath. */}
      <div
        data-testid="importer-single-title"
        style={{
          padding: '6px 14px 8px',
          borderBottom: '0.5px solid var(--border-subtle)',
          background: 'var(--surface-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineEditableTitle
              value={item.name || item._fileName || ''}
              onCommit={(name) => onRenameItem?.(name)}
            />
          </div>
          <div
            style={{
              fontSize: 11, color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)', flexShrink: 0,
            }}
          >
            {length.toLocaleString()} п.н. · {topology}
            {regionCount > 0 && ` · ${S.summaryRegionCount(regionCount)}`}
          </div>
        </div>
        <TagsEditor
          tags={Array.isArray(edits?.editedTags) ? edits.editedTags : []}
          onChange={(next) => onUpdateEdits?.({ editedTags: next })}
        />
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
        {/* Tab panels: lazy-mount via React conditional render. Heavy
            components (SequenceMapView, AnnotationEditor) only exist in
            DOM when their tab is active — that's the V49 50-sec hang fix.
            On switch back to overview both tabs unmount and DOM nodes
            destroy. */}
        {activeTab === 'overview' && <OverviewTab item={displayItem} />}
        {activeTab === 'sequence' && (
          <SequenceTab
            sequence={edits?.editedSequence ?? item.sequence}
            annotations={displayAnnotations}
            topology={item.topology || 'linear'}
            name={item.name || item._fileName}
          />
        )}
        {activeTab === 'annotations' && (
          <AnnotationsTab
            annotations={displayAnnotations}
            seqLength={length}
            onUpdateEdits={onUpdateEdits}
          />
        )}
        {activeTab === 'history' && showHistory && (
          <HistoryTab commits={item.commits || []} />
        )}
      </div>
    </div>
  );
}

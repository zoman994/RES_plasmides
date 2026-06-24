/**
 * EditorTabStrip — multi-tab breadcrumb strip for the editor window.
 *
 * F1 M-CANVAS-WINDOW (DEC-CANVAS-WIN-01/02/09) + F3 M-CANVAS-PCR
 * (DEC-CANVAS-PCR-10): container tabs `📦 <name>` (+🔒 frozen); operation
 * tabs `<icon> <KIND> · <inputs>`.
 *
 * Two resolution modes, chosen by a stable prop:
 *   - prop mode  (`containers` array passed) — pure, no store hooks.
 *     Used by EditorWindowShell + standalone tests.
 *   - store mode (no `containers`) — resolves via useContainerById.
 *     Back-compat for F1 standalone strip tests.
 */
import { useContainerById, useSkeletonState } from '../store/skeleton-context';
import { selectAssemblyTarget } from '../store/selectors-pieces';
import { STRINGS } from '../../../lib/strings';
import { Icon } from '../../icons/Icon';

const OP_ICONS = {
  pcr: 'pcr', cut: 'digest', gibson: 'mix', ligate: 'ligate', kld: 'ligate', mutagenesis: 'mutagenesis',
};

function opIconName(op) {
  return (op && OP_ICONS[op.kind]) || 'pcr';
}

function opText(op, containers) {
  const names = (op?.inputs || [])
    .map((id) => {
      const c = (containers || []).find((x) => x.id === id);
      return c ? c.name : id;
    })
    .join(' + ');
  return `${String((op && op.kind) || 'op').toUpperCase()}${names ? ` · ${names}` : ''}`;
}

function TabButtonView({ tab, active, label, icon, frozen, onSwitch, onClose }) {
  const ew = (STRINGS.canvasSkeleton && STRINGS.canvasSkeleton.editorWindow) || {};
  return (
    <button
      type="button"
      role="tab"
      data-testid="editor-tab"
      data-tab-id={tab.id}
      data-tab-kind={tab.kind || 'container'}
      data-active={active ? 'true' : 'false'}
      aria-selected={active ? 'true' : 'false'}
      onClick={() => onSwitch(tab.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        maxWidth: 240,
        padding: '6px 8px 6px 12px',
        fontSize: 12,
        cursor: 'pointer',
        border: 'none',
        borderRight: '1px solid var(--border-subtle)',
        borderBottom: active
          ? '2px solid var(--accent-500, #d97706)'
          : '2px solid transparent',
        background: active ? 'var(--surface-1)' : 'var(--surface-2)',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: active ? 600 : 400,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {icon && <Icon name={icon} size={13} style={{ display: 'inline-block', verticalAlign: '-2px', flexShrink: 0 }} />}
        {label}
      </span>
      {frozen && (
        <span
          data-testid="editor-tab-frozen"
          title={ew.tabFrozenBadge || 'Frozen'}
          style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}
        >
          <Icon name="lock" size={11} />
        </span>
      )}
      <span
        data-testid="editor-tab-close"
        role="button"
        tabIndex={0}
        aria-label={ew.tabClose || 'Закрыть вкладку'}
        title={ew.tabClose || 'Закрыть вкладку'}
        onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            onClose(tab.id);
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 2,
          padding: '0 4px',
          borderRadius: 4,
          lineHeight: 1.4,
          color: 'var(--text-tertiary, var(--text-secondary))',
          cursor: 'pointer',
        }}
      >
        <Icon name="close" size={13} />
      </span>
    </button>
  );
}

function ph() {
  const ew = (STRINGS.canvasSkeleton && STRINGS.canvasSkeleton.editorWindow) || {};
  return ew.placeholderTabLabel || '(пустой)';
}

function asmLabel(draft) {
  return `🧬 ${(draft && draft.name) || ph()}`;
}

/**
 * V90 — resolve an assembly tab's draft via the SAME dual-resolve path
 * AssemblyModeShell + SegmentDetailPanel use (zone id OR legacy
 * assemblyDrafts). Before this, EditorTabStrip looked only in
 * `assemblyDrafts` and zone-based tabs fell back to «(пустой)» even
 * when the zone existed with a proper name.
 */
function resolveAssemblyDraft(state, targetId) {
  if (!state || !targetId) return null;
  const { draft } = selectAssemblyTarget(state, targetId);
  return draft;
}

function StoreTab({ tab, active, onSwitch, onClose }) {
  const state = useSkeletonState();
  const container = useContainerById(
    (tab.kind === 'operation' || tab.kind === 'assembly') ? null : tab.containerId,
  );
  if (tab.kind === 'assembly') {
    const d = resolveAssemblyDraft(state, tab.assemblyDraftId);
    return (
      <TabButtonView
        tab={tab} active={active} label={asmLabel(d)} icon="dna"
        frozen={false} onSwitch={onSwitch} onClose={onClose}
      />
    );
  }
  if (tab.kind === 'operation') {
    const op = state.operations.find((o) => o.id === tab.operationId);
    return (
      <TabButtonView
        tab={tab} active={active} label={opText(op, state.containers)} icon={opIconName(op)}
        frozen={false} onSwitch={onSwitch} onClose={onClose}
      />
    );
  }
  return (
    <TabButtonView
      tab={tab} active={active}
      label={(container && container.name) || ph()} icon="container"
      frozen={!!(container && container.frozen)}
      onSwitch={onSwitch} onClose={onClose}
    />
  );
}

function PropTab({
  tab, active, containers, operations, assemblyDrafts, zones, pieces, onSwitch, onClose,
}) {
  if (tab.kind === 'assembly') {
    // V90 — dual-resolve assembly tab: zone id → projected name, fallback
    // to legacy assemblyDrafts. Same path as AssemblyModeShell so tab
    // never lags behind editor content.
    const synthState = {
      assemblyDrafts: assemblyDrafts || [],
      zones: zones || [],
      pieces: pieces || [],
      containers: containers || [],
      operations: operations || [],
    };
    const d = resolveAssemblyDraft(synthState, tab.assemblyDraftId);
    return (
      <TabButtonView
        tab={tab} active={active} label={asmLabel(d)} icon="dna"
        frozen={false} onSwitch={onSwitch} onClose={onClose}
      />
    );
  }
  if (tab.kind === 'operation') {
    const op = (operations || []).find((o) => o.id === tab.operationId);
    return (
      <TabButtonView
        tab={tab} active={active} label={opText(op, containers)} icon={opIconName(op)}
        frozen={false} onSwitch={onSwitch} onClose={onClose}
      />
    );
  }
  const c = (containers || []).find((x) => x.id === tab.containerId);
  return (
    <TabButtonView
      tab={tab} active={active}
      label={(c && c.name) || ph()} icon="container"
      frozen={!!(c && c.frozen)}
      onSwitch={onSwitch} onClose={onClose}
    />
  );
}

export default function EditorTabStrip({
  tabs, activeTabId, containers, operations, assemblyDrafts, zones, pieces,
  onSwitch, onClose,
}) {
  if (!Array.isArray(tabs) || tabs.length === 0) return null;
  const propMode = Array.isArray(containers);
  return (
    <div
      data-testid="editor-tab-strip"
      role="tablist"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        overflowX: 'auto',
        minWidth: 0,
        flex: 1,
        background: 'var(--surface-2)',
      }}
    >
      {tabs.map((tab) => (propMode ? (
        <PropTab
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          containers={containers}
          operations={operations}
          assemblyDrafts={assemblyDrafts}
          zones={zones}
          pieces={pieces}
          onSwitch={onSwitch}
          onClose={onClose}
        />
      ) : (
        <StoreTab
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          onSwitch={onSwitch}
          onClose={onClose}
        />
      )))}
    </div>
  );
}

/**
 * VersionLineageNode — collapses a whole version lineage into ONE tree row
 * (the redesign's core fix for «версии плодятся в библиотеке»). The head row
 * is the lineage representative (current head molecule) carrying a «vN»
 * version badge, a member count, and — when the lineage forked — a ⑂ branch
 * marker. Expanding reveals the full version stack (mainline) followed by the
 * branches, each reusing TreeItemRow so selection / rename / delete come for
 * free.
 *
 * Structural model from `collectLineage` (lib/version-lineage.js): versions =
 * the linear mainline (root→head), branches = divergent variants kept
 * alongside. Only VISIBLE members (the group's `members`) are rendered.
 */
import { memo, useMemo } from 'react';
import { Icon } from '../../icons/Icon';
import PlasmidMiniMap from '../../PlasmidMiniMap';
import TreeItemRow from './TreeItemRow';
import { lineageRoleLabel, statusMeta, entryStatus } from '../lib/version-status';

const INDENT_PX = [12, 22, 38, 54, 70];
const indentFor = (d) => INDENT_PX[Math.min(d, INDENT_PX.length - 1)];

function Chip({ label, color, bg, title, testId }) {
  return (
    <span
      data-testid={testId}
      title={title}
      style={{
        fontSize: 9.5, lineHeight: '14px', padding: '0 5px', borderRadius: 8,
        background: bg || 'var(--surface-2)', color: color || 'var(--text-tertiary)',
        border: '1px solid var(--border-subtle)', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >{label}</span>
  );
}

/** Chip set for a nested member row: version order / branch glyph + status. */
function MemberBadge({ role, order, status, isHead }) {
  const sm = statusMeta(status);
  return (
    <>
      {role === 'branch'
        ? <Chip label="⑂" title="ветка" color="var(--accent-700)" />
        : <Chip label={`v${order}`} title={isHead ? 'текущая версия' : 'версия'} color={isHead ? 'var(--success-fg)' : 'var(--text-tertiary)'} />}
      {sm && <Chip label={sm.label} title={sm.label} color={sm.color} bg={sm.bg} />}
    </>
  );
}

function HeadRow({
  headEntry, memberCount, versionCount, branchCount, headStatus,
  isSelected, onSelect, expanded, onToggle, indent, testId,
}) {
  const ringColor = isSelected ? 'var(--accent-700)' : 'var(--text-secondary)';
  const top = headEntry?.payload?.topology;
  const ann = headEntry?.payload?.annotations;
  const sm = statusMeta(headStatus);
  return (
    <div
      data-testid={testId}
      data-expanded={expanded ? 'true' : 'false'}
      data-selected={isSelected ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(headEntry)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSelect?.(headEntry); } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 12px', paddingLeft: indentFor(indent),
        cursor: 'pointer', userSelect: 'none',
        background: isSelected ? 'var(--accent-50)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent-500)' : '2px solid transparent',
      }}
    >
      <span
        data-testid={`${testId}-twist`}
        onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
        style={{ width: 12, flexShrink: 0, color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      ><Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={11} /></span>
      <span style={{ flexShrink: 0, lineHeight: 0, width: 20, height: 20 }}>
        {(top === 'linear' && (!ann || ann.length === 0))
          ? (
            <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden focusable="false">
              <line x1="2" y1="10" x2="18" y2="10" stroke={ringColor} strokeWidth="1.6" />
            </svg>
          )
          : (
            <PlasmidMiniMap
              length={headEntry?.payload?.length || (headEntry?.payload?.sequence?.length || 0)}
              topology={top || 'circular'}
              annotations={ann || []}
              size={20}
              disableHoverOverlay
            />
          )}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{
          fontSize: 12.5, color: 'var(--text-primary)', fontWeight: isSelected ? 500 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{headEntry?.name || headEntry?.id}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', display: 'flex', gap: 6 }}>
          <span>{versionCount > 1 ? `${versionCount} версий` : 'версия'}</span>
          {branchCount > 0 && <span data-testid={`${testId}-branches`}>· {branchCount} ⑂</span>}
        </div>
      </div>
      {sm && <Chip label={sm.label} title={sm.label} color={sm.color} bg={sm.bg} />}
      <Chip label={`v${versionCount}`} title="текущая версия" color="var(--success-fg)" />
      <span
        data-testid={`${testId}-count`}
        style={{ fontSize: 10, color: 'var(--text-tertiary)', padding: '1px 6px', background: 'var(--surface-2)', borderRadius: 9, flexShrink: 0 }}
      >{memberCount}</span>
    </div>
  );
}

export const VersionLineageNode = memo(function VersionLineageNode({
  group,
  selectedId = null,
  onSelectEntry,
  expanded = false,
  onToggle,
  indent = 2,
  testId,
}) {
  const { headEntry, lineage, members } = group || {};
  const tid = testId || `version-lineage-${group?.rootId}`;

  const { versionRows, branchRows } = useMemo(() => {
    const memberById = new Map((members || []).map((m) => [m.id, m]));
    const headId = lineage?.headId;
    const vRows = (lineage?.versions || [])
      .filter((n) => memberById.has(n.id))
      .map((n, i) => ({ node: n, entry: memberById.get(n.id), order: i + 1, isHead: n.id === headId }));
    const bRows = [];
    for (const b of (lineage?.branches || [])) {
      for (const n of (b.nodes || [])) {
        if (memberById.has(n.id)) bRows.push({ node: n, entry: memberById.get(n.id) });
      }
    }
    return { versionRows: vRows, branchRows: bRows };
  }, [lineage, members]);

  if (!group || !headEntry) return null;

  return (
    <>
      <HeadRow
        headEntry={headEntry}
        memberCount={group.count}
        versionCount={versionRows.length || 1}
        branchCount={branchRows.length}
        headStatus={entryStatus(headEntry)}
        isSelected={headEntry.id === selectedId}
        onSelect={onSelectEntry}
        expanded={expanded}
        onToggle={onToggle}
        indent={indent}
        testId={tid}
      />
      {expanded && (
        <>
          {versionRows.map(({ entry, order, isHead }) => (
            <TreeItemRow
              key={entry.id}
              entry={entry}
              isSelected={entry.id === selectedId}
              onSelect={onSelectEntry}
              indent={indent + 1}
              draggable
              testId={`tree-item-version-${entry.id}`}
              badge={<MemberBadge role="version" order={order} status={entryStatus(entry)} isHead={isHead} />}
            />
          ))}
          {branchRows.map(({ entry }) => (
            <TreeItemRow
              key={entry.id}
              entry={entry}
              isSelected={entry.id === selectedId}
              onSelect={onSelectEntry}
              indent={indent + 1}
              draggable
              testId={`tree-item-version-${entry.id}`}
              badge={<MemberBadge role="branch" status={entryStatus(entry)} />}
            />
          ))}
        </>
      )}
    </>
  );
});

export default VersionLineageNode;

/**
 * TreeItemRow — Sprint M-X.7a v2 K2.
 *
 * `.item.indent-N` row per Library.html `<div class="item">`.
 * Renders ring SVG (mini topology indicator) + body (name + meta
 * line) + optional origin char on the right.
 *
 * Origin char convention (Library.html):
 *   ↑ file_import / paste / catalog
 *   ✎ manual_edit / manual_create
 *   🔗 cross_project_clone
 *   ✦ project_commit
 *   ❄ lab freezer (lab_pool entries with inLabStock=true)
 *
 * Mini-ring SVG is a lightweight 20×20 stand-in for the full
 * PlasmidMiniMap — at this size the map renders as a coloured
 * ring/strip that conveys topology + a hint of feature density
 * without paying the cost of full track rendering on every tree
 * row. Rich preview lives on hover (M-X.7c polish, deferred).
 */
import { memo } from 'react';
import PlasmidMiniMap from '../../PlasmidMiniMap';

const INDENT_PX = [12, 22, 38, 54, 70];

function indentFor(depth) {
  return INDENT_PX[Math.min(depth, INDENT_PX.length - 1)];
}

const ORIGIN_CHAR = {
  file_import: '↑',
  paste: '↑',
  paste_import: '↑',
  catalog: '↑',
  demo_category: '↑',
  manual_edit: '✎',
  manual_create: '✎',
  library_clone: '↑',
  cross_project_clone: '🔗',
  project_extract: '↗',
  project_commit: '✦',
  version: '↺',
};

const ORIGIN_COLOR = {
  cross_project_clone: 'var(--info-fg)',
  project_extract: 'var(--accent-700)',
  project_commit: 'var(--success-fg)',
  manual_edit: 'var(--accent-700)',
  manual_create: 'var(--accent-700)',
};

function originChar(entry) {
  if (entry?.kind === 'primer' && entry?.zone === 'lab_pool' && entry?.inLabStock === true) return '❄';
  const kind = entry?.origin?.kind;
  return ORIGIN_CHAR[kind] || '·';
}

function originColor(entry) {
  if (entry?.kind === 'primer' && entry?.zone === 'lab_pool' && entry?.inLabStock === true) return 'var(--kld)';
  const kind = entry?.origin?.kind;
  return ORIGIN_COLOR[kind] || 'var(--text-tertiary)';
}

function metaLine(entry) {
  if (!entry) return null;
  if (entry.kind === 'primer') {
    const parts = [];
    const len = entry.payload?.length;
    if (typeof len === 'number') parts.push(`${len} nt`);
    const tm = entry.payload?.tm;
    if (typeof tm === 'number') parts.push(`Tm ${tm.toFixed(1)}`);
    return parts.join(' · ') || null;
  }
  const parts = [];
  const len = entry.payload?.length;
  if (typeof len === 'number') parts.push(`${len.toLocaleString('ru-RU')} bp`);
  const top = entry.payload?.topology;
  if (top) parts.push(top);
  const annCount = Array.isArray(entry.payload?.annotations) ? entry.payload.annotations.length : 0;
  if (annCount > 0) parts.push(`${annCount} features`);
  return parts.join(' · ') || null;
}

function MiniIcon({ entry, color = 'var(--text-secondary)' }) {
  // Per 09.05.2026 «Library == DAG palette» refresh: render the
  // real PlasmidMiniMap (same component DagPalette uses) instead
  // of the K2 placeholder Ring SVG. At size=20 the map renders as
  // a coloured ring + feature arcs, which conveys topology +
  // feature density at a glance — biolog reported the previous
  // ring-only icon was unreadable as a plasmid.
  //
  // Primers + linear-without-features fall back to a tiny strand
  // line (no point in PlasmidMiniMap for a 4 nt primer).
  const top = entry?.payload?.topology;
  const annotations = entry?.payload?.annotations;
  if (entry?.kind === 'primer' || (top === 'linear' && (!annotations || annotations.length === 0))) {
    return (
      <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden focusable="false">
        <line x1="2" y1="10" x2="18" y2="10" stroke={color} strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <PlasmidMiniMap
      length={entry?.payload?.length || (entry?.payload?.sequence?.length || 0)}
      topology={top || 'circular'}
      annotations={annotations || []}
      size={20}
      disableHoverOverlay
    />
  );
}

export const TreeItemRow = memo(function TreeItemRow({
  entry,
  isSelected = false,
  onSelect,
  indent = 2,
  testId,
  // M-X.7a v2 K7: native HTML5 drag-drop. Loose-zone rows get
  // `draggable=true` so biolog can drop them onto an active
  // ProjectZone for a clone (DEC-MX7A-V2-10 minimum). Read-only
  // zones stay non-draggable — biolog can copy them via the
  // action-row's «Скопировать в активный» button instead.
  draggable = false,
}) {
  if (!entry) return null;
  const meta = metaLine(entry);
  const oc = originChar(entry);
  const ocColor = originColor(entry);
  const ringColor = isSelected ? 'var(--accent-700)' : 'var(--text-secondary)';
  return (
    <div
      data-testid={testId || `tree-item-${entry.id}`}
      data-selected={isSelected ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        try {
          e.dataTransfer.setData('application/x-bodge-entry-id', entry.id);
          e.dataTransfer.setData('text/plain', entry.name || entry.id);
          e.dataTransfer.effectAllowed = 'copyMove';
        } catch { /* jsdom / happy-dom may throw */ }
      }}
      onClick={() => onSelect?.(entry)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSelect?.(entry); } }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px',
        paddingLeft: indentFor(indent),
        cursor: 'pointer',
        userSelect: 'none',
        background: isSelected ? 'var(--accent-50)' : 'transparent',
        borderLeft: isSelected
          ? '2px solid var(--accent-500)'
          : '2px solid transparent',
      }}
    >
      <span style={{ flexShrink: 0, lineHeight: 0, width: 20, height: 20 }}>
        <MiniIcon entry={entry} color={ringColor} />
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--text-primary)',
            fontWeight: isSelected ? 500 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >{entry.name || entry.id}</div>
        {meta && (
          <div
            data-testid={`${testId || `tree-item-${entry.id}`}-meta`}
            style={{
              fontSize: 10.5,
              color: 'var(--text-tertiary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >{meta}</div>
        )}
      </div>
      <span
        data-testid={`${testId || `tree-item-${entry.id}`}-origin`}
        title={entry?.origin?.kind || ''}
        style={{ fontSize: 12, flexShrink: 0, color: ocColor }}
      >{oc}</span>
    </div>
  );
});

export default TreeItemRow;

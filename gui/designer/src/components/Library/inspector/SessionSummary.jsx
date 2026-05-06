import PlasmidMiniMap from '../../PlasmidMiniMap';
import { STRINGS } from '../../../lib/strings';

const S = STRINGS.importer;

/**
 * SessionSummary — accumulating list of items the biolog has acted on
 * during the current Importer session (M-B.2 K3).
 *
 * Each row: 32 px PlasmidMiniMap + name + action badge. Top-right
 * «Открыть холст» button surfaces when any entry has action='canvas'.
 * Adapted 1:1 from v0.5 ImportStartScreen/SessionSummary.
 */
export default function SessionSummary({ addedItems = [], onOpenCanvas }) {
  if (!addedItems.length) return null;
  const hasCanvas = addedItems.some((i) => i.action === 'canvas');

  return (
    <div
      data-testid="importer-session-summary"
      style={{
        padding: '8px 14px',
        borderBottom: '0.5px solid var(--border-subtle)',
        background: 'var(--surface-2, #f5f5f4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
            color: 'var(--text-tertiary)', fontWeight: 500,
          }}
        >{S.sessionSummaryTitle}</span>
        {hasCanvas && onOpenCanvas && (
          <button
            type="button"
            onClick={onOpenCanvas}
            data-testid="importer-session-open-canvas"
            style={{
              fontSize: 11,
              padding: '2px 10px',
              background: 'var(--accent-500)',
              color: 'var(--surface-1)',
              border: 'none', borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
            }}
          >{S.sessionSummaryOpenCanvas}</button>
        )}
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {addedItems.map((it, i) => (
          <li
            key={`${it.name}-${i}`}
            data-testid={`importer-session-row-${it.action}-${it.name}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <span style={{ flexShrink: 0 }}>
              <PlasmidMiniMap
                length={it.miniMapData?.length || 0}
                topology={it.miniMapData?.topology || 'linear'}
                annotations={it.miniMapData?.annotations || []}
                size={28}
                mode="inline"
                name={it.name}
              />
            </span>
            <span
              style={{ flex: 1, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={it.name}
            >{it.name}</span>
            <span style={badgeStyle(it.action)}>
              {badgeLabel(it.action, it.regionsAdded)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function badgeLabel(action, regionsAdded) {
  if (action === 'canvas') return S.sessionBadgeCanvas;
  if (action === 'library') return S.sessionBadgeLibrary;
  if (action === 'annotate') return S.sessionBadgeAnnotate(regionsAdded ?? 0);
  if (action === 'replaced') return S.sessionBadgeReplaced;
  return action;
}

function badgeStyle(action) {
  const palette = action === 'canvas'
    ? { bg: 'var(--success-chip, #d1fae5)', fg: 'var(--success-text, #047857)' }
    : action === 'library'
    ? { bg: 'var(--info-chip, #ede9fe)', fg: 'var(--info-text, #6d28d9)' }
    : action === 'annotate'
    ? { bg: 'var(--warning-chip, #fef3c7)', fg: 'var(--warning-text, #92400e)' }
    : { bg: 'var(--surface-2)', fg: 'var(--text-secondary)' };
  return {
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 999,
    background: palette.bg,
    color: palette.fg,
    fontWeight: 500,
    flexShrink: 0,
  };
}

/**
 * VersionTimeline — the version-history block-scheme for a library entry
 * (Игорь 16.06.2026, дизайн одобрен). Horizontal = time; branches drop into a
 * parallel lane (git-graph). Edges = SVG behind; nodes = clickable cards.
 * Color encodes kind: neutral (импорт/демо) vs amber (правка/версия). The
 * current entry is ringed. Click a node → `onSelect(id)`.
 *
 * Layout is computed by the pure `layoutVersionTimeline`; this is render-only.
 */
import { layoutVersionTimeline } from '../lib/version-lineage-layout';

const TONE = {
  neutral: { bg: 'var(--surface-sunken, #f5f5f4)', border: 'var(--border-default, #d6d3d1)', chip: 'var(--text-tertiary, #78716c)' },
  edit: { bg: 'var(--accent-50, #FAEEDA)', border: 'var(--accent-500, #f59e0b)', chip: 'var(--accent-700, #b45309)' },
};

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function VersionTimeline({ model, onSelect }) {
  if (!model?.nodes?.length) {
    return (
      <div data-testid="version-timeline-empty" style={{ fontSize: 12, color: 'var(--text-tertiary, #78716c)' }}>
        Истории версий пока нет — отредактируйте запись и нажмите «Сохранить как версию».
      </div>
    );
  }
  const { width, height, nodes, edges } = layoutVersionTimeline(model);
  return (
    <div data-testid="version-timeline" style={{ overflow: 'auto', maxWidth: '100%' }}>
      <div style={{ position: 'relative', width, height, minWidth: width }}>
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <marker id="vt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke="var(--text-tertiary, #78716c)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {edges.map((e) => (
            <path key={`${e.from}-${e.to}`} d={e.path} fill="none" stroke="var(--border-strong, #a8a29e)" strokeWidth="1.5" markerEnd="url(#vt-arrow)" />
          ))}
        </svg>
        {nodes.map((n) => {
          const tone = TONE[n.tone] || TONE.edit;
          return (
            <button
              key={n.id}
              type="button"
              data-testid={`version-node-${n.id}`}
              data-current={n.isCurrent ? 'true' : 'false'}
              onClick={() => onSelect?.(n.id)}
              title={n.changes || n.name}
              style={{
                position: 'absolute', left: n.x, top: n.y, width: n.w, height: n.h,
                textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
                padding: '7px 9px', boxSizing: 'border-box', cursor: 'pointer',
                background: tone.bg,
                border: n.isCurrent ? '2px solid var(--accent-700, #b45309)' : `1px solid ${tone.border}`,
                borderRadius: 8, overflow: 'hidden', font: 'inherit',
                color: 'var(--text-primary, #1c1917)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</span>
                <span style={{ fontSize: 9.5, color: tone.chip, fontWeight: 600, flexShrink: 0 }}>{n.kindLabel}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary, #57534e)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {n.changes || '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary, #78716c)', marginTop: 'auto' }}>
                {timeLabel(n.time)}{n.isCurrent ? ' · текущая' : ''}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

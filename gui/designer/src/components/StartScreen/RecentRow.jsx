/**
 * RecentRow — real project dashboard card.
 *
 * Accepts a live project record from the Zustand store (not stub
 * data). The ring SVG is deterministic: 1–3 arcs, colors picked
 * from a fixed palette by hashing project.id, count driven by
 * project.containerIds.length.
 */
import { memo } from 'react';
import { Icon } from '../icons/Icon';

const PALETTE = ['#D9836B', '#B0C84A', '#FFC400', '#5DA5C4', '#B884B8', '#E8B333', '#4DB89E'];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildRingPaths(projectId, containerCount) {
  const h = hashStr(projectId || '');
  const n = Math.max(1, Math.min(3, containerCount || 1));
  const gap = 8;
  const segSpan = (360 - gap * n) / n;
  const cx = 40, cy = 40, r = 28;
  const paths = [];
  for (let i = 0; i < n; i++) {
    const startDeg = i * (segSpan + gap) - 90;
    const endDeg = startDeg + segSpan;
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    paths.push({
      d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${segSpan > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      stroke: PALETTE[(h + i * 3) % PALETTE.length],
    });
  }
  return paths;
}

function Ring({ projectId, containerCount }) {
  const paths = buildRingPaths(projectId, containerCount);
  return (
    <svg width="46" height="46" viewBox="0 0 80 80" aria-hidden focusable="false">
      <circle cx="40" cy="40" r="28" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".1" />
      {paths.map((p, i) => (
        <path key={i} d={p.d} stroke={p.stroke} strokeWidth="6" fill="none"
          opacity={containerCount === 0 ? 0.3 : 1} />
      ))}
    </svg>
  );
}

function containers(n) {
  if (n === 1) return '1 контейнер';
  if (n >= 2 && n <= 4) return `${n} контейнера`;
  return `${n} контейнеров`;
}

export const RecentRow = memo(function RecentRow({
  project, isActive, timeAgoStr, onClick,
  // M-X.8 K7 — pin star on the right edge of the dashboard card.
  // Click toggles pin via parent-supplied callback (state lives in
  // projectSlice). When `pinned=undefined` no star is rendered (so
  // existing tests that don't pass it stay green).
  pinned,
  onTogglePin,
}) {
  if (!project) return null;
  const containerCount = (project.containerIds || []).length;
  const tags = (project.tags || []).filter((t) => typeof t === 'string');
  const desc = typeof project.description === 'string' ? project.description.slice(0, 40) : '';
  const pinSupported = typeof onTogglePin === 'function';

  return (
    <div
      className="row"
      data-testid={`ss-recent-${project.id}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(); }}
    >
      <div className="thumb">
        <Ring projectId={project.id} containerCount={containerCount} />
      </div>
      <div>
        <div className="meta-name">
          <span data-testid={`ss-recent-${project.id}-name`}>{project.name || 'Без имени'}</span>
          {isActive && (
            <span className="status-dot ok" data-testid={`ss-recent-${project.id}-active`} />
          )}
        </div>
        <div className="meta-sub">
          <span>{containers(containerCount)}</span>
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
          {desc && !tags.length && (
            <span style={{ color: 'var(--text-tertiary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {desc}
            </span>
          )}
        </div>
      </div>
      <div className="meta-time">{timeAgoStr}</div>
      <div
        className="meta-loc"
        style={{ fontFamily: 'inherit', color: 'var(--text-tertiary)', fontSize: 11.5 }}
        title={desc || undefined}
      >
        {desc || ''}
      </div>
      {pinSupported && (
        <button
          type="button"
          data-testid={`ss-recent-${project.id}-pin`}
          data-pinned={pinned ? 'true' : 'false'}
          title={pinned ? 'Открепить' : 'Закрепить'}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(project.id, !pinned);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            fontSize: 16,
            color: pinned ? 'var(--accent-700)' : 'var(--text-tertiary)',
            lineHeight: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        ><Icon name="star" size={15} filled={pinned} /></button>
      )}
      <div className="more" style={{ display: 'inline-flex', alignItems: 'center' }}><Icon name="kebab" size={14} /></div>
    </div>
  );
});

export default RecentRow;

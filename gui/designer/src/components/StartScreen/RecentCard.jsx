import { useStore } from '../../store';

export function formatRelativeTimeAgo(isoTs, nowMs = Date.now()) {
  if (!isoTs) return '';
  const then = new Date(isoTs).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, nowMs - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  if (diff < minute) return 'только что';
  if (diff < hour) return `${Math.round(diff / minute)} мин назад`;
  if (diff < day) {
    const h = Math.round(diff / hour);
    return h === 1 ? '1 час назад' : `${h} ч назад`;
  }
  if (diff < 2 * day) return 'вчера';
  if (diff < week) return `${Math.round(diff / day)} дн назад`;
  if (diff < month) return `${Math.round(diff / week)} нед назад`;
  return `${Math.round(diff / month)} мес назад`;
}

export default function RecentCard({
  project,
  lifecycle,
  onClick,
  exportMode = false,
  selected = false,
  onToggleSelect,
}) {
  const removeProjectFromIndexedDB = useStore(s => s.removeProjectFromIndexedDB);

  if (!project) return null;
  const name = project.name || '';
  const isUntitled = !name || name === 'Untitled';
  const displayName = isUntitled ? 'Untitled' : name;
  const containers = (project.containerIds && project.containerIds.length) || 0;
  const saved = !!(lifecycle && lifecycle.lastSavedToFileAt);
  const fileName = lifecycle && lifecycle.fileName;
  const tags = project.tags || [];
  const description = (project.description || '').trim();

  const meta = [
    formatRelativeTimeAgo(project.updatedAt || project.createdAt),
    `${containers} containers`,
    saved ? 'saved' : (containers === 0 ? 'only in browser' : 'unsaved'),
  ].filter(Boolean).join(' · ');

  function handleCardClick() {
    if (exportMode) onToggleSelect?.();
    else onClick?.();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  }

  function handleDelete(e) {
    e.stopPropagation();
    const ok = (typeof window !== 'undefined' && typeof window.confirm === 'function')
      ? window.confirm(`Удалить проект «${displayName}»? Действие нельзя отменить.`)
      : true;
    if (!ok) return;
    Promise.resolve(removeProjectFromIndexedDB(project.id)).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[bodgegene] removeProjectFromIndexedDB failed', err);
    });
  }

  return (
    <div
      className="ss-recent-card"
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      data-testid="ss-recent-card"
      aria-pressed={exportMode ? selected : undefined}
      style={{
        position: 'relative',
        textAlign: 'left',
        cursor: 'pointer',
        ...(exportMode && selected
          ? { outline: '1.5px solid var(--accent-500)', outlineOffset: -1 }
          : null),
      }}
    >
      {exportMode && (
        <span
          aria-hidden="true"
          data-testid="ss-recent-card-checkbox"
          data-selected={selected ? 'true' : 'false'}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 18,
            height: 18,
            borderRadius: 4,
            border: `1.5px solid ${selected ? 'var(--accent-500)' : 'var(--ss-border-secondary)'}`,
            background: selected ? 'var(--accent-500)' : 'transparent',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            lineHeight: 1,
          }}
        >{selected ? '✓' : ''}</span>
      )}

      <div className="ss-card-left">
        <div className={isUntitled ? 'ss-card-name-untitled' : 'ss-card-name'}>
          {displayName}
        </div>
        <div className="ss-card-meta">{meta}</div>
        {fileName
          ? <div className="ss-card-path">{fileName}</div>
          : <div className="ss-card-path-empty">no file location yet</div>}
        {tags.length > 0
          ? <div className="ss-card-tags">{tags.map(t => <span key={t} className="ss-tag-chip">{t}</span>)}</div>
          : <div className="ss-card-tags-empty">no tags yet</div>}
      </div>
      {description
        ? <div className="ss-card-desc">{description}</div>
        : <div className="ss-card-desc" style={{ color: 'var(--ss-text-tertiary)' }}>no description yet</div>}
      {!exportMode && <span className="ss-card-chevron">▷</span>}

      {!exportMode && (
        <button
          type="button"
          onClick={handleDelete}
          onKeyDown={(e) => e.stopPropagation()}
          data-testid="ss-recent-card-delete"
          title="Удалить проект"
          aria-label={`Удалить проект «${displayName}»`}
          style={{
            position: 'absolute',
            right: 6,
            bottom: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: 14,
            lineHeight: 1,
            color: 'var(--ss-text-tertiary)',
            opacity: 0.55,
            borderRadius: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger-fg, #b91c1c)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.55'; e.currentTarget.style.color = 'var(--ss-text-tertiary)'; }}
        >×</button>
      )}
    </div>
  );
}

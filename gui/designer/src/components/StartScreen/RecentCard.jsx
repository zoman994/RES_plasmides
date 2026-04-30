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

export default function RecentCard({ project, lifecycle, onClick }) {
  if (!project) return null;
  const name = project.name || '';
  const isUntitled = !name || name === 'Untitled';
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

  return (
    <button
      type="button"
      className="ss-recent-card"
      onClick={onClick}
      data-testid="ss-recent-card"
      style={{ textAlign: 'left' }}
    >
      <div className="ss-card-left">
        <div className={isUntitled ? 'ss-card-name-untitled' : 'ss-card-name'}>
          {isUntitled ? 'Untitled' : name}
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
      <span className="ss-card-chevron">▷</span>
    </button>
  );
}

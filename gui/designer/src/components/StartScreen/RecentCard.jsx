import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';

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
  const t = STRINGS.startScreen.timeAgo;
  if (diff < minute) return t.justNow;
  if (diff < hour) return t.minutes(Math.round(diff / minute));
  if (diff < day) {
    const h = Math.round(diff / hour);
    return h === 1 ? t.hourOne : t.hours(h);
  }
  if (diff < 2 * day) return t.yesterday;
  if (diff < week) return t.days(Math.round(diff / day));
  if (diff < month) return t.weeks(Math.round(diff / week));
  return t.months(Math.round(diff / month));
}

export default function RecentCard({
  project,
  lifecycle,
  onClick,
  exportMode = false,
  selected = false,
  onToggleSelect,
}) {
  const markPendingDelete = useStore(s => s.markPendingDelete);
  const unmarkPendingDelete = useStore(s => s.unmarkPendingDelete);
  const commitPendingDelete = useStore(s => s.commitPendingDelete);
  const showToast = useStore(s => s.showToast);

  if (!project) return null;
  const name = project.name || '';
  const isUntitled = !name || name === 'Untitled';
  const displayName = isUntitled ? STRINGS.startScreen.untitled : name;
  const containers = (project.containerIds && project.containerIds.length) || 0;
  const saved = !!(lifecycle && lifecycle.lastSavedToFileAt);
  const fileName = lifecycle && lifecycle.fileName;
  const tags = project.tags || [];
  const description = (project.description || '').trim();

  const meta = [
    formatRelativeTimeAgo(project.updatedAt || project.createdAt),
    STRINGS.startScreen.containers(containers),
    saved
      ? STRINGS.startScreen.statusSaved
      : (containers === 0 ? STRINGS.startScreen.statusOnlyInBrowser : STRINGS.startScreen.statusUnsaved),
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
    const id = project.id;
    markPendingDelete(id);
    showToast(STRINGS.startScreen.projectDeletedToast(displayName), 'info', {
      onUndo: () => unmarkPendingDelete(id),
      onAutoDismiss: () => {
        Promise.resolve(commitPendingDelete(id)).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[bodgegene] commitPendingDelete failed', err);
        });
      },
      autoDismissMs: 5000,
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
          : <div className="ss-card-path-empty">{STRINGS.startScreen.noFileLocation}</div>}
        {tags.length > 0
          ? <div className="ss-card-tags">{tags.map(t => <span key={t} className="ss-tag-chip">{t}</span>)}</div>
          : <div className="ss-card-tags-empty">{STRINGS.startScreen.noTags}</div>}
      </div>
      {description
        ? <div className="ss-card-desc">{description}</div>
        : <div className="ss-card-desc ss-card-desc-empty">{STRINGS.startScreen.noDescription}</div>}

      {!exportMode && (
        <button
          type="button"
          className="ss-card-delete"
          onClick={handleDelete}
          onKeyDown={(e) => e.stopPropagation()}
          data-testid="ss-recent-card-delete"
          title={STRINGS.startScreen.deleteProjectTitle}
          aria-label={STRINGS.startScreen.deleteProjectAria(displayName)}
        >×</button>
      )}
    </div>
  );
}

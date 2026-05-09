/**
 * RecentRow — Sprint StartScreen-Pixel.
 *
 * One recent project row per Library.html `.row`. Static layout
 * driven by the data record (see start-screen-data.js). All
 * clicks are stubs (`console.log('TODO: open-recent <id>')`)
 * until real recent-projects wiring lands.
 */
import { memo } from 'react';

function formatBp(n) {
  return n.toLocaleString('ru-RU');
}

function Tag({ tag }) {
  if (typeof tag === 'string') {
    return <span className="tag">{tag}</span>;
  }
  if (tag?.variant === 'draft') {
    return (
      <span
        className="tag"
        style={{
          background: 'transparent',
          color: 'var(--text-tertiary)',
          border: '0.5px solid var(--border-default)',
        }}
      >{tag.label}</span>
    );
  }
  return <span className="tag">{tag?.label || ''}</span>;
}

function Ring({ paths }) {
  return (
    <svg width="46" height="46" viewBox="0 0 80 80" aria-hidden focusable="false">
      <circle cx="40" cy="40" r="28" fill="none" stroke="#3A2F1F" strokeWidth="1.4" opacity=".25" />
      {paths.map((p, i) => (
        <path key={i} d={p.d} stroke={p.stroke} strokeWidth="6" fill="none" />
      ))}
    </svg>
  );
}

export const RecentRow = memo(function RecentRow({ project }) {
  if (!project) return null;
  return (
    <div
      className="row"
      data-testid={`ss-recent-${project.id}`}
      role="button"
      tabIndex={0}
      onClick={() => {
        // eslint-disable-next-line no-console
        console.log(`TODO: open-recent ${project.id}`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          // eslint-disable-next-line no-console
          console.log(`TODO: open-recent ${project.id}`);
        }
      }}
    >
      <div className="thumb">
        <Ring paths={project.ring || []} />
      </div>
      <div>
        <div className="meta-name">
          <span data-testid={`ss-recent-${project.id}-name`}>{project.name}</span>
          {project.status === 'ok' && <span className="status-dot ok" data-testid="ss-recent-status-ok" />}
          {project.status === 'unsaved' && <span className="status-dot unsaved" data-testid="ss-recent-status-unsaved" />}
          {(project.tags || [])
            .filter((t) => typeof t !== 'string' && t?.variant === 'draft')
            .map((t, i) => <Tag key={`d${i}`} tag={t} />)}
        </div>
        <div className="meta-sub">
          <span>{formatBp(project.bp)} bp</span>
          <span>·</span>
          <span>{project.topology}</span>
          <span>·</span>
          <span>{project.features} features</span>
          {(project.tags || [])
            .filter((t) => typeof t === 'string')
            .map((t, i) => <Tag key={`s${i}`} tag={t} />)}
        </div>
      </div>
      <div className="meta-time">{project.timeAgo}</div>
      <div className="meta-loc">{project.location}</div>
      <div className="more">⋯</div>
    </div>
  );
});

export default RecentRow;

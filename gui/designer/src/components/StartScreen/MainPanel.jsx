/**
 * MainPanel — Sprint StartScreen-Pixel.
 *
 * Topbar (48 px: «Главная» h2 + search 480 max + ?) + content
 * (Recent header with filter pills + 4 RecentRow + EmptyCard)
 * per Library.html `.main`.
 *
 * Search input + filter pills + ? button are visual stubs. Filter
 * pill activation is local state (active pill highlights) but no
 * actual filtering takes place — мы НЕ имеем реальных recent
 * projects в этой сессии (см. start-screen-data.js note).
 */
import { useState } from 'react';
import RecentRow from './RecentRow';
import EmptyCard from './EmptyCard';
import {
  RECENT_PROJECTS,
  RECENT_COUNT_TOTAL,
  FILTER_PILLS,
} from './start-screen-data';

function todoLog(label) {
  return () => {
    // eslint-disable-next-line no-console
    console.log(`TODO: ${label}`);
  };
}

export default function MainPanel() {
  const [activeFilter, setActiveFilter] = useState('all');

  return (
    <main className="main" data-testid="ss-main">
      <div className="topbar">
        <h2 data-testid="ss-topbar-title">Главная</h2>
        <div className="top-search">
          <input
            type="text"
            data-testid="ss-topbar-search"
            placeholder="Поиск проекта, плазмиды или фичи…"
            onChange={() => {
              // Search is a visual stub in this version (kbd Ctrl K
              // tooltip is for the future ⌘K palette). No actual
              // query handling.
            }}
          />
          <span className="ico">⌕</span>
          <span className="kbd kbd-r">Ctrl K</span>
        </div>
        <button
          type="button"
          className="top-act"
          data-testid="ss-topbar-help"
          title="Руководство"
          onClick={todoLog('open-guide')}
        >?</button>
      </div>

      <div className="content">
        <div className="recent-head">
          <h3 data-testid="ss-recent-header">Недавние проекты · {RECENT_COUNT_TOTAL}</h3>
          <div className="filter-row" data-testid="ss-filter-row">
            {FILTER_PILLS.map((pill) => (
              <button
                type="button"
                key={pill.id}
                data-testid={`ss-filter-${pill.id}`}
                data-active={activeFilter === pill.id ? 'true' : 'false'}
                className={`filter-pill ${activeFilter === pill.id ? 'on' : ''}`}
                onClick={() => setActiveFilter(pill.id)}
              >{pill.label}</button>
            ))}
          </div>
        </div>

        {RECENT_PROJECTS.map((p) => (
          <RecentRow key={p.id} project={p} />
        ))}

        <EmptyCard />
      </div>
    </main>
  );
}

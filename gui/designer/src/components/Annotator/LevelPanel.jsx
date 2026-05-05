/**
 * Annotator/LevelPanel — Sprint M-X.3 follow-up (05.05.2026, Stage B).
 *
 * Right-pane progression UI replacing the old PluginPanel + ResultsPane
 * pair. Biolog: «аннотация имеет три уровня - комон фичи, предиктор
 * ОРФ+предиктор промоторов терминаторов+ сложный анализ виде бласта
 * и тд. … И справа должно показываться таблица с комон фичами. С
 * вариантом принять не принять каждую. потом у нас остается первично
 * аннотированная плазмида готовая ко 2 и к 3 уровням аннотации».
 *
 * Layout:
 *   ┌──────────────────────────────────┐
 *   │ Level 1: Common features    (3)  │ ← header (count, expand chevron)
 *   │ ▶ AmpR        ✓ ✗  Edit          │ ← ResultRow per region
 *   │ ▶ lacZα       ✓ ✗  Edit          │
 *   │ ▶ ori         ✓ ✗  Edit          │
 *   ├──────────────────────────────────┤
 *   │ Level 2: Predictors        [Run] │
 *   ├──────────────────────────────────┤
 *   │ Level 3: BLAST (NCBI)      [Run] │
 *   └──────────────────────────────────┘
 *
 * Plugin → level mapping is hard-coded here (see LEVELS map). Each
 * level's Run button calls `onRunLevel(levelId)` which the parent
 * (Annotator) wires through to runAnnotatorPipeline with the
 * level's plugin ids forced ON for one shot.
 *
 * L1 is expanded by default (auto-runs on annotator open). L2 and
 * L3 start collapsed; clicking the header toggles. Run during a
 * level's run keeps the section expanded so progress is visible.
 *
 * Reuses ResultRow for accept/reject/edit semantics — same shape
 * as the legacy table, just without the plugin-grouping header.
 */

import { useState, useMemo } from 'react';
import { STRINGS } from '../../lib/strings';
import ResultRow from './ResultRow.jsx';

const S = STRINGS.importer.annotator;

export const LEVELS = Object.freeze({
  L1: Object.freeze(['common-features-homology']),
  L2: Object.freeze(['orf-scan', 'sigma70-promoter', 'stem-loop-terminator', 'sgrna-scaffold']),
  L3: Object.freeze(['blast-ncbi']),
});

const LEVEL_ORDER = ['L1', 'L2', 'L3'];

const LEVEL_COPY = {
  L1: { title: 'level1Title', hint: 'level1Hint' },
  L2: { title: 'level2Title', hint: 'level2Hint' },
  L3: { title: 'level3Title', hint: 'level3Hint' },
};

function regionsForLevel(levelId, results, threshold) {
  const ids = LEVELS[levelId];
  const out = [];
  for (const pid of ids) {
    const res = results?.[pid];
    if (!res) continue;
    for (const r of (res.regions || [])) {
      if (Number.isFinite(r.confidence) && r.confidence < (threshold ?? 0)) continue;
      const id = r.id || `${r.start}:${r.end}:${r.type || ''}:${r.name || ''}`;
      out.push({ ...r, id, _pluginName: res.pluginName || pid });
    }
  }
  return out;
}

function isRunningLevel(levelId, running) {
  return LEVELS[levelId].some((pid) => running?.[pid]);
}

function hasResultsForLevel(levelId, results) {
  return LEVELS[levelId].some((pid) => !!results?.[pid]);
}

export default function LevelPanel({
  results = {},
  running = {},
  acceptedRegionIds = {},
  rejectedRegionIds = {},
  pendingEdits = {},
  threshold = 0,
  onAccept,
  onReject,
  onEditPatch,
  onRunLevel,
  onAcceptMany,
}) {
  // Each level has independent expand/collapse state. L1 starts open
  // (auto-run produces results on open, so the user wants to see
  // them immediately); L2 and L3 are opt-in, start collapsed.
  const [expanded, setExpanded] = useState({ L1: true, L2: false, L3: false });
  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div
      data-testid="annotator-level-panel"
      style={{
        width: 360,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '0.5px solid var(--border-default, #d4d4d4)',
        background: 'var(--surface-1, #fff)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          fontSize: 12, fontWeight: 600,
          color: 'var(--text-primary, #111)',
          borderBottom: '0.5px solid var(--border-default, #d4d4d4)',
          flexShrink: 0,
        }}
      >
        {S.levelPanelTitle}
      </div>
      {LEVEL_ORDER.map((levelId) => (
        <LevelSection
          key={levelId}
          levelId={levelId}
          expanded={!!expanded[levelId]}
          onToggle={() => toggle(levelId)}
          results={results}
          running={running}
          acceptedRegionIds={acceptedRegionIds}
          rejectedRegionIds={rejectedRegionIds}
          pendingEdits={pendingEdits}
          threshold={threshold}
          onAccept={onAccept}
          onReject={onReject}
          onEditPatch={onEditPatch}
          onRunLevel={onRunLevel}
          onAcceptMany={onAcceptMany}
        />
      ))}
    </div>
  );
}

function LevelSection({
  levelId,
  expanded,
  onToggle,
  results,
  running,
  acceptedRegionIds,
  rejectedRegionIds,
  pendingEdits,
  threshold,
  onAccept,
  onReject,
  onEditPatch,
  onRunLevel,
  onAcceptMany,
}) {
  const regions = useMemo(
    () => regionsForLevel(levelId, results, threshold),
    [levelId, results, threshold],
  );
  const isRunning = isRunningLevel(levelId, running);
  const hasResults = hasResultsForLevel(levelId, results);
  const copy = LEVEL_COPY[levelId];

  // Pending = surfaced in the panel AND not yet accepted/rejected.
  // The «Accept all» shortcut targets exactly these.
  const pendingIds = useMemo(() => {
    const out = [];
    for (const r of regions) {
      if (acceptedRegionIds?.[r.id]) continue;
      if (rejectedRegionIds?.[r.id]) continue;
      out.push(r.id);
    }
    return out;
  }, [regions, acceptedRegionIds, rejectedRegionIds]);

  const status = isRunning
    ? S.levelRunning
    : hasResults
      ? S.levelHits(regions.length)
      : S.levelNotRunYet;

  return (
    <div
      data-testid="annotator-level-section"
      data-level-id={levelId}
      data-running={isRunning ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
      style={{
        borderBottom: '0.5px solid var(--border-default, #d4d4d4)',
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        data-testid="annotator-level-header"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--text-primary, #111)',
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
          {expanded ? '▼' : '▶'}
        </span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>
          {S[copy.title]}
        </span>
        <span
          data-testid="annotator-level-status"
          style={{
            fontSize: 10,
            color: 'var(--text-secondary)',
          }}
        >
          {status}
        </span>
      </button>
      {expanded && (
        <div
          data-testid="annotator-level-body"
          style={{
            padding: '0 12px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            {S[copy.hint]}
          </div>
          {/* Run button — visible for L2/L3 (manual triggers) and as
              «Run again» for L1 once it has already auto-run.
              Sprint M-X.3 follow-up — «Accept all (N)» pinned right
              of Run when there's at least one pending hit. Manually
              rejected hits are NOT touched (acceptManyRegions skips
              them in the store). */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              data-testid="annotator-level-run"
              disabled={isRunning}
              onClick={() => onRunLevel?.(levelId)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                borderRadius: 'var(--radius-sm, 3px)',
                border: '0.5px solid var(--border-default, #d4d4d4)',
                background: isRunning
                  ? 'var(--surface-2, #f5f5f4)'
                  : (hasResults ? 'transparent' : 'var(--accent-500, #f97316)'),
                color: isRunning
                  ? 'var(--text-tertiary)'
                  : (hasResults ? 'var(--text-primary, #111)' : '#fff'),
                cursor: isRunning ? 'not-allowed' : 'pointer',
              }}
            >
              {isRunning
                ? S.levelRunning
                : (hasResults ? S.levelRunAgain : S.levelRun)}
            </button>
            {pendingIds.length > 0 && (
              <button
                type="button"
                data-testid="annotator-level-accept-all"
                title={S.levelAcceptAllHint}
                onClick={() => onAcceptMany?.(pendingIds)}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-sm, 3px)',
                  border: '0.5px solid var(--accent-500, #f97316)',
                  background: 'var(--accent-500, #f97316)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {S.levelAcceptAll(pendingIds.length)}
              </button>
            )}
          </div>
          {/* Region rows — only after the level has produced results. */}
          {hasResults && regions.length === 0 && (
            <div
              data-testid="annotator-level-empty"
              style={{ fontSize: 11, color: 'var(--text-tertiary)' }}
            >
              {S.levelEmpty}
            </div>
          )}
          {regions.map((region) => (
            <ResultRow
              key={region.id}
              region={region}
              pendingPatch={pendingEdits?.[region.id]}
              isAccepted={!!acceptedRegionIds?.[region.id]}
              isRejected={!!rejectedRegionIds?.[region.id]}
              onAccept={() => onAccept?.(region.id)}
              onReject={() => onReject?.(region.id)}
              onEditPatch={(patch) => onEditPatch?.(region.id, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

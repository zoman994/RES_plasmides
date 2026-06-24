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

import { useState, useMemo, useEffect } from 'react';
import { STRINGS } from '../../lib/strings';
import { isDuplicatePrediction } from '../../lib/annotation-edit.js';
import ResultRow from './ResultRow.jsx';
import { Icon } from '../icons/Icon';

// Shared duplicate-detection heuristic — see lib/annotation-edit.js.
const isDuplicateOfConfirmed = isDuplicatePrediction;

const S = STRINGS.importer.annotator;

export const LEVELS = Object.freeze({
  L1: Object.freeze(['common-features-homology']),
  L2: Object.freeze(['orf-scan', 'sigma70-promoter', 'stem-loop-terminator', 'sgrna-scaffold']),
  L3: Object.freeze(['blast-ncbi']),
  // «Структура гена» — fed by the 🧬 intron analysis (annotate-genes), stored
  // under the pseudo-plugin id 'gene-parser'. Not a pipeline plugin.
  GENE: Object.freeze(['gene-parser']),
});

const LEVEL_ORDER = ['L1', 'L2', 'L3', 'GENE'];

const LEVEL_COPY = {
  L1: { title: 'level1Title', hint: 'level1Hint' },
  L2: { title: 'level2Title', hint: 'level2Hint' },
  // Sprint M-X.3 follow-up — biolog: «ок поставь пока заглушку».
  // L3 (BLAST against NCBI) needs a backend proxy that isn't built
  // yet; flag it so LevelSection renders a «Coming soon» card
  // instead of the Run button.
  L3: { title: 'level3Title', hint: 'level3Hint', comingSoon: true },
  // The gene + its introns are cross-linked (intron.regionId = gene.id), so the
  // section accepts the WHOLE structure as one unit («Принять структуру»),
  // never per-region — a partial accept would re-create the monolithic-gene
  // bug. Literal copy: no i18n key needed.
  GENE: {
    titleLiteral: 'Структура гена (интроны)',
    hintLiteral: 'Парсер гена: ATG…стоп + GT-AG интроны. Принимается целиком — ген со своими интронами.',
    geneStructure: true,
  },
};

function regionsForLevel(levelId, results, threshold, existingAnnotations, showDuplicates) {
  const ids = LEVELS[levelId];
  const out = [];
  for (const pid of ids) {
    const res = results?.[pid];
    if (!res) continue;
    for (const r of (res.regions || [])) {
      if (Number.isFinite(r.confidence) && r.confidence < (threshold ?? 0)) continue;
      // Suppress duplicates of already-confirmed annotations unless
      // the user toggled «show duplicates» on.
      if (!showDuplicates && isDuplicateOfConfirmed(r, existingAnnotations)) continue;
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
  existingAnnotations = [],
  showDuplicates = false,
  // Save toolbar — biolog asked to pin Save up near the
  // «Annotation levels» header instead of leaving it at the
  // bottom under the sequence (out of sight on long plasmids).
  acceptedCount = 0,
  rejectedCount = 0,
  editedCount = 0,
  justSaved = false,
  onSave,
  onAccept,
  onReject,
  onEditPatch,
  onRunLevel,
  onAcceptMany,
  // Round-16 (06.05.2026) — forward to ResultRow so clicking the
  // feature name in the panel teleports the embedded SequenceView
  // to that region's start.
  onLocateRegion,
  // Intron-analysis controls live in the «Структура гена» section (Игорь:
  // перенести организм + кнопку 🧬 в правую панель). { organism, onOrganismChange,
  // onDetect, busy, hasSelection, result }. Absent in bare-panel tests.
  geneAnalysis,
  // Resizable panel width (px). Driven by the Annotator's split handle; defaults
  // to the historical 360 for standalone/bare-panel usage + tests.
  width = 360,
}) {
  // Each level has independent expand/collapse state. L1 starts open
  // (auto-run produces results on open, so the user wants to see
  // them immediately); L2 and L3 are opt-in, start collapsed.
  const [expanded, setExpanded] = useState({ L1: true, L2: false, L3: false, GENE: !!geneAnalysis });
  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  // Auto-open «Структура гена» when the 🧬 analysis produces a result, so the
  // pending structure is visible to accept without a manual expand.
  const hasGeneResult = !!(results && results['gene-parser']);
  useEffect(() => {
    if (hasGeneResult) setExpanded((prev) => ({ ...prev, GENE: true }));
  }, [hasGeneResult]);

  return (
    <div
      data-testid="annotator-level-panel"
      style={{
        width,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-1, #fff)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '0.5px solid var(--border-default, #d4d4d4)',
          flexShrink: 0,
          background: 'var(--surface-1, #fff)',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 12, fontWeight: 600,
            color: 'var(--text-primary, #111)',
            marginBottom: 6,
          }}
        >
          {S.levelPanelTitle}
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 10, color: 'var(--text-secondary)',
          }}
        >
          <span>{S.summaryAccepted(acceptedCount)}</span>
          <span>·</span>
          <span>{S.summaryRejected(rejectedCount)}</span>
          <span>·</span>
          <span>{S.summaryEdited(editedCount)}</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            data-testid="annotator-save-button"
            data-save-state={
              justSaved ? 'just-saved' : (acceptedCount > 0 ? 'pending' : 'idle')
            }
            disabled={acceptedCount === 0}
            onClick={onSave}
            style={{
              padding: '4px 12px',
              // Three-state colour: green-tint right after a Save
              // click, accent-orange while there are unsaved
              // accepted regions, neutral when nothing to save.
              background: justSaved
                ? '#22c55e'
                : (acceptedCount > 0 ? 'var(--accent-500, #f97316)' : 'var(--surface-2, #e7e5e4)'),
              color: justSaved || acceptedCount > 0 ? '#fff' : 'var(--text-tertiary)',
              border: 'none',
              borderRadius: 'var(--radius-sm, 3px)',
              cursor: acceptedCount > 0 ? 'pointer' : 'not-allowed',
              fontSize: 11,
              fontWeight: 500,
              transition: 'background 200ms ease',
            }}
          >{
            justSaved
              ? S.saveJustDone
              : (acceptedCount > 0 ? S.saveCount(acceptedCount) : S.saveButton)
          }</button>
        </div>
      </div>
      {LEVEL_ORDER.map((levelId) => (
        levelId === 'GENE' ? (
          <GeneStructureSection
            key="GENE"
            expanded={!!expanded.GENE}
            onToggle={() => toggle('GENE')}
            results={results}
            threshold={threshold}
            existingAnnotations={existingAnnotations}
            showDuplicates={showDuplicates}
            acceptedRegionIds={acceptedRegionIds}
            onAcceptMany={onAcceptMany}
            onReject={onReject}
            onLocateRegion={onLocateRegion}
            geneAnalysis={geneAnalysis}
          />
        ) : (
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
            existingAnnotations={existingAnnotations}
            showDuplicates={showDuplicates}
            onAccept={onAccept}
            onReject={onReject}
            onEditPatch={onEditPatch}
            onRunLevel={onRunLevel}
            onAcceptMany={onAcceptMany}
            onLocateRegion={onLocateRegion}
          />
        )
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
  existingAnnotations,
  showDuplicates,
  onAccept,
  onReject,
  onEditPatch,
  onRunLevel,
  onAcceptMany,
  onLocateRegion,
}) {
  const regions = useMemo(
    () => regionsForLevel(levelId, results, threshold, existingAnnotations, showDuplicates),
    [levelId, results, threshold, existingAnnotations, showDuplicates],
  );
  const isRunning = isRunningLevel(levelId, running);
  const hasResults = hasResultsForLevel(levelId, results);
  const copy = LEVEL_COPY[levelId];
  const isPlaceholder = !!copy.comingSoon;

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
    : isPlaceholder
      ? S.levelComingSoonLabel
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
        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center' }}>
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} />
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
          {isPlaceholder && (
            <div
              data-testid="annotator-level-placeholder"
              style={{
                padding: '8px 10px',
                fontSize: 11,
                lineHeight: 1.4,
                color: 'var(--text-secondary)',
                background: 'var(--surface-2, #f5f5f4)',
                border: '0.5px dashed var(--border-default, #d4d4d4)',
                borderRadius: 'var(--radius-sm, 3px)',
              }}
            >
              <div style={{ fontWeight: 500, color: 'var(--text-primary, #111)', marginBottom: 4 }}>
                {S.levelComingSoonLabel}
              </div>
              {S.levelComingSoonBody}
            </div>
          )}
          {/* Run button — visible for L2/L3 (manual triggers) and as
              «Run again» for L1 once it has already auto-run.
              Sprint M-X.3 follow-up — «Accept all (N)» pinned right
              of Run when there's at least one pending hit. Manually
              rejected hits are NOT touched (acceptManyRegions skips
              them in the store).
              Placeholder levels (L3 BLAST until backend lands) hide
              the Run button — clicking it would just produce another
              empty placeholder result. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {!isPlaceholder && (
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
            )}
            {pendingIds.length > 0 && (
              // UX-021 — was primary orange. «Accept all» is a heavy
              // batch action; primary styling encouraged biolog to
              // commit without reviewing per-row confidence. Secondary
              // outline keeps it discoverable while pushing the user
              // to per-row Accept (or threshold tuning) when they
              // care about precision.
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
                  background: 'transparent',
                  color: 'var(--accent-500, #f97316)',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {S.levelAcceptAll(pendingIds.length)}
              </button>
            )}
          </div>
          {/* Region rows — only after the level has produced results.
              UX-007 — bare "No hits." was a silent failure for biolog
              who tested on a known plasmid: gave no hint whether the
              database was loaded, the threshold was tight, or there
              were genuinely no matches. Adds a one-line diagnostic
              that mentions the active threshold and points at L2 as
              an alternative search. */}
          {hasResults && regions.length === 0 && (
            <div
              data-testid="annotator-level-empty"
              style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              <div>{S.levelEmpty}</div>
              {typeof S.levelEmptyDiagnostic === 'function' && (
                <div style={{ fontSize: 10, lineHeight: 1.4 }}>
                  {S.levelEmptyDiagnostic(threshold)}
                </div>
              )}
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
              onLocate={onLocateRegion}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * «Структура гена» — the intron-analysis result rendered as a panel level.
 * Unlike the other levels (independent regions, per-row accept), the gene and
 * its introns are cross-linked, so the whole structure is accepted as ONE unit
 * («Принять структуру» → acceptMany of every region). A partial accept would
 * re-create the monolithic-gene bug, so there is no per-row accept here.
 */
function GeneStructureSection({
  expanded,
  onToggle,
  results,
  threshold,
  existingAnnotations,
  showDuplicates,
  acceptedRegionIds,
  onAcceptMany,
  onReject,
  onLocateRegion,
  // { organism, onOrganismChange, onDetect, busy, hasSelection, result } — the
  // intron-analysis controls, moved here from the toolbar (Игорь).
  geneAnalysis,
}) {
  const copy = LEVEL_COPY.GENE;
  const regions = useMemo(
    () => regionsForLevel('GENE', results, threshold, existingAnnotations, showDuplicates),
    [results, threshold, existingAnnotations, showDuplicates],
  );
  const gene = regions.find((r) => r.type === 'gene');
  const introns = regions.filter((r) => r.type === 'intron');
  const allIds = regions.map((r) => r.id);
  const allAccepted = allIds.length > 0 && allIds.every((id) => acceptedRegionIds?.[id]);
  const status = regions.length ? `Найдено интронов: ${introns.length}` : 'Не запускалось';

  const primaryBtn = {
    padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm, 3px)',
    border: 'none', background: 'var(--accent-500, #f97316)', color: '#fff',
    cursor: 'pointer', fontWeight: 500,
  };
  const secondaryBtn = {
    padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-sm, 3px)',
    border: '0.5px solid var(--border-default, #d4d4d4)', background: 'transparent',
    color: 'var(--text-secondary)', cursor: 'pointer',
  };
  const selectStyle = {
    padding: '3px 6px', fontSize: 11, cursor: 'pointer',
    border: '0.5px solid var(--border-default, #d4d4d4)', borderRadius: 'var(--radius-sm, 3px)',
    background: 'var(--surface-1, #fff)', color: 'var(--text-primary, #111)',
  };
  // Result status message (was the floating toolbar banner). null when no run.
  const r = geneAnalysis?.result;
  const statusMsg = !r ? null
    : r.needsSelection ? '🧬 Выдели ген (ORF), чтобы найти интроны — на всю плазмиду анализ не запускается.'
      : r.tooShort ? '🧬 Выделение короче 220 п.н. — мало контекста для нейросети. Выдели ген целиком.'
        : r.intronCount > 0 ? `🧬 Найдено интронов: ${r.intronCount} (цепь ${r.strand === -1 ? '−' : '+'}${Number.isFinite(r.orf) ? `, ORF ${r.orf} aa` : ''}) · парсер гена`
          : '🧬 Интроны не найдены · парсер гена';
  const warn = !!(r && (r.needsSelection || r.tooShort || r.cryptic?.length));

  return (
    <div
      data-testid="annotator-level-section"
      data-level-id="GENE"
      data-expanded={expanded ? 'true' : 'false'}
      style={{ borderBottom: '0.5px solid var(--border-default, #d4d4d4)', flexShrink: 0 }}
    >
      <button
        type="button"
        onClick={onToggle}
        data-testid="annotator-level-header"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary, #111)',
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center' }}><Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} /></span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{copy.titleLiteral}</span>
        <span data-testid="annotator-level-status" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{status}</span>
      </button>
      {expanded && (
        <div
          data-testid="annotator-level-body"
          style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{copy.hintLiteral}</div>
          {geneAnalysis && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                data-testid="annotator-organism"
                value={geneAnalysis.organism}
                onChange={(e) => geneAnalysis.onOrganismChange?.(e.target.value)}
                title="Организм — задаёт типичную длину интрона для парсера гена."
                style={selectStyle}
              >
                <option value="fungi">Грибы</option>
                <option value="vertebrate">Человек/животные</option>
                <option value="plant">Растения</option>
                <option value="invertebrate">Насекомые</option>
                <option value="generic">Другой</option>
              </select>
              <button
                type="button"
                data-testid="annotator-detect-introns"
                onClick={geneAnalysis.onDetect}
                disabled={geneAnalysis.busy}
                title={geneAnalysis.hasSelection
                  ? 'Найти интроны в выделенном гене: парсер гена (ATG…стоп) + GT-AG сайты.'
                  : 'Выдели ген (ORF), чтобы найти интроны — на всю плазмиду анализ не запускается.'}
                style={{
                  padding: '4px 10px', fontSize: 12, cursor: geneAnalysis.busy ? 'wait' : 'pointer',
                  border: '0.5px solid var(--border-default, #d4d4d4)', borderRadius: 'var(--radius-sm, 3px)',
                  background: 'var(--surface-1, #fff)', color: 'var(--text-primary, #111)',
                  opacity: geneAnalysis.busy ? 0.6 : (geneAnalysis.hasSelection ? 1 : 0.7),
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              ><Icon name="dna" size={13} />{geneAnalysis.busy ? ' …' : ' Интроны'}</button>
            </div>
          )}
          {statusMsg && (
            <div
              data-testid="annotator-splice-result"
              style={{
                fontSize: 11, padding: '5px 8px', borderRadius: 'var(--radius-sm, 3px)',
                background: warn ? 'var(--warning-chip, #fef3c7)' : 'var(--surface-2)',
                color: warn ? 'var(--warning-text, #92400e)' : 'var(--text-secondary)',
              }}
            >
              {statusMsg}
              {r?.cryptic?.length > 0 && (
                <span data-testid="annotator-cryptic-warning">
                  {' · ⚠ криптические splice-сайты: '}
                  {r.cryptic.slice(0, 5).map((c) => `${c.kind === 'donor' ? 'донор' : 'акцептор'}@${c.pos + 1}`).join(', ')}
                  {r.cryptic.length > 5 ? ` +${r.cryptic.length - 5}` : ''}
                </span>
              )}
            </div>
          )}
          {regions.length === 0 ? (geneAnalysis ? null : (
            <div data-testid="annotator-gene-empty" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Запусти «🧬 Интроны» — найденная структура появится здесь для подтверждения.
            </div>
          )) : (
            <div data-testid="annotator-gene-structure" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                data-testid="annotator-gene-summary"
                onClick={() => gene && onLocateRegion?.(gene)}
                style={{
                  textAlign: 'left', background: 'var(--surface-2, #f5f5f4)',
                  border: '0.5px solid var(--border-default, #d4d4d4)',
                  borderRadius: 'var(--radius-sm, 3px)', padding: '6px 8px',
                  cursor: 'pointer', fontSize: 11, color: 'var(--text-primary, #111)',
                }}
              >
                🧬 {gene?.name || 'ген'} · интронов: {introns.length} · цепь {gene?.strand === -1 ? '−' : '+'}
                {introns.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {introns.map((it, i) => `${i + 1}: ${it.start + 1}–${it.end}`).join(' · ')}
                  </div>
                )}
              </button>
              {allAccepted ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#16a34a' }}>✓ структура принята</span>
                  <button type="button" data-testid="annotator-gene-reject" onClick={() => allIds.forEach((id) => onReject?.(id))} style={secondaryBtn}>Отклонить</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" data-testid="annotator-gene-accept" onClick={() => onAcceptMany?.(allIds)} style={primaryBtn}>Принять структуру</button>
                  <button type="button" data-testid="annotator-gene-reject" onClick={() => allIds.forEach((id) => onReject?.(id))} style={secondaryBtn}>Отклонить</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

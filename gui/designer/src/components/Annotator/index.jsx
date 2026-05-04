/**
 * Annotator — Sprint M-X.2 K8 fullscreen annotation orchestrator.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ ← Назад   Аннотатор      [scope info]   threshold N% │ ← header
 *   ├─────────────────────────────────────────────────────────┤
 *   │ TargetPreview (linear strip + scope highlight)          │
 *   ├──────────────┬──────────────────────────────────────────┤
 *   │ PluginPanel  │ ResultsPane                              │
 *   │ (left)       │ (right)                                  │
 *   ├──────────────┴──────────────────────────────────────────┤
 *   │ Принято: N · Отклонено: M · Изменено: K   [Сохранить] │ ← footer
 *   └─────────────────────────────────────────────────────────┘
 *
 * Driven by `state.annotator` (DEC-ANN-07). Plugin pipeline runs
 * via `runAnnotatorPipeline` (K7). On `[Сохранить]`, accepted
 * regions (with pendingEdits applied) are emitted to
 * `onApplyAnnotatorResults` — K10 wires this to SingleInspector's
 * onUpdateEdits.
 *
 * Source-of-truth for state lives in the store; this component is
 * purely a controlled view + dispatch surface.
 */

import { useMemo } from 'react';
import { useStore } from '../../store';
import { selectAnnotator } from '../../store/uiSlice.js';
import { STRINGS } from '../../lib/strings';
import { getAllPlugins } from '../../lib/annotator-plugins';
import { runAnnotatorPipeline } from '../../lib/annotator-pipeline.js';
import TargetPreview from './TargetPreview.jsx';
import PluginPanel from './PluginPanel.jsx';
import ResultsPane from './ResultsPane.jsx';

const S = STRINGS.importer.annotator;

export default function Annotator({
  sequence,
  annotations,
  onApplyAnnotatorResults,
}) {
  const annotator = useStore(selectAnnotator);
  const closeAnnotator = useStore((s) => s.closeAnnotator);
  const togglePlugin = useStore((s) => s.togglePlugin);
  const setThreshold = useStore((s) => s.setAnnotatorThreshold);
  const setRunning = useStore((s) => s.setAnnotatorRunning);
  const setResult = useStore((s) => s.setAnnotatorResult);
  const acceptRegion = useStore((s) => s.acceptRegion);
  const rejectRegion = useStore((s) => s.rejectRegion);
  const editPendingRegion = useStore((s) => s.editPendingRegion);

  const plugins = useMemo(() => getAllPlugins(), []);

  const seqLength = (sequence || '').length;
  const scope = annotator.scope;
  const region = scope?.kind === 'region' ? scope.region : null;

  const handleRun = async () => {
    const enabled = annotator.enabledPluginIds || {};
    // Mark all enabled plugins as running upfront.
    for (const p of plugins) {
      if (enabled[p.id]) setRunning(p.id, true);
    }
    const { results, errors } = await runAnnotatorPipeline(
      sequence || '',
      region,
      enabled,
      {
        threshold: annotator.threshold,
        existingConfident: annotations || [],
        onPluginStart: (id) => setRunning(id, true),
        onPluginEnd: (id, res) => {
          setRunning(id, false);
          if (res) setResult(id, res);
        },
      },
    );
    // Final sweep — populate any plugin that the onPluginEnd hook
    // didn't catch (shouldn't happen, defensive). Also clear any
    // running flags for plugins that errored.
    for (const id of Object.keys(results)) setResult(id, results[id]);
    for (const id of Object.keys(errors)) setRunning(id, false);
  };

  const handleSave = () => {
    const accepted = annotator.acceptedRegionIds || {};
    const pending = annotator.pendingEdits || {};
    // Flatten all results, pick accepted, apply patches.
    const out = [];
    for (const res of Object.values(annotator.results || {})) {
      for (const region of res.regions || []) {
        const id = region.id || `${region.start}:${region.end}:${region.type || ''}:${region.name || ''}`;
        if (accepted[id]) {
          out.push({ ...region, ...(pending[id] || {}) });
        }
      }
    }
    onApplyAnnotatorResults?.(out);
  };

  const acceptedCount = Object.keys(annotator.acceptedRegionIds || {}).length;
  const rejectedCount = Object.keys(annotator.rejectedRegionIds || {}).length;
  const editedCount = Object.keys(annotator.pendingEdits || {}).length;

  if (!annotator.open) return null;

  return (
    <div
      data-testid="annotator-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'var(--surface-0, #fafaf9)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 16px',
          borderBottom: '0.5px solid var(--border-default, #d4d4d4)',
          background: 'var(--surface-1, #fff)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          data-testid="annotator-back-button"
          onClick={closeAnnotator}
          style={{
            padding: '4px 10px',
            background: 'transparent',
            border: '0.5px solid var(--border-default, #d4d4d4)',
            borderRadius: 'var(--radius-sm, 3px)',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--text-primary, #111)',
          }}
        >{S.backButton}</button>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{S.title}</div>
        <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }} data-testid="annotator-scope-info">
          {scope?.kind === 'region' && scope.region
            ? S.scopeRegion(scope.region.start + 1, scope.region.end)
            : S.scopeFull}
        </div>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{S.thresholdLabel(annotator.threshold)}</span>
          <input
            type="range"
            data-testid="annotator-threshold-slider"
            min={0}
            max={1}
            step={0.05}
            value={annotator.threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </label>
      </div>

      {/* TargetPreview */}
      <div style={{ padding: '8px 16px', flexShrink: 0 }}>
        <TargetPreview annotations={annotations} sequenceLength={seqLength} scope={scope} />
      </div>

      {/* Body — plugin panel + results pane */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <PluginPanel
          plugins={plugins}
          enabledPluginIds={annotator.enabledPluginIds}
          running={annotator.running}
          results={annotator.results}
          onToggle={togglePlugin}
          onRun={handleRun}
          runtimeContext={{ sequenceLength: seqLength, hasNetwork: typeof navigator !== 'undefined' ? !!navigator.onLine : true }}
        />
        <ResultsPane
          results={annotator.results}
          acceptedRegionIds={annotator.acceptedRegionIds}
          rejectedRegionIds={annotator.rejectedRegionIds}
          pendingEdits={annotator.pendingEdits}
          threshold={annotator.threshold}
          onAccept={acceptRegion}
          onReject={rejectRegion}
          onEditPatch={editPendingRegion}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '8px 16px',
          borderTop: '0.5px solid var(--border-default, #d4d4d4)',
          background: 'var(--surface-1, #fff)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          flexShrink: 0,
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
          disabled={acceptedCount === 0}
          onClick={handleSave}
          style={{
            padding: '6px 14px',
            background: acceptedCount > 0 ? 'var(--accent-500, #f97316)' : 'var(--surface-2, #e7e5e4)',
            color: acceptedCount > 0 ? '#fff' : 'var(--text-tertiary)',
            border: 'none',
            borderRadius: 'var(--radius-sm, 3px)',
            cursor: acceptedCount > 0 ? 'pointer' : 'not-allowed',
            fontSize: 12,
            fontWeight: 500,
          }}
        >{acceptedCount > 0 ? S.saveCount(acceptedCount) : S.saveButton}</button>
      </div>
    </div>
  );
}

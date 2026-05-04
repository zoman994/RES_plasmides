/**
 * AnnotatorProgressBar — Sprint M-X.3 follow-up (05.05.2026).
 *
 * Biolog: «давай только мы еще прогресс бар прикрутим чтобы человек
 * видел что оно грузится а не прсто зависло. аннотация требует
 * времени». Common-features-homology + ORF scan + σ70 PWM all run
 * synchronously but the homology DB scan can take 200–800 ms on
 * larger plasmids. Without a visible cue the modal looks frozen.
 *
 * Reads `state.annotator.running` (a `{[pluginId]: boolean}` map)
 * and `state.annotator.results` to surface the FIRST currently-
 * running plugin's display name. Resolves the display name via the
 * plugin registry; falls back to the raw id if the registry doesn't
 * know about it (defensive — mock plugins in tests use synthetic
 * ids).
 *
 * The bar renders nothing when no plugin is running, so callers can
 * mount it unconditionally without managing visibility state.
 *
 * Animation lives in index.css (`@keyframes annotator-progress-slide`
 * + `.annotator-progress-bar-fill`) — an indeterminate stripe loops
 * left-to-right at ~1.6 s per cycle.
 */

import { useStore } from '../../store';
import { selectAnnotator } from '../../store/uiSlice.js';
import { getPluginById } from '../../lib/annotator-plugins';
import { STRINGS } from '../../lib/strings';

const S = STRINGS.importer.annotator;

export default function AnnotatorProgressBar() {
  const running = useStore((s) => selectAnnotator(s).running) || {};
  // Pick the first running plugin id. `Object.keys` order matches
  // insertion order in V8/SpiderMonkey for string keys, which is
  // good enough for «show one of them» semantics.
  const runningId = Object.keys(running).find((id) => running[id]);
  if (!runningId) return null;
  const plugin = getPluginById(runningId);
  const displayName = (plugin && plugin.name) || runningId;

  return (
    <div
      data-testid="annotator-progress-bar"
      data-plugin-id={runningId}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: 'var(--surface-2, #f5f5f4)',
        borderBottom: '0.5px solid var(--border-default, #d4d4d4)',
        fontSize: 11,
        color: 'var(--text-secondary, #57534e)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <span style={{ fontWeight: 500 }}>{S.progressRunning(displayName)}</span>
      {/* Indeterminate stripe — the .annotator-progress-bar-fill class
          owns the keyframes animation defined in index.css. */}
      <div
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: 2,
          overflow: 'hidden',
          background: 'transparent',
        }}
      >
        <div
          className="annotator-progress-bar-fill"
          style={{
            width: '40%',
            height: '100%',
            background: 'var(--accent-500, #f97316)',
            borderRadius: 1,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Annotator/ResultRow — Sprint M-X.2 K8.
 *
 * One row of a plugin's results pane: name + uiCoords + confidence
 * pill + 3 buttons (Принять / Отклонить / Редактировать).
 *
 * Status (accepted / rejected / pending) reflected via row
 * background tint + button highlighting. The Edit button toggles
 * inline-edit mode (name + coords inputs).
 */

import { useState } from 'react';
import { STRINGS } from '../../lib/strings';
import { toUiCoords } from '../../lib/annotation-edit.js';

const S = STRINGS.importer.annotator;

export default function ResultRow({
  region,
  pendingPatch,
  isAccepted,
  isRejected,
  onAccept,
  onReject,
  onEditPatch,
  // 2026-05-06 round-16 — biolog: «нужно чтобы когда нажимаешь на имя
  // комон фичи она тебя телепортировала на нее в сиквенс вью». Click
  // on the name span calls onLocate(region) so the parent can scroll
  // the embedded SequenceView to region.start.
  onLocate,
}) {
  const [editing, setEditing] = useState(false);
  const merged = { ...region, ...(pendingPatch || {}) };
  const ui = toUiCoords(merged.start, merged.end);

  const stateBg = isAccepted
    ? 'rgba(34, 197, 94, 0.10)'
    : isRejected
      ? 'rgba(239, 68, 68, 0.10)'
      : 'transparent';

  return (
    <div
      data-testid="annotator-result-row"
      data-region-id={merged.id || ''}
      data-state={isAccepted ? 'accepted' : isRejected ? 'rejected' : 'pending'}
      style={{
        display: 'flex', flexDirection: 'column',
        gap: 4, padding: '6px 8px',
        borderRadius: 'var(--radius-sm, 3px)',
        background: stateBg,
        fontSize: 11,
        border: '0.5px solid var(--border-default, #d4d4d4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          data-testid="annotator-result-locate"
          onClick={() => onLocate?.(merged)}
          title="Перейти к этой фиче в Sequence view"
          disabled={typeof onLocate !== 'function'}
          style={{
            flex: 1,
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            padding: 0,
            fontWeight: 500,
            fontSize: 11,
            color: 'var(--text-primary, #111)',
            cursor: typeof onLocate === 'function' ? 'pointer' : 'default',
            textDecoration: typeof onLocate === 'function' ? 'underline dotted color-mix(in srgb, currentColor 40%, transparent)' : 'none',
            textUnderlineOffset: 2,
          }}
        >
          {merged.name || merged.type || '(unnamed)'}
        </button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
          {ui.uiStart}..{ui.uiEnd}
        </span>
        {Number.isFinite(merged.confidence) ? (
          // UX-016 — was a plain «91%» text pill. pLannotate-style
          // visual bar gives biolog a glance-readable signal: green
          // ≥90 «strong», amber 75-89 «moderate», gray <75 «weak».
          // Width tracks score so high-confidence rows pop visually
          // before user even reads the number.
          (() => {
            const pct = Math.max(0, Math.min(1, merged.confidence));
            const band = pct >= 0.90 ? 'strong' : pct >= 0.75 ? 'moderate' : 'weak';
            const fill = band === 'strong'
              ? 'color-mix(in srgb, #16a34a 70%, transparent)'   // green
              : band === 'moderate'
                ? 'color-mix(in srgb, #f59e0b 70%, transparent)' // amber
                : 'color-mix(in srgb, #9ca3af 60%, transparent)'; // gray
            const label = `${(pct * 100).toFixed(0)}%`;
            return (
              <span
                title={`Confidence: ${label} (${band})`}
                aria-label={`confidence ${label} ${band}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '1px 5px', borderRadius: 8, fontSize: 9,
                  background: 'var(--surface-2, #f5f5f4)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span aria-hidden="true" style={{
                  display: 'inline-block', width: 24, height: 5,
                  borderRadius: 3, background: 'rgba(0,0,0,0.08)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <span style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${(pct * 100).toFixed(0)}%`,
                    background: fill,
                  }} />
                </span>
                {label}
              </span>
            );
          })()
        ) : null}
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            data-testid="annotator-result-name-input"
            defaultValue={merged.name || ''}
            onBlur={(e) => {
              if (e.target.value !== (region.name || '')) {
                onEditPatch?.({ name: e.target.value });
              }
              setEditing(false);
            }}
            style={{
              flex: 1, padding: '2px 6px', fontSize: 11,
              border: '0.5px solid var(--accent-500, #f97316)',
              borderRadius: 'var(--radius-sm, 3px)',
              // Bug-rush #26: explicit theme-aware fill so dark mode
              // doesn't fall back to the browser's white default.
              background: 'var(--surface-1, #fff)',
              color: 'var(--text-primary, #111)',
              outline: 'none',
            }}
            autoFocus
          />
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          type="button"
          data-testid="annotator-result-accept"
          onClick={onAccept}
          style={{
            flex: 1, padding: '3px 6px',
            border: '0.5px solid var(--border-default)',
            background: isAccepted ? 'rgba(34, 197, 94, 0.30)' : 'transparent',
            cursor: 'pointer', fontSize: 10,
            borderRadius: 'var(--radius-sm)',
          }}
        >{isAccepted ? S.resultAccepted : S.resultAccept}</button>
        <button
          type="button"
          data-testid="annotator-result-reject"
          onClick={onReject}
          style={{
            flex: 1, padding: '3px 6px',
            border: '0.5px solid var(--border-default)',
            background: isRejected ? 'rgba(239, 68, 68, 0.30)' : 'transparent',
            cursor: 'pointer', fontSize: 10,
            borderRadius: 'var(--radius-sm)',
          }}
        >{isRejected ? S.resultRejected : S.resultReject}</button>
        <button
          type="button"
          data-testid="annotator-result-edit"
          onClick={() => setEditing(!editing)}
          style={{
            padding: '3px 8px',
            border: '0.5px solid var(--border-default)',
            background: 'transparent',
            cursor: 'pointer', fontSize: 10,
            borderRadius: 'var(--radius-sm)',
          }}
        >{S.resultEdit}</button>
      </div>
    </div>
  );
}

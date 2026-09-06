/**
 * FeatureLocationEditor — B1-ui canonical location editor.
 *
 * Renders an annotation's geometry as ordered, 1-based inclusive segment rows
 * (the coordinate system a biologist reads). A single-segment feature is one
 * row; a compound JOIN/ORDER feature is one row per segment in traversal order,
 * including a circular origin crossing (`901–1000`, then `1–50`).
 *
 * Presentational only: it owns no coordinate model. The parent (FeatureEditorModal)
 * holds the `{ uiStart, uiEnd }` rows, converts them to a canonical 0-based
 * half-open `location { kind, segments }` on Save, and passes the coherence
 * verdict back down as `error`. That keeps the ±1 boundary in exactly one place
 * (the modal's Save handler via `fromUiSegment`) and never here.
 *
 * Design tokens + i18n only — no hardcoded greys, no bare hex outside the
 * central danger token fallback.
 */
import { STRINGS } from '../../../lib/strings';
import { Icon } from '../../icons/Icon';

const S = STRINGS.importer;

const UI_DASH = '–';

function rowInputStyle() {
  return {
    fontSize: 12,
    padding: '4px 6px',
    fontFamily: 'var(--font-mono)',
    background: 'var(--surface-1)',
    color: 'var(--text-primary)',
    border: '0.5px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    width: 90,
  };
}

export default function FeatureLocationEditor({
  segments = [],
  onChangeSegment,
  onAddSegment,
  onRemoveSegment,
  allowCompound = true,
  error = null,
}) {
  const compound = segments.length > 1;
  return (
    <div
      data-testid="feature-location-editor"
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {segments.map((seg, i) => (
        <div
          key={`seg-${i}`}
          data-testid="feature-location-row"
          style={{ display: 'flex', gap: 8, alignItems: 'center' }}
        >
          {compound && (
            <span
              style={{ fontSize: 9, color: 'var(--text-tertiary)', width: 62, flexShrink: 0 }}
            >{S.featureEditorLocationSegmentLabel(i + 1)}</span>
          )}
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{S.featureEditorCoordsStart}</span>
          <input
            data-testid={`feature-location-start-${i}`}
            type="number"
            value={String(seg.uiStart ?? '')}
            aria-label={`${S.featureEditorLocationSegmentLabel(i + 1)} ${S.featureEditorCoordsStart}`}
            onChange={(e) => onChangeSegment?.(i, { uiStart: e.target.value })}
            style={rowInputStyle()}
            min={1}
          />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{UI_DASH}</span>
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{S.featureEditorCoordsEnd}</span>
          <input
            data-testid={`feature-location-end-${i}`}
            type="number"
            value={String(seg.uiEnd ?? '')}
            aria-label={`${S.featureEditorLocationSegmentLabel(i + 1)} ${S.featureEditorCoordsEnd}`}
            onChange={(e) => onChangeSegment?.(i, { uiEnd: e.target.value })}
            style={rowInputStyle()}
            min={1}
          />
          {allowCompound && compound && (
            <button
              type="button"
              data-testid={`feature-location-remove-${i}`}
              onClick={() => onRemoveSegment?.(i)}
              aria-label={S.featureEditorLocationRemoveSegmentAria}
              title={S.featureEditorLocationRemoveSegmentAria}
              style={{
                fontSize: 11,
                padding: '4px 7px',
                background: 'transparent',
                color: 'var(--danger-fg)',
                border: '0.5px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
            ><Icon name="close" size={14} /></button>
          )}
        </div>
      ))}

      {allowCompound && (
        <button
          type="button"
          data-testid="feature-location-add"
          onClick={() => onAddSegment?.()}
          style={{
            alignSelf: 'flex-start',
            fontSize: 11,
            padding: '4px 10px',
            background: 'transparent',
            color: 'var(--text-primary)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
          }}
        >{S.featureEditorLocationAddSegment}</button>
      )}

      {error && (
        <div
          data-testid="feature-location-error"
          role="alert"
          style={{
            fontSize: 11,
            color: 'var(--danger-fg)',
            background: 'var(--danger-bg)',
            border: '0.5px solid var(--danger-fg)',
            borderRadius: 'var(--radius-sm)',
            padding: '5px 8px',
          }}
        >{error}</div>
      )}
    </div>
  );
}

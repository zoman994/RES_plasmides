import { useState, useCallback } from 'react';
import PlasmidMiniMap from '../PlasmidMiniMap';
import AnnotationEditor from '../AnnotationEditor';
import { WORKSPACE_STRINGS as W } from './lib/workspace-strings';

/**
 * LeftPane (M-B.1 K4, DEC-IMP-12 ⚓).
 *
 * Stack: map preview → annotation editor → start-point + auto-annotate
 * controls. PlasmidMiniMap was chosen over PlasmidMap (the spec K4 text
 * suggested PlasmidMap) because:
 *   - PlasmidMap is 600×600 px, RE-controls-coupled, assembly-aware — way
 *     more than the Importer's compact 380 px column needs.
 *   - PlasmidMiniMap is read-only, single-molecule by design, no v0.6-store
 *     coupling, fits 280–340 px square.
 *   - Container Window M-C/M-D may swap to PlasmidMap with edit affordances
 *     when commits land. The mini-map decision is per-wrapper, not per
 *     MoleculeWorkspace, so this stays composable.
 *
 * AnnotationEditor reuses cleanly: no commits[] dependency, supports
 * `selectedAnnotation` + `onSelect` + `readOnly`. If `onAnnotationChange` is
 * undefined we render the editor in read-only mode.
 *
 * Start-point UI shows only if `onOriginRotate` is defined and topology is
 * circular (rotating linear molecule offset would reframe ends meaningfully
 * and is out of scope here). Auto-annotate toggle shows only if
 * `onAutoAnnotateToggle` is defined.
 */
export default function LeftPane({
  sequence,
  annotations,
  topology,
  originOffset,
  onAnnotationChange,
  onOriginRotate,
  autoAnnotateEnabled,
  onAutoAnnotateToggle,
  selectedAnnotation,
  onSelectAnnotation,
}) {
  const length = sequence?.length || 0;
  const annotationsReadOnly = typeof onAnnotationChange !== 'function';
  const showStartPoint = typeof onOriginRotate === 'function';
  const showAutoAnnotate = typeof onAutoAnnotateToggle === 'function';

  const [draftOffset, setDraftOffset] = useState(String(originOffset ?? 0));

  const onApplyOrigin = useCallback(() => {
    const n = parseInt(draftOffset, 10);
    if (Number.isFinite(n) && n >= 0 && n < length && typeof onOriginRotate === 'function') {
      onOriginRotate(n);
    }
  }, [draftOffset, length, onOriginRotate]);

  return (
    <div
      data-testid="molecule-workspace-left"
      style={{
        width: 380,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 14,
        borderRight: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-1, #fff)',
        overflowY: 'auto',
      }}
    >
      <PaneHeader
        title={W.paneMapTitle}
        meta={topology === 'circular' ? W.topologyCircular : W.topologyLinear}
      />
      <div
        data-testid="molecule-workspace-minimap"
        style={{ display: 'flex', justifyContent: 'center' }}
      >
        <PlasmidMiniMap
          length={length}
          topology={topology}
          annotations={annotations}
          size={300}
          mode="overlay"
          disableHoverOverlay
        />
      </div>

      {showStartPoint && (
        <div
          data-testid="molecule-workspace-startpoint"
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {W.startPointLabel}
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="number"
              min={0}
              max={Math.max(0, length - 1)}
              value={draftOffset}
              onChange={(e) => setDraftOffset(e.target.value)}
              data-testid="molecule-workspace-origin-input"
              disabled={topology !== 'circular'}
              style={{
                flex: 1,
                fontSize: 12,
                padding: '4px 8px',
                border: '0.5px solid var(--border-default, #d6d3d1)',
                borderRadius: 'var(--radius-sm, 4px)',
                background: topology === 'circular' ? 'var(--surface-1)' : 'var(--surface-2)',
              }}
            />
            <button
              type="button"
              onClick={onApplyOrigin}
              data-testid="molecule-workspace-origin-apply"
              disabled={topology !== 'circular'}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                border: '0.5px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                background: topology === 'circular' ? 'var(--surface-2)' : 'var(--surface-2)',
                cursor: topology === 'circular' ? 'pointer' : 'not-allowed',
                opacity: topology === 'circular' ? 1 : 0.5,
              }}
            >{W.startPointApply}</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {topology === 'circular' ? W.startPointHint : W.startPointDisabledHint}
          </div>
        </div>
      )}

      {showAutoAnnotate && (
        <label
          data-testid="molecule-workspace-autoannotate"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!autoAnnotateEnabled}
            onChange={(e) => onAutoAnnotateToggle(e.target.checked)}
            data-testid="molecule-workspace-autoannotate-input"
          />
          <span>{W.autoAnnotateLabel}</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {autoAnnotateEnabled ? W.autoAnnotateOnHint : W.autoAnnotateOffHint}
          </span>
        </label>
      )}

      <PaneHeader title={W.paneAnnotationsTitle} meta={`${annotations?.length || 0}`} />
      <div
        data-testid="molecule-workspace-annotation-editor"
        style={{
          flex: 1,
          minHeight: 120,
          border: '0.5px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface-base)',
          padding: '6px 8px',
          overflowY: 'auto',
        }}
      >
        <AnnotationEditor
          annotations={annotations || []}
          seqLength={length}
          onChange={onAnnotationChange || (() => {})}
          readOnly={annotationsReadOnly}
          compact
          hideBar
          selectedAnnotation={selectedAnnotation}
          onSelect={onSelectAnnotation}
        />
      </div>

      <SelectionFooter selectedAnnotation={selectedAnnotation} />
    </div>
  );
}

function PaneHeader({ title, meta }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      borderBottom: '0.5px solid var(--border-subtle)',
      paddingBottom: 4,
    }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{title}</div>
      {meta != null && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{meta}</div>
      )}
    </div>
  );
}

function SelectionFooter({ selectedAnnotation }) {
  return (
    <div
      data-testid="molecule-workspace-selection-footer"
      data-has-selection={selectedAnnotation ? 'true' : 'false'}
      style={{
        fontSize: 11,
        color: selectedAnnotation ? 'var(--accent-text, #92400e)' : 'var(--text-tertiary)',
        padding: '6px 0',
        borderTop: '0.5px solid var(--border-subtle)',
      }}
    >
      {selectedAnnotation
        ? W.selectedAnnotationFooter(
            selectedAnnotation.name || '—',
            selectedAnnotation.start || 0,
            selectedAnnotation.end || 0,
          )
        : W.selectionEmpty}
    </div>
  );
}

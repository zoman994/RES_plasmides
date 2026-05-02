import { useCallback, useEffect, useMemo, useRef } from 'react';
import { STRINGS } from '../../../lib/strings';
import { rotateOriginToPosition } from '../../../rotate-origin';
import { enrichAnnotations } from '../../../file-import';
import MoleculeWorkspace from '../../MoleculeWorkspace';
import MultiFileList from '../inspectors/MultiFileList';

const S = STRINGS.importer;

/**
 * Step 2 (Combined view) — M-B.1 K5.
 *
 * Wraps `<MoleculeWorkspace/>` per DEC-IMP-12 ⚓ contract:
 *   sequenceReadOnly   = true                       (Importer never edits sequence)
 *   gaps               = undefined                  (BLAST is M-D, not Importer)
 *   onBlastGap         = undefined
 *   onAnnotationChange = updateEdits(editedAnnotations)
 *   onOriginRotate     = freezes rotated sequence + annotations into edits,
 *                        resets originOffset to 0 (re-anchored coord space)
 *   onAutoAnnotateToggle = updateFlags(autoAnnotate); side-effect re-runs
 *                          enrichAnnotations and writes into edited cache
 *
 * Multi-file: when parsedItems.length > 1, MultiFileList sidebar renders on
 * the left (280 px). Click a card → setCurrentIdx. Per-file edits live in
 * perFileEdits[fileName] / perFileFlags[fileName] so switching never drops
 * biolog work.
 *
 * Display ordering:
 *   sequence       = edits.editedSequence ?? parsed.sequence
 *   annotations    = edits.editedAnnotations
 *                    ?? (flags.autoAnnotate ? edits.enrichedCache : null)
 *                    ?? parsed.annotations
 * Origin rotation applies into edits AT APPLY TIME (not on every render),
 * so `editedSequence` is the source of truth post-rotation. The Apply
 * button on LeftPane fires `onOriginRotate(newOffset)`; we run
 * `rotateOriginToPosition` and cache the result.
 */
export default function Step2Combined({
  state,
  target,
  onCancel,
  onBack,
  onConfirm,
  busyConfirm = false,
}) {
  const items = state.parsedItems;
  const idx = Math.min(state.currentIdx, Math.max(0, items.length - 1));
  const currentItem = items[idx];
  const fileName = currentItem?._fileName;
  const flags = (fileName && state.perFileFlags[fileName]) || { autoAnnotate: true };
  const edits = (fileName && state.perFileEdits[fileName]) || {};

  // Track last-enriched (autoAnnotate-flag, fileName) so we don't fire enrichment
  // on every render — only on toggle flip or file switch.
  const lastEnrichRef = useRef({ fileName: null, autoAnnotate: null });

  useEffect(() => {
    if (!currentItem || !fileName) return;
    if (currentItem._error || !currentItem.sequence) return;
    const last = lastEnrichRef.current;
    if (last.fileName === fileName && last.autoAnnotate === flags.autoAnnotate) return;
    lastEnrichRef.current = { fileName, autoAnnotate: flags.autoAnnotate };

    if (flags.autoAnnotate) {
      let cancelled = false;
      enrichAnnotations(currentItem, { autoAnnotate: true }).then(out => {
        if (cancelled) return;
        // Only overwrite if biolog hasn't manually edited yet.
        const e = state.perFileEdits[fileName] || {};
        if (e.editedAnnotations) return;
        state.updateEdits(fileName, { enrichedCache: out.annotations || [] });
      }).catch(() => { /* enrichment is best-effort */ });
      return () => { cancelled = true; };
    }
    // Toggle OFF — clear cache so display falls back to file-only annotations.
    state.updateEdits(fileName, { enrichedCache: undefined });
    return undefined;
  }, [fileName, flags.autoAnnotate, currentItem, state]);

  const displaySequence = edits.editedSequence ?? currentItem?.sequence ?? '';
  const displayAnnotations = useMemo(() => {
    if (Array.isArray(edits.editedAnnotations)) return edits.editedAnnotations;
    if (flags.autoAnnotate && Array.isArray(edits.enrichedCache)) return edits.enrichedCache;
    return currentItem?.annotations || [];
  }, [edits.editedAnnotations, edits.enrichedCache, flags.autoAnnotate, currentItem]);

  const onAnnotationChange = useCallback((next) => {
    if (!fileName) return;
    state.updateEdits(fileName, { editedAnnotations: next });
  }, [fileName, state]);

  const onOriginRotate = useCallback((newOffset) => {
    if (!fileName || !currentItem) return;
    if (currentItem.topology !== 'circular') return;
    const seq = displaySequence;
    const anns = displayAnnotations;
    const length = seq.length;
    if (!length || !Number.isFinite(newOffset) || newOffset < 0 || newOffset >= length) return;
    if (newOffset === 0) return;
    const out = rotateOriginToPosition(seq, anns, newOffset + 1, { topology: 'circular' });
    state.updateEdits(fileName, {
      editedSequence: out.sequence,
      editedAnnotations: out.annotations,
    });
  }, [fileName, currentItem, displaySequence, displayAnnotations, state]);

  const onAutoAnnotateToggle = useCallback((next) => {
    if (!fileName) return;
    state.updateFlags(fileName, { autoAnnotate: !!next });
  }, [fileName, state]);

  const showSidebar = items.length > 1;

  if (!currentItem) {
    return (
      <div
        data-testid="importer-step2-empty"
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-tertiary)', fontSize: 14 }}
      >{S.noFilesYet}</div>
    );
  }

  return (
    <div
      data-testid="importer-step2"
      data-current-file={fileName}
      style={{ flex: 1, display: 'flex', minHeight: 0 }}
    >
      {showSidebar && (
        <MultiFileList
          items={items}
          currentIdx={idx}
          perFileFlags={state.perFileFlags}
          onSelect={state.setCurrentIdx}
          onToggleAutoAnnotate={(fn, v) => state.updateFlags(fn, { autoAnnotate: v })}
          onApplyAllAutoAnnotate={(v) => {
            for (const it of items) {
              if (it._fileName) state.updateFlags(it._fileName, { autoAnnotate: v });
            }
          }}
        />
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <MoleculeWorkspace
          sequence={displaySequence}
          annotations={displayAnnotations}
          topology={currentItem.topology || 'linear'}
          ends={currentItem.ends}
          originOffset={0}
          onAnnotationChange={onAnnotationChange}
          onOriginRotate={onOriginRotate}
          autoAnnotateEnabled={!!flags.autoAnnotate}
          onAutoAnnotateToggle={onAutoAnnotateToggle}
          sequenceReadOnly
          name={currentItem.name || fileName}
        />
        <Step2Footer
          target={target}
          onCancel={onCancel}
          onBack={onBack}
          onConfirm={onConfirm}
          busyConfirm={busyConfirm}
        />
      </div>
    </div>
  );
}

function Step2Footer({ target, onCancel, onBack, onConfirm, busyConfirm }) {
  return (
    <div
      data-testid="importer-step2-footer"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 18px',
        borderTop: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-1, #fff)',
      }}
    >
      <button
        type="button"
        data-testid="importer-step2-back"
        onClick={onBack}
        style={{
          padding: '6px 12px', fontSize: 13,
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'transparent', color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >{S.back}</button>
      <div style={{ flex: 1, fontSize: 11, color: 'var(--text-tertiary)' }}>
        {target === 'library' ? S.confirmHintLibrary : S.confirmHintProject}
      </div>
      <button
        type="button"
        data-testid="importer-cancel"
        onClick={onCancel}
        style={{
          padding: '6px 12px', fontSize: 13,
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'transparent', color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >{S.cancel}</button>
      <button
        type="button"
        data-testid="importer-confirm"
        onClick={onConfirm}
        disabled={busyConfirm}
        style={{
          padding: '6px 14px', fontSize: 13,
          border: '0.5px solid var(--accent-500, #f59e0b)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--accent-500, #f59e0b)',
          color: 'var(--surface-1, #fff)',
          cursor: busyConfirm ? 'not-allowed' : 'pointer',
          opacity: busyConfirm ? 0.6 : 1,
        }}
      >{busyConfirm ? S.confirmBusy : S.confirm}</button>
    </div>
  );
}

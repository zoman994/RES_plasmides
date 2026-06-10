/**
 * useAssemblyPrimerWriting — assembly-sequence primer writing (G2
 * DEC-CANVAS-ASM-19/20). Reuses the F3 V72/V74 mechanism: the SAME
 * hotkey ids (`pcr-primer-forward` / `pcr-primer-reverse`, scoped by
 * handler lifecycle — only one shell mounts at a time) + the shared
 * SequenceView `onWritePrimer` right-click prop. The dispatch differs:
 * primers attach to the assembly DRAFT, not an op.
 *
 * Returns viewer-shaped primers (PrimerTrack contract) so they render
 * back ON the assembly sequence, cross-boundary ones flagged.
 */
import { useCallback, useMemo } from 'react';
import { useHotkey } from '../../../../lib/hotkeys';

const EMPTY = [];

export function useAssemblyPrimerWriting({
  draftId, caretAnchor, caretPos, actions, state,
}) {
  const primers = (state.assemblyDraftPrimers && state.assemblyDraftPrimers[draftId]) || EMPTY;

  const writePrimerForRange = useCallback((direction, lo, hi, extra = {}) => {
    if (!draftId) return;
    if (!(hi - lo >= 1)) {
      actions.showToast({ kind: 'info', message: 'Выдели участок ДНК на последовательности' });
      return;
    }
    actions.writeAssemblyPrimer({
      draftId,
      range: { start: lo, end: hi },
      direction,
      source: 'manual',
      // 18.05.2026 — primer-from-selection modal: optional name + an
      // edited PSO override (empty → reducer auto-names / range-derives).
      name: extra.name,
      sequence: extra.sequence,
    });
  }, [draftId, actions]);

  const writeStrand = useCallback((direction) => {
    writePrimerForRange(
      direction,
      Math.min(caretAnchor, caretPos),
      Math.max(caretAnchor, caretPos),
    );
  }, [writePrimerForRange, caretAnchor, caretPos]);

  const onWritePrimer = useCallback(({
    direction, start, end, name, sequence,
  }) => {
    writePrimerForRange(
      direction === 'reverse' ? 'reverse' : 'forward',
      Math.min(start, end), Math.max(start, end),
      { name, sequence },
    );
  }, [writePrimerForRange]);

  const writeForward = useCallback(() => writeStrand('forward'), [writeStrand]);
  const writeReverse = useCallback(() => writeStrand('reverse'), [writeStrand]);
  useHotkey('pcr-primer-forward', writeForward);
  useHotkey('pcr-primer-reverse', writeReverse);

  const viewerPrimers = useMemo(() => primers.map((p) => ({
    // id forwarded so a viewer hit identifies the primer (Del-to-delete,
    // selection). Without it `hit.id` is undefined and removeAssemblyPrimer
    // can't target the right record.
    id: p.id,
    name: p.name,
    sequence: p.sequence,
    bindingSequence: p.bindingSequence,
    // Overlap 5'-overhang — forwarded so PrimerTrack draws the tail segment
    // (without it the two internal overlap-PCR primers render butted at the
    // boundary). Empty/absent for terminal primers → no tail drawn.
    tail: p.tail,
    direction: p.direction,
    tmBinding: p.tm,
    crossesBoundaries: p.crossesBoundaries,
  })), [primers]);

  return { onWritePrimer, primers: viewerPrimers, rawPrimers: primers };
}

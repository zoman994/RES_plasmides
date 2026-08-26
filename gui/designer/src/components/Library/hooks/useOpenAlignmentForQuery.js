/**
 * useOpenAlignmentForQuery — the exit from the §4.2.0 length route.
 *
 * A query longer than the approximate limit is never compared approximately, so the search offers
 * alignment instead. This hook is what makes that offer real rather than a sentence with nothing
 * behind it. It lives outside `LibraryWorkspace` because it is search-owned behaviour, and because
 * the workspace had reached its size ceiling — shaving comments to fit would have hidden that.
 *
 * ADDITIVE on purpose. `openAlignmentWith` (the «Align» action on an entry) REPLACES the
 * inputs; doing that here would wipe an alignment the user is in the middle of. Appending also
 * lands the right biology for free: with a molecule already loaded as the reference, the pasted
 * insert joins as a READ — «where does my insert sit in this plasmid» — and the engine's own
 * defaults (local mode, reverse complement tried) are already the ones that question needs.
 *
 * The caller must pass the SEQUENCE, not the query text: `seq:ACGT…` or a compound
 * `pUC19 seq:ACGT…` would otherwise arrive as if the prefix and the text term were bases.
 *
 * Appending can also be REFUSED — the sequence is already an input, or the list is at
 * MAX_ALIGN_INPUTS — and refusing quietly is what made the route dishonest: the workspace
 * opened and the pasted query simply was not in it. Each refusal is named out loud instead.
 */
import { useCallback } from 'react';
import { useStore } from '../../../store';
import { t, tf } from '../../../i18n';

export function useOpenAlignmentForQuery() {
  const addAlignInput = useStore((s) => s.addAlignInput);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const showToast = useStore((s) => s.showToast);

  return useCallback((query) => {
    const sequence = (query || '').trim();
    if (!sequence) return; // nothing to align; opening an empty workspace would just be a jump
    const outcome = addAlignInput({
      name: tf('search.requiresAlignment.inputName', { len: sequence.length }),
      sequence,
      source: 'search',
    });
    // A refusal still opens the workspace — for a duplicate the sequence the user came to
    // see is already in there, and for a full list that is where they prune it — but it
    // says which of the two happened. A successful add needs no toast: the new input IS
    // the feedback, and a «done» pop-up on every route would be noise.
    if (outcome?.reason === 'duplicate') {
      showToast(t('search.requiresAlignment.duplicate'), 'info');
    } else if (outcome?.reason === 'capacity') {
      // The real cap comes back with the refusal, so the number the user reads is the
      // number the slice enforces — never a second copy that can drift from it.
      showToast(tf('search.requiresAlignment.capacity', { max: outcome.limit }), 'warning');
    }
    setActiveWorkspace('align');
  }, [addAlignInput, setActiveWorkspace, showToast]);
}

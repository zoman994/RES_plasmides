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
 */
import { useCallback } from 'react';
import { useStore } from '../../../store';
import { tf } from '../../../i18n';

export function useOpenAlignmentForQuery() {
  const addAlignInput = useStore((s) => s.addAlignInput);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);

  return useCallback((query) => {
    const sequence = (query || '').trim();
    if (!sequence) return; // nothing to align; opening an empty workspace would just be a jump
    addAlignInput({
      name: tf('search.requiresAlignment.inputName', { len: sequence.length }),
      sequence,
      source: 'search',
    });
    setActiveWorkspace('align');
  }, [addAlignInput, setActiveWorkspace]);
}

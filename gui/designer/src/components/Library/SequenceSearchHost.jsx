/**
 * SequenceSearchHost — mounts the in-molecule Ctrl+F popover for the entry selected in the Library,
 * and turns a canonical occurrence into a jump.
 *
 * It is a SIBLING of the inspector, not a child, so it cannot touch the caret directly: the jump
 * goes through the shared `navRequest` channel (P3), and the inspector consumes it. Keeping that
 * indirection visible is the point — a future edit that "simplifies" it into a direct call would
 * silently break cross-project navigation.
 *
 * The molecule is handed to the popover as a canonical SearchDocument (`entryToDocument`), so the
 * popover searches the exact same normalized shape as every other surface. The click builds its nav
 * through `navFromLocation`, which keeps BOTH segments of an origin-crossing hit and the strand — a
 * circular match is never merged into one range. Revision is pinned so a mid-jump edit is caught as
 * stale, and the identity percent rides along as `identityBps / 10000`.
 */
import { useCallback, useMemo } from 'react';
import { useStore } from '../../store';
import { entryToDocument, entryRevision, displayedDocEpoch } from '../../lib/search-document-adapters';
import { navFromLocation } from '../../lib/nav-target';
import SequenceSearchPopover from '../SequenceSearchPopover';

export default function SequenceSearchHost({ item, edits }) {
  const open = useStore((s) => s.modals?.sequenceSearch);
  const close = useStore((s) => s.closeSequenceSearch);
  const requestSequenceNav = useStore((s) => s.requestSequenceNav);

  const doc = useMemo(() => (item ? entryToDocument(item) : null), [item]);
  // U5-B — Ctrl+F searches the document the biologist is LOOKING AT. It used to search the saved
  // molecule while the viewer showed the transient edit buffer, so on an unsaved indel every hit
  // was reported at coordinates that had already moved. Same rule as the global search, stated once:
  // the coordinates and the epoch that names them come from the same string.
  const displayedSequence = edits?.editedSequence ?? doc?.sequence?.seq ?? '';
  const displayedTopology = edits?.editedTopology ?? doc?.sequence?.topology;
  // Both counters come from the SAME place the consumer reads them, and the token is built by the
  // SAME function, so the epoch stamped here and the epoch checked there are one string or visibly
  // disagree. They were once built by two different functions that named a saved molecule `v2` and
  // `v2#g0`: every Ctrl+F jump on an unedited molecule failed the guard, silently and always.
  const bufferGeneration = useStore((s) => (item?.id ? s.bufferGenerations?.[item.id] : undefined));
  const entryGeneration = useStore((s) => (item?.id ? s.entryGenerations?.[item.id] : undefined));
  const displayedEpoch = displayedDocEpoch(item, edits, { entry: entryGeneration, buffer: bufferGeneration });

  const onJumpTo = useCallback((occ) => {
    if (!item?.id || !occ?.location) return;
    const nav = navFromLocation(occ.location, occ.metrics);
    if (!nav) return; // no segments — nothing to jump to
    requestSequenceNav(item.id, {
      // caret + scrollPos (primary segment) AND every segment (both, for a wrap) + strand.
      ...nav,
      // The document these coordinates describe — the buffer on screen, not «the entry».
      revision: entryRevision(item),
      docEpoch: displayedEpoch,
    });
  }, [item, displayedEpoch, requestSequenceNav]);

  return (
    <SequenceSearchPopover
      open={!!open}
      onClose={close}
      targetSequence={displayedSequence}
      targetTopology={displayedTopology}
      targetName={doc?.title || item?.id || null}
      entryId={item?.id || null}
      revision={doc?.ref?.revision}
      onJumpTo={onJumpTo}
    />
  );
}

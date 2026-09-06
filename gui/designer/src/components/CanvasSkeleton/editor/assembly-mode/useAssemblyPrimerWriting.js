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
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useHotkey } from '../../../../lib/hotkeys';
import { useStore } from '../../../../store';
import { physicalIdentityKey } from '../../../../lib/primer-identity';
import {
  assemblyPrimerSiteRepairPatch,
  canonicalAssemblyPrimerForDocument,
} from '../../lib/assembly-primer-site';

const EMPTY = [];

// PRIMER-TAIL-SAVE-1 — letters only, upper-cased (matches primer-identity).
function cleanOligo(s) {
  return typeof s === 'string' ? s.replace(/[^A-Za-z]/g, '').toUpperCase() : '';
}

function siteIdentityKey(site) {
  const target = site?.target;
  const segments = site?.location?.segments;
  if (!target?.entryId || !target?.resourceHash || !Array.isArray(segments)
    || segments.length === 0 || !Number.isFinite(site?.strand)) return null;
  const span = segments.map((segment) => `${segment?.start}-${segment?.end}`).join(',');
  return [
    target.entryId, target.resourceHash, target.topology || 'linear',
    site.location.kind || '', span, site.strand,
  ].join('|');
}

function mergeSites(existingSites, incomingSites) {
  const merged = Array.isArray(existingSites) ? existingSites.slice() : [];
  const byIdentity = new Map();
  merged.forEach((site, index) => {
    const key = siteIdentityKey(site);
    if (key && !byIdentity.has(key)) byIdentity.set(key, index);
  });
  for (const site of Array.isArray(incomingSites) ? incomingSites : []) {
    const key = siteIdentityKey(site);
    const index = key ? byIdentity.get(key) : -1;
    if (index != null && index >= 0) {
      merged[index] = { ...merged[index], ...site };
    } else {
      if (key) byIdentity.set(key, merged.length);
      merged.push(site);
    }
  }
  return merged;
}

// The canonical pool write for a draft primer. The id is deterministic, so a
// re-write is an upsert of the SAME row — an edit updates the row in place.
function buildPoolWrite(p, draftId, projectId, existingRow = null) {
  return {
    primer: {
      id: existingRow?.id || `asm-${draftId}-${p.id}`,
      name: p.label || p.name || 'primer',
      sequence: p.sequence || p.bindingSequence,
      bindingSequence: p.bindingSequence || null,
      bindingModel: p.bindingModel === 'aligned-v1' ? 'aligned-v1' : null,
      tail: typeof p.tail === 'string' ? p.tail : (p.tailSequence || ''),
      sites: mergeSites(existingRow?.sites, p.sites),
      direction: p.direction || null,
      // The 5′ tail is an overhang, not an annealing/Tm input — carry the
      // record's binding-derived Tm, never a tail-inflated one.
      tm: typeof p.tmBinding === 'number' ? p.tmBinding : p.tm,
      modifications: p.modifications,
    },
    projectId: projectId ?? null,
    status: 'designed',
    origin: existingRow?.origin
      || { kind: 'assembly-derived', draftId, draftPrimerId: p.id },
  };
}

// Does the pool row already reflect the draft primer's current physical split?
// Compared on the full oligo + tail + binding + bindingModel, so a tail added
// after the fact is re-synced while a Tm/name-only change is not churn.
function poolRowMatchesWrite(row, desired) {
  if (cleanOligo(row.sequence) !== cleanOligo(desired.sequence || desired.bindingSequence)) return false;
  if (cleanOligo(row.tail) !== cleanOligo(desired.tail)) return false;
  if (cleanOligo(row.bindingSequence) !== cleanOligo(desired.bindingSequence)) return false;
  const rowModel = row.bindingModel === 'aligned-v1' ? 'aligned-v1' : null;
  const draftModel = desired.bindingModel === 'aligned-v1' ? 'aligned-v1' : null;
  const rowSites = JSON.stringify(Array.isArray(row.sites) ? row.sites : []);
  const draftSites = JSON.stringify(Array.isArray(desired.sites) ? desired.sites : []);
  return rowModel === draftModel && rowSites === draftSites;
}


export function useAssemblyPrimerWriting({
  draftId, sequence = '', topology = 'linear', boundaries = [],
  caretAnchor, caretPos, actions, state,
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
      // PRIMER-TAIL-SAVE-1 — carry the edit target + canonical split so Save on
      // an existing primer edits it in place and keeps the 5′ tail an overhang.
      primerId: extra.primerId,
      tail: extra.tail,
      binding: extra.binding,
      bindingModel: extra.bindingModel,
      // B — transport modal tm: explicit null clears (indel/mismatch model),
      // explicit finite replaces, undefined omits so reducer preserves old tm.
      tm: extra.tm,
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
    direction, start, end, name, sequence, primerId, tail, binding, bindingModel, tm,
  }) => {
    writePrimerForRange(
      direction === 'reverse' ? 'reverse' : 'forward',
      Math.min(start, end), Math.max(start, end),
      {
        name, sequence, primerId, tail, binding, bindingModel, tm,
      },
    );
  }, [writePrimerForRange]);

  const writeForward = useCallback(() => writeStrand('forward'), [writeStrand]);
  const writeReverse = useCallback(() => writeStrand('reverse'), [writeStrand]);
  useHotkey('pcr-primer-forward', writeForward);
  useHotkey('pcr-primer-reverse', writeReverse);

  const canonicalPrimers = useMemo(
    () => primers.map((primer) => canonicalAssemblyPrimerForDocument(primer, {
      entryId: draftId, template: sequence, topology, boundaries,
    })),
    [boundaries, draftId, primers, sequence, topology],
  );

  // ── PRIMER-LIVE-1: an assembly primer is a REAL project record ───────────
  //
  // Assembly primers used to be drafts that the biolog had to promote into the
  // pool one button-click at a time, and anything they forgot to promote was
  // gone on the next recompute. The approved contract has no promotion step:
  // the primer exists in the project the moment it is derived.
  //
  // Idempotent on (draft primer id, physical identity). The finalizer
  // re-derives these on every skeleton change, so a sync that keyed on
  // anything less stable would grow a fresh copy of every primer each time the
  // canvas moved.
  //
  // Per-primer last-write-wins serialization (race fix):
  // Without this, a rapid create → tail-edit sequence could fire two concurrent
  // addPrimerToPool calls. The older create can resolve AFTER the tail-edit
  // upsert and silently overwrite the correct row. The previous updateKey guard
  // also skipped a newer edit if the guard was still held, with no retry.
  //
  // Fix: at most one write in flight per draft primer id (inflightRef). While
  // in flight, the latest desired payload is held in pendingRef (replacing any
  // prior pending). On completion, drain picks up the pending payload and
  // continues — never dropping a newer edit. Unmount guard prevents drain loops
  // from firing after the hook is torn down.
  const addPrimerToPool = useStore((s) => s.addPrimerToPool);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const primersById = useStore((s) => s.primersById);

  const inflightRef = useRef(new Map()); // primerId → in-flight Promise
  const pendingRef = useRef(new Map());  // primerId → latest payload waiting to run
  const unmountedRef = useRef(false);
  const addPrimerToPoolRef = useRef(addPrimerToPool);
  // Keep ref current so drain closures always call the live action, not a
  // stale one captured when the drain function was created.
  useEffect(() => { addPrimerToPoolRef.current = addPrimerToPool; }, [addPrimerToPool]);
  // Unmount guard: stop drain loops when the hook is torn down.
  // Setup explicitly resets the flag so React StrictMode's setup→cleanup→setup
  // cycle does not leave the live second mount treated as unmounted.
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; };
  }, []);

  // Drain reads only refs when invoked asynchronously from a .finally() callback,
  // so it never closes over stale render-time state. Plain function declaration
  // so ESLint react-hooks/refs never sees a drainRef render-time read/write.
  function drain(primerId) {
    if (unmountedRef.current) {
      inflightRef.current.delete(primerId);
      pendingRef.current.delete(primerId);
      return;
    }
    const payload = pendingRef.current.get(primerId);
    if (!payload) { inflightRef.current.delete(primerId); return; }
    pendingRef.current.delete(primerId);
    const p = Promise.resolve(addPrimerToPoolRef.current(payload));
    inflightRef.current.set(primerId, p);
    p.finally(() => drain(primerId));
  }

  useEffect(() => {
    if (!draftId || typeof addPrimerToPool !== 'function') return;
    // Existing assembly-derived pool rows, indexed two ways: by the draft primer
    // they came from (our own record for that primer), and by physical identity
    // (cross-draft dedup — the same oligo written in two drafts).
    const rowByDraftPrimer = new Map();
    const rowByPhysicalIdentity = new Map();
    for (const row of Object.values(primersById || {})) {
      if (row?.origin?.kind !== 'assembly-derived') continue;
      if (row.origin.draftPrimerId) rowByDraftPrimer.set(row.origin.draftPrimerId, row);
      const identity = physicalIdentityKey(row);
      if (identity && !rowByPhysicalIdentity.has(identity)) {
        rowByPhysicalIdentity.set(identity, row);
      }
    }

    // Schedule a pool write for a draft primer. If a write is already in
    // flight for this primer id, the payload is queued (replacing any prior
    // pending); drain will flush it after the current write settles. This
    // ensures the most recent physical state always wins, never a stale one.
    function schedulePoolWrite(primerId, payload) {
      if (inflightRef.current.has(primerId)) {
        pendingRef.current.set(primerId, payload);
        return;
      }
      const p = Promise.resolve(addPrimerToPoolRef.current(payload));
      inflightRef.current.set(primerId, p);
      p.finally(() => drain(primerId));
    }

    for (const p of canonicalPrimers) {
      if (!p || !p.id || p.draftId !== draftId) continue;
      const seq = p.sequence || p.bindingSequence;
      if (!seq) continue;
      const identity = physicalIdentityKey({ sequence: seq, modifications: p.modifications });
      const existingRow = rowByDraftPrimer.get(p.id);

      if (existingRow) {
        // PRIMER-TAIL-SAVE-1 — our canonical record for this draft primer already
        // exists. A physical edit (added 5′ tail, changed binding) keeps the same
        // draft id, so the pool row must be UPDATED IN PLACE — the deterministic
        // id makes the write an upsert of the SAME row, not a stale duplicate. An
        // unrelated change (Tm, name) leaves it untouched.
        const payload = buildPoolWrite(p, draftId, currentProjectId, existingRow);
        if (!poolRowMatchesWrite(existingRow, payload.primer)) {
          schedulePoolWrite(p.id, payload);
        }
        continue;
      }

      // A second draft can describe the same physical oligo at another landing.
      // Upsert that physical row and union its sites instead of either duplicating
      // the molecule or discarding the additional landing.
      const physicalRow = identity ? rowByPhysicalIdentity.get(identity) : null;
      const payload = buildPoolWrite(p, draftId, currentProjectId, physicalRow);
      if (physicalRow && poolRowMatchesWrite(physicalRow, payload.primer)) continue;
      schedulePoolWrite(p.id, payload);
    }
  }, [addPrimerToPool, canonicalPrimers, currentProjectId, draftId, primersById]);

  // Old browser snapshots can carry a missing/stale target identity while the
  // assembly record still proves its own range. Canonicalise at the assembly
  // owner, never by weakening the shared projector's trust boundary.
  useEffect(() => {
    if (!draftId || typeof actions.updateAssemblyPrimer !== 'function') return;
    for (const primer of primers) {
      const patch = assemblyPrimerSiteRepairPatch(primer, {
        entryId: draftId, template: sequence, topology, boundaries,
      });
      if (patch) actions.updateAssemblyPrimer(draftId, primer.id, patch);
    }
  }, [actions, boundaries, draftId, primers, sequence, topology]);

  // Viewer and persisted repair consume the same canonical record during the
  // repair render; there is no second placement or mismatch policy here.
  const viewerPrimers = useMemo(
    () => canonicalPrimers.map((primer) => ({ ...primer, tmBinding: primer.tm })),
    [canonicalPrimers],
  );

  return { onWritePrimer, primers: viewerPrimers, rawPrimers: primers };
}

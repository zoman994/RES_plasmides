/**
 * skeleton-state-assembly — sub-reducer for state.assemblyDrafts (A1).
 *
 * Fourth primary entity (alongside containers / operations / junctions).
 * Slice/entity naming = G1 (assemblyDrafts / AssemblyDraft). Container
 * source is resolved REDUCER-SIDE from state.containers (merge note:
 * skeleton-context exposes only `dispatch`, no getState; the sub-reducer
 * already receives full state — simpler + consistent with canvas/ops
 * sub-reducers that read state).
 *
 * Every mutating case validates via assembly-invariants: hard errors →
 * state unchanged + error toast (router stamps it); warnings → applied +
 * warning toast.
 */
import { v7 as uuidv7 } from 'uuid';
import {
  createDraft, makeSourcedSegment, makeManualSegment,
  addSegment, removeSegment, moveSegment, updateSegment, splitSegment,
  computeAssemblySequence, segmentBoundaries,
} from '../lib/assembly-model';
import { reverseComplement } from '../../../sequence-utils';
import { validateDraft, ASM_CAPS } from '../lib/assembly-invariants';
import { buildAssemblyPrimer, detectCrossBoundary } from '../lib/assembly-primer-utils';
import { resolveManualJunctionTail } from '../lib/primer-derive';
import { routeAssemblyWriteToZone } from '../lib/zone-assembly-write-adapter';
import { draftFromZone } from '../lib/zone-pieces-to-dag';

// A3 DEC-CANVAS-ASM-PRIMER-02 — pair fwd+rev when their selections
// overlap ≥50% and share the same source-attachment kind.
function findPairId(existing, primer) {
  const a0 = primer.source.selectionStart;
  const a1 = primer.source.selectionEnd;
  for (const p of existing) {
    if (p.direction === primer.direction) continue;
    if (!p.source || p.source.kind !== primer.source.kind) continue;
    const b0 = p.source.selectionStart;
    const b1 = p.source.selectionEnd;
    const ov = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const minLen = Math.max(1, Math.min(a1 - a0, b1 - b0));
    if (ov / minLen >= 0.5) return p.pairId;
  }
  return null;
}

export function buildInitialAssemblyState() {
  // G2 DEC-CANVAS-ASM-19 — primers written on the assembly sequence,
  // keyed by draft id. Persisted (not transient); REPLACE_STATE merges
  // the default {} for pre-A2 snapshots so no schema bump is needed.
  return { assemblyDrafts: [], assemblyDraftPrimers: {} };
}

const ASM_PRIMER_MIN = 18; // bio-invariants Rule 6 — shorter ⇒ no real primer.

const ASSEMBLY_ACTIONS = new Set([
  'CREATE_ASSEMBLY_DRAFT', 'REMOVE_ASSEMBLY_DRAFT', 'RENAME_ASSEMBLY_DRAFT',
  'SET_ASSEMBLY_DRAFT_TOPOLOGY', 'SET_ASSEMBLY_DRAFT_POSITION',
  'INSERT_SEGMENT', 'INSERT_MANUAL_SEGMENT', 'INSERT_SNIPPET', 'INSERT_SYNTHESIS', 'REMOVE_SEGMENT',
  'REORDER_SEGMENTS', 'UPDATE_SEGMENT', 'UPDATE_SEGMENT_RANGE',
  'TOGGLE_SEGMENT_RC', 'SPLIT_SEGMENT',
  'WRITE_ASSEMBLY_PRIMER', 'ADD_DERIVED_ASSEMBLY_PRIMERS', 'REMOVE_ASSEMBLY_PRIMER', 'UPDATE_ASSEMBLY_PRIMER',
  'UPDATE_ASSEMBLY_PRIMER_NAME', 'UPDATE_ASSEMBLY_PRIMER_NOTES',
  // SPEC_EDITABLE_ASSEMBLY_S3 §5.1 — maintain saved-primer coordinates.
  'SHIFT_ASSEMBLY_PRIMERS',
]);

export function isAssemblyAction(type) {
  return ASSEMBLY_ACTIONS.has(type);
}

function withDrafts(state, drafts) {
  return { ...state, assemblyDrafts: drafts };
}

function errToast(state, message) {
  return { ...state, toast: { kind: 'error', message } };
}

function warnToast(state, message) {
  return { ...state, toast: { kind: 'warning', message } };
}

/**
 * Apply a draft transform + invariant gate. Returns new state (or the
 * unchanged `state` on hard-cap / invariant error, with an error toast).
 */
function commitDraft(state, draftId, transform) {
  const drafts = state.assemblyDrafts || [];
  const idx = drafts.findIndex((d) => d.id === draftId);
  if (idx < 0) return state;
  let nextDraft;
  try {
    nextDraft = transform(drafts[idx]);
  } catch (e) {
    return errToast(state, `Assembly: ${e.message || 'operation failed'}`);
  }
  if (!nextDraft || nextDraft === drafts[idx]) return state;
  const v = validateDraft(state, nextDraft);
  if (!v.ok) {
    return errToast(state, `Assembly «${nextDraft.name}»: ${v.errors[0]}`);
  }
  const nextDrafts = drafts.slice();
  nextDrafts[idx] = nextDraft;
  const applied = withDrafts(state, nextDrafts);
  return v.warnings.length > 0 ? warnToast(applied, v.warnings[0]) : applied;
}

export function assemblyReducer(state, action) {
  // T6 — zone-mode dual-resolution (DEC-T6-01, R-T6-4). An ASSEMBLY_*
  // write whose draftId is a ZONE id is translated to piece/zone ops;
  // legacy-draft ids return undefined and fall through unchanged.
  const zoneRouted = routeAssemblyWriteToZone(state, action);
  if (zoneRouted !== undefined) return zoneRouted;

  // K6 — REMOVE_CONTAINER cascade: keep-with-warning (merge decision
  // G1 DEC-ASM-11). Sourced segments are NOT removed; cached sequence +
  // annotations survive, the segment is flagged source-unavailable so
  // computeAssemblySequence / UI can show a warning badge.
  if (action.type === 'REMOVE_CONTAINER') {
    const drafts0 = state.assemblyDrafts || [];
    let touched = false;
    const next = drafts0.map((d) => {
      let segChanged = false;
      const segs = d.segments.map((s) => {
        if (s.source?.type === 'container'
            && s.source.containerId === action.containerId
            && !s.source.unavailable) {
          segChanged = true;
          return { ...s, source: { ...s.source, unavailable: true } };
        }
        return s;
      });
      if (!segChanged) return d;
      touched = true;
      return { ...d, segments: segs, updatedAt: Date.now() };
    });
    if (!touched) return state;
    return warnToast(withDrafts(state, next),
      'Source container удалён — у сборки появились orphan-сегменты');
  }

  if (!isAssemblyAction(action.type)) return state;
  const drafts = state.assemblyDrafts || [];

  switch (action.type) {
    case 'CREATE_ASSEMBLY_DRAFT': {
      if (drafts.length >= ASM_CAPS.draftsHard) {
        return errToast(state, `Лимит сборок (${ASM_CAPS.draftsHard}) достигнут`);
      }
      const d = createDraft({
        name: action.name,
        topology: action.topology,
        position: action.position,
      });
      if (action.id) d.id = action.id;
      return withDrafts(state, [...drafts, d]);
    }

    case 'REMOVE_ASSEMBLY_DRAFT': {
      const nextPrimers = { ...(state.assemblyDraftPrimers || {}) };
      delete nextPrimers[action.draftId];
      return {
        ...withDrafts(state, drafts.filter((d) => d.id !== action.draftId)),
        assemblyDraftPrimers: nextPrimers,
      };
    }

    case 'RENAME_ASSEMBLY_DRAFT':
      return commitDraft(state, action.draftId,
        (d) => ({ ...d, name: action.name, updatedAt: Date.now() }));

    case 'SET_ASSEMBLY_DRAFT_TOPOLOGY':
      return commitDraft(state, action.draftId,
        (d) => ({ ...d, topology: { circular: !!action.circular }, updatedAt: Date.now() }));

    case 'SET_ASSEMBLY_DRAFT_POSITION':
      return commitDraft(state, action.draftId,
        (d) => ({ ...d, position: action.position, updatedAt: Date.now() }));

    case 'INSERT_SEGMENT': {
      const container = (state.containers || []).find((c) => c.id === action.sourceContainerId);
      if (!container) {
        return errToast(state, 'Source container не найден');
      }
      const seg = makeSourcedSegment({
        sourceContainer: container,
        start: action.start,
        end: action.end,
        rc: !!action.rc,
      });
      return commitDraft(state, action.draftId,
        (d) => addSegment(d, seg, action.insertAtIndex));
    }

    case 'INSERT_MANUAL_SEGMENT': {
      const seg = makeManualSegment({
        sequence: action.sequence,
        length: action.length,
        label: action.label,
        gapKind: action.gapKind,
        gapLabel: action.gapLabel,
      });
      return commitDraft(state, action.draftId,
        (d) => addSegment(d, seg, action.insertAtIndex));
    }

    case 'INSERT_SNIPPET': {
      // Legacy-draft fallback (transition window): a snippet is a
      // known-sequence manual segment. The zone path (adapter) builds
      // the richer kind='snippet' piece — this only fires for the
      // deprecated assemblyDrafts targets.
      const seg = makeManualSegment({
        sequence: action.sequence,
        label: action.name || action.snippetType,
        gapLabel: action.snippetType,
      });
      return commitDraft(state, action.draftId,
        (d) => addSegment(d, seg, action.insertAtIndex));
    }

    case 'INSERT_SYNTHESIS': {
      // Legacy-draft fallback: a synthesis fragment is a known-sequence
      // manual segment. The zone adapter builds kind='synthesis'.
      const seg = makeManualSegment({
        sequence: action.sequence,
        label: action.name || 'Синтез',
      });
      return commitDraft(state, action.draftId,
        (d) => addSegment(d, seg, action.insertAtIndex));
    }

    case 'REMOVE_SEGMENT':
      return commitDraft(state, action.draftId,
        (d) => removeSegment(d, action.segmentId));

    case 'REORDER_SEGMENTS':
      return commitDraft(state, action.draftId, (d) => {
        const id = d.segments[action.fromIndex]?.id;
        return id ? moveSegment(d, id, action.toIndex) : d;
      });

    case 'UPDATE_SEGMENT':
      return commitDraft(state, action.draftId,
        (d) => updateSegment(d, action.segmentId, action.patch || {}));

    // A2 / G2 DEC-CANVAS-ASM-22 — re-slice a container-sourced segment
    // to a new [start,end). Resolved reducer-side (consistent with
    // INSERT_SEGMENT); id / color / label preserved, sequence +
    // annotations recomputed (frozen-on-edit semantics).
    case 'UPDATE_SEGMENT_RANGE': {
      const drafts2 = state.assemblyDrafts || [];
      const d2 = drafts2.find((d) => d.id === action.draftId);
      const seg = d2 && d2.segments.find((s) => s.id === action.segmentId);
      if (!seg) return state;
      if (seg.source?.type !== 'container') {
        return errToast(state, 'Диапазон редактируется только у сегментов из контейнера');
      }
      const container = (state.containers || []).find(
        (c) => c.id === seg.source.containerId,
      );
      if (!container) {
        return errToast(state, 'Source container не найден');
      }
      const rebuilt = makeSourcedSegment({
        sourceContainer: container,
        start: action.start,
        end: action.end,
        rc: !!seg.reverseComplement,
      });
      return commitDraft(state, action.draftId, (d) => updateSegment(d, action.segmentId, {
        start: rebuilt.start,
        end: rebuilt.end,
        sequence: rebuilt.sequence,
        length: rebuilt.length,
        annotations: rebuilt.annotations,
      }));
    }

    case 'TOGGLE_SEGMENT_RC':
      return commitDraft(state, action.draftId, (d) => {
        const s = d.segments.find((x) => x.id === action.segmentId);
        if (!s) return d;
        return updateSegment(d, action.segmentId, {
          reverseComplement: !s.reverseComplement,
          sequence: reverseComplement(s.sequence || ''),
        });
      });

    case 'SPLIT_SEGMENT':
      return commitDraft(state, action.draftId,
        (d) => splitSegment(d, action.segmentId, action.atOffsetWithinSegment));

    // ── G2 DEC-CANVAS-ASM-19/20 — assembly primers ──────────────────
    case 'WRITE_ASSEMBLY_PRIMER': {
      // T6 K10 — dual-resolve: a zone target builds a pieces-shaped
      // draft-like for the sequence/boundaries; primers are still
      // stored under assemblyDraftPrimers[draftId] (id-keyed map works
      // for zone or legacy-draft ids alike).
      const zone = (state.zones || []).find((z) => z.id === action.draftId);
      const d = zone
        ? draftFromZone(state, zone)
        : drafts.find((x) => x.id === action.draftId);
      if (!d) return state;
      const lo = Math.max(0, Math.min(action.range.start, action.range.end));
      const hi = Math.max(action.range.start, action.range.end);
      if (hi - lo < ASM_PRIMER_MIN) {
        return warnToast(state,
          'Участок слишком короткий для праймера (нужно ≥ ~18 bp)');
      }
      const seq = computeAssemblySequence(d).sequence;
      const { boundaries } = segmentBoundaries(d);
      const direction = action.direction === 'reverse' ? 'reverse' : 'forward';
      // TD-PRIMER-MANUAL-A1-PARITY: a manual primer across a GG/RE junction
      // gets the method-specific tail (parity with the auto path), not a plain
      // sequence-overlap. zone target only — the method lives in zone.junctions.
      let tailOverride = null;
      if (zone) {
        const crosses = detectCrossBoundary({ start: lo, end: hi }, boundaries);
        if (crosses.length === 2) {
          tailOverride = resolveManualJunctionTail({
            side: direction === 'reverse' ? 'rev' : 'fwd',
            leftSegId: crosses[0],
            rightSegId: crosses[1],
            zoneJunctions: zone.junctions || {},
            pieces: state.pieces || [],
          });
        }
      }
      const built = buildAssemblyPrimer({
        assemblySequence: seq, boundaries, range: { start: lo, end: hi }, direction, tailOverride,
      });
      const map = { ...(state.assemblyDraftPrimers || {}) };
      const cur = map[action.draftId] || [];
      const n = cur.filter((p) => p.direction === direction).length + 1;
      const autoName = `asm-${direction === 'reverse' ? 'rev' : 'fwd'}-${n}`;
      // 18.05.2026 — primer-from-selection modal: optional name + an
      // edited PSO override. Empty/absent → auto (back-compat).
      const name = (action.name && String(action.name).trim())
        ? String(action.name).trim() : autoName;
      const editedSeq = typeof action.sequence === 'string'
        ? action.sequence.replace(/[^a-zA-Z]/g, '').toUpperCase() : '';
      const pairId = findPairId(cur, { direction, source: built.source })
        || `pair-${uuidv7()}`;
      const primer = {
        id: `asmprm-${uuidv7()}`,
        draftId: action.draftId,
        pairId,
        range: { start: lo, end: hi },
        direction,
        sequence: editedSeq || built.sequence,
        bindingSequence: editedSeq || built.bindingSequence,
        tm: built.tm,
        gc: built.gc,
        name,
        label: name,
        source: built.source,
        // Node A canon (§4/§5.3) — provenance lives only in `source`; the
        // old `origin` field is removed (it was a string here but an object
        // in deriveAutoPrimers — one name, two types).
        tail: built.tail,
        autoMode: 'manual',
        mutated: false,
        status: editedSeq ? 'edited' : 'auto',
        notes: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        crossesBoundaries: built.crossesBoundaries,
      };
      map[action.draftId] = [...cur, primer];
      return { ...state, assemblyDraftPrimers: map };
    }

    case 'ADD_DERIVED_ASSEMBLY_PRIMERS': {
      // Кирпич 3b — insert pre-designed (mutagenesis) primers into the pool.
      // Unlike WRITE_ASSEMBLY_PRIMER (range-derived from the assembly), these
      // carry the mutant base inside them, so they are stored verbatim with
      // project + assembly provenance already in each record's `source`.
      const primers = Array.isArray(action.primers) ? action.primers : [];
      if (primers.length === 0) return state;
      const map = { ...(state.assemblyDraftPrimers || {}) };
      const cur = map[action.draftId] || [];
      map[action.draftId] = [...cur, ...primers];
      return { ...state, assemblyDraftPrimers: map };
    }

    case 'REMOVE_ASSEMBLY_PRIMER': {
      const map = { ...(state.assemblyDraftPrimers || {}) };
      const cur = map[action.draftId];
      if (!cur) return state;
      map[action.draftId] = cur.filter((p) => p.id !== action.primerId);
      return { ...state, assemblyDraftPrimers: map };
    }

    case 'UPDATE_ASSEMBLY_PRIMER': {
      const map = { ...(state.assemblyDraftPrimers || {}) };
      const cur = map[action.draftId];
      if (!cur) return state;
      const patch = action.patch || {};
      map[action.draftId] = cur.map((p) => {
        if (p.id !== action.primerId) return p;
        const next = { ...p, ...patch, updatedAt: Date.now() };
        // Manual sequence override → freeze as 'edited' (DEC-ASM-PRIMER-07).
        if (typeof patch.sequence === 'string') {
          next.status = 'edited';
          next.bindingSequence = patch.bindingSequence || patch.sequence;
        }
        return next;
      });
      return { ...state, assemblyDraftPrimers: map };
    }

    // SPEC_EDITABLE_ASSEMBLY_S3 §5.1 — after an editable-view edit shifts
    // the assembled sequence, fix the coordinates of SAVED primers.
    // Auto-from-group primers carry no source coords → skipped (a
    // disbanded group's auto-primers are removed by DISBAND_OP_GROUP).
    case 'SHIFT_ASSEMBLY_PRIMERS': {
      const map = state.assemblyDraftPrimers || {};
      const cur = map[action.draftId];
      if (!cur || cur.length === 0) return state;
      const atPos = Number(action.atPos);
      if (!Number.isFinite(atPos)) return state;
      const delta = Number(action.delta) || 0;
      let changed = false;
      const next = cur.map((p) => {
        const src = p.source;
        if (!src || !Number.isFinite(src.selectionStart) || !Number.isFinite(src.selectionEnd)) {
          return p; // auto-from-group / coordless primer
        }
        const s = src.selectionStart;
        const e = src.selectionEnd;
        if (e <= atPos) return p; // (a) entirely left
        if (s >= atPos) {
          // (b) entirely right → shift coordinates by delta
          if (delta === 0) return p;
          changed = true;
          const nextSrc = { ...src, selectionStart: s + delta, selectionEnd: e + delta };
          if (Number.isFinite(src.boundaryAtOffset)) nextSrc.boundaryAtOffset = src.boundaryAtOffset + delta;
          const nextRange = (p.range && Number.isFinite(p.range.start))
            ? { start: p.range.start + delta, end: p.range.end + delta }
            : p.range;
          return { ...p, source: nextSrc, range: nextRange, updatedAt: Date.now() };
        }
        // (c) atPos strictly inside [s, e) → stale (coords / sequence kept)
        if (p.status === 'stale') return p;
        changed = true;
        return { ...p, status: 'stale', updatedAt: Date.now() };
      });
      return changed ? { ...state, assemblyDraftPrimers: { ...map, [action.draftId]: next } } : state;
    }

    case 'UPDATE_ASSEMBLY_PRIMER_NAME':
    case 'UPDATE_ASSEMBLY_PRIMER_NOTES': {
      const map = { ...(state.assemblyDraftPrimers || {}) };
      const cur = map[action.draftId];
      if (!cur) return state;
      const field = action.type === 'UPDATE_ASSEMBLY_PRIMER_NAME' ? 'name' : 'notes';
      map[action.draftId] = cur.map((p) => (
        p.id === action.primerId ? { ...p, [field]: action.value } : p
      ));
      return { ...state, assemblyDraftPrimers: map };
    }

    default:
      return state;
  }
}

/**
 * alignmentSlice — state for the pairwise alignment workspace.
 *
 * `inputs` is a list of sequences (kind 'seq') or Sanger reads (kind 'trace',
 * carrying a parsed chromatogram). `pair` selects the two to align. The engine
 * (`lib/alignment/align-pairwise.js`) is pure and client-side; this slice just
 * marshals inputs, picks the mode (semiglobal when a trace is involved —
 * read-vs-reference) and stores the result.
 *
 * Pairwise MVP; the array shape leaves room for MSA later.
 */
import { makeId } from '../lib/ids';
import { alignPairwise } from '../lib/alignment/align-pairwise';
import { buildMultiAlign } from '../lib/alignment/multi-align';
import { formatCorrection, mergeCorrection } from '../lib/alignment/describe-edit';

// Upper bound on inputs so the list can't grow without limit (Игорь: «можно
// бесконечно добавлять — ограничим»). Pairwise needs 2; multi-read consensus
// (P6) a handful — 12 is comfortably above real use, below «pile-up».
export const MAX_ALIGN_INPUTS = 12;

// Two inputs are «the same» if they point at the same library entry, or carry
// an identical name+sequence (a re-paste / re-pick). Used to dedup adds.
function isDuplicateInput(inputs, norm) {
  return inputs.some((x) => (
    (norm.libraryEntryId && x.libraryEntryId === norm.libraryEntryId)
    || (!!norm.sequence && x.sequence === norm.sequence && x.name === norm.name)
  ));
}

// Per-edit undo for the working copy (Игорь — «Ctrl+Z должен работать везде»).
// Each working-copy mutation snapshots the PREVIOUS state onto editPast (null =
// pristine, before any edit); undo pops it, redo replays. Bounded like the
// Library annotation undo (useAnnotationUndoRedo).
const UNDO_LIMIT = 50;

// Shallow snapshot of the working copy (arrays cloned so later edits, which
// REPLACE these fields, never alias a stored snapshot). null → no edit yet.
function snapshotWorking(wr) {
  if (!wr) return null;
  return { ...wr, annotations: [...(wr.annotations || [])], corrections: [...(wr.corrections || [])] };
}

// Debounced re-align for the typing path (Игорь — «при редактировании в
// выравнивателе идёт зависание»). Editing the reference changes the sequence on
// EVERY keystroke; re-aligning all reads synchronously per keystroke freezes the
// main thread (a k-keystroke burst = k full O(n·m) re-aligns). The working-copy
// sequence + caret already update synchronously (in commitWorkingEdit's set() and
// AlignReferenceView's local caret state), so the typed char echoes instantly —
// only the heavy alignment MATH is deferred to a trailing timer and collapses a
// burst into ONE re-align. Discrete actions (undo/redo/revert/intron-from-gaps/
// save) flush first so they never read a stale result; clearAlignment cancels it.
const REALIGN_DEBOUNCE_MS = 280;
let realignTimer = null;
function cancelScheduledRealign() {
  if (realignTimer != null) { clearTimeout(realignTimer); realignTimer = null; }
}

const DEFAULT_SETTINGS = {
  // Local by default + a STIFF mismatch penalty so the alignment only extends
  // through genuinely homologous DNA (Игорь: «натягивание совы на глобус»).
  // The local extension threshold is identity > m/(match+m): with match +2 and
  // mismatch −3 that is 60% — below it (e.g. two different plasmids ≈50%) the
  // score goes negative and Smith–Waterman clips, so we get the real homologous
  // core (or «низкое сходство») instead of a forced end-to-end match. A real
  // Sanger read of the SAME plasmid (95–99%) still aligns in full.
  mode: 'local', tryRevComp: true, match: 2, mismatch: -3, gapOpen: -6, gapExtend: -1,
};

function blankAlign() {
  return {
    inputs: [],
    // Explicit selection (Игорь — «вместо А/Б окошко выбора референса и окошко
    // выбора выравниваний»): ONE reference + the reads aligned against it. 1 read
    // = pairwise, ≥2 = multi-read consensus. New inputs are NOT auto-added as
    // reads (no «странное подсасывание») — the user picks them.
    refId: null,
    readIds: [],
    settings: { ...DEFAULT_SETTINGS },
    // View-only prefs for the reference view (no effect on the alignment math).
    // `colorNucleotides` — read bases black by default (toggle = A/C/G/T palette).
    // Layer toggles (P2): show feature bars / AA track / primer layer.
    view: {
      colorNucleotides: false,
      showAnnotations: true,
      showAATrack: true,
      showPrimers: false,
    },
    result: null,
    // Multi-read consensus (P6): { refId, perRead, consensus, stats }. Set when
    // there are ≥2 reads against the reference; null for a pairwise alignment.
    multi: null,
    // Transient reference edit (P3, git-logic): a working copy of the reference
    // that the read aligns against. The SOURCE library entry is never touched;
    // an explicit «Сохранить версию» branches it. null = no edit in progress.
    // { sourceId, libraryEntryId, name, sequence, annotations, corrections:[{pos,from,to}] }
    workingReference: null,
    // Per-edit undo/redo of the working copy (snapshots of workingReference,
    // null = pristine). Reset by «Сбросить», save, and clearAlignment.
    editPast: [],
    editFuture: [],
    status: 'idle',
    error: null,
  };
}

function normalizeInput(input) {
  return {
    id: input.id || makeId(),
    name: input.name || 'без имени',
    sequence: input.sequence || '',
    source: input.source || 'manual',
    kind: input.kind || 'seq',
    chromatogram: input.chromatogram || null,
    // Annotations/features ride along so the reference can render them natively
    // in SequenceView («align to reference»). Empty for pasted sequences.
    annotations: input.annotations || [],
    libraryEntryId: input.libraryEntryId || null,
  };
}

function toInputFromEntry(entry) {
  if (!entry) return null;
  const sequence = entry.payload?.sequence || entry.sequence || '';
  return normalizeInput({
    name: entry.name || 'без имени',
    sequence,
    source: 'library',
    kind: 'seq',
    annotations: entry.payload?.annotations || [],
    libraryEntryId: entry.id || null,
  });
}

function reconcileSelection(align) {
  const ids = align.inputs.map((x) => x.id);
  if (!ids.includes(align.refId)) align.refId = ids[0] || null;
  // Keep only still-existing reads that aren't the reference.
  align.readIds = (align.readIds || []).filter((id) => ids.includes(id) && id !== align.refId);
  // Seed ONE read so a fresh pair aligns immediately; additional inputs stay
  // unselected until the user opts them in.
  if (align.readIds.length === 0) {
    const firstRead = ids.find((id) => id !== align.refId);
    if (firstRead) align.readIds = [firstRead];
  }
}

export function createAlignmentSlice(set, get) {
  // Trailing-edge debounce of the heavy re-align (see REALIGN_DEBOUNCE_MS above).
  const scheduleRealign = () => {
    cancelScheduledRealign();
    realignTimer = setTimeout(() => { realignTimer = null; get().runAlignment(); }, REALIGN_DEBOUNCE_MS);
  };

  return {
    align: blankAlign(),

    setAlignInputs: (inputs) => set((s) => {
      s.align.inputs = (inputs || []).map(normalizeInput);
      reconcileSelection(s.align);
    }),

    addAlignInput: (input) => set((s) => {
      const norm = normalizeInput(input);
      if (s.align.inputs.length >= MAX_ALIGN_INPUTS) return;
      if (isDuplicateInput(s.align.inputs, norm)) return;
      s.align.inputs.push(norm);
      reconcileSelection(s.align);
    }),

    addTraceInput: (chromatogram, meta = {}) => set((s) => {
      const norm = normalizeInput({
        name: meta.name || 'Sanger чтение',
        sequence: chromatogram?.bases || '',
        source: 'trace',
        kind: 'trace',
        chromatogram,
      });
      if (s.align.inputs.length >= MAX_ALIGN_INPUTS) return;
      if (isDuplicateInput(s.align.inputs, norm)) return;
      s.align.inputs.push(norm);
      // A Sanger read is a fragment of the reference → semiglobal is the right
      // default for it (free terminal gaps). The user can still override.
      s.align.settings.mode = 'semiglobal';
      reconcileSelection(s.align);
    }),

    removeAlignInput: (id) => set((s) => {
      s.align.inputs = s.align.inputs.filter((x) => x.id !== id);
      reconcileSelection(s.align);
    }),

    // Pick the reference; if it was a read, drop it from the reads.
    setReference: (id) => set((s) => {
      s.align.refId = id;
      s.align.readIds = (s.align.readIds || []).filter((r) => r !== id);
      reconcileSelection(s.align);
    }),

    // Toggle whether an input participates as a read (can't be the reference).
    toggleRead: (id) => set((s) => {
      if (id === s.align.refId) return;
      const cur = new Set(s.align.readIds || []);
      if (cur.has(id)) cur.delete(id); else cur.add(id);
      s.align.readIds = [...cur];
    }),

    setAlignSettings: (patch) => set((s) => {
      s.align.settings = { ...s.align.settings, ...patch };
    }),

    setAlignView: (patch) => set((s) => {
      s.align.view = { ...s.align.view, ...patch };
    }),

    clearAlignment: () => {
      cancelScheduledRealign(); // a queued debounce must not fire after teardown
      set((s) => {
        const keepSettings = s.align?.settings || { ...DEFAULT_SETTINGS };
        s.align = { ...blankAlign(), settings: keepSettings };
      });
    },

    // Run a pending debounced re-align NOW (no-op if none is queued). Discrete
    // consumers call this before reading align.result/multi so they never see a
    // result that lags the working-copy sequence (intron-from-gaps coords, save).
    flushAlignment: () => {
      if (realignTimer != null) { cancelScheduledRealign(); get().runAlignment(); }
    },

    runAlignment: () => {
      const st = get().align;
      const ref = st.inputs.find((x) => x.id === st.refId);
      if (!ref) {
        set((s) => { s.align.status = 'error'; s.align.error = 'нужно выбрать референс'; });
        return;
      }
      // Only the explicitly-selected reads align (never the reference itself).
      const others = (st.readIds || [])
        .filter((id) => id !== ref.id)
        .map((id) => st.inputs.find((x) => x.id === id))
        .filter(Boolean);
      if (others.length === 0) {
        set((s) => { s.align.status = 'error'; s.align.error = 'выберите хотя бы одно выравнивание'; });
        return;
      }
      // P3 — the read aligns against the WORKING COPY of the reference when an
      // edit is in progress, so «accept read base» corrections take effect live.
      const wr = st.workingReference;
      const refSeq = (wr && wr.sourceId === ref.id) ? wr.sequence : ref.sequence;
      set((s) => { s.align.status = 'running'; s.align.error = null; });
      try {
        if (others.length >= 2) {
          // Multi-read consensus: align every read to the reference.
          const reads = others.map((o) => ({ id: o.id, name: o.name, sequence: o.sequence, chromatogram: o.chromatogram, kind: o.kind }));
          const multi = buildMultiAlign(refSeq, reads, { ...st.settings });
          set((s) => { s.align.multi = { refId: ref.id, ...multi }; s.align.result = null; s.align.status = 'done'; });
        } else {
          // Pairwise. Keep the trace (read) as B / query so columns' bi maps to
          // the chromatogram — swap if the chosen reference is itself a trace.
          let a = ref; let b = others[0];
          if (a.kind === 'trace' && b.kind !== 'trace') { const t = a; a = b; b = t; }
          const aSeq = (a.id === ref.id) ? refSeq : a.sequence;
          const result = alignPairwise(aSeq, b.sequence, { ...st.settings });
          result.alignedPair = { aId: a.id, bId: b.id };
          set((s) => { s.align.result = result; s.align.multi = null; s.align.status = 'done'; });
        }
      } catch (e) {
        set((s) => { s.align.status = 'error'; s.align.error = e?.message || String(e); });
      }
    },

    clearAlignmentResult: () => set((s) => { s.align.result = null; s.align.multi = null; s.align.status = 'idle'; s.align.error = null; }),

    // P3 — «accept the read base»: substitute the reference base at `pos` with the
    // read's base in a TRANSIENT working copy (source entry untouched), then
    // re-align so the corrected reference is reflected live.
    acceptReadBaseAt: (pos, readBase) => {
      const st = get().align;
      const ref = st.inputs.find((x) => x.id === st.refId);
      if (!ref || typeof readBase !== 'string' || readBase.length !== 1) return;
      set((s) => {
        const prev = snapshotWorking(s.align.workingReference);
        let wr = s.align.workingReference;
        if (!wr || wr.sourceId !== ref.id) {
          wr = {
            sourceId: ref.id,
            libraryEntryId: ref.libraryEntryId || null,
            name: ref.name,
            sequence: ref.sequence,
            annotations: Array.isArray(ref.annotations) ? ref.annotations : [],
            corrections: [],
          };
          s.align.workingReference = wr;
        }
        const from = wr.sequence[pos];
        const to = readBase.toUpperCase();
        if (from == null || from.toUpperCase() === to) return; // no change → no history entry
        s.align.editPast = [...s.align.editPast.slice(-(UNDO_LIMIT - 1)), prev];
        s.align.editFuture = [];
        // A 1-for-1 base substitution shifts NO annotation coordinates, so a
        // plain char swap suffices (no indel logic / cross-layer helper needed).
        wr.sequence = wr.sequence.slice(0, pos) + to + wr.sequence.slice(pos + 1);
        wr.corrections = mergeCorrection(wr.corrections, { pos, from, to });
      });
      get().runAlignment();
    },

    revertWorkingReference: () => { cancelScheduledRealign(); set((s) => { s.align.workingReference = null; s.align.editPast = []; s.align.editFuture = []; }); get().runAlignment(); },

    // P9.2 — commit a full in-place reference edit (insert/delete/replace) into
    // the transient working copy. The op was already applied by the caller (via
    // the shared applySequenceEditToEntry); we just store the result + log the
    // edit, then re-align. Source library entry stays untouched.
    commitWorkingEdit: (sequence, annotations, descriptor) => {
      const st = get().align;
      const ref = st.inputs.find((x) => x.id === st.refId);
      if (!ref || typeof sequence !== 'string') return;
      // The alignment depends ONLY on the reference sequence — an annotation-only
      // edit (marking an intron, descriptor=null) leaves it byte-identical, so a
      // full re-align would be wasted work. Compute the pre-edit sequence BEFORE
      // mutating and skip runAlignment when it didn't change.
      const wrPrev = st.workingReference;
      const prevSeq = (wrPrev && wrPrev.sourceId === ref.id) ? wrPrev.sequence : ref.sequence;
      const seqChanged = sequence !== prevSeq;
      set((s) => {
        const prev = snapshotWorking(s.align.workingReference);
        let wr = s.align.workingReference;
        if (!wr || wr.sourceId !== ref.id) {
          wr = {
            sourceId: ref.id, libraryEntryId: ref.libraryEntryId || null, name: ref.name,
            sequence: ref.sequence, annotations: Array.isArray(ref.annotations) ? ref.annotations : [], corrections: [],
          };
          s.align.workingReference = wr;
        }
        s.align.editPast = [...s.align.editPast.slice(-(UNDO_LIMIT - 1)), prev];
        s.align.editFuture = [];
        wr.sequence = sequence;
        wr.annotations = Array.isArray(annotations) ? annotations : wr.annotations;
        if (descriptor) wr.corrections = mergeCorrection(wr.corrections, descriptor);
      });
      // Typing path: defer the re-align so a keystroke burst collapses into one
      // (annotation-only edits, seqChanged=false, never re-align — PERF-1).
      if (seqChanged) scheduleRealign();
    },

    // Per-edit undo/redo of the working copy (Ctrl+Z / Ctrl+Y in the align view).
    // A null snapshot = pristine reference (before any edit) → workingReference
    // cleared. Re-aligns so the restored reference takes effect live.
    undoAlignEdit: () => {
      const st = get().align;
      if (!st.editPast.length) return;
      get().flushAlignment(); // settle any pending typing re-align; no stale trailing run after the undo
      const ref = st.inputs.find((x) => x.id === st.refId);
      // Re-align only if the restored snapshot's sequence differs from the
      // current one — undoing an annotation-only edit must not re-align.
      const curSeq = st.workingReference ? st.workingReference.sequence : ref?.sequence;
      const restored = st.editPast[st.editPast.length - 1];
      const restoredSeq = restored ? restored.sequence : ref?.sequence;
      set((s) => {
        const cur = snapshotWorking(s.align.workingReference);
        const prev = s.align.editPast[s.align.editPast.length - 1];
        s.align.editPast = s.align.editPast.slice(0, -1);
        s.align.editFuture = [...s.align.editFuture, cur];
        s.align.workingReference = snapshotWorking(prev);
      });
      if (curSeq !== restoredSeq) get().runAlignment();
    },

    redoAlignEdit: () => {
      const st = get().align;
      if (!st.editFuture.length) return;
      get().flushAlignment(); // settle any pending typing re-align; no stale trailing run after the redo
      const ref = st.inputs.find((x) => x.id === st.refId);
      const curSeq = st.workingReference ? st.workingReference.sequence : ref?.sequence;
      const restored = st.editFuture[st.editFuture.length - 1];
      const restoredSeq = restored ? restored.sequence : ref?.sequence;
      set((s) => {
        const cur = snapshotWorking(s.align.workingReference);
        const next = s.align.editFuture[s.align.editFuture.length - 1];
        s.align.editFuture = s.align.editFuture.slice(0, -1);
        s.align.editPast = [...s.align.editPast, cur];
        s.align.workingReference = snapshotWorking(next);
      });
      if (curSeq !== restoredSeq) get().runAlignment();
    },

    // Explicit save → a NEW library entry (manual-edit branch) with provenance;
    // the source entry is never modified. Needs a library-backed reference.
    // `name` (optional) is the biolog-chosen version name (Игорь — «дать номер
    // исправленной версии»); blank falls back to the default branch name.
    saveCorrectedReference: async (reason, name) => {
      get().flushAlignment(); // settle any in-flight typing re-align before branching
      const wr = get().align?.workingReference;
      if (!wr || !wr.corrections.length) return { ok: false, reason: 'no-changes' };
      if (!wr.libraryEntryId) return { ok: false, reason: 'no-library-entry' };
      const changes = wr.corrections.map(formatCorrection).join('; ');
      const trimmedName = (typeof name === 'string' && name.trim()) ? name.trim() : undefined;
      const res = await get().createManualEditBranch(wr.libraryEntryId, wr.sequence, wr.annotations, {
        reason: reason || '',
        changes,
        ...(trimmedName ? { name: trimmedName } : {}),
      });
      if (res?.ok) set((s) => { s.align.workingReference = null; s.align.editPast = []; s.align.editFuture = []; });
      return res;
    },

    openAlignmentWith: (entries) => {
      const inputs = (entries || []).map(toInputFromEntry).filter(Boolean);
      set((s) => {
        s.align.inputs = inputs;
        s.align.result = null;
        s.align.status = 'idle';
        s.align.error = null;
        reconcileSelection(s.align);
      });
      get().setActiveWorkspace('align');
    },
  };
}

export function selectAlignment(state) {
  return state?.align || blankAlign();
}

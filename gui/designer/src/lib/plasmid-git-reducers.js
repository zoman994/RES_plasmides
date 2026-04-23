/**
 * plasmid-git-reducers — Zustand reducer factory for Plasmid-Git commits.
 * Extracted from fragmentSlice.js per ⚓ Sprint X §9 risk 1 (hard 25 KB guard).
 *
 * Operates on active assembly: state.assemblies.find(a => a.id === state.activeId).
 * All reducers call pushUndo except setCommitMessage (text edit — use browser Ctrl+Z).
 */
import {
  bootstrapBaseSnapshot,
  createCommit,
  replay,
  resolveAutoOverride,
  codonStart,
} from './plasmid-git';

function _activeAsm(state) {
  return state.assemblies.find(a => a.id === state.activeId);
}

function _applyReplay(frag) {
  const { sequence, annotations, warnings } = replay(frag.baseSnapshot, frag.commits);
  frag.sequence = sequence;
  frag.annotations = annotations;
  frag.length = sequence.length;
  return warnings;
}

/**
 * Apply a single commit to a draft fragment (inside set(state => ...)).
 * Pure mutation — no pushUndo, no set. Used by both applyMutationGit (single)
 * and applyMutationsBatch (many) so they share one pushUndo per operation.
 */
function _applyOneCommit(f, asm, mut) {
  if (!f.baseSnapshot) {
    f.baseSnapshot = bootstrapBaseSnapshot(f);
    f.commits = Array.isArray(f.commits) ? f.commits : [];
  }

  const payload = mut.type === 'substitution' ? { newCodon: mut.newCodon }
                : mut.type === 'deletion'     ? { deleteLength: mut.deleteLength || 1 }
                : mut.type === 'insertion'    ? { insertSequence: mut.insertSequence || '' }
                : {};
  const commit = createCommit(mut.type, mut.dnaPosition, payload, mut.label || '', mut.message);

  const { commits: withDisabled, overriddenId } = resolveAutoOverride(f.commits, commit);
  f.commits = [...withDisabled, commit];

  const warnings = _applyReplay(f);

  asm.apiWarnings = asm.apiWarnings || [];
  if (overriddenId) {
    const prev = f.commits.find(c => c.id === overriddenId);
    const codon = Math.floor(codonStart(commit.parentPos) / 3) + 1;
    asm.apiWarnings.push(
      `✏ codon ${codon} — «${commit.label}» заменил «${prev?.label || 'предыдущую'}» (отключена, но сохранена в истории)`
    );
  }
  for (const w of warnings) asm.apiWarnings.push(w);
}

export function createPlasmidGitReducers(set, get) {
  return {
    /**
     * Apply a mutation through the Git model.
     * mut: { type, dnaPosition, newCodon?, deleteLength?, insertSequence?, label?, message? }
     * Auto-override: new substitution on same codon → existing substitution.applied=false.
     */
    applyMutationGit: (fragIdx, mut) => {
      get().pushUndo?.();
      set(state => {
        const asm = _activeAsm(state);
        if (!asm || !asm.fragments[fragIdx]) return;
        _applyOneCommit(asm.fragments[fragIdx], asm, mut);
        asm.calculated = false;
      }, false, 'applyMutationGit');
    },

    /**
     * Sprint X-fix-2 K-fix2-1 — apply a batch of mutations in ONE pushUndo step.
     * Auto-override cascades within the batch (each commit sees the draft from
     * the previous one). Ctrl+Z reverts the whole batch at once.
     */
    applyMutationsBatch: (fragIdx, muts) => {
      if (!Array.isArray(muts) || muts.length === 0) return;
      get().pushUndo?.();
      set(state => {
        const asm = _activeAsm(state);
        if (!asm || !asm.fragments[fragIdx]) return;
        const f = asm.fragments[fragIdx];
        for (const m of muts) _applyOneCommit(f, asm, m);
        asm.calculated = false;
      }, false, 'applyMutationsBatch');
    },

    /** Toggle applied on a specific commit. Triggers replay → sequence/annotations/length update. */
    toggleCommit: (fragIdx, commitId) => {
      get().pushUndo?.();
      set(state => {
        const asm = _activeAsm(state);
        if (!asm || !asm.fragments[fragIdx]) return;
        const f = asm.fragments[fragIdx];
        if (!Array.isArray(f.commits)) return;
        f.commits = f.commits.map(c => c.id === commitId ? { ...c, applied: !c.applied } : c);
        _applyReplay(f);
        asm.calculated = false;
      }, false, 'toggleCommit');
    },

    /** Hard delete a commit. Irreversible except via Ctrl+Z. */
    archiveCommit: (fragIdx, commitId) => {
      get().pushUndo?.();
      set(state => {
        const asm = _activeAsm(state);
        if (!asm || !asm.fragments[fragIdx]) return;
        const f = asm.fragments[fragIdx];
        if (!Array.isArray(f.commits)) return;
        f.commits = f.commits.filter(c => c.id !== commitId);
        _applyReplay(f);
        asm.calculated = false;
      }, false, 'archiveCommit');
    },

    /** Edit a commit's human message. No pushUndo — text-field edit. */
    setCommitMessage: (fragIdx, commitId, msg) => {
      set(state => {
        const asm = _activeAsm(state);
        if (!asm || !asm.fragments[fragIdx]) return;
        const f = asm.fragments[fragIdx];
        if (!Array.isArray(f.commits)) return;
        const trimmed = (msg || '').trim();
        f.commits = f.commits.map(c =>
          c.id === commitId ? { ...c, message: trimmed || undefined } : c
        );
      }, false, 'setCommitMessage');
    },
  };
}

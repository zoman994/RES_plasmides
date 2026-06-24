/**
 * mutation-to-mechanism — pure derivation: an in-editor sequence edit
 * (recorded as piece mutations, the `assembly-edit-router.buildMutations`
 * shape) → the molecular MECHANISM that realises it, reusing the
 * mutagenesis strategy engine (`mutagenesis.js`). Output feeds the canvas
 * operation graph + primers + protocol — this fills the in-editor
 * mutagenesis path left as a stub by DEC-CANVAS-V2-EDITOR-MUTAGENESIS-STUB-01.
 *
 * The two mechanisms (Игорь 21.06.2026 — «всё одинаково нативно»):
 *   - kld            → mechanism 1: whole-plasmid PCR with a mismatch
 *                      primer → DpnI → KLD → transform.
 *   - two/multi_fragment → mechanism 2: overlap-extension — cut around the
 *                      edit, the substitution sits in the overlap zone,
 *                      reassemble (a derived ASSEMBLY, not a special mode).
 * `chooseStrategy` (inside computeMutagenesisStrategy) auto-picks; the
 * expert swaps. Both return the SAME {fragments, junctions, primers,
 * protocol} shape, so a single canvas mapper renders either natively.
 *
 * Bio-invariant gate (⚓ No-PCR guard, ANCHORS 2026-04-20): a fragment
 * mechanism needs an amplifiable template; `needsAmplification === false`
 * → blocker. KLD stays valid on a no-PCR fragment (reverse PCR of the whole
 * plasmid works on any DNA template).
 *
 * Pure: no store, no dispatch, no React. The wiring layer computes
 * `fragmentContext` from the piece and applies the returned plan.
 */
import { computeMutagenesisStrategy } from '../../../mutagenesis';

const MECHANISM_LABELS = {
  kld: { short: 'KLD', full: 'KLD (сайт-направленный)' },
  two_fragment: { short: 'Overlap', full: 'Overlap-extension (через сборку)' },
  multi_fragment: { short: 'Overlap×N', full: 'Overlap-extension, несколько фрагментов' },
};

/** UI label for a mechanism id (mechanism === mutagenesis strategy). */
export function mechanismLabel(strategy) {
  return MECHANISM_LABELS[strategy] || { short: strategy || '?', full: strategy || 'неизвестно' };
}

/**
 * normalizeEditorMutations — editor mutation objects → mutagenesis-engine
 * mutations. Accepts:
 *   - the buildMutations shape `{position, fromBase, toBase}` (per-base,
 *     LOCAL piece coords) → coalesces a run of ADJACENT substitutions into
 *     ONE substitution (newCodon = the run), so a changed codon is one
 *     mutation, not three;
 *   - an already engine-shaped `{dnaPosition, type, ...}` (insertion /
 *     deletion / substitution) → passed through verbatim.
 * Returns engine mutations sorted by dnaPosition.
 */
export function normalizeEditorMutations(editorMutations) {
  const subs = [];
  const passthrough = [];
  for (const m of (editorMutations || [])) {
    if (!m) continue;
    if (typeof m.dnaPosition === 'number' && m.type) {
      passthrough.push(m);
    } else if (typeof m.position === 'number' && m.toBase != null) {
      subs.push({
        position: m.position,
        from: String(m.fromBase || '').toUpperCase(),
        to: String(m.toBase || '').toUpperCase(),
        label: m.label,
      });
    }
  }
  subs.sort((a, b) => a.position - b.position);
  const coalesced = [];
  for (const s of subs) {
    const last = coalesced[coalesced.length - 1];
    if (last && s.position === last.position + last.to.length) {
      last.to += s.to;
      last.from += s.from;
    } else {
      coalesced.push({ ...s });
    }
  }
  const engineSubs = coalesced.map((c) => ({
    type: 'substitution',
    dnaPosition: c.position,
    newCodon: c.to,
    label: c.label || `${c.from}${c.position + 1}${c.to}`,
  }));
  return [...engineSubs, ...passthrough].sort((a, b) => a.dnaPosition - b.dnaPosition);
}

/**
 * deriveMutationMechanism — derive the realisation plan for an in-editor
 * edit on a template piece.
 *
 * @param {object}   args
 * @param {string}   args.templateSequence  the piece/plasmid sequence
 * @param {Array}    args.editorMutations    buildMutations / engine-shaped mutations
 * @param {object}   [args.fragmentContext]  {topology, isStandalone, length, needsAmplification}
 * @param {object}   [args.options]          {bindingLength, overlapLength, featureStart, featureEnd}
 * @returns {{mechanism:string|null, plan:object|null, mutations:Array,
 *            blockers:Array, warnings:Array, mutantSequence?:string}}
 */
export function deriveMutationMechanism({
  templateSequence,
  editorMutations,
  fragmentContext = {},
  options = {},
} = {}) {
  const mutations = normalizeEditorMutations(editorMutations);
  if (!templateSequence || mutations.length === 0) {
    return {
      mechanism: null, plan: null, mutations: [], blockers: [], warnings: [],
    };
  }
  const ctx = {
    topology: fragmentContext.topology || 'circular',
    isStandalone: fragmentContext.isStandalone !== false,
    length: fragmentContext.length != null ? fragmentContext.length : templateSequence.length,
  };
  const plan = computeMutagenesisStrategy(templateSequence, mutations, { ...options, fragmentContext: ctx });

  const blockers = [];
  const isFragmentMechanism = plan.strategy === 'two_fragment' || plan.strategy === 'multi_fragment';
  // ⚓ No-PCR guard — fragment mechanisms require an amplifiable template.
  if (isFragmentMechanism && fragmentContext.needsAmplification === false) {
    blockers.push({
      kind: 'no-pcr-fragment',
      message: 'Фрагментная сборка требует амплификации, но фрагмент помечен «без ПЦР» — нужен KLD на всей плазмиде либо амплифицируемый сосед',
    });
  }

  return {
    mechanism: plan.strategy,
    plan,
    mutations,
    blockers,
    warnings: plan.warnings || [],
    mutantSequence: plan.mutantSequence,
  };
}

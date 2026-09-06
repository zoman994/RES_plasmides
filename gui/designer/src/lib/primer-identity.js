/**
 * primer-identity.js — who a primer IS, and whether it exists as a tube.
 *
 * Two different questions kept apart on purpose:
 *
 *   * SCOPE — which register a record lives in. A `project` record is a design
 *     the user is working on; a `global` record is their personal inventory,
 *     the freezer. The same raw id may legitimately appear in both, and one
 *     must never overwrite the other, so lookups are scope-qualified.
 *
 *   * PHYSICAL IDENTITY — whether two records describe the SAME tube. That is
 *     the normalised full oligo plus its normalised chemical modifications,
 *     and nothing else. The landing part alone is not enough: the same binding
 *     region carrying another 5' tail, or the same bases carrying a
 *     phosphate, is a different thing you would have to order separately.
 *
 * «Available in the lab» is deliberately narrow. Only a `global` record with
 * status `received` is stock. A project record, a record that arrived inside
 * somebody else's `.bodge`, and an `ordered` oligo are all things that do not
 * exist in this freezer yet, however convincingly they resemble one.
 */

import { alignPrimerBinding } from './primer-binding-alignment';

export const PRIMER_SCOPE_PROJECT = 'project';
export const PRIMER_SCOPE_GLOBAL = 'global';

const GLOBAL_PREFIX = `${PRIMER_SCOPE_GLOBAL}:`;
const PROJECT_PREFIX = `${PRIMER_SCOPE_PROJECT}:`;

/**
 * Raw ids that cannot be used as a pool key unescaped.
 *
 * Two separate hazards, one rule. A donor `.bodge` chooses its own primer ids,
 * so one of them may literally be `global:x` — which, under a naive «project
 * keys are the bare raw id» rule, lands in the same slot as the freezer's own
 * `x` and overwrites the record of a real tube. And `__proto__` assigned on a
 * plain object does not create an own property at all: the row would silently
 * vanish while appearing to have been stored.
 */
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function needsEscape(rawId) {
  const s = String(rawId ?? '');
  return s.startsWith(GLOBAL_PREFIX) || s.startsWith(PROJECT_PREFIX) || PROTOTYPE_KEYS.has(s);
}

/** Anything that is not explicitly global belongs to the project register. */
export function normalizeScope(scope) {
  return scope === PRIMER_SCOPE_GLOBAL ? PRIMER_SCOPE_GLOBAL : PRIMER_SCOPE_PROJECT;
}

export function primerScopeOf(record) {
  if (!record) return PRIMER_SCOPE_PROJECT;
  if (record.scope) return normalizeScope(record.scope);
  // A record whose id already carries the qualifier is global even if the
  // field was dropped somewhere along the way.
  if (typeof record.id === 'string' && record.id.startsWith(GLOBAL_PREFIX)) {
    return PRIMER_SCOPE_GLOBAL;
  }
  return PRIMER_SCOPE_PROJECT;
}

/**
 * The id the record was created with, with its OWN scope qualifier stripped.
 *
 * Scope-aware on purpose: a project record whose raw id happens to read
 * `global:x` must keep that raw id intact. Stripping whatever prefix appears
 * would rewrite the donor's id into `x` and hand it the freezer's slot — the
 * exact collision the escaping exists to prevent.
 */
export function primerRawId(record) {
  if (!record) return null;
  if (typeof record.rawId === 'string' && record.rawId) return record.rawId;
  const id = typeof record.id === 'string' ? record.id : null;
  if (!id) return null;
  const scope = primerScopeOf(record);
  if (scope === PRIMER_SCOPE_GLOBAL && id.startsWith(GLOBAL_PREFIX)) {
    return id.slice(GLOBAL_PREFIX.length);
  }
  if (scope === PRIMER_SCOPE_PROJECT && id.startsWith(PROJECT_PREFIX)) {
    return id.slice(PROJECT_PREFIX.length);
  }
  return id;
}

/**
 * The pool key for a scope + raw id.
 *
 * The project form is the bare raw id on purpose: every existing consumer of
 * the pool keys on it, and a package that renames the common case in order to
 * introduce a new one breaks all of them for no benefit. Only the new register
 * carries a qualifier.
 */
export function makePrimerKey(scope, rawId) {
  if (normalizeScope(scope) === PRIMER_SCOPE_GLOBAL) return `${GLOBAL_PREFIX}${rawId}`;
  // A project id is the bare raw id — unless it would be mistaken for another
  // register's key, or would not survive being used as an object property.
  return needsEscape(rawId) ? `${PROJECT_PREFIX}${rawId}` : String(rawId);
}

export function primerKey(record) {
  return makePrimerKey(primerScopeOf(record), primerRawId(record));
}

export function parsePrimerKey(key) {
  const s = String(key ?? '');
  if (s.startsWith(GLOBAL_PREFIX)) {
    return { scope: PRIMER_SCOPE_GLOBAL, rawId: s.slice(GLOBAL_PREFIX.length) };
  }
  if (s.startsWith(PROJECT_PREFIX)) {
    return { scope: PRIMER_SCOPE_PROJECT, rawId: s.slice(PROJECT_PREFIX.length) };
  }
  return { scope: PRIMER_SCOPE_PROJECT, rawId: s };
}

/** Letters only, upper-cased. `''` means "nothing usable was stated". */
export function normalizeOligoSequence(seq) {
  if (typeof seq !== 'string') return '';
  return seq.replace(/[^A-Za-z]/g, '').toUpperCase();
}

/** A stable, order-independent set of modification labels. */
export function normalizeModifications(mods) {
  if (!Array.isArray(mods)) return [];
  const out = new Set();
  for (const m of mods) {
    if (typeof m !== 'string') continue;
    const v = m.trim().toUpperCase();
    if (v) out.add(v);
  }
  return [...out].sort();
}

/**
 * What makes two records the same physical tube.
 *
 * `null` when the full oligo is unknown: a record with no stated sequence
 * cannot be claimed to be, or not to be, the same tube as anything else.
 */
export function physicalIdentityKey(record) {
  const seq = normalizeOligoSequence(record?.sequence);
  if (!seq) return null;
  return `${seq}|${normalizeModifications(record?.modifications).join('+')}`;
}

/**
 * Is there really a tube?
 *
 * Fails closed: an unknown scope is a project record, and an unknown status is
 * not `received`.
 */
export function isLabStock(record) {
  if (!record) return false;
  if (primerScopeOf(record) !== PRIMER_SCOPE_GLOBAL) return false;
  return record.status === 'received';
}

/** The stretch a record anneals with, falling back to the whole oligo. */
export function bindingOf(record) {
  const bind = normalizeOligoSequence(record?.bindingSequence);
  return bind || normalizeOligoSequence(record?.sequence);
}

/**
 * How an existing record relates to the oligo the user is about to make.
 *
 *   exact         — same tube; offer reuse instead of a duplicate
 *   same-binding  — lands on the same place, but is a DIFFERENT oligo
 *                   (another 5' tail, or another modification)
 *   none          — unrelated
 */
export function classifyLabCandidate(query, record) {
  const qKey = physicalIdentityKey(query);
  const rKey = physicalIdentityKey(record);
  if (qKey && rKey && qKey === rKey) {
    return { kind: 'exact', record };
  }
  const qBind = bindingOf(query);
  const rBind = bindingOf(record);
  if (qBind && rBind && qBind === rBind) {
    return {
      kind: 'same-binding',
      record,
      tailDiffers: normalizeOligoSequence(query?.tail) !== normalizeOligoSequence(record?.tail),
      modificationsDiffer:
        normalizeModifications(query?.modifications).join('+')
        !== normalizeModifications(record?.modifications).join('+'),
    };
  }
  return { kind: 'none', record };
}

/**
 * How the CURRENT oligo reads against the landing it is anchored to.
 *
 * Two owners, kept apart on purpose. The source SITE owns geometry and
 * history — where the oligo landed, and what the template read there when the
 * landing was declared. The RECORD owns the physical oligo: what is in the tube
 * now. Neither is allowed to answer the other's question, which is how a tail
 * added after the fact never reached the glyph while a stale `site.tail` did.
 *
 * The anchor's length N is therefore FIXED: an ordinary edit cannot make a
 * primer bind further than it was declared to bind. So a current oligo longer
 * than N reads as `5' prefix + N-nt binding` — the extra bases are an unbound
 * overhang, not a longer landing, and they do not lengthen the footprint. This
 * is the same rule for both directions, because the anchor is stored in the
 * primer's own orientation.
 *
 * Same-length differences inside the binding stay substitutions: they are
 * reported as warnings elsewhere, never silently absorbed into a tail.
 *
 * Everything else fails closed. A shorter oligo would be a re-anchor, and a
 * `sequence` that disagrees with `tail + binding` is a record nobody can read
 * confidently — both are reported as such rather than guessed into a shape that
 * merely looks plausible.
 *
 * @param {object|null} record  the current primer record
 * @param {{anchor?: string|null}} [opts] the site's annealed stretch, in the
 *   primer's orientation. Omitted → the record's own split stands.
 * @returns {{tail: string, binding: string, sequence: string, status: string}}
 */
export const ANCHORED_OLIGO_OK = 'ok';
export const ANCHORED_OLIGO_CONFLICT = 'conflict';
export const ANCHORED_OLIGO_UNSUPPORTED = 'unsupported';

/**
 * Resolve the physical 5′→3′ oligo without treating an editor field boundary
 * as biological evidence. `anchor` is only a helper for presenting ambiguous
 * legacy records; it never rejects another coherent split of the same full
 * sequence. The template-facing landing is derived later from full-sequence
 * alignment at the confirmed source site.
 */
export function resolvePhysicalOligo(record, { anchor = null } = {}) {
  const unusable = {
    tail: '', binding: '', sequence: '', status: ANCHORED_OLIGO_UNSUPPORTED,
  };
  if (!record) return unusable;

  const sourceTail = typeof record.tail === 'string' && record.tail
    ? record.tail
    : (typeof record.tailSequence === 'string' && record.tailSequence
      ? record.tailSequence
      : record.tail);
  const statedTail = normalizeOligoSequence(sourceTail);
  const statedBinding = normalizeOligoSequence(record.bindingSequence);
  const statedSequence = normalizeOligoSequence(record.sequence);
  const anchored = normalizeOligoSequence(anchor);
  const explicitTail = statedTail.length > 0;
  const conflict = () => ({
    tail: statedTail,
    binding: statedBinding,
    sequence: statedSequence || (statedBinding ? `${statedTail}${statedBinding}` : ''),
    status: ANCHORED_OLIGO_CONFLICT,
  });

  if (record.bindingModel === 'aligned-v1') {
    const joined = `${statedTail}${statedBinding}`;
    if (!joined) return unusable;
    if (statedSequence && statedSequence !== joined) return conflict();
    return {
      tail: statedTail,
      binding: statedBinding,
      sequence: statedSequence || joined,
      status: ANCHORED_OLIGO_OK,
      ...(record.bindingModel === 'aligned-v1' ? { bindingModel: 'aligned-v1' } : {}),
    };
  }

  if (explicitTail) {
    if (statedSequence && !statedSequence.startsWith(statedTail)) return conflict();
    if (statedBinding && statedSequence
      && statedSequence !== `${statedTail}${statedBinding}`) return conflict();
    const binding = statedBinding
      || (statedSequence ? statedSequence.slice(statedTail.length) : '');
    const sequence = statedSequence || `${statedTail}${binding}`;
    if (!sequence) return unusable;
    return {
      tail: statedTail,
      binding,
      sequence,
      status: ANCHORED_OLIGO_OK,
    };
  }

  if (record.tail === null && !statedSequence) return unusable;
  const full = statedSequence || statedBinding;
  if (!full) return unusable;
  if (statedSequence && statedBinding && statedSequence !== statedBinding
    && !statedSequence.endsWith(statedBinding)) return conflict();

  let binding = statedBinding || full;
  if (statedSequence && statedBinding
    && statedSequence.length > statedBinding.length
    && statedSequence.endsWith(statedBinding)) {
    binding = statedBinding;
  } else if (anchored && full.length > anchored.length && full.endsWith(anchored)) {
    binding = anchored;
  }
  return {
    tail: full.slice(0, full.length - binding.length),
    binding,
    sequence: full,
    status: ANCHORED_OLIGO_OK,
  };
}

export function resolveAnchoredOligo(record, { anchor = null } = {}) {
  const unusable = {
    tail: '', binding: '', sequence: '', status: ANCHORED_OLIGO_UNSUPPORTED,
  };
  if (!record) return unusable;

  const statedTail = normalizeOligoSequence(record.tail);
  const statedBinding = normalizeOligoSequence(record.bindingSequence);
  const statedSequence = normalizeOligoSequence(record.sequence);
  const anchored = normalizeOligoSequence(anchor);
  const explicitTail = statedTail.length > 0;

  const conflict = () => ({
    tail: statedTail,
    binding: statedBinding,
    sequence: statedSequence || (statedBinding ? `${statedTail}${statedBinding}` : ''),
    status: ANCHORED_OLIGO_CONFLICT,
  });
  const unsupported = () => ({
    tail: statedTail,
    binding: statedBinding,
    sequence: statedSequence || (statedBinding ? `${statedTail}${statedBinding}` : ''),
    status: ANCHORED_OLIGO_UNSUPPORTED,
  });

  if (record.bindingModel === 'aligned-v1') {
    // Aligned records own an explicit physical split. Unlike a legacy record,
    // length difference is intentional M/X/I/D evidence and must never be
    // reinterpreted as a 5′ overhang. Missing canonical fields remain
    // unreadable rather than being guessed from the anchor.
    if (typeof record.tail !== 'string' || !statedBinding || !statedSequence) {
      return unsupported();
    }
    const full = `${statedTail}${statedBinding}`;
    if (statedSequence !== full) return conflict();
    return {
      tail: statedTail,
      binding: statedBinding,
      sequence: full,
      status: ANCHORED_OLIGO_OK,
      bindingModel: 'aligned-v1',
      alignment: anchored ? alignPrimerBinding(statedBinding, anchored) : null,
    };
  }

  // A non-empty stated tail is authoritative, not a bucket of spare bases.
  // It can never be sliced to pad a short landing. The two stated parts must
  // describe the full sequence exactly, and the binding must retain the fixed
  // anchor length below.
  if (explicitTail) {
    if (!statedBinding) return unsupported();
    const full = `${statedTail}${statedBinding}`;
    if (statedSequence && statedSequence !== full) return conflict();
    if (anchored && statedBinding.length !== anchored.length) return unsupported();
    return {
      tail: statedTail,
      binding: statedBinding,
      sequence: statedSequence || full,
      status: ANCHORED_OLIGO_OK,
    };
  }

  if (!statedSequence && !statedBinding) return unusable;
  if (record.tail === null && !statedSequence
    && (!anchored || statedBinding.length <= anchored.length)) {
    return unsupported();
  }
  if (!anchored) {
    // Nothing pins the landing length, so there is nothing to re-read the
    // record against: what it says about itself is the answer.
    if (statedSequence && statedBinding && statedSequence !== statedBinding) return conflict();
    const full = statedSequence || statedBinding;
    return {
      tail: '',
      binding: statedBinding || full,
      sequence: full,
      status: ANCHORED_OLIGO_OK,
    };
  }

  const n = anchored.length;
  // With a legacy null/empty tail, either the known full sequence or an
  // overlong full-in-binding field may carry the prefix. A separately stated
  // N-base binding is compatible only when it is exactly the full's suffix.
  if (statedBinding && statedBinding.length < n) return unsupported();
  if (statedSequence && statedBinding) {
    if (statedBinding.length === n && !statedSequence.endsWith(statedBinding)) {
      return conflict();
    }
    if (statedBinding.length > n && statedSequence !== statedBinding) return conflict();
  }
  const full = statedSequence || statedBinding;
  if (full.length < n) {
    // Shorter than the landing it claims. Trimming a binding is a re-anchor,
    // and it is certainly not an overhang.
    return unsupported();
  }
  return {
    tail: full.slice(0, full.length - n),
    binding: full.slice(full.length - n),
    sequence: full,
    status: ANCHORED_OLIGO_OK,
  };
}

/**
 * canvas/operations/types — formal Container + Origin schemas + validators.
 *
 * R11 (15.05.2026 — DEC-OPS-FORMAL-TYPES-01). До этого момента origin
 * метаданные были ad-hoc: каждый adapter писал свои поля без общего
 * контракта. Когда R10 добавил `parentWasCircular` / `isExcised` /
 * `fragmentIndex` это стало пороховой бочкой — следующий adapter мог
 * collision'нуть или подразумевать чужие inv'арианты.
 *
 * Этот файл фиксирует:
 *   - JSDoc @typedef для Container, Annotation, Origin variants (per kind).
 *   - runtime validators (вызываются в DEV mode при OP_EXECUTE).
 *   - DEV-only assertion: невалидный output → console.warn + origin
 *     dumped в console для дебага. Production — silent skip.
 *
 * Strategy: lightweight (JSDoc types — IDE подсветка без TS-стека).
 * Validators не используют zod/yup чтобы не тащить dependency.
 *
 * Origin variants (по op kind):
 *   - 'placeholder'         — изначальный ghost.
 *   - 'tree_drag' | 'tree_pick' — добавлен из Library tree.
 *   - 'fork'                — Save As копия.
 *   - 'op_pcr'              — output PCR adapter.
 *   - 'op_pcr_designed'     — oligonucleotide container из auto-design PCR.
 *   - 'op_cut'              — output Cut adapter (regular OR excised).
 *   - 'op_gibson'           — Gibson assembly output.
 *   - 'op_golden_gate'      — GG assembly output.
 *   - 'op_ligate'           — Ligate output.
 *   - 'op_kld'              — KLD mutant.
 *   - 'op_mutagenesis'      — Mutagenesis mutant.
 *   - 'op_gibson_primer_designed' — designed primer oligos из GibsonOpPopup.
 */

/**
 * @typedef {Object} Annotation
 * @property {string=} id
 * @property {string=} name
 * @property {string=} type            — 'CDS', 'promoter', 'rep_origin', 'misc_feature' etc.
 * @property {string=} kind            — alias for type (multi-shape conventions).
 * @property {string=} feature         — alias for type.
 * @property {string=} featureType     — alias for type.
 * @property {string=} level           — 'region' | 'detail' | 'point'.
 * @property {number} start
 * @property {number} end
 * @property {number=} strand          — 1 | -1.
 * @property {boolean=} auto           — auto-annotated.
 * @property {string=} regionId        — parent region reference.
 * @property {boolean=} predicted      — ghost annotation.
 */

/**
 * @typedef {Object} EndsInfo
 * @property {string|null} fivePrime
 * @property {string|null} threePrime
 */

/**
 * @typedef {Object} ContainerTopology
 * @property {boolean} circular
 */

/**
 * @typedef {Object} Container
 * @property {string} id
 * @property {'molecule'|'oligonucleotide'} kind
 * @property {string} name
 * @property {string} sequence
 * @property {number} length
 * @property {ContainerTopology} topology
 * @property {Annotation[]} annotations
 * @property {EndsInfo|null} ends
 * @property {Origin} origin
 * @property {string|null} parentCommitId
 * @property {boolean=} frozen
 * @property {string=} customColor
 * @property {number=} strand
 * @property {OligoPayload=} payload   — only for kind='oligonucleotide'.
 */

/**
 * @typedef {Object} OligoSequence
 * @property {string} name             — 'fwd' / 'rev' / arbitrary.
 * @property {string} sequence
 * @property {number=} length
 * @property {number=} Tm
 * @property {number=} GC
 * @property {number=} homologyLen
 */

/**
 * @typedef {Object} OligoPayload
 * @property {OligoSequence[]} sequences
 * @property {string=} purpose         — 'pcr_primer' | 'gibson_homology_primer' | etc.
 */

// ─── Origin variants ─────────────────────────────────────────────────

/** @typedef {Object} OriginBase
 * @property {string} kind
 */

/**
 * @typedef {Object} OriginPlaceholder
 * @property {'placeholder'} kind
 */

/**
 * @typedef {Object} OriginTreeDrag
 * @property {'tree_drag'|'tree_pick'} kind
 * @property {string=} sourceEntryId
 */

/**
 * @typedef {Object} OriginFork
 * @property {'fork'} kind
 * @property {string} sourceContainerId
 */

/**
 * @typedef {Object} OriginOpPCR
 * @property {'op_pcr'} kind
 * @property {string} operationId
 * @property {string} parentContainerId
 * @property {string=} primerPairId
 * @property {number=} fwdStart
 * @property {number=} revEnd
 * @property {boolean=} autoDesign
 * @property {Object=} designedPrimers
 * @property {boolean=} multiTemplate
 * @property {string[]=} skipped
 */

/**
 * @typedef {Object} OriginOpCut
 * @property {'op_cut'} kind
 * @property {string} operationId
 * @property {string} parentContainerId
 * @property {string[]} enzymes
 * @property {boolean} parentWasCircular
 * @property {boolean} isExcised
 * @property {number} fragmentIndex
 */

/**
 * @typedef {Object} OriginOpGibson
 * @property {'op_gibson'} kind
 * @property {string} operationId
 * @property {'overlap'} method
 * @property {string[]} inputIds
 * @property {number[]} overlaps
 * @property {number} missingOverlap
 */

/**
 * @typedef {Object} OriginOpGoldenGate
 * @property {'op_golden_gate'} kind
 * @property {string} operationId
 * @property {string} enzyme
 * @property {'goldengate'} method
 * @property {string[]} inputIds
 * @property {number[]} overlaps
 * @property {number} recogTrimmed
 */

/**
 * @typedef {Object} OriginOpLigate
 * @property {'op_ligate'} kind
 * @property {string} operationId
 * @property {'sticky'|'blunt'} ends
 * @property {string[]} inputIds
 * @property {number[]} overlaps
 */

/**
 * @typedef {Object} OriginOpKLD
 * @property {'op_kld'} kind
 * @property {string} operationId
 * @property {string} parentContainerId
 * @property {string} primerPairId
 * @property {number} fwdTailLen
 * @property {number} revTailLen
 * @property {number} fwdAnnealLen
 * @property {number} revAnnealLen
 * @property {number} deletionSize
 * @property {number} insertionSize
 * @property {boolean} dpniDigest
 */

/**
 * @typedef {Object} OriginOpMutagenesis
 * @property {'op_mutagenesis'} kind
 * @property {string} operationId
 * @property {string} parentContainerId
 * @property {string} mutType
 * @property {number} mutationCount
 */

/**
 * @typedef {Object} OriginOpPCRDesigned
 * @property {'op_pcr_designed'} kind
 * @property {string} operationId
 * @property {string} parentContainerId
 */

/**
 * @typedef {Object} OriginOpGibsonPrimerDesigned
 * @property {'op_gibson_primer_designed'} kind
 * @property {string} parentContainerId
 */

/**
 * @typedef {OriginPlaceholder|OriginTreeDrag|OriginFork|OriginOpPCR|OriginOpCut|
 *          OriginOpGibson|OriginOpGoldenGate|OriginOpLigate|OriginOpKLD|
 *          OriginOpMutagenesis|OriginOpPCRDesigned|OriginOpGibsonPrimerDesigned}
 *          Origin
 */

// ─── Known origin kinds ──────────────────────────────────────────────

export const KNOWN_ORIGIN_KINDS = Object.freeze(new Set([
  'placeholder',
  'tree_drag',
  'tree_pick',
  'fork',
  'op_pcr',
  'op_pcr_designed',
  'op_cut',
  'op_gibson',
  'op_golden_gate',
  'op_ligate',
  'op_kld',
  'op_mutagenesis',
  'op_gibson_primer_designed',
]));

// ─── Required fields per origin.kind ────────────────────────────────

const REQUIRED_FIELDS_BY_KIND = Object.freeze({
  placeholder: [],
  tree_drag: [],
  tree_pick: [],
  fork: ['sourceContainerId'],
  op_pcr: ['operationId', 'parentContainerId'],
  op_pcr_designed: ['operationId', 'parentContainerId'],
  op_cut: ['operationId', 'parentContainerId', 'enzymes', 'parentWasCircular', 'isExcised', 'fragmentIndex'],
  op_gibson: ['operationId', 'method', 'inputIds', 'overlaps'],
  op_golden_gate: ['operationId', 'enzyme', 'method', 'inputIds', 'overlaps'],
  op_ligate: ['operationId', 'ends', 'inputIds', 'overlaps'],
  op_kld: ['operationId', 'parentContainerId', 'primerPairId', 'fwdAnnealLen', 'revAnnealLen', 'deletionSize', 'insertionSize'],
  op_mutagenesis: ['operationId', 'parentContainerId', 'mutType', 'mutationCount'],
  op_gibson_primer_designed: ['parentContainerId'],
});

// ─── Validators ──────────────────────────────────────────────────────

/**
 * validateOrigin — returns array of error strings (empty if valid).
 * Не бросает; вызывающий решает что делать (DEV warn / silent).
 */
export function validateOrigin(origin) {
  const errors = [];
  if (!origin || typeof origin !== 'object') {
    errors.push('origin is not an object');
    return errors;
  }
  if (typeof origin.kind !== 'string') {
    errors.push('origin.kind missing or not string');
    return errors;
  }
  if (!KNOWN_ORIGIN_KINDS.has(origin.kind)) {
    errors.push(`origin.kind unknown: "${origin.kind}". Expected one of: ${[...KNOWN_ORIGIN_KINDS].join(', ')}`);
    return errors;
  }
  const required = REQUIRED_FIELDS_BY_KIND[origin.kind] || [];
  for (const field of required) {
    if (origin[field] === undefined || origin[field] === null) {
      errors.push(`origin.kind="${origin.kind}" missing required field "${field}"`);
    }
  }
  return errors;
}

/**
 * validateContainer — returns array of error strings (empty if valid).
 */
export function validateContainer(container) {
  const errors = [];
  if (!container || typeof container !== 'object') {
    errors.push('container is not an object');
    return errors;
  }
  if (typeof container.id !== 'string' || container.id.length === 0) {
    errors.push('container.id missing or empty');
  }
  if (container.kind && container.kind !== 'molecule' && container.kind !== 'oligonucleotide') {
    errors.push(`container.kind unexpected: "${container.kind}". Expected 'molecule' or 'oligonucleotide'.`);
  }
  if (typeof container.name !== 'string') {
    errors.push('container.name not a string');
  }
  if (typeof container.sequence !== 'string') {
    errors.push('container.sequence not a string');
  }
  if (!container.topology || typeof container.topology.circular !== 'boolean') {
    errors.push('container.topology.circular not a boolean');
  }
  if (!Array.isArray(container.annotations)) {
    errors.push('container.annotations not an array');
  }
  if (container.origin !== undefined) {
    const originErrors = validateOrigin(container.origin);
    for (const e of originErrors) errors.push(`origin: ${e}`);
  }
  return errors;
}

/**
 * assertContainerOk — DEV mode (when isDev=true): warn в console если
 * не валидно. Production — silent. Returns boolean (валидно ли).
 */
export function assertContainerOk(container, ctx = '') {
  const errors = validateContainer(container);
  if (errors.length === 0) return true;
  if (isDevMode()) {
    // eslint-disable-next-line no-console
    console.warn(`[validateContainer] ${ctx ? ctx + ': ' : ''}${errors.length} issues`, errors, container);
  }
  return false;
}

function isDevMode() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return !!(import.meta.env.DEV || import.meta.env.VITEST);
    }
  } catch (_) { /* swallow */ }
  return false;
}

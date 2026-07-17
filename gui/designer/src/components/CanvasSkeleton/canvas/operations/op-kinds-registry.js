/**
 * op-kinds-registry — single source of truth для всех Operation kinds.
 *
 * R12-1 (15.05.2026 — DEC-OPS-KIND-REGISTRY-01). До этого момента
 * каждый kind дублировался в:
 *   - op-icons.ICONS (icon component).
 *   - lib-adapters.REGISTRY (adapter function).
 *   - OpSuggestions heuristic кейсы.
 *   - Tests с hardcoded strings.
 *
 * Добавление нового kind = 5+ touches, drift неизбежен. Этот файл —
 * единая точка где всё конфигурируется.
 *
 * Каждый kind register'ит:
 *   - kind        — internal string identifier ('pcr', 'cut', ...).
 *   - label       — user-facing UI label ('PCR', 'Cut', ...).
 *   - desc        — short tooltip description.
 *   - originKind  — origin.kind для outputs ('op_pcr', 'op_cut', ...).
 *   - adapter     — executeXxx function (imported lazily).
 *   - icon        — XxxIcon component.
 *   - inputs      — semantic input description ({type, label, min, max}).
 *   - acceptsMultiSelectInputs — biolog Ctrl+click prefill → op.inputs.
 *
 * Consumer pattern:
 *   import { OP_KINDS_LIST, getOpKindDef, getAdapter } from './op-kinds-registry';
 */
import { executeCut } from './adapters/cut';
import { executePCR } from './adapters/pcr';
import { executeGibson } from './adapters/gibson';
import { executeGoldenGate } from './adapters/golden-gate';
import { executeLigate } from './adapters/ligate';
import { executeKLD } from './adapters/kld';
import { executeMutagenesis } from './adapters/mutagenesis';
import { executeBlunt } from './adapters/blunt';

/**
 * @typedef {Object} OpKindDef
 * @property {string} kind
 * @property {string} label
 * @property {string} desc
 * @property {string} originKind   — origin.kind тэг outputs.
 * @property {Function} adapter
 * @property {string=} inputsLabel
 * @property {number=} minInputs
 * @property {number=} maxInputs   — Infinity для unlimited.
 * @property {boolean=} acceptsMultiSelectInputs
 */

/** @type {OpKindDef[]} */
export const OP_KINDS_LIST = [
  {
    kind: 'pcr',
    label: 'PCR',
    desc: 'Амплификация фрагмента',
    originKind: 'op_pcr',
    adapter: executePCR,
    inputsLabel: 'template + primer pair',
    minInputs: 1,
    maxInputs: 2,
    acceptsMultiSelectInputs: false,
  },
  {
    kind: 'cut',
    label: 'Cut',
    desc: 'Рестрикция эндонуклеазами',
    originKind: 'op_cut',
    adapter: executeCut,
    inputsLabel: 'template',
    minInputs: 1,
    maxInputs: 1,
    acceptsMultiSelectInputs: false,
  },
  {
    kind: 'gibson',
    label: 'Gibson',
    desc: 'Сборка через 20-40 bp overlap',
    originKind: 'op_gibson',
    adapter: executeGibson,
    inputsLabel: 'fragments (≥2 linear)',
    minInputs: 2,
    maxInputs: Infinity,
    acceptsMultiSelectInputs: true,
  },
  {
    kind: 'golden_gate',
    label: 'Golden Gate',
    desc: 'Type IIS, 4-nt overhang assembly',
    originKind: 'op_golden_gate',
    adapter: executeGoldenGate,
    inputsLabel: 'fragments (≥2 with BsaI/BpiI overhangs)',
    minInputs: 2,
    maxInputs: Infinity,
    acceptsMultiSelectInputs: true,
  },
  {
    kind: 'ligate',
    label: 'Ligate',
    desc: 'Лигирование (sticky / blunt)',
    originKind: 'op_ligate',
    adapter: executeLigate,
    inputsLabel: 'fragments (≥2)',
    minInputs: 2,
    maxInputs: Infinity,
    acceptsMultiSelectInputs: true,
  },
  {
    kind: 'kld',
    label: 'KLD',
    desc: 'KLD-мутагенез (kinase-ligase-DpnI)',
    originKind: 'op_kld',
    adapter: executeKLD,
    inputsLabel: 'circular template + primer pair',
    minInputs: 2,
    maxInputs: 2,
    acceptsMultiSelectInputs: false,
  },
  {
    kind: 'mutagenesis',
    label: 'Mutate',
    desc: 'Точечный мутагенез',
    originKind: 'op_mutagenesis',
    adapter: executeMutagenesis,
    inputsLabel: 'template',
    minInputs: 1,
    maxInputs: 1,
    acceptsMultiSelectInputs: false,
  },
  {
    kind: 'blunt',
    label: 'Blunt',
    desc: 'Затупление концов экзонуклеазой/полимеразой',
    originKind: 'op_blunt',
    adapter: executeBlunt,
    inputsLabel: 'fragment (1 с липкими концами)',
    minInputs: 1,
    maxInputs: 1,
    acceptsMultiSelectInputs: false,
  },
];

/** @type {Object<string, OpKindDef>} */
export const OP_KINDS_BY_KIND = Object.freeze(
  Object.fromEntries(OP_KINDS_LIST.map((d) => [d.kind, d])),
);

/** Set of all known kinds для exhaustive switch checks. */
export const KNOWN_OP_KINDS = Object.freeze(new Set(OP_KINDS_LIST.map((d) => d.kind)));

/** Adapter registry (kind → executeXxx) — sostavляется из definitions. */
export const OP_ADAPTER_REGISTRY = Object.freeze(
  Object.fromEntries(OP_KINDS_LIST.map((d) => [d.kind, d.adapter])),
);

/**
 * getOpKindDef — lookup definition by kind.
 */
export function getOpKindDef(kind) {
  return OP_KINDS_BY_KIND[kind] || null;
}

/**
 * getAdapter — adapter function for kind, или null если unknown.
 */
export function getAdapter(kind) {
  return OP_ADAPTER_REGISTRY[kind] || null;
}

/**
 * isKnownKind — true если kind зарегистрирован.
 */
export function isKnownKind(kind) {
  return KNOWN_OP_KINDS.has(kind);
}

/**
 * canAcceptMultiSelectAsInputs — для UX «выделил Ctrl+click 3 фрагмента →
 * Gibson op получает их в inputs автоматически».
 */
export function canAcceptMultiSelectAsInputs(kind) {
  const def = OP_KINDS_BY_KIND[kind];
  return !!(def && def.acceptsMultiSelectInputs);
}

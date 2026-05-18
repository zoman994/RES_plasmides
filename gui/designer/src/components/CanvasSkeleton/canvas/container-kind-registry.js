/**
 * container-kind-registry — central registry для container kinds.
 *
 * Sprint M-CANVAS-OPS K10 (12.05.2026 — DEC-OPS-09). Extensible reg
 * для будущих kinds (gblock, RNA, protein). Каждый kind описывает:
 *   - icon: tree icon glyph (либо renderable component)
 *   - blockRenderer: имя block-компонента для canvas (`ContainerBlock`
 *     для molecule + placeholder, `OligonucleotideBlock` для oligo)
 *   - treeIcon: glyph в Library tree
 *   - canBePCRInput / canBePCRTemplate: PCR popup filtering hints
 *   - payloadShape: краткое описание ожидаемого payload (только для
 *     документации / smoke-проверок).
 *
 * Lookup helper: getKindRegistry(kind) — fallback to 'molecule'.
 */

export const KIND_REGISTRY = {
  molecule: {
    icon: '◯',
    treeIcon: '◯',
    blockRenderer: 'ContainerBlock',
    canBePCRInput: false,
    canBePCRTemplate: true,
    payloadShape: ['sequence', 'annotations', 'topology', 'length', 'ends'],
    label: 'Молекула',
  },
  oligonucleotide: {
    icon: '🧬',
    treeIcon: '🧬',
    blockRenderer: 'OligonucleotideBlock',
    canBePCRInput: true,
    canBePCRTemplate: false,
    payloadShape: ['sequences', 'purpose', 'concentration_uM', 'stock_volume_ul'],
    label: 'Олигонуклеотиды',
  },
  placeholder: {
    icon: '+',
    treeIcon: null, // placeholders never in tree
    blockRenderer: 'ContainerBlock', // dashed variant inside ContainerBlock
    canBePCRInput: false,
    canBePCRTemplate: false,
    payloadShape: [],
    label: 'Placeholder',
  },
};

export function getKindRegistry(kind) {
  return KIND_REGISTRY[kind] || KIND_REGISTRY.molecule;
}

/**
 * isOligonucleotideKind — кратко: kind === 'oligonucleotide'. Используется
 * в PCR popup для фильтрации primer-pair selector.
 */
export function isOligonucleotideKind(container) {
  return container?.kind === 'oligonucleotide';
}

/**
 * isMoleculeKind — kind === 'molecule' либо undefined (default).
 */
export function isMoleculeKind(container) {
  if (!container) return false;
  return !container.kind || container.kind === 'molecule';
}

/**
 * detectKindFromLibraryEntry — heuristic для определения kind при
 * импорте записи из Library tree. Базируется на entry.kind либо
 * entry.payload.purpose / .sequences[].
 */
export function detectKindFromLibraryEntry(entry) {
  if (!entry) return 'molecule';
  if (entry.kind === 'oligonucleotide') return 'oligonucleotide';
  const payload = entry.payload || {};
  if (Array.isArray(payload.sequences) && payload.sequences.length > 0) {
    return 'oligonucleotide';
  }
  if (payload.purpose === 'pcr_primer'
    || payload.purpose === 'kld_primer'
    || payload.purpose === 'sequencing'
    || payload.purpose === 'cloning') {
    return 'oligonucleotide';
  }
  return 'molecule';
}

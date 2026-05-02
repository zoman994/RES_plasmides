/**
 * STRINGS.workspace namespace (M-B.1 K4).
 *
 * Layout-only strings used inside MoleculeWorkspace (LeftPane + RightPane) —
 * Importer-specific verbs (Confirm / Back to Source / mode toggle) live in
 * STRINGS.importer because they're wrapping concerns, not workspace concerns.
 * That keeps M-D Container Window free to wrap MoleculeWorkspace without
 * dragging Importer copy along.
 */
export const WORKSPACE_STRINGS = {
  paneMapTitle: 'Карта молекулы',
  paneSequenceTitle: 'Последовательность',
  paneAnnotationsTitle: 'Аннотации',

  topologyCircular: 'Кольцевая',
  topologyLinear: 'Линейная',

  startPointLabel: 'Стартовая точка (origin)',
  startPointHint: 'Сдвинет нумерацию: позиция N станет 1.',
  startPointApply: 'Применить',
  startPointDisabledHint: 'Только для кольцевых молекул.',

  autoAnnotateLabel: 'Auto-annotate',
  autoAnnotateOnHint: 'Дополнить файла feature‑homology поиском по common features.',
  autoAnnotateOffHint: 'Только features из файла, без enrichment.',

  selectedAnnotationFooter: (name, start, end) =>
    `Выбрано: «${name}» · ${start + 1}..${end}`,
  selectionEmpty: 'Выберите аннотацию для подсветки в sequence.',

  sequenceReadOnlyBadge: 'read-only',
  sequenceLengthBadge: (len) => `${len} bp`,

  empty: 'Молекула не загружена.',
};

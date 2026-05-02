/**
 * STRINGS.importer namespace (M-B.1 K2; expanded in K6 with autoname /
 * primer-wizard text). Imported and merged into the global STRINGS dict
 * by `lib/strings.js`. Kept in a sibling file so component-local strings
 * stay near their UI without forcing strings.js to grow into every
 * component during M-B.
 */
export const IMPORTER_STRINGS = {
  fullscreenTitle: 'Импорт',
  toProjectTitle: 'Импорт в проект',
  toLibraryTitle: 'Импорт в библиотеку',

  topbarButton: '+ Импорт',

  modeAdvanced: 'Расширенный',
  modeSimple: 'Простой',
  modeAdvancedHint: 'Расширенный режим — после загрузки откроется Combined view: карта, аннотации (auto-annotate включён), sequence pane. Можно править аннотации, повернуть origin и Confirm.',
  modeSimpleHint: 'Простой режим — файл уйдёт прямо в Library и DAG, без preview. Auto-annotate выключен. Подходит для batch-импорта или быстрого просмотра.',

  step1Title: 'Источник',
  step2Title: 'Combined view',

  dropzoneIdle: 'Перетащите файл или нажмите, чтобы выбрать',
  dropzoneHover: 'Отпустите, чтобы загрузить',
  dropzoneAccepts: 'GenBank (.gb / .gbk), FASTA (.fa / .fasta), SnapGene (.dna)',
  dropzoneSelectFile: 'Выбрать файл…',

  pasteTitle: 'Или вставьте sequence',
  pasteDisabledHint: 'Paste source — в M-B.2',

  filesReady: (n) => `Файлов готово: ${n}`,
  fileError: (name, msg) => `${name}: ${msg}`,

  back: '← Источник',
  next: 'Далее →',
  cancel: 'Отмена',
  confirm: '✓ Импортировать',

  closeAria: 'Закрыть Importer',

  noFilesYet: 'Файлы ещё не загружены',
  busyParsing: 'Парсинг файлов…',

  // Step 2 + multi-file (K5).
  confirmBusy: 'Импорт…',
  confirmHintProject: 'Будет добавлено в Library и в проект.',
  confirmHintLibrary: 'Будет добавлено только в Library.',

  multiFilesHeader: (n) => `Файлов: ${n}`,
  multiApplyAllAutoAnnotate: 'Auto-annotate ко всем',
  multiFileMeta: (length, regions, status) => `${length} bp · ${regions} regions · ${status}`,
  multiStatusEnriched: 'enriched',
  multiStatusFileOnly: 'file-only',
  multiStatusError: 'parse error',
  autoAnnotateLabel: 'Auto-annotate',

  // Simple-mode (K3) toasts and flash UI.
  simpleBusy: 'Импорт…',
  simpleFlashTitle: 'Импорт завершён',
  simpleFlashSubtitle: 'Importer закроется автоматически',
  simpleAddedOne: (name) => `«${name}» добавлен в Library`,
  simpleAddedOneToProject: (name) => `«${name}» добавлен в Library и проект`,
  simpleAddedRenamedOne: (baseName, finalName) =>
    `«${finalName}» добавлен (был дубль с «${baseName}»)`,
  simpleAddedMany: (n) => `Добавлено ${n} файлов в Library`,
  simpleAddedManyToProject: (n) => `Добавлено ${n} файлов в Library и проект`,
  simpleSkipped: (n) => `Пропущено: ${n}`,
  simpleFailed: (msg) => `Импорт не удался: ${msg}`,
};

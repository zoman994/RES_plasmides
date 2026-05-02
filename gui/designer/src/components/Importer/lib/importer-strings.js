/**
 * STRINGS.importer namespace (M-B.1 K2; expanded in M-B.2 K1 with single-screen
 * + tab-bar copy, expanded again in K6 with full catalog group / summary
 * category / session badge keys). Imported and merged into the global STRINGS
 * dict by `lib/strings.js`. Kept in a sibling file so component-local strings
 * stay near their UI without forcing strings.js to grow into every component
 * during M-B.
 */
export const IMPORTER_STRINGS = {
  fullscreenTitle: 'Импорт',
  toProjectTitle: 'Импорт в проект',
  toLibraryTitle: 'Импорт в библиотеку',

  topbarButton: '+ Импорт',

  modeAdvanced: 'Расширенный',
  modeSimple: 'Простой',
  modeAdvancedHint: 'Расширенный режим — single-screen с каталогом, просмотром и табами «Последовательность» / «Аннотации». Можно править аннотации и повернуть origin до подтверждения.',
  modeSimpleHint: 'Простой режим — файл уйдёт прямо в Library и DAG, без preview. Auto-annotate выключен. Подходит для batch-импорта или быстрого просмотра.',

  // Header counts
  filesReady: (n) => `Файлов: ${n}`,
  fileError: (name, msg) => `${name}: ${msg}`,

  // CatalogColumn (M-B.2 K2 — full source set + drill-down + flat search).
  catalogTitle: 'Каталог',
  catalogSearchPlaceholder: 'Поиск (имя, описание, >5kb, <2k, 2k-3k)…',
  catalogPastePlaceholder: 'Вставьте sequence (Ctrl+Enter — загрузить)',
  catalogPasteSubmit: 'Загрузить',
  catalogReplaceModeConfirm: 'Заменить весь batch одним файлом из каталога?',

  // CatalogColumn — group labels.
  catalogGroupCanvas: (name) => `Этот ${name || 'проект'}`,
  catalogGroupDemo: 'Учебные / demo',
  catalogGroupMine: 'Моя библиотека',
  catalogGroupSnapgene: 'Каталог SnapGene',
  catalogEmptyProject: 'нет контейнеров в проекте',
  catalogEmptyGroup: 'пусто',
  catalogLoading: 'загрузка…',
  catalogBack: 'Назад',
  catalogUntaggedTag: 'Без тегов',
  catalogMineFlatLabel: 'Все контейнеры',
  catalogFlatFound: (n) => `Найдено: ${n}`,
  catalogFlatEmpty: 'Ничего не найдено',
  catalogFlatTruncated: (total) => `Показаны первые 60 из ${total}.`,

  // Drop zone footer (inside CatalogColumn, K2).
  catalogDropzoneIdle: 'Перетащите или выберите файл',
  catalogDropzoneAccepts: '.dna · .gb · .gbk · .fasta',
  dropzoneIdle: 'Перетащите файл или нажмите, чтобы выбрать',
  dropzoneHover: 'Отпустите, чтобы загрузить',
  dropzoneAccepts: 'GenBank (.gb / .gbk), FASTA (.fa / .fasta), SnapGene (.dna)',

  // Inspector / TabBar
  emptyInspectorHint1: 'Выберите плазмиду из каталога слева',
  emptyInspectorHint2: 'или перетащите файл в зону внизу',
  untitledItem: '(без имени)',

  tabOverview: 'Обзор',
  tabSequence: 'Последовательность',
  tabAnnotations: 'Аннотации',
  tabHistory: 'История',
  tabHistoryPlaceholder: 'История появится после первого commit\'а в Container Window (M-D).',
  tabHistoryEmptyM_D: 'commits нет — появятся после M-D Container Window.',
  tabOverviewPlaceholderK1: 'Здесь будет PlasmidMiniMap + категории СЕЛЕКЦИЯ / ПРОМОТОРЫ / ORIGIN / TAGS (K3).',
  tabSequencePlaceholderK1: 'SequenceMapView read-only смонтируется тут после K4.',
  tabAnnotationsPlaceholderK1: 'AnnotationEditor смонтируется тут после K4.',
  sequenceReadOnly: 'read-only',
  annotationsCount: (n) => `${n} аннотаций`,

  // SessionSummary
  sessionSummaryTitle: '✓ Уже добавлено в этой сессии',
  sessionSummaryOpenCanvas: 'Открыть холст →',
  sessionBadgeCanvas: '✓ Канвас',
  sessionBadgeLibrary: '📚 Библиотека',
  sessionBadgeAnnotate: (n) => `🏷 +${n} регионов`,
  sessionBadgeReplaced: '↻ заменён',

  // Inspector overview / summary categories (K3).
  summaryWhatInFile: 'Что в файле',
  summarySelection: 'СЕЛЕКЦИЯ',
  summarySelectionIcon: '🛡',
  summaryPromoters: 'ПРОМОТОРЫ',
  summaryPromotersIcon: '📣',
  summaryOrigins: 'ORIGIN',
  summaryOriginsIcon: '⚓',
  summaryTags: 'TAGS',
  summaryTagsIcon: '🏷',
  summaryCdsList: (n) => `CDS (${n})`,
  summaryReSites: '🔬 САЙТЫ РЕСТРИКЦИИ',
  summaryWarnings: (n) => `${n} замечаний валидации`,

  // Inline title.
  inlineTitlePlaceholder: '(без имени)',
  inlineTitleAria: 'Имя плазмиды',

  // ActionsBar (single + multi)
  actionCanvas: 'На канвас',
  actionLibrary: 'В библиотеку',
  actionAnnotate: '📥 Авто-аннотация',
  actionDownloadGB: '💾 Скачать как .gb',
  actionDeleteSession: '🗑 Удалить из сессии',
  actionOverflowAria: 'Дополнительно',

  deleteFromSessionConfirm: 'Удалить файл из сессии?',
  deleteAllConfirm: 'Удалить весь batch файлов?',

  // MetaColumn
  metaTopology: 'топология',
  metaTopologyCircular: '◯ круглая',
  metaTopologyLinear: '— линейная',
  metaTopologyCircularTitle: 'Круглая (плазмида)',
  metaTopologyLinearTitle: 'Линейная',
  metaLengthLabel: 'длина',
  metaOrigin: 'начало (п.н.)',
  metaOriginApply: '↻ применить',
  metaOriginHint: (gaps) => `межгенные участки: ${gaps}`,
  metaInfo: 'информация',
  metaInfoFromFile: 'Из файла',
  metaInfoEnriched: 'Дополнено',
  metaIupac: (chars) => `Содержит IUPAC: ${chars} — праймеры по таким участкам не дизайнятся, программа предупредит при сборке.`,

  // Multi-mode
  multiHeader: (n) => `Загружено ${n} файл${n === 1 ? '' : n < 5 ? 'а' : 'ов'}`,
  multiReplaceAll: '↻ заменить все',
  multiBatchLibrary: (n) => `В библиотеку (${n})`,
  multiActionDeleteAll: '🗑 Удалить весь batch',
  multiRemoveAria: 'Удалить из списка',
  multiColName: 'Имя',
  multiColLength: 'Длина',
  multiColRegions: 'Регионов',
  multiColAnnotate: 'Аннот.',
  multiCanvasDisabledTitle: 'Доступно для одиночной загрузки',

  // Region count helper
  summaryRegionCount: (n) => `${n} регионов`,

  // Confirm-flow hints (mode-agnostic)
  confirmBusy: 'Импорт…',
  confirmHintProject: 'Будет добавлено в Library и в проект.',
  confirmHintLibrary: 'Будет добавлено только в Library.',

  // Keep simple-mode + autoname/primer-wizard strings as-is from M-B.1 K6.
  busyParsing: 'Парсинг файлов…',
  closeAria: 'Закрыть Importer',

  // Simple-mode (M-B.1 K3) toasts and flash UI.
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

  // K6 (M-B.1) — AutonameModal.
  autonameTitle: (baseName) => `«${baseName}» уже есть в Library`,
  autonameExistingPreview: (name, length, addedAt) =>
    `Existing: ${name} · ${length} bp · ${addedAt}`,
  autonameInputLabel: 'Имя для новой записи',
  autonamePrimary: (name) => `✓ Сохранить как «${name}»`,
  autonameAdvancedShow: '▾ Advanced: заменить existing / пропустить',
  autonameAdvancedHide: '▴ Свернуть advanced',
  autonameReplace: 'Заменить existing',
  autonameSkip: 'Пропустить',
  cancel: 'Отмена',

  // K6 (M-B.1) — PrimerWizardStepModal.
  primerWizardTitle: (n) => `Праймеры из файла (${n})`,
  primerWizardPoolHint:
    'Праймеры пойдут в unified pool: видны и в Library Primers, и в Project Primer Pool по фильтру projectId.',
  primerWizardSelectedCount: (sel, total) => `Выбрано: ${sel}/${total}`,
  primerWizardAdd: (n) => n > 0 ? `+ Добавить ${n}` : '+ Добавить',
  primerWizardSkip: 'Пропустить праймеры',
  primerStatusImported: 'imported',
  primerDupeBadge: '⚠ дубль',
  primerMeta: (len, tm, direction) => {
    const parts = [`${len} bp`];
    if (typeof tm === 'number') parts.push(`Tm ${tm.toFixed(1)}°C`);
    if (direction) parts.push(direction);
    return parts.join(' · ');
  },

  // K6 (M-B.1) — Confirm flow toasts.
  confirmAddedOne: (name) => `«${name}» добавлен в Library`,
  confirmAddedOneToProject: (name) => `«${name}» добавлен в Library и проект`,
  confirmAddedMany: (n) => `Добавлено ${n} файлов в Library`,
  confirmAddedManyToProject: (n) => `Добавлено ${n} файлов в Library и проект`,
  confirmReplaced: (name) => `«${name}» заменён`,
  confirmSkippedOne: (name) => `«${name}» пропущен`,
  confirmPrimersAdded: (n) => `+ ${n} праймеров в pool`,
  confirmFailed: (msg) => `Импорт не удался: ${msg}`,
};

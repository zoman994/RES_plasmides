/**
 * STRINGS.importer namespace (M-B.1 K2; rewritten in M-B.2 K1 for the
 * single-screen layout, expanded again in K2 (catalog), K3 (inspector
 * + meta + actions), K4 (lazy tabs), K5 (multi table), K6 (sweep + dead
 * key removal). Imported and merged into the global STRINGS dict by
 * `lib/strings.js`. Kept in a sibling file so component-local strings
 * stay near their UI without forcing strings.js to grow into every
 * component during M-B.
 */
export const IMPORTER_STRINGS = {
  toProjectTitle: 'Импорт в проект',
  toLibraryTitle: 'Импорт в библиотеку',

  topbarButton: '+ Импорт',

  // Header counts
  filesReady: (n) => `Файлов: ${n}`,

  // CatalogColumn (M-B.2 K2 — full source set + drill-down + flat search).
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

  // Drop zone footer (inside CatalogColumn).
  catalogDropzoneIdle: 'Перетащите или выберите файл',
  catalogDropzoneAccepts: '.dna · .gb · .gbk · .fasta',
  dropzoneHover: 'Отпустите, чтобы загрузить',

  // Inspector / TabBar
  emptyInspectorHint1: 'Выберите плазмиду из каталога слева',
  emptyInspectorHint2: 'или перетащите файл в зону внизу',
  emptyLibraryFirstTimeTitle: 'Ваша библиотека пуста',
  emptyLibraryFirstTimeBody: 'Перетащите .dna / .gb / .fasta файл в зону слева внизу — или вставьте sequence через текстовое поле. Также можно выбрать готовую плазмиду из «Учебные / demo» или каталога SnapGene слева.',
  untitledItem: '(без имени)',

  tabOverview: 'Обзор',
  tabSequence: 'Последовательность',
  tabAnnotations: 'Аннотации',
  tabHistory: 'История',
  tabHistoryPlaceholder: 'История появится после первого commit\'а в Container Window (M-D).',
  tabHistoryEmptyM_D: 'commits нет — появятся после M-D Container Window.',
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
  inlineTitleAria: 'Имя плазмиды',

  // TagsEditor (M-B.2 follow-up after Library fullscreen wipe).
  addTagPlaceholder: '+ тег',
  tagsLimit: (n) => `максимум ${n} тегов`,
  tagRemoveAria: (tag) => `Убрать тег ${tag}`,

  // ActionsBar (single + multi)
  actionCanvas: 'На канвас',
  actionCanvasNoProjectTitle: 'Откройте проект, чтобы добавить на канвас',
  actionLibrary: 'В библиотеку',
  actionLibraryCopy: 'Скопировать в библиотеку',
  actionAnnotate: '📥 Авто-аннотация',
  actionDownloadGB: '💾 Скачать как .gb',
  actionDeleteSession: '🗑 Удалить из сессии',
  actionOverflowAria: 'Дополнительно',

  deleteFromSessionConfirm: 'Удалить файл из сессии?',
  deleteAllConfirm: 'Удалить весь batch файлов?',

  // MetaColumn
  metaTopology: 'топология',
  metaTopologyCircularTitle: 'Круглая (плазмида)',
  metaTopologyLinearTitle: 'Линейная',
  metaLengthLabel: 'длина',
  metaOrigin: 'начало (п.н.)',
  metaOriginApply: '↻ применить',
  metaOriginHintLabel: 'межгенные участки',
  metaInfo: 'информация',
  metaInfoFromFile: 'Из файла',
  metaInfoEnriched: 'Дополнено',
  metaDescription: 'описание',
  metaOrganism: 'организм',
  metaSource: 'источник',
  metaSourceValue: (s) => {
    if (s === 'catalog') return 'каталог';
    if (s === 'mine') return 'моя библиотека';
    if (s === 'project') return 'этот проект';
    if (s === 'demo') return 'учебный';
    if (s === 'snapgene') return 'каталог SnapGene';
    if (s === 'paste') return 'вставка';
    if (s === 'file') return 'файл';
    return s;
  },
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

  busyParsing: 'Парсинг файлов…',

  // Confirm flow «skipped» toast still used (autoname Skip / parse fail).
  confirmSkipped: (n) => `Пропущено: ${n}`,

  // autoAnnotate toggle in ActionsBar overflow.
  actionAutoAnnotateOn: '✓ Автоматическая аннотация',
  actionAutoAnnotateOff: '☐ Автоматическая аннотация',

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
  confirmPrimersAdded: (n) => `+ ${n} праймеров в pool`,
  confirmFailed: (msg) => `Импорт не удался: ${msg}`,
};

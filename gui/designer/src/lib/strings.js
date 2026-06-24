/**
 * STRINGS — Centralized UI text dictionary for BodgeGene.
 *
 * Pattern: a plain JS namespace dictionary. Components import the named
 * `STRINGS` export and reference text via `STRINGS.<namespace>.<key>` instead
 * of inline literals.
 *
 *   import { STRINGS } from '../lib/strings';
 *   <button>{STRINGS.startScreen.newProject}</button>
 *
 * Why this and not i18next? In v0.6 the surface is small and English-only.
 * A dictionary gives us a single source of truth without runtime locale
 * switching, providers, or lazy bundles. When real localization becomes
 * necessary, migration to `react-i18next` is a one-pass swap of accessors
 * (`STRINGS.x.y` → `t('x.y')`) — components do not change shape.
 *
 * Conventions:
 *   - Keys are camelCase, grouped per component or domain.
 *   - Strings with runtime values are functions returning the final text:
 *       projectDeleted: (name) => `Project "${name}" deleted`
 *     This mirrors the `t(key, params)` shape of i18next so the call sites
 *     do not need to change at migration time.
 *   - Dev-only text (throws, console.error/warn) is NOT in STRINGS — it stays
 *     as English literals at the call site. STRINGS is for user-facing UI.
 */

import { IMPORTER_STRINGS } from '../components/Library/lib/importer-strings';

export const STRINGS = {
  importer: IMPORTER_STRINGS,

  align: {
    workspaceTitle: 'Выравнивание',
    subtitle: 'попарное · Sanger',
    run: 'Выровнять',
    action: 'Выровнять', // library action label
    needMore: 'Нужно минимум две последовательности.',
    chromatogram: 'Хроматограмма (Sanger)',
  },

  startScreen: {
    appName: 'BodgeGene',
    guide: 'Guide',
    settings: 'Settings',
    newProject: '+ New project',
    // M-X.7c K1 — «Загрузить .bodge…» replaces «Открыть .bodge…».
    // The semantics shift: import always activates the loaded
    // project (DEC-PROJECT-OPEN-MERGE-01), no separate «open» step.
    // K9 dropped the now-orphan `openBodge` key.
    loadBodge: '↑ Загрузить .bodge…',
    exportBodge: '⤓ Export .bodge…',
    exportDone: '✓ Done',
    exportEnterTitle: 'Export .bodge files',
    exportExitTitle: 'Exit export mode',
    browse: 'Browse',
    library: 'Library',
    primerPool: 'Primer pool',
    allProjects: 'All projects',
    groupProjects: 'Group projects',
    groupProjectsBadge: 'soon',
    installAsDesktopApp: 'Install as desktop app',
    appInstalled: 'App installed',
    installManualHint: 'Install via the browser menu: ⋮ → "Install BodgeGene" (or "Create shortcut" in Vivaldi). If the entry is missing, the browser does not consider the current tab to meet the PWA criteria.',
    recentProjects: 'Recent projects',
    noRecentProjects: 'No projects yet.',
    exportHeader: (count) => `Selecting for export · ${count} selected`,
    downloadSelected: (count) => `Download selected (${count})`,
    viewAllProjects: (count) => `View all ${count} projects →`,
    exportSuccessOne: '1 project exported',
    exportSuccessMany: (count) => `${count} projects exported`,
    untitled: 'Untitled',
    noFileLocation: 'no file location yet',
    noTags: 'no tags yet',
    noDescription: 'no description yet',
    containers: (n) => `${n} containers`,
    statusSaved: 'saved',
    statusOnlyInBrowser: 'only in browser',
    statusUnsaved: 'unsaved',
    deleteProjectTitle: 'Delete project',
    deleteProjectAria: (name) => `Delete project "${name}"`,
    projectDeletedToast: (name) => `Project "${name}" deleted`,
    timeAgo: {
      justNow: 'just now',
      minutes: (n) => `${n} min ago`,
      hourOne: '1 hour ago',
      hours: (n) => `${n} h ago`,
      yesterday: 'yesterday',
      days: (n) => `${n} d ago`,
      weeks: (n) => `${n} w ago`,
      months: (n) => `${n} mo ago`,
    },
  },

  topbar: {
    projectFallback: '—',
    untitled: 'Untitled',
    libraryTitle: 'Library',
    backTitle: 'Back',
    backAriaPop: 'Back',
    backAriaClose: 'Close project',
    // M-X.7c K1/K7 — RecentProjectsDropdown that opens on the
    // crumb (project name area). `noActiveProject` shows when
    // `currentProjectId === null`. M-X.8 K5 sunsets the dropdown
    // (crumb becomes static) but the strings stay for the
    // breadcrumb fallback text.
    noActiveProject: 'Без активного проекта',                      // EN: "No active project"
    recentProjectsHeader: 'Недавние проекты',                       // EN: "Recent projects"
    createNewProjectInDropdown: '+ Создать проект',                 // EN: "+ Create project"
    activeBadge: 'active',                                          // EN: "active"
    saveStatus: {
      unsavedDirty: 'Unsaved changes',
      neverSaved: 'Not saved',
      autosavedInBrowser: 'Autosaved in browser',
      savedAt: (when) => `Saved ${when}`,
    },
    dirtyDotAria: 'unsaved changes',
    settingsButton: 'Settings',
    projectInfoTitle: 'Project info',
    projectInfoAria: 'project info',
    // UX-037
    hotkeyHelpTitle: 'Keyboard shortcuts',
    hotkeyHelpAria: 'show keyboard shortcuts',
    timeAgo: {
      justNow: 'just now',
      minutes: (n) => `${n} min ago`,
      hours: (n) => `${n} h ago`,
    },
    themeToggle: {
      toLight: 'Switch to light theme',
      toDark: 'Switch to dark theme',
    },
  },

  hotkeyCheatsheet: {
    title: 'Keyboard shortcuts',
    hint: 'Press Esc to close.',
    // FAIL-fix-pass 5 — explain to the biolog why we added the
    // Ctrl+Shift+P / Ctrl+Shift+F alternates. Surfaces inside the
    // cheatsheet under the table.
    browserOverrideNote:
      'В браузере Ctrl+P / Ctrl+F могут быть перехвачены '
      + '(печать / поиск по странице). Используйте Ctrl+Shift+P / '
      + 'Ctrl+Shift+F как альтернативу. В Desktop-версии (Tauri, '
      + 'в работе) основные хоткеи будут работать всегда.',
  },

  projectInfo: {
    title: 'Project info',
    closeTitle: 'Close',
    closeAria: 'close',
    nameLabel: 'Name',
    descriptionLabel: 'Description',
    tagsLabel: 'Tags',
    tagsLimitReached: 'Tag limit (20) reached',
    tagInputPlaceholder: 'Add tag (Enter or comma)',
    tagAddButton: '+ add',
    tagSuggestionsHeader: 'Used before:',
    tagAddSuggestionTitle: (tag) => `Add tag "${tag}"`,
    tagRemoveAria: (tag) => `remove ${tag}`,
    saveButton: 'Save',
    cancelButton: 'Cancel',
    savedToast: 'Saved',
  },

  settings: {
    title: 'Settings',
    closeTitle: 'Close',
    closeAria: 'close',
    tabs: {
      identity: 'Identity',
      // UX-006
      display: 'Display & Defaults',
      advanced: 'Advanced',
    },
    identity: {
      hint: 'Identity = a label for commit attribution. Not an account.',
      nameLabel: 'Name',
      emailLabel: 'Email',
      saveButton: 'Save',
      savedToast: 'Identity saved',
    },
    // UX-006 — Display & Defaults aggregates user prefs that used to
    // be invisible or scattered. Theme + sequence wrap + polymerase +
    // primer prefix + annotate-on-import default.
    display: {
      hint: 'Visual + cloning defaults. Saved to your browser.',
      themeLabel: 'Theme',
      seqWrapLabel: 'Sequence wrap',
      seqWrapHint: 'Characters per line in the Sequence tab. 60 is the GenBank default.',
      annotateOnImportLabel: 'Annotate on import',
      annotateOnImportHint: 'Default state of «Annotate now» in the import modal.',
      annotateOnImportToggle: 'Run predictors automatically',
      synthesisThresholdLabel: 'Synthesis block threshold (nt)',
      synthesisThresholdHint: 'Typing in an assembly: ≤ this many nt is a primer-tail snippet, more becomes a synthesis block. Oligos ~60–100, ultramers ~200.',
    },
    advanced: {
      resetWarning: 'Reset will clear IndexedDB and localStorage. All local projects will be deleted.',
      resetButton: 'Reset (clear IndexedDB)',
      resetConfirmButton: 'Confirm reset',
      resetCancelButton: 'Cancel',
      resetFailed: (msg) => `Reset failed: ${msg}`,
    },
  },

  toast: {
    undoButton: 'Undo',
    closeAria: 'Close',
    saved: 'Saved',
    openFileFailed: (msg) => `Could not open file: ${msg}`,
    saveFailed: (msg) => `Could not save: ${msg}`,
    dropFileComingSoon: (name) => `File drop coming in M-B (${name})`,
  },

  pwa: {},

  multiTabLock: {
    blockedTitle: 'Project already open in another tab',
    blockedDescription: 'BodgeGene prevents editing the same project in more than one tab at a time.',
    takeControlButton: 'Take control',
    takingControlBusy: 'Taking over…',
    closeProjectButton: 'Close project',
    takeoverFailed: 'Could not take control — the other tab is holding the lock',
    forcedReadOnlyTitle: 'Control of this project moved to another tab',
    forcedReadOnlyDescription: 'This tab is now read-only. To keep editing, close the project here and continue in the active tab.',
  },

  hotkeys: {
    actionLabels: {
      newProject: 'New project',
      openBodge: 'Open .bodge',
      saveBodge: 'Save',
      closeProject: 'Close project',
      openSettings: 'Settings',
      escape: 'Close',
      projectInfo: 'Project info',
      // T7 — per-zone graph/sequence view toggle (focused zone).
      toggleZoneGraph: 'Zone: graph view',
      toggleZoneSequence: 'Zone: sequence view',
      // T10 — Sanger lab notebook panel toggle.
      toggleSangerNotebook: 'Sanger lab notebook',
      // ⌘P / Ctrl+P → jump to the Library + focus its search (the palette
      // was removed; the Library is the project hub).
      commandPalette: 'Библиотека: поиск',
    },
  },

  placeholder: {
    emptyProject: 'Empty project. Push containers from Importer (coming in M-B).',
    underConstructionFallbackName: 'Section',
    underConstructionTitle: (name) => `${name} — Under construction`,
    underConstructionSubtitle: (milestone) => `Coming in ${milestone}.`,
  },

  library: {
    title: 'Library',
    tabContainers: 'Containers',
    tabPrimers: 'Primers',
    topologyAll: 'All',
    topologyCircular: 'Circular',
    topologyLinear: 'Linear',
    importButton: '+ Import',
    importDisabledTooltip: 'Available in M-B.1',
    empty: 'Library is empty. Import containers and primers from project DAG (coming in M-B).',
    entryDeletedToast: (name) => `Entry "${name}" deleted`,
    addTagPlaceholder: '+ tag',
    tagsLimit: (limit) => `Maximum ${limit} tags per entry`,
    deleteEntryTitle: 'Delete entry',
    deleteEntryAria: (name) => `Delete entry "${name}"`,
    editTagsAria: (name) => `Edit tags for "${name}"`,
    tagRemoveAria: (tag) => `remove ${tag}`,
  },

  common: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
  },

  // M-C.1 K5 — DAG canvas namespace. Surface text is Russian (matches
  // the Library workspace tone biolog has been seeing). EN fallbacks
  // live in code comments next to each key. The dictionary still
  // mirrors the i18next key shape (DEC-MA2-01) so a future migration
  // is mechanical.
  dag: {
    // Empty state when the project has no containers yet.
    emptyHint: 'Перетащите плазмиду из библиотеки', // EN: "Drag a plasmid from the library"
    emptyCta: 'Открыть библиотеку для импорта',     // EN: "Open library to import"
    // Palette group labels (canonical order: thisProject → demo → mine → snapgene).
    paletteGroupThisProject: 'Этот проект',         // EN: "This project"
    paletteGroupDemo: 'Учебные / demo',             // EN: "Learning / demo"
    paletteGroupMine: 'Моя библиотека',             // EN: "My library"
    paletteGroupSnapgene: 'Каталог SnapGene',       // EN: "SnapGene catalog"
    // Sticky search placeholder. The «>5kb / <2k / 2k-3k» hints expose
    // the length-pattern shorthand inline so biolog doesn't have to
    // hunt for documentation.
    paletteSearchPlaceholder: 'Поиск (имя, >5kb, <2k, 2k-3k…)',
    paletteEmpty: 'пусто',
    paletteDragHandleAria: 'Перетащите на canvas',
    paletteCategoryCount: (n) => `${n} кат.`,
    // Drawer CTAs.
    drawerAddToCanvas: 'Добавить на canvas',        // EN: "Add to canvas"
    drawerClose: 'Закрыть',                          // EN: "Close"
    drawerRegionOverflow: (n) => `+${n} ещё`,        // EN: `+${n} more`
    // Container Window drill-in placeholder (DEC-MC1-05).
    containerWindowBack: '← Назад',
    containerWindowMessage: 'M-C.2 Container Window — В разработке',
    containerWindowFallbackName: (idShort) => `Контейнер ${idShort}…`,
    // Toast triggered when biolog drops the same library entry twice.
    toastAlreadyOnCanvas: 'Уже добавлено',          // EN: "Already on canvas"
    // Auto-layout button on the canvas top-right panel.
    autoLayoutButton: 'Авто-раскладка',              // EN: "Auto-layout"
    autoLayoutTooltip: 'Авто-раскладка (dagre LR)',
  },

  // M-X.7a v2 K7 — STRINGS namespace per spec §5.6. EN-comment beside
  // every RU value (M-C.1 K5 pattern). Consumed by LibraryWorkspace,
  // LibraryTopBar, LibraryTreeRoot, LooseZone / ProjectZone, AddModal,
  // and the read-only banners in SequenceTab + AnnotationsTab.
  // (LabPoolZone deleted in M-X.7c K4 — actionsLab namespace below
  // is kept until the M-E primer-pool View lands.)
  libraryWorkspace: {
    // M-X.7c K1/K4 — Loose zone re-renamed «⎀ БЕЗ ПРОЕКТА» per
    // DEC-UIRREV-ZONES-MERGE-01. K9 swept orphans:
    //   • zoneLooseTitle / zoneLooseSub  (replaced)
    //   • zoneLabTitle / zoneLabSub      (LabPoolZone deleted)
    //   • dagSubrow                      (DAG sub-folder removed)
    //   • inLab / crossProject           (LabPoolZone deleted)
    //   • breadcrumbNoProject            (replaced by topbar.noActiveProject)
    zoneLooseTitleNoProject: '⎀ БЕЗ ПРОЕКТА',                     // EN: "⎀ NO PROJECT"
    zoneLooseSubFreeDesk: 'свободный стол биолога',                // EN: "biolog's free desk"
    containersFolder: 'Контейнеры',                              // EN: "Containers"
    primersFolder: 'Праймеры',                                   // EN: "Primers"
    addBtn: '+ Добавить',                                        // EN: "+ Add"
    autoAnnotateLabel: 'Авто-аннотация',                         // EN: "Auto-annotation"
    autoAnnotateHint: 'Найти известные элементы по гомологии',   // EN: "Detect known features by homology"
    addTitleProject: 'Добавить в проект',                        // EN: "Add to project"
    addTitleLoose: 'Добавить на свободный стол',                 // EN: "Add to the free desk"
    pasteNameLabel: 'Имя (необязательно)',                       // EN: "Name (optional)"
    pasteNameHint: 'если в тексте есть >name — имя возьмётся из заголовка', // EN: "if the text has >name, the name comes from the header"
    pasteNamePlaceholder: 'напр. pLAB-1',                        // EN: "e.g. pLAB-1"
    topologyLabel: 'Топология',                                  // EN: "Topology"
    topologyLinear: 'Линейная',                                  // EN: "Linear"
    topologyCircular: 'Кольцевая',                               // EN: "Circular"
    breadcrumbActive: 'Активный проект:',                        // EN: "Active project:"
    searchPlaceholder: 'Поиск по библиотеке…',                   // EN: "Search the library…"
    treeFilterPlaceholder: 'Фильтр в дереве…',                   // EN: "Filter in the tree…"
    roBannerSequence:
      '🔒 Просмотр read-only. Для редактирования откройте в Container Window или создайте manual-edit ветку.',
      // EN: "Read-only view. To edit, open in Container Window or create a manual-edit branch."
    roBannerAnnotations:
      '🔒 Просмотр read-only. Edit аннотаций — в Container Window.',
      // EN: "Read-only view. Annotation editing happens in Container Window."

    // Per-zone action labels (spec §5.4). Consumed by lib/library-actions.js
    // when the action surface needs translation. K7 adds the namespace;
    // M-X.7c i18n pass swaps in actual STRINGS lookups for full EN/RU
    // toggle.
    actionsLoose: {
      // M-X.7c K1/K6 — renamed buttons per UI_REVISION_2026_05.
      // K9 dropped legacy keys: useInActiveContainer / useInActivePrimer
      // (replaced by addToActiveProject), open (button removed —
      // double-click is the single entry), manualEditBranch
      // (→ createCopyForEdit), moveFolder (→ moveToFolder).
      addToActiveProject: 'Добавить в активный проект',          // EN: "Add to active project"
      addToActiveProjectDisabled: 'Нет активного проекта',       // EN: "No active project"
      createCopyForEdit: 'Создать копию для правки',             // EN: "Create copy for edit"
      moveToFolder: 'Переместить в папку…',                      // EN: "Move to folder…"
      exportGenBank: 'Экспорт',                                  // EN: "Export"
      delete: 'Удалить',                                         // EN: "Delete"
      editPrimer: 'Редактировать',                               // EN: "Edit"
    },
    actionsActive: {
      containerWindow: 'Container Window',                       // EN: "Container Window"
      showInDag: 'Показать в DAG',                              // EN: "Show in DAG"
      extractToLoose: 'Извлечь в Loose',                        // EN: "Extract to Loose"
      saveAsVersion: 'Сохранить как версию',                    // EN: "Save as version"
      clone: 'Клонировать',                                      // EN: "Clone"
      exportGenBank: 'Экспорт GenBank',                         // EN: "Export GenBank"
      deleteFromProject: 'Удалить из проекта',                  // EN: "Delete from project"
      useInDag: 'Использовать в DAG',                           // EN: "Use in DAG"
    },
    actionsReadonly: {
      copyToActive: 'Скопировать в активный',                   // EN: "Copy to active"
      copyToLoose: 'Скопировать в Loose',                       // EN: "Copy to Loose"
      openAsActive: 'Открыть как активный',                     // EN: "Open as active"
      view: 'Просмотр',                                          // EN: "View"
    },
    actionsLab: {
      useInProject: 'Использовать в проекте',                   // EN: "Use in project"
      editNotes: 'Редактировать заметки',                       // EN: "Edit notes"
      toggleStockOff: 'Снять метку',                            // EN: "Remove freezer mark"
      toggleStockOn: 'Поставить метку',                         // EN: "Add freezer mark"
      delete: 'Удалить',                                         // EN: "Delete"
    },
    // M-X.7c K1/K5 — hover-revealed «+» icon on TreeItemRow
    // (DEC-UIRREV-QUICKADD-HOVER-01). Visible only when there is
    // an active project AND the entry is not already in it.
    treeRow: {
      quickAddTooltip: 'Добавить в активный проект',             // EN: "Add to active project"
      quickAddDoneToast: (entry, project) => `${entry} добавлен в ${project}`, // EN: "{entry} added to {project}"
      quickDeleteTooltip: 'Удалить в Корзину',                   // EN: "Move to Trash"
      quickDeleteDoneToast: (name) => `Удалено: ${name} (в Корзине)`, // EN: "Deleted: {name} (in Trash)"
    },
    // Trash zone strings (M-X.10 — корзина as a tree zone).
    // Soft-deleted entries and projects accumulate here until the
    // user purges or restores. Live behind STRINGS.libraryWorkspace.trash
    // so EN/RU swap stays single-source.
    trash: {
      title: 'КОРЗИНА',                                          // EN: "TRASH"
      sub: 'удалено, можно восстановить',                        // EN: "deleted, recoverable"
      emptyHint: 'Корзина пуста.',                               // EN: "Trash is empty."
      emptyAllLabel: 'Очистить',                                 // EN: "Empty"
      emptyAllTooltip: 'Удалить всё навсегда',                   // EN: "Permanently delete everything"
      restoreTooltip: 'Восстановить',                            // EN: "Restore"
      purgeTooltip: 'Удалить навсегда',                          // EN: "Delete permanently"
      entriesFolder: 'Контейнеры',                               // EN: "Containers"
      projectsFolder: 'Проекты',                                 // EN: "Projects"
      projectSubLabel: '.bodge проект',                          // EN: ".bodge project"
      emptiedToast: 'Корзина очищена',                           // EN: "Trash emptied"
      confirmEmptyAll: (n) => `Удалить ${n} элемент(а/ов) навсегда? Действие нельзя отменить.`, // EN: "Permanently delete {n} items? Cannot be undone."
      projectDeleteTooltip: 'Удалить проект в Корзину',          // EN: "Move project to Trash"
      projectDeleteToast: (name) => `Удалён проект: ${name} (в Корзине)`, // EN: "Deleted project: {name} (in Trash)"
    },
  },

  // M-X.8 K1 — PROJECT-HUB sprint. Sidebar «PINNED» section,
  // CommandPalette, Tree click-activate, MainPanel pin stars.
  // Per DEC-UIRREV-PINNED-EXPLICIT — `pinnedProjectIds` is an
  // explicit user choice (not MRU), capped at 15.
  projectHub: {
    sidebarPinnedHeader: 'В работе',                                // EN: "In work"
    sidebarPinnedCounter: (n, cap) => `${n}/${cap}`,                // EN: "n/cap"
    // sidebarOpenAll / sidebarOpenAllTooltip removed 15.06.2026 with the
    // «📂 Все проекты» sidebar item (redundant with ▦ Библиотека).
    pinTooltip: 'Закрепить',                                        // EN: "Pin"
    unpinTooltip: 'Открепить',                                      // EN: "Unpin"
    pinCapExceeded: (cap) => `Закрепить можно не больше ${cap} проектов`, // EN: "Cap reached"
    pinDoneToast: (name) => `${name} закреплён`,                    // EN: "{name} pinned"
    unpinDoneToast: (name) => `${name} откреплён`,                  // EN: "{name} unpinned"
    paletteTitle: 'Все проекты',                                    // EN: "All projects"
    paletteSearchPlaceholder: 'Найти проект…',                      // EN: "Find a project…"
    paletteGroupPinned: (n) => `ЗАКРЕПЛЕНО · ${n}`,                 // EN: "PINNED · n"
    paletteGroupOthers: (n) => `ОСТАЛЬНЫЕ · ${n}`,                  // EN: "OTHERS · n"
    paletteEmpty: 'Проектов пока нет',                              // EN: "No projects yet"
    paletteCreateNew: '+ Создать проект',                           // EN: "+ Create project"
    treeAllProjectsCollapsed: (n) => `Все проекты (${n})`,          // EN: "All projects (n)"
    treeCreateProject: '+ Проект',                                  // EN: "+ Project"
  },

  // M-CANVAS-SKELETON — DEV-only скелет всей Canvas-модели
  // (изолированный route `canvasSkeleton`, DEC-SKELETON-01..10).
  // Merge'нул prototypeCanvas (M-CANVAS-PROTOTYPE-PCR), который был
  // узким PCR-only прототипом. Снос скелета = удаление этого
  // namespace + папки components/CanvasSkeleton/.
  canvasSkeleton: {
    // Header
    backToCanvas: '← Назад',                                           // EN: "← Back"
    headerTitle: 'Canvas-скелет',                                      // EN: "Canvas skeleton"
    viewLayout: 'Layout',                                              // EN: "Layout"
    viewGraph: 'Graph',                                                // EN: "Graph"

    // Tree
    treeTitle: 'Библиотека (скелет)',                                  // EN: "Library (skeleton)"
    treeGoals: 'Итоги',                                                // EN: "Goals"
    treeMaterials: 'Материалы',                                        // EN: "Materials"
    treePrimers: 'Праймеры',                                           // EN: "Primers"
    treeGoalsEmpty: 'Пока нет circular продуктов',                     // EN: "No circular products yet"
    treeMaterialsEmpty: 'Пока нет linear материалов',                  // EN: "No linear materials yet"
    treePrimersEmpty: 'Пока нет праймеров',                            // EN: "No primers yet"

    // Canvas
    canvasEmpty: 'На canvas пока пусто',                               // EN: "Canvas is empty"

    // Editor
    editorTitle: 'Контейнер-редактор',                                 // EN: "Container editor"
    editorEmpty: 'Выберите контейнер из tabs выше',                    // EN: "Select a container from tabs above"
    pillViewOnly: 'View: {name}',                                      // EN: "View: {name}"
    toggleToLinear: '⇄ Линейный',                                      // EN: "⇄ Linear"
    toggleToPlasmidMap: '⇄ Plasmid map',                               // EN: "⇄ Plasmid map"

    // Editor window system (F1 M-CANVAS-WINDOW — DEC-CANVAS-WIN-*)
    editorWindow: {
      tabClose: 'Закрыть вкладку',                                     // EN: "Close tab"
      tabFrozenBadge: 'Контейнер заморожен (использован в операции)',  // EN: "Container frozen (used in an operation)"
      tabHotkeyHintNext: 'TAB — следующая вкладка',                    // EN: "TAB — next tab"
      tabHotkeyHintPrev: 'Shift+TAB — предыдущая вкладка',             // EN: "Shift+TAB — previous tab"
      miniCanvasTitle: 'Проект',                                       // EN: "Project"
      noContainersHint: 'Нет контейнеров',                            // EN: "No containers"
      placeholderTabLabel: '(пустой)',                                 // EN: "(empty)"
    },

    // Pieces (T1 M-CANVAS-FOUR-TIER — state.pieces slice, DEC-T1-*).
    // Placeholder namespace: error toasts + autoName/clone are wired
    // now; the real piece-authoring UI lands in T5.
    pieces: {
      errorTooMany: 'Превышен лимит {limit} кусков на проект',         // EN: "Piece limit {limit} per project exceeded"
      errorInvalidRange: 'Недопустимый диапазон для куска',            // EN: "Invalid range for piece"
      errorContainerNotFound: 'Источник для куска не найден',          // EN: "Piece source not found"
      errorTooManyRanges: 'Превышен лимит {limit} диапазонов на один кусок', // EN: "Range limit {limit} per piece exceeded"
      errorNameTooLong: 'Имя куска слишком длинное (макс {max})',      // EN: "Piece name too long (max {max})"
      errorInvalidMethod: 'Недопустимый метод получения куска',        // EN: "Invalid piece acquisition method"
      pieceClonedSuffix: ' (копия)',                                   // EN: " (copy)"
      autoNameTemplate: '{name}({start}-{end})',                       // EN: "{name}({start}-{end})"
      // T9 — design variants (§5.10).
      variantGroup: {
        badge: 'Вариант {n} из {total}',                               // EN: "Variant {n} of {total}"
        createVariantAction: 'Создать вариант',                        // EN: "Create variant"
        removeFromGroupAction: 'Убрать из группы вариантов',            // EN: "Remove from variant group"
      },
      // T5 — piece-authoring UI (DEC-T5-*).
      modal: {
        create: {
          title: 'Создать кусок',
          sourceLabel: 'Источник:',
          rangeLabel: 'Диапазон:',
          orientationLabel: 'Ориентация:',
          methodLabel: 'Способ:',
          nameLabel: 'Имя',
          functionalLabelLabel: 'Функциональная метка (опционально)',
          functionalLabelPlaceholder: 'напр. «промотор», «маркер Hyg»',
          acquisitionUndefinedHint: 'Метод получения: пока не определён',
          acquisitionPcrHint: 'Метод получения: ПЦР',
          cancel: 'Отмена',
          confirm: 'Создать',
        },
        primersPick: {
          title: 'Кусок из существующих праймеров',
          forwardLabel: 'Прямой праймер',
          reverseLabel: 'Обратный праймер',
          bindingPreview: 'Ампликон: {start}–{end} ({length} п.о.)',
          bindingHint: 'Выберите оба праймера для предпросмотра',
          emptyHint: 'Праймеров пока нет. Создайте через «новые праймеры».',
          nameLabel: 'Имя куска',
        },
      },
      contextMenu: {
        createFromSelection: 'Отметить как кусок (P)',
        createFromFeature: 'Кусок по этой фиче',
        createFromExistingPrimers: 'Кусок из существующих праймеров',
        createFromNewPrimers: 'Новые праймеры → Кусок',
      },
      originLabel: {
        selection: 'выделение',
        feature: 'по фиче',
        'existing-primers': 'существующие праймеры',
        'new-primers': 'новые праймеры',
        'legacy-migration': 'миграция',
      },
      hint: {
        primersReady: 'Праймеры готовы. Создать кусок?',
      },
    },

    // SPEC_EDITABLE_ASSEMBLY_S1 — editable assembled view (typing in the
    // собранный вид → new/extended pieces).
    editableAssembly: {
      groupDisbanded: 'Фрагмент был в группе реакций — группа расформирована, пере-соберите', // EN: "This fragment was in a reaction group — the group was disbanded, re-assemble"
      editDeferred: 'Правка внутри готового фрагмента пока недоступна (будет в спринте 2)', // EN: "Editing inside a sourced fragment is not available yet (sprint 2)"
      frozenBanner: '🔒 Сборка заморожена исполненной реакцией — правка последовательности недоступна', // EN: "Assembly frozen by an executed reaction — sequence editing disabled"
      orphanBanner: '⚠ У сборки есть фрагмент без источника — почините перед правкой', // EN: "Assembly has a source-less fragment — fix it before editing"
      newBlockName: 'Вставка', // EN: "Insert"
    },

    // Zones (T3 M-CANVAS-FOUR-TIER — state.zones slice, DEC-T3-*).
    // Placeholder namespace: error/info toasts wired now; the real
    // frame UI (render / drag / resize / merge) lands in T4.
    zones: {
      defaultName: 'Сборка {n}',                                       // EN: "Assembly {n}"
      openAssembly: 'Открыть сборку',                                  // EN: "Open assembly"
      emptyZoneHint: 'Зона пуста',                                     // EN: "Zone is empty"
      errorTooMany: 'Превышен лимит {limit} зон на проект',            // EN: "Zone limit {limit} per project exceeded"
      errorTooSmall: 'Размер зоны меньше минимума',                    // EN: "Zone smaller than the minimum"
      errorNameTooLong: 'Имя зоны слишком длинное',                    // EN: "Zone name too long"
      errorNotesTooLong: 'Заметка зоны слишком длинная',               // EN: "Zone notes too long"
      moveSuccess: '{node} → {zone}',                                  // EN: "{node} → {zone}"
      moveToLoose: '{node} стал бесхозным',                            // EN: "{node} is now loose"
      wrapLooseSuccess: 'Бесхозные узлы обёрнуты в зону «{name}»',      // EN: "Loose nodes wrapped into «{name}»"
      wrapLooseEmpty: 'Нет бесхозных узлов',                           // EN: "No loose nodes"
      mergeSuccess: 'Зоны объединены в «{name}»',                      // EN: "Zones merged into «{name}»"
      splitNotImplemented: 'Разделение зон будет реализовано позже',   // EN: "Zone split not implemented yet"
      removeWarning: 'Удаление зоны не удалит узлы — они станут бесхозными', // EN: "Removing a zone keeps its nodes (they become loose)"
      crossZoneWarning: 'Связь {junction} стала cross-zone',           // EN: "Junction {junction} is now cross-zone"
      // T4 — frame UI (context menu, header, cross-zone, collapse).
      contextMenu: {
        rename: 'Переименовать',                                       // EN: "Rename"
        openAssembly: 'Открыть сборку',                                // EN: "Open assembly"
        remove: 'Удалить зону',                                        // EN: "Delete zone"
        mergeWith: 'Объединить с...',                                  // EN: "Merge with..."
        collapse: 'Свернуть',                                          // EN: "Collapse"
        expand: 'Развернуть',                                          // EN: "Expand"
        editNotes: 'Заметки...',                                       // EN: "Notes..."
        wrapLoose: 'Обернуть бесхозные узлы',                          // EN: "Wrap loose nodes"
        fitToNodes: 'Подогнать под узлы',                              // EN: "Fit to nodes"
        // T4.5 — 3-lane auto-layout controls.
        laneAuto: 'Авто-раскладка',                                    // EN: "Auto-layout"
        laneManual: 'Ручная раскладка',                                // EN: "Manual layout"
        recomputeLayout: 'Перестроить раскладку',                      // EN: "Rebuild layout"
      },
      headerCounter: '{count} {nodes}',                                // EN: "{count} {nodes}"
      crossZoneTooltip: 'Связь между зонами «{a}» и «{b}»',            // EN: "Junction between zones «{a}» and «{b}»"
      collapsedHint: 'Зона свёрнута. Двойной клик для разворота.',     // EN: "Zone collapsed. Double-click to expand."
      confirmRemove: 'Удалить зону «{name}»? Узлы внутри станут бесхозными.', // EN: "Delete zone «{name}»? Its nodes become loose."
      moveSuccessToZone: '«{node}» перемещён в «{zone}»',              // EN: "«{node}» moved to «{zone}»"
      moveSuccessToLoose: '«{node}» стал бесхозным',                   // EN: "«{node}» is now loose"
      // T7 — inline sequence-mode (§5.12).
      sequenceMode: {
        toggleToGraph: 'Режим графа (G)',                              // EN: "Graph mode (G)"
        toggleToSequence: 'Режим последовательности (S)',              // EN: "Sequence mode (S)"
        emptyHint: 'Выбери диапазоны на источниках чтобы увидеть сборку', // EN: "Pick ranges on the sources to see the assembly"
        availableSources: 'Доступные источники',                       // EN: "Available sources"
        palette: 'Палитра кусков',                                     // EN: "Piece palette"
        dragHere: 'Перетащи кусок сюда, чтобы добавить в сборку',       // EN: "Drag a piece here to add it to the assembly"
        detachedHint: 'Свободные куски (не в сборке)',                  // EN: "Free pieces (not in the assembly)"
        junctionMethod: {
          'overlap-pcr': 'Overlap-PCR',
          ligation: 'Лигаза',                                          // EN: "Ligase"
          gibson: 'Gibson',
          'golden-gate': 'Golden Gate',
          kld: 'KLD',
        },
        junctionMethodShort: {
          'overlap-pcr': 'OV',
          ligation: 'L',
          gibson: 'G',
          'golden-gate': 'GG',
          kld: 'KLD',
        },
        finalSelector: 'Финал:',                                       // EN: "Final:"
        allBranches: 'Все варианты',                                   // EN: "All variants"
        nt: 'нт',                                                      // EN: "nt"
      },
      // T8 — cross-zone source link badge (§5.9).
      linkBadge: {
        label: '← {zone}',                                             // EN: "← {zone}"
        tooltip: 'Из зоны «{zone}»: {count} куск(ов)-источник(ов)',     // EN: "From zone «{zone}»: {count} source piece(s)"
      },
      highlighted: 'Выбрана из связи',                                 // EN: "Focused from a link"
      // T4.5 — 3-lane auto-layout: lane labels + pin affordance.
      lanes: {
        sources: 'ИСТОЧНИКИ',                                          // EN: "SOURCES"
        intermediate: 'ПРОМЕЖУТОЧНОЕ',                                 // EN: "INTERMEDIATE"
        finals: 'ФИНАЛЫ',                                              // EN: "FINALS"
      },
      pin: {
        pin: 'Закрепить',                                              // EN: "Pin"
        unpin: 'Открепить',                                            // EN: "Unpin"
        pinnedTooltip: 'Закреплено. Двойной клик чтобы открепить.',     // EN: "Pinned. Double-click to unpin."
      },
      // T9 — finals branching kinds (§5.7/§5.10, DEC-T9-11).
      branching: {
        clones: '{count} клонов',                                      // EN: "{count} clones"
        variants: '{count} вариантов',                                 // EN: "{count} variants"
        independent: '{count} финалов',                                // EN: "{count} finals"
      },
      // T10 — Sanger lab notebook (§5.11).
      sanger: {
        title: 'Sanger lab notebook',
        openButton: 'Открыть Sanger',                                  // EN: "Open Sanger"
        openIcon: '📋',
        pendingShort: 'в ожидании',                                    // EN: "pending"
        verifiedShort: 'подтверждено',                                 // EN: "verified"
        failedShort: 'не прошло',                                      // EN: "failed"
        filter: {
          all: 'Все',                                                  // EN: "All"
          pending: 'В ожидании',                                       // EN: "Pending"
          verified: 'Подтверждено',                                    // EN: "Verified"
          failed: 'Не прошло',                                         // EN: "Failed"
        },
        statusLabel: {
          pending: 'В ожидании Sanger',                                // EN: "Sanger pending"
          verified: 'Подтверждено Sanger',                             // EN: "Sanger verified"
          failed: 'Не прошло Sanger',                                  // EN: "Sanger failed"
          unplanned: 'Sanger не запланирован',                         // EN: "Sanger not planned"
        },
        notesPlaceholder: 'Заметки (например: «мутация в позиции 234», «плохой read»)...',
        empty: 'Нет materialized колоний в этой зоне',                 // EN: "No materialized colonies in this zone"
        zoneLabel: 'Зона: {name}',                                     // EN: "Zone: {name}"
        close: 'Закрыть',                                              // EN: "Close"
      },
    },

    // T9 — clone materialization modal (§5.10).
    materialize: {
      action: 'Materialize (отметить колонии)',                        // EN: "Materialize (mark colonies)"
      modalTitle: 'Materialize: {kind} → {output}',                    // EN: "Materialize: {kind} → {output}"
      cloneCountLabel: 'Число колоний (макс 96)',                       // EN: "Colony count (max 96)"
      cloneLabelTemplate: 'Колония {n}',                               // EN: "Colony {n}"
      confirmCount: 'Создать {count} клонов',                          // EN: "Create {count} clones"
      cancel: 'Отмена',                                                // EN: "Cancel"
    },

    // Operations
    opPCR: 'ПЦР',                                                       // EN: "PCR"
    opRestriction: 'Restriction',                                      // EN: "Restriction"
    opMutagenesis: 'Мутагенез',                                        // EN: "Mutagenesis"
    opGibson: 'Сборка',                                                // EN: "Gibson Assembly"

    // PCR popup
    pcrPopupTitle: 'ПЦР региона',                                      // EN: "PCR of region"
    pcrPopupNoSelection: 'Выделите регион в последовательности',       // EN: "Select a region in the sequence"
    pcrPopupNoPrimers: 'Не удалось рассчитать праймеры',                // EN: "Could not design primers"
    pcrPopupConfirm: 'Создать ампликон',                               // EN: "Create amplicon"

    // Restriction popup
    restrictionPopupTitle: 'Restriction Cut',                          // EN: "Restriction Cut"
    restrictionPopupHint: 'Выберите фермент. Mock: контейнер делится на 2 фрагмента.', // EN: "Pick enzyme. Mock: splits into 2."
    restrictionPopupEnzymeLabel: 'Фермент:',                           // EN: "Enzyme:"
    restrictionPopupPreview: 'Результат: 2 линейных фрагмента с {enzyme} overhang.', // EN: "Result: 2 linear fragments with {enzyme} overhang."
    restrictionPopupConfirm: 'Разрезать',                              // EN: "Cut"

    // Mutagenesis popup
    mutagenesisPopupTitle: 'Мутагенез',                                // EN: "Mutagenesis"
    mutagenesisPopupNoSelection: 'Выделите регион для замены',         // EN: "Select a region to replace"
    mutagenesisPopupMethodLabel: 'Метод:',                             // EN: "Method:"
    mutagenesisPopupReplacementLabel: 'Замена (новая последовательность):', // EN: "Replacement (new sequence):"
    mutagenesisPopupPreview: 'Регион {start}..{end} → «{repl}»',        // EN: "Region {start}..{end} → «{repl}»"
    mutagenesisPopupConfirm: 'Создать мутант',                         // EN: "Create mutant"

    // Gibson popup
    gibsonPopupTitle: 'Сборка (Gibson)',                                // EN: "Assembly (Gibson)"
    gibsonPopupTooFew: 'Требуется минимум 2 фрагмента в session',       // EN: "≥2 fragments required in session"
    gibsonPopupClassLabel: 'Тип реакции:',                              // EN: "Reaction class:"
    gibsonPopupOverlapHint: 'Overlap-регионы (последние 20 nt каждого):', // EN: "Overlap regions (last 20 nt of each):"
    gibsonPopupConfirm: 'Собрать',                                      // EN: "Assemble"

    // Shared popup
    popupCancel: 'Отмена',                                              // EN: "Cancel"

    // Entry into the project canvas (StartScreen Sidebar + Library top bar)
    openProjectLabel: 'Открыть проект',                                 // EN: "Open project"
    openProjectTip: 'Открыть канвас активного проекта',                 // EN: "Open the active project's canvas"
    // DEV entry (legacy keys — kept for back-compat fallbacks)
    devEntryLabel: '🧪 Canvas-скелет',                                  // EN: "🧪 Canvas skeleton" (DEV-only entry)
    devEntryTip: 'M-CANVAS-SKELETON: Tree + Canvas + Editor (DEV only)', // EN: "M-CANVAS-SKELETON: Tree + Canvas + Editor"
  },

  // M-X.7a v2 K7 — AppShell + NavRail tooltip strings.
  appShell: {
    navTooltipStartup: 'Стартовый — в разработке',               // EN: "Start screen — in development"
    navTooltipLibrary: 'Библиотека',                             // EN: "Library"
    navTooltipFlow: 'DAG / Project Flow',                        // EN: "DAG / Project Flow"
    navTooltipImporter: 'Importer (legacy)',                     // EN: "Importer (legacy)"
    navTooltipMix: 'Mix Workspace — в разработке',               // EN: "Mix Workspace — in development"
    navTooltipSettings: 'Настройки — в разработке',              // EN: "Settings — in development"
    navTooltipTheme: 'Тема — в разработке',                      // EN: "Theme — in development"
  },

  // SPEC_COMMON_FEATURES — promote-from-annotation + Library section.
  // English UI (⚓ DEC-MA2-01 / DEC-CF-11) — приёмка 01.06 отклонила RU-вариант.
  commonFeatures: {
    // Selection context-menu item (gated on a matched region feature).
    promoteMenuItem: 'Add to common features',
    // PromoteToCommonModal.
    modalTitle: 'Add to common features',
    fieldName: 'Name',
    fieldType: 'Type',
    fieldSequence: 'Sequence',
    proteinNote: 'CDS type: protein is translated from the region sequence',
    cancel: 'Cancel',
    confirm: 'Add',
    // Dedup verdicts.
    dupBlocked: (by) =>
      `Already in the common database (matched by ${by === 'protein' ? 'protein' : 'DNA'}).`,
    nameWarning: (name) =>
      `A feature named "${name}" already exists with a different sequence — add as a variant?`,
    added: (name) => `"${name}" added to common features`,
    // Library section (DEC-CF-06).
    sectionTitle: 'Common features',
    treeNodeLabel: 'Common features',
    searchPlaceholder: 'Search by name or type…',
    empty: 'No common features yet',
    selectHint: 'Select a feature to view its sequence',
    countLabel: (n) => `${n} features`,
    badgeFactory: 'factory',
    badgeUser: 'user',
    badgeOverridden: 'overridden',
    edit: 'Edit',
    save: 'Save',
    reset: 'Reset to factory',
    deleteUser: 'Delete',
    resetConfirm: 'Reset edits to the factory version?',
    deleteConfirm: 'Delete this user feature?',
    lengthLabel: (n) => `${n} bp`,
  },
};

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

  startScreen: {
    appName: 'BodgeGene',
    guide: 'Guide',
    settings: 'Settings',
    newProject: '+ New project',
    openBodge: '↑ Open .bodge…',
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
      polymeraseLabel: 'Default polymerase',
      polymeraseHint: 'Used by primer-design Tm + extension-time calculators. Phusion/Q5 += 3 °C, Taq −5 °C.',
      primerPrefixLabel: 'Primer name prefix',
      primerPrefixHint: 'Prepended to auto-generated oligo names (e.g. p_ → p_amp_F).',
      annotateOnImportLabel: 'Annotate on import',
      annotateOnImportHint: 'Default state of «Annotate now» in the import modal.',
      annotateOnImportToggle: 'Run predictors automatically',
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
  // LibraryTopBar, LibraryTreeRoot, LooseZone / ProjectZone /
  // LabPoolZone, AddModal, and the read-only banners in
  // SequenceTab + AnnotationsTab.
  libraryWorkspace: {
    zoneLooseTitle: 'Без проекта',                              // EN: "No project"
    zoneLooseSub: 'свободная зона',                             // EN: "free zone"
    zoneLabTitle: 'Лабораторный пул',                            // EN: "Lab pool"
    zoneLabSub: 'primer\'ы в морозильнике',                      // EN: "primers in the freezer"
    dagSubrow: 'DAG',                                            // EN: "DAG" (process graph)
    containersFolder: 'Контейнеры',                              // EN: "Containers"
    primersFolder: 'Праймеры',                                   // EN: "Primers"
    inLab: 'В лаборатории',                                      // EN: "In the lab"
    crossProject: 'Из чужих проектов',                           // EN: "From foreign projects"
    addBtn: '+ Добавить',                                        // EN: "+ Add"
    breadcrumbActive: 'Активный проект:',                        // EN: "Active project:"
    breadcrumbNoProject: 'Без активного проекта',                // EN: "No active project"
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
      useInActiveContainer: 'Использовать в активном',           // EN: "Use in active project"
      useInActivePrimer: 'Использовать в проекте',               // EN: "Use in project"
      open: 'Открыть',                                            // EN: "Open"
      manualEditBranch: 'Manual-edit ветка',                     // EN: "Manual-edit branch"
      moveFolder: 'Переместить',                                 // EN: "Move"
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
};

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
};

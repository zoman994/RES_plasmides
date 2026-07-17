/**
 * STRINGS.importer namespace.
 *
 * Bug-rush #17 (04.05.2026 evening): switched the surface to English
 * ahead of the planned language toggle. Russian strings preserved in
 * git history; the language switcher will rehydrate them once the
 * localisation infrastructure (provider + locale lookup) lands.
 *
 * Imported and merged into the global STRINGS dict by `lib/strings.js`.
 */
export const IMPORTER_STRINGS = {
  // M-X.7a v2 K2 — CatalogColumn STRINGS purged. The 28 catalog* +
  // dropzoneHover keys lived on the deleted LibraryTree.jsx +
  // LibraryGroupHeader/ItemRow/NestedSubGroup. New tree's strings
  // (zone titles, folder labels, +Add button, etc.) live under
  // STRINGS.libraryWorkspace and land in K7. K2 leaves the catalog
  // namespace empty so strings-coverage stays green.

  // Inspector / TabBar
  // M-X.6 K1 (DEC-MX6-04) — emptyInspectorHint1/2 +
  // emptyLibraryFirstTimeTitle/Body removed together with
  // EmptyInspector.jsx. Empty-state hint now lives in
  // OnboardingNudge inside the LibraryTree.
  untitledItem: '(untitled)',

  tabOverview: 'Overview',
  tabSequence: 'Sequence',
  // 12.05.2026 — Игорь: skeleton container editor получает
  // дополнительную вкладку «Мутагенез», дублирующую sequence viewer.
  // Используется только когда TabBar получает showMutagenesis={true}.
  tabMutagenesis: 'Мутагенез',
  tabAnnotations: 'Annotations',
  tabHistory: 'History',
  tabHistoryPlaceholder: 'History will appear after the first commit in Container Window (M-D).',
  tabHistoryEmptyM_D: 'No commits — they will appear after M-D Container Window.',

  // Bug-rush #23 (04.05.2026): selection counter in the title row.
  selectionCountBp: (n) => `${n.toLocaleString()} bp`,
  selectionCountAa: (n) => `${n.toLocaleString()} aa`,

  // SequenceView settings popover (Sprint M-B.3 K7).
  sequenceView: {
    settingsButton: 'Display settings',
    settingsTitle: 'SequenceView settings',
    showBottomStrandLabel: 'Bottom strand',
    showBottomStrandHint: 'Show the antisense strand below the main one',
    scrollOnFeatureClickLabel: 'Scroll to feature on click',
    scrollOnFeatureClickHint: 'Jump to the feature\'s start when biolog clicks its bar',
    framesModeLabel: 'AA frames',
    framesModeAuto: 'Auto (by coverage)',
    framesModeSingle: 'Dominant CDS only',
    framesModeAll: 'All six frames',
    autoThresholdLabel: (n) => `Auto threshold: ${(n * 100).toFixed(0)}%`,
    autoThresholdHint:
      'Dominant CDS coverage at which we switch to a single forward frame',
    visibleFramesLabel: 'Visible frames',
    visibleFramesHint:
      'Applies in "All frames" and "Auto" mode at low coverage',
    primerStyleLabel: 'Primers',
    primerStyleFilled: 'Filled',
    primerStyleOutline: 'Outline',
    reOrientationLabel: 'RE labels',
    reOrientationVertical: 'Vertical',
    reOrientationHorizontal: 'Horizontal',
    // Sprint M-X.1 K5 — Structural Predictor settings.
    predictionsLabel: 'Predictions',
    predictionsCds: 'CDS (ORF detection)',
    predictionsPromoter: 'Promoters (σ70 PWM)',
    predictionsTerminator: 'Terminators (stem-loop)',
    predictionsSgrna: 'Guide RNAs (sgRNA scaffold)',
    predictionsThresholdLabel: (n) => `Minimum confidence: ${(n * 100).toFixed(0)}%`,
    predictionsThresholdHint:
      'Predictions below the threshold are hidden. Raise it for stricter filtering.',
    resetButton: 'Reset to defaults',
    closeAria: 'Close settings',
  },

  // Sprint M-X.2 — annotation editing inside SequenceView.
  annotationEdit: {
    // CreateAnnotationPopup (selection + H, or context menu).
    createTitle: 'New annotation',
    createNamePlaceholder: 'Name (lacZα, AmpR, …)',
    createTypeLabel: 'Type',
    createStartLabel: 'Start',
    createEndLabel: 'End',
    createStrandLabel: 'Strand',
    createStrandForward: '→ forward',
    createStrandReverse: '← reverse',
    createCancel: 'Cancel',
    createOpenAnnotator: 'Find in Annotator',
    createSubmit: 'Create',
    createInvalidCoords: 'Check the coordinates — start < end, and both within the sequence.',
    // EditAnnotationModal (E key on selected region).
    editTitle: 'Edit annotation',
    editApply: 'OK',
    editCancel: 'Cancel',
    // Inline rename (double-click).
    renamePlaceholder: 'Name...',
    // Selection context menu — Sprint M-X.2 K9 entry point.
    contextMenuAnnotate: 'Annotate selection...',
    // Sprint M-X.3 follow-up — biolog: «выдлять последовательность
    // - а дальше уже эту последоватность дать возможность бластить».
    contextMenuBlast: 'BLAST this region',
    contextMenuCreateRegion: 'Create annotation (H)',
    contextMenuDeleteRegion: 'Delete annotation (Del)',
    contextMenuEditRegion: 'Edit annotation (E)',
  },

  // Sprint M-X.2 — Annotator fullscreen shell.
  annotator: {
    title: 'Annotator',
    backButton: '← Back',
    runButton: (n) => `Run (${n})`,
    runningSpinner: '…',
    saveButton: 'Save',
    saveCount: (n) => `Save (${n})`,
    // Sprint M-X.3 follow-up — explicit save-completed feedback.
    saveJustDone: 'Saved ✓',
    thresholdLabel: (n) => `Confidence threshold: ${(n * 100).toFixed(0)}%`,
    scopeFull: 'Whole sequence',
    scopeRegion: (start, end) => `Region ${start}..${end}`,
    pluginsHeader: 'Plugins',
    resultsHeader: 'Results',
    resultsEmpty: 'Run plugins — results will appear here.',
    resultPredicted: 'predicted',
    resultAccept: 'Accept',
    resultReject: 'Reject',
    resultEdit: 'Edit',
    resultAccepted: '✓ Accepted',
    resultRejected: '✗ Rejected',
    summaryAccepted: (n) => `Accepted: ${n}`,
    summaryRejected: (n) => `Rejected: ${n}`,
    summaryEdited: (n) => `Edited: ${n}`,
    summarySkipped: (n) => `Skipped as duplicates: ${n}`,
    pluginUnavailable: 'Unavailable',
    speedHintInstant: 'instant',
    speedHintFast: 'fast',
    speedHintSlow: 'slow',
    pluginBadgeMock: '(mock)',
    pluginNetworkBadge: '🌐',
    annotatorButtonLabel: '🔍 Annotator',
    annotatorButtonHint: 'Open the Annotator on the whole sequence',
    // Sprint M-X.3 K3 — dual-tab body labels (deprecated Stage B
    // 05.05.2026; kept for back-compat / dark-theme test). Stage C
    // tabLinear / tabCircular below replace the user-visible labels.
    tabTable: 'Table',
    tabPreview: 'Preview',
    tabTableHint: 'Plugin results — accept / reject / edit',
    tabPreviewHint: 'Sequence with predicted features as ghosts',
    // Sprint M-X.3 follow-up Stage C — map view sub-tab inside
    // PreviewTab.
    tabLinear: 'Linear',
    tabCircular: 'Circular',
    tabLinearHint: 'Linear sequence view with ghost features',
    tabCircularHint: 'Circular plasmid map with ghost features',
    previewEmpty: 'Run a plugin to see ghost features here.',
    previewDrillInHint: 'Click a ghost feature to inspect it.',
    // Sprint M-X.3 K4 — drill-in panel.
    ghostDrillInTitle: 'Predicted feature',
    ghostDrillInRange: (start, end) => `${start.toLocaleString()}..${end.toLocaleString()}`,
    ghostDrillInConfidence: (pct) => `Confidence: ${pct.toFixed(0)}%`,
    ghostDrillInSource: (s) => `Source: ${s}`,
    ghostDrillInAccept: '✓ Accept',
    ghostDrillInReject: '✗ Reject',
    ghostDrillInBlast: 'Run BLAST on this region',
    ghostDrillInPredictors: 'Re-run predictors',
    ghostDrillInClose: 'Close',
    ghostDrillInBlastHint: 'Гомология / BLAST по выбранному региону',
    // Sprint M-X.3 follow-up — progress bar for L1 auto-run + manual
    // pipeline runs. Biolog: «прогресс бар прикрутим чтобы человек
    // видел что оно грузится а не прсто зависло. аннотация требует
    // времени».
    progressRunning: (pluginName) => `Annotating: ${pluginName}…`,
    // Sprint M-X.3 follow-up — three-level annotation progression.
    // Biolog: «аннотация имеет три уровня - комон фичи, предиктор
    // ОРФ+предиктор промоторов терминаторов+ сложный анализ виде
    // бласта и тд». LevelPanel surfaces them as a stacked progression.
    levelPanelTitle: 'Annotation levels',
    level1Title: 'Level 1: Common features',
    level1Hint: 'Database lookup of known sequences (AmpR, ori, lacZ, …).',
    level2Title: 'Level 2: Predictors',
    level2Hint: 'ORF, σ70 promoter, terminator, sgRNA scaffold.',
    level3Title: 'Level 3: BLAST (NCBI)',
    level3Hint: 'Remote homology search — slow, network required.',
    levelRun: 'Run',
    levelRunAgain: 'Run again',
    levelRunning: 'Running…',
    levelHits: (n) => `${n} hit${n === 1 ? '' : 's'}`,
    levelEmpty: 'No hits.',
    // UX-007 — diagnostic body shown under the empty-state header so
    // biolog isn't left guessing "is the database loaded? threshold
    // wrong? actually no matches?" The previous bare "No hits." felt
    // like a silent failure for known plasmids.
    levelEmptyDiagnostic: (threshold) => `Совпадений ≥${Math.round((threshold ?? 0.96) * 100)}% identity не найдено в базе общих фич. Можно снизить порог или запустить L2 предикторы.`,
    levelEmptyLowerThreshold: 'Снизить порог до 90%',
    levelNotRunYet: 'Not run yet.',
    // Sprint M-X.3 follow-up — biolog: «добавь возможность одним
    // кликом согласиться со всеми комон фичами которые нашел на L1».
    levelAcceptAll: (n) => `Accept all (${n})`,
    levelAcceptAllHint: 'Accept every pending hit (already-rejected ones are kept rejected).',
    levelComingSoonLabel: 'Coming soon',
    levelComingSoonBody: 'BLAST against NCBI requires a backend proxy and is not yet wired up. The plugin slot is ready — drop a real run() into blast-ncbi-stub.js.',
    // Sprint M-X.3 follow-up — biolog: «На скрытие дубликата
    // поставь галку, вдруг кто то и захочет их видеть».
    showDuplicatesLabel: 'Show duplicates',
    showDuplicatesHint: 'Surface predicted regions even when they overlap an already-confirmed feature of the same type.',
  },

  // M-X.6 K1 (DEC-MX6-04) — SessionSummary block deleted with the
  // component. Session-level «added items» summary concept retired
  // along with the Importer fullscreen surface (DEC-IMP-06 ⚓).

  // Inspector overview / summary categories (K3).
  summaryWhatInFile: 'What is in this file',
  // UX-038 — was «SELECTION» which biolog read as "current text/seq
  // selection" (UI selection state). The actual content is the marker
  // gene set used as a selectable phenotype during cloning. Clearer
  // label removes that confusion.
  summarySelection: 'MARKERS',
  summarySelectionIcon: '🛡',
  summaryPromoters: 'PROMOTERS',
  summaryPromotersIcon: '📣',
  summaryOrigins: 'ORIGIN',
  summaryOriginsIcon: '⚓',
  summaryTags: 'TAGS',
  summaryTagsIcon: '🏷',
  summaryCdsList: (n) => `CDS (${n})`,
  summaryReSites: '🔬 RESTRICTION SITES',
  summaryWarnings: (n) => `${n} validation warnings`,

  // Inline title.
  inlineTitleAria: 'Plasmid name',

  // TagsEditor (M-B.2 follow-up after Library fullscreen wipe).
  addTagPlaceholder: '+ tag',
  tagsLimit: (n) => `maximum ${n} tags`,
  tagRemoveAria: (tag) => `Remove tag ${tag}`,

  // Region count helper
  summaryRegionCount: (n) => `${n} regions`,

  // ── Sprint M-X.3 follow-up — FeatureEditorModal (dblclick on a
  //    feature opens this instead of the Annotator). ────────────────
  featureEditorTitle: 'Edit feature',
  featureEditorLevelRegion: 'Feature',
  featureEditorLevelDetail: 'Sub-feature',
  featureEditorTabFeature: 'Feature',
  featureEditorTabSubfeatures: (n) => n > 0 ? `Subfeatures (${n})` : 'Subfeatures',
  featureEditorNameLabel: 'Name',
  featureEditorTypeLabel: 'Type',
  featureEditorCoordsLabel: 'Coordinates',
  featureEditorCoordsStart: 'Start',
  featureEditorCoordsEnd: 'End',
  featureEditorStrandLabel: 'Strand',
  featureEditorStrandFwd: '+ (forward)',
  featureEditorStrandRev: '− (reverse)',
  featureEditorSplit: 'Split',
  featureEditorSplitHint: 'Add a sub-feature inside this region (e.g. exon, intron, signal peptide). Both halves stay one parent feature.',
  featureEditorSubfeaturesLabel: 'Sub-features',
  featureEditorSubfeatureNamePlaceholder: 'Sub-feature name',
  featureEditorSubfeatureDelete: '✕',
  featureEditorNoSubfeatures: 'No sub-features yet — click Split to add one',
  featureEditorMergeLabel: 'Merge with neighbour',
  featureEditorMergeNone: 'No adjacent feature available',
  featureEditorMergePrev: (name) => `← ${name || 'previous'}`,
  featureEditorMergeNext: (name) => `${name || 'next'} →`,
  featureEditorMergeApply: 'Apply merge',
  featureEditorIntronsLabel: 'Introns',
  featureEditorSave: 'Save',
  featureEditorCancel: 'Cancel',
  featureEditorDelete: 'Delete feature',
};

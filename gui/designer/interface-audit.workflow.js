export const meta = {
  name: 'interface-audit',
  description: 'Deep visual-functional polish: every UI element wired+informative, every documented feature actually works',
  phases: [
    { title: 'Map' },
    { title: 'Audit' },
    { title: 'Verify' },
    { title: 'Synthesize' },
  ],
};

// ── Audit targets: reachable user-facing surfaces of the BodgeGene app ──
// Paths are relative to gui/designer/src. Agents Read/Grep the files and trace
// handlers across the codebase (store/skeleton-state*, context, selectors).
const ROOT = 'gui/designer/src/components/CanvasSkeleton';
const SURFACES = [
  { key: 'workspace-shell', title: 'Two-level assembly-tab workspace shell', files: [`${ROOT}/workspace/ProjectAssemblyWorkspace.jsx`, `${ROOT}/workspace/AssemblyTabStrip.jsx`, `${ROOT}/workspace/AssemblyViewTabStrip.jsx`] },
  { key: 'sequence-view', title: 'Assembly Sequence view (segments + junction ромб)', files: [`${ROOT}/editor/assembly-mode/AssemblyShellBody.jsx`, `${ROOT}/editor/assembly-mode/AssemblyHeader.jsx`, `${ROOT}/editor/assembly-mode/AssemblySegmentBar.jsx`] },
  { key: 'dag-view', title: 'Assembly DAG view + zoom', files: [`${ROOT}/workspace/AssemblyDagView.jsx`, `${ROOT}/canvas/ZoneGraphContent.jsx`] },
  { key: 'primers-panel', title: 'Праймеры panel', files: [`${ROOT}/editor/assembly-mode/AssemblyPrimersPanel.jsx`] },
  { key: 'pipeline-panel', title: 'Pipeline panel (automode)', files: [`${ROOT}/editor/assembly-mode/AssemblyPipelinePanel.jsx`] },
  { key: 'segment-detail', title: 'Segment detail panel', files: [`${ROOT}/editor/assembly-mode/SegmentDetailPanel.jsx`] },
  { key: 'circularize-modal', title: 'Circularize modal', files: [`${ROOT}/editor/assembly-mode/CircularizeModal.jsx`] },
  { key: 'mutation-modal', title: 'Mutation modal', files: [`${ROOT}/editor/assembly-mode/MutationModal.jsx`] },
  { key: 'opgroup-picker', title: 'OpGroupPicker (Сшить)', files: [`${ROOT}/editor/assembly-mode/OpGroupPicker.jsx`] },
  { key: 'rangepicker', title: 'RangePicker modal', files: [`${ROOT}/editor/assembly-mode/RangePickerModal.jsx`] },
  { key: 'junction-popover', title: 'Junction ромб popover/control', files: [`${ROOT}/canvas/JunctionPopover.jsx`, `${ROOT}/canvas/JunctionControl.jsx`] },
  { key: 'op-popups', title: 'Operation popups (cut/GG/pcr/ligate/kld) + OpPopup + OpKindPicker', files: [`${ROOT}/canvas/operations/OpPopup.jsx`, `${ROOT}/canvas/operations/CutOpPopup.jsx`, `${ROOT}/canvas/operations/GoldenGateOpPopup.jsx`, `${ROOT}/canvas/operations/OpKindPicker.jsx`] },
  { key: 'editor-shell', title: 'Container editor overlay (EditorWindowShell + ContainerEditorSkeleton + tabs)', files: [`${ROOT}/editor/EditorWindowShell.jsx`, `${ROOT}/editor/ContainerEditorSkeleton.jsx`] },
  { key: 'lineage-codon', title: 'LineagePanel + CodonStatsPanel + OpSuggestions', files: [`${ROOT}/LineagePanel.jsx`, `${ROOT}/CodonStatsPanel.jsx`, `${ROOT}/OpSuggestions.jsx`] },
  { key: 'header-clear', title: 'SkeletonHeader + Очистить canvas button', files: [`${ROOT}/SkeletonHeader.jsx`, `${ROOT}/index.jsx`] },
  { key: 'seqview-popups', title: 'SequenceView popups (annotation/piece/primer)', files: ['gui/designer/src/components/SequenceView/popups/CreateAnnotationPopup.jsx', 'gui/designer/src/components/SequenceView/popups/EditAnnotationModal.jsx', 'gui/designer/src/components/SequenceView/popups/PieceCreateModal.jsx', 'gui/designer/src/components/SequenceView/popups/PrimerFromSelectionModal.jsx'] },
  { key: 'library-workspace', title: 'Library workspace + tree + AddModal', files: ['gui/designer/src/components/Library/LibraryWorkspace.jsx', 'gui/designer/src/components/Library/AddModal/AddModal.jsx'] },
  { key: 'library-inspector', title: 'Library inspector tabs (overview/sequence/annotations/history)', files: ['gui/designer/src/components/Library/inspector/tabs/OverviewTab.jsx', 'gui/designer/src/components/Library/inspector/tabs/SequenceTab.jsx', 'gui/designer/src/components/Library/inspector/tabs/AnnotationsTab.jsx', 'gui/designer/src/components/Library/inspector/tabs/HistoryTab.jsx'] },
  { key: 'global-modals', title: 'SettingsModal + CommandPalette + HotkeyCheatsheet + ProjectInfoModal', files: ['gui/designer/src/components/SettingsModal.jsx', 'gui/designer/src/components/CommandPalette.jsx', 'gui/designer/src/components/HotkeyCheatsheet.jsx', 'gui/designer/src/components/ProjectInfoModal.jsx'] },
  { key: 'start-screen', title: 'StartScreen / QuickStart empty-canvas actions', files: ['gui/designer/src/components/StartScreen/HelpPopover.jsx', `${ROOT}/workspace/ProjectAssemblyWorkspace.jsx`] },
  { key: 'orphans', title: 'ORPHAN surfaces — imported/exist but possibly unreachable (dead)', files: [`${ROOT}/canvas/AssemblyDraftsPanel.jsx`, `${ROOT}/canvas/CanvasGraphView.jsx`, `${ROOT}/canvas/CanvasLayoutView.jsx`, `${ROOT}/ProtocolPanel.jsx`, `${ROOT}/PrimerOrderPanel.jsx`, `${ROOT}/RestrictionPanel.jsx`], orphanCheck: true },
];

// ── Documented features that MUST work end-to-end (from CLAUDE.md + skills) ──
const FEATURES = [
  { key: 'overlap-pcr', claim: 'Linear overlap-PCR assembly: add fragments → primers with homology tails → realise → product' },
  { key: 'gibson', claim: 'Circular Gibson assembly: circularize → closure primers → realise circular product' },
  { key: 'golden-gate', claim: 'Golden Gate: pick Type IIS enzyme → primers carry recognition+overhang → realise golden_gate op → protocol names the enzyme' },
  { key: 'kld-selfclose', claim: 'KLD single-fragment self-closure: pick 1 plasmid fragment → circularize → back-to-back primers → realise' },
  { key: 're-cloning', claim: 'RE-лигирование / Restriction cloning: pick RE enzyme → digest/ligate path → primers with RE site → realise + protocol' },
  { key: 'circularize-tool', claim: 'Circularization (M-CIRCULARIZE): the modal sets topology+method on a zone and it actually realises a closed ring' },
  { key: 'mutagenesis', claim: 'Point mutation via mutagenic primer: MutationModal → piece.mutations → primer binding carries the edit' },
  { key: 'order-oligos', claim: 'Order oligos / primer export reachable from the primers/actionbar flow' },
  { key: 'protocol-export', claim: 'Protocol export: executed ops → lab-notebook markdown with reagents/temps' },
  { key: 'bodge-persistence', claim: '.bodge save/load round-trips an assembly: topology, assemblyMethod, junctions, primers' },
  { key: 'complete-assembly', claim: 'completeAssembly / realise produces a product container reachable in the DAG' },
  { key: 'annotations', claim: '3-level annotation editing (region/detail/point) in the container editor, persisted to annotations[]' },
  { key: 'restriction-digest', claim: 'Restriction digest + double-digest (CutOpPopup): buffer/temp/Dam-Dcm warnings live, cut positions correct' },
  { key: 'import-dna', claim: 'Import .dna/.gb/.bodge → ImportDecisionModal → library, with the documented action menus' },
];

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['surface', 'findings'],
  properties: {
    surface: { type: 'string' },
    summary: { type: 'string', description: 'one-line health of this surface' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'type', 'severity', 'file', 'evidence', 'fix'],
        properties: {
          id: { type: 'string', description: 'short stable id e.g. surfacekey-1' },
          title: { type: 'string' },
          type: { type: 'string', enum: ['dead', 'broken', 'misleading', 'missing', 'orphan'] },
          severity: { type: 'string', enum: ['high', 'med', 'low'] },
          file: { type: 'string' },
          line: { type: 'string', description: 'line number or range, best effort' },
          evidence: { type: 'string', description: 'quote the code/handler proving it' },
          expected: { type: 'string', description: 'what the user/doc expects instead' },
          fix: { type: 'string', description: 'concrete, minimal fix proposal' },
        },
      },
    },
  },
};

const FEATURE_SCHEMA = {
  type: 'object',
  required: ['feature', 'works', 'findings'],
  properties: {
    feature: { type: 'string' },
    works: { type: 'string', enum: ['yes', 'partial', 'no'] },
    trace: { type: 'string', description: 'the UI→engine→output chain you verified (with file refs)' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'type', 'severity', 'file', 'evidence', 'fix'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          type: { type: 'string', enum: ['dead', 'broken', 'misleading', 'missing', 'orphan'] },
          severity: { type: 'string', enum: ['high', 'med', 'low'] },
          file: { type: 'string' },
          line: { type: 'string' },
          evidence: { type: 'string' },
          expected: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['id', 'real', 'reason', 'severity'],
  properties: {
    id: { type: 'string' },
    real: { type: 'boolean', description: 'true only if the defect genuinely reaches the user and is not wired through another path' },
    reason: { type: 'string', description: 'what you traced to confirm/refute (cite the wiring)' },
    severity: { type: 'string', enum: ['high', 'med', 'low'] },
    falsePositiveCause: { type: 'string', description: 'if refuted, why the audit was wrong (the wiring it missed)' },
  },
};

const RUBRIC = `You are auditing a BodgeGene (genetic-assembly constructor) UI surface for VISUAL-FUNCTIONAL polish.
For EVERY interactive element (button, input, select, checkbox, tab, clickable glyph, empty-state) determine:
  • DEAD — no handler, a no-op handler, permanently disabled, a TODO/placeholder, or renders nothing reachable.
  • BROKEN — wired but does not do what its label/role claims (dispatches the wrong action, swallows the result).
  • MISLEADING — label/empty-state/tooltip/badge claims something untrue or uninformative (a value never computed,
    a status that is always the same, copy that contradicts behaviour).
  • MISSING — a control the documented feature needs but that does not exist on this surface.
A canonical BAD example the owner cited: an old confirm-modal that always popped on "realise to DAG" and added no value.
RULES: Read the actual code AND trace each handler across the store (skeleton-state*, skeleton-context, selectors,
lib/*). Do NOT report styling/nitpicks. Report ONLY with evidence — quote the handler/line. Be conservative: if a
handler is passed from a parent via props/context, it is WIRED, not dead. Russian UI strings are expected (do not
flag language). Return STRICT schema; [] findings is a valid, good answer for a clean surface.`;

phase('Map');
const docFeatures = await agent(
  `Read gui/designer/CLAUDE.md, gui/designer/../CLAUDE.md (repo root D:/RESplasmide/CLAUDE.md), docs/ARCHITECTURE.md, and PROJECT_STATE.md. Extract a concise bullet list of CONCRETELY CLAIMED, user-facing features of the current app (assembly methods, canvas ops, editor capabilities, persistence, export). This list grounds the audit's "documented feature must work" check. Return as plain text bullets.`,
  { label: 'map:doc-features', phase: 'Map' },
);
log(`Mapped documented features (${(docFeatures || '').length} chars).`);

// ── Audit surfaces (element-level) → verify each finding ──
phase('Audit');
const surfaceResults = await pipeline(
  SURFACES,
  (s) => agent(
    `${RUBRIC}\n\nSURFACE: ${s.title}\nFILES: ${s.files.join(', ')}\n${s.orphanCheck ? 'SPECIAL: these may be ORPHANS — for each, grep the codebase to determine if it is actually mounted/rendered anywhere reachable by the user. If NOT reachable, that is an "orphan" finding (dead surface to remove or revive).\n' : ''}\nDOCUMENTED FEATURES (context):\n${docFeatures}\n\nAudit this surface per the rubric. Resolve the file paths under D:/RESplasmide/. Return the findings object.`,
    { label: `audit:${s.key}`, phase: 'Audit', schema: FINDINGS_SCHEMA },
  ),
  (res, s) => {
    const fs = (res && res.findings) || [];
    if (!fs.length) return [];
    return parallel(fs.map((f) => () => agent(
      `Adversarially VERIFY this audit finding on the BodgeGene codebase (D:/RESplasmide/). Try to REFUTE it: trace the actual wiring (handlers via props/context, store actions in skeleton-state*, selectors, finalizers). A finding is REAL only if the defect genuinely reaches the user. If the element is wired through a path the auditor missed, mark real=false and explain the missed wiring. Default to real=false when uncertain.\n\nFINDING (${s.key}):\n${JSON.stringify(f)}`,
      { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT_SCHEMA },
    ).then((v) => ({ ...f, surface: s.key, verdict: v })).catch(() => null)));
  },
);

// ── Audit documented features (end-to-end) → verify each finding ──
const featureResults = await pipeline(
  FEATURES,
  (ft) => agent(
    `${RUBRIC}\n\nDOCUMENTED FEATURE TO TRACE END-TO-END: ${ft.claim}\n\nVerify the FULL chain works in the CURRENT app (D:/RESplasmide/gui/designer/src): the UI entry point exists and is reachable → it dispatches the right store action → the engine (lib/*) produces the right result → the result is surfaced (DAG node / primer / product / protocol / file). Where the chain breaks, return a finding (type broken/dead/missing) with the exact file+evidence. Set works=yes/partial/no.`,
    { label: `feat:${ft.key}`, phase: 'Audit', schema: FEATURE_SCHEMA },
  ),
  (res, ft) => {
    const fs = (res && res.findings) || [];
    if (!fs.length) return [];
    return parallel(fs.map((f) => () => agent(
      `Adversarially VERIFY this documented-feature finding on D:/RESplasmide/. Try to REFUTE it by tracing the real wiring end-to-end. real=true only if the feature genuinely fails/misleads the user. Default real=false when uncertain.\n\nFEATURE: ${ft.claim}\nFINDING:\n${JSON.stringify(f)}`,
      { label: `vfeat:${f.id}`, phase: 'Verify', schema: VERDICT_SCHEMA },
    ).then((v) => ({ ...f, surface: `feature:${ft.key}`, works: res.works, verdict: v })).catch(() => null)));
  },
);

const allFindings = [...surfaceResults.flat(), ...featureResults.flat()].filter(Boolean);
const confirmed = allFindings.filter((f) => f.verdict && f.verdict.real);
const refuted = allFindings.filter((f) => f.verdict && !f.verdict.real);
log(`Findings: ${allFindings.length} raised, ${confirmed.length} confirmed, ${refuted.length} refuted.`);

// ── Synthesize a triage report ──
phase('Synthesize');
const report = await agent(
  `You are the lead reviewer. Below are ADVERSARIALLY-CONFIRMED interface findings for BodgeGene. Cluster + dedupe them into a crisp triage report for the owner. Group by theme. For each item give: title, type, severity, file:line, one-line why-it-matters, and the concrete fix. Separate clearly into:\n  (A) FIX NOW — dead/broken/misleading elements with a safe, scoped fix.\n  (B) MISSING — capabilities the docs imply but that don't exist: describe what's missing and a concrete add-plan (so the owner can decide).\n  (C) ORPHANS — unreachable surfaces to remove or revive.\nOrder each group by severity. Be concise and specific; no fluff.\n\nCONFIRMED FINDINGS:\n${JSON.stringify(confirmed, null, 1)}`,
  { label: 'synthesize', phase: 'Synthesize' },
);

return {
  counts: { raised: allFindings.length, confirmed: confirmed.length, refuted: refuted.length },
  confirmed,
  refuted: refuted.map((f) => ({ id: f.id, surface: f.surface, title: f.title, why: f.verdict.falsePositiveCause || f.verdict.reason })),
  report,
};

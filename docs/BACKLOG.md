# BodgeGene backlog

Only unfinished product/architecture work belongs here. Confirmed defects belong in [`BUGS.md`](../BUGS.md); immediate execution belongs in [`CURRENT_TASK.md`](../CURRENT_TASK.md). Completed work and sprint reports are intentionally absent.

## Now — pre-release stabilization

### Repository and documentation cleanup

Finish the active cleanup task: remove proven legacy surfaces, migrate local/audit artifacts, repair links, run full frontend/backend verification and rebuild a fresh local code graph if tooling is available.

### Assembly ranges and derived reactions

Recompute auto-reaction ranges when `piece.ranges` changes. A derived operation must not keep coordinates from an earlier piece shape. Add transition tests covering resize/edit after initial derivation.

### Sanger notebook safety

Close clone-to-focus gaps and replace save-on-blur-only behavior where focus changes can lose data. Persist explicit, testable draft/commit state and keep expected design separate from observed reads.

### Revision and annotation history

Complete sequence/annotation history through the current project/library revision model. Define one user-visible history path and migration behavior before adding more revision UI.

### Modal event isolation

Audit and fix event propagation/focus ownership in `PiecePrimersPickModal` and `PieceCreateModal`. Escape, Enter and click-outside must affect only the active transient surface.

### Search completion

- make `name:`, `feature:` and resolved `in:` executable before offering them;
- support short-query insertion/deletion alignment instead of substitution-only exhaustive matching;
- implement or remove `headVersionsOnly`;
- index description/organism consistently;
- keep provider failure/incomplete and strict final AND contracts unchanged.

### Restriction-primer protective bases

Replace the fixed/asymmetric `GCGC` policy with an enzyme-aware, symmetric and validated protective-base policy. Preserve separate Type IIS/classical restriction semantics and add end-to-end primer/export tests.

## Next — connected capabilities

### T9 design/materialization UI

`CREATE_DESIGN_VARIANT` and `MATERIALIZE_REACTION` have reducer/test foundations but no current production dispatch. Re-design the UI against the present store contract; do not resurrect incompatible legacy wizards.

### Transcript and isoform model

Introduce explicit transcript identity for alternative intron/exon sets, non-table-1 translation and compound/origin-crossing CDS. Protein search and translation must consume selected transcript variants rather than a union of introns.

### Annotation UX convergence

- show `detail`/`point` and segmented exon structure on overview maps;
- make incomplete/reference-derived annotations visually honest and expose source, identity and coverage;
- add fast select -> name -> Enter annotation creation for the common case;
- surface protein effect for CDS edits;
- converge tooltip and edit affordances across Library, Sequence and Canvas.

### Assembly workbench convergence

Unify piece acquisition, junction configuration, primer-tail derivation and live graph projection around the current four-tier model and [`ASSEMBLY_WORKBENCH.md`](specs/ASSEMBLY_WORKBENCH.md). Finish PrimerPool reuse without reviving legacy wizards.

### `.bodge` v2 completion

Complete the normative core, migrations, notebook content, provenance and implementation plan under `docs/specs/`. Keep strict validation and explicit downgrade/loss reporting.

### Alignment/Sanger trust

Resume the blocked alignment reliability specification only after current repository/schema gates are stable. Require quality evidence and corpus-based acceptance, not presentation-only confidence.

## Maintenance after format checkpoint

### Oversized module boundaries

Do not split stable files merely to satisfy a byte counter. Before the next feature change in these areas, characterize behavior and extract along live ownership boundaries: `SequenceView/index.jsx` (71.1 KiB), `AssemblyShellBody.jsx` (57.9 KiB), `RangePickerModal.jsx` (56.4 KiB), `PlasmidMiniMap.jsx` (42.8 KiB), `ContainerEditorSkeleton.jsx` (41.2 KiB) and `store/librarySlice.js` (49.2 KiB). Generated/data dictionaries are exempt. Prioritize a split only when the file is in scope and change coupling is demonstrated.

### Legacy `project.dag` state

Remove the remaining low-priority store orphan after `.bodge` compatibility/migration no longer depends on it.

### Legacy annotation IDs

New write paths already provide IDs. Add a narrow migration for historical detail/point annotations that still lack them; avoid a broad importer rewrite.

### Performance baselines

Maintain reproducible benchmarks on the reference 2-core/8-GB machine: UI cancellation p95, metadata preview, exact DNA search, project open and memory for a 10-Mb library.

### Feature database build pipeline

Move the curated cross-name/AmpR dedup rules from `scripts/dedup_common_features.py` into the tested SnapGene feature builder, then delete the separate postprocessor. Until then, its local snapshots belong only in ignored `scripts/.backups/`.

### Library metadata editing

Expose tags and topology in the current `LibraryWorkspace` with direct, tested persistence to the library entry. Do not restore the retired importer workspace merely to recover its old metadata column.

## Active specifications

| Area | Documents |
|---|---|
| Portable format | [`SPEC_BODGE_FORMAT_V2_CORE.md`](specs/SPEC_BODGE_FORMAT_V2_CORE.md), [`BODGE_V2_IMPLEMENTATION_PLAN.md`](specs/BODGE_V2_IMPLEMENTATION_PLAN.md), [`SPEC_REPRODUCIBLE_RECIPE.md`](specs/SPEC_REPRODUCIBLE_RECIPE.md) |
| Assembly convergence | [`ASSEMBLY_WORKBENCH.md`](specs/ASSEMBLY_WORKBENCH.md) |
| Alignment trust | [`SPEC_ALIGNMENT_RELIABILITY_AND_SANGER_VERIFICATION.md`](specs/SPEC_ALIGNMENT_RELIABILITY_AND_SANGER_VERIFICATION.md) |

A task becomes active only when copied into `CURRENT_TASK.md` with scope, acceptance criteria and verification.

## Ideas, not commitments

- optional versioned local models for ranking annotation, primer and design candidates;
- plugin boundary for external databases and alternative compute backends;
- publication pack and reproducible construction passport;
- collaboration/sync that preserves local-first operation.
- typed biological parts: a declarative class registry validates annotations and enables a two-click, strand-aware replacement of promoters, CDS, tags and other compatible features;
- an independent "Autolab" batch mode: generate validated combinatorial construct variants, primers, protocols and optional robot worklists without overloading the interactive assembly DAG.

These ideas stay subordinate to correctness, reproducibility and the reference-hardware budget.

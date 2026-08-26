# BodgeGene changelog

This file records product-level milestones, not individual fixes or sprint reports. Git remains the detailed history.

## Unreleased

## 0.8.8-alpha — August 2026

- Added a canonical project primer pool with live sequence reuse and PCR-driven selection.
- Added indel, substitution and amino-acid mutagenesis with physically complete oligos and KLD circularization.
- Fixed primer save/reopen so persisted 5′ tails survive reload.
- Bundled a local SnapGene catalog of 2822 plasmids for search and library import.
- Extended `.bodge` full-project ingestion, donor-container import and v2 topology normalization.
- Rebuilt library search around explicit entity scopes, provider intent and field filters.
- Added visual search modes, filter chips, keyboard/IME-safe combobox behavior and separate tree/global query state.
- Added strict DNA/protein/restriction confirmation with exact and approximate DNA routes, worker cancellation and honest incomplete-provider states.
- Completed repository/documentation cleanup: removed proven legacy closures, stale generated/personal artifacts and parallel historical trackers; retained active migrations, scientific algorithms, runtime catalogs and fixtures.
- Made the Windows launcher reproducible with one FastAPI process and an explicit Python GUI dependency extra.

## 0.8.7-alpha — July 2026

- Expanded `.bodge` project/format work and notebook infrastructure.
- Integrated smart library search across molecules, projects, primers and biological providers.
- Strengthened worker protocol validation, result identity and accessibility contracts.
- Continued assembly, primer-pool, restriction and alignment integration.

## 0.8.4-alpha — May–June 2026

- Added partial common-feature detection and orientation/translation fixes.
- Consolidated the four-tier assembly/canvas model.
- Added common-feature management, sequence editing/version flows and alignment workspace work.
- Removed the old v0.5 workbench surfaces that had been superseded.

## 0.8.3-alpha — May 2026

- Implemented four-tier assembly state: pieces, zones/junctions, operations and outputs.
- Migrated canvas rendering and authoring to the new model.
- Added primer redesign, Sanger notebook foundations and project/canvas UX improvements.

## 0.8.0–0.8.2 — May 2026

- Made Library the primary workspace and introduced project-aware navigation.
- Added project hub, sequence search and canvas architecture cleanup.
- Improved annotation editing, sequence-view interaction and wrap-aware primer rendering.

## 0.6.0–0.7.x — April–May 2026

- Reworked the application shell, start screen, importer and catalog/library tree.
- Introduced persistent local projects, soft delete, theme/i18n preparation and reusable folders.
- Consolidated auto-annotation behavior and dark/light visual contracts.

## 0.3.0–0.5.x — April 2026

- Established sanitize-at-entry annotation contracts and restriction-cloning workflows.
- Added mutagenesis, unified sequence/map editing and fragment editor decomposition.
- Introduced construct revisions, variants and the PlasmidVCS data model.

## 0.1.0–0.2.x — March 2026

- Initial Python CLI, construct/part/strain model, import/export and semantic diff.
- First React visual workbench, SnapGene catalog and core plasmid visualization.

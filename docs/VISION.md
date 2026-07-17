# BodgeGene vision

## Purpose

BodgeGene is a local-first workbench for molecular biologists who need to understand, modify, assemble and document plasmids without losing the relationship between sequence, biological intent and experimental history.

The product should answer four practical questions:

1. What is this construct and which sequence is authoritative?
2. What changed, why, and which downstream objects depend on it?
3. Can the planned molecular operation be performed as described?
4. Can another person reproduce the design from the saved project?

## Product principles

- **Biology before convenience.** The UI may simplify presentation, never silently weaken sequence, topology, reading-frame or assembly checks.
- **Local-first.** Core editing, validation and project files work without an account, internet connection or GPU.
- **Honest uncertainty.** A failed or unavailable algorithm is “not checked”, not “absent”. Preliminary results are visibly distinct from confirmed results.
- **One connected object model.** Molecules, annotations, primers, assemblies, projects and revisions are linked objects, not unrelated files.
- **Interoperability.** GenBank, FASTA and SnapGene import/export remain first-class; `.bodge` is the reproducible project container.
- **Weak computers are supported deliberately.** The reference machine is 2 cores / 4 threads, 8 GB RAM and integrated graphics. Heavy work is cancelable and kept off the UI thread.
- **Expert speed without hidden state.** Common actions should be direct, while destructive or biologically consequential choices remain explicit.

## Product boundary

BodgeGene is not intended to replace laboratory execution, regulatory review or validated clinical software. Algorithmic suggestions and small local models may rank, explain or propose; deterministic checks and source evidence remain available, and the user makes the biological decision.

Cloud collaboration, remote databases and neural assistants are optional extensions. No essential project operation may depend exclusively on them.

## Strategic direction

### Near term

- stabilize the library, search, sequence editor, annotations and primer pool;
- finish a coherent assembly workbench and trustworthy operation validation;
- make `.bodge` v2 a reproducible, inspectable project format;
- reduce legacy surfaces and keep the application responsive on the reference machine;
- publish user and technical guidance that matches the running application.

### Medium term

- richer construct provenance and publication-ready experiment packages;
- robust alignment/Sanger verification with explicit quality evidence;
- transcript/isoform-aware protein and intron reasoning;
- optional, versioned local models for ranking annotations, primers and design alternatives;
- plugin boundaries for databases and compute backends without duplicating biological rules.

### Long term

BodgeGene should become an open, reproducible bridge between plasmid design and the laboratory record: a project should preserve not only a final sequence, but also the design alternatives, checks, primers, operations and evidence needed to understand how that sequence was produced.

## Roadmap ownership

This file states direction, not implementation status. Current work belongs in [BACKLOG.md](BACKLOG.md), active specifications in `docs/specs/`, and the immediate task in [`CURRENT_TASK.md`](../CURRENT_TASK.md).

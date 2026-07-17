# BodgeGene (PlasmidVCS)

BodgeGene is a local-first application for creating, editing, searching and documenting plasmids and genetic assemblies. The primary product is the React application in `gui/designer`; the Python `plasmidvcs` package remains a secondary CLI and parsing backend.

**Current application version:** `0.8.7-alpha`
**Status:** active alpha; suitable for development and internal evaluation, not yet a production release.

## Main capabilities

- plasmid library with projects, versions, primers and annotations;
- circular map and sequence editing;
- assembly workspace with junctions and primer design;
- DNA, protein, restriction-site and metadata search;
- GenBank, FASTA, SnapGene `.dna` and BodgeGene `.bodge` workflows;
- local IndexedDB persistence and portable `.bodge` project files;
- optional Python CLI for construct history and format operations.

Biological decisions are intentionally fail-closed: an unavailable sequence/provider check must be shown as incomplete, not as proof that a feature is absent.

## Run the application

Requirements: Node.js, npm and Python 3.11+ available as `py` on Windows.

From the repository root, install the local Python package with the GUI helper
dependencies before installing the frontend dependencies:

```powershell
py -m pip install -e ".[gui]"
cd gui/designer
npm install
npm run dev
```

На Windows можно использовать `gui\run_designer.bat`; `--check` проверяет Python,
npm и импорты локального FastAPI helper без запуска серверов.

This starts Vite and the local FastAPI helper. The core application remains usable without a remote cloud service.

Useful commands:

```powershell
cd gui/designer
npm test
npm run build
npm run lint
```

## Python CLI

The CLI is versioned independently in `pyproject.toml` and is not the primary GUI release number.

```powershell
py -m pip install -e .
pvcs --help
pytest
```

## Repository map

- `gui/designer/` — React 19 application, tests and browser-side biological logic.
- `gui/api/` — small local FastAPI helper, mainly for file parsing.
- `src/pvcs/` — Python CLI and reusable backend modules.
- `tests/` — Python tests.
- `docs/` — current architecture, design, guides and active specifications.
- `.agents/skills/` — project-specific agent contracts.

Start project work by reading [AGENTS.md](AGENTS.md), [CURRENT_TASK.md](CURRENT_TASK.md) and [PROJECT_STATE.md](PROJECT_STATE.md). Historical sprint journals are intentionally not part of the startup context.

## Data and privacy

BodgeGene is local-first. Project data is stored in the browser and/or in files selected by the user. Do not commit personal laboratory data, local databases, generated catalogs or tool caches.

## License and author

MIT. Igor Sinelnikov, Laboratory of Expression Systems Development, FRC Biotechnology RAS.

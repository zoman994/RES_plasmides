# CLAUDE.md — PlasmidVCS

## What is this project

PlasmidVCS (`pvcs`) — version control system for genetic constructs (plasmids). Like git, but for DNA: semantic diffs, variant branching, strain lineage tracking. Written in Python, CLI-first.

Full architecture spec: `docs/architecture.md`

## Repository structure

```
plasmidvcs/
├── CLAUDE.md                  ← you are here
├── README.md                  ← user-facing docs
├── pyproject.toml             ← package config (modern Python, no setup.py)
├── LICENSE                    ← MIT
│
├── src/pvcs/                  ← main package
│   ├── __init__.py            ← version string
│   ├── cli.py                 ← Click CLI entry point (pvcs command)
│   ├── config.py              ← project config (.pvcs/config.json)
│   ├── database.py            ← SQLite schema, migrations, queries
│   ├── models.py              ← dataclasses: Construct, Revision, Feature, Part, Strain, Change, Assembly...
│   ├── parser.py              ← GenBank/FASTA parsing via BioPython
│   ├── diff.py                ← ★ CORE: semantic diff engine (3 layers)
│   ├── assembly.py            ← ★ Assembly engine: operations, overlaps, reassembly, templates
│   ├── primers.py             ← Primer registry: CRUD, Tm calc, reuse detection
│   ├── overlap.py             ← Overlap designer: split points → overlap zones → primers
│   ├── revision.py            ← commit, log, tree, variant operations
│   ├── parts.py               ← part library management
│   ├── strains.py             ← strain registry (YAML read/write)
│   ├── search.py              ← full-text + feature + RE site search
│   ├── export.py              ← HTML report, GenBank, YAML export
│   └── utils.py               ← checksum, circular sequence handling, Tm calc, helpers
│
├── tests/
│   ├── conftest.py            ← shared fixtures (temp project dirs, sample .gb files)
│   ├── fixtures/              ← real and synthetic GenBank files for testing
│   │   ├── pUC19.gb           ← classic reference plasmid
│   │   ├── simple_v1.gb       ← synthetic test construct v1
│   │   ├── simple_v2.gb       ← same construct with point mutation
│   │   ├── simple_v3.gb       ← same construct with inserted cassette
│   │   ├── assembly_3frag.gb  ← construct assembled from 3 fragments (overlap PCR)
│   │   └── README.md          ← describes each fixture
│   ├── test_parser.py
│   ├── test_diff.py           ← ★ most critical test file
│   ├── test_assembly.py       ← assembly operations, fragment provenance
│   ├── test_overlap.py        ← overlap designer, Tm calculations
│   ├── test_primers.py        ← primer registry, reuse detection
│   ├── test_revision.py
│   ├── test_cli.py
│   ├── test_database.py
│   ├── test_parts.py
│   ├── test_strains.py
│   └── test_search.py
│
└── docs/
    ├── architecture.md        ← full architecture doc (data model, diff engine, storage)
    └── examples/              ← usage examples, screenshots
```

## Tech stack

| Component | Library | Version |
|-----------|---------|---------|
| Language | Python | 3.11+ |
| Sequence parsing | BioPython | ≥1.83 |
| CLI | Click | ≥8.1 |
| Terminal output | Rich | ≥13.0 |
| YAML | PyYAML | ≥6.0 |
| Database | SQLite3 | stdlib |
| Alignment | parasail | ≥1.3 (optional, fallback to BioPython pairwise2) |
| Testing | pytest | ≥8.0 |
| Packaging | pyproject.toml | PEP 621 |

## Key design decisions

1. **GenBank (.gb) is the canonical format.** All sequences stored as .gb files. Parse with `Bio.SeqIO.read(file, "genbank")`. Features, qualifiers, and metadata all come from GenBank annotations.

2. **SQLite for metadata, filesystem for sequences.** Don't store sequences in the database. Store them as .gb files in `.pvcs/objects/` (content-addressed by SHA-256). SQLite stores construct/revision/part/strain metadata and relationships.

3. **Semantic diff is the core innovation.** File `src/pvcs/diff.py` is the most important file. Three layers:
   - Layer 1: sequence alignment (Needleman-Wunsch or banded)
   - Layer 2: map raw changes to overlapping features
   - Layer 3: classify biologically (point mutation → amino acid change, feature replacement, etc.)

4. **Circular sequence handling.** Plasmids are circular. Two identical plasmids may have different origins (linearization points). Before diffing, linearize both at the same anchor feature (typically ori or the first CDS). See `src/pvcs/utils.py`.

5. **Immutable revisions.** Once committed, a revision never changes. New changes = new revision. Like git commits.

6. **Strains are YAML files.** Not in SQLite. They are human-readable, version-controllable (by git), and editable by hand. Stored in `strains/` directory of the project.

## CLI command structure

```
pvcs init <name>                              # create project
pvcs import <file.gb> --name X --message M    # import GenBank as new construct
pvcs commit <file.gb> --version V --message M # commit new revision
pvcs variant <construct> --name N --from V    # create variant (branch)
pvcs diff <construct:v1> <construct:v2>       # semantic diff ★
pvcs log <construct>                          # revision history
pvcs tree <construct>                         # variant tree
pvcs tag <construct:version> <milestone>      # tag revision
pvcs part add <file.gb> --type T --name N     # add to part library
pvcs strain add <id> --parent P --construct C # register strain
pvcs strain tree <id>                         # strain lineage
pvcs search <query>                           # search features, RE sites
pvcs export <construct> --format html|gb|yaml # export

# Assembly commands
pvcs overlap design <file.gb> --split 850,1750  # overlap calculator
pvcs reassemble <construct:v> --swap-fragment N --new-source <file.gb>  # quick reassembly
pvcs primer list | show | find                  # primer registry
pvcs primer check-reuse <construct:v>           # reuse detection
pvcs template create | use | list               # assembly templates
pvcs assembly status                            # pipeline kanban
pvcs assembly set <construct> --status S        # update status
```

Entry point: `src/pvcs/cli.py` using Click groups. Main group = `pvcs`, subcommands attached via `@pvcs.command()`.

## Data model (dataclasses in models.py)

```python
@dataclass
class Construct:
    id: str              # UUID
    name: str            # "P43_Cas_Uni_Tr"
    topology: str        # "circular" | "linear"
    project_id: str
    parent_id: str | None  # for variants
    tags: list[str]

@dataclass
class Revision:
    id: str              # UUID
    construct_id: str
    version: str         # "1.0", "1.1", "2.0"
    sequence: str        # full nucleotide sequence
    features: list[Feature]
    length: int
    message: str         # commit message
    author: str
    parent_revision_id: str | None
    checksum: str        # SHA-256 of sequence

@dataclass
class Feature:
    type: str            # "CDS", "promoter", "terminator", etc.
    name: str            # "Cas9", "PglaA"
    start: int           # 1-based
    end: int
    strand: int          # 1 or -1
    qualifiers: dict
    sequence: str
    part_id: str | None  # link to Part library

@dataclass
class Change:
    type: str            # "point_mutation", "insertion", "deletion",
                         # "replacement", "feature_added", "feature_removed"
    position_a: int
    position_b: int
    length_a: int
    length_b: int
    affected_feature: str | None  # "CDS:Cas9"
    description: str     # "Q158R in XynTL (CAG→CGG)"
    sequence_a: str
    sequence_b: str

@dataclass
class Part:
    id: str
    name: str            # "PglaA"
    type: str            # "promoter"
    sequence: str
    organism: str

@dataclass
class Strain:
    id: str              # "AN-004"
    name: str            # full name
    parent_id: str | None
    construct_id: str | None
    revision_id: str | None
    genotype: dict
    verified: bool
    storage_location: str

@dataclass
class AssemblyOperation:
    id: str
    revision_id: str         # the revision this produced
    method: str              # "overlap_pcr","gibson","golden_gate","restriction_ligation",
                             # "crispr_hdr","site_directed_mutagenesis","synthesis","other"
    fragments: list[Fragment]
    primer_ids: list[str]
    status: str              # "design","primers_ordered","pcr","assembly","transform","screen","verified"
    notes: str

@dataclass
class Fragment:
    id: str
    order: int               # position in assembly (1, 2, 3...)
    name: str                # "PglaA", "XynTL_Q158R"
    source_type: str         # "construct","part","synthesis","pcr_product","oligo"
    source_construct_id: str | None
    source_part_id: str | None
    source_description: str | None  # "Vazyme order 2026-03-15"
    start: int               # position in final construct
    end: int
    overlap_left: dict | None   # {sequence, length, tm, gc_percent}
    overlap_right: dict | None

@dataclass
class Primer:
    id: str
    name: str                # "fwd_PglaA_OL"
    sequence: str            # full primer incl. tail
    binding_sequence: str    # 3' binding portion
    tail_sequence: str       # 5' tail (overlap / RE site)
    tail_purpose: str        # "overlap with XynTL"
    tm_binding: float
    tm_full: float
    gc_percent: float
    direction: str           # "forward" | "reverse"
    used_in: list[dict]      # [{revision_id, operation_id, role}]

@dataclass
class AssemblyTemplate:
    id: str
    name: str                # "glaA expression cassette"
    method: str
    slots: list[dict]        # [{position, name, type_constraint, fixed, default_part_id}]
    overlap_length: int
```

## SQLite schema (database.py)

Tables: `projects`, `constructs`, `revisions`, `parts`, `milestones`, `assembly_operations`, `primers`, `primer_usage`, `assembly_templates`. No `strains` table — strains are YAML files.

Revisions store `features` as JSON text column. Sequences stored in `sequence` text column AND as separate .gb files in `.pvcs/objects/`.

## Semantic diff algorithm (diff.py)

This is the hardest and most important part. Pseudocode:

```
def semantic_diff(rev_a: Revision, rev_b: Revision) -> list[Change]:
    # Layer 1: sequence alignment
    seq_a = linearize(rev_a.sequence, anchor="ori")
    seq_b = linearize(rev_b.sequence, anchor="ori")
    raw_changes = align_and_extract_changes(seq_a, seq_b)
    
    # Layer 2: feature mapping
    for change in raw_changes:
        change.affected_feature = find_overlapping_feature(
            change.position, rev_a.features, rev_b.features
        )
    
    # Layer 3: biological classification
    classified = []
    for change in raw_changes:
        if change.length_a == 1 and change.length_b == 1:
            if change.affected_feature and "CDS" in change.affected_feature.type:
                # translate codon, report amino acid change
                aa_change = get_aa_change(change, feature)
                change.description = f"{aa_change} in {feature.name}"
                change.type = "point_mutation"
            else:
                change.type = "point_mutation"
                change.description = f"{change.sequence_a}→{change.sequence_b} at pos {change.position_a}"
        elif is_whole_feature_replaced(change, rev_a, rev_b):
            change.type = "replacement"
        elif change.length_a == 0:
            change.type = "insertion"
        elif change.length_b == 0:
            change.type = "deletion"
        classified.append(change)
    
    return classified
```

## Implementation priority

Build in this order — each step produces something testable:

**Phase 1: Core (diff + versioning)**
1. **models.py** — all dataclasses (including Assembly, Fragment, Primer)
2. **parser.py** — GenBank → Feature list + sequence extraction
3. **utils.py** — SHA-256, circular linearization, codon translation, Tm calculation (nearest-neighbor)
4. **diff.py** — semantic diff engine (core!) with all three layers
5. **database.py** — SQLite init, CRUD for all tables
6. **revision.py** — import, commit, log, tree, variant
7. **cli.py** — Click commands wiring everything together
8. **search.py** — feature search, restriction enzyme site search
9. **parts.py** — part library
10. **strains.py** — YAML strain management

**Phase 2: Assembly engine**
11. **overlap.py** — overlap designer (split points → Tm calc → primer generation)
12. **primers.py** — primer registry (CRUD, usage tracking, reuse detection)
13. **assembly.py** — assembly operations, fragment provenance, reassembly, templates, pipeline status
14. Update **diff.py** — assembly-aware diff (fragment-level comparison)
15. Update **cli.py** — assembly subcommands

Write tests alongside each module.

`test_diff.py` is the most critical — test with:
- identical sequences (expect: no changes)
- single point mutation (expect: correct AA change)
- inserted cassette (expect: insertion + new features)
- deleted feature (expect: deletion)
- promoter swap (expect: replacement)

`test_overlap.py` — test with:
- 3-fragment overlap PCR (PglaA + CDS + TtrpC)
- Tm calculation accuracy (compare with known oligos)
- fragment swap → recalculated overlaps

`test_primers.py` — test with:
- primer CRUD + linkage to operations
- reuse detection across constructs

## Coding conventions

- Type hints everywhere (Python 3.11+ syntax: `str | None`, not `Optional[str]`)
- Dataclasses, not dicts, for structured data
- `pathlib.Path`, not `os.path`
- Rich for terminal output (tables, trees, panels)
- Click for CLI (groups, options, arguments)
- pytest for tests, fixtures in conftest.py
- Docstrings on public functions (Google style)
- No classes where a function will do — keep it simple

## Testing

```bash
pytest tests/ -v              # run all
pytest tests/test_diff.py -v  # just diff engine
pytest -k "point_mutation"    # specific test
```

Generate synthetic test fixtures if real .gb files aren't available:
```python
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from Bio.SeqFeature import SeqFeature, FeatureLocation
from Bio import SeqIO

record = SeqRecord(
    Seq("ATGCGATCG..."),
    id="test_construct",
    name="test",
    annotations={"topology": "circular", "molecule_type": "DNA"}
)
record.features.append(
    SeqFeature(FeatureLocation(0, 900, strand=1), type="CDS",
               qualifiers={"gene": ["testGene"], "product": ["test protein"]})
)
SeqIO.write(record, "tests/fixtures/simple_v1.gb", "genbank")
```

## What NOT to do

- Don't use git as backend — we manage our own revision history
- Don't store sequences in SQLite as BLOBs — store as .gb text files
- Don't build web UI yet — Phase 3
- Don't over-engineer the alignment — BioPython pairwise2 is fine for MVP, plasmids are <20kb
- Don't parse SnapGene .dna files — require GenBank export for now
- Don't use ORM (SQLAlchemy etc.) — raw sqlite3 is sufficient for this schema

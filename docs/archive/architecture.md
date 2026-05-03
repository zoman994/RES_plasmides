# PlasmidVCS — Architecture Document

**Version Control System for Genetic Constructs**

Version: 0.1-draft | Date: 2026-03-20 | Author: Igor Sinelnikov

---

## 1. Problem Statement

Genetic engineering projects accumulate dozens of plasmid variants over months and years. A typical lab manages this via:

- SnapGene files in nested folders (`v2_final_FINAL_igor_fixed.dna`)
- Excel sheets mapping constructs to strains
- Tribal knowledge ("ask Dasha, she has the latest pepA version")
- GenBank files emailed between collaborators

This leads to: lost construct history, broken lineage tracking, duplicated work, and irreproducible strain engineering.

**PlasmidVCS** applies version control principles to genetic constructs — not as a generic file versioning tool, but as a **biology-aware** system that understands what a plasmid IS.

---

## 2. Core Concepts

### 2.1 What Makes DNA Different from Code

| Property | Source code | Plasmid |
|----------|-----------|---------|
| Topology | Linear (file) | Circular (ring) |
| Diff unit | Line of text | Feature (gene, promoter, terminator) |
| Identity | Filename | Name + topology + key features |
| "Branch" | Feature branch | Variant (different insert, mutation) |
| "Merge" | Code merge | Combinatorial assembly |
| Annotation | Comments | Features with types, qualifiers, coordinates |
| Coordinates | Line numbers | Nucleotide positions (circular!) |

**Key insight:** A meaningful diff between two plasmid versions is NOT "line 47 changed". It's:
- "Point mutation Q158R in CDS XynTA (pos 1234, CAG→CGG)"
- "Promoter glaA replaced with PgpdA (pos 1–850)"  
- "Inserted cassette [PglaA-XynTL-TtrpC] at landing pad pepA"
- "Deleted feature hygR (pos 5100–6200)"

### 2.2 The Git Analogy

| Git concept | PlasmidVCS equivalent |
|-------------|----------------------|
| Repository | **Project** — a collection of related constructs |
| Commit | **Revision** — a snapshot of a construct with metadata |
| Branch | **Variant** — a parallel version (e.g., different gene insert) |
| Tag | **Milestone** — named version (e.g., "sent-to-Vazyme", "transformed-AN004") |
| Diff | **Semantic diff** — feature-level comparison |
| Merge | **Assembly** — combining parts from different constructs |
| Submodule | **Part** — reusable genetic element (promoter, terminator, gene) |
| README | **Construct card** — description, purpose, status, linked strains |

### 2.3 Entity Model

```
Project (e.g., "A. niger CRISPR platform")
├── Construct: P43_Cas_Uni_Tr
│   ├── Revision 1: original (single guide, hygR)
│   ├── Revision 2: BsaI domestication (A→G pos 1446)  
│   ├── Variant: polycistronic
│   │   ├── Revision 1: tRNA-gRNA1-tRNA-gRNA2 insert
│   │   └── Revision 2: + Golden Gate swap cassette
│   └── Variant: dual-guide-pepA
│       └── Revision 1: guides targeting pepA locus
│
├── Construct: pEXP-glaA-XynTL
│   ├── Revision 1: TaXyn10A WT
│   ├── Revision 2: Q158R mutation
│   └── Variant: TlXyn10A-transplant
│       └── Revision 1: E229I + F232E from TlXyn10A_P
│
├── Part Library
│   ├── PglaA (promoter, 850 bp)
│   ├── TtrpC (terminator, 740 bp)
│   ├── pyrG_Af (marker, A. fumigatus, 966 bp)
│   └── landing_pad_pepA (synthetic, 66 bp)
│
└── Strain Registry
    ├── AN-001: CBS 513.88 (wild type)
    ├── AN-002: ΔkusA (from AN-001, transformed with...)
    ├── AN-003: ΔkusA pyrG⁻ (from AN-002, edited with P43_Cas rev.2)
    └── AN-004: ΔkusA ΔpepA pyrG⁻ (from AN-003, edited with P43_Cas dual-guide-pepA)
```

---

## 3. Data Model

### 3.1 Construct (central entity)

```python
class Construct:
    id: str              # UUID
    name: str            # "P43_Cas_Uni_Tr"
    description: str     # "Cas9 expression plasmid for A. niger/T. reesei"
    topology: str        # "circular" | "linear"
    project_id: str      # parent project
    parent_id: str       # None for root, or ID of parent construct (for variants)
    created_at: datetime
    tags: list[str]      # ["CRISPR", "A.niger", "hygR"]
```

### 3.2 Revision (immutable snapshot)

```python
class Revision:
    id: str              # UUID
    construct_id: str    # parent construct
    version: str         # semantic: "1.0", "1.1", "2.0"
    sequence: str        # full nucleotide sequence
    features: list[Feature]  # annotated features
    length: int          # bp
    message: str         # commit message: "Domesticated internal BsaI site"
    author: str          # "Igor Sinelnikov"
    created_at: datetime
    parent_revision_id: str  # previous revision (for diff chain)
    
    # Optional metadata
    genbank_file: str    # path to .gb file
    snapgene_file: str   # path to .dna file (if available)
    checksum: str        # SHA-256 of sequence
```

### 3.3 Feature (annotation within a revision)

```python
class Feature:
    id: str
    type: str            # "CDS" | "promoter" | "terminator" | "gene" | "misc_feature" | ...
    name: str            # "Cas9", "PglaA", "hygR"
    location_start: int  # 1-based
    location_end: int
    strand: int          # 1 or -1
    qualifiers: dict     # {"product": "Cas9 nuclease", "codon_start": 1, ...}
    sequence: str        # nucleotide sequence of this feature
    
    # PlasmidVCS-specific
    part_id: str         # link to Part library (if this is a known part)
    color: str           # for visualization
```

### 3.4 Part (reusable genetic element)

```python
class Part:
    id: str
    name: str            # "PglaA"
    type: str            # "promoter"
    sequence: str        # canonical sequence
    organism: str        # "Aspergillus niger"
    description: str     # "Glucoamylase promoter, strong inducible"
    source: str          # "CBS 513.88 glaA locus"
    references: list[str]  # PubMed IDs, DOIs
    tags: list[str]
```

### 3.5 Strain (links biology to constructs)

```python
class Strain:
    id: str
    name: str            # "AN-004"
    full_name: str       # "A. niger CBS 513.88 ΔkusA ΔpepA pyrG⁻"
    genotype: str        # "ΔkusA::amdS ΔpepA::pyrG_Af pyrG⁻"
    parent_strain_id: str
    species: str         # "Aspergillus niger"
    
    # What was done to create this strain
    transformation_construct_id: str   # which construct was used
    transformation_revision_id: str    # which specific version
    transformation_date: datetime
    transformation_method: str         # "PEG-protoplast"
    
    # Status
    verified: bool       # PCR/sequencing confirmed?
    storage_location: str  # "Cryo box 3, pos A5"
    notes: str
```

### 3.6 SemanticDiff (the key innovation)

```python
class SemanticDiff:
    revision_a_id: str
    revision_b_id: str
    changes: list[Change]

class Change:
    type: str
    # Types:
    #   "point_mutation"    — single nucleotide change
    #   "insertion"         — new sequence added
    #   "deletion"          — sequence removed
    #   "replacement"       — region replaced with different sequence
    #   "feature_added"     — new annotation
    #   "feature_removed"   — annotation removed
    #   "feature_modified"  — feature boundaries or qualifiers changed
    #   "inversion"         — region inverted
    
    # Location
    position_a: int       # position in revision A
    position_b: int       # position in revision B
    length_a: int         # affected length in A
    length_b: int         # affected length in B
    
    # Semantic context
    affected_feature: str  # "CDS:Cas9" or "promoter:PglaA"
    description: str       # human-readable: "Q158R in XynTA (CAG→CGG)"
    
    # Raw data
    sequence_a: str        # original sequence at this position
    sequence_b: str        # new sequence at this position
```

### 3.7 AssemblyOperation (how a revision was built)

```python
class AssemblyOperation:
    id: str
    revision_id: str          # the revision this operation produced
    method: str               # "overlap_pcr" | "gibson" | "golden_gate" | 
                              # "restriction_ligation" | "crispr_hdr" | 
                              # "site_directed_mutagenesis" | "synthesis" | "other"
    fragments: list[Fragment]
    primers: list[str]        # primer IDs used
    notes: str
    created_at: str
```

### 3.8 Fragment (a piece of an assembly)

```python
class Fragment:
    id: str
    order: int               # position in assembly (1, 2, 3...)
    name: str                # "PglaA", "XynTL_Q158R", "TtrpC"
    
    # Source: where this fragment came from
    source_type: str         # "construct" | "part" | "synthesis" | "pcr_product" | "oligo"
    source_construct_id: str | None   # if from another construct
    source_revision_id: str | None    # specific version
    source_part_id: str | None        # if from part library
    source_description: str | None    # "Vazyme order #2026-03-15" for synthesis
    
    # Position in the final construct
    start: int               # 1-based, inclusive
    end: int
    
    # Overlap zones (for overlap PCR / Gibson)
    overlap_left: OverlapZone | None
    overlap_right: OverlapZone | None
```

### 3.9 OverlapZone (junction between fragments)

```python
class OverlapZone:
    sequence: str            # the overlap sequence itself
    length: int              # bp
    tm: float                # melting temperature (nearest-neighbor)
    gc_percent: float
    position_in_construct: int  # where it sits in the final product
    
    # For Golden Gate
    overhang: str | None     # 4-nt overhang sequence (ATCG)
    enzyme: str | None       # "BsaI", "BbsI", "Esp3I"
```

### 3.10 Primer (linked to assemblies)

```python
class Primer:
    id: str
    name: str                # "fwd_PglaA_OL"
    sequence: str            # full primer sequence including tail
    
    # Binding region
    binding_start: int       # position on template
    binding_end: int
    binding_sequence: str    # 3' binding portion
    tm_binding: float        # Tm of binding region only
    
    # Tail (overlap / restriction site / other)
    tail_sequence: str       # 5' non-binding portion
    tail_purpose: str        # "overlap with XynTL" | "BsaI site + overhang" | "His-tag"
    tm_full: float           # Tm of full primer
    
    # Metadata
    gc_percent: float
    length: int
    direction: str           # "forward" | "reverse"
    
    # Usage tracking
    used_in: list[dict]      # [{"revision_id": "...", "operation_id": "...", "role": "frag1_fwd"}]
    vendor: str | None       # "IDT", "Evrogen", "Syntol"
    order_date: str | None
    
    tags: list[str]
```

### 3.11 AssemblyTemplate (reusable assembly blueprint)

```python
class AssemblyTemplate:
    id: str
    name: str                # "glaA expression cassette"
    method: str              # "overlap_pcr" | "gibson" | etc.
    description: str
    
    # Slots: ordered list of fragment positions
    slots: list[TemplateSlot]
    
    # Default parameters
    overlap_length: int      # default bp for overlaps (e.g., 22)
    backbone_part_id: str | None  # if uses a backbone vector

class TemplateSlot:
    position: int            # 1, 2, 3...
    name: str                # "Promoter", "CDS", "Terminator"
    type_constraint: str     # "promoter" | "CDS" | "terminator" | "any"
    fixed: bool              # True = always same part, False = swappable
    default_part_id: str | None  # pre-filled part (e.g., PglaA for slot 1)
```

---

## 4. Semantic Diff Engine

This is the core innovation. The diff engine works in three layers:

### Layer 1: Sequence Alignment

```
Input: two nucleotide sequences (potentially circular)
Method: 
  1. Linearize both at the same origin (by feature anchor, e.g., ori)
  2. Global alignment (Needleman-Wunsch or banded for long sequences)
  3. Extract mismatches, insertions, deletions
Output: list of raw sequence changes with coordinates
```

### Layer 2: Feature Mapping

```
Input: raw changes + features from both revisions
Method:
  1. Map each raw change to overlapping features
  2. Classify: does it fall within a CDS? Promoter? Intergenic?
  3. For CDS changes: translate and identify amino acid change
  4. For promoter/terminator: flag as regulatory change
Output: annotated changes with biological context
```

### Layer 3: Semantic Classification

```
Input: annotated changes
Method:
  1. Single-base in CDS → point_mutation (report AA change)
  2. Multi-base in CDS, in-frame → in-frame insertion/deletion
  3. Whole feature replaced → replacement (report old vs new)
  4. New feature appeared → feature_added
  5. Feature disappeared → feature_removed
  6. Only qualifiers changed → feature_modified
Output: list of Change objects with human-readable descriptions
```

### Example Output

```
pvcs diff P43_Cas:v1.0 P43_Cas:v1.1

  CONSTRUCT: P43_Cas_Uni_Tr
  ─────────────────────────────────────
  v1.0 → v1.1  |  1 change  |  +0 bp
  
  1. POINT MUTATION at pos 1446
     Context: intergenic (upstream of CDS:Cas9)
     BsaI recognition site domesticated
     GGTCTC → GGTCGC (A→G)
     Effect: removes internal BsaI site
     
  Summary: 1 silent mutation (no coding changes)
```

```
pvcs diff pEXP-XynTL:v1.0 pEXP-XynTL:v1.1

  CONSTRUCT: pEXP-glaA-XynTL
  ─────────────────────────────────────
  v1.0 → v1.1  |  1 change  |  +0 bp
  
  1. POINT MUTATION at pos 2847 (CDS:XynTL, codon 158)
     CAG → CGG
     Q158R (Gln → Arg)
     Source: Souza et al., 2016 — thermostability mutant
     
  Summary: 1 coding mutation in XynTL
```

---

## 5. Assembly Engine

The second core innovation after semantic diff. PlasmidVCS natively understands cloning operations — overlap PCR, Gibson assembly, Golden Gate, restriction/ligation, CRISPR HDR — and tracks HOW each construct was built, not just what it contains.

### 8.1 Cloning Operation Tracker

Every commit can optionally record the assembly operation that produced it. This is stored as an `AssemblyOperation` linked to the revision.

```
pvcs commit pEXP-XynTL-v2.gb --version 2.0 \
    --operation overlap-pcr \
    --fragments "PglaA:1-850" "XynTL_Q158R:851-1750" "TtrpC:1751-2490" \
    --message "Overlap PCR assembly: PglaA + XynTL(Q158R) + TtrpC"
```

Supported operation types:

| Method | Key metadata | Visual representation |
|--------|-------------|----------------------|
| `overlap_pcr` | Fragments, overlap zones, primers | Colored blocks with overlap regions highlighted |
| `gibson` | Fragments, overlap zones (≥20 bp) | Similar to overlap PCR, labeled "Gibson" |
| `golden_gate` | Enzyme (BsaI/BbsI), 4-nt overhangs, fragment order | Blocks with overhang sequences at junctions |
| `restriction_ligation` | Enzymes, compatible ends, backbone | Cut sites shown, insert direction indicated |
| `crispr_hdr` | Guide RNA, PAM, donor cassette, homology arms | Guide position + donor alignment |
| `site_directed_mutagenesis` | Target position, old/new codon, primers | Point mutation highlighted on map |
| `synthesis` | Vendor, order ID, date | "Synthesized by Vazyme" badge |

### 8.2 Fragment Provenance

Each fragment in an assembly knows its origin — which construct, part, or synthesis order it came from.

Visual representation on the circular map: a **"Provenance" color layer** paints each region by source:

```
Region 1–850:     from pEXP-glaA-ChyM v1.2       (blue)
Region 851–1750:  synthesis, Vazyme 2026-03-15     (orange)  
Region 1751–2490: from pUC19 part library          (gray)
Overlap zones:    de novo designed in primers       (teal)
```

Hover tooltip on any region: "From construct pEXP-glaA-ChyM v1.2, positions 1–850, via overlap PCR, 2026-03-20."

### 8.3 Assembly-Aware Diff

When comparing two revisions that share the same assembly structure, the diff engine understands fragment boundaries:

```
pvcs diff pEXP-XynTL:1.0 pEXP-XynTL:2.0

  v1.0 → v2.0  |  Assembly: Overlap PCR
  ─────────────────────────────────────
  
  FRAGMENT CHANGES:
  ┌─────────────┬────────────────┬────────────────┐
  │ Position     │ v1.0           │ v2.0           │
  ├─────────────┼────────────────┼────────────────┤
  │ 1–850       │ PglaA (same)   │ PglaA (same)   │
  │ 851–1750    │ XynTL WT       │ XynTL Q158R    │ ← 1 mutation
  │ 1751–2490   │ TtrpC (same)   │ TtrpC (same)   │
  └─────────────┴────────────────┴────────────────┘
  
  OVERLAP ZONES:
    A: 829–850 (22 bp) — unchanged
    B: 1729–1752 (24 bp) — unchanged
  
  NET CHANGE: 1 point mutation in fragment 2 (CDS:XynTL, Q158R)
```

Instead of a raw 900 bp "changed region", the system shows the single point mutation within the preserved assembly framework.

### 8.4 Overlap Designer (built-in calculator)

Not a full primer design tool (that's SnapGene's job), but a quick overlap calculator for the most common operation.

On the circular map: user clicks "Split here" at 2–3 positions → marks fragment boundaries. System instantly calculates:

- Fragment lengths
- Suggested overlap zones (default 20–25 bp each side)
- Tm of each overlap (nearest-neighbor method)
- %GC of overlaps
- ΔTm between overlap zones (ideal: <2°C)
- Warnings: secondary structures, repeats, extreme GC in overlaps

Output: list of primers with binding region + tail (overlap), ready for ordering.

```python
def design_overlaps(
    sequence: str,
    split_points: list[int],      # positions to split
    overlap_length: int = 22,     # default overlap bp
    tm_target: float = 62.0,      # target Tm for overlaps
) -> list[OverlapDesign]:
    """Calculate overlap zones and primers for overlap PCR assembly."""
    ...
```

### 8.5 Quick Reassembly

Swap a single fragment in an existing assembly while keeping overlaps intact:

```
pvcs reassemble pEXP-XynTL:2.0 \
    --swap-fragment 2 \
    --new-source "parts/CDS/TlXyn10A_transplant.gb" \
    --output pEXP-TlXyn10A-transplant.gb
```

System:
1. Reads assembly metadata from v2.0 (knows overlap zones)
2. Takes new fragment sequence
3. Recalculates overlap primers (tails updated, binding regions recalculated)
4. Generates new .gb with correct annotations
5. Records operation: "Reassembly: fragment 2 swapped (XynTL_Q158R → TlXyn10A_transplant)"

### 8.6 Primer Registry

All primers linked to assembly operations. Stored in `primers` SQLite table.

Key features:
- **Reverse lookup**: given a primer → show all constructs where it was used
- **Reuse detection**: when designing a new assembly, check if existing primers fit
- **Vendor tracking**: order date, vendor (IDT/Evrogen/Syntol), lot number
- **Depletion warning**: flag primers used >10 times (stock may be running low)

```
pvcs primer list                          # all primers
pvcs primer show fwd_PglaA_OL             # detail + usage history
pvcs primer find --binds-to "PglaA"       # find primers binding to a part
pvcs primer check-reuse pEXP-PhyPL:1.0    # check if existing primers work
```

### 8.7 Assembly Templates

Reusable blueprints for common assembly patterns:

```
pvcs template create "glaA-cassette" \
    --method overlap-pcr \
    --slot "Promoter:fixed:PglaA" \
    --slot "CDS:swappable" \
    --slot "Terminator:fixed:TtrpC" \
    --overlap-length 22

pvcs template use "glaA-cassette" \
    --fill "CDS=parts/CDS/PhyPL.gb" \
    --output pEXP-glaA-PhyPL.gb
```

Fills the swappable slot, calculates overlaps, generates primers, outputs .gb with full annotations and assembly metadata.

### 8.8 Assembly Pipeline Status

Track multiple parallel assemblies across the project:

```
pvcs assembly status

  ACTIVE ASSEMBLIES
  ┌──────────────┬──────────┬───────────┬────────────┬───────────┐
  │ Construct    │ Method   │ Fragments │ Status     │ Next step │
  ├──────────────┼──────────┼───────────┼────────────┼───────────┤
  │ pEXP-XynTL   │ OL-PCR   │ 3/3 ✅    │ Assembled  │ Transform │
  │ pEXP-XynTA   │ OL-PCR   │ 2/3 ⏳    │ PCR frag 3 │ Fuse      │
  │ pEXP-PhyPL   │ Gibson   │ 4/4 ✅    │ Assembled  │ Transform │
  │ pEXP-ChyM    │ OL-PCR   │ 1/3 ❌    │ Frag 2 fail│ Re-PCR    │
  │ gRNA-pepA    │ Synthesis │ —         │ Ordered    │ Vazyme    │
  └──────────────┴──────────┴───────────┴────────────┴───────────┘
```

Statuses: `design` → `primers_ordered` → `pcr` → `assembly` → `transform` → `screen` → `verified`

```
pvcs assembly set pEXP-XynTA --status pcr --note "Fragment 3 PCR tomorrow"
```

---

## 6. Storage Architecture

### 8.1 Directory Structure

```
my-project/
├── .pvcs/                    # PlasmidVCS metadata (like .git/)
│   ├── config.json           # project settings
│   ├── database.sqlite       # all metadata, lineage, diffs
│   └── objects/              # immutable revision snapshots
│       ├── abc123.gb         # GenBank files (content-addressed)
│       ├── def456.gb
│       └── ...
│
├── constructs/               # working directory (current versions)
│   ├── P43_Cas_Uni_Tr.gb
│   ├── pEXP-glaA-XynTL.gb
│   └── pEXP-glaA-PhyPL.gb
│
├── parts/                    # reusable parts library
│   ├── promoters/
│   │   ├── PglaA.gb
│   │   └── PgpdA.gb
│   ├── terminators/
│   │   └── TtrpC.gb
│   ├── markers/
│   │   ├── pyrG_Af.gb
│   │   └── hygR.gb
│   └── other/
│       └── landing_pad_pepA.gb
│
└── strains/                  # strain registry (YAML for readability)
    ├── AN-001.yaml
    ├── AN-002.yaml
    ├── AN-003.yaml
    └── AN-004.yaml
```

### 8.2 Strain YAML Example

```yaml
# strains/AN-004.yaml
id: AN-004
name: "A. niger CBS 513.88 ΔkusA ΔpepA pyrG⁻"
species: "Aspergillus niger"
parent: AN-003

genotype:
  deletions:
    - gene: kusA
      replacement: amdS
      method: "homologous recombination"
    - gene: pepA
      replacement: pyrG_Af
      method: "CRISPR-Cas9 HDR"
  markers:
    - name: amdS
      status: active
    - name: pyrG
      status: "knocked out (5-FOA selected)"
  
created:
  date: 2026-02-01
  construct: P43_Cas_Uni_Tr
  construct_revision: v2.0-dual-guide-pepA
  method: PEG-protoplast
  donor_dna: "pepA_HDR_cassette (1kb flanks + pyrG_Af)"
  
verification:
  pcr_confirmed: true
  sequencing_confirmed: false
  phenotype: "pyrG⁻ (grows on 5-FOA + uridine, no growth w/o uridine)"

storage:
  location: "Cryo box 3, position A5"
  date_frozen: 2026-02-15
  
notes: |
  First confirmed ΔpepA strain. 
  1 out of 5 FOA-resistant colonies was clean pyrG⁻.
  ama1 plasmid loss confirmed (hygR⁻ by PCR).
```

### 8.3 SQLite Schema (core tables)

```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE constructs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT,
    topology TEXT DEFAULT 'circular',
    parent_construct_id TEXT REFERENCES constructs(id),
    created_at TEXT NOT NULL,
    tags TEXT  -- JSON array
);

CREATE TABLE revisions (
    id TEXT PRIMARY KEY,
    construct_id TEXT NOT NULL REFERENCES constructs(id),
    version TEXT NOT NULL,
    sequence TEXT NOT NULL,
    length INTEGER NOT NULL,
    features TEXT NOT NULL,  -- JSON array of Feature objects
    message TEXT,
    author TEXT,
    parent_revision_id TEXT REFERENCES revisions(id),
    genbank_path TEXT,
    checksum TEXT NOT NULL,  -- SHA-256
    created_at TEXT NOT NULL,
    UNIQUE(construct_id, version)
);

CREATE TABLE parts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    sequence TEXT NOT NULL,
    organism TEXT,
    description TEXT,
    source TEXT,
    references TEXT,  -- JSON array
    tags TEXT          -- JSON array
);

CREATE TABLE strains (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    species TEXT,
    parent_strain_id TEXT REFERENCES strains(id),
    genotype TEXT,     -- JSON
    construct_id TEXT REFERENCES constructs(id),
    revision_id TEXT REFERENCES revisions(id),
    verified INTEGER DEFAULT 0,
    storage_location TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE milestones (
    id TEXT PRIMARY KEY,
    revision_id TEXT NOT NULL REFERENCES revisions(id),
    name TEXT NOT NULL,    -- "sent-to-Vazyme", "transformed-AN004"
    description TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE assembly_operations (
    id TEXT PRIMARY KEY,
    revision_id TEXT NOT NULL REFERENCES revisions(id),
    method TEXT NOT NULL,        -- "overlap_pcr", "gibson", "golden_gate", etc.
    fragments TEXT NOT NULL,     -- JSON array of Fragment objects
    primer_ids TEXT,             -- JSON array of primer IDs
    notes TEXT,
    status TEXT DEFAULT 'design', -- "design","primers_ordered","pcr","assembly","transform","screen","verified"
    created_at TEXT NOT NULL
);

CREATE TABLE primers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sequence TEXT NOT NULL,
    binding_sequence TEXT,
    tail_sequence TEXT,
    tail_purpose TEXT,           -- "overlap with XynTL", "BsaI site"
    tm_binding REAL,
    tm_full REAL,
    gc_percent REAL,
    length INTEGER,
    direction TEXT,              -- "forward" | "reverse"
    vendor TEXT,                 -- "IDT", "Evrogen", "Syntol"
    order_date TEXT,
    tags TEXT                    -- JSON array
);

CREATE TABLE primer_usage (
    primer_id TEXT NOT NULL REFERENCES primers(id),
    operation_id TEXT NOT NULL REFERENCES assembly_operations(id),
    role TEXT,                   -- "frag1_fwd", "frag2_rev", etc.
    PRIMARY KEY (primer_id, operation_id)
);

CREATE TABLE assembly_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    method TEXT NOT NULL,
    description TEXT,
    slots TEXT NOT NULL,         -- JSON array of TemplateSlot objects
    overlap_length INTEGER DEFAULT 22,
    backbone_part_id TEXT REFERENCES parts(id),
    created_at TEXT NOT NULL
);
```

---

## 7. CLI Interface

### 7.1 Core Commands

```bash
# Initialize project
pvcs init "A. niger CRISPR platform"

# Import existing GenBank file as new construct
pvcs import P43_Cas_Uni_Tr.gb --name "P43_Cas_Uni_Tr" \
    --message "Original Cas9 plasmid from Nødvig lab" \
    --tags "CRISPR,hygR,ama1"

# Commit a new revision (after editing in SnapGene)
pvcs commit P43_Cas_Uni_Tr.gb --version 1.1 \
    --message "Domesticated internal BsaI site (A→G pos 1446)"

# Commit with assembly operation metadata
pvcs commit pEXP-XynTL-v2.gb --version 2.0 \
    --operation overlap-pcr \
    --fragments "PglaA:1-850" "XynTL_Q158R:851-1750" "TtrpC:1751-2490" \
    --message "Overlap PCR: PglaA + XynTL(Q158R) + TtrpC"

# Create a variant (branch)
pvcs variant P43_Cas_Uni_Tr --name "polycistronic" \
    --from-version 1.1 \
    --message "Polycistronic dual-guide Golden Gate version"

# Semantic diff between versions
pvcs diff P43_Cas_Uni_Tr:1.0 P43_Cas_Uni_Tr:1.1

# Diff between construct and its variant
pvcs diff P43_Cas_Uni_Tr:1.1 P43_Cas_Uni_Tr/polycistronic:1.0

# View construct history
pvcs log P43_Cas_Uni_Tr

# View construct tree (all variants)
pvcs tree P43_Cas_Uni_Tr

# Tag a revision with a milestone
pvcs tag P43_Cas_Uni_Tr:2.0 "sent-to-Vazyme-2026-03"

# Add/manage parts
pvcs part add parts/promoters/PglaA.gb --type promoter \
    --organism "A. niger" --name "PglaA"

# Register a strain
pvcs strain add AN-004 \
    --parent AN-003 \
    --construct P43_Cas_Uni_Tr/dual-guide-pepA:1.0 \
    --method "PEG-protoplast" \
    --genotype "ΔkusA::amdS ΔpepA::pyrG_Af pyrG⁻"

# View strain lineage
pvcs strain tree AN-004

# Search across project
pvcs search "BsaI"           # find all constructs with BsaI sites
pvcs search --feature "Cas9"  # find all constructs containing Cas9
pvcs search --part "PglaA"    # find all constructs using glaA promoter

# Export construct with full history
pvcs export P43_Cas_Uni_Tr --format html  # visual report
pvcs export P43_Cas_Uni_Tr --format gb    # latest GenBank
```

### 7.2 Assembly Commands

```bash
# Design overlaps for a new assembly
pvcs overlap design pEXP-XynTL.gb \
    --split 850,1750 \
    --overlap-length 22 \
    --tm-target 62

# Quick reassembly: swap one fragment
pvcs reassemble pEXP-XynTL:2.0 \
    --swap-fragment 2 \
    --new-source "parts/CDS/TlXyn10A_transplant.gb" \
    --output pEXP-TlXyn10A-transplant.gb

# Primer management
pvcs primer list                          # all primers
pvcs primer show fwd_PglaA_OL             # detail + usage history
pvcs primer find --binds-to "PglaA"       # primers binding to a part
pvcs primer check-reuse pEXP-PhyPL:1.0    # reuse detection

# Assembly templates
pvcs template create "glaA-cassette" \
    --method overlap-pcr \
    --slot "Promoter:fixed:PglaA" \
    --slot "CDS:swappable" \
    --slot "Terminator:fixed:TtrpC" \
    --overlap-length 22

pvcs template use "glaA-cassette" \
    --fill "CDS=parts/CDS/PhyPL.gb" \
    --output pEXP-glaA-PhyPL.gb

# Assembly pipeline status
pvcs assembly status                                  # overview table
pvcs assembly set pEXP-XynTA --status pcr \
    --note "Fragment 3 PCR tomorrow"
```

### 7.3 Example Session

```bash
$ pvcs init "Niger Expression Platform"
Initialized PlasmidVCS project in ./niger-platform/.pvcs/

$ pvcs import pEXP-glaA-XynTL.gb \
    --message "TaXyn10A wild-type in glaA expression vector" \
    --tags "xylanase,GH10,feed-enzyme"
Imported: pEXP-glaA-XynTL (v1.0)
  Length: 8,432 bp | Circular
  Features: 12 (3 CDS, 2 promoters, 2 terminators, 5 other)
  Checksum: sha256:a3f2c8...

$ # Edit in SnapGene: introduce Q158R mutation
$ pvcs commit pEXP-glaA-XynTL.gb --version 1.1 \
    --message "Q158R thermostability mutation (Souza 2016)"
Committed: pEXP-glaA-XynTL v1.1
  Changes from v1.0:
    1. POINT MUTATION pos 2847: CAG→CGG (Q158R in CDS:XynTL)
  
$ pvcs variant pEXP-glaA-XynTL --name "TlXyn10A-transplant" \
    --from-version 1.0 \
    --message "Subsite +2/+4 mutations from TlXyn10A_P"
Created variant: pEXP-glaA-XynTL/TlXyn10A-transplant

$ pvcs log pEXP-glaA-XynTL
  pEXP-glaA-XynTL
  ├── v1.0  2026-03-01  TaXyn10A wild-type in glaA expression vector
  ├── v1.1  2026-03-15  Q158R thermostability mutation (Souza 2016)
  └── variant: TlXyn10A-transplant
      └── v1.0  2026-03-20  Subsite +2/+4 mutations from TlXyn10A_P
```

---

## 8. Tech Stack

### 8.1 MVP (Phase 1)

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | Python 3.11+ | BioPython ecosystem, Igor's familiarity |
| Sequence parsing | BioPython (SeqIO) | De facto standard for GenBank/FASTA |
| Alignment | BioPython pairwise2 / parasail | Fast sequence alignment |
| Database | SQLite | Zero-config, single file, portable |
| CLI framework | Click | Clean, composable CLI |
| Output formatting | Rich | Pretty terminal tables and trees |
| Package | pip/uv | Standard Python packaging |

### 8.2 Web UI (Phase 2)

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Backend | FastAPI | Async, auto-docs, Python-native |
| Frontend | React + TypeScript | Standard, good for interactive viz |
| Plasmid visualization | Custom SVG (D3.js) | Circular maps, feature coloring |
| Diff visualization | Custom component | Side-by-side with semantic highlighting |
| Deployment | Docker | Self-hosted on lab Nextcloud server |

### 8.3 Dependencies (minimal)

```
# requirements.txt (Phase 1)
biopython>=1.83
click>=8.1
rich>=13.0
pyyaml>=6.0
```

---

## 9. Development Roadmap

### Phase 1: Core CLI (2–3 weeks with Claude Code)

- [ ] Project init, config
- [ ] GenBank import/parse (BioPython)
- [ ] Revision storage (SQLite + .gb files)
- [ ] **Semantic diff engine** (the key feature)
- [ ] Construct history (`log`, `tree`)
- [ ] Variant creation and tracking
- [ ] Basic search
- [ ] Part library (import, list, link)

**Deliverable:** Working CLI that can track your real plasmids.

### Phase 2: Assembly Engine + Strains (2–3 weeks)

- [ ] Assembly operation tracking (commit with --operation)
- [ ] Fragment provenance storage
- [ ] **Overlap designer** (split points → overlap Tm calc → primer output)
- [ ] **Quick reassembly** (swap fragment, recalculate overlaps)
- [ ] Primer registry (CRUD, usage tracking, reuse detection)
- [ ] Assembly templates (create, use, list)
- [ ] Assembly pipeline status (kanban-style tracking)
- [ ] Strain YAML management
- [ ] Strain lineage tree
- [ ] Milestone tagging
- [ ] Assembly-aware diff (fragment-level comparison)
- [ ] Export to HTML report (construct card + assembly plan)

**Deliverable:** Full cloning workflow tracker — from design through screening.

### Phase 3: Web UI (4–6 weeks)

- [ ] FastAPI backend wrapping CLI
- [ ] React frontend (based on Open Vector Editor)
- [ ] **Interactive circular plasmid map** (SVG, synchronized with linear/text)
- [ ] **Visual diff viewer** (side-by-side maps + feature-level highlighting)
- [ ] **Assembly visualization** (fragment blocks with overlap zones)
- [ ] Construct tree visualization (GitKraken-style branch graph)
- [ ] Strain lineage DAG (interactive, dagre.js layout)
- [ ] Part library browser (card grid + search)
- [ ] Primer registry UI (table + usage graph)
- [ ] Assembly template editor (drag-and-drop slot filling)
- [ ] Assembly pipeline kanban board
- [ ] Dashboard (recent constructs, activity feed, stats)
- [ ] Docker packaging

**Deliverable:** Self-hosted web app on lab server with plasmid preview and change tracking.

### Phase 4: Collaboration + Open Source (future)

- [ ] Multi-user support (auth, permissions)
- [ ] Git-like push/pull between instances
- [ ] Suggesting mode (proposed changes with accept/reject)
- [ ] Author-colored change attribution (Google Docs-style)
- [ ] Addgene/NCBI integration
- [ ] GenBank auto-annotation
- [ ] API for integration with lab automation (Tecan EVO, OpenClaw)
- [ ] Public GitHub release

---

## 10. Competitive Positioning

| Feature | PlasmidVCS | Benchling | SnapGene | Asimov Kernel | Excel+Folders |
|---------|-----------|-----------|----------|---------------|---------------|
| Semantic diff | ✅ Core | ❌ | ❌ | ⚠️ Planned | ❌ |
| Version history | ✅ Full | ✅ Basic | ❌ | ⚠️ Planned | ❌ |
| Variant branching | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assembly tracking | ✅ Native | ❌ | ⚠️ History View | ❌ | ❌ |
| Fragment provenance | ✅ | ❌ | ⚠️ History Colors | ❌ | ❌ |
| Overlap designer | ✅ Built-in | ❌ | ✅ Full | ❌ | ❌ |
| Primer registry | ✅ Linked | ⚠️ Separate | ✅ In-file | ❌ | ⚠️ Manual |
| Assembly templates | ✅ | ❌ | ❌ | ✅ | ❌ |
| Pipeline status | ✅ | ⚠️ ELN | ❌ | ❌ | ⚠️ Manual |
| Strain lineage | ✅ | ✅ | ❌ | ❌ | ⚠️ Manual |
| Part library | ✅ | ✅ | ✅ | ✅ | ❌ |
| Self-hosted | ✅ | ❌ (SaaS) | ✅ (desktop) | ❌ (SaaS) | ✅ |
| Open source | ✅ MIT | ❌ | ❌ | ❌ | N/A |
| Price | Free | $$$$ | $495/yr | Enterprise | Free |
| Works from Russia | ✅ | ⚠️ | ✅ | ❌ | ✅ |

---

## 11. Naming and Identity

**Name:** PlasmidVCS (working title)

**Alternatives considered:**
- `pvcs` — short CLI command
- `GenTrack` — generic
- `ConstructHub` — too close to GitHub
- `BioVCS` — too broad
- `PlasmidGit` — misleading (not git-based)

**CLI command:** `pvcs`

**Tagline:** "Version control for genetic constructs"

**License:** MIT (maximally permissive for adoption)

---

## 12. Open Questions

1. **Circular alignment origin:** How to handle rotated sequences that are biologically identical? Option: anchor on ori, or on the first annotated feature.

2. **Large construct support:** Chromosomal integration cassettes can be >20 kb. Alignment performance for large sequences needs benchmarking.

3. **SnapGene .dna format:** Proprietary binary. BioPython doesn't read it natively. Options: (a) require GenBank export, (b) reverse-engineer format, (c) use snapgene_reader Python package.

4. **Collaboration model:** For Phase 4, do we use git as transport (store .pvcs/ in a git repo) or build custom sync?

5. **GenBank feature standardization:** Lab members annotate inconsistently ("CDS" vs "gene", "promoter" vs "regulatory"). Need normalization rules.

---

## Appendix A: Example Data Model for Igor's Lab

### Current constructs to track:

| Construct | Status | Variants |
|-----------|--------|----------|
| P43_Cas_Uni_Tr | Active | original, polycistronic, GoldenGate, dual-guide-pepA, dual-guide-glaA |
| pEXP-glaA-XynTL | Design | WT, Q158R, TlXyn10A-transplant |
| pEXP-glaA-XynTA | Design | WT |
| pEXP-glaA-PhyPL | Design | WT, V34C/A380C, double-SS |
| pEXP-glaA-ChyM | Active (EFKO) | camel chymosin v1 |
| pHDR-pepA | Active | pyrG donor cassette |
| pHDR-glaA | Planned | landing pad cassette |
| gRNA-pepA | Ordered (Vazyme) | synthetic cassette |
| gRNA-glaA | Planned | synthetic cassette |

### Current strains:

| Strain | Genotype | Parent |
|--------|----------|--------|
| AN-001 | CBS 513.88 wild type | — |
| AN-002 | ΔkusA::amdS | AN-001 |
| AN-003 | ΔkusA pyrG⁻ | AN-002 |
| AN-004 | ΔkusA ΔpepA pyrG⁻ | AN-003 |

### Part library (initial):

| Part | Type | Source |
|------|------|--------|
| PglaA | promoter | A. niger CBS 513.88 |
| PgpdA | promoter | A. nidulans |
| TtrpC | terminator | A. nidulans |
| TglaA | terminator | A. niger |
| pyrG_Af | marker | A. fumigatus U35436 |
| hygR | marker | E. coli |
| amdS | marker | A. nidulans |
| Cas9_opt | CDS | S. pyogenes (codon-opt A. niger) |
| ama1 | replicator | A. nidulans |
| landing_pad_pepA | synthetic target | designed |
| landing_pad_glaA | synthetic target | designed |

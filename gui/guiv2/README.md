# PlasmidVCS

Version control for genetic constructs.

---

## The problem

Every molecular biology lab has this:

```
constructs/
├── P43_Cas_v2_final.gb
├── P43_Cas_v2_final_igor.gb
├── P43_Cas_v2_final_igor_FIXED.gb
├── P43_Cas_v2_polycistronic_NEW.gb
├── P43_Cas_old_dont_use.gb
└── which_one_is_current.xlsx
```

Dozens of plasmid files, no clear history of what changed between them, no link to the strains they produced, no way to search across all constructs for a specific feature or restriction site.

PlasmidVCS fixes this.

## What it does

**Semantic diffs** — not "line 47 changed", but:

```
$ pvcs diff pEXP-XynTL:1.0 pEXP-XynTL:1.1

  CONSTRUCT: pEXP-glaA-XynTL
  ─────────────────────────────────────
  v1.0 → v1.1  |  1 change  |  +0 bp
  
  1. POINT MUTATION pos 2847 (CDS:XynTL, codon 158)
     CAG → CGG
     Q158R (Gln → Arg)
     
  Summary: 1 coding mutation in XynTL
```

**Construct history** — full revision log with commit messages:

```
$ pvcs log pEXP-glaA-XynTL

  pEXP-glaA-XynTL (8,432 bp, circular)
  ├── v1.0  2026-03-01  Igor  TaXyn10A wild-type in glaA expression vector
  ├── v1.1  2026-03-15  Igor  Q158R thermostability mutation (Souza 2016)
  └── variant: TlXyn10A-transplant
      └── v1.0  2026-03-20  Igor  Subsite +2/+4 mutations from TlXyn10A_P
```

**Variant branching** — track parallel versions of a construct:

```
$ pvcs tree P43_Cas_Uni_Tr

  P43_Cas_Uni_Tr
  ├── v1.0 — original (single guide, hygR)
  ├── v1.1 — BsaI domestication
  ├── variant: polycistronic
  │   ├── v1.0 — dual-guide tRNA cassette
  │   └── v1.1 — Golden Gate swap
  └── variant: dual-guide-pepA
      └── v1.0 — guides targeting pepA
```

**Strain lineage** — link strains to the constructs that made them:

```
$ pvcs strain tree AN-004

  AN-001 CBS 513.88 (wild type)
  └── AN-002 ΔkusA::amdS
      └── AN-003 ΔkusA pyrG⁻  ← P43_Cas:v1.1
          └── AN-004 ΔkusA ΔpepA pyrG⁻  ← P43_Cas/dual-guide-pepA:v1.0
```

**Part library** — reusable genetic elements linked across constructs:

```
$ pvcs part list

  PROMOTERS
    PglaA     850 bp  A. niger    used in: 4 constructs
    PgpdA     540 bp  A. nidulans used in: 1 construct
  TERMINATORS
    TtrpC     740 bp  A. nidulans used in: 5 constructs
  MARKERS
    pyrG_Af   966 bp  A. fumigatus used in: 2 constructs
    hygR     1026 bp  E. coli      used in: 1 construct
```

**Search** — find features and restriction sites across all constructs:

```
$ pvcs search "BsaI"

  Found BsaI (GGTCTC) in 3 constructs:
    P43_Cas_Uni_Tr v1.0     pos 1446 (fwd) ← domesticated in v1.1
    pEXP-glaA-XynTL v1.0    pos 234 (fwd), pos 8100 (rev)
    pHDR-pepA v1.0           pos 45 (fwd), pos 2300 (fwd)
```

## Installation

```bash
pip install plasmidvcs
```

Or from source:

```bash
git clone https://github.com/isinelnikov/plasmidvcs.git
cd plasmidvcs
pip install -e .
```

## Quick start

```bash
# Create a project
pvcs init "My Expression Platform"

# Import your first construct
pvcs import P43_Cas.gb --name "P43_Cas_Uni_Tr" \
    --message "Cas9 plasmid from Nødvig lab" \
    --tags "CRISPR,hygR,ama1"

# Edit in SnapGene, export as .gb, commit the change
pvcs commit P43_Cas_v2.gb --version 1.1 \
    --message "Domesticated internal BsaI site (A→G pos 1446)"

# See what changed
pvcs diff P43_Cas_Uni_Tr:1.0 P43_Cas_Uni_Tr:1.1

# Create a variant
pvcs variant P43_Cas_Uni_Tr --name "polycistronic" \
    --from-version 1.1 \
    --message "Dual-guide Golden Gate version"
```

## How it stores data

```
your-project/
├── .pvcs/                     # PlasmidVCS data (like .git/)
│   ├── config.json
│   ├── database.sqlite
│   └── objects/               # immutable .gb snapshots
│       ├── a3f2c8d4...gb
│       └── ...
├── constructs/                # working directory
│   ├── P43_Cas_Uni_Tr.gb
│   └── pEXP-glaA-XynTL.gb
├── parts/                     # reusable genetic parts
│   └── promoters/PglaA.gb
└── strains/                   # strain registry
    └── AN-004.yaml
```

The `.pvcs/` folder is self-contained. You can put the whole project in a git repo for backup and collaboration.

## Requirements

- Python 3.11+
- BioPython ≥ 1.83

## License

MIT

## Author

Igor Sinelnikov — Laboratory of Expression Systems Development, FRC Biotechnology RAS

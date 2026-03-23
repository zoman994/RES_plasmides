# GUI_SPEC.md — PlasmidVCS Streamlit Web Interface

## Task

Build a Streamlit web application for PlasmidVCS. The CLI backend (`src/pvcs/`) is fully working (72/72 tests pass). The GUI wraps existing Python functions — NO new business logic needed, just UI.

## Tech stack

- **Streamlit** >= 1.30 (pip install streamlit)
- **SVG rendering** for plasmid maps (generate SVG strings in Python, render via `st.html()` or `st.image()`)
- **Plotly** for interactive charts (optional, only if needed)
- **graphviz** for version trees (`st.graphviz_chart()`)
- **snapgene_reader** for .dna file import (already installed)
- **BioPython** (already a dependency)
- All existing `pvcs.*` modules — import and call directly

## File structure

```
gui/
├── app.py                 ← Streamlit entry point (multipage)
├── pages/
│   ├── 01_dashboard.py    ← Project overview, recent constructs
│   ├── 02_construct.py    ← Single construct view: map + features + history
│   ├── 03_diff.py         ← Visual diff between two revisions
│   ├── 04_strains.py      ← Strain lineage DAG
│   ├── 05_parts.py        ← Part library browser
│   ├── 06_primers.py      ← Primer registry
│   ├── 07_assembly.py     ← Assembly pipeline status
│   └── 08_import.py       ← Import .gb / .dna files
├── components/
│   ├── plasmid_map.py     ← SVG circular + linear map renderer
│   ├── diff_view.py       ← Diff visualization component
│   ├── version_tree.py    ← Graphviz version/variant tree
│   └── feature_table.py   ← Feature list with colors
└── style.css              ← Custom CSS overrides
```

## How to run

```bash
cd plasmidvcs
streamlit run gui/app.py -- --project /path/to/.pvcs/parent/dir
```

The `--project` argument is passed via `sys.argv` or `st.session_state`. On first load, if no project path given, show a directory picker or default to current dir.

## Core API usage

Import pvcs modules directly. All functions accept `project_root: Path` parameter. Store project root in `st.session_state.project_root`.

```python
from pathlib import Path
from pvcs import database as db, revision, diff, assembly, parts, strains, search, export, overlap, primers
from pvcs.config import db_path, find_project_root
from pvcs.parser import parse_genbank
from pvcs.diff import semantic_diff
from pvcs.models import *

# Get DB connection
root = st.session_state.project_root
conn = db.get_connection(db_path(root))

# List all constructs
constructs = db.list_constructs(conn)

# Get latest revision with features
rev = db.get_latest_revision(conn, construct.id)

# Diff between two revisions
result = semantic_diff(rev_a, rev_b)  # returns SemanticDiff with .changes list

# Close connection after use
conn.close()
```

## Page specifications

### Page 1: Dashboard (01_dashboard.py)

**Layout:** Wide mode (`st.set_page_config(layout="wide")`)

**Content:**
- Project name + stats bar: total constructs, total strains, total parts, total primers
- **Construct grid**: `st.columns(3)` — each construct as a card:
  - Mini circular SVG map (200×200px, from `components/plasmid_map.py`)
  - Construct name (bold)
  - Size in bp, feature count
  - Latest version + date
  - Click → navigate to construct page (`st.query_params`)
- Below: recent activity log (last 10 revisions across all constructs)

**Data source:**
```python
constructs = db.list_constructs(conn)
for c in constructs:
    rev = db.get_latest_revision(conn, c.id)
    # render card
```

### Page 2: Construct View (02_construct.py)

**Layout:** Two columns — left (60%) map + features, right (40%) history

**Left column:**
- **Circular plasmid map** (SVG, ~500px diameter)
  - Features as colored arcs: CDS=#F5A623 (orange), promoter=#E0E0E0, terminator=#CC0000, rep_origin=#FFD700, marker/CDS(resistance)=#31AF31, reporter=#00CC66
  - Feature names on arcs
  - Center text: construct name + "N bp"
  - Scale ticks every 1000 bp
- **Feature table** below: sortable table with columns: Type, Name, Start, End, Strand, Length
  - Color dots matching map colors
  - Type badges with icons

**Right column:**
- **Version history** as vertical timeline:
  - Each version: version number, date, author, message, bp delta badge
  - Mini circular map thumbnail (80×80px) per version
  - "Compare" button next to each pair → opens diff page
- **Variant tree**: graphviz DAG showing all variants as branches
- **RE sites summary**: table of restriction sites found (from `utils.find_re_sites`)

**Construct selector:** `st.selectbox` at top with all constructs. URL param `?construct=NAME` for direct links.

### Page 3: Diff View (03_diff.py)

THE MOST IMPORTANT PAGE. This is the core value prop of PlasmidVCS.

**Layout:** Wide, three sections top-to-bottom.

**Section 1: Header**
- Two `st.selectbox` side by side: construct A (+ version), construct B (+ version)
- "Compare" button
- Summary badge: "N changes, ±M bp"

**Section 2: Side-by-side circular maps**
- `st.columns(2)` — map A (left), map B (right)
- Both maps same scale (max of two sizes)
- Shared features: normal colors
- Added features (in B, not A): bright green arcs with + badge
- Removed features (in A, not B): red arcs with − badge  
- Modified features: amber/yellow arcs with ~ badge
- Legend below maps

**Section 3: Change list**
- Expandable sections grouped by feature:
  - Group header: "CDS:Cas9 — 3 changes" or "promoter:gpdA — 12 changes"
  - Each change: type badge (point_mutation=blue, insertion=green, deletion=red, replacement=amber), position, description
  - For point mutations in CDS: show amino acid change prominently: "Q158R (Gln→Arg)"
- Summary stats: pie chart of change types
- "Export diff report" button → generates HTML via `export.export_html`

**Implementation:**
```python
result = semantic_diff(rev_a, rev_b)
for change in result.changes:
    # change.type, change.position_a, change.description, change.affected_feature
```

### Page 4: Strains (04_strains.py)

- Strain lineage as graphviz directed graph
- Each node: strain ID + name + status badge (active/retired)
- Edges: transformation method labels
- Sidebar: strain details when clicked
- "Add strain" form

**Data source:** `strains.list_strains()`, `strains.get_strain_tree()`

### Page 5: Parts Library (05_parts.py)

- Card grid or table view (toggle)
- Filter by type (CDS, promoter, terminator, marker, etc.)
- Search box
- Each part: name, type badge, length, organism, usage count
- Mini linear map per part (colored bar)

**Data source:** `parts.list_parts()`, `parts.find_part_usage()`

### Page 6: Primers (06_primers.py)

- Table: name, sequence, Tm_binding, Tm_full, GC%, direction, vendor
- Filter by direction, vendor
- "Check reuse" tool: input construct → show which existing primers match
- Link to assembly operations

### Page 7: Assembly Pipeline (07_assembly.py)

- Kanban-style columns or table with status badges:
  - design → primers_ordered → pcr → assembly → transform → screen → verified
- Each card: construct name, method, fragment count, status
- Click → expand details: fragment list, overlap zones, linked primers
- Status update buttons

**Data source:** `assembly.list_assemblies()`, `assembly.update_status()`

### Page 8: Import (08_import.py)

- `st.file_uploader` accepting .gb, .gbk, .dna, .fasta
- For .dna files: convert via snapgene_reader → GenBank → pvcs parser
- Preview: show parsed features + sequence length before import
- Construct name input (auto-filled from filename)
- Import message
- Tags input
- "Import" button → calls `revision.import_construct()`

## Component: Circular Plasmid Map (components/plasmid_map.py)

This is the key visual component. Generate SVG strings in Python.

### Function signature
```python
def render_circular_map(
    features: list[Feature],
    sequence_length: int,
    construct_name: str = "",
    size: int = 500,          # SVG width/height in px
    show_labels: bool = True,
    show_scale: bool = True,
    highlight_features: dict[str, str] | None = None,  # feature_name → color override
) -> str:
    """Return SVG string for a circular plasmid map."""
```

### SVG structure
```
<svg viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background circle (backbone) -->
  <circle cx="{cx}" cy="{cy}" r="{radius}" fill="none" stroke="#666" stroke-width="2"/>
  
  <!-- Features as arcs -->
  <!-- For each feature: colored arc from start_angle to end_angle -->
  <!-- Use <path d="M... A..."/> with SVG arc commands -->
  
  <!-- Feature labels on leader lines -->
  
  <!-- Center text: construct name + bp -->
  
  <!-- Scale ticks every 1000 bp -->
</svg>
```

### Arc calculation
```python
import math

def _bp_to_angle(bp_position: int, total_length: int) -> float:
    """Convert bp position to angle in radians. 0 bp = 12 o'clock (top)."""
    return (bp_position / total_length) * 2 * math.pi - math.pi / 2

def _arc_path(cx, cy, radius, start_angle, end_angle, width=12):
    """Generate SVG path for an arc segment."""
    # Inner and outer radius
    r_inner = radius - width / 2
    r_outer = radius + width / 2
    # ... standard SVG arc path calculation
```

### Color scheme (de facto standard from SnapGene)
```python
FEATURE_COLORS = {
    "CDS": "#F5A623",           # orange
    "gene": "#F5A623",
    "promoter": "#B0B0B0",      # gray
    "terminator": "#CC0000",    # red
    "rep_origin": "#FFD700",    # gold
    "misc_feature": "#6699CC",  # blue-gray
    "regulatory": "#9B59B6",    # purple
    "misc_RNA": "#E74C3C",      # bright red
    "repeat_region": "#95A5A6", # silver
    "protein_bind": "#1ABC9C",  # teal
    "RBS": "#E67E22",           # dark orange
    "enhancer": "#27AE60",      # green
    "source": "#BDC3C7",        # light gray
    "primer_bind": "#3498DB",   # blue
    "mRNA": "#F39C12",          # amber
}

# Selection markers get green regardless of feature type
MARKER_KEYWORDS = {"hygr", "ampr", "kanr", "amds", "pyrg", "hph", "ble", "nat"}
```

For features where name.lower() matches any MARKER_KEYWORDS: use #31AF31 (green).

### Mini map variant
```python
def render_mini_map(features, sequence_length, size=80) -> str:
    """Render a small thumbnail circular map (no labels, no scale)."""
```

## Component: Diff View (components/diff_view.py)

### Side-by-side maps
```python
def render_diff_maps(
    rev_a: Revision,
    rev_b: Revision,
    diff_result: SemanticDiff,
    size: int = 400,
) -> tuple[str, str]:
    """Return (svg_a, svg_b) with diff highlighting."""
```

Logic:
1. Find features unique to A (removed) → red
2. Find features unique to B (added) → green  
3. Find features in both with changes → amber
4. Unchanged features → normal colors

### Change summary grouped by feature
```python
def group_changes_by_feature(changes: list[Change]) -> dict[str, list[Change]]:
    """Group changes by affected_feature. None → 'backbone'."""
```

## Component: Version Tree (components/version_tree.py)

```python
def render_version_tree(
    construct: Construct,
    revisions: list[Revision],
    variants: list[Construct],
    conn,  # for getting variant revisions
) -> str:
    """Return graphviz DOT string for the version/variant tree."""
```

Each node: `"{version}\n{date}\n{message[:30]}"` with shape=box, rounded corners.
Variant branches: different colors per variant.

## Styling

### CSS overrides (style.css)
```css
/* Clean, professional biotech look */
[data-testid="stSidebar"] { background: #1a1a2e; }
.stApp { background: #f8f9fa; }

/* Feature type badges */
.badge-cds { background: #F5A623; color: white; padding: 2px 8px; border-radius: 10px; }
.badge-promoter { background: #B0B0B0; color: white; padding: 2px 8px; border-radius: 10px; }
.badge-terminator { background: #CC0000; color: white; padding: 2px 8px; border-radius: 10px; }
.badge-marker { background: #31AF31; color: white; padding: 2px 8px; border-radius: 10px; }

/* Diff change type badges */
.change-point_mutation { background: #3498DB; color: white; }
.change-insertion { background: #27AE60; color: white; }
.change-deletion { background: #E74C3C; color: white; }
.change-replacement { background: #F39C12; color: white; }
```

### Color palette
- Primary: #0066CC (professional blue)
- Accent: #00897B (teal)
- Background: #f8f9fa
- Card background: #ffffff
- Text: #2c3e50
- Muted: #7f8c8d

## Implementation priority

Build in this order — each step produces a testable page:

1. **components/plasmid_map.py** — circular SVG renderer. Test with P4 (7.6 kb, simple) and P1 (13.5 kb, complex). This is the visual foundation.
2. **app.py** — multipage Streamlit skeleton with sidebar navigation
3. **pages/08_import.py** — file upload + import. Enables loading data.
4. **pages/01_dashboard.py** — construct grid with mini maps
5. **pages/02_construct.py** — single construct view with full map + features + history
6. **pages/03_diff.py** — THE KEY PAGE. Side-by-side maps + change list.
7. **components/version_tree.py** + integration into construct page
8. **pages/04_strains.py** — strain lineage
9. **pages/05_parts.py** — parts library
10. **pages/06_primers.py** — primer registry
11. **pages/07_assembly.py** — assembly pipeline

## Testing data

Use these real plasmids for visual testing (already imported as .gb):

- **P4_pAnigerRandom_CChym** (7,597 bp) — small, clear features: glaA_ss, Chym, HygroR. Good for map development.
- **P42_pGAP_AMY** vs **P42_pGAP_BGII** — same backbone, different CDS. Perfect for diff testing (1153 synonym replacements).
- **P1_TrichCas** vs **P41_angCAS** — CRISPR vectors for different hosts. Diff shows tRNA-Leu insertion (+192 bp).
- **P35_GA_GFP_Amds** (13,084 bp) — largest with GFP reporter. Good for testing map readability at scale.

## Key Streamlit patterns

```python
# Multipage navigation
st.set_page_config(page_title="PlasmidVCS", layout="wide", page_icon="🧬")

# Session state for project root
if "project_root" not in st.session_state:
    st.session_state.project_root = Path(".")

# Render SVG
svg_string = render_circular_map(rev.features, rev.length, construct.name)
st.html(f'<div style="text-align:center">{svg_string}</div>')

# Navigation between pages
st.query_params["construct"] = construct.name
# Read: construct_name = st.query_params.get("construct")

# File uploader
uploaded = st.file_uploader("Import GenBank/SnapGene", type=["gb", "gbk", "dna", "fasta"])
```

## Constraints

- Do NOT add FastAPI or any web server — Streamlit IS the server
- Do NOT use React components or npm — pure Python + SVG
- Do NOT modify any existing `src/pvcs/` code — only import and use
- SVG maps must work without JavaScript — pure SVG elements
- All state via `st.session_state` — no external session stores
- The app must work with an existing .pvcs project directory

"""Data models for PlasmidVCS.

All core entities are defined here as dataclasses.
See CLAUDE.md for field descriptions.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


@dataclass
class Project:
    id: str = field(default_factory=_new_id)
    name: str = ""
    description: str = ""
    created_at: str = field(default_factory=_now)


@dataclass
class Construct:
    id: str = field(default_factory=_new_id)
    name: str = ""
    description: str = ""
    topology: str = "circular"  # "circular" | "linear"
    project_id: str = ""
    parent_id: str | None = None  # for variants: points to parent construct
    tags: list[str] = field(default_factory=list)
    created_at: str = field(default_factory=_now)


@dataclass
class Feature:
    """A single annotated feature on a sequence."""

    type: str = ""        # "CDS", "promoter", "terminator", "gene", "misc_feature"
    name: str = ""        # "Cas9", "PglaA", "hygR"
    start: int = 0        # 1-based, inclusive
    end: int = 0          # 1-based, inclusive
    strand: int = 1       # 1 or -1
    qualifiers: dict = field(default_factory=dict)
    sequence: str = ""    # nucleotide sequence of this feature
    part_id: str | None = None
    color: str | None = None


@dataclass
class Revision:
    """Immutable snapshot of a construct at a point in time."""

    id: str = field(default_factory=_new_id)
    construct_id: str = ""
    version: str = ""     # "1.0", "1.1", "2.0"
    sequence: str = ""    # full nucleotide sequence
    features: list[Feature] = field(default_factory=list)
    length: int = 0
    message: str = ""     # commit message
    author: str = ""
    parent_revision_id: str | None = None
    genbank_path: str | None = None
    checksum: str = ""    # SHA-256 of sequence
    created_at: str = field(default_factory=_now)


@dataclass
class Change:
    """A single semantic change between two revisions."""

    type: str = ""
    # Types: "point_mutation", "insertion", "deletion",
    #        "replacement", "feature_added", "feature_removed",
    #        "feature_modified", "inversion"

    position_a: int = 0   # position in revision A
    position_b: int = 0   # position in revision B
    length_a: int = 0     # affected length in A
    length_b: int = 0     # affected length in B

    affected_feature: str | None = None  # "CDS:Cas9" or "promoter:PglaA"
    description: str = ""               # human-readable

    sequence_a: str = ""  # original sequence at this position
    sequence_b: str = ""  # new sequence at this position


@dataclass
class SemanticDiff:
    """Result of comparing two revisions."""

    revision_a_id: str = ""
    revision_b_id: str = ""
    construct_name: str = ""
    version_a: str = ""
    version_b: str = ""
    changes: list[Change] = field(default_factory=list)
    summary: str = ""


@dataclass
class Part:
    """Reusable genetic element in the part library."""

    id: str = field(default_factory=_new_id)
    name: str = ""        # "PglaA"
    type: str = ""        # "promoter", "terminator", "CDS", "marker", "other"
    sequence: str = ""
    organism: str = ""
    description: str = ""
    source: str = ""
    references: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)


@dataclass
class Strain:
    """A strain in the registry. Stored as YAML, not in SQLite."""

    id: str = ""          # "AN-004"
    name: str = ""        # "A. niger CBS 513.88 ΔkusA ΔpepA pyrG⁻"
    species: str = ""
    parent_id: str | None = None
    genotype: dict = field(default_factory=dict)
    construct_id: str | None = None
    revision_id: str | None = None
    method: str = ""      # "PEG-protoplast"
    verified: bool = False
    storage_location: str = ""
    notes: str = ""
    created_at: str = field(default_factory=_now)


@dataclass
class Milestone:
    """Named tag on a revision."""

    id: str = field(default_factory=_new_id)
    revision_id: str = ""
    name: str = ""        # "sent-to-Vazyme", "transformed-AN004"
    description: str = ""
    created_at: str = field(default_factory=_now)


# --- Assembly Engine Models ---


@dataclass
class OverlapZone:
    """Junction between two fragments in an assembly."""

    sequence: str = ""
    length: int = 0
    tm: float = 0.0           # nearest-neighbor Tm
    gc_percent: float = 0.0
    position_in_construct: int = 0
    overhang: str | None = None   # 4-nt overhang for Golden Gate
    enzyme: str | None = None     # "BsaI", "BbsI"


@dataclass
class Fragment:
    """A piece of an assembly — knows its origin."""

    id: str = field(default_factory=_new_id)
    order: int = 0            # position in assembly (1, 2, 3...)
    name: str = ""            # "PglaA", "XynTL_Q158R", "TtrpC"

    # Source provenance
    source_type: str = ""     # "construct" | "part" | "synthesis" | "pcr_product" | "oligo"
    source_construct_id: str | None = None
    source_revision_id: str | None = None
    source_part_id: str | None = None
    source_description: str | None = None  # "Vazyme order #2026-03-15"

    # Position in final construct
    start: int = 0
    end: int = 0

    # Overlap zones
    overlap_left: OverlapZone | None = None
    overlap_right: OverlapZone | None = None


@dataclass
class Primer:
    """A primer linked to assembly operations."""

    id: str = field(default_factory=_new_id)
    name: str = ""            # "fwd_PglaA_OL"
    sequence: str = ""        # full primer including tail

    # Binding region (3' end)
    binding_start: int = 0
    binding_end: int = 0
    binding_sequence: str = ""
    tm_binding: float = 0.0

    # Tail (5' end — overlap / RE site / tag)
    tail_sequence: str = ""
    tail_purpose: str = ""    # "overlap with XynTL", "BsaI site + overhang"
    tm_full: float = 0.0

    # Properties
    gc_percent: float = 0.0
    length: int = 0
    direction: str = ""       # "forward" | "reverse"

    # Tracking
    used_in: list[dict] = field(default_factory=list)
    vendor: str | None = None     # "IDT", "Evrogen", "Syntol"
    order_date: str | None = None
    tags: list[str] = field(default_factory=list)


@dataclass
class AssemblyOperation:
    """Records HOW a construct revision was built."""

    id: str = field(default_factory=_new_id)
    revision_id: str = ""     # the revision this produced
    method: str = ""          # "overlap_pcr","gibson","golden_gate",
                              # "restriction_ligation","crispr_hdr",
                              # "site_directed_mutagenesis","synthesis","other"
    fragments: list[Fragment] = field(default_factory=list)
    primer_ids: list[str] = field(default_factory=list)
    status: str = "design"    # "design","primers_ordered","pcr","assembly",
                              # "transform","screen","verified"
    notes: str = ""
    created_at: str = field(default_factory=_now)


@dataclass
class TemplateSlot:
    """A slot in an assembly template."""

    position: int = 0         # 1, 2, 3...
    name: str = ""            # "Promoter", "CDS", "Terminator"
    type_constraint: str = "" # "promoter" | "CDS" | "terminator" | "any"
    fixed: bool = False       # True = always same part
    default_part_id: str | None = None


@dataclass
class AssemblyTemplate:
    """Reusable blueprint for common assembly patterns."""

    id: str = field(default_factory=_new_id)
    name: str = ""            # "glaA expression cassette"
    method: str = ""          # "overlap_pcr" | "gibson" | etc.
    description: str = ""
    slots: list[TemplateSlot] = field(default_factory=list)
    overlap_length: int = 22
    backbone_part_id: str | None = None
    created_at: str = field(default_factory=_now)


# --- Multi-step Assembly Plan Models ---


@dataclass
class Junction:
    """How two adjacent fragments connect in an assembly step."""

    id: str = field(default_factory=_new_id)
    left_input_order: int = 0
    right_input_order: int = 0

    junction_type: str = ""  # "overlap", "overhang_4nt", "sticky_end", "blunt", "phosphorylation"

    # Overlap-based (overlap PCR, Gibson)
    overlap_sequence: str | None = None
    overlap_length: int | None = None
    overlap_tm: float | None = None
    overlap_gc: float | None = None

    # Golden Gate
    overhang_4nt: str | None = None
    enzyme: str | None = None

    # Restriction/ligation
    enzyme_name: str | None = None
    end_type: str | None = None  # "5prime_overhang", "3prime_overhang", "blunt"

    # Overlap mode: how tail is distributed between the two primers at this junction
    overlap_mode: str = "split"  # "split", "left_only", "right_only", "none"

    warnings: list[str] = field(default_factory=list)


@dataclass
class AssemblyInput:
    """One input fragment for an assembly step."""

    id: str = field(default_factory=_new_id)
    order: int = 0
    name: str = ""

    source_type: str = ""  # "part", "construct", "sequence", "previous_step", "digest"
    source_part_id: str | None = None
    source_construct_id: str | None = None
    source_revision_id: str | None = None
    source_feature_name: str | None = None
    source_step_id: str | None = None
    raw_sequence: str | None = None

    sequence: str = ""
    length: int = 0

    left_end: str | None = None
    right_end: str | None = None


@dataclass
class AssemblyStep:
    """One assembly operation within a multi-step plan."""

    id: str = field(default_factory=_new_id)
    plan_id: str = ""
    order: int = 0
    method: str = ""

    inputs: list[AssemblyInput] = field(default_factory=list)
    junctions: list[Junction] = field(default_factory=list)

    output_name: str = ""
    output_sequence: str | None = None
    output_length: int | None = None

    primers: list[Primer] = field(default_factory=list)

    status: str = "design"
    notes: str = ""


@dataclass
class AssemblyPlan:
    """Complete assembly plan — may contain multiple steps."""

    id: str = field(default_factory=_new_id)
    name: str = ""
    target_construct: str = ""
    steps: list[AssemblyStep] = field(default_factory=list)
    status: str = "design"
    created_at: str = field(default_factory=_now)
    notes: str = ""

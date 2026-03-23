"""Assembly engine: operations, fragment provenance, reassembly, templates, pipeline status."""

from __future__ import annotations

from pathlib import Path

from pvcs import database as db
from pvcs.config import db_path, find_project_root
from pvcs.models import (
    AssemblyOperation,
    AssemblyTemplate,
    Fragment,
    OverlapZone,
    TemplateSlot,
    _new_id,
    _now,
)
from pvcs.overlap import design_overlaps
from pvcs.parser import parse_genbank, write_genbank
from pvcs.utils import calc_tm, gc_content

VALID_METHODS = (
    "overlap_pcr", "gibson", "golden_gate",
    "restriction_ligation", "crispr_hdr",
    "site_directed_mutagenesis", "synthesis", "other",
)

VALID_STATUSES = (
    "design", "primers_ordered", "pcr", "assembly",
    "transform", "screen", "verified",
)


# ---------------------------------------------------------------------------
# Assembly operations
# ---------------------------------------------------------------------------

def record_assembly(
    revision_id: str,
    method: str,
    fragments: list[Fragment],
    primer_ids: list[str] | None = None,
    status: str = "design",
    notes: str = "",
    project_root: Path | None = None,
) -> AssemblyOperation:
    """Record an assembly operation for a revision."""
    if method not in VALID_METHODS:
        raise ValueError(f"Invalid method '{method}'. Must be one of {VALID_METHODS}")
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid status '{status}'. Must be one of {VALID_STATUSES}")

    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    op = AssemblyOperation(
        id=_new_id(),
        revision_id=revision_id,
        method=method,
        fragments=fragments,
        primer_ids=primer_ids or [],
        status=status,
        notes=notes,
    )

    db.insert_assembly_operation(conn, op)
    conn.close()
    return op


def get_assembly(
    revision_id: str,
    project_root: Path | None = None,
) -> AssemblyOperation | None:
    """Get assembly operation for a revision."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))
    op = db.get_assembly_operation(conn, revision_id)
    conn.close()
    return op


def update_status(
    construct_name: str,
    status: str,
    notes: str | None = None,
    project_root: Path | None = None,
) -> None:
    """Update assembly pipeline status for the latest revision of a construct."""
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid status '{status}'. Must be one of {VALID_STATUSES}")

    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    construct = db.get_construct_by_name(conn, construct_name)
    if not construct:
        conn.close()
        raise ValueError(f"Construct '{construct_name}' not found")

    rev = db.get_latest_revision(conn, construct.id)
    if not rev:
        conn.close()
        raise ValueError(f"No revisions found for '{construct_name}'")

    op = db.get_assembly_operation(conn, rev.id)
    if not op:
        conn.close()
        raise ValueError(f"No assembly operation found for '{construct_name}' latest revision")

    db.update_assembly_status(conn, op.id, status, notes)
    conn.close()


def list_assemblies(
    project_root: Path | None = None,
) -> list[dict]:
    """List all assembly operations with construct info (pipeline view)."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    ops = db.list_assembly_operations(conn)
    results = []
    for op in ops:
        rev = db.get_revision_by_id(conn, op.revision_id)
        if not rev:
            continue
        construct = db.get_construct_by_id(conn, rev.construct_id)
        if not construct:
            continue

        results.append({
            "construct_name": construct.name,
            "version": rev.version,
            "method": op.method,
            "fragments_count": len(op.fragments),
            "status": op.status,
            "notes": op.notes,
            "operation": op,
        })

    conn.close()
    return results


# ---------------------------------------------------------------------------
# Reassembly: swap a single fragment
# ---------------------------------------------------------------------------

def reassemble(
    construct_name: str,
    version: str,
    swap_fragment: int,
    new_source_file: str | Path,
    output_file: str | Path,
    project_root: Path | None = None,
) -> dict:
    """Swap a fragment in an existing assembly and generate new construct.

    Args:
        construct_name: Name of the construct to reassemble.
        version: Version with assembly metadata.
        swap_fragment: Fragment order number to swap (1-based).
        new_source_file: GenBank file with the new fragment sequence.
        output_file: Path for the output GenBank file.

    Returns:
        Dict with new sequence info and updated fragments.
    """
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    construct = db.get_construct_by_name(conn, construct_name)
    if not construct:
        conn.close()
        raise ValueError(f"Construct '{construct_name}' not found")

    rev = db.get_revision(conn, construct.id, version)
    if not rev:
        conn.close()
        raise ValueError(f"Version '{version}' not found")

    op = db.get_assembly_operation(conn, rev.id)
    if not op:
        conn.close()
        raise ValueError(f"No assembly operation for '{construct_name}:{version}'")

    # Find the fragment to swap
    target_frag = None
    for f in op.fragments:
        if f.order == swap_fragment:
            target_frag = f
            break
    if not target_frag:
        conn.close()
        raise ValueError(f"Fragment {swap_fragment} not found in assembly")

    # Parse new source
    new_seq, new_features, new_meta = parse_genbank(new_source_file)

    # Build new construct sequence
    old_seq = rev.sequence
    frag_start = target_frag.start - 1  # 0-based
    frag_end = target_frag.end

    new_construct_seq = old_seq[:frag_start] + new_seq + old_seq[frag_end:]

    # Update fragments list
    new_fragments = []
    offset = len(new_seq) - (frag_end - frag_start)
    for f in op.fragments:
        if f.order == swap_fragment:
            new_frag = Fragment(
                id=_new_id(),
                order=f.order,
                name=new_meta.get("name", f"new_fragment_{swap_fragment}"),
                source_type="pcr_product",
                source_description=str(new_source_file),
                start=frag_start + 1,
                end=frag_start + len(new_seq),
                overlap_left=f.overlap_left,
                overlap_right=f.overlap_right,
            )
            new_fragments.append(new_frag)
        elif f.order > swap_fragment:
            adjusted = Fragment(
                id=f.id,
                order=f.order,
                name=f.name,
                source_type=f.source_type,
                source_construct_id=f.source_construct_id,
                source_part_id=f.source_part_id,
                source_description=f.source_description,
                start=f.start + offset,
                end=f.end + offset,
                overlap_left=f.overlap_left,
                overlap_right=f.overlap_right,
            )
            new_fragments.append(adjusted)
        else:
            new_fragments.append(f)

    # Write output GenBank
    # Merge features: keep features outside swapped region, add new features
    kept_features = [
        f for f in rev.features
        if f.end <= frag_start + 1 or f.start > frag_end
    ]
    write_genbank(
        output_file, new_construct_seq,
        kept_features + new_features,
        name=construct.name,
        topology=construct.topology,
    )

    conn.close()
    return {
        "new_sequence_length": len(new_construct_seq),
        "swapped_fragment": swap_fragment,
        "old_fragment_length": frag_end - frag_start,
        "new_fragment_length": len(new_seq),
        "fragments": new_fragments,
        "output_file": str(output_file),
    }


# ---------------------------------------------------------------------------
# Assembly templates
# ---------------------------------------------------------------------------

def create_template(
    name: str,
    method: str,
    slots: list[dict],
    overlap_length: int = 22,
    description: str = "",
    backbone_part_id: str | None = None,
    project_root: Path | None = None,
) -> AssemblyTemplate:
    """Create a reusable assembly template.

    Args:
        slots: List of dicts like {"name": "Promoter", "type_constraint": "promoter",
               "fixed": True, "default_part_id": "..."}.
    """
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    template_slots = [
        TemplateSlot(
            position=i + 1,
            name=s["name"],
            type_constraint=s.get("type_constraint", "any"),
            fixed=s.get("fixed", False),
            default_part_id=s.get("default_part_id"),
        )
        for i, s in enumerate(slots)
    ]

    template = AssemblyTemplate(
        name=name,
        method=method,
        description=description,
        slots=template_slots,
        overlap_length=overlap_length,
        backbone_part_id=backbone_part_id,
    )

    db.insert_assembly_template(conn, template)
    conn.close()
    return template


def use_template(
    template_name: str,
    fill: dict[str, str | Path],
    output_file: str | Path,
    project_root: Path | None = None,
) -> dict:
    """Fill an assembly template and generate a new construct.

    Args:
        template_name: Name of the template.
        fill: Dict mapping slot name → GenBank file path for swappable slots.
        output_file: Output GenBank file path.

    Returns:
        Dict with assembly info.
    """
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    template = db.get_assembly_template(conn, template_name)
    if not template:
        conn.close()
        raise ValueError(f"Template '{template_name}' not found")

    # Collect sequences for each slot
    slot_sequences: list[tuple[str, list]] = []  # (sequence, features)
    for slot in template.slots:
        if slot.name in fill:
            seq, feats, _ = parse_genbank(fill[slot.name])
            slot_sequences.append((seq, feats))
        elif slot.default_part_id:
            part = db.get_part_by_id(conn, slot.default_part_id)
            if not part:
                conn.close()
                raise ValueError(f"Default part '{slot.default_part_id}' not found for slot '{slot.name}'")
            slot_sequences.append((part.sequence, []))
        else:
            conn.close()
            raise ValueError(f"Slot '{slot.name}' requires a file (not fixed, no default)")

    # Concatenate
    full_sequence = "".join(s for s, _ in slot_sequences)
    all_features = []
    offset = 0
    for seq, feats in slot_sequences:
        for f in feats:
            f.start += offset
            f.end += offset
        all_features.extend(feats)
        offset += len(seq)

    # Write output
    write_genbank(output_file, full_sequence, all_features, name="assembled", topology="circular")

    conn.close()
    return {
        "sequence_length": len(full_sequence),
        "template": template_name,
        "slots_filled": len(slot_sequences),
        "output_file": str(output_file),
    }


def list_templates(
    project_root: Path | None = None,
) -> list[AssemblyTemplate]:
    """List all assembly templates."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))
    result = db.list_assembly_templates(conn)
    conn.close()
    return result

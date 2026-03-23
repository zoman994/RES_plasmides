"""Primer registry: CRUD, Tm calculation, reuse detection, usage tracking."""

from __future__ import annotations

from pathlib import Path

from pvcs import database as db
from pvcs.config import db_path, find_project_root
from pvcs.models import Primer, _new_id
from pvcs.utils import calc_tm, gc_content, reverse_complement


def add_primer(
    name: str,
    sequence: str,
    binding_sequence: str = "",
    tail_sequence: str = "",
    tail_purpose: str = "",
    direction: str = "forward",
    vendor: str | None = None,
    order_date: str | None = None,
    tags: list[str] | None = None,
    salt_mm: float = 50.0,
    project_root: Path | None = None,
) -> Primer:
    """Register a new primer."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    full_seq = sequence.upper()
    if not binding_sequence:
        binding_sequence = full_seq
    if not tail_sequence and len(full_seq) > len(binding_sequence):
        tail_sequence = full_seq[:len(full_seq) - len(binding_sequence)]

    primer = Primer(
        id=_new_id(),
        name=name,
        sequence=full_seq,
        binding_sequence=binding_sequence.upper(),
        tail_sequence=tail_sequence.upper(),
        tail_purpose=tail_purpose,
        tm_binding=calc_tm(binding_sequence, salt_mm=salt_mm),
        tm_full=calc_tm(full_seq, salt_mm=salt_mm),
        gc_percent=round(gc_content(full_seq) * 100, 1),
        length=len(full_seq),
        direction=direction,
        vendor=vendor,
        order_date=order_date,
        tags=tags or [],
    )

    db.insert_primer(conn, primer)
    conn.close()
    return primer


def get_primer(name: str, project_root: Path | None = None) -> Primer | None:
    """Get a primer by name."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))
    primer = db.get_primer_by_name(conn, name)
    conn.close()
    return primer


def list_primers(project_root: Path | None = None) -> list[Primer]:
    """List all registered primers."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))
    result = db.list_primers(conn)
    conn.close()
    return result


def find_primers_for_part(
    part_name: str,
    project_root: Path | None = None,
) -> list[Primer]:
    """Find primers whose binding sequence matches a part."""
    from pvcs.parts import get_part

    root = project_root or find_project_root()
    part = get_part(part_name, root)
    if not part:
        return []

    all_primers = list_primers(root)
    part_seq = part.sequence.upper()
    part_rc = reverse_complement(part_seq)

    matches = []
    for p in all_primers:
        bind = p.binding_sequence.upper()
        if bind in part_seq or bind in part_rc:
            matches.append(p)
    return matches


def check_primer_reuse(
    construct_name: str,
    version: str | None = None,
    project_root: Path | None = None,
) -> list[dict]:
    """Check if any existing primers can be reused for a construct.

    Returns list of dicts: {primer, match_position, strand}.
    """
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    construct = db.get_construct_by_name(conn, construct_name)
    if not construct:
        conn.close()
        return []

    if version:
        rev = db.get_revision(conn, construct.id, version)
    else:
        rev = db.get_latest_revision(conn, construct.id)
    if not rev:
        conn.close()
        return []

    all_primers = db.list_primers(conn)
    seq = rev.sequence.upper()
    rc = reverse_complement(seq)

    matches = []
    for p in all_primers:
        bind = p.binding_sequence.upper()
        if not bind:
            continue

        # Check forward
        idx = seq.find(bind)
        if idx != -1:
            matches.append({
                "primer": p,
                "match_position": idx + 1,
                "strand": "fwd",
            })
            continue

        # Check reverse
        idx = rc.find(bind)
        if idx != -1:
            matches.append({
                "primer": p,
                "match_position": len(seq) - idx,
                "strand": "rev",
            })

    conn.close()
    return matches


def link_primer_to_operation(
    primer_name: str,
    operation_id: str,
    role: str = "",
    project_root: Path | None = None,
) -> None:
    """Record that a primer was used in an assembly operation."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    primer = db.get_primer_by_name(conn, primer_name)
    if not primer:
        conn.close()
        raise ValueError(f"Primer '{primer_name}' not found")

    db.insert_primer_usage(conn, primer.id, operation_id, role)
    conn.close()

"""Part library management.

Parts are reusable genetic elements (promoters, terminators, CDSs, markers).
Stored in SQLite + as .gb files in parts/<type>/.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from pvcs import database as db
from pvcs.config import db_path, find_project_root, parts_dir
from pvcs.models import Part, _new_id
from pvcs.parser import parse_genbank, write_genbank
from pvcs.utils import sequence_checksum


def add_part(
    genbank_file: str | Path,
    name: str,
    part_type: str,
    organism: str = "",
    description: str = "",
    source: str = "",
    references: list[str] | None = None,
    tags: list[str] | None = None,
    project_root: Path | None = None,
) -> Part:
    """Add a part to the library from a GenBank file."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    sequence, features, metadata = parse_genbank(genbank_file)

    part = Part(
        id=_new_id(),
        name=name,
        type=part_type,
        sequence=sequence,
        organism=organism,
        description=description or metadata.get("description", ""),
        source=source,
        references=references or [],
        tags=tags or [],
    )

    db.insert_part(conn, part)

    # Copy file to parts/<type>/
    dest_dir = parts_dir(root) / part_type
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{name}.gb"
    shutil.copy2(str(genbank_file), dest)

    conn.close()
    return part


def add_part_from_sequence(
    name: str,
    part_type: str,
    sequence: str,
    organism: str = "",
    description: str = "",
    project_root: Path | None = None,
) -> Part:
    """Add a part directly from a sequence string (no GenBank file needed)."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    part = Part(
        id=_new_id(),
        name=name,
        type=part_type,
        sequence=sequence.upper(),
        organism=organism,
        description=description,
    )
    db.insert_part(conn, part)

    # Write a GenBank file for the part
    dest_dir = parts_dir(root) / part_type
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{name}.gb"
    write_genbank(dest, part.sequence, [], name=name, topology="linear")

    conn.close()
    return part


def get_part(name: str, project_root: Path | None = None) -> Part | None:
    """Get a part by name."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))
    part = db.get_part_by_name(conn, name)
    conn.close()
    return part


def list_parts(
    part_type: str | None = None,
    project_root: Path | None = None,
) -> list[Part]:
    """List all parts, optionally filtered by type."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))
    result = db.list_parts(conn, part_type)
    conn.close()
    return result


def find_part_usage(
    part_name: str,
    project_root: Path | None = None,
) -> list[dict]:
    """Find all constructs that use a given part (by sequence match)."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    part = db.get_part_by_name(conn, part_name)
    if not part:
        conn.close()
        return []

    results = []
    constructs = db.list_constructs(conn)
    for c in constructs:
        rev = db.get_latest_revision(conn, c.id)
        if not rev:
            continue
        if part.sequence.upper() in rev.sequence.upper():
            results.append({
                "construct_name": c.name,
                "construct_id": c.id,
                "version": rev.version,
            })

    conn.close()
    return results

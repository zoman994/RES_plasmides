"""Revision management: import, commit, log, tree, variant operations."""

from __future__ import annotations

import shutil
from pathlib import Path

from pvcs import database as db
from pvcs.config import constructs_dir, db_path, find_project_root, load_config, objects_dir
from pvcs.diff import semantic_diff
from pvcs.models import Construct, Milestone, Project, Revision, SemanticDiff, _new_id, _now
from pvcs.parser import genbank_to_revision, parse_genbank, write_genbank
from pvcs.utils import sequence_checksum


def _get_conn(project_root: Path | None = None):
    root = project_root or find_project_root()
    return db.get_connection(db_path(root))


def _store_object(revision: Revision, project_root: Path | None = None) -> Path:
    """Copy the GenBank file to .pvcs/objects/ (content-addressed)."""
    root = project_root or find_project_root()
    obj_dir = objects_dir(root)
    short_hash = revision.checksum[:12]
    dest = obj_dir / f"{short_hash}.gb"

    if revision.genbank_path and Path(revision.genbank_path).exists():
        shutil.copy2(revision.genbank_path, dest)
    else:
        # Write from in-memory data
        write_genbank(dest, revision.sequence, revision.features, name=revision.version)

    return dest


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

def import_construct(
    genbank_file: str | Path,
    name: str | None = None,
    message: str = "",
    author: str | None = None,
    tags: list[str] | None = None,
    topology: str | None = None,
    project_root: Path | None = None,
) -> tuple[Construct, Revision]:
    """Import a GenBank file as a new construct (v1.0)."""
    root = project_root or find_project_root()
    conn = _get_conn(root)
    cfg = load_config(root)

    # Parse
    sequence, features, metadata = parse_genbank(genbank_file)

    # Project — get or create
    project = db.get_project(conn)
    if not project:
        project = Project(name=cfg.get("project_name", ""), description="")
        db.insert_project(conn, project)

    # Construct
    construct = Construct(
        name=name or metadata["name"],
        description=metadata.get("description", ""),
        topology=topology or metadata.get("topology", "circular"),
        project_id=project.id,
        tags=tags or [],
    )
    db.insert_construct(conn, construct)

    # Revision v1.0
    author = author or cfg.get("author", "")
    revision = Revision(
        construct_id=construct.id,
        version="1.0",
        sequence=sequence,
        features=features,
        length=len(sequence),
        message=message,
        author=author,
        checksum=sequence_checksum(sequence),
        genbank_path=str(genbank_file),
    )
    db.insert_revision(conn, revision)

    # Store object
    obj_path = _store_object(revision, root)

    # Copy to constructs/
    dest = constructs_dir(root) / f"{construct.name}.gb"
    shutil.copy2(str(genbank_file), dest)

    conn.close()
    return construct, revision


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------

def commit_revision(
    genbank_file: str | Path,
    construct_name: str,
    version: str,
    message: str = "",
    author: str | None = None,
    project_root: Path | None = None,
) -> tuple[Revision, SemanticDiff | None]:
    """Commit a new revision of an existing construct."""
    root = project_root or find_project_root()
    conn = _get_conn(root)
    cfg = load_config(root)

    construct = db.get_construct_by_name(conn, construct_name)
    if not construct:
        conn.close()
        raise ValueError(f"Construct '{construct_name}' not found")

    # Get previous revision
    prev = db.get_latest_revision(conn, construct.id)

    # Parse new file
    sequence, features, metadata = parse_genbank(genbank_file)
    author = author or cfg.get("author", "")

    revision = Revision(
        construct_id=construct.id,
        version=version,
        sequence=sequence,
        features=features,
        length=len(sequence),
        message=message,
        author=author,
        parent_revision_id=prev.id if prev else None,
        checksum=sequence_checksum(sequence),
        genbank_path=str(genbank_file),
    )
    db.insert_revision(conn, revision)

    # Store object
    _store_object(revision, root)

    # Update working copy
    dest = constructs_dir(root) / f"{construct.name}.gb"
    shutil.copy2(str(genbank_file), dest)

    # Auto-diff against previous
    diff_result = None
    if prev:
        diff_result = semantic_diff(prev, revision)
        diff_result.construct_name = construct.name

    conn.close()
    return revision, diff_result


# ---------------------------------------------------------------------------
# Variant
# ---------------------------------------------------------------------------

def create_variant(
    parent_construct_name: str,
    variant_name: str,
    from_version: str,
    message: str = "",
    project_root: Path | None = None,
) -> Construct:
    """Create a variant (branch) of a construct."""
    root = project_root or find_project_root()
    conn = _get_conn(root)

    parent = db.get_construct_by_name(conn, parent_construct_name)
    if not parent:
        conn.close()
        raise ValueError(f"Construct '{parent_construct_name}' not found")

    # Get the revision to branch from
    rev = db.get_revision(conn, parent.id, from_version)
    if not rev:
        conn.close()
        raise ValueError(f"Version '{from_version}' not found for '{parent_construct_name}'")

    project = db.get_project(conn)

    # Create variant construct
    variant = Construct(
        name=variant_name,
        description=message,
        topology=parent.topology,
        project_id=project.id if project else "",
        parent_id=parent.id,
        tags=list(parent.tags),
    )
    db.insert_construct(conn, variant)

    # Copy the revision as v1.0 of the variant
    variant_rev = Revision(
        construct_id=variant.id,
        version="1.0",
        sequence=rev.sequence,
        features=rev.features,
        length=rev.length,
        message=message or f"Branched from {parent_construct_name}:{from_version}",
        author=rev.author,
        parent_revision_id=rev.id,
        checksum=rev.checksum,
    )
    db.insert_revision(conn, variant_rev)
    _store_object(variant_rev, root)

    conn.close()
    return variant


# ---------------------------------------------------------------------------
# Log / Tree
# ---------------------------------------------------------------------------

def get_log(
    construct_name: str,
    project_root: Path | None = None,
) -> dict:
    """Get construct revision history.

    Returns dict with construct info and list of revisions.
    """
    root = project_root or find_project_root()
    conn = _get_conn(root)

    construct = db.get_construct_by_name(conn, construct_name)
    if not construct:
        conn.close()
        raise ValueError(f"Construct '{construct_name}' not found")

    revisions = db.list_revisions(conn, construct.id)
    variants = db.get_variants(conn, construct.id)

    conn.close()
    return {
        "construct": construct,
        "revisions": revisions,
        "variants": variants,
    }


def get_tree(
    construct_name: str,
    project_root: Path | None = None,
) -> dict:
    """Get full variant tree of a construct (recursive)."""
    root = project_root or find_project_root()
    conn = _get_conn(root)

    construct = db.get_construct_by_name(conn, construct_name)
    if not construct:
        conn.close()
        raise ValueError(f"Construct '{construct_name}' not found")

    def _build_tree(c: Construct) -> dict:
        revisions = db.list_revisions(conn, c.id)
        variants = db.get_variants(conn, c.id)
        return {
            "construct": c,
            "revisions": revisions,
            "variants": [_build_tree(v) for v in variants],
        }

    tree = _build_tree(construct)
    conn.close()
    return tree


# ---------------------------------------------------------------------------
# Tag (milestone)
# ---------------------------------------------------------------------------

def tag_revision(
    construct_name: str,
    version: str,
    tag_name: str,
    description: str = "",
    project_root: Path | None = None,
) -> Milestone:
    """Tag a revision with a milestone name."""
    root = project_root or find_project_root()
    conn = _get_conn(root)

    construct = db.get_construct_by_name(conn, construct_name)
    if not construct:
        conn.close()
        raise ValueError(f"Construct '{construct_name}' not found")

    rev = db.get_revision(conn, construct.id, version)
    if not rev:
        conn.close()
        raise ValueError(f"Version '{version}' not found")

    milestone = Milestone(
        revision_id=rev.id,
        name=tag_name,
        description=description,
    )
    db.insert_milestone(conn, milestone)

    conn.close()
    return milestone


# ---------------------------------------------------------------------------
# Diff (convenience wrapper)
# ---------------------------------------------------------------------------

def diff_revisions(
    spec_a: str,
    spec_b: str,
    project_root: Path | None = None,
) -> SemanticDiff:
    """Diff two revision specs like 'ConstructName:version'.

    Spec format: 'construct_name:version'
    """
    root = project_root or find_project_root()
    conn = _get_conn(root)

    def _parse_spec(spec: str) -> tuple[str, str]:
        if ":" not in spec:
            raise ValueError(f"Invalid spec '{spec}', expected 'name:version'")
        name, version = spec.rsplit(":", 1)
        return name, version

    name_a, ver_a = _parse_spec(spec_a)
    name_b, ver_b = _parse_spec(spec_b)

    c_a = db.get_construct_by_name(conn, name_a)
    c_b = db.get_construct_by_name(conn, name_b)
    if not c_a:
        raise ValueError(f"Construct '{name_a}' not found")
    if not c_b:
        raise ValueError(f"Construct '{name_b}' not found")

    rev_a = db.get_revision(conn, c_a.id, ver_a)
    rev_b = db.get_revision(conn, c_b.id, ver_b)
    if not rev_a:
        raise ValueError(f"Version '{ver_a}' not found for '{name_a}'")
    if not rev_b:
        raise ValueError(f"Version '{ver_b}' not found for '{name_b}'")

    result = semantic_diff(rev_a, rev_b)
    result.construct_name = name_a if name_a == name_b else f"{name_a} vs {name_b}"

    conn.close()
    return result

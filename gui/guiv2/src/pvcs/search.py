"""Full-text, feature, and restriction enzyme site search."""

from __future__ import annotations

from pathlib import Path

from pvcs import database as db
from pvcs.config import db_path, find_project_root
from pvcs.utils import find_re_sites


def search_features(
    query: str,
    project_root: Path | None = None,
) -> list[dict]:
    """Search features by name/type/qualifier across all latest revisions."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))
    results = db.search_features(conn, query)
    conn.close()
    return results


def search_sequence(
    query: str,
    project_root: Path | None = None,
) -> list[dict]:
    """Search for a DNA subsequence across all latest construct revisions."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    query_upper = query.upper()
    results = []

    constructs = db.list_constructs(conn)
    for c in constructs:
        rev = db.get_latest_revision(conn, c.id)
        if not rev:
            continue
        seq = rev.sequence.upper()
        pos = 0
        while True:
            idx = seq.find(query_upper, pos)
            if idx == -1:
                break
            results.append({
                "construct_name": c.name,
                "construct_id": c.id,
                "version": rev.version,
                "position": idx + 1,  # 1-based
                "strand": "fwd",
            })
            pos = idx + 1

    conn.close()
    return results


def search_re_sites(
    enzyme: str | None = None,
    project_root: Path | None = None,
) -> list[dict]:
    """Search for restriction enzyme sites across all latest revisions."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    results = []

    constructs = db.list_constructs(conn)
    for c in constructs:
        rev = db.get_latest_revision(conn, c.id)
        if not rev:
            continue
        sites = find_re_sites(rev.sequence, enzyme)
        for site in sites:
            site["construct_name"] = c.name
            site["construct_id"] = c.id
            site["version"] = rev.version
            results.append(site)

    conn.close()
    return results

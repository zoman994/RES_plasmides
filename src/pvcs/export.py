"""Export constructs: HTML report, GenBank, YAML."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from pvcs import database as db
from pvcs.config import db_path, find_project_root
from pvcs.models import Construct, Revision
from pvcs.parser import write_genbank
from pvcs.utils import format_bp


def export_genbank(
    construct_name: str,
    output: str | Path,
    version: str | None = None,
    project_root: Path | None = None,
) -> Path:
    """Export a construct revision as GenBank file."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    construct = db.get_construct_by_name(conn, construct_name)
    if not construct:
        raise ValueError(f"Construct '{construct_name}' not found")

    if version:
        rev = db.get_revision(conn, construct.id, version)
    else:
        rev = db.get_latest_revision(conn, construct.id)
    if not rev:
        raise ValueError(f"No revision found")

    out_path = Path(output)
    write_genbank(out_path, rev.sequence, rev.features,
                  name=construct.name, topology=construct.topology)
    conn.close()
    return out_path


def export_yaml(
    construct_name: str,
    output: str | Path,
    version: str | None = None,
    project_root: Path | None = None,
) -> Path:
    """Export construct metadata as YAML."""
    import yaml

    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    construct = db.get_construct_by_name(conn, construct_name)
    if not construct:
        raise ValueError(f"Construct '{construct_name}' not found")

    revisions = db.list_revisions(conn, construct.id)
    variants = db.get_variants(conn, construct.id)

    data = {
        "construct": {
            "name": construct.name,
            "description": construct.description,
            "topology": construct.topology,
            "tags": construct.tags,
        },
        "revisions": [
            {
                "version": r.version,
                "length": r.length,
                "message": r.message,
                "author": r.author,
                "checksum": r.checksum,
                "created_at": r.created_at,
                "features": [
                    {"type": f.type, "name": f.name,
                     "start": f.start, "end": f.end, "strand": f.strand}
                    for f in r.features
                ],
            }
            for r in revisions
        ],
        "variants": [v.name for v in variants],
    }

    out_path = Path(output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        yaml.dump(data, allow_unicode=True, sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )
    conn.close()
    return out_path


def export_html(
    construct_name: str,
    output: str | Path,
    project_root: Path | None = None,
) -> Path:
    """Export a full construct report as HTML."""
    root = project_root or find_project_root()
    conn = db.get_connection(db_path(root))

    construct = db.get_construct_by_name(conn, construct_name)
    if not construct:
        raise ValueError(f"Construct '{construct_name}' not found")

    revisions = db.list_revisions(conn, construct.id)
    variants = db.get_variants(conn, construct.id)
    latest = revisions[-1] if revisions else None

    # Build HTML
    html_parts = [
        "<!DOCTYPE html>",
        "<html><head>",
        f"<title>{construct.name} — PlasmidVCS Report</title>",
        "<style>",
        "body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; background: #fafafa; }",
        "h1 { color: #2c3e50; } h2 { color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 5px; }",
        "table { border-collapse: collapse; width: 100%; margin: 15px 0; }",
        "th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }",
        "th { background: #3498db; color: white; }",
        "tr:nth-child(even) { background: #f2f2f2; }",
        ".tag { background: #e8f4fd; color: #2980b9; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; margin-right: 4px; }",
        ".badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 0.85em; }",
        ".circular { background: #27ae60; color: white; }",
        ".linear { background: #e67e22; color: white; }",
        "</style>",
        "</head><body>",
        f"<h1>{construct.name}</h1>",
        f'<p><span class="badge {construct.topology}">{construct.topology}</span> ',
    ]

    if latest:
        html_parts.append(f"{format_bp(latest.length)}")
    html_parts.append("</p>")

    if construct.description:
        html_parts.append(f"<p>{construct.description}</p>")

    if construct.tags:
        html_parts.append("<p>Tags: " + " ".join(f'<span class="tag">{t}</span>' for t in construct.tags) + "</p>")

    # Revision history
    html_parts.append("<h2>Revision History</h2>")
    html_parts.append("<table><tr><th>Version</th><th>Date</th><th>Author</th><th>Message</th><th>Length</th></tr>")
    for r in revisions:
        html_parts.append(
            f"<tr><td>{r.version}</td><td>{r.created_at[:10]}</td>"
            f"<td>{r.author}</td><td>{r.message}</td><td>{format_bp(r.length)}</td></tr>"
        )
    html_parts.append("</table>")

    # Features (latest revision)
    if latest and latest.features:
        html_parts.append("<h2>Features (latest)</h2>")
        html_parts.append("<table><tr><th>Type</th><th>Name</th><th>Start</th><th>End</th><th>Strand</th><th>Length</th></tr>")
        for f in latest.features:
            strand = "→" if f.strand == 1 else "←"
            length = f.end - f.start + 1
            html_parts.append(
                f"<tr><td>{f.type}</td><td>{f.name}</td>"
                f"<td>{f.start}</td><td>{f.end}</td>"
                f"<td>{strand}</td><td>{length} bp</td></tr>"
            )
        html_parts.append("</table>")

    # Variants
    if variants:
        html_parts.append("<h2>Variants</h2><ul>")
        for v in variants:
            html_parts.append(f"<li><strong>{v.name}</strong> — {v.description}</li>")
        html_parts.append("</ul>")

    html_parts.append("<hr><p><em>Generated by PlasmidVCS</em></p>")
    html_parts.append("</body></html>")

    out_path = Path(output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(html_parts), encoding="utf-8")

    conn.close()
    return out_path

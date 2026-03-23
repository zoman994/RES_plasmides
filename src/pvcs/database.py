"""SQLite schema, migrations, and queries for PlasmidVCS.

Tables: projects, constructs, revisions, parts, milestones,
assembly_operations, primers, primer_usage, assembly_templates.
Strains are YAML — not stored here.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict
from pathlib import Path

from pvcs.models import (
    AssemblyOperation,
    AssemblyTemplate,
    Construct,
    Feature,
    Fragment,
    Milestone,
    OverlapZone,
    Part,
    Primer,
    Project,
    Revision,
    TemplateSlot,
)

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS constructs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    topology TEXT DEFAULT 'circular',
    parent_id TEXT REFERENCES constructs(id),
    tags TEXT DEFAULT '[]',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revisions (
    id TEXT PRIMARY KEY,
    construct_id TEXT NOT NULL REFERENCES constructs(id),
    version TEXT NOT NULL,
    sequence TEXT NOT NULL,
    length INTEGER NOT NULL,
    features TEXT NOT NULL DEFAULT '[]',
    message TEXT DEFAULT '',
    author TEXT DEFAULT '',
    parent_revision_id TEXT REFERENCES revisions(id),
    genbank_path TEXT,
    checksum TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(construct_id, version)
);

CREATE TABLE IF NOT EXISTS parts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    sequence TEXT NOT NULL,
    organism TEXT DEFAULT '',
    description TEXT DEFAULT '',
    source TEXT DEFAULT '',
    "references" TEXT DEFAULT '[]',
    tags TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    revision_id TEXT NOT NULL REFERENCES revisions(id),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assembly_operations (
    id TEXT PRIMARY KEY,
    revision_id TEXT NOT NULL REFERENCES revisions(id),
    method TEXT NOT NULL,
    fragments TEXT NOT NULL DEFAULT '[]',
    primer_ids TEXT DEFAULT '[]',
    status TEXT DEFAULT 'design',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS primers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sequence TEXT NOT NULL,
    binding_start INTEGER DEFAULT 0,
    binding_end INTEGER DEFAULT 0,
    binding_sequence TEXT DEFAULT '',
    tail_sequence TEXT DEFAULT '',
    tail_purpose TEXT DEFAULT '',
    tm_binding REAL DEFAULT 0.0,
    tm_full REAL DEFAULT 0.0,
    gc_percent REAL DEFAULT 0.0,
    length INTEGER DEFAULT 0,
    direction TEXT DEFAULT '',
    vendor TEXT,
    order_date TEXT,
    tags TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS primer_usage (
    primer_id TEXT NOT NULL REFERENCES primers(id),
    operation_id TEXT NOT NULL REFERENCES assembly_operations(id),
    role TEXT DEFAULT '',
    PRIMARY KEY (primer_id, operation_id)
);

CREATE TABLE IF NOT EXISTS assembly_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    method TEXT NOT NULL,
    description TEXT DEFAULT '',
    slots TEXT NOT NULL DEFAULT '[]',
    overlap_length INTEGER DEFAULT 22,
    backbone_part_id TEXT REFERENCES parts(id),
    created_at TEXT NOT NULL
);
"""


def get_connection(db_path: str | Path) -> sqlite3.Connection:
    """Open a connection and ensure schema exists."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(_SCHEMA_SQL)
    return conn


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def _features_to_json(features: list[Feature]) -> str:
    return json.dumps([asdict(f) for f in features], ensure_ascii=False)


def _features_from_json(text: str) -> list[Feature]:
    raw = json.loads(text) if text else []
    return [Feature(**d) for d in raw]


def _fragments_to_json(fragments: list[Fragment]) -> str:
    data = []
    for f in fragments:
        d = asdict(f)
        # OverlapZone is nested dataclass — already dict via asdict
        data.append(d)
    return json.dumps(data, ensure_ascii=False)


def _fragments_from_json(text: str) -> list[Fragment]:
    raw = json.loads(text) if text else []
    frags = []
    for d in raw:
        if d.get("overlap_left") and isinstance(d["overlap_left"], dict):
            d["overlap_left"] = OverlapZone(**d["overlap_left"])
        if d.get("overlap_right") and isinstance(d["overlap_right"], dict):
            d["overlap_right"] = OverlapZone(**d["overlap_right"])
        frags.append(Fragment(**d))
    return frags


def _slots_to_json(slots: list[TemplateSlot]) -> str:
    return json.dumps([asdict(s) for s in slots], ensure_ascii=False)


def _slots_from_json(text: str) -> list[TemplateSlot]:
    raw = json.loads(text) if text else []
    return [TemplateSlot(**d) for d in raw]


def _json_list(val: list) -> str:
    return json.dumps(val, ensure_ascii=False)


def _from_json_list(text: str | None) -> list:
    return json.loads(text) if text else []


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

def insert_project(conn: sqlite3.Connection, project: Project) -> None:
    conn.execute(
        "INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)",
        (project.id, project.name, project.description, project.created_at),
    )
    conn.commit()


def get_project(conn: sqlite3.Connection) -> Project | None:
    row = conn.execute("SELECT * FROM projects LIMIT 1").fetchone()
    if not row:
        return None
    return Project(id=row["id"], name=row["name"],
                   description=row["description"], created_at=row["created_at"])


# ---------------------------------------------------------------------------
# Construct CRUD
# ---------------------------------------------------------------------------

def insert_construct(conn: sqlite3.Connection, c: Construct) -> None:
    conn.execute(
        "INSERT INTO constructs (id, project_id, name, description, topology, parent_id, tags, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (c.id, c.project_id, c.name, c.description, c.topology,
         c.parent_id, _json_list(c.tags), c.created_at),
    )
    conn.commit()


def get_construct_by_name(conn: sqlite3.Connection, name: str) -> Construct | None:
    row = conn.execute("SELECT * FROM constructs WHERE name = ?", (name,)).fetchone()
    if not row:
        return None
    return _row_to_construct(row)


def get_construct_by_id(conn: sqlite3.Connection, cid: str) -> Construct | None:
    row = conn.execute("SELECT * FROM constructs WHERE id = ?", (cid,)).fetchone()
    if not row:
        return None
    return _row_to_construct(row)


def list_constructs(conn: sqlite3.Connection, project_id: str | None = None) -> list[Construct]:
    if project_id:
        rows = conn.execute("SELECT * FROM constructs WHERE project_id = ? ORDER BY created_at", (project_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM constructs ORDER BY created_at").fetchall()
    return [_row_to_construct(r) for r in rows]


def get_variants(conn: sqlite3.Connection, parent_id: str) -> list[Construct]:
    rows = conn.execute(
        "SELECT * FROM constructs WHERE parent_id = ? ORDER BY created_at", (parent_id,)
    ).fetchall()
    return [_row_to_construct(r) for r in rows]


def _row_to_construct(row: sqlite3.Row) -> Construct:
    return Construct(
        id=row["id"], project_id=row["project_id"], name=row["name"],
        description=row["description"], topology=row["topology"],
        parent_id=row["parent_id"], tags=_from_json_list(row["tags"]),
        created_at=row["created_at"],
    )


# ---------------------------------------------------------------------------
# Revision CRUD
# ---------------------------------------------------------------------------

def insert_revision(conn: sqlite3.Connection, r: Revision) -> None:
    conn.execute(
        "INSERT INTO revisions "
        "(id, construct_id, version, sequence, length, features, message, author, "
        "parent_revision_id, genbank_path, checksum, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (r.id, r.construct_id, r.version, r.sequence, r.length,
         _features_to_json(r.features), r.message, r.author,
         r.parent_revision_id, r.genbank_path, r.checksum, r.created_at),
    )
    conn.commit()


def get_revision(conn: sqlite3.Connection, construct_id: str, version: str) -> Revision | None:
    row = conn.execute(
        "SELECT * FROM revisions WHERE construct_id = ? AND version = ?",
        (construct_id, version),
    ).fetchone()
    if not row:
        return None
    return _row_to_revision(row)


def get_revision_by_id(conn: sqlite3.Connection, rid: str) -> Revision | None:
    row = conn.execute("SELECT * FROM revisions WHERE id = ?", (rid,)).fetchone()
    if not row:
        return None
    return _row_to_revision(row)


def get_latest_revision(conn: sqlite3.Connection, construct_id: str) -> Revision | None:
    row = conn.execute(
        "SELECT * FROM revisions WHERE construct_id = ? ORDER BY created_at DESC LIMIT 1",
        (construct_id,),
    ).fetchone()
    if not row:
        return None
    return _row_to_revision(row)


def list_revisions(conn: sqlite3.Connection, construct_id: str) -> list[Revision]:
    rows = conn.execute(
        "SELECT * FROM revisions WHERE construct_id = ? ORDER BY created_at",
        (construct_id,),
    ).fetchall()
    return [_row_to_revision(r) for r in rows]


def _row_to_revision(row: sqlite3.Row) -> Revision:
    return Revision(
        id=row["id"], construct_id=row["construct_id"], version=row["version"],
        sequence=row["sequence"], length=row["length"],
        features=_features_from_json(row["features"]),
        message=row["message"], author=row["author"],
        parent_revision_id=row["parent_revision_id"],
        genbank_path=row["genbank_path"], checksum=row["checksum"],
        created_at=row["created_at"],
    )


# ---------------------------------------------------------------------------
# Part CRUD
# ---------------------------------------------------------------------------

def insert_part(conn: sqlite3.Connection, p: Part) -> None:
    conn.execute(
        "INSERT INTO parts (id, name, type, sequence, organism, description, source, "
        '"references", tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (p.id, p.name, p.type, p.sequence, p.organism, p.description,
         p.source, _json_list(p.references), _json_list(p.tags)),
    )
    conn.commit()


def get_part_by_name(conn: sqlite3.Connection, name: str) -> Part | None:
    row = conn.execute("SELECT * FROM parts WHERE name = ?", (name,)).fetchone()
    if not row:
        return None
    return _row_to_part(row)


def get_part_by_id(conn: sqlite3.Connection, pid: str) -> Part | None:
    row = conn.execute("SELECT * FROM parts WHERE id = ?", (pid,)).fetchone()
    if not row:
        return None
    return _row_to_part(row)


def list_parts(conn: sqlite3.Connection, part_type: str | None = None) -> list[Part]:
    if part_type:
        rows = conn.execute("SELECT * FROM parts WHERE type = ? ORDER BY name", (part_type,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM parts ORDER BY type, name").fetchall()
    return [_row_to_part(r) for r in rows]


def _row_to_part(row: sqlite3.Row) -> Part:
    return Part(
        id=row["id"], name=row["name"], type=row["type"],
        sequence=row["sequence"], organism=row["organism"],
        description=row["description"], source=row["source"],
        references=_from_json_list(row["references"]),
        tags=_from_json_list(row["tags"]),
    )


# ---------------------------------------------------------------------------
# Milestone CRUD
# ---------------------------------------------------------------------------

def insert_milestone(conn: sqlite3.Connection, m: Milestone) -> None:
    conn.execute(
        "INSERT INTO milestones (id, revision_id, name, description, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (m.id, m.revision_id, m.name, m.description, m.created_at),
    )
    conn.commit()


def list_milestones(conn: sqlite3.Connection, revision_id: str) -> list[Milestone]:
    rows = conn.execute(
        "SELECT * FROM milestones WHERE revision_id = ? ORDER BY created_at",
        (revision_id,),
    ).fetchall()
    return [
        Milestone(id=r["id"], revision_id=r["revision_id"], name=r["name"],
                  description=r["description"], created_at=r["created_at"])
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Assembly Operation CRUD
# ---------------------------------------------------------------------------

def insert_assembly_operation(conn: sqlite3.Connection, op: AssemblyOperation) -> None:
    conn.execute(
        "INSERT INTO assembly_operations "
        "(id, revision_id, method, fragments, primer_ids, status, notes, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (op.id, op.revision_id, op.method, _fragments_to_json(op.fragments),
         _json_list(op.primer_ids), op.status, op.notes, op.created_at),
    )
    conn.commit()


def get_assembly_operation(conn: sqlite3.Connection, revision_id: str) -> AssemblyOperation | None:
    row = conn.execute(
        "SELECT * FROM assembly_operations WHERE revision_id = ?", (revision_id,)
    ).fetchone()
    if not row:
        return None
    return _row_to_assembly_op(row)


def list_assembly_operations(conn: sqlite3.Connection) -> list[AssemblyOperation]:
    rows = conn.execute("SELECT * FROM assembly_operations ORDER BY created_at").fetchall()
    return [_row_to_assembly_op(r) for r in rows]


def update_assembly_status(
    conn: sqlite3.Connection, op_id: str, status: str, notes: str | None = None,
) -> None:
    if notes is not None:
        conn.execute(
            "UPDATE assembly_operations SET status = ?, notes = ? WHERE id = ?",
            (status, notes, op_id),
        )
    else:
        conn.execute(
            "UPDATE assembly_operations SET status = ? WHERE id = ?",
            (status, op_id),
        )
    conn.commit()


def _row_to_assembly_op(row: sqlite3.Row) -> AssemblyOperation:
    return AssemblyOperation(
        id=row["id"], revision_id=row["revision_id"], method=row["method"],
        fragments=_fragments_from_json(row["fragments"]),
        primer_ids=_from_json_list(row["primer_ids"]),
        status=row["status"], notes=row["notes"], created_at=row["created_at"],
    )


# ---------------------------------------------------------------------------
# Primer CRUD
# ---------------------------------------------------------------------------

def insert_primer(conn: sqlite3.Connection, p: Primer) -> None:
    conn.execute(
        "INSERT INTO primers "
        "(id, name, sequence, binding_start, binding_end, binding_sequence, "
        "tail_sequence, tail_purpose, tm_binding, tm_full, gc_percent, "
        "length, direction, vendor, order_date, tags) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (p.id, p.name, p.sequence, p.binding_start, p.binding_end,
         p.binding_sequence, p.tail_sequence, p.tail_purpose,
         p.tm_binding, p.tm_full, p.gc_percent, p.length,
         p.direction, p.vendor, p.order_date, _json_list(p.tags)),
    )
    conn.commit()


def get_primer_by_name(conn: sqlite3.Connection, name: str) -> Primer | None:
    row = conn.execute("SELECT * FROM primers WHERE name = ?", (name,)).fetchone()
    if not row:
        return None
    return _row_to_primer(row, conn)


def list_primers(conn: sqlite3.Connection) -> list[Primer]:
    rows = conn.execute("SELECT * FROM primers ORDER BY name").fetchall()
    return [_row_to_primer(r, conn) for r in rows]


def _get_primer_usage(conn: sqlite3.Connection, primer_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT operation_id, role FROM primer_usage WHERE primer_id = ?",
        (primer_id,),
    ).fetchall()
    return [{"operation_id": r["operation_id"], "role": r["role"]} for r in rows]


def _row_to_primer(row: sqlite3.Row, conn: sqlite3.Connection) -> Primer:
    return Primer(
        id=row["id"], name=row["name"], sequence=row["sequence"],
        binding_start=row["binding_start"], binding_end=row["binding_end"],
        binding_sequence=row["binding_sequence"],
        tail_sequence=row["tail_sequence"], tail_purpose=row["tail_purpose"],
        tm_binding=row["tm_binding"], tm_full=row["tm_full"],
        gc_percent=row["gc_percent"], length=row["length"],
        direction=row["direction"],
        used_in=_get_primer_usage(conn, row["id"]),
        vendor=row["vendor"], order_date=row["order_date"],
        tags=_from_json_list(row["tags"]),
    )


def insert_primer_usage(
    conn: sqlite3.Connection, primer_id: str, operation_id: str, role: str = "",
) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO primer_usage (primer_id, operation_id, role) VALUES (?, ?, ?)",
        (primer_id, operation_id, role),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Assembly Template CRUD
# ---------------------------------------------------------------------------

def insert_assembly_template(conn: sqlite3.Connection, t: AssemblyTemplate) -> None:
    conn.execute(
        "INSERT INTO assembly_templates "
        "(id, name, method, description, slots, overlap_length, backbone_part_id, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (t.id, t.name, t.method, t.description, _slots_to_json(t.slots),
         t.overlap_length, t.backbone_part_id, t.created_at),
    )
    conn.commit()


def get_assembly_template(conn: sqlite3.Connection, name: str) -> AssemblyTemplate | None:
    row = conn.execute(
        "SELECT * FROM assembly_templates WHERE name = ?", (name,)
    ).fetchone()
    if not row:
        return None
    return _row_to_template(row)


def list_assembly_templates(conn: sqlite3.Connection) -> list[AssemblyTemplate]:
    rows = conn.execute("SELECT * FROM assembly_templates ORDER BY name").fetchall()
    return [_row_to_template(r) for r in rows]


def _row_to_template(row: sqlite3.Row) -> AssemblyTemplate:
    return AssemblyTemplate(
        id=row["id"], name=row["name"], method=row["method"],
        description=row["description"], slots=_slots_from_json(row["slots"]),
        overlap_length=row["overlap_length"],
        backbone_part_id=row["backbone_part_id"],
        created_at=row["created_at"],
    )


# ---------------------------------------------------------------------------
# Search helpers
# ---------------------------------------------------------------------------

def search_features(conn: sqlite3.Connection, query: str) -> list[dict]:
    """Search features across all revisions (latest per construct)."""
    results = []
    # Get latest revision per construct
    rows = conn.execute("""
        SELECT r.*, c.name as construct_name
        FROM revisions r
        JOIN constructs c ON r.construct_id = c.id
        WHERE r.id IN (
            SELECT id FROM revisions r2
            WHERE r2.construct_id = r.construct_id
            ORDER BY r2.created_at DESC
            LIMIT 1
        )
    """).fetchall()

    query_lower = query.lower()
    for row in rows:
        features = _features_from_json(row["features"])
        for feat in features:
            if (query_lower in feat.name.lower()
                    or query_lower in feat.type.lower()
                    or any(query_lower in str(v).lower() for v in feat.qualifiers.values())):
                results.append({
                    "construct_name": row["construct_name"],
                    "construct_id": row["construct_id"],
                    "version": row["version"],
                    "feature": feat,
                })
    return results

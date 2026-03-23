"""Tests for SQLite database operations."""

import sqlite3
from pvcs.database import (
    get_connection,
    insert_project,
    get_project,
    insert_construct,
    get_construct_by_name,
    list_constructs,
    insert_revision,
    get_revision,
    get_latest_revision,
    list_revisions,
    insert_part,
    get_part_by_name,
    list_parts,
    insert_milestone,
    list_milestones,
    insert_assembly_operation,
    get_assembly_operation,
    insert_primer,
    list_primers,
)
from pvcs.models import (
    Project, Construct, Revision, Feature, Part, Milestone,
    AssemblyOperation, Fragment, Primer, _new_id, _now,
)


def test_schema_creation(tmp_path):
    db_file = tmp_path / "test.sqlite"
    conn = get_connection(db_file)
    # Check tables exist
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    table_names = [r["name"] for r in tables]
    assert "projects" in table_names
    assert "constructs" in table_names
    assert "revisions" in table_names
    assert "parts" in table_names
    assert "primers" in table_names
    conn.close()


def test_project_crud(tmp_path):
    conn = get_connection(tmp_path / "test.sqlite")
    p = Project(name="Test Project", description="A test")
    insert_project(conn, p)

    loaded = get_project(conn)
    assert loaded is not None
    assert loaded.name == "Test Project"
    assert loaded.id == p.id
    conn.close()


def test_construct_crud(tmp_path):
    conn = get_connection(tmp_path / "test.sqlite")
    p = Project(name="Proj")
    insert_project(conn, p)

    c = Construct(name="pTEST", project_id=p.id, topology="circular", tags=["tag1", "tag2"])
    insert_construct(conn, c)

    loaded = get_construct_by_name(conn, "pTEST")
    assert loaded is not None
    assert loaded.name == "pTEST"
    assert loaded.topology == "circular"
    assert loaded.tags == ["tag1", "tag2"]

    all_c = list_constructs(conn, p.id)
    assert len(all_c) == 1
    conn.close()


def test_revision_crud(tmp_path):
    conn = get_connection(tmp_path / "test.sqlite")
    p = Project(name="Proj")
    insert_project(conn, p)

    c = Construct(name="pTEST", project_id=p.id)
    insert_construct(conn, c)

    feat = Feature(type="CDS", name="testGene", start=1, end=900, strand=1)
    r = Revision(
        construct_id=c.id, version="1.0", sequence="ATGC" * 225,
        features=[feat], length=900, message="Initial",
        author="Test", checksum="abc123",
    )
    insert_revision(conn, r)

    loaded = get_revision(conn, c.id, "1.0")
    assert loaded is not None
    assert loaded.version == "1.0"
    assert loaded.length == 900
    assert len(loaded.features) == 1
    assert loaded.features[0].name == "testGene"

    latest = get_latest_revision(conn, c.id)
    assert latest is not None
    assert latest.version == "1.0"
    conn.close()


def test_revision_features_json_roundtrip(tmp_path):
    """Features are stored as JSON and must roundtrip correctly."""
    conn = get_connection(tmp_path / "test.sqlite")
    p = Project(name="Proj")
    insert_project(conn, p)
    c = Construct(name="pTEST", project_id=p.id)
    insert_construct(conn, c)

    features = [
        Feature(type="CDS", name="gene1", start=1, end=300, strand=1,
                qualifiers={"product": "test protein"}),
        Feature(type="promoter", name="PglaA", start=301, end=600, strand=-1),
    ]

    r = Revision(construct_id=c.id, version="1.0", sequence="A" * 600,
                 features=features, length=600, checksum="xyz")
    insert_revision(conn, r)

    loaded = get_revision(conn, c.id, "1.0")
    assert len(loaded.features) == 2
    assert loaded.features[0].qualifiers["product"] == "test protein"
    assert loaded.features[1].strand == -1
    conn.close()


def test_part_crud(tmp_path):
    conn = get_connection(tmp_path / "test.sqlite")

    part = Part(name="PglaA", type="promoter", sequence="A" * 850,
                organism="A. niger", tags=["strong", "inducible"])
    insert_part(conn, part)

    loaded = get_part_by_name(conn, "PglaA")
    assert loaded is not None
    assert loaded.name == "PglaA"
    assert loaded.type == "promoter"
    assert loaded.tags == ["strong", "inducible"]

    all_parts = list_parts(conn, "promoter")
    assert len(all_parts) == 1
    conn.close()


def test_milestone_crud(tmp_path):
    conn = get_connection(tmp_path / "test.sqlite")
    p = Project(name="Proj")
    insert_project(conn, p)
    c = Construct(name="pTEST", project_id=p.id)
    insert_construct(conn, c)
    r = Revision(construct_id=c.id, version="1.0", sequence="A", length=1, checksum="x")
    insert_revision(conn, r)

    m = Milestone(revision_id=r.id, name="sent-to-Vazyme")
    insert_milestone(conn, m)

    loaded = list_milestones(conn, r.id)
    assert len(loaded) == 1
    assert loaded[0].name == "sent-to-Vazyme"
    conn.close()


def test_primer_crud(tmp_path):
    conn = get_connection(tmp_path / "test.sqlite")

    primer = Primer(
        name="fwd_PglaA", sequence="ATCGATCGATCGATCGATCG",
        binding_sequence="ATCGATCGATCG", tail_sequence="ATCGATCG",
        tm_binding=55.0, tm_full=60.0, gc_percent=50.0,
        length=20, direction="forward",
    )
    insert_primer(conn, primer)

    all_p = list_primers(conn)
    assert len(all_p) == 1
    assert all_p[0].name == "fwd_PglaA"
    conn.close()

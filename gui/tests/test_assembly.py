"""Tests for assembly engine: operations, fragment provenance, templates."""

from pvcs.assembly import (
    record_assembly,
    get_assembly,
    update_status,
    list_assemblies,
    create_template,
    list_templates,
    VALID_METHODS,
    VALID_STATUSES,
)
from pvcs.models import Fragment, OverlapZone, _new_id
from pvcs.revision import import_construct


def test_record_assembly(tmp_project, simple_v1_gb):
    construct, revision = import_construct(
        simple_v1_gb, name="pTEST", project_root=tmp_project,
    )

    fragments = [
        Fragment(order=1, name="PglaA", source_type="part", start=1, end=300),
        Fragment(order=2, name="testGene", source_type="pcr_product", start=301, end=1200),
        Fragment(order=3, name="TtrpC", source_type="part", start=1201, end=1500),
    ]

    op = record_assembly(
        revision.id, "overlap_pcr", fragments,
        status="design", notes="Test assembly",
        project_root=tmp_project,
    )

    assert op.method == "overlap_pcr"
    assert len(op.fragments) == 3
    assert op.status == "design"

    # Retrieve
    loaded = get_assembly(revision.id, project_root=tmp_project)
    assert loaded is not None
    assert loaded.method == "overlap_pcr"
    assert len(loaded.fragments) == 3
    assert loaded.fragments[0].name == "PglaA"


def test_update_assembly_status(tmp_project, simple_v1_gb):
    construct, revision = import_construct(
        simple_v1_gb, name="pTEST", project_root=tmp_project,
    )
    record_assembly(revision.id, "overlap_pcr", [], project_root=tmp_project)

    update_status("pTEST", "pcr", notes="Started PCR", project_root=tmp_project)

    loaded = get_assembly(revision.id, project_root=tmp_project)
    assert loaded.status == "pcr"
    assert loaded.notes == "Started PCR"


def test_list_assemblies(tmp_project, simple_v1_gb):
    construct, revision = import_construct(
        simple_v1_gb, name="pTEST", project_root=tmp_project,
    )
    record_assembly(revision.id, "gibson", [], project_root=tmp_project)

    assemblies = list_assemblies(project_root=tmp_project)
    assert len(assemblies) == 1
    assert assemblies[0]["construct_name"] == "pTEST"
    assert assemblies[0]["method"] == "gibson"


def test_assembly_with_overlaps(tmp_project, simple_v1_gb):
    construct, revision = import_construct(
        simple_v1_gb, name="pTEST", project_root=tmp_project,
    )

    ol = OverlapZone(sequence="ATCGATCGATCGATCGATCG", length=20, tm=58.5, gc_percent=50.0)

    fragments = [
        Fragment(order=1, name="F1", source_type="pcr_product",
                 start=1, end=1000, overlap_right=ol),
        Fragment(order=2, name="F2", source_type="pcr_product",
                 start=1001, end=2000, overlap_left=ol),
    ]

    op = record_assembly(revision.id, "overlap_pcr", fragments, project_root=tmp_project)

    loaded = get_assembly(revision.id, project_root=tmp_project)
    assert loaded.fragments[0].overlap_right is not None
    assert loaded.fragments[0].overlap_right.tm == 58.5
    assert loaded.fragments[1].overlap_left.sequence == "ATCGATCGATCGATCGATCG"


def test_create_template(tmp_project):
    slots = [
        {"name": "Promoter", "type_constraint": "promoter", "fixed": True},
        {"name": "CDS", "type_constraint": "CDS", "fixed": False},
        {"name": "Terminator", "type_constraint": "terminator", "fixed": True},
    ]

    t = create_template(
        "glaA-cassette", "overlap_pcr", slots,
        overlap_length=22, project_root=tmp_project,
    )

    assert t.name == "glaA-cassette"
    assert len(t.slots) == 3
    assert t.slots[0].name == "Promoter"
    assert t.slots[0].fixed is True
    assert t.slots[1].fixed is False


def test_list_templates(tmp_project):
    create_template("t1", "gibson", [{"name": "A"}], project_root=tmp_project)
    create_template("t2", "overlap_pcr", [{"name": "B"}], project_root=tmp_project)

    templates = list_templates(project_root=tmp_project)
    assert len(templates) == 2

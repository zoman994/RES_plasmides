"""Tests for part library management."""

from pvcs.parts import add_part, get_part, list_parts, find_part_usage, add_part_from_sequence
from pvcs.revision import import_construct


def test_add_part(tmp_project, simple_v1_gb):
    part = add_part(
        simple_v1_gb,
        name="PglaA",
        part_type="promoter",
        organism="A. niger",
        project_root=tmp_project,
    )

    assert part.name == "PglaA"
    assert part.type == "promoter"
    assert part.organism == "A. niger"
    assert len(part.sequence) > 0

    # Check file was copied
    assert (tmp_project / "parts" / "promoter" / "PglaA.gb").exists()


def test_get_part(tmp_project, simple_v1_gb):
    add_part(simple_v1_gb, "PglaA", "promoter", project_root=tmp_project)

    part = get_part("PglaA", project_root=tmp_project)
    assert part is not None
    assert part.name == "PglaA"


def test_list_parts(tmp_project, simple_v1_gb):
    add_part(simple_v1_gb, "PglaA", "promoter", project_root=tmp_project)
    add_part_from_sequence("TtrpC", "terminator", "T" * 740, project_root=tmp_project)

    all_parts = list_parts(project_root=tmp_project)
    assert len(all_parts) == 2

    promoters = list_parts("promoter", project_root=tmp_project)
    assert len(promoters) == 1
    assert promoters[0].name == "PglaA"


def test_add_part_from_sequence(tmp_project):
    part = add_part_from_sequence(
        "TestPart", "CDS", "ATGGCTAAAGCTGCTCCT",
        organism="E. coli",
        project_root=tmp_project,
    )

    assert part.name == "TestPart"
    assert part.type == "CDS"
    assert part.sequence == "ATGGCTAAAGCTGCTCCT"

    # Check .gb file was written
    assert (tmp_project / "parts" / "CDS" / "TestPart.gb").exists()


def test_find_part_usage(tmp_project, simple_v1_gb):
    # Import a construct
    construct, revision = import_construct(
        simple_v1_gb, name="pTEST", project_root=tmp_project,
    )

    # Add a part whose sequence is a substring of the construct
    seq = revision.sequence[:300]  # promoter region
    add_part_from_sequence("PglaA", "promoter", seq, project_root=tmp_project)

    usage = find_part_usage("PglaA", project_root=tmp_project)
    assert len(usage) == 1
    assert usage[0]["construct_name"] == "pTEST"

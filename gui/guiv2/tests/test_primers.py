"""Tests for primer registry: CRUD, reuse detection."""

from pvcs.primers import (
    add_primer,
    get_primer,
    list_primers,
    check_primer_reuse,
    link_primer_to_operation,
)
from pvcs.assembly import record_assembly
from pvcs.revision import import_construct


def test_add_primer(tmp_project):
    p = add_primer(
        "fwd_PglaA",
        sequence="ATCGATCGATCGATCGATCG",
        binding_sequence="ATCGATCGATCG",
        tail_sequence="ATCGATCG",
        tail_purpose="overlap with XynTL",
        direction="forward",
        project_root=tmp_project,
    )

    assert p.name == "fwd_PglaA"
    assert p.tm_binding > 0
    assert p.gc_percent > 0
    assert p.length == 20


def test_get_primer(tmp_project):
    add_primer("fwd_test", sequence="GCGCGCGCGCGCGCGCGCGC",
               project_root=tmp_project)

    p = get_primer("fwd_test", project_root=tmp_project)
    assert p is not None
    assert p.name == "fwd_test"


def test_list_primers(tmp_project):
    add_primer("p1", sequence="ATCGATCGATCG", project_root=tmp_project)
    add_primer("p2", sequence="GCGCGCGCGCGC", project_root=tmp_project)

    primers = list_primers(project_root=tmp_project)
    assert len(primers) == 2


def test_check_primer_reuse(tmp_project, simple_v1_gb):
    # Import a construct
    construct, rev = import_construct(
        simple_v1_gb, name="pTEST", project_root=tmp_project,
    )

    # Add a primer whose binding sequence matches the construct
    binding_seq = rev.sequence[:18]  # first 18 bp of construct
    add_primer(
        "fwd_match",
        sequence=binding_seq,
        binding_sequence=binding_seq,
        project_root=tmp_project,
    )

    matches = check_primer_reuse("pTEST", project_root=tmp_project)
    assert len(matches) >= 1
    assert matches[0]["primer"].name == "fwd_match"
    assert matches[0]["strand"] == "fwd"


def test_check_primer_reuse_no_match(tmp_project, simple_v1_gb):
    import_construct(simple_v1_gb, name="pTEST", project_root=tmp_project)

    # Add primer that doesn't match
    add_primer(
        "no_match",
        sequence="NNNNNNNNNNNNNNNNNN",
        binding_sequence="NNNNNNNNNNNNNNNNNN",
        project_root=tmp_project,
    )

    matches = check_primer_reuse("pTEST", project_root=tmp_project)
    assert len(matches) == 0


def test_link_primer_to_operation(tmp_project, simple_v1_gb):
    construct, rev = import_construct(
        simple_v1_gb, name="pTEST", project_root=tmp_project,
    )

    add_primer("fwd_link", sequence="ATCGATCGATCG", project_root=tmp_project)
    op = record_assembly(rev.id, "overlap_pcr", [], project_root=tmp_project)

    link_primer_to_operation("fwd_link", op.id, role="frag1_fwd",
                             project_root=tmp_project)

    # Check usage
    p = get_primer("fwd_link", project_root=tmp_project)
    assert len(p.used_in) == 1
    assert p.used_in[0]["role"] == "frag1_fwd"

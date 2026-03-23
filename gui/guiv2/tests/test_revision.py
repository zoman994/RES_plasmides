"""Tests for revision management: import, commit, log, tree, variant."""

import pytest
from pvcs.revision import (
    import_construct,
    commit_revision,
    create_variant,
    get_log,
    get_tree,
    tag_revision,
    diff_revisions,
)


def test_import_construct(tmp_project, simple_v1_gb):
    construct, revision = import_construct(
        simple_v1_gb,
        name="pTEST",
        message="Initial import",
        author="Igor",
        tags=["test"],
        project_root=tmp_project,
    )

    assert construct.name == "pTEST"
    assert construct.topology == "circular"
    assert revision.version == "1.0"
    assert revision.length == 3000
    assert len(revision.features) == 3

    # Check that .gb file was copied to constructs/
    assert (tmp_project / "constructs" / "pTEST.gb").exists()

    # Check that object was stored
    obj_files = list((tmp_project / ".pvcs" / "objects").glob("*.gb"))
    assert len(obj_files) == 1


def test_commit_revision(tmp_project, simple_v1_gb, simple_v2_gb):
    import_construct(simple_v1_gb, name="pTEST", project_root=tmp_project)

    revision, diff_result = commit_revision(
        simple_v2_gb, "pTEST", "1.1",
        message="Point mutation",
        project_root=tmp_project,
    )

    assert revision.version == "1.1"
    assert diff_result is not None
    assert len(diff_result.changes) >= 1


def test_create_variant(tmp_project, simple_v1_gb):
    import_construct(simple_v1_gb, name="pTEST", project_root=tmp_project)

    variant = create_variant(
        "pTEST", "pTEST-mut", "1.0",
        message="Mutation variant",
        project_root=tmp_project,
    )

    assert variant.name == "pTEST-mut"
    assert variant.parent_id is not None


def test_get_log(tmp_project, simple_v1_gb, simple_v2_gb):
    import_construct(simple_v1_gb, name="pTEST", project_root=tmp_project)
    commit_revision(simple_v2_gb, "pTEST", "1.1", project_root=tmp_project)

    log_data = get_log("pTEST", project_root=tmp_project)

    assert log_data["construct"].name == "pTEST"
    assert len(log_data["revisions"]) == 2
    assert log_data["revisions"][0].version == "1.0"
    assert log_data["revisions"][1].version == "1.1"


def test_get_tree_with_variants(tmp_project, simple_v1_gb):
    import_construct(simple_v1_gb, name="pTEST", project_root=tmp_project)
    create_variant("pTEST", "pTEST-var", "1.0", project_root=tmp_project)

    tree = get_tree("pTEST", project_root=tmp_project)

    assert tree["construct"].name == "pTEST"
    assert len(tree["variants"]) == 1
    assert tree["variants"][0]["construct"].name == "pTEST-var"


def test_tag_revision(tmp_project, simple_v1_gb):
    import_construct(simple_v1_gb, name="pTEST", project_root=tmp_project)

    milestone = tag_revision(
        "pTEST", "1.0", "sent-to-Vazyme",
        description="Ordered synthesis",
        project_root=tmp_project,
    )

    assert milestone.name == "sent-to-Vazyme"


def test_diff_revisions(tmp_project, simple_v1_gb, simple_v2_gb):
    import_construct(simple_v1_gb, name="pTEST", project_root=tmp_project)
    commit_revision(simple_v2_gb, "pTEST", "1.1", project_root=tmp_project)

    result = diff_revisions("pTEST:1.0", "pTEST:1.1", project_root=tmp_project)

    assert result.version_a == "1.0"
    assert result.version_b == "1.1"
    assert len(result.changes) >= 1


def test_commit_nonexistent_construct_raises(tmp_project, simple_v1_gb):
    with pytest.raises(ValueError, match="not found"):
        commit_revision(simple_v1_gb, "NOEXIST", "1.0", project_root=tmp_project)

"""Tests for YAML strain registry."""

from pvcs.strains import add_strain, get_strain, list_strains, update_strain, get_strain_tree


def test_add_and_get_strain(tmp_project):
    s = add_strain(
        "AN-001", "CBS 513.88 (wild type)",
        species="Aspergillus niger",
        storage_location="Cryo box 1, A1",
        project_root=tmp_project,
    )

    assert s.id == "AN-001"
    assert (tmp_project / "strains" / "AN-001.yaml").exists()

    loaded = get_strain("AN-001", project_root=tmp_project)
    assert loaded is not None
    assert loaded.name == "CBS 513.88 (wild type)"
    assert loaded.species == "Aspergillus niger"


def test_list_strains(tmp_project):
    add_strain("AN-001", "WT", project_root=tmp_project)
    add_strain("AN-002", "dkusA", parent_id="AN-001", project_root=tmp_project)

    strains = list_strains(project_root=tmp_project)
    assert len(strains) == 2


def test_update_strain(tmp_project):
    add_strain("AN-001", "WT", project_root=tmp_project)

    s = get_strain("AN-001", project_root=tmp_project)
    s.verified = True
    s.storage_location = "Cryo box 2, B3"
    update_strain(s, project_root=tmp_project)

    reloaded = get_strain("AN-001", project_root=tmp_project)
    assert reloaded.verified is True
    assert reloaded.storage_location == "Cryo box 2, B3"


def test_strain_tree(tmp_project):
    add_strain("AN-001", "WT", species="A. niger", project_root=tmp_project)
    add_strain("AN-002", "dkusA", parent_id="AN-001", project_root=tmp_project)
    add_strain("AN-003", "dkusA pyrG-", parent_id="AN-002", project_root=tmp_project)
    add_strain("AN-004", "dkusA dpepA pyrG-", parent_id="AN-003",
               construct_id="P43_Cas", project_root=tmp_project)

    tree = get_strain_tree("AN-004", project_root=tmp_project)

    # Root should be AN-001
    assert tree["strain"].id == "AN-001"

    # AN-001 → AN-002 → AN-003 → AN-004
    assert len(tree["children"]) == 1
    assert tree["children"][0]["strain"].id == "AN-002"
    assert tree["children"][0]["children"][0]["strain"].id == "AN-003"
    assert tree["children"][0]["children"][0]["children"][0]["strain"].id == "AN-004"


def test_strain_with_genotype(tmp_project):
    genotype = {
        "deletions": [
            {"gene": "kusA", "replacement": "amdS"},
        ],
        "markers": [
            {"name": "amdS", "status": "active"},
        ],
    }

    add_strain("AN-002", "dkusA", parent_id="AN-001",
               genotype=genotype, method="PEG-protoplast",
               project_root=tmp_project)

    s = get_strain("AN-002", project_root=tmp_project)
    assert s.genotype["deletions"][0]["gene"] == "kusA"
    assert s.method == "PEG-protoplast"

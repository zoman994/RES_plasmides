"""Tests for search functionality."""

from pvcs.revision import import_construct
from pvcs.search import search_features, search_sequence, search_re_sites


def test_search_features(tmp_project, simple_v1_gb):
    import_construct(simple_v1_gb, name="pTEST", project_root=tmp_project)

    results = search_features("testGene", project_root=tmp_project)
    assert len(results) >= 1
    assert results[0]["feature"].name == "testGene"
    assert results[0]["construct_name"] == "pTEST"


def test_search_features_by_type(tmp_project, simple_v1_gb):
    import_construct(simple_v1_gb, name="pTEST", project_root=tmp_project)

    results = search_features("CDS", project_root=tmp_project)
    assert len(results) >= 1


def test_search_features_no_match(tmp_project, simple_v1_gb):
    import_construct(simple_v1_gb, name="pTEST", project_root=tmp_project)

    results = search_features("NONEXISTENT", project_root=tmp_project)
    assert len(results) == 0


def test_search_sequence(tmp_project, simple_v1_gb):
    import_construct(simple_v1_gb, name="pTEST", project_root=tmp_project)

    # Search for the ATG start codon at CDS beginning
    results = search_sequence("ATGGCTAAA", project_root=tmp_project)
    assert len(results) >= 1
    assert results[0]["construct_name"] == "pTEST"


def test_search_re_sites(tmp_project, puc19_gb):
    import_construct(puc19_gb, name="pUC19", project_root=tmp_project)

    # pUC19 fixture has GAATTC (EcoRI) site
    results = search_re_sites("EcoRI", project_root=tmp_project)
    assert len(results) >= 1
    assert results[0]["enzyme"] == "EcoRI"
    assert results[0]["construct_name"] == "pUC19"


def test_search_all_re_sites(tmp_project, puc19_gb):
    import_construct(puc19_gb, name="pUC19", project_root=tmp_project)

    # Search all common RE sites
    results = search_re_sites(project_root=tmp_project)
    # Should find at least EcoRI and BamHI
    enzymes_found = set(r["enzyme"] for r in results)
    assert "EcoRI" in enzymes_found

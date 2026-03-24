"""Tests for Golden Gate assembly designer."""

from pvcs.golden_gate import (
    design_golden_gate,
    check_overhang_uniqueness,
    check_internal_sites,
    suggest_overhangs,
    ENZYME_SITES,
)


def test_enzyme_sites_defined():
    assert "BsaI" in ENZYME_SITES
    assert "BbsI" in ENZYME_SITES
    assert ENZYME_SITES["BsaI"][0] == "GGTCTC"


def test_suggest_overhangs():
    frags = [("A", "ATCGATCG" * 50), ("B", "GCTAGCTA" * 50)]
    oh = suggest_overhangs(frags)
    assert len(oh) == 2
    assert all(len(o) == 4 for o in oh)


def test_check_overhang_uniqueness_ok():
    warnings = check_overhang_uniqueness(["ATCG", "GCTA", "TTAC"])
    assert len(warnings) == 0


def test_check_overhang_uniqueness_duplicate():
    warnings = check_overhang_uniqueness(["ATCG", "GCTA", "ATCG"])
    assert any("Duplicate" in w for w in warnings)


def test_check_overhang_uniqueness_palindrome():
    warnings = check_overhang_uniqueness(["AATT", "GCTA"])
    assert any("Palindromic" in w for w in warnings)


def test_check_internal_sites_clean():
    seq = "ATCGATCGATCGATCGATCG" * 20  # no BsaI site
    positions = check_internal_sites(seq, "GGTCTC")
    assert len(positions) == 0


def test_check_internal_sites_found():
    seq = "ATCG" * 10 + "GGTCTC" + "ATCG" * 10
    positions = check_internal_sites(seq, "GGTCTC")
    assert len(positions) == 1
    assert positions[0] == 41


def test_design_golden_gate_3_fragments():
    frags = [
        ("PglaA", "ATCGATCG" * 50),
        ("XynTL", "GCTAGCTA" * 50),
        ("TtrpC", "TTAATTAA" * 50),
    ]
    result = design_golden_gate(frags, enzyme="BsaI")

    assert result.enzyme == "BsaI"
    assert len(result.fragments) == 3
    assert len(result.overhangs) == 3
    assert len(result.primers) == 6  # 2 per fragment
    # Each primer should have BsaI site in tail
    for p in result.primers:
        assert "GGTCTC" in p.tail_sequence or "GAGACC" in p.tail_sequence


def test_design_golden_gate_custom_overhangs():
    frags = [("A", "ATCG" * 100), ("B", "GCTA" * 100)]
    result = design_golden_gate(frags, enzyme="BsaI", overhangs=["AAAA", "CCCC"])

    assert result.overhangs == ["AAAA", "CCCC"]

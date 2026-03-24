"""Tests for restriction enzyme database and primer design."""

from pvcs.restriction import (
    RE_DATABASE,
    COMPATIBLE_PAIRS,
    find_sites,
    check_compatible_ends,
    design_re_primers,
    find_re_sites_in_sequence,
)


def test_re_database_has_common_enzymes():
    for enz in ["EcoRI", "BamHI", "HindIII", "XbaI", "NcoI", "NotI", "BsaI"]:
        assert enz in RE_DATABASE, f"{enz} missing"


def test_re_database_type_iis():
    assert RE_DATABASE["BsaI"]["end"] == "typeIIS"
    assert RE_DATABASE["BbsI"]["end"] == "typeIIS"


def test_find_sites_ecori():
    seq = "ATCG" * 10 + "GAATTC" + "ATCG" * 10
    sites = find_sites(seq, "EcoRI")
    assert len(sites) == 1
    assert sites[0]["position"] == 41


def test_find_sites_no_match():
    seq = "ATCGATCGATCG" * 20
    sites = find_sites(seq, "EcoRI")
    assert len(sites) == 0


def test_find_sites_multiple():
    seq = "GAATTC" + "A" * 50 + "GAATTC"
    sites = find_sites(seq, "EcoRI")
    assert len(sites) == 2


def test_find_sites_alias():
    """find_re_sites_in_sequence should be an alias for find_sites."""
    assert find_re_sites_in_sequence is find_sites


def test_compatible_ends_same_enzyme():
    compat, msg = check_compatible_ends("EcoRI", "EcoRI")
    assert compat is True
    assert "Same enzyme" in msg


def test_compatible_ends_bamhi_bglii():
    compat, _ = check_compatible_ends("BamHI", "BglII")
    assert compat is True


def test_compatible_ends_bamhi_bcli():
    compat, _ = check_compatible_ends("BamHI", "BclI")
    assert compat is True


def test_compatible_ends_incompatible():
    compat, _ = check_compatible_ends("EcoRI", "BamHI")
    assert compat is False


def test_compatible_ends_xbai_spei():
    compat, _ = check_compatible_ends("XbaI", "SpeI")
    assert compat is True


def test_design_re_primers():
    insert = "ATCGATCG" * 50  # 400 bp
    result = design_re_primers(insert, "EcoRI", "BamHI")

    assert result.enzyme_5prime == "EcoRI"
    assert result.enzyme_3prime == "BamHI"
    assert result.directional is True
    # EcoRI (AATT) and BamHI (GATC) produce different overhangs — NOT compatible
    # but that's fine for directional cloning (insert goes into vector cut with both)
    assert len(result.primers) == 2
    # Forward primer should contain EcoRI site
    assert "GAATTC" in result.primers[0].sequence
    # Reverse primer should contain BamHI site (or its RC)
    assert "GGATCC" in result.primers[1].sequence or "GGATCC" in result.primers[1].tail_sequence


def test_design_re_primers_internal_site_warning():
    # Insert contains internal EcoRI site
    insert = "ATCG" * 10 + "GAATTC" + "ATCG" * 80
    result = design_re_primers(insert, "EcoRI", "BamHI")
    assert any("Internal" in w for w in result.warnings)

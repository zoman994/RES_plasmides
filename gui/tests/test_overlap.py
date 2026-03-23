"""Tests for overlap designer and Tm calculations."""

from pvcs.overlap import design_overlaps
from pvcs.utils import calc_tm, gc_content


# --- Tm calculation ---

def test_calc_tm_basic():
    # 20-mer with known Tm range
    tm = calc_tm("ATCGATCGATCGATCGATCG")
    assert 40.0 < tm < 70.0


def test_calc_tm_gc_rich():
    tm_gc = calc_tm("GCGCGCGCGCGCGCGCGCGC")  # all GC
    tm_at = calc_tm("ATATATATATATATATATATAT")  # all AT
    assert tm_gc > tm_at  # GC-rich should have higher Tm


def test_calc_tm_short_primer():
    tm = calc_tm("AT")
    assert tm < 20.0  # very short → low Tm


def test_calc_tm_single_base():
    tm = calc_tm("A")
    assert tm == 0.0


# --- GC content ---

def test_gc_content():
    assert gc_content("GCGCGCGC") == 1.0
    assert gc_content("ATATATATAT") == 0.0
    assert gc_content("ATGC") == 0.5
    assert gc_content("") == 0.0


# --- Overlap design ---

def test_design_overlaps_3_fragments():
    """Design overlaps for a 3-fragment assembly."""
    seq = "A" * 850 + "T" * 900 + "G" * 740  # 2490 bp
    split_points = [850, 1750]

    result = design_overlaps(seq, split_points, overlap_length=22, circular=True)

    # 2 explicit split points + implicit origin (0) for circular = 3 fragments, 3 overlap zones
    assert len(result.fragments) == 3
    assert len(result.overlap_zones) == 3
    # Each overlap should have Tm calculated
    for z in result.overlap_zones:
        assert z.tm > 0
        assert z.length >= 18


def test_design_overlaps_2_fragments_linear():
    seq = "ATCG" * 500  # 2000 bp
    split_points = [1000]

    result = design_overlaps(seq, split_points, overlap_length=20, circular=False)

    assert len(result.fragments) == 2
    assert len(result.overlap_zones) == 1


def test_design_overlaps_primers_generated():
    seq = "ATCG" * 625  # 2500 bp
    split_points = [800, 1600]

    result = design_overlaps(seq, split_points, overlap_length=22, circular=True)

    # Should generate 2 primers per fragment (fwd + rev) = 6 primers
    assert len(result.primers) == 6
    # Check primer properties
    for p in result.primers:
        assert p.length > 0
        assert p.tm_binding > 0
        assert p.direction in ("forward", "reverse")


def test_design_overlaps_tm_target():
    """Overlap Tm should be close to target."""
    # Use a sequence with mixed composition for realistic Tm
    seq = "ATCGATCG" * 312 + "ATCG"  # 2500 bp
    split_points = [1000]

    result = design_overlaps(seq, split_points, tm_target=55.0, circular=False)

    for z in result.overlap_zones:
        # Tm should be within reasonable range of target
        assert z.tm > 40.0


def test_design_overlaps_warnings():
    """Low-GC overlaps should generate warnings."""
    # Sequence where split point lands in AT-rich region
    seq = "A" * 1000 + "GCGC" * 250  # AT-rich first half
    split_points = [500]  # split in AT-rich region

    result = design_overlaps(seq, split_points, circular=False)

    # Should warn about low GC
    gc_warnings = [w for w in result.warnings if "GC" in w.upper()]
    assert len(gc_warnings) >= 1


def test_design_overlaps_no_split_points_raises():
    """Should raise ValueError with no valid split points."""
    import pytest
    seq = "ATCG" * 100
    with pytest.raises(ValueError):
        design_overlaps(seq, [], circular=False)

"""Tests for the semantic diff engine — the most critical test file."""

from pvcs.diff import semantic_diff
from pvcs.parser import parse_genbank
from pvcs.models import Revision, Feature
from pvcs.utils import sequence_checksum


def _make_revision(sequence, features, version="1.0"):
    """Helper to create a Revision from raw data."""
    return Revision(
        id=f"rev-{version}",
        construct_id="test-construct",
        version=version,
        sequence=sequence,
        features=features,
        length=len(sequence),
        checksum=sequence_checksum(sequence),
    )


# --- Identical sequences → no changes ---

def test_diff_identical_sequences(simple_v1_gb):
    seq, features, _ = parse_genbank(simple_v1_gb)
    rev_a = _make_revision(seq, features, "1.0")
    rev_b = _make_revision(seq, features, "1.1")

    result = semantic_diff(rev_a, rev_b)

    assert len(result.changes) == 0
    assert "No changes" in result.summary


# --- Single point mutation ---

def test_diff_point_mutation(simple_v1_gb, simple_v2_gb):
    seq_a, feats_a, _ = parse_genbank(simple_v1_gb)
    seq_b, feats_b, _ = parse_genbank(simple_v2_gb)

    rev_a = _make_revision(seq_a, feats_a, "1.0")
    rev_b = _make_revision(seq_b, feats_b, "1.1")

    result = semantic_diff(rev_a, rev_b)

    assert len(result.changes) >= 1

    # Find the point mutation
    mutations = [c for c in result.changes if c.type == "point_mutation"]
    assert len(mutations) == 1

    mut = mutations[0]
    assert mut.sequence_a == "A"
    assert mut.sequence_b == "G"
    # Should mention CDS since mutation is inside testGene
    assert mut.affected_feature is not None
    assert "CDS" in mut.affected_feature


# --- Insertion (200 bp cassette) ---

def test_diff_insertion(simple_v1_gb, simple_v3_gb):
    seq_a, feats_a, _ = parse_genbank(simple_v1_gb)
    seq_b, feats_b, _ = parse_genbank(simple_v3_gb)

    rev_a = _make_revision(seq_a, feats_a, "1.0")
    rev_b = _make_revision(seq_b, feats_b, "1.1")

    result = semantic_diff(rev_a, rev_b)

    assert len(result.changes) >= 1

    # Should detect an insertion
    insertions = [c for c in result.changes if c.type == "insertion"]
    assert len(insertions) >= 1

    # Total bp delta should be +200
    total_delta = sum(c.length_b - c.length_a for c in result.changes)
    assert total_delta == 200


# --- Deletion ---

def test_diff_deletion():
    """Create two revisions where a feature is deleted."""
    seq_a = "ATGCCC" + "A" * 300 + "GGGCAT" + "T" * 200  # 512 bp
    seq_b = "ATGCCC" + "GGGCAT" + "T" * 200                # 212 bp (deleted 300 bp)

    feats_a = [
        Feature(type="CDS", name="gene1", start=1, end=6, strand=1, sequence="ATGCCC"),
        Feature(type="misc_feature", name="spacer", start=7, end=306, strand=1, sequence="A" * 300),
    ]
    feats_b = [
        Feature(type="CDS", name="gene1", start=1, end=6, strand=1, sequence="ATGCCC"),
    ]

    rev_a = _make_revision(seq_a, feats_a, "1.0")
    rev_b = _make_revision(seq_b, feats_b, "1.1")

    result = semantic_diff(rev_a, rev_b)

    assert len(result.changes) >= 1

    deletions = [c for c in result.changes if c.type == "deletion"]
    assert len(deletions) >= 1

    total_delta = sum(c.length_b - c.length_a for c in result.changes)
    assert total_delta == -300


# --- Promoter swap (replacement) ---

def test_diff_replacement():
    """Replace promoter (first 300 bp) with a different promoter."""
    promoter_a = "AAAA" * 75  # 300 bp
    promoter_b = "CCCC" * 75  # 300 bp (different)
    cds = "ATG" + "GCT" * 99  # 300 bp CDS
    rest = "T" * 400

    seq_a = promoter_a + cds + rest
    seq_b = promoter_b + cds + rest

    feats_a = [
        Feature(type="promoter", name="PglaA", start=1, end=300, strand=1, sequence=promoter_a),
        Feature(type="CDS", name="testCDS", start=301, end=600, strand=1, sequence=cds),
    ]
    feats_b = [
        Feature(type="promoter", name="PgpdA", start=1, end=300, strand=1, sequence=promoter_b),
        Feature(type="CDS", name="testCDS", start=301, end=600, strand=1, sequence=cds),
    ]

    rev_a = _make_revision(seq_a, feats_a, "1.0")
    rev_b = _make_revision(seq_b, feats_b, "1.1")

    result = semantic_diff(rev_a, rev_b)

    assert len(result.changes) >= 1
    # The promoter region is completely different → should be replacement
    replacements = [c for c in result.changes if c.type == "replacement"]
    assert len(replacements) >= 1


# --- Summary format ---

def test_diff_summary_format(simple_v1_gb, simple_v2_gb):
    seq_a, feats_a, _ = parse_genbank(simple_v1_gb)
    seq_b, feats_b, _ = parse_genbank(simple_v2_gb)

    rev_a = _make_revision(seq_a, feats_a, "1.0")
    rev_b = _make_revision(seq_b, feats_b, "1.1")

    result = semantic_diff(rev_a, rev_b)

    assert result.version_a == "1.0"
    assert result.version_b == "1.1"
    assert "change" in result.summary
    assert "bp" in result.summary

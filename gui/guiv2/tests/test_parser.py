"""Tests for GenBank parsing."""

from pvcs.parser import parse_genbank, genbank_to_revision, write_genbank


def test_parse_genbank_returns_sequence_and_features(simple_v1_gb):
    seq, features, metadata = parse_genbank(simple_v1_gb)

    assert len(seq) == 3000
    assert seq == seq.upper()
    assert len(features) == 3

    # Check feature types
    types = [f.type for f in features]
    assert "promoter" in types
    assert "CDS" in types
    assert "terminator" in types


def test_parse_genbank_metadata(simple_v1_gb):
    _, _, metadata = parse_genbank(simple_v1_gb)

    assert metadata["topology"] == "circular"
    assert metadata["molecule_type"] == "DNA"


def test_parse_genbank_feature_positions(simple_v1_gb):
    _, features, _ = parse_genbank(simple_v1_gb)

    promoter = [f for f in features if f.type == "promoter"][0]
    assert promoter.start == 1
    assert promoter.end == 300
    assert promoter.strand == 1
    assert promoter.name == "PglaA"

    cds = [f for f in features if f.type == "CDS"][0]
    assert cds.start == 301
    assert cds.end == 1200


def test_parse_genbank_feature_sequence(simple_v1_gb):
    seq, features, _ = parse_genbank(simple_v1_gb)

    cds = [f for f in features if f.type == "CDS"][0]
    assert cds.sequence.startswith("ATG")
    assert len(cds.sequence) == 900


def test_genbank_to_revision(simple_v1_gb):
    rev = genbank_to_revision(simple_v1_gb, "construct-1", "1.0",
                              message="Test import", author="Tester")

    assert rev.construct_id == "construct-1"
    assert rev.version == "1.0"
    assert rev.length == 3000
    assert rev.message == "Test import"
    assert rev.author == "Tester"
    assert len(rev.checksum) == 64  # SHA-256 hex
    assert len(rev.features) == 3


def test_write_and_reparse_genbank(tmp_path, simple_v1_gb):
    seq, features, _ = parse_genbank(simple_v1_gb)

    out = tmp_path / "roundtrip.gb"
    write_genbank(out, seq, features, name="roundtrip", topology="circular")

    seq2, features2, meta2 = parse_genbank(out)
    assert seq2 == seq
    assert len(features2) == len(features)
    assert meta2["topology"] == "circular"

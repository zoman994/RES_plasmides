"""Tests for feature_db auto-annotation database."""

from pvcs.feature_db import (
    KNOWN_FEATURES,
    detect_known_features,
    get_feature_by_name,
    list_features_by_type,
)


def test_known_features_count():
    assert len(KNOWN_FEATURES) >= 20


def test_known_features_have_sequences():
    for kf in KNOWN_FEATURES:
        assert len(kf.sequence) >= 50, f"{kf.name} sequence too short ({len(kf.sequence)})"
        assert kf.sequence == kf.sequence.upper(), f"{kf.name} sequence not uppercase"


def test_known_features_types():
    types = set(kf.type for kf in KNOWN_FEATURES)
    assert "CDS" in types
    assert "promoter" in types
    assert "terminator" in types
    assert "origin" in types or "rep_origin" in types


def test_get_feature_by_name():
    amp = get_feature_by_name("AmpR")
    assert amp is not None
    assert amp.type == "CDS"
    assert len(amp.sequence) > 100


def test_get_feature_by_name_not_found():
    result = get_feature_by_name("NonexistentFeature12345")
    assert result is None


def test_list_features_by_type():
    cds = list_features_by_type("CDS")
    assert len(cds) >= 5
    assert all(f.type == "CDS" for f in cds)


def test_detect_in_known_sequence():
    """AmpR sequence should detect itself."""
    amp = get_feature_by_name("AmpR")
    if amp:
        # Embed AmpR in a larger sequence
        test_seq = "A" * 500 + amp.sequence + "T" * 500
        hits = detect_known_features(test_seq)
        amp_hits = [h for h in hits if h["name"] == "AmpR"]
        assert len(amp_hits) >= 1
        assert amp_hits[0]["strand"] == 1


def test_detect_empty_sequence():
    hits = detect_known_features("")
    assert len(hits) == 0


def test_detect_no_match():
    # Random sequence unlikely to match any known feature
    hits = detect_known_features("AAAA" * 500)
    assert len(hits) == 0

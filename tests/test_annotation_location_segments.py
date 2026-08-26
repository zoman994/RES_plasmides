"""ANN-0A — backend half of the canonical annotation location contract.

The frontend owns `lib/annotation-location.js`; these tests pin the Python side
of the same contract, where BG-028 also lived:

  * `snapgene_parser` collapsed every `<Segment>` to `min(start)..max(end)`;
  * `_bio_feature_to_pvcs` kept only BioPython's min..max envelope for a
    `CompoundLocation`;
  * neither carried segments far enough to reach the frontend store.

Convention on this side of the boundary: `Feature.start` / `Feature.end` and
every entry of `Feature.segments` are 1-based inclusive. `gui/api/server.py`
applies the single `-1` that converts them to the frontend's 0-based half-open
form.
"""

from Bio.Seq import Seq
from Bio.SeqFeature import CompoundLocation, SeqFeature, SimpleLocation

from pvcs.parser import _bio_feature_to_pvcs


def _seq(n: int) -> str:
    return ("ACGT" * (n // 4 + 1))[:n]


def test_simple_location_is_unchanged():
    feat = SeqFeature(SimpleLocation(0, 10, strand=1), type="CDS")
    out = _bio_feature_to_pvcs(feat, _seq(200))
    assert (out.start, out.end) == (1, 10)
    assert out.segments == []
    assert out.location_kind == "single"


def test_complement_keeps_coordinates_and_records_strand():
    feat = SeqFeature(SimpleLocation(0, 10, strand=-1), type="CDS")
    out = _bio_feature_to_pvcs(feat, _seq(200))
    assert (out.start, out.end) == (1, 10)
    assert out.strand == -1


def test_linear_join_keeps_every_segment():
    loc = CompoundLocation(
        [SimpleLocation(100, 150, strand=1), SimpleLocation(200, 250, strand=1)]
    )
    out = _bio_feature_to_pvcs(SeqFeature(loc, type="CDS"), _seq(500))
    assert out.segments == [(101, 150), (201, 250)]
    assert out.location_kind in ("join", "order")
    # bounding span is still the projection for a NON-wrapping join
    assert (out.start, out.end) == (101, 250)


def test_circular_origin_crossing_join_is_not_flattened():
    """The BG-028 core case: a 130 bp wrapping CDS must not become 5000 bp."""
    loc = CompoundLocation(
        [SimpleLocation(4900, 5000, strand=1), SimpleLocation(0, 30, strand=1)]
    )
    out = _bio_feature_to_pvcs(SeqFeature(loc, type="CDS"), _seq(5000))

    assert out.segments == [(4901, 5000), (1, 30)]
    # summed segment length, not the envelope
    assert sum(e - s + 1 for s, e in out.segments) == 130
    # wrap sentinel: end <= start, NOT 1..5000
    assert (out.start, out.end) == (4901, 30)
    assert out.end <= out.start


def test_minus_strand_compound_is_stored_in_forward_order():
    """Strand is separate from coordinates — segments never come back reversed."""
    loc = CompoundLocation(
        [SimpleLocation(200, 250, strand=-1), SimpleLocation(100, 150, strand=-1)]
    )
    out = _bio_feature_to_pvcs(SeqFeature(loc, type="CDS"), _seq(500))
    assert out.strand == -1
    assert out.segments == [(101, 150), (201, 250)]


def test_real_snapgene_file_reaches_features_with_segments():
    """Production path: pUC19.dna → parse_snapgene → Feature.segments.

    Exercises the real `snapgene_parser` → `pvcs.parser` conversion rather than
    a hand-built dict, so the segment hand-off cannot silently regress.
    """
    from pathlib import Path

    import pytest

    from pvcs.parser import parse_snapgene
    from pvcs.snapgene_parser import parse_dna_file

    path = Path(__file__).parent / "fixtures" / "snapgene" / "pUC19.dna"
    if not path.exists():
        pytest.skip("pUC19.dna fixture not present")

    raw = parse_dna_file(path)
    assert raw and raw["features"], "fixture must yield features"
    seq_len = len(raw["sequence"])

    # every raw segment is a valid 0-based half-open span
    for f in raw["features"]:
        for s in f.get("segments") or []:
            assert 0 <= s["start"] < s["end"] <= seq_len

    sequence, features, _meta = parse_snapgene(path)
    assert features, "parse_snapgene must produce features"
    assert len(sequence) == seq_len

    for feature in features:
        # 1-based inclusive on this side of the boundary
        for s, e in feature.segments:
            assert 1 <= s <= e <= seq_len
        if not feature.segments:
            assert feature.location_kind == "single"


# ── write_genbank round-trip: parse → write → parse ──────────────────────────
#
# ANN-0A corrective P0. `write_genbank` built one scalar FeatureLocation from
# `feat.start`/`feat.end` and ignored `segments` / `location_kind`, so every
# compound location was silently flattened on the way OUT — the exported file
# no longer described the same molecule.


def _roundtrip(tmp_path, sequence, feature, topology="circular"):
    """parse → write_genbank → parse, returning the re-read Feature."""
    from pvcs.parser import parse_genbank, write_genbank

    path = tmp_path / "rt.gb"
    write_genbank(path, sequence, [feature], name="rt", topology=topology)
    _seq_out, features, _meta = parse_genbank(path)
    assert features, "round-trip produced no features"
    return features[0]


def _feature(segments, strand=1, kind="join", ftype="CDS"):
    from pvcs.models import Feature

    return Feature(
        type=ftype,
        name="probe",
        start=segments[0][0],
        end=segments[-1][1],
        strand=strand,
        segments=list(segments),
        location_kind=kind,
    )


def _bio_len(segments):
    return sum(e - s + 1 for s, e in segments)


def test_write_genbank_roundtrips_linear_join(tmp_path):
    segs = [(101, 150), (201, 250)]
    feat = _feature(segs, strand=1, kind="join")
    feat.start, feat.end = 101, 250
    out = _roundtrip(tmp_path, _seq(500), feat, topology="linear")

    assert out.location_kind == "join"
    assert out.segments == segs
    assert out.strand == 1
    assert _bio_len(out.segments) == _bio_len(segs) == 100


def test_write_genbank_roundtrips_linear_order(tmp_path):
    segs = [(101, 150), (201, 250)]
    feat = _feature(segs, strand=1, kind="order")
    feat.start, feat.end = 101, 250
    out = _roundtrip(tmp_path, _seq(500), feat, topology="linear")

    assert out.location_kind == "order", "order must not silently become join"
    assert out.segments == segs


def test_write_genbank_roundtrips_circular_origin_wrap(tmp_path):
    segs = [(4901, 5000), (1, 30)]
    feat = _feature(segs, strand=1, kind="join")
    feat.start, feat.end = 4901, 30  # wrap sentinel
    out = _roundtrip(tmp_path, _seq(5000), feat, topology="circular")

    assert out.segments == segs
    assert out.location_kind == "join"
    assert _bio_len(out.segments) == 130
    assert (out.start, out.end) == (4901, 30)


def test_write_genbank_roundtrips_reverse_strand_compound(tmp_path):
    segs = [(101, 150), (201, 250)]
    feat = _feature(segs, strand=-1, kind="join")
    feat.start, feat.end = 101, 250
    out = _roundtrip(tmp_path, _seq(500), feat, topology="linear")

    assert out.strand == -1
    # coordinates are forward and unflipped; only `strand` records direction
    assert out.segments == segs
    assert _bio_len(out.segments) == 100


def test_write_genbank_rejects_incoherent_feature(tmp_path):
    """Fail-closed: a malformed location must not degrade to a bounding span."""
    import pytest

    from pvcs.models import Feature
    from pvcs.parser import write_genbank

    bad = Feature(
        type="CDS", name="bad", start=101, end=250, strand=1,
        segments=[(150, 101)],  # reversed segment
        location_kind="join",
    )
    with pytest.raises(ValueError):
        write_genbank(tmp_path / "bad.gb", _seq(500), [bad], name="bad")


def test_forward_traversal_order_does_not_invent_an_order():
    """A shape the model cannot represent is rejected, not silently sorted."""
    import pytest

    from pvcs.parser import _forward_traversal_order

    # two high->low transitions == not a single origin crossing
    with pytest.raises(ValueError):
        _forward_traversal_order([(400, 410), (1, 10), (100, 110), (5, 8)], 1)


def test_rotate_features_preserves_segments_and_kind():
    """pvcs.diff rotation must not drop the canonical location."""
    from pvcs.diff import _rotate_features

    feat = _feature([(101, 150), (201, 250)], strand=1, kind="order")
    feat.start, feat.end = 101, 250
    # offset must be non-zero — `_rotate_features` short-circuits on 0, which
    # would make this assertion decorative.
    rotated = _rotate_features([feat], offset=25, seq_len=500)
    assert rotated[0].segments == [(76, 125), (176, 225)]
    assert rotated[0].location_kind == "order"


def test_seq_helper_is_sane():
    assert len(_seq(5000)) == 5000
    assert str(Seq(_seq(8))) == "ACGTACGT"

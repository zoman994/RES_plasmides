"""Tests for intron parsing and detection."""

import tempfile
from pathlib import Path

from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from Bio.SeqFeature import SeqFeature, FeatureLocation, CompoundLocation
from Bio import SeqIO

from pvcs.parser import parse_genbank
from pvcs.intron_detection import generate_exon_fusion_fragments


def test_parse_join_location(tmp_path):
    """CDS with join(1..200,350..800,950..1200) should detect introns."""
    seq = "A" * 1200
    record = SeqRecord(Seq(seq), id="test", name="test",
                       annotations={"topology": "linear", "molecule_type": "DNA"})
    # join(0..200, 349..800, 949..1200) in 0-based BioPython coords
    parts = [
        FeatureLocation(0, 200, strand=1),
        FeatureLocation(349, 800, strand=1),
        FeatureLocation(949, 1200, strand=1),
    ]
    loc = CompoundLocation(parts)
    record.features.append(
        SeqFeature(loc, type="CDS", qualifiers={"gene": ["testGene"]})
    )

    gb = tmp_path / "intron_test.gb"
    SeqIO.write(record, gb, "genbank")

    sequence, features, meta = parse_genbank(gb)

    cds = [f for f in features if f.type == "CDS"]
    assert len(cds) == 1

    f = cds[0]
    assert f.has_introns is True
    assert len(f.exons) == 3
    assert len(f.introns) == 2

    # Exon boundaries (1-based)
    assert f.exons[0] == (1, 200)
    assert f.exons[1] == (350, 800)
    assert f.exons[2] == (950, 1200)

    # Intron boundaries (1-based)
    assert f.introns[0] == (201, 349)
    assert f.introns[1] == (801, 949)


def test_no_introns_simple_location(tmp_path):
    """Simple CDS (not join) should have no introns."""
    seq = "ATGGCTAAA" * 100
    record = SeqRecord(Seq(seq), id="test", name="test",
                       annotations={"topology": "circular", "molecule_type": "DNA"})
    record.features.append(
        SeqFeature(FeatureLocation(0, 900, strand=1), type="CDS",
                   qualifiers={"gene": ["simple"]})
    )

    gb = tmp_path / "no_intron.gb"
    SeqIO.write(record, gb, "genbank")
    _, features, _ = parse_genbank(gb)

    cds = [f for f in features if f.type == "CDS"][0]
    assert cds.has_introns is False
    assert len(cds.exons) == 0
    assert len(cds.introns) == 0


def test_exon_fusion_fragments():
    """Generate overlap PCR fragments to fuse 3 exons."""
    genomic = "A" * 200 + "N" * 149 + "T" * 451 + "N" * 149 + "G" * 251

    exons = [
        {"start": 1, "end": 200, "length": 200},
        {"start": 350, "end": 800, "length": 451},
        {"start": 950, "end": 1200, "length": 251},
    ]

    result = generate_exon_fusion_fragments(genomic, exons, overlap_length=30)

    assert len(result["fragments"]) == 3
    assert len(result["junctions"]) == 2
    assert result["intronsRemoved"] == 2

    # Each fragment is an exon sequence
    assert result["fragments"][0]["name"] == "exon_1"
    assert result["fragments"][0]["length"] == 200
    assert result["fragments"][2]["length"] == 251

    # Junctions bridge exons (no intron sequence)
    for j in result["junctions"]:
        assert j["type"] == "overlap"
        assert j["isExonJunction"] is True
        assert j["removedIntronLength"] > 0

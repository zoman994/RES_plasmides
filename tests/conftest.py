"""Shared test fixtures for PlasmidVCS."""

import json
import pytest
from pathlib import Path

from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from Bio.SeqFeature import SeqFeature, FeatureLocation
from Bio import SeqIO

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixtures_dir():
    return FIXTURES_DIR


@pytest.fixture
def tmp_project(tmp_path):
    """Create a temporary PlasmidVCS project directory with config."""
    from pvcs.config import init_project

    root = init_project(tmp_path, "Test Project", author="Test User")
    return root


@pytest.fixture
def simple_v1_gb(tmp_path):
    """Generate a simple synthetic construct v1 (3000 bp, circular, 3 features)."""
    # Promoter (1-300), CDS (301-1200), Terminator (1201-1500)
    # Plus backbone (1501-3000)
    promoter_seq = "A" * 100 + "TATAAAT" + "G" * 93 + "C" * 100
    cds_seq = "ATGGCTAAAGCTGCTCCTAGCGCTAAAGCTCAG" + "A" * 867  # starts with ATG
    terminator_seq = "T" * 150 + "AATAAA" + "T" * 144
    backbone_seq = "GCGC" * 375  # 1500 bp

    full_seq = promoter_seq + cds_seq + terminator_seq + backbone_seq
    assert len(full_seq) == 3000

    record = SeqRecord(
        Seq(full_seq),
        id="test_v1",
        name="pTEST",
        description="Test construct v1",
        annotations={"topology": "circular", "molecule_type": "DNA"},
    )
    record.features = [
        SeqFeature(FeatureLocation(0, 300, strand=1), type="promoter",
                   qualifiers={"label": ["PglaA"], "note": ["test promoter"]}),
        SeqFeature(FeatureLocation(300, 1200, strand=1), type="CDS",
                   qualifiers={"gene": ["testGene"], "product": ["test protein"],
                               "codon_start": [1]}),
        SeqFeature(FeatureLocation(1200, 1500, strand=1), type="terminator",
                   qualifiers={"label": ["TtrpC"], "note": ["test terminator"]}),
    ]

    path = tmp_path / "simple_v1.gb"
    SeqIO.write(record, path, "genbank")
    return path


@pytest.fixture
def simple_v2_gb(tmp_path, simple_v1_gb):
    """Same construct as v1, but with a point mutation in CDS (pos 310: A→G)."""
    record = SeqIO.read(simple_v1_gb, "genbank")
    seq = list(str(record.seq))
    # Point mutation at position 333 (0-based) = CDS position 33, codon 11
    # CDS starts at 300, so offset 33 is in the 'A' * 867 region
    # Codon: AAA → GAA → K11E (Lys → Glu)
    seq[333] = "G"  # was A
    record.seq = Seq("".join(seq))

    path = tmp_path / "simple_v2.gb"
    SeqIO.write(record, path, "genbank")
    return path


@pytest.fixture
def simple_v3_gb(tmp_path, simple_v1_gb):
    """Same construct as v1, but with a 200 bp cassette inserted at pos 1200."""
    record = SeqIO.read(simple_v1_gb, "genbank")
    seq = str(record.seq)
    insert = "CCGG" * 50  # 200 bp insert
    new_seq = seq[:1200] + insert + seq[1200:]

    new_record = SeqRecord(
        Seq(new_seq),
        id="test_v3",
        name="pTEST",
        description="Test construct v3 with insertion",
        annotations={"topology": "circular", "molecule_type": "DNA"},
    )
    # Copy features from v1
    new_record.features = list(record.features)
    # Add new feature for the insert
    new_record.features.append(
        SeqFeature(FeatureLocation(1200, 1400, strand=1), type="misc_feature",
                   qualifiers={"label": ["inserted_cassette"], "note": ["test insertion"]})
    )

    path = tmp_path / "simple_v3.gb"
    SeqIO.write(new_record, path, "genbank")
    return path


@pytest.fixture
def assembly_3frag_gb(tmp_path):
    """A construct assembled from 3 fragments for assembly tests.

    Fragment 1 (promoter): 1-850
    Fragment 2 (CDS): 851-1750
    Fragment 3 (terminator): 1751-2490
    """
    frag1 = "A" * 425 + "TATAAAT" + "G" * 418  # 850 bp promoter
    frag2 = "ATG" + "GCTAAA" * 149 + "TAA"     # 900 bp CDS
    frag3 = "T" * 370 + "AATAAA" + "T" * 364   # 740 bp terminator

    full_seq = frag1 + frag2 + frag3
    assert len(full_seq) == 2490

    record = SeqRecord(
        Seq(full_seq),
        id="assembly_3frag",
        name="pASM3",
        description="3-fragment overlap PCR assembly",
        annotations={"topology": "circular", "molecule_type": "DNA"},
    )
    record.features = [
        SeqFeature(FeatureLocation(0, 850, strand=1), type="promoter",
                   qualifiers={"label": ["PglaA"]}),
        SeqFeature(FeatureLocation(850, 1750, strand=1), type="CDS",
                   qualifiers={"gene": ["XynTL"], "product": ["xylanase"]}),
        SeqFeature(FeatureLocation(1750, 2490, strand=1), type="terminator",
                   qualifiers={"label": ["TtrpC"]}),
    ]

    path = tmp_path / "assembly_3frag.gb"
    SeqIO.write(record, path, "genbank")
    return path


@pytest.fixture
def puc19_gb(tmp_path):
    """Simplified pUC19-like reference plasmid (2686 bp)."""
    # Generate a realistic-length sequence with some recognizable sites
    backbone = "GAATTC" + "A" * 500 + "GGATCC" + "T" * 500  # EcoRI ... BamHI
    amp_r = "ATG" + "GCT" * 299 + "TAA"  # 900 bp ampR CDS
    ori = "CCCGGG" + "G" * 294  # 300 bp ori region
    rest = "ACGT" * ((2686 - len(backbone) - len(amp_r) - len(ori)) // 4)

    full_seq = (backbone + amp_r + ori + rest)[:2686]

    record = SeqRecord(
        Seq(full_seq),
        id="pUC19",
        name="pUC19",
        description="pUC19 cloning vector",
        annotations={"topology": "circular", "molecule_type": "DNA"},
    )
    record.features = [
        SeqFeature(FeatureLocation(0, 50, strand=1), type="misc_feature",
                   qualifiers={"label": ["MCS"], "note": ["multiple cloning site"]}),
        SeqFeature(FeatureLocation(len(backbone), len(backbone) + len(amp_r), strand=1),
                   type="CDS",
                   qualifiers={"gene": ["ampR"], "product": ["beta-lactamase"]}),
        SeqFeature(FeatureLocation(len(backbone) + len(amp_r),
                                   len(backbone) + len(amp_r) + len(ori), strand=1),
                   type="rep_origin",
                   qualifiers={"label": ["ori"]}),
    ]

    path = tmp_path / "pUC19.gb"
    SeqIO.write(record, path, "genbank")
    return path

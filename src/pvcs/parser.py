"""GenBank / FASTA parsing via BioPython.

Converts GenBank files into pvcs data structures (Revision, Feature).
"""

from __future__ import annotations

from pathlib import Path

from Bio import SeqIO
from Bio.SeqFeature import SeqFeature
from Bio.SeqRecord import SeqRecord

from pvcs.models import Feature, Revision, _new_id, _now
from pvcs.utils import sequence_checksum

# ── Feature type inference from name patterns ──

PROMOTER_PATTERNS = [
    "pgla", "pgpd", "pcbh", "ppdc", "ptef", "peno", "ppki",
    "paox", "pgap", "ptdh", "padh", "pcyc",
    "plac", "ptac", "pt7", "pt5", "para", "ptrp",
    "pcmv", "pef1", "psv40", "pcag", "pubq",
    "promoter", "prom",
]
CDS_PATTERNS = [
    "hygr", "ampr", "kanr", "neor", "zeor", "bsd", "nat", "ble",
    "pyrg", "pyrf", "amds", "hph", "aph",
    "cas9", "cas12", "cpf1",
    "gfp", "rfp", "yfp", "cfp", "mcherry", "egfp",
    "lacz", "bgal", "bgii", "bgl1", "cbhi", "xynl", "phyp", "chym",
    "amy", "glucoamylase", "amylase", "xylanase", "lipase",
    "exonuclease", "ligase", "polymerase",
    "orf", "cds",
]
TERMINATOR_PATTERNS = [
    "ttrpc", "tgla", "tcyc", "tadh", "taox", "tnos",
    "t7term", "terminator", "term",
]
ORIGIN_PATTERNS = [
    "ori", "origin", "ama1", "ars", "cen",
    "cole1", "pbr322", "p15a",
]


def infer_feature_type(name: str, ftype: str) -> str:
    """Infer real feature type from name if type is generic (misc_feature/gene)."""
    if ftype not in ("misc_feature", "gene", ""):
        return ftype
    nl = name.lower().strip()
    if nl == "p":
        return "promoter"
    if nl == "t":
        return "terminator"
    for p in PROMOTER_PATTERNS:
        if p in nl:
            return "promoter"
    for p in TERMINATOR_PATTERNS:
        if p in nl:
            return "terminator"
    for p in ORIGIN_PATTERNS:
        if p in nl:
            return "rep_origin"
    for p in CDS_PATTERNS:
        if p in nl:
            return "CDS"
    return ftype


def infer_all_feature_types(features: list[Feature]) -> list[Feature]:
    """Apply type inference to all features."""
    for f in features:
        f.type = infer_feature_type(f.name, f.type)
    return features


def _extract_feature_name(bio_feature: SeqFeature) -> str:
    """Best-effort feature name from qualifiers."""
    for key in ("gene", "label", "product", "note"):
        vals = bio_feature.qualifiers.get(key, [])
        if vals:
            return vals[0]
    return bio_feature.type


def _bio_feature_to_pvcs(bio_feature: SeqFeature, full_sequence: str) -> Feature:
    """Convert a BioPython SeqFeature into a pvcs Feature."""
    from Bio.SeqFeature import CompoundLocation

    loc = bio_feature.location
    start = int(loc.start) + 1  # BioPython is 0-based; pvcs is 1-based
    end = int(loc.end)
    strand = int(loc.strand) if loc.strand is not None else 1

    # Extract the feature's nucleotide sequence
    feat_seq = str(bio_feature.extract(full_sequence))

    # Convert qualifiers (lists → single values for simple keys)
    qualifiers: dict = {}
    for k, v in bio_feature.qualifiers.items():
        qualifiers[k] = v[0] if len(v) == 1 else v

    color = bio_feature.qualifiers.get("ApEinfo_fwdcolor", [None])[0]

    # Parse exon/intron structure from join() compound locations
    exons: list[tuple[int, int]] = []
    introns: list[tuple[int, int]] = []
    if isinstance(loc, CompoundLocation):
        for part in loc.parts:
            exons.append((int(part.start) + 1, int(part.end)))  # 1-based
        for i in range(len(exons) - 1):
            intron_start = exons[i][1] + 1
            intron_end = exons[i + 1][0] - 1
            if intron_end >= intron_start:
                introns.append((intron_start, intron_end))

    return Feature(
        type=bio_feature.type,
        name=_extract_feature_name(bio_feature),
        start=start,
        end=end,
        strand=strand,
        qualifiers=qualifiers,
        sequence=feat_seq,
        color=color,
        exons=exons,
        introns=introns,
        has_introns=len(introns) > 0,
    )


def parse_genbank(filepath: str | Path) -> tuple[str, list[Feature], dict]:
    """Parse a GenBank file, return (sequence, features, metadata).

    Metadata dict keys: name, description, topology, molecule_type, organism.
    """
    filepath = Path(filepath)
    record: SeqRecord = SeqIO.read(filepath, "genbank")
    full_seq = str(record.seq).upper()

    features = [
        _bio_feature_to_pvcs(f, full_seq)
        for f in record.features
        if f.type != "source"
    ]

    # Infer real types from names (misc_feature → CDS/promoter/terminator)
    features = infer_all_feature_types(features)

    topology = record.annotations.get("topology", "linear")
    metadata = {
        "name": record.name,
        "description": record.description,
        "topology": topology,
        "molecule_type": record.annotations.get("molecule_type", "DNA"),
        "organism": record.annotations.get("organism", ""),
        "accession": record.id,
    }

    return full_seq, features, metadata


def genbank_to_revision(
    filepath: str | Path,
    construct_id: str,
    version: str,
    message: str = "",
    author: str = "",
    parent_revision_id: str | None = None,
) -> Revision:
    """Parse a GenBank file and create a Revision object."""
    sequence, features, metadata = parse_genbank(filepath)

    return Revision(
        id=_new_id(),
        construct_id=construct_id,
        version=version,
        sequence=sequence,
        features=features,
        length=len(sequence),
        message=message,
        author=author,
        parent_revision_id=parent_revision_id,
        genbank_path=str(filepath),
        checksum=sequence_checksum(sequence),
        created_at=_now(),
    )


def write_genbank(
    filepath: str | Path,
    sequence: str,
    features: list[Feature],
    name: str = "construct",
    topology: str = "circular",
    molecule_type: str = "DNA",
) -> None:
    """Write a sequence + features to a GenBank file."""
    from Bio.Seq import Seq
    from Bio.SeqFeature import FeatureLocation

    record = SeqRecord(
        Seq(sequence),
        id=name,
        name=name,
        description=f"{name} exported by PlasmidVCS",
        annotations={
            "topology": topology,
            "molecule_type": molecule_type,
        },
    )

    for feat in features:
        bio_loc = FeatureLocation(
            feat.start - 1,  # pvcs 1-based → BioPython 0-based
            feat.end,
            strand=feat.strand,
        )
        qualifiers = dict(feat.qualifiers) if feat.qualifiers else {}
        if feat.name and "gene" not in qualifiers and "label" not in qualifiers:
            qualifiers["label"] = feat.name
        bio_feat = SeqFeature(bio_loc, type=feat.type, qualifiers=qualifiers)
        record.features.append(bio_feat)

    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    SeqIO.write(record, filepath, "genbank")


def parse_fasta(filepath: str | Path) -> tuple[str, dict]:
    """Parse a FASTA file, return (sequence, metadata)."""
    filepath = Path(filepath)
    record: SeqRecord = SeqIO.read(filepath, "fasta")
    return str(record.seq).upper(), {
        "name": record.id,
        "description": record.description,
    }

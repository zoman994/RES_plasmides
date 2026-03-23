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


def _extract_feature_name(bio_feature: SeqFeature) -> str:
    """Best-effort feature name from qualifiers."""
    for key in ("gene", "label", "product", "note"):
        vals = bio_feature.qualifiers.get(key, [])
        if vals:
            return vals[0]
    return bio_feature.type


def _bio_feature_to_pvcs(bio_feature: SeqFeature, full_sequence: str) -> Feature:
    """Convert a BioPython SeqFeature into a pvcs Feature."""
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

    return Feature(
        type=bio_feature.type,
        name=_extract_feature_name(bio_feature),
        start=start,
        end=end,
        strand=strand,
        qualifiers=qualifiers,
        sequence=feat_seq,
        color=color,
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
        if f.type != "source"  # skip 'source' feature
    ]

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

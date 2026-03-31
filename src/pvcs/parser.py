"""GenBank / FASTA parsing via BioPython.

Converts GenBank files into pvcs data structures (Revision, Feature).
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from Bio import SeqIO
from Bio.SeqFeature import SeqFeature
from Bio.SeqRecord import SeqRecord

logger = logging.getLogger(__name__)

from pvcs.models import Feature, Revision, _new_id, _now
from pvcs.utils import sequence_checksum

# ── Feature type inference from name patterns ──

PROMOTER_PATTERNS = [
    r"\bpgla", r"\bpgpd", r"\bpcbh", r"\bppdc", r"\bptef", r"\bpeno", r"\bppki",
    r"\bpaox", r"\bpgap", r"\bptdh", r"\bpadh", r"\bpcyc",
    r"\bplac", r"\bptac", r"\bpt7\b", r"\bpt5\b", r"\bpara\b", r"\bptrp",
    r"\bpcmv", r"\bpef1", r"\bpsv40", r"\bpcag", r"\bpubq",
    r"\bpromoter\b",
]
CDS_PATTERNS = [
    r"\bhygr\b", r"\bampr\b", r"\bkanr\b", r"\bneor\b", r"\bzeor\b", r"\bbsd\b", r"\bnat\b", r"\bble\b",
    r"\bpyrg\b", r"\bpyrf\b", r"\bamds\b", r"\bhph\b", r"\baph\b",
    r"\bcas9\b", r"\bcas12\b", r"\bcpf1\b",
    r"\bgfp\b", r"\brfp\b", r"\byfp\b", r"\bcfp\b", r"\bmcherry\b", r"\begfp\b",
    r"\blacz\b", r"\bbgal\b", r"\bcbhi?\b", r"\bxyn", r"\bphy",
    r"\bamylase\b", r"\bxylanase\b", r"\blipase\b", r"\bglucoamylase\b",
    r"\borf\d*\b", r"\bcds\b",
]
TERMINATOR_PATTERNS = [
    r"\bttrpc", r"\btgla", r"\btcyc", r"\btadh", r"\btaox", r"\btnos",
    r"\bt7.?term", r"\bterminator\b",
]
ORIGIN_PATTERNS = [
    r"\bori\b", r"\borigin\b", r"\bama1\b", r"\bars\b", r"\bcen\b",
    r"\bcole1\b", r"\bpbr322\b", r"\bp15a\b",
]


def _matches_any(name_lower: str, patterns: list[str]) -> bool:
    """Check if name matches any regex pattern."""
    return any(re.search(p, name_lower) for p in patterns)


def infer_feature_type(name: str, ftype: str) -> str:
    """Infer real feature type from name if type is generic (misc_feature/gene)."""
    if ftype not in ("misc_feature", "gene", ""):
        return ftype
    nl = name.lower().strip()
    if nl == "p":
        return "promoter"
    if nl == "t":
        return "terminator"
    if _matches_any(nl, PROMOTER_PATTERNS):
        return "promoter"
    if _matches_any(nl, TERMINATOR_PATTERNS):
        return "terminator"
    if _matches_any(nl, ORIGIN_PATTERNS):
        return "rep_origin"
    if _matches_any(nl, CDS_PATTERNS):
        return "CDS"
    return ftype


def infer_all_feature_types(features: list[Feature]) -> list[Feature]:
    """Apply type inference to all features."""
    for f in features:
        f.type = infer_feature_type(f.name, f.type)
    return features


def _extract_feature_name(bio_feature: SeqFeature) -> str:
    """Best-effort feature name from qualifiers."""
    for key in ("label", "product", "gene", "note"):
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


def parse_snapgene(filepath: str | Path) -> tuple[str, list[Feature], dict]:
    """Parse a SnapGene .dna file.

    Strategy: BioPython first (fast), snapgene_reader fallback (full features).
    BioPython's snapgene support extracts sequence but often misses features
    from the proprietary .dna format. snapgene_reader handles the full format.

    Returns (sequence, features, metadata) — same shape as parse_genbank().
    """
    filepath = Path(filepath)
    record: SeqRecord = SeqIO.read(filepath, "snapgene")
    full_seq = str(record.seq).upper()

    raw_features = [f for f in record.features if f.type != "source"]
    logger.info(
        "parse_snapgene: BioPython extracted %d features from %s",
        len(raw_features), filepath.name,
    )
    features = []
    for f in raw_features:
        try:
            features.append(_bio_feature_to_pvcs(f, full_seq))
        except Exception as e:
            logger.warning("Skipped feature %s: %s", f.type, e)

    # If BioPython didn't extract features, try snapgene_reader
    if not features:
        try:
            from snapgene_reader import snapgene_file_to_seqrecord

            record2 = snapgene_file_to_seqrecord(str(filepath))
            raw2 = [f for f in record2.features if f.type != "source"]
            logger.info("  snapgene_reader extracted %d features", len(raw2))
            for f in raw2:
                try:
                    features.append(_bio_feature_to_pvcs(f, full_seq))
                except Exception as e:
                    logger.warning("  Skipped feature %s: %s", f.type, e)
        except ImportError:
            logger.warning("  snapgene_reader not installed (pip install snapgene-reader)")
        except Exception as e:
            logger.warning("  snapgene_reader error: %s", e)

    features = infer_all_feature_types(features)

    topology = record.annotations.get("topology", "linear")
    raw_name = record.name or ""
    if not raw_name or raw_name.startswith("<") or raw_name == ".":
        raw_name = record.id or ""
    if not raw_name or raw_name.startswith("<") or raw_name == ".":
        raw_name = (record.description or "").split()[0] if record.description else ""
    if not raw_name or raw_name.startswith("<"):
        raw_name = filepath.stem

    metadata = {
        "name": raw_name,
        "description": record.description or "",
        "topology": topology,
        "molecule_type": record.annotations.get("molecule_type", "DNA"),
        "organism": record.annotations.get("organism", ""),
    }

    return full_seq, features, metadata


def parse_fasta(filepath: str | Path) -> tuple[str, dict]:
    """Parse a FASTA file, return (sequence, metadata)."""
    filepath = Path(filepath)
    record: SeqRecord = SeqIO.read(filepath, "fasta")
    return str(record.seq).upper(), {
        "name": record.id,
        "description": record.description,
    }

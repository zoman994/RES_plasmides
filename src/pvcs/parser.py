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
    segments: list[tuple[int, int]] = []
    location_kind = "single"
    if isinstance(loc, CompoundLocation):
        for part in loc.parts:
            exons.append((int(part.start) + 1, int(part.end)))  # 1-based
        for i in range(len(exons) - 1):
            intron_start = exons[i][1] + 1
            intron_end = exons[i + 1][0] - 1
            if intron_end >= intron_start:
                introns.append((intron_start, intron_end))

        # ANN-0A — keep every segment instead of only BioPython's min..max
        # envelope. Segments are stored in forward-coordinate traversal order
        # with at most one high->low transition (the origin crossing); strand
        # lives separately, so a complement location is NOT stored reversed.
        segments = _forward_traversal_order(exons, strand)
        location_kind = str(getattr(loc, "operator", "join") or "join")
        if location_kind not in ("join", "order"):
            location_kind = "join"

        # The scalar projection mirrors the frontend rule: bounding span
        # normally, `{first.start, last.end}` across the origin so `end <=
        # start` marks the wrap rather than reporting a full-length feature.
        if _has_descent(segments):
            start, end = segments[0][0], segments[-1][1]

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
        segments=segments if len(segments) > 1 else [],
        location_kind=location_kind if len(segments) > 1 else "single",
    )


def _bio_location_for(feat: Feature):
    """Build the BioPython location for one pvcs Feature.

    Fail-closed: a malformed or incoherent location raises rather than silently
    degrading to a bounding span.
    """
    from Bio.SeqFeature import CompoundLocation, SimpleLocation

    strand = -1 if feat.strand == -1 else 1
    segments = list(feat.segments or [])

    if not segments:
        if not isinstance(feat.start, int) or not isinstance(feat.end, int):
            raise ValueError(
                f"write_genbank: feature {feat.name!r} has non-integer coordinates"
            )
        if feat.start < 1 or feat.end < feat.start:
            raise ValueError(
                f"write_genbank: feature {feat.name!r} has an invalid range "
                f"{feat.start}..{feat.end}"
            )
        return SimpleLocation(feat.start - 1, feat.end, strand=strand)

    for s, e in segments:
        if not isinstance(s, int) or not isinstance(e, int):
            raise ValueError(
                f"write_genbank: feature {feat.name!r} has a non-integer segment"
            )
        if s < 1 or e < s:
            raise ValueError(
                f"write_genbank: feature {feat.name!r} has an invalid segment {s}..{e}"
            )

    descents = sum(
        1 for i in range(1, len(segments)) if segments[i][0] < segments[i - 1][0]
    )
    if descents > 1:
        raise ValueError(
            f"write_genbank: feature {feat.name!r} has {descents} high->low "
            "transitions; at most one origin crossing is representable"
        )

    parts = [SimpleLocation(s - 1, e, strand=strand) for s, e in segments]
    # BioPython renders `complement(join(...))` from parts listed in the order
    # they are READ, which for the minus strand is descending. Our model stores
    # forward-coordinate order with strand separate, so reverse only here.
    if strand == -1:
        parts = list(reversed(parts))
    operator = "order" if feat.location_kind == "order" else "join"
    return CompoundLocation(parts, operator=operator)


def _has_descent(segments: list[tuple[int, int]]) -> bool:
    """True when the segment list steps back to a lower coordinate."""
    return any(segments[i][0] < segments[i - 1][0] for i in range(1, len(segments)))


def _forward_traversal_order(
    segments: list[tuple[int, int]], strand: int
) -> list[tuple[int, int]]:
    """Order segments 5'->3' over FORWARD coordinates, at most one origin crossing.

    BioPython lists the parts of a `complement(join(...))` in translation order,
    i.e. descending. Our model keeps coordinates forward and strand separate, so
    a minus-strand compound location is reversed back to ascending here.

    Fail-closed: if the result still steps back more than once it is not a single
    origin crossing, and the model has no way to represent it. Sorting would
    invent an order the source never stated, so the shape is rejected instead.
    """
    ordered = list(reversed(segments)) if strand == -1 else list(segments)
    descents = sum(
        1 for i in range(1, len(ordered)) if ordered[i][0] < ordered[i - 1][0]
    )
    if descents > 1:
        raise ValueError(
            f"unsupported location: {descents} high->low transitions; at most "
            "one origin crossing can be represented"
        )
    return ordered


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
    """Write a sequence + features to a GenBank file.

    ANN-0A — a feature carrying `segments` is written as the matching compound
    location (`join(...)` / `order(...)`), including across the origin. Writing
    only `start..end` would flatten a spliced gene onto its own intron and turn
    an origin-crossing feature into a near-full-length one, so the exported file
    would no longer describe the same molecule.
    """
    from Bio.Seq import Seq

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
        bio_loc = _bio_location_for(feat)
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

    Strategy:
      1. Own binary parser (pvcs.snapgene_parser) — reliable, extracts features correctly
      2. BioPython fallback — only if own parser fails

    Returns (sequence, features, metadata) — same shape as parse_genbank().
    """
    filepath = Path(filepath)

    # ====== PRIMARY: Our own .dna binary parser ======
    try:
        from pvcs.snapgene_parser import parse_dna_file

        parsed = parse_dna_file(filepath)
        # ANN-0I — a valid but FEATURELESS .dna must stay here. Requiring
        # features sent such a file to the BioPython fallback, which drops the
        # primer packet and the topology flag we just recovered.
        if parsed and parsed.get('sequence'):
            full_seq = parsed['sequence']
            features = []
            for pf in parsed['features']:
                feat_seq = pf.get('sequence', '')
                if not feat_seq and full_seq and pf.get('start') is not None:
                    s, e = pf['start'], pf.get('end', pf['start'])
                    feat_seq = full_seq[s:e]
                # ANN-0A — carry SnapGene's own segment list through in the same
                # 1-based inclusive convention as start/end, so a spliced or
                # origin-crossing feature is not flattened at this boundary.
                raw_segments = pf.get('segments') or []
                segments = [(s['start'] + 1, s['end']) for s in raw_segments]
                features.append(Feature(
                    type=pf.get('type', 'misc_feature'),
                    name=pf.get('name', 'unknown'),
                    start=pf.get('start', 0) + 1,  # convert 0-based → 1-based
                    end=pf.get('end', 0),
                    strand=pf.get('strand', 1),
                    # ANN-0I — the binary parser now recovers every qualifier;
                    # dropping them here was the second half of the loss.
                    qualifiers=dict(pf.get('qualifiers') or {}),
                    sequence=feat_seq,
                    color=pf.get('color'),
                    segments=segments if len(segments) > 1 else [],
                    location_kind='join' if len(segments) > 1 else 'single',
                ))

            features = infer_all_feature_types(features)

            raw_name = parsed.get('name', '') or filepath.stem
            metadata = {
                "name": raw_name,
                "description": parsed.get('description', ''),
                "topology": parsed.get('topology', 'linear'),
                "molecule_type": "DNA",
                "organism": parsed.get('organism', ''),
                # ANN-0I — embedded oligos ride in the metadata so the API can
                # forward them to the canonical primer pool. Previously the
                # whole primer packet was discarded here.
                "primers": list(parsed.get('primers') or []),
                # Parser-level refusals travel with the molecule so the UI can
                # report a partial import.
                "rejected": list(parsed.get('rejected') or []),
            }

            logger.info(
                "parse_snapgene (own parser): %d features from %s",
                len(features), filepath.name,
            )
            return full_seq, features, metadata

    except Exception as e:
        logger.warning("Own .dna parser failed for %s: %s, trying BioPython", filepath.name, e)

    # ====== FALLBACK: BioPython ======
    record: SeqRecord = SeqIO.read(filepath, "snapgene")
    full_seq = str(record.seq).upper()

    raw_features = [f for f in record.features if f.type != "source"]
    logger.info(
        "parse_snapgene (BioPython): %d features from %s",
        len(raw_features), filepath.name,
    )
    features = []
    for f in raw_features:
        try:
            features.append(_bio_feature_to_pvcs(f, full_seq))
        except Exception as e:
            logger.warning("Skipped feature %s: %s", f.type, e)

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

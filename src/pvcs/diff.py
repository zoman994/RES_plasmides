"""Semantic diff engine for PlasmidVCS.

Three layers:
  Layer 1: sequence alignment (Needleman-Wunsch via BioPython)
  Layer 2: map raw changes to overlapping features
  Layer 3: classify biologically (point mutation → AA change, etc.)
"""

from __future__ import annotations

from pvcs.models import Change, Feature, Revision, SemanticDiff
from pvcs.utils import (
    canonicalize_circular,
    get_aa_change_description,
    reverse_complement,
    translate_codon,
)


# ---------------------------------------------------------------------------
# Layer 1: Sequence alignment → raw changes
# ---------------------------------------------------------------------------

def _align_sequences(seq_a: str, seq_b: str) -> list[tuple[str, str]]:
    """Align two sequences and return list of (char_a, char_b) pairs.

    For same-length sequences, does direct character comparison (fast path).
    For different-length sequences, uses BioPython PairwiseAligner (Needleman-Wunsch).
    """
    if seq_a == seq_b:
        return list(zip(seq_a, seq_b))

    # Fast path: same length → direct comparison (handles point mutations efficiently)
    if len(seq_a) == len(seq_b):
        return list(zip(seq_a, seq_b))

    # Different lengths → need proper alignment
    try:
        from Bio.Align import PairwiseAligner
        aligner = PairwiseAligner()
        aligner.mode = "global"
        aligner.match_score = 2
        aligner.mismatch_score = -1
        aligner.open_gap_score = -2
        aligner.extend_gap_score = -0.5
        alignments = aligner.align(seq_a, seq_b)
        if alignments:
            aln = alignments[0]
            aligned_a = aln[0]
            aligned_b = aln[1]
            return list(zip(str(aligned_a), str(aligned_b)))
    except (ImportError, Exception):
        pass

    # Fallback: try parasail
    try:
        import parasail
        result = parasail.nw_trace(seq_a, seq_b, 2, 1, parasail.dnafull)
        traceback = result.traceback
        return list(zip(traceback.query, traceback.ref))
    except (ImportError, Exception):
        pass

    # Last resort: pad shorter with trailing gaps
    max_len = max(len(seq_a), len(seq_b))
    a_padded = seq_a + "-" * (max_len - len(seq_a))
    b_padded = seq_b + "-" * (max_len - len(seq_b))
    return list(zip(a_padded, b_padded))


def _extract_raw_changes(alignment: list[tuple[str, str]]) -> list[dict]:
    """Walk through alignment, extract contiguous change blocks.

    Returns list of dicts with keys:
        pos_a, pos_b, seq_a, seq_b, len_a, len_b
    """
    changes: list[dict] = []
    pos_a = 0
    pos_b = 0

    i = 0
    while i < len(alignment):
        ca, cb = alignment[i]

        if ca == cb:
            # match — advance
            if ca != "-":
                pos_a += 1
            if cb != "-":
                pos_b += 1
            i += 1
            continue

        # Start of a change block
        block_start_a = pos_a
        block_start_b = pos_b
        block_seq_a = []
        block_seq_b = []

        while i < len(alignment):
            ca, cb = alignment[i]
            if ca == cb:
                break
            if ca != "-":
                block_seq_a.append(ca)
                pos_a += 1
            if cb != "-":
                block_seq_b.append(cb)
                pos_b += 1
            i += 1

        changes.append({
            "pos_a": block_start_a,
            "pos_b": block_start_b,
            "seq_a": "".join(block_seq_a),
            "seq_b": "".join(block_seq_b),
            "len_a": len(block_seq_a),
            "len_b": len(block_seq_b),
        })

    return changes


# ---------------------------------------------------------------------------
# Layer 2: Feature mapping
# ---------------------------------------------------------------------------

def _find_overlapping_features(
    position: int,
    length: int,
    features: list[Feature],
) -> list[Feature]:
    """Find all features that overlap [position, position+length) (0-based)."""
    result = []
    start = position
    end = position + max(length, 1)
    for f in features:
        f_start = f.start - 1  # convert 1-based to 0-based
        f_end = f.end          # end is inclusive in 1-based → exclusive in 0-based
        if f_start < end and f_end > start:
            result.append(f)
    return result


def _best_feature(features: list[Feature]) -> Feature | None:
    """Pick the most interesting feature (CDS > promoter > terminator > other)."""
    priority = {"CDS": 0, "gene": 1, "promoter": 2, "terminator": 3}
    if not features:
        return None
    features_sorted = sorted(features, key=lambda f: priority.get(f.type, 99))
    return features_sorted[0]


def _feature_label(feature: Feature | None) -> str | None:
    """Format a feature as 'type:name'."""
    if feature is None:
        return None
    return f"{feature.type}:{feature.name}"


# ---------------------------------------------------------------------------
# Layer 3: Biological classification
# ---------------------------------------------------------------------------

def _is_whole_feature_replaced(
    raw: dict,
    features_a: list[Feature],
    features_b: list[Feature],
) -> bool:
    """Check if the change spans an entire feature (replacement)."""
    for f in features_a:
        f_start = f.start - 1
        f_end = f.end
        if raw["pos_a"] <= f_start and raw["pos_a"] + raw["len_a"] >= f_end:
            return True
    return False


def _classify_change(
    raw: dict,
    features_a: list[Feature],
    features_b: list[Feature],
    seq_a_full: str,
    seq_b_full: str,
) -> Change:
    """Classify a raw change into a semantic Change object."""

    overlapping_a = _find_overlapping_features(raw["pos_a"], raw["len_a"], features_a)
    overlapping_b = _find_overlapping_features(raw["pos_b"], raw["len_b"], features_b)
    best_feat = _best_feature(overlapping_a) or _best_feature(overlapping_b)

    change = Change(
        position_a=raw["pos_a"] + 1,  # back to 1-based for user
        position_b=raw["pos_b"] + 1,
        length_a=raw["len_a"],
        length_b=raw["len_b"],
        affected_feature=_feature_label(best_feat),
        sequence_a=raw["seq_a"],
        sequence_b=raw["seq_b"],
    )

    # Point mutation
    if raw["len_a"] == 1 and raw["len_b"] == 1:
        change.type = "point_mutation"
        if best_feat and best_feat.type == "CDS":
            # Calculate amino acid change
            pos_in_cds = raw["pos_a"] - (best_feat.start - 1)
            if best_feat.strand == -1:
                cds_seq_a = reverse_complement(
                    seq_a_full[best_feat.start - 1:best_feat.end]
                )
                cds_seq_b = reverse_complement(
                    seq_b_full[best_feat.start - 1:best_feat.end]
                )
                pos_in_cds = best_feat.end - raw["pos_a"] - 1
            else:
                cds_seq_a = seq_a_full[best_feat.start - 1:best_feat.end]
                cds_seq_b = seq_b_full[best_feat.start - 1:best_feat.end]

            if 0 <= pos_in_cds < len(cds_seq_a) and 0 <= pos_in_cds < len(cds_seq_b):
                aa_desc = get_aa_change_description(
                    pos_in_cds, cds_seq_a, cds_seq_b, best_feat.name,
                )
                change.description = (
                    f"{raw['seq_a']}→{raw['seq_b']} "
                    f"(codon {pos_in_cds // 3 + 1}): {aa_desc}"
                )
            else:
                change.description = (
                    f"{raw['seq_a']}→{raw['seq_b']} at pos {change.position_a}"
                )
        else:
            ctx = f" ({change.affected_feature})" if change.affected_feature else ""
            change.description = (
                f"{raw['seq_a']}→{raw['seq_b']} at pos {change.position_a}{ctx}"
            )

    # Pure insertion (check BEFORE whole-feature replacement)
    elif raw["len_a"] == 0:
        change.type = "insertion"
        new_feats = _find_overlapping_features(raw["pos_b"], raw["len_b"], features_b)
        if new_feats:
            names = ", ".join(f.name for f in new_feats)
            change.description = (
                f"Inserted {raw['len_b']} bp at pos {change.position_a} "
                f"(adds: {names})"
            )
            change.affected_feature = _feature_label(_best_feature(new_feats))
        else:
            change.description = (
                f"Inserted {raw['len_b']} bp at pos {change.position_a}"
            )

    # Pure deletion (check BEFORE whole-feature replacement)
    elif raw["len_b"] == 0:
        change.type = "deletion"
        if overlapping_a:
            names = ", ".join(f.name for f in overlapping_a)
            change.description = (
                f"Deleted {raw['len_a']} bp at pos {change.position_a} "
                f"(removes: {names})"
            )
        else:
            change.description = (
                f"Deleted {raw['len_a']} bp at pos {change.position_a}"
            )

    # Whole feature replaced (both len_a > 0 and len_b > 0)
    elif _is_whole_feature_replaced(raw, features_a, features_b):
        change.type = "replacement"
        old_feat = _best_feature(overlapping_a)
        new_feat = _best_feature(overlapping_b)
        old_name = old_feat.name if old_feat else "?"
        new_name = new_feat.name if new_feat else "?"
        change.description = (
            f"Replaced {old_name} ({raw['len_a']} bp) "
            f"with {new_name} ({raw['len_b']} bp)"
        )

    # General substitution
    else:
        change.type = "replacement"
        change.description = (
            f"Replaced {raw['len_a']} bp with {raw['len_b']} bp "
            f"at pos {change.position_a}"
        )
        if change.affected_feature:
            change.description += f" ({change.affected_feature})"

    return change


# ---------------------------------------------------------------------------
# Layer 4: Merge scattered changes into feature-level replacements
# ---------------------------------------------------------------------------

def _merge_feature_replacements(
    changes: list[Change],
    features_a: list[Feature],
    features_b: list[Feature],
) -> list[Change]:
    """Merge consecutive changes within the same feature into one REPLACEMENT
    if they collectively span >50% of the feature.

    When two unrelated genes are aligned, NW produces hundreds of tiny
    match/mismatch blocks.  This collapses them into a single high-level
    "Replaced gene X with gene Y" change.
    """
    if not changes:
        return changes

    feat_len_a: dict[str, int] = {}
    feat_obj_a: dict[str, Feature] = {}
    for f in features_a:
        if f.type == "source":
            continue
        label = f"{f.type}:{f.name}"
        feat_len_a[label] = f.end - f.start + 1
        feat_obj_a[label] = f

    feat_obj_b: dict[str, Feature] = {}
    for f in features_b:
        if f.type == "source":
            continue
        feat_obj_b[f"{f.type}:{f.name}"] = f

    groups: dict[str | None, list[Change]] = {}
    for c in changes:
        groups.setdefault(c.affected_feature, []).append(c)

    merged: list[Change] = []

    for feat_label, group in groups.items():
        if feat_label is None or len(group) <= 10 or feat_label not in feat_len_a:
            merged.extend(group)
            continue

        feature_length = feat_len_a[feat_label]
        total_bp = sum(max(c.length_a, c.length_b) for c in group)

        if total_bp < feature_length * 0.50:
            merged.extend(group)
            continue

        first = group[0]
        last = group[-1]

        old_feat = feat_obj_a.get(feat_label)
        new_feat: Feature | None = None
        if old_feat:
            mid_b = first.position_b
            for fb in features_b:
                if fb.type == "source":
                    continue
                if fb.type == old_feat.type and fb.start <= mid_b <= fb.end:
                    new_feat = fb
                    break

        if not new_feat:
            for fb in features_b:
                if fb.type == "source":
                    continue
                if fb.start <= first.position_b and fb.end >= last.position_b:
                    new_feat = fb
                    break

        old_name = old_feat.name if old_feat else feat_label
        old_len = feature_length
        new_name = new_feat.name if new_feat else "?"
        new_len = (new_feat.end - new_feat.start + 1) if new_feat else total_bp

        # If both features have the same name AND same sequence, these are
        # alignment artifacts from position shifts — not a real replacement.
        if (old_feat and new_feat
                and old_feat.name == new_feat.name
                and abs(old_len - new_len) < 5
                and old_feat.sequence and new_feat.sequence
                and old_feat.sequence.upper() == new_feat.sequence.upper()):
            continue

        replacement = Change(
            type="replacement",
            position_a=first.position_a,
            position_b=first.position_b,
            length_a=old_len,
            length_b=new_len,
            affected_feature=feat_label,
            description=f"Replaced {old_name} ({old_len:,} bp) with {new_name} ({new_len:,} bp)",
            sequence_a="",
            sequence_b="",
        )
        merged.append(replacement)

    merged.sort(key=lambda c: c.position_a)
    return merged


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _rotate_features(features: list[Feature], offset: int, seq_len: int) -> list[Feature]:
    """Rotate feature coordinates by offset (for canonicalized sequences)."""
    if offset == 0:
        return features
    rotated = []
    for f in features:
        new_start = ((f.start - 1 - offset) % seq_len) + 1
        new_end = ((f.end - offset) % seq_len)
        if new_end == 0:
            new_end = seq_len
        rotated.append(Feature(
            type=f.type, name=f.name, start=new_start, end=new_end,
            strand=f.strand, qualifiers=f.qualifiers,
            sequence=f.sequence, part_id=f.part_id, color=f.color,
        ))
    return rotated


def semantic_diff(rev_a: Revision, rev_b: Revision) -> SemanticDiff:
    """Compute a semantic diff between two revisions.

    Three layers:
      1. Sequence alignment → raw changes
      2. Map changes to overlapping features
      3. Classify biologically
    """
    from pvcs.utils import find_anchor_position

    # Linearize circular sequences at the same anchor
    seq_a = canonicalize_circular(rev_a.sequence, rev_a.features)
    seq_b = canonicalize_circular(rev_b.sequence, rev_b.features)

    # Rotate features to match canonicalized sequences
    offset_a = find_anchor_position(rev_a.sequence, rev_a.features)
    offset_b = find_anchor_position(rev_b.sequence, rev_b.features)
    feats_a = _rotate_features(rev_a.features, offset_a, len(rev_a.sequence))
    feats_b = _rotate_features(rev_b.features, offset_b, len(rev_b.sequence))

    # Layer 1: align
    alignment = _align_sequences(seq_a, seq_b)
    raw_changes = _extract_raw_changes(alignment)

    # Layer 2 + 3: map and classify
    changes = [
        _classify_change(raw, feats_a, feats_b, seq_a, seq_b)
        for raw in raw_changes
    ]

    # Layer 4: merge scattered per-base changes into feature-level replacements
    changes = _merge_feature_replacements(changes, feats_a, feats_b)

    # Build summary
    n = len(changes)
    bp_delta = len(rev_b.sequence) - len(rev_a.sequence)
    bp_str = f"+{bp_delta}" if bp_delta >= 0 else str(bp_delta)

    type_counts: dict[str, int] = {}
    for c in changes:
        type_counts[c.type] = type_counts.get(c.type, 0) + 1

    summary_parts = [f"{count} {ctype}" for ctype, count in type_counts.items()]
    summary = f"{n} change{'s' if n != 1 else ''} ({bp_str} bp): " + ", ".join(summary_parts) if changes else "No changes"

    return SemanticDiff(
        revision_a_id=rev_a.id,
        revision_b_id=rev_b.id,
        construct_name="",
        version_a=rev_a.version,
        version_b=rev_b.version,
        changes=changes,
        summary=summary,
    )

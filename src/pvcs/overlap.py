"""Overlap designer: split points → overlap zones → primers.

Calculates fragment boundaries, overlap zones, Tm, and generates
primer sequences for overlap PCR / Gibson assembly.
"""

from __future__ import annotations

from dataclasses import dataclass

from pvcs.models import Fragment, OverlapZone, Primer, _new_id
from pvcs.utils import calc_tm, gc_content, reverse_complement


@dataclass
class OverlapDesign:
    """Result of overlap design for one assembly."""

    fragments: list[Fragment]
    primers: list[Primer]
    overlap_zones: list[OverlapZone]
    warnings: list[str]


def _adjust_overlap_for_tm(
    sequence: str,
    center: int,
    target_tm: float,
    min_length: int = 18,
    max_length: int = 30,
    salt_mm: float = 50.0,
) -> tuple[str, int, int]:
    """Extend overlap from center until Tm ≥ target. Returns (sequence, start, end)."""
    half = min_length // 2
    start = max(0, center - half)
    end = min(len(sequence), center + half)

    # Extend until we reach target Tm or max_length
    while (end - start) < max_length:
        overlap_seq = sequence[start:end]
        tm = calc_tm(overlap_seq, salt_mm=salt_mm)
        if tm >= target_tm:
            break
        # Extend both sides alternately
        if start > 0 and (end >= len(sequence) or (end - center) > (center - start)):
            start -= 1
        elif end < len(sequence):
            end += 1
        else:
            break

    return sequence[start:end], start, end


def _check_overlap_quality(overlap_seq: str) -> list[str]:
    """Check for potential problems in an overlap sequence."""
    warnings = []
    gc = gc_content(overlap_seq)

    if gc < 0.35:
        warnings.append(f"Low GC content ({gc:.0%}) in overlap '{overlap_seq[:10]}...'")
    elif gc > 0.70:
        warnings.append(f"High GC content ({gc:.0%}) in overlap '{overlap_seq[:10]}...'")

    # Check for runs of same nucleotide
    for nt in "ATCG":
        if nt * 5 in overlap_seq.upper():
            warnings.append(f"Run of {nt}s in overlap '{overlap_seq[:10]}...'")

    # Check for palindromes (potential secondary structure)
    rc = reverse_complement(overlap_seq)
    if overlap_seq.upper() == rc.upper():
        warnings.append(f"Palindromic overlap '{overlap_seq[:10]}...' — risk of self-annealing")

    return warnings


def design_overlaps(
    sequence: str,
    split_points: list[int],
    overlap_length: int = 22,
    tm_target: float = 62.0,
    salt_mm: float = 50.0,
    circular: bool = True,
) -> OverlapDesign:
    """Design overlap zones and primers for overlap PCR / Gibson assembly.

    Args:
        sequence: Full construct sequence.
        split_points: Positions (0-based) to split the construct into fragments.
        overlap_length: Default overlap length in bp.
        tm_target: Target Tm for overlap zones.
        salt_mm: Salt concentration for Tm calculation.
        circular: Whether the construct is circular.

    Returns:
        OverlapDesign with fragments, primers, overlap zones, and warnings.
    """
    seq = sequence.upper()
    seq_len = len(seq)

    # Sort split points and add boundaries
    points = sorted(set(split_points))
    if circular:
        points = [p % seq_len for p in points]
        # For circular: add origin (0) as implicit split point
        if 0 not in points:
            points.append(0)
        points = sorted(set(points))
    else:
        points = [p for p in points if 0 < p < seq_len]

    if not points:
        raise ValueError("No valid split points provided")

    # Create fragment boundaries
    boundaries: list[tuple[int, int]] = []

    if circular:
        # N split points on a circle → N fragments
        n = len(points)
        for i in range(n):
            start = points[i]
            end = points[(i + 1) % n]
            if end <= start:
                end += seq_len
            boundaries.append((start, end))
    else:
        all_points = [0] + points + [seq_len]
        for i in range(len(all_points) - 1):
            boundaries.append((all_points[i], all_points[i + 1]))

    # Design overlap zones at each split point
    overlap_zones: list[OverlapZone] = []
    warnings: list[str] = []

    for pt in points:
        ol_seq, ol_start, ol_end = _adjust_overlap_for_tm(
            seq if not circular else seq + seq,  # double for circular
            pt,
            tm_target,
            min_length=overlap_length,
            salt_mm=salt_mm,
        )

        ol_tm = calc_tm(ol_seq, salt_mm=salt_mm)
        ol_gc = gc_content(ol_seq)

        zone = OverlapZone(
            sequence=ol_seq,
            length=len(ol_seq),
            tm=ol_tm,
            gc_percent=round(ol_gc * 100, 1),
            position_in_construct=pt + 1,  # 1-based
        )
        overlap_zones.append(zone)
        warnings.extend(_check_overlap_quality(ol_seq))

    # Check Tm balance between overlap zones
    if len(overlap_zones) > 1:
        tms = [z.tm for z in overlap_zones]
        delta_tm = max(tms) - min(tms)
        if delta_tm > 3.0:
            warnings.append(
                f"ΔTm between overlaps is {delta_tm:.1f}°C (ideal < 2°C)"
            )

    # Create fragments
    fragments: list[Fragment] = []
    for i, (start, end) in enumerate(boundaries):
        if circular and end > seq_len:
            frag_seq = seq[start:] + seq[:end - seq_len]
        else:
            frag_seq = seq[start:end]

        # Assign overlap zones to fragments
        ol_left = overlap_zones[i] if i < len(overlap_zones) else None
        ol_right = overlap_zones[(i + 1) % len(overlap_zones)] if len(overlap_zones) > 1 else None
        if not circular and i == len(boundaries) - 1:
            ol_right = None
        if not circular and i == 0:
            ol_left = None

        frag = Fragment(
            id=_new_id(),
            order=i + 1,
            name=f"Fragment_{i + 1}",
            source_type="pcr_product",
            start=start + 1,  # 1-based
            end=end if end <= seq_len else end - seq_len,
            overlap_left=ol_left,
            overlap_right=ol_right,
        )
        fragments.append(frag)

    # Generate primers
    primers = _generate_primers(fragments, overlap_zones, seq, circular, salt_mm)

    return OverlapDesign(
        fragments=fragments,
        primers=primers,
        overlap_zones=overlap_zones,
        warnings=warnings,
    )


def _generate_primers(
    fragments: list[Fragment],
    overlap_zones: list[OverlapZone],
    sequence: str,
    circular: bool,
    salt_mm: float,
) -> list[Primer]:
    """Generate forward and reverse primers for each fragment."""
    primers: list[Primer] = []
    seq = sequence.upper()
    seq_len = len(seq)

    for i, frag in enumerate(fragments):
        frag_start = frag.start - 1  # 0-based
        frag_end_raw = frag.end  # 1-based end

        # Forward primer: binds to fragment start, tail = left overlap
        bind_len = 20
        bind_start = frag_start
        bind_end = min(frag_start + bind_len, seq_len)
        binding_seq = seq[bind_start:bind_end]

        tail_seq = ""
        tail_purpose = ""
        if frag.overlap_left and i > 0:
            # Tail comes from the previous fragment's end (overlap zone)
            prev_zone = overlap_zones[(i) % len(overlap_zones)] if circular else overlap_zones[i - 1] if i > 0 else None
            if prev_zone:
                tail_seq = reverse_complement(prev_zone.sequence[:len(prev_zone.sequence) // 2])
                tail_purpose = f"overlap with Fragment_{i}"

        full_seq = tail_seq + binding_seq
        fwd_primer = Primer(
            id=_new_id(),
            name=f"fwd_F{i + 1}",
            sequence=full_seq,
            binding_start=bind_start + 1,
            binding_end=bind_end,
            binding_sequence=binding_seq,
            tm_binding=calc_tm(binding_seq, salt_mm=salt_mm),
            tail_sequence=tail_seq,
            tail_purpose=tail_purpose,
            tm_full=calc_tm(full_seq, salt_mm=salt_mm),
            gc_percent=round(gc_content(full_seq) * 100, 1),
            length=len(full_seq),
            direction="forward",
        )
        primers.append(fwd_primer)

        # Reverse primer: binds to fragment end (reverse complement)
        if circular:
            actual_end = frag_end_raw if frag_end_raw <= seq_len else frag_end_raw - seq_len
        else:
            actual_end = frag_end_raw

        bind_start_rev = max(0, actual_end - bind_len)
        bind_end_rev = actual_end
        binding_seq_rev = reverse_complement(seq[bind_start_rev:bind_end_rev])

        tail_seq_rev = ""
        tail_purpose_rev = ""
        if frag.overlap_right and i < len(fragments) - 1:
            next_zone = overlap_zones[(i + 1) % len(overlap_zones)]
            tail_seq_rev = next_zone.sequence[:len(next_zone.sequence) // 2]
            tail_purpose_rev = f"overlap with Fragment_{i + 2}"

        full_seq_rev = tail_seq_rev + binding_seq_rev
        rev_primer = Primer(
            id=_new_id(),
            name=f"rev_F{i + 1}",
            sequence=full_seq_rev,
            binding_start=bind_start_rev + 1,
            binding_end=bind_end_rev,
            binding_sequence=binding_seq_rev,
            tm_binding=calc_tm(binding_seq_rev, salt_mm=salt_mm),
            tail_sequence=tail_seq_rev,
            tail_purpose=tail_purpose_rev,
            tm_full=calc_tm(full_seq_rev, salt_mm=salt_mm),
            gc_percent=round(gc_content(full_seq_rev) * 100, 1),
            length=len(full_seq_rev),
            direction="reverse",
        )
        primers.append(rev_primer)

    return primers

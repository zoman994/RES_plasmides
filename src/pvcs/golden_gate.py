"""Golden Gate assembly designer.

Designs primers with RE site + 4-nt overhang + binding region.
Validates overhang uniqueness and checks for internal enzyme sites.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from pvcs.models import Primer, _new_id
from pvcs.utils import calc_tm, gc_content, reverse_complement


ENZYME_SITES: dict[str, tuple[str, int]] = {
    "BsaI": ("GGTCTC", 1),
    "BbsI": ("GAAGAC", 2),
    "Esp3I": ("CGTCTC", 1),
    "BpiI": ("GAAGAC", 2),
    "SapI": ("GCTCTTC", 1),
}

# Default spacer upstream of RE site (improves cutting efficiency)
DEFAULT_SPACER = "TT"


@dataclass
class GoldenGateDesign:
    """Result of Golden Gate assembly design."""
    enzyme: str
    enzyme_site: str
    fragments: list[dict]       # [{name, sequence, order}]
    overhangs: list[str]        # 4-nt overhangs at each junction
    primers: list[Primer]
    internal_site_warnings: list[str]
    overhang_warnings: list[str]


def suggest_overhangs(
    fragments: list[tuple[str, str]],
    overhang_length: int = 4,
) -> list[str]:
    """Auto-suggest overhangs from junction sequences.

    Takes the last `overhang_length` bp of each fragment as the overhang.
    For N fragments in a circular assembly, there are N junctions.
    """
    overhangs = []
    for i in range(len(fragments)):
        _name, seq = fragments[i]
        # Take last 4 bp of this fragment as overhang
        oh = seq[-overhang_length:].upper() if len(seq) >= overhang_length else seq.upper()
        overhangs.append(oh)
    return overhangs


def check_overhang_uniqueness(overhangs: list[str]) -> list[str]:
    """Check all overhangs are unique and not palindromic."""
    warnings: list[str] = []
    seen: set[str] = set()
    for i, oh in enumerate(overhangs):
        oh_up = oh.upper()
        rc = reverse_complement(oh_up)
        if oh_up in seen:
            warnings.append(f"Duplicate overhang at junction {i + 1}: {oh_up}")
        if oh_up == rc:
            warnings.append(f"Palindromic overhang at junction {i + 1}: {oh_up} (self-complementary)")
        seen.add(oh_up)
        seen.add(rc)
    return warnings


def check_internal_sites(sequence: str, enzyme_site: str) -> list[int]:
    """Find internal enzyme recognition sites (positions, 1-based)."""
    seq = sequence.upper()
    site = enzyme_site.upper()
    rc_site = reverse_complement(site)
    positions: list[int] = []

    for m in re.finditer(re.escape(site), seq):
        positions.append(m.start() + 1)
    if rc_site != site:
        for m in re.finditer(re.escape(rc_site), seq):
            positions.append(m.start() + 1)

    return sorted(positions)


def design_golden_gate(
    fragments: list[tuple[str, str]],
    enzyme: str = "BsaI",
    overhangs: list[str] | None = None,
    binding_length: int = 20,
    spacer: str = DEFAULT_SPACER,
    salt_mm: float = 50.0,
) -> GoldenGateDesign:
    """Design Golden Gate assembly primers.

    Args:
        fragments: List of (name, sequence) tuples in assembly order.
        enzyme: Restriction enzyme name.
        overhangs: Custom 4-nt overhangs (one per junction).
                   Auto-generated if None.
        binding_length: Length of 3' binding region on primers.
        spacer: Spacer sequence before RE site (2-4 nt).
        salt_mm: Salt concentration for Tm calculation.

    Returns:
        GoldenGateDesign with primers, overhangs, and warnings.
    """
    if enzyme not in ENZYME_SITES:
        raise ValueError(f"Unknown enzyme '{enzyme}'. Available: {list(ENZYME_SITES.keys())}")

    enzyme_site, cut_offset = ENZYME_SITES[enzyme]
    n_frags = len(fragments)

    # Auto-generate overhangs if not provided
    if overhangs is None:
        overhangs = suggest_overhangs(fragments)

    # Ensure correct number of overhangs (N junctions for N fragments in circular)
    while len(overhangs) < n_frags:
        overhangs.append("NNNN")

    # Validate overhangs
    overhang_warnings = check_overhang_uniqueness(overhangs)

    # Check for internal enzyme sites in all fragments
    internal_warnings: list[str] = []
    for name, seq in fragments:
        positions = check_internal_sites(seq, enzyme_site)
        if positions:
            pos_str = ", ".join(str(p) for p in positions)
            internal_warnings.append(
                f"Internal {enzyme} site in {name} at position(s) {pos_str} — needs domestication"
            )

    # Generate primers
    # Golden Gate primer structure:
    #   5'- [spacer] + [RE_site] + [N] + [4-nt overhang] + [binding_region] -3'
    # The "N" is a single nucleotide between RE cut site and overhang
    # (depends on enzyme cut position)

    primers: list[Primer] = []
    frag_dicts: list[dict] = []

    for i, (name, seq) in enumerate(fragments):
        seq_up = seq.upper()

        frag_dicts.append({"name": name, "sequence": seq_up, "order": i + 1})

        # Left overhang (junction with previous fragment)
        left_oh = overhangs[i]
        # Right overhang (junction with next fragment)
        right_oh = overhangs[(i + 1) % n_frags]

        # Forward primer: spacer + RE_site + cut_spacer + left_overhang + binding
        fwd_binding = seq_up[:binding_length]
        fwd_tail = spacer + enzyme_site + "A" * cut_offset + left_oh
        fwd_full = fwd_tail + fwd_binding

        fwd_primer = Primer(
            id=_new_id(),
            name=f"GG_fwd_{name}",
            sequence=fwd_full,
            binding_start=1,
            binding_end=binding_length,
            binding_sequence=fwd_binding,
            tm_binding=calc_tm(fwd_binding, salt_mm=salt_mm),
            tail_sequence=fwd_tail,
            tail_purpose=f"{enzyme} site + overhang {left_oh}",
            tm_full=calc_tm(fwd_full, salt_mm=salt_mm),
            gc_percent=round(gc_content(fwd_full) * 100, 1),
            length=len(fwd_full),
            direction="forward",
        )
        primers.append(fwd_primer)

        # Reverse primer: spacer + RE_site_rc + cut_spacer + right_overhang_rc + binding_rc
        rev_binding_region = seq_up[-binding_length:]
        rev_binding = reverse_complement(rev_binding_region)
        rev_oh_rc = reverse_complement(right_oh)
        re_site_rc = reverse_complement(enzyme_site)
        rev_tail = spacer + re_site_rc + "A" * cut_offset + rev_oh_rc
        rev_full = rev_tail + rev_binding

        rev_primer = Primer(
            id=_new_id(),
            name=f"GG_rev_{name}",
            sequence=rev_full,
            binding_start=len(seq_up) - binding_length + 1,
            binding_end=len(seq_up),
            binding_sequence=rev_binding,
            tm_binding=calc_tm(rev_binding, salt_mm=salt_mm),
            tail_sequence=rev_tail,
            tail_purpose=f"{enzyme} site + overhang {right_oh}",
            tm_full=calc_tm(rev_full, salt_mm=salt_mm),
            gc_percent=round(gc_content(rev_full) * 100, 1),
            length=len(rev_full),
            direction="reverse",
        )
        primers.append(rev_primer)

    return GoldenGateDesign(
        enzyme=enzyme,
        enzyme_site=enzyme_site,
        fragments=frag_dicts,
        overhangs=overhangs[:n_frags],
        primers=primers,
        internal_site_warnings=internal_warnings,
        overhang_warnings=overhang_warnings,
    )

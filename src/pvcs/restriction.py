"""Restriction + Ligation cloning designer.

RE site database with cut positions, overhang types, compatibility.
Primer design for RE-tailed amplification.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from pvcs.models import Primer, _new_id
from pvcs.utils import calc_tm, gc_content, reverse_complement


# Full RE database with cut positions and overhang info
RE_DATABASE: dict[str, dict] = {
    "EcoRI":   {"site": "GAATTC",   "cut": (1, 5), "end": "5prime", "overhang": "AATT"},
    "BamHI":   {"site": "GGATCC",   "cut": (1, 5), "end": "5prime", "overhang": "GATC"},
    "HindIII": {"site": "AAGCTT",   "cut": (1, 5), "end": "5prime", "overhang": "AGCT"},
    "XbaI":    {"site": "TCTAGA",   "cut": (1, 5), "end": "5prime", "overhang": "CTAG"},
    "SalI":    {"site": "GTCGAC",   "cut": (1, 5), "end": "5prime", "overhang": "TCGA"},
    "NcoI":    {"site": "CCATGG",   "cut": (1, 5), "end": "5prime", "overhang": "CATG"},
    "NdeI":    {"site": "CATATG",   "cut": (2, 4), "end": "5prime", "overhang": "TA"},
    "XhoI":    {"site": "CTCGAG",   "cut": (1, 5), "end": "5prime", "overhang": "TCGA"},
    "NotI":    {"site": "GCGGCCGC", "cut": (2, 6), "end": "5prime", "overhang": "GGCC"},
    "PstI":    {"site": "CTGCAG",   "cut": (5, 1), "end": "3prime", "overhang": "TGCA"},
    "SphI":    {"site": "GCATGC",   "cut": (5, 1), "end": "3prime", "overhang": "CATG"},
    "EcoRV":   {"site": "GATATC",   "cut": (3, 3), "end": "blunt",  "overhang": ""},
    "SmaI":    {"site": "CCCGGG",   "cut": (3, 3), "end": "blunt",  "overhang": ""},
    "StuI":    {"site": "AGGCCT",   "cut": (3, 3), "end": "blunt",  "overhang": ""},
    "KpnI":    {"site": "GGTACC",   "cut": (5, 1), "end": "3prime", "overhang": "GTAC"},
    "SacI":    {"site": "GAGCTC",   "cut": (5, 1), "end": "3prime", "overhang": "AGCT"},
    "NheI":    {"site": "GCTAGC",   "cut": (1, 5), "end": "5prime", "overhang": "CTAG"},
    "BglII":   {"site": "AGATCT",   "cut": (1, 5), "end": "5prime", "overhang": "GATC"},
    "ClaI":    {"site": "ATCGAT",   "cut": (2, 4), "end": "5prime", "overhang": "CG"},
    "MfeI":    {"site": "CAATTG",   "cut": (1, 5), "end": "5prime", "overhang": "AATT"},
    "AgeI":    {"site": "ACCGGT",   "cut": (1, 5), "end": "5prime", "overhang": "CCGG"},
    "SpeI":    {"site": "ACTAGT",   "cut": (1, 5), "end": "5prime", "overhang": "CTAG"},
    "AvrII":   {"site": "CCTAGG",   "cut": (1, 5), "end": "5prime", "overhang": "CTAG"},
    "BclI":    {"site": "TGATCA",   "cut": (1, 5), "end": "5prime", "overhang": "GATC"},
    "BspHI":   {"site": "TCATGA",   "cut": (1, 5), "end": "5prime", "overhang": "CATG"},
    # Type IIS (for Golden Gate)
    "BsaI":    {"site": "GGTCTC",  "cut": (7, 11), "end": "typeIIS", "overhang": ""},
    "BbsI":    {"site": "GAAGAC",  "cut": (8, 12), "end": "typeIIS", "overhang": ""},
    "Esp3I":   {"site": "CGTCTC",  "cut": (7, 11), "end": "typeIIS", "overhang": ""},
    "BpiI":    {"site": "GAAGAC",  "cut": (8, 12), "end": "typeIIS", "overhang": ""},
    "SapI":    {"site": "GCTCTTC", "cut": (8, 12), "end": "typeIIS", "overhang": ""},
}

# Enzymes producing compatible sticky ends (same overhang sequence)
COMPATIBLE_PAIRS: dict[tuple[str, str], bool] = {
    ("BamHI", "BglII"): True, ("BglII", "BamHI"): True,   # GATC
    ("BamHI", "BclI"): True,  ("BclI", "BamHI"): True,    # GATC
    ("BglII", "BclI"): True,  ("BclI", "BglII"): True,    # GATC
    ("EcoRI", "MfeI"): True,  ("MfeI", "EcoRI"): True,    # AATT
    ("NheI", "XbaI"): True,   ("XbaI", "NheI"): True,     # CTAG
    ("NheI", "SpeI"): True,   ("SpeI", "NheI"): True,     # CTAG
    ("NheI", "AvrII"): True,  ("AvrII", "NheI"): True,    # CTAG
    ("XbaI", "SpeI"): True,   ("SpeI", "XbaI"): True,     # CTAG
    ("XbaI", "AvrII"): True,  ("AvrII", "XbaI"): True,    # CTAG
    ("SpeI", "AvrII"): True,  ("AvrII", "SpeI"): True,    # CTAG
    ("SalI", "XhoI"): True,   ("XhoI", "SalI"): True,     # TCGA
    ("NcoI", "BspHI"): True,  ("BspHI", "NcoI"): True,    # CATG
}

COMMON_PAIRS = [
    ("EcoRI", "BamHI"),
    ("NcoI", "XhoI"),
    ("NdeI", "BamHI"),
    ("XbaI", "SpeI"),
    ("NheI", "BamHI"),
    ("EcoRI", "HindIII"),
    ("BamHI", "XhoI"),
    ("NcoI", "NotI"),
]


@dataclass
class RestrictionDesign:
    """Result of restriction/ligation cloning design."""
    enzyme_5prime: str
    enzyme_3prime: str
    vector_sites: list[dict]       # [{enzyme, position, strand}]
    insert_internal_sites: list[dict]
    directional: bool
    compatible: bool
    primers: list[Primer]
    warnings: list[str]


def find_sites(sequence: str, enzyme: str) -> list[dict]:
    """Find all RE recognition sites in a sequence (1-based positions)."""
    if enzyme not in RE_DATABASE:
        return []
    info = RE_DATABASE[enzyme]
    site = info["site"]
    seq = sequence.upper()
    rc_site = reverse_complement(site)

    results = []
    for m in re.finditer(re.escape(site), seq):
        results.append({"enzyme": enzyme, "position": m.start() + 1, "strand": "fwd"})
    if rc_site != site:
        for m in re.finditer(re.escape(rc_site), seq):
            results.append({"enzyme": enzyme, "position": m.start() + 1, "strand": "rev"})
    return sorted(results, key=lambda r: r["position"])


def check_compatible_ends(enzyme_5: str, enzyme_3: str) -> tuple[bool, str]:
    """Check if two enzymes produce compatible ends."""
    if enzyme_5 == enzyme_3:
        return True, "Same enzyme — compatible (but not directional unless phosphatased)"

    if (enzyme_5, enzyme_3) in COMPATIBLE_PAIRS:
        return True, f"{enzyme_5} and {enzyme_3} produce compatible sticky ends"

    e5 = RE_DATABASE.get(enzyme_5, {})
    e3 = RE_DATABASE.get(enzyme_3, {})
    if e5.get("end") == "blunt" and e3.get("end") == "blunt":
        return True, "Both blunt — compatible (but not directional)"

    if e5.get("end") == e3.get("end") and e5.get("overhang") == e3.get("overhang"):
        return True, "Compatible overhangs"

    return False, f"Incompatible ends: {enzyme_5} ({e5.get('end', '?')}) vs {enzyme_3} ({e3.get('end', '?')})"


def design_re_primers(
    insert_sequence: str,
    enzyme_5prime: str,
    enzyme_3prime: str,
    binding_length: int = 20,
    spacer: str = "TT",
    salt_mm: float = 50.0,
) -> RestrictionDesign:
    """Design primers with RE site tails for cloning an insert."""
    e5_info = RE_DATABASE.get(enzyme_5prime)
    e3_info = RE_DATABASE.get(enzyme_3prime)
    if not e5_info or not e3_info:
        raise ValueError(f"Unknown enzyme(s)")

    seq = insert_sequence.upper()
    warnings: list[str] = []

    # Check internal sites in insert
    internal_5 = find_sites(seq, enzyme_5prime)
    internal_3 = find_sites(seq, enzyme_3prime)
    for s in internal_5:
        warnings.append(f"Internal {enzyme_5prime} site in insert at pos {s['position']}")
    for s in internal_3:
        if enzyme_3prime != enzyme_5prime:
            warnings.append(f"Internal {enzyme_3prime} site in insert at pos {s['position']}")

    # Compatibility
    compatible, compat_msg = check_compatible_ends(enzyme_5prime, enzyme_3prime)
    directional = enzyme_5prime != enzyme_3prime

    # Forward primer: spacer + RE_site_5prime + binding
    fwd_binding = seq[:binding_length]
    fwd_tail = spacer + e5_info["site"]
    fwd_full = fwd_tail + fwd_binding

    fwd = Primer(
        id=_new_id(), name=f"fwd_{enzyme_5prime}",
        sequence=fwd_full,
        binding_start=1, binding_end=binding_length,
        binding_sequence=fwd_binding,
        tm_binding=calc_tm(fwd_binding, salt_mm=salt_mm),
        tail_sequence=fwd_tail,
        tail_purpose=f"{enzyme_5prime} site",
        tm_full=calc_tm(fwd_full, salt_mm=salt_mm),
        gc_percent=round(gc_content(fwd_full) * 100, 1),
        length=len(fwd_full), direction="forward",
    )

    # Reverse primer: spacer + RE_site_3prime_RC + binding_RC
    rev_binding_region = seq[-binding_length:]
    rev_binding = reverse_complement(rev_binding_region)
    re3_rc = reverse_complement(e3_info["site"])
    rev_tail = spacer + re3_rc
    rev_full = rev_tail + rev_binding

    rev = Primer(
        id=_new_id(), name=f"rev_{enzyme_3prime}",
        sequence=rev_full,
        binding_start=len(seq) - binding_length + 1, binding_end=len(seq),
        binding_sequence=rev_binding,
        tm_binding=calc_tm(rev_binding, salt_mm=salt_mm),
        tail_sequence=rev_tail,
        tail_purpose=f"{enzyme_3prime} site",
        tm_full=calc_tm(rev_full, salt_mm=salt_mm),
        gc_percent=round(gc_content(rev_full) * 100, 1),
        length=len(rev_full), direction="reverse",
    )

    return RestrictionDesign(
        enzyme_5prime=enzyme_5prime,
        enzyme_3prime=enzyme_3prime,
        vector_sites=[],
        insert_internal_sites=internal_5 + internal_3,
        directional=directional,
        compatible=compatible,
        primers=[fwd, rev],
        warnings=warnings + ([compat_msg] if not compatible else []),
    )

# Backward-compatible alias
find_re_sites_in_sequence = find_sites

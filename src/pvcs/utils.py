"""Utility functions for PlasmidVCS.

SHA-256 checksums, circular sequence handling, codon translation,
Tm calculation (nearest-neighbor), and misc helpers.
"""

from __future__ import annotations

import hashlib
import math
import re


# ---------------------------------------------------------------------------
# Checksum
# ---------------------------------------------------------------------------

def sequence_checksum(sequence: str) -> str:
    """SHA-256 hex digest of the uppercase sequence."""
    return hashlib.sha256(sequence.upper().encode()).hexdigest()


# ---------------------------------------------------------------------------
# Circular sequence handling
# ---------------------------------------------------------------------------

def find_anchor_position(
    sequence: str,
    features: list,
    anchor_types: tuple[str, ...] = ("rep_origin", "CDS"),
) -> int:
    """Find the best anchor feature position for linearization.

    Looks for ori first, then first CDS.  Returns 0 if nothing found.
    """
    for atype in anchor_types:
        for f in features:
            if f.type == atype:
                return f.start - 1  # convert 1-based to 0-based
    return 0


def linearize_at(sequence: str, origin: int) -> str:
    """Rotate a circular sequence so it starts at *origin* (0-based)."""
    if origin == 0 or not sequence:
        return sequence
    origin = origin % len(sequence)
    return sequence[origin:] + sequence[:origin]


def canonicalize_circular(sequence: str, features: list) -> str:
    """Linearize circular sequence at the anchor feature."""
    pos = find_anchor_position(sequence, features)
    return linearize_at(sequence, pos)


# ---------------------------------------------------------------------------
# Codon / translation helpers
# ---------------------------------------------------------------------------

_CODON_TABLE: dict[str, str] = {
    "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L",
    "CTT": "L", "CTC": "L", "CTA": "L", "CTG": "L",
    "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M",
    "GTT": "V", "GTC": "V", "GTA": "V", "GTG": "V",
    "TCT": "S", "TCC": "S", "TCA": "S", "TCG": "S",
    "CCT": "P", "CCC": "P", "CCA": "P", "CCG": "P",
    "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T",
    "GCT": "A", "GCC": "A", "GCA": "A", "GCG": "A",
    "TAT": "Y", "TAC": "Y", "TAA": "*", "TAG": "*",
    "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q",
    "AAT": "N", "AAC": "N", "AAA": "K", "AAG": "K",
    "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E",
    "TGT": "C", "TGC": "C", "TGA": "*", "TGG": "W",
    "CGT": "R", "CGC": "R", "CGA": "R", "CGG": "R",
    "AGT": "S", "AGC": "S", "AGA": "R", "AGG": "R",
    "GGT": "G", "GGC": "G", "GGA": "G", "GGG": "G",
}

_AA_NAMES: dict[str, str] = {
    "A": "Ala", "R": "Arg", "N": "Asn", "D": "Asp", "C": "Cys",
    "E": "Glu", "Q": "Gln", "G": "Gly", "H": "His", "I": "Ile",
    "L": "Leu", "K": "Lys", "M": "Met", "F": "Phe", "P": "Pro",
    "S": "Ser", "T": "Thr", "W": "Trp", "Y": "Tyr", "V": "Val",
    "*": "Stop",
}


def translate_codon(codon: str) -> str:
    """Translate a single DNA codon to one-letter amino acid."""
    return _CODON_TABLE.get(codon.upper(), "?")


def translate_sequence(sequence: str, frame: int = 0) -> str:
    """Translate a DNA sequence to a protein string."""
    seq = sequence.upper()[frame:]
    return "".join(
        _CODON_TABLE.get(seq[i:i + 3], "?")
        for i in range(0, len(seq) - 2, 3)
    )


def reverse_complement(sequence: str) -> str:
    """Return the reverse complement of a DNA sequence."""
    comp = str.maketrans("ATCGatcg", "TAGCtagc")
    return sequence.translate(comp)[::-1]


def get_aa_change_description(
    position_in_cds: int,
    old_seq: str,
    new_seq: str,
    feature_name: str,
) -> str:
    """Describe an amino acid change from a point mutation in a CDS.

    Args:
        position_in_cds: 0-based nucleotide position within the CDS.
        old_seq: CDS sequence of the old revision.
        new_seq: CDS sequence of the new revision.
        feature_name: name of the feature (e.g. "XynTL").

    Returns:
        Human-readable string like "Q158R (Gln → Arg) in XynTL".
    """
    codon_index = position_in_cds // 3
    codon_start = codon_index * 3

    old_codon = old_seq[codon_start:codon_start + 3].upper()
    new_codon = new_seq[codon_start:codon_start + 3].upper()

    old_aa = translate_codon(old_codon)
    new_aa = translate_codon(new_codon)

    aa_pos = codon_index + 1  # 1-based residue number

    old_name = _AA_NAMES.get(old_aa, old_aa)
    new_name = _AA_NAMES.get(new_aa, new_aa)

    return f"{old_aa}{aa_pos}{new_aa} ({old_name} → {new_name}) in {feature_name}"


# ---------------------------------------------------------------------------
# Tm calculation — nearest-neighbor method (SantaLucia 1998)
# ---------------------------------------------------------------------------

# ΔH (kcal/mol) and ΔS (cal/mol·K) for each dinucleotide pair
_NN_PARAMS: dict[str, tuple[float, float]] = {
    "AA": (-7.9, -22.2), "TT": (-7.9, -22.2),
    "AT": (-7.2, -20.4),
    "TA": (-7.2, -21.3),
    "CA": (-8.5, -22.7), "TG": (-8.5, -22.7),
    "GT": (-8.4, -22.4), "AC": (-8.4, -22.4),
    "CT": (-7.8, -21.0), "AG": (-7.8, -21.0),
    "GA": (-8.2, -22.2), "TC": (-8.2, -22.2),
    "CG": (-10.6, -27.2),
    "GC": (-9.8, -24.4),
    "GG": (-8.0, -19.9), "CC": (-8.0, -19.9),
}

_INIT_dH = 0.1   # kcal/mol
_INIT_dS = -2.8  # cal/mol·K


def calc_tm(
    sequence: str,
    dna_conc_nm: float = 250.0,
    salt_mm: float = 50.0,
) -> float:
    """Calculate Tm using the nearest-neighbor method (SantaLucia 1998).

    Args:
        sequence: Primer sequence (DNA).
        dna_conc_nm: Total DNA strand concentration in nM (default 250).
        salt_mm: Monovalent salt concentration in mM (default 50).

    Returns:
        Melting temperature in °C.
    """
    seq = sequence.upper()
    if len(seq) < 6:
        return 0.0  # too short for reliable nearest-neighbor Tm

    dH = 2 * _INIT_dH  # both ends
    dS = 2 * _INIT_dS

    for i in range(len(seq) - 1):
        dinuc = seq[i:i + 2]
        params = _NN_PARAMS.get(dinuc)
        if params is None:
            continue
        dH += params[0]
        dS += params[1]

    # Salt correction (SantaLucia 1998)
    dS += 0.368 * (len(seq) - 1) * math.log(salt_mm / 1000.0)

    # Ct = total strand concentration / 4 for non-self-complementary
    ct = dna_conc_nm * 1e-9 / 4.0

    if dS == 0:
        return 0.0
    tm_kelvin = (dH * 1000.0) / (dS + 1.987 * math.log(ct))
    return round(tm_kelvin - 273.15, 1)


def gc_content(sequence: str) -> float:
    """Return GC fraction (0.0–1.0) of a sequence."""
    seq = sequence.upper()
    if not seq:
        return 0.0
    gc = seq.count("G") + seq.count("C")
    return round(gc / len(seq), 4)


# ---------------------------------------------------------------------------
# Restriction enzyme helpers
# ---------------------------------------------------------------------------

COMMON_RE_SITES: dict[str, str] = {
    "EcoRI": "GAATTC",
    "BamHI": "GGATCC",
    "HindIII": "AAGCTT",
    "XbaI": "TCTAGA",
    "SalI": "GTCGAC",
    "PstI": "CTGCAG",
    "SphI": "GCATGC",
    "NcoI": "CCATGG",
    "NdeI": "CATATG",
    "XhoI": "CTCGAG",
    "NotI": "GCGGCCGC",
    "BsaI": "GGTCTC",
    "BbsI": "GAAGAC",
    "Esp3I": "CGTCTC",
    "SapI": "GCTCTTC",
    "BpiI": "GAAGAC",
    "AscI": "GGCGCGCC",
    "FseI": "GGCCGGCC",
    "PacI": "TTAATTAA",
    "SwaI": "ATTTAAAT",
}


def find_re_sites(sequence: str, enzyme: str | None = None) -> list[dict]:
    """Find restriction enzyme recognition sites in a sequence.

    Args:
        sequence: DNA sequence to search.
        enzyme: Specific enzyme name, or None to search all common enzymes.

    Returns:
        List of dicts: {enzyme, site, position (1-based), strand}.
    """
    seq = sequence.upper()
    results: list[dict] = []

    if enzyme and enzyme in COMMON_RE_SITES:
        enzymes = {enzyme: COMMON_RE_SITES[enzyme]}
    else:
        enzymes = COMMON_RE_SITES

    for enz_name, site in enzymes.items():
        site_up = site.upper()
        rc_site = reverse_complement(site_up)

        for m in re.finditer(re.escape(site_up), seq):
            results.append({
                "enzyme": enz_name,
                "site": site_up,
                "position": m.start() + 1,
                "strand": "fwd",
            })

        if rc_site != site_up:
            for m in re.finditer(re.escape(rc_site), seq):
                results.append({
                    "enzyme": enz_name,
                    "site": rc_site,
                    "position": m.start() + 1,
                    "strand": "rev",
                })

    results.sort(key=lambda r: r["position"])
    return results


# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------

def format_bp(length: int) -> str:
    """Format base pair count: 8432 → '8,432 bp'."""
    return f"{length:,} bp"

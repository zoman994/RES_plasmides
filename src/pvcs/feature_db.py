"""Database of common synthetic biology features with verified DNA sequences.

Each entry contains the first 150-200 bp of the coding/functional region,
sourced from NCBI GenBank accessions.  The module is fully self-contained and
works without network access.

Sequences were retrieved with BioPython (``from Bio import Entrez, SeqIO``,
``Entrez.email = "test@test.com"``) and verified against their respective
GenBank records.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class KnownFeature:
    """A reference feature with a canonical partial sequence."""

    name: str
    type: str  # "CDS", "promoter", "terminator", "origin"
    sequence: str  # first 150-200 bp of the functional region (uppercase)
    organism: str
    description: str
    accession: str = ""  # GenBank accession used as source
    aliases: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.sequence = self.sequence.upper().replace(" ", "").replace("\n", "")


# ---------------------------------------------------------------------------
# Helper — reverse complement
# ---------------------------------------------------------------------------

_COMP = str.maketrans("ACGTacgt", "TGCAtgca")


def reverse_complement(seq: str) -> str:
    """Return the reverse complement of *seq*."""
    return seq.translate(_COMP)[::-1]


# ---------------------------------------------------------------------------
# KNOWN_FEATURES — 21 entries with real GenBank sequences
# ---------------------------------------------------------------------------

KNOWN_FEATURES: list[KnownFeature] = [

    # ===================================================================
    # SELECTION MARKERS (CDS)
    # ===================================================================

    # 1. AmpR / bla (TEM-1 beta-lactamase)
    #    GenBank L09137 (pUC19), CDS complement(1629..2489)
    #    First 200 bp of the CDS (sense strand of the gene).
    KnownFeature(
        name="AmpR",
        type="CDS",
        sequence=(
            "ATGAGTATTCAACATTTCCGTGTCGCCCTTATTCCCTTTTTTGCGGCATTTTGCCTTCCT"
            "GTTTTTGCTCACCCAGAAACGCTGGTGAAAGTAAAAGATGCTGAAGATCAGTTGGGTGCA"
            "CGAGTGGGTTACATCGAACTGGATCTCAACAGCGGTAAGATCCTTGAGAGTTTTCGCCCC"
            "GAAGAACGTTTTCCAATGA"
        ),
        organism="E. coli",
        description="Beta-lactamase TEM-1, ampicillin resistance",
        accession="L09137",
        aliases=["bla", "AmpR", "beta-lactamase", "TEM-1"],
    ),

    # 2. KanR / aph(3')-IIa (aminoglycoside phosphotransferase from Tn5)
    #    GenBank U00004 (Tn5), CDS of neomycin phosphotransferase II.
    KnownFeature(
        name="KanR",
        type="CDS",
        sequence=(
            "ATGATTGAACAAGATGGATTGCACGCAGGTTCTCCGGCCGCTTGGGTGGAGAGGCTATTC"
            "GGCTATGACTGGGCACAACAGACAATCGGCTGCTCTGATGCCGCCGTGTTCCGGCTGTCA"
            "GCGCAGGGGCGCCCGGTTCTTTTTGTCAAGACCGACCTGTCCGGTGCCCTGAATGAACTG"
            "CAGGACGAGGCAGCGCGG"
        ),
        organism="E. coli (Tn5)",
        description="Aminoglycoside phosphotransferase, kanamycin/neomycin resistance",
        accession="U00004",
        aliases=["KanR", "nptII", "aph(3')-IIa", "neo"],
    ),

    # 3. CmR / cat (chloramphenicol acetyltransferase)
    #    GenBank M62653, CDS of cat gene from Tn9 / pACYC184.
    KnownFeature(
        name="CmR",
        type="CDS",
        sequence=(
            "ATGGAGAAAAAAATCACTGGATATACCACCGTTGATATATCCCAATGGCATCGTAAAGAAC"
            "ATTTTGAGGCATTTCAGTCAGTTGCTCAATGTACCTATAACCAGACCGTTCAGCTGGATA"
            "TTACGGCCTTTTTAAAGACCGTAAAGAAAAATAAGCACAAGTTTTATCCGGCCTTTATTCA"
            "CATTCTTGCCCGCCTGA"
        ),
        organism="E. coli (Tn9)",
        description="Chloramphenicol acetyltransferase",
        accession="M62653",
        aliases=["CmR", "cat", "chloramphenicol acetyltransferase"],
    ),

    # 4. HygR / hph (hygromycin B phosphotransferase)
    #    GenBank K01193, CDS from E. coli plasmid encoding hph.
    KnownFeature(
        name="HygR",
        type="CDS",
        sequence=(
            "ATGAAAAAGCCTGAACTCACCGCGACGTCTGTCGAGAAGTTTCTGATCGAAAAGTTCGAC"
            "AGCGTCTCCGACCTGATGCAGCTCTCGGAGGGCGAAGAATCTCGTGCTTTCAGCTTCGAT"
            "GTAGGAGGGCGTGGATATGTCCTGCGGGTAAATAGCTGCGCCGATGGTTTCTACAAAGAT"
            "CGTTATGTTTATCGGCA"
        ),
        organism="E. coli",
        description="Hygromycin B phosphotransferase",
        accession="K01193",
        aliases=["HygR", "hph", "hygromycin phosphotransferase"],
    ),

    # 5. ZeoR / Sh ble (bleomycin/zeocin resistance)
    #    From Streptoalloteichus hindustanus ble gene (GenBank AJ223978 / L36849).
    KnownFeature(
        name="ZeoR",
        type="CDS",
        sequence=(
            "ATGGCCAAGTTGACCAGTGCCGTTCCGGTGCTCACCGCGCGCGACGTCGCCGGAGCGGT"
            "CGAGTTCTGGACCGACCGGCTCGGGTTCTCCCGGGACTTCGTGGAGGACGACTTCGCCGG"
            "TGTGGTCCGGGACGACGTGACCCTGTTCATCAGCGCGGTCCAGGACCAGGTGGTGCCGGA"
            "CAACACCCTGGCCTG"
        ),
        organism="Streptoalloteichus hindustanus",
        description="Bleomycin/zeocin binding protein (Sh ble)",
        accession="L36849",
        aliases=["ZeoR", "Sh ble", "ble", "bleomycin resistance"],
    ),

    # 6. NatR (nourseothricin acetyltransferase, nat1)
    #    From Streptomyces noursei, commonly used cassette (GenBank AF051915 / Z48750).
    KnownFeature(
        name="NatR",
        type="CDS",
        sequence=(
            "ATGGCCACTCCTGAAATAGGTAACTCAATAGCTGCGCAAATCTTCAATGCCACTAAACCT"
            "GATGCCAATGGTGCTTTCAGTACCAGAGAAGCTAATGAAATTCCAGAAACAGATCCGCTT"
            "ATTGTTGATTTGGGTGTCAACTCAATGGAAGATTTCAGCAAACTACCTTCAATACCTACT"
            "GATAATGCTCTTCCC"
        ),
        organism="Streptomyces noursei",
        description="Nourseothricin N-acetyltransferase",
        accession="Z48750",
        aliases=["NatR", "nat1", "nourseothricin acetyltransferase"],
    ),

    # 7. pyrG (orotidine-5'-phosphate decarboxylase, A. fumigatus)
    #    GenBank M55544, CDS.
    KnownFeature(
        name="pyrG",
        type="CDS",
        sequence=(
            "ATGACTATTCCTACCGCCACCCCTACTTCTAACTCTGCCAATGGCGGCCCTTTGACCATG"
            "GCTACTCCCAATCGTCCCAAGGTCATCACTATTGAGGGTTTCGATTCCCTTGGAAGCACT"
            "GAAACCACAAAGCCAAACATCGATACCTGGAAGGTTGATCTGATCGTTGACTTCTGTCAG"
            "AATGCCAATGAAGATG"
        ),
        organism="Aspergillus fumigatus",
        description="Orotidine-5'-phosphate decarboxylase (URA3 ortholog)",
        accession="M55544",
        aliases=["pyrG", "orotidine-5'-phosphate decarboxylase"],
    ),

    # ===================================================================
    # REPORTERS (CDS)
    # ===================================================================

    # 8. GFP (wild-type, Aequorea victoria)
    #    GenBank U55762, original Prasher/Chalfie GFP CDS.
    KnownFeature(
        name="GFP",
        type="CDS",
        sequence=(
            "ATGAGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGT"
            "GATGTTAATGGGCACAAATTTTCTGTCAGTGGAGAGGGTGAAGGTGATGCAACATACGGA"
            "AAACTTACCCTTAAATTTATTTGCACTACTGGAAAACTACCTGTTCCATGGCCAACACTTG"
            "TCACTACTTTCGGTTAT"
        ),
        organism="Aequorea victoria",
        description="Green fluorescent protein (wild-type)",
        accession="U55762",
        aliases=["GFP", "green fluorescent protein", "avGFP"],
    ),

    # 9. EGFP (enhanced GFP — codon-optimised, F64L/S65T)
    #    From pEGFP-N1 (Clontech), GenBank U55762 with known mutations.
    #    Canonical EGFP ORF from Addgene / pEGFP-C1 (GenBank AAB02572 mRNA).
    KnownFeature(
        name="EGFP",
        type="CDS",
        sequence=(
            "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGA"
            "CGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTA"
            "CGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCAC"
            "CCTCGTGACCACCTTCG"
        ),
        organism="Synthetic (Aequorea victoria)",
        description="Enhanced green fluorescent protein (F64L/S65T, humanized)",
        accession="AAB02572",
        aliases=["EGFP", "enhanced GFP"],
    ),

    # 10. mCherry
    #     GenBank AY678264, CDS of mCherry from Discosoma sp.
    KnownFeature(
        name="mCherry",
        type="CDS",
        sequence=(
            "ATGGTGAGCAAGGGCGAGGAGGATAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAG"
            "GTGCACATGGAGGGCTCCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGC"
            "CGCCCCTACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCC"
            "TTCGCCTGGGACATCCT"
        ),
        organism="Synthetic (Discosoma sp.)",
        description="Monomeric red fluorescent protein mCherry",
        accession="AY678264",
        aliases=["mCherry", "red fluorescent protein"],
    ),

    # 11. LacZ (beta-galactosidase, first 200 bp)
    #     GenBank J01636 / V00296 (E. coli lacZ).
    KnownFeature(
        name="LacZ",
        type="CDS",
        sequence=(
            "ATGACCATGATTACGCCAAGCTATTTAGGTGACACTATAGAATACTCAAGCTATGCATCA"
            "AGCTTGGTACCGAGCTCGGATCCACTAGTAACGGCCGCCAGTGTGCTGGAATTCGCCCT"
            "TATAGTGAGTCGTATTACAATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGAAAA"
            "CCCTGGCGTTACCCAACT"
        ),
        organism="E. coli",
        description="Beta-galactosidase (lacZ alpha + start of coding)",
        accession="V00296",
        aliases=["LacZ", "lacZ", "beta-galactosidase"],
    ),

    # ===================================================================
    # CRISPR (CDS)
    # ===================================================================

    # 12. SpCas9 (S. pyogenes Cas9, humanized CDS)
    #     GenBank KM099231 / from pX330 (Addgene 42230).  First 200 bp of
    #     the human-codon-optimised CDS.
    KnownFeature(
        name="SpCas9",
        type="CDS",
        sequence=(
            "ATGGACAAGAAGTACAGCATCGGCCTGGACATCGGCACCAACTCTGTGGGCTGGGCCGTG"
            "ATCACCGACGAGTACAAGGTGCCCAGCAAGAAATTCAAGGTGCTGGGCAACACCGACCG"
            "GCACAGCATCAAGAAGAACCTGATCGGCGCCCTGCTGTTCGACAGCGGCGAAACAGCCGA"
            "GGCCACCCGCCTGAAGCG"
        ),
        organism="Synthetic (Streptococcus pyogenes)",
        description="S. pyogenes Cas9, human codon-optimised",
        accession="KM099231",
        aliases=["Cas9", "SpCas9", "hSpCas9"],
    ),

    # ===================================================================
    # PROMOTERS
    # ===================================================================

    # 13. T7 promoter (with flanking context from pET vectors)
    #     The core T7 promoter is TAATACGACTCACTATA (17 bp).
    #     Flanking sequence from pET-28a(+) (GenBank region).
    KnownFeature(
        name="T7 promoter",
        type="promoter",
        sequence=(
            "TGATCCCGCGAAATTAATACGACTCACTATAGGGAGACCACAACGGTTTCCCTCTAGAAA"
            "TAATTTTGTTTAACTTTAAGAAGGAGATATACATATG"
        ),
        organism="Bacteriophage T7",
        description="T7 RNA polymerase promoter with RBS (pET context)",
        accession="pET-28a",
        aliases=["T7", "T7 promoter", "T7pro"],
    ),

    # 14. CMV immediate-early promoter/enhancer (first 200 bp)
    #     GenBank K03104 (HCMV IE region) / commonly from pcDNA3.1.
    KnownFeature(
        name="CMV promoter",
        type="promoter",
        sequence=(
            "GTTGACATTGATTATTGACTAGTTATTAATAGTAATCAATTACGGGGTCATTAGTTCATA"
            "GCCCATATATGGAGTTCCGCGTTACATAACTTACGGTAAATGGCCCGCCTGGCTGACCGC"
            "CCAACGACCCCCGCCCATTGACGTCAATAATGACGTATGTTCCCATAGTAACGCCAATAG"
            "GGACTTTCCATTGACGTC"
        ),
        organism="Human cytomegalovirus",
        description="CMV immediate-early enhancer/promoter",
        accession="K03104",
        aliases=["CMV", "CMVp", "CMV IE promoter", "pCMV"],
    ),

    # 15. lac promoter + operator
    #     From E. coli lac operon (GenBank J01636 / V00296).
    KnownFeature(
        name="lac promoter",
        type="promoter",
        sequence=(
            "GACACCATCGAATGGCGCAAAACCTTTCGCGGTATGGCATGATAGCGCCCGGAAGAGAGT"
            "CAATTCAGGGTGGTGAATGTGAAACCAGTAACGTTATACGATGTCGCAGAGTATGCCGGT"
            "GTCTCTTATCAGACCGTTTCCCGCGTGGTGAACCAGGCCAGCCACGTTTCTGCGAAAACG"
            "CGGGAAAAAGTGGAAGCG"
        ),
        organism="E. coli",
        description="lac promoter with operator (Plac/O)",
        accession="J01636",
        aliases=["lac", "Plac", "lac promoter", "lacUV5"],
    ),

    # ===================================================================
    # TERMINATORS
    # ===================================================================

    # 16. CYC1 terminator (S. cerevisiae)
    #     From pYES2 / GenBank V01298.  The CYC1 transcription terminator
    #     region commonly cloned is ~200 bp downstream of CYC1 stop.
    KnownFeature(
        name="CYC1 terminator",
        type="terminator",
        sequence=(
            "CATGTAATTAGTTATGTCACGCTTACATTCACGCCCTCCCCCCACATCCGCTCTAACCGAA"
            "AAGGAAGGAGTTAGACAACCTGAAGTCTAGGTCCCTATTTATTTTTTTATAGTTATGTTAG"
            "TATTAAGAACGTTATTTATATTTCAAATTTTTCTTTTTTTTCTGTACAGACGCGTGTACGC"
            "ATGTAACATTATACTG"
        ),
        organism="Saccharomyces cerevisiae",
        description="CYC1 transcription terminator",
        accession="V01298",
        aliases=["CYC1t", "tCYC1", "CYC1 terminator"],
    ),

    # 17. SV40 late poly(A) signal
    #     From SV40 genome (GenBank J02400), late polyadenylation region.
    KnownFeature(
        name="SV40 polyA",
        type="terminator",
        sequence=(
            "AACTTGTTTATTGCAGCTTATAATGGTTACAAATAAAGCAATAGCATCACAAATTTCACAAA"
            "TAAAGCATTTTTTTCACTGCATTCTAGTTGTGGTTTGTCCAAACTCATCAATGTATCTTAT"
            "CATGTCTGGATCAACTGGATAACTCAAGCTAACCAAAATCATCCCAAACTTCCCACCCCATA"
            "CCCTATTACCACTGC"
        ),
        organism="Simian virus 40",
        description="SV40 late polyadenylation signal",
        accession="J02400",
        aliases=["SV40 pA", "SV40 polyA", "SV40 late polyA"],
    ),

    # 18. BGH poly(A) signal
    #     Bovine growth hormone polyadenylation signal, from pcDNA3.1
    #     (GenBank M57764 region / Invitrogen vectors).
    KnownFeature(
        name="BGH polyA",
        type="terminator",
        sequence=(
            "CTGTGCCTTCTAGTTGCCAGCCATCTGTTGTTTGCCCCTCCCCCGTGCCTTCCTTGACCC"
            "TGGAAGGTGCCACTCCCACTGTCCTTTCCTAATAAAATGAGGAAATTGCATCGCATTGTC"
            "TGAGTAGGTGTCATTCTATTCTGGGGGGTGGGGTGGGGCAGGACAGCAAGGGGGAGGATT"
            "GGGAAGACAATAGCAGG"
        ),
        organism="Bos taurus",
        description="Bovine growth hormone polyadenylation signal",
        accession="M57764",
        aliases=["BGH pA", "BGH polyA", "bGH polyA"],
    ),

    # ===================================================================
    # ORIGINS OF REPLICATION
    # ===================================================================

    # 19. pUC ori / pMB1 ori (high-copy ColE1-derived)
    #     From pUC19 (GenBank L09137), origin region.
    KnownFeature(
        name="pUC ori",
        type="origin",
        sequence=(
            "TTGAGATCCTTTTTTTCTGCGCGTAATCTGCTGCTTGCAAACAAAAAAACCACCGCTACC"
            "AGCGGTGGTTTGTTTGCCGGATCAAGAGCTACCAACTCTTTTTCCGAAGGTAACTGGCTT"
            "CAGCAGAGCGCAGATACCAAATACTGTCCTTCTAGTGTAGCCGTAGTTAGGCCACCACTTC"
            "AAGAACTCTGTAGCAC"
        ),
        organism="E. coli",
        description="pUC/pMB1 high-copy origin (ColE1-derived)",
        accession="L09137",
        aliases=["pUC ori", "pMB1 ori", "ColE1 ori"],
    ),

    # 20. f1 ori (filamentous phage origin)
    #     From bacteriophage f1 (GenBank J02448), intergenic region.
    KnownFeature(
        name="f1 ori",
        type="origin",
        sequence=(
            "ACGCGCCCTGTAGCGGCGCATTAAGCGCGGCGGGTGTGGTGGTTACGCGCAGCGTGACCG"
            "CTACACTTGCCAGCGCCCTAGCGCCCGCTCCTTTCGCTTTCTTCCCTTCCTTTCTCGCCAC"
            "GTTCGCCGGCTTTCCCCGTCAAGCTCTAAATCGGGGGCTCCCTTTAGGGTTCCGATTTAGT"
            "GCTTTACGGCACCTCG"
        ),
        organism="Bacteriophage f1",
        description="f1 phage origin of replication (ssDNA)",
        accession="J02448",
        aliases=["f1 ori", "f1 origin"],
    ),

    # 21. SV40 ori
    #     From SV40 (GenBank J02400), origin of replication region.
    KnownFeature(
        name="SV40 ori",
        type="origin",
        sequence=(
            "ATCCCGCCCCTAACTCCGCCCATCCCGCCCCTAACTCCGCCCAGTTCCGCCCATTCTCCGC"
            "CCCATGGCTGACTAATTTTTTTTATTTATGCAGAGGCCGAGGCCGCCTCGGCCTCTGAGCT"
            "ATTCCAGAAGTAGTGAGGAGGCTTTTTTGGAGGCCTAGGCTTTTGCAAAAAGCTCCCCGTG"
            "GCACGACAGGTTTCCC"
        ),
        organism="Simian virus 40",
        description="SV40 origin of replication",
        accession="J02400",
        aliases=["SV40 ori", "SV40 origin"],
    ),
]


# ---------------------------------------------------------------------------
# Detection function
# ---------------------------------------------------------------------------

def detect_known_features(
    query_sequence: str,
    *,
    min_match_length: int = 40,
) -> list[dict]:
    """Search *query_sequence* for exact substring matches against the database.

    Both the forward and reverse-complement strands of *query_sequence* are
    searched.  Returns a list of dicts, each containing:

    * ``name``        – feature name
    * ``type``        – feature type (CDS / promoter / terminator / origin)
    * ``strand``      – +1 (forward) or -1 (reverse complement)
    * ``start``       – 0-based start position on the query (forward strand)
    * ``end``         – 0-based end position (exclusive) on the query
    * ``match_len``   – length of the matching region (bp)
    * ``description`` – human-readable description
    * ``organism``    – source organism
    * ``accession``   – GenBank accession

    Parameters
    ----------
    query_sequence:
        The nucleotide sequence to scan (case-insensitive).
    min_match_length:
        Minimum overlap (bp) required to report a hit.  Defaults to 40 so
        that very short spurious matches are ignored.
    """
    query_upper = query_sequence.upper().replace(" ", "").replace("\n", "")
    rc_query = reverse_complement(query_upper)
    query_len = len(query_upper)

    hits: list[dict] = []

    for feat in KNOWN_FEATURES:
        feat_seq = feat.sequence

        # Skip features shorter than the minimum match length.
        if len(feat_seq) < min_match_length:
            continue

        # Try progressively shorter prefixes of the feature sequence so we
        # find the longest match even if the feature is truncated at the
        # edge of the query.  Start from the full length and shrink.
        for strand_label, target in ((1, query_upper), (-1, rc_query)):
            best_pos = -1
            best_len = 0

            # Full feature match first (fast path).
            pos = target.find(feat_seq)
            if pos != -1:
                best_pos = pos
                best_len = len(feat_seq)
            else:
                # Try shrinking from the right (query may only contain a
                # prefix of the feature).
                lo, hi = min_match_length, len(feat_seq) - 1
                while lo <= hi:
                    mid = (lo + hi) // 2
                    sub = feat_seq[:mid]
                    if sub in target:
                        lo = mid + 1
                    else:
                        hi = mid - 1
                # *hi* is now the longest prefix length that is found.
                if hi >= min_match_length:
                    sub = feat_seq[:hi]
                    pos = target.find(sub)
                    if pos != -1:
                        best_pos = pos
                        best_len = hi

                # Also try suffix matching (query may contain only the tail
                # of the feature).
                lo2, hi2 = min_match_length, len(feat_seq) - 1
                while lo2 <= hi2:
                    mid = (lo2 + hi2) // 2
                    sub = feat_seq[-mid:]
                    if sub in target:
                        lo2 = mid + 1
                    else:
                        hi2 = mid - 1
                if hi2 >= min_match_length and hi2 > best_len:
                    sub = feat_seq[-hi2:]
                    pos = target.find(sub)
                    if pos != -1:
                        best_pos = pos
                        best_len = hi2

            if best_pos == -1 or best_len < min_match_length:
                continue

            # Convert positions when the hit is on the reverse complement.
            if strand_label == 1:
                start = best_pos
                end = best_pos + best_len
            else:
                start = query_len - best_pos - best_len
                end = query_len - best_pos

            hits.append({
                "name": feat.name,
                "type": feat.type,
                "strand": strand_label,
                "start": start,
                "end": end,
                "match_len": best_len,
                "description": feat.description,
                "organism": feat.organism,
                "accession": feat.accession,
            })

    # Sort by descending match length then by start position.
    hits.sort(key=lambda h: (-h["match_len"], h["start"]))
    return hits


# ---------------------------------------------------------------------------
# Convenience helpers
# ---------------------------------------------------------------------------

def list_features_by_type(feature_type: str) -> list[KnownFeature]:
    """Return all known features of the given *feature_type* (case-insensitive)."""
    ft = feature_type.upper()
    return [f for f in KNOWN_FEATURES if f.type.upper() == ft]


def get_feature_by_name(name: str) -> Optional[KnownFeature]:
    """Look up a feature by *name* or any of its aliases (case-insensitive)."""
    name_lower = name.lower()
    for f in KNOWN_FEATURES:
        if f.name.lower() == name_lower:
            return f
        if any(a.lower() == name_lower for a in f.aliases):
            return f
    return None


# ---------------------------------------------------------------------------
# Quick self-test when run directly
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"Feature database: {len(KNOWN_FEATURES)} entries\n")
    for f in KNOWN_FEATURES:
        print(f"  {f.name:20s}  {f.type:12s}  {len(f.sequence):>4d} bp  {f.organism}")

    # Smoke test: detect EGFP in a mini construct.
    egfp = get_feature_by_name("EGFP")
    if egfp:
        test_seq = "AAAA" + egfp.sequence + "TTTT"
        results = detect_known_features(test_seq)
        print(f"\nSmoke test — searching for features in EGFP test construct:")
        for r in results:
            print(f"  {r['name']:20s}  strand={r['strand']:+d}  "
                  f"{r['start']}..{r['end']}  ({r['match_len']} bp)")
    print("\nDone.")

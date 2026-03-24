"""Intron detection by cDNA-to-genomic alignment + exon fusion fragment generation."""

from __future__ import annotations


def detect_introns_by_alignment(
    genomic_seq: str,
    cdna_seq: str,
    max_intron: int = 5000,
) -> dict:
    """Align cDNA to genomic sequence to find intron positions.

    Uses minimap2 (mappy) with splice-aware alignment.
    Returns dict with exons, introns, strand, quality metrics.
    """
    try:
        import mappy as mp
    except ImportError:
        return {"error": "mappy not installed. Run: pip install mappy", "exons": [], "introns": []}

    aligner = mp.Aligner(seq=genomic_seq, preset="splice")
    if not aligner:
        return {"error": "Failed to build aligner index", "exons": [], "introns": []}

    best = None
    for hit in aligner.map(cdna_seq):
        if best is None or hit.mapq > best.mapq:
            best = hit

    if not best:
        return {"error": "No alignment found", "exons": [], "introns": []}

    exons: list[dict] = []
    introns: list[dict] = []
    ref_pos = best.r_st
    exon_start = ref_pos

    for length, op in best.cigar:
        if op in (0, 7, 8):  # M/=/X: matching
            ref_pos += length
        elif op == 2:  # D: deletion in reference
            ref_pos += length
        elif op == 3:  # N: intron (skipped region)
            exons.append({
                "start": exon_start + 1, "end": ref_pos,
                "length": ref_pos - exon_start,
            })
            donor = genomic_seq[ref_pos:ref_pos + 2].upper()
            acceptor = genomic_seq[ref_pos + length - 2:ref_pos + length].upper()
            introns.append({
                "start": ref_pos + 1, "end": ref_pos + length,
                "length": length,
                "donor": donor,
                "acceptor": acceptor,
                "canonical": donor == "GT" and acceptor == "AG",
            })
            ref_pos += length
            exon_start = ref_pos
        elif op == 1:  # I: insertion in query
            pass

    # Last exon
    if ref_pos > exon_start:
        exons.append({
            "start": exon_start + 1, "end": ref_pos,
            "length": ref_pos - exon_start,
        })

    return {
        "exons": exons,
        "introns": introns,
        "n_exons": len(exons),
        "n_introns": len(introns),
        "strand": "+" if best.strand == 1 else "-",
        "mapping_quality": best.mapq,
        "cdna_coverage": round((best.q_en - best.q_st) / max(len(cdna_seq), 1), 3),
        "genomic_region": {"start": best.r_st + 1, "end": best.r_en},
        "all_canonical": all(i["canonical"] for i in introns) if introns else True,
    }


def generate_exon_fusion_fragments(
    genomic_seq: str,
    exons: list[dict],
    overlap_length: int = 30,
) -> dict:
    """Generate overlap PCR fragments to fuse exons (remove introns).

    Each exon becomes a PCR fragment. Overlap zones bridge exon junctions
    with the INTRON-FREE sequence. All fragments amplified from cDNA or
    designed as the exon-exon junction.
    """
    fragments = []
    junctions = []

    for i, exon in enumerate(exons):
        frag_seq = genomic_seq[exon["start"] - 1:exon["end"]]
        fragments.append({
            "name": f"exon_{i + 1}",
            "sequence": frag_seq,
            "length": len(frag_seq),
            "needsAmplification": True,
            "sourceType": "template_pcr",
            "type": "CDS",
            "strand": 1,
            "isExon": True,
            "exonNumber": i + 1,
        })

        # Junction: overlap = end of this exon + start of next exon (NO intron)
        if i < len(exons) - 1:
            next_seq = genomic_seq[exons[i + 1]["start"] - 1:exons[i + 1]["end"]]
            half = overlap_length // 2
            ol_left = frag_seq[-half:] if len(frag_seq) >= half else frag_seq
            ol_right = next_seq[:overlap_length - len(ol_left)] if len(next_seq) >= overlap_length - len(ol_left) else next_seq
            overlap = ol_left + ol_right

            removed_len = exons[i + 1]["start"] - exon["end"] - 1
            junctions.append({
                "type": "overlap",
                "overlapMode": "split",
                "overlapLength": len(overlap),
                "overlapSequence": overlap,
                "isExonJunction": True,
                "removedIntronLength": removed_len,
            })

    return {
        "fragments": fragments,
        "junctions": junctions,
        "totalExonLength": sum(f["length"] for f in fragments),
        "intronsRemoved": len(junctions),
    }

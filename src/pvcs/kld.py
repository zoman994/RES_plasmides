"""KLD (Kinase-Ligase-DpnI) site-directed mutagenesis designer.

Designs back-to-back primers for inverse PCR mutagenesis.
Supports point mutations, insertions, and deletions.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from pvcs.models import Primer, _new_id
from pvcs.utils import calc_tm, gc_content, reverse_complement, translate_codon


@dataclass
class KLDDesign:
    """Result of KLD mutagenesis primer design."""
    mutation_type: str          # "point_mutation", "insertion", "deletion"
    position: int               # 1-based position in template
    description: str            # "Q158R (CAG→CGG)"
    template_length: int
    mutant_sequence: str        # predicted full mutant sequence
    primers: list[Primer]       # [fwd, rev] — back-to-back
    warnings: list[str]


def design_kld_point_mutation(
    template_sequence: str,
    position: int,
    new_codon: str,
    feature_name: str = "",
    binding_length: int = 20,
    salt_mm: float = 50.0,
) -> KLDDesign:
    """Design KLD primers for a point mutation (codon swap).

    Args:
        template_sequence: Full circular template sequence.
        position: 1-based nucleotide position of the codon to change.
        new_codon: 3-letter codon to substitute (e.g. "CGG").
        feature_name: Name of the CDS (for description).
        binding_length: Primer binding region length.

    Returns:
        KLDDesign with back-to-back primers.
    """
    seq = template_sequence.upper()
    pos0 = position - 1  # 0-based
    new_codon = new_codon.upper()

    if pos0 < 0 or pos0 + 3 > len(seq):
        raise ValueError(f"Position {position} out of range")

    old_codon = seq[pos0:pos0 + 3]
    old_aa = translate_codon(old_codon)
    new_aa = translate_codon(new_codon)
    codon_num = (pos0 // 3) + 1

    description = f"{old_aa}{codon_num}{new_aa} ({old_codon}\u2192{new_codon})"
    if feature_name:
        description += f" in {feature_name}"

    # Mutant sequence
    mutant = seq[:pos0] + new_codon + seq[pos0 + 3:]

    # Forward primer: starts at mutation, includes mutant codon + downstream binding
    fwd_start = pos0
    fwd_end = min(pos0 + 3 + binding_length, len(seq))
    fwd_seq = new_codon + seq[pos0 + 3:fwd_end]

    # Reverse primer: ends just before mutation, upstream binding (reverse complement)
    rev_end = pos0
    rev_start = max(0, rev_end - binding_length)
    rev_seq = reverse_complement(seq[rev_start:rev_end])

    warnings = []
    if len(fwd_seq) < 18:
        warnings.append("Forward primer is short — consider extending")
    if len(rev_seq) < 18:
        warnings.append("Reverse primer is short — consider extending")

    fwd = Primer(
        id=_new_id(), name=f"KLD_fwd_{feature_name or 'mut'}",
        sequence=fwd_seq,
        binding_start=fwd_start + 1, binding_end=fwd_end,
        binding_sequence=fwd_seq,
        tm_binding=calc_tm(fwd_seq, salt_mm=salt_mm),
        tail_sequence="", tail_purpose="mutant codon",
        tm_full=calc_tm(fwd_seq, salt_mm=salt_mm),
        gc_percent=round(gc_content(fwd_seq) * 100, 1),
        length=len(fwd_seq), direction="forward",
    )

    rev = Primer(
        id=_new_id(), name=f"KLD_rev_{feature_name or 'mut'}",
        sequence=rev_seq,
        binding_start=rev_start + 1, binding_end=rev_end,
        binding_sequence=rev_seq,
        tm_binding=calc_tm(rev_seq, salt_mm=salt_mm),
        tail_sequence="", tail_purpose="back-to-back with fwd",
        tm_full=calc_tm(rev_seq, salt_mm=salt_mm),
        gc_percent=round(gc_content(rev_seq) * 100, 1),
        length=len(rev_seq), direction="reverse",
    )

    return KLDDesign(
        mutation_type="point_mutation",
        position=position,
        description=description,
        template_length=len(seq),
        mutant_sequence=mutant,
        primers=[fwd, rev],
        warnings=warnings + ["5' phosphorylation required on both primers"],
    )


def design_kld_insertion(
    template_sequence: str,
    position: int,
    insert_sequence: str,
    binding_length: int = 20,
    salt_mm: float = 50.0,
) -> KLDDesign:
    """Design KLD primers for an insertion."""
    seq = template_sequence.upper()
    ins = insert_sequence.upper()
    pos0 = position - 1

    mutant = seq[:pos0] + ins + seq[pos0:]
    description = f"Insert {len(ins)} bp at pos {position}"

    # Forward: insert + downstream binding
    fwd_seq = ins + seq[pos0:pos0 + binding_length]
    # Reverse: upstream binding RC
    rev_start = max(0, pos0 - binding_length)
    rev_seq = reverse_complement(seq[rev_start:pos0])

    fwd = Primer(
        id=_new_id(), name="KLD_fwd_ins",
        sequence=fwd_seq, binding_sequence=fwd_seq,
        tm_binding=calc_tm(seq[pos0:pos0 + binding_length], salt_mm=salt_mm),
        tail_sequence=ins, tail_purpose="inserted sequence",
        tm_full=calc_tm(fwd_seq, salt_mm=salt_mm),
        gc_percent=round(gc_content(fwd_seq) * 100, 1),
        length=len(fwd_seq), direction="forward",
    )
    rev = Primer(
        id=_new_id(), name="KLD_rev_ins",
        sequence=rev_seq, binding_sequence=rev_seq,
        tm_binding=calc_tm(rev_seq, salt_mm=salt_mm),
        tm_full=calc_tm(rev_seq, salt_mm=salt_mm),
        gc_percent=round(gc_content(rev_seq) * 100, 1),
        length=len(rev_seq), direction="reverse",
    )

    return KLDDesign(
        mutation_type="insertion", position=position,
        description=description, template_length=len(seq),
        mutant_sequence=mutant, primers=[fwd, rev],
        warnings=["5' phosphorylation required on both primers"],
    )


def design_kld_deletion(
    template_sequence: str,
    start: int,
    end: int,
    binding_length: int = 20,
    salt_mm: float = 50.0,
) -> KLDDesign:
    """Design KLD primers for a deletion.

    Args:
        start: First deleted position (1-based, inclusive).
        end: Last deleted position (1-based, inclusive).
    """
    seq = template_sequence.upper()
    s0 = start - 1       # 0-based start (inclusive)
    e0 = end              # 0-based end (exclusive) = 1-based end (inclusive)

    deleted = seq[s0:e0]
    mutant = seq[:s0] + seq[e0:]
    del_len = e0 - s0
    description = f"Delete {del_len} bp at pos {start}-{end}"

    # Forward: binds just after deletion
    fwd_seq = seq[e0:e0 + binding_length]
    # Reverse: binds just before deletion (RC)
    rev_start = max(0, s0 - binding_length)
    rev_seq = reverse_complement(seq[rev_start:s0])

    fwd = Primer(
        id=_new_id(), name="KLD_fwd_del",
        sequence=fwd_seq, binding_sequence=fwd_seq,
        tm_binding=calc_tm(fwd_seq, salt_mm=salt_mm),
        tm_full=calc_tm(fwd_seq, salt_mm=salt_mm),
        gc_percent=round(gc_content(fwd_seq) * 100, 1),
        length=len(fwd_seq), direction="forward",
    )
    rev = Primer(
        id=_new_id(), name="KLD_rev_del",
        sequence=rev_seq, binding_sequence=rev_seq,
        tm_binding=calc_tm(rev_seq, salt_mm=salt_mm),
        tm_full=calc_tm(rev_seq, salt_mm=salt_mm),
        gc_percent=round(gc_content(rev_seq) * 100, 1),
        length=len(rev_seq), direction="reverse",
    )

    return KLDDesign(
        mutation_type="deletion", position=start,
        description=description, template_length=len(seq),
        mutant_sequence=mutant, primers=[fwd, rev],
        warnings=["5' phosphorylation required on both primers"],
    )

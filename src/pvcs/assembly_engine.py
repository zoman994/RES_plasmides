"""Assembly Engine v2 — unified primer generation based on Junction specs.

Each fragment decides: needs amplification?
Each junction decides: how do adjacent fragments connect?
Primer tails are computed per-junction, binding regions by Tm.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from pvcs.models import Primer, _new_id, _now
from pvcs.utils import calc_tm, gc_content, reverse_complement
from pvcs.overlap import _select_binding_region

# Golden Gate enzyme data
GG_ENZYMES: dict[str, dict] = {
    "BsaI":  {"site": "GGTCTC",  "cut_offset": 1},
    "BbsI":  {"site": "GAAGAC",  "cut_offset": 2},
    "Esp3I": {"site": "CGTCTC",  "cut_offset": 1},
    "BpiI":  {"site": "GAAGAC",  "cut_offset": 2},
    "SapI":  {"site": "GCTCTTC", "cut_offset": 1},
}


@dataclass
class AssemblyFragment:
    """A fragment in an assembly step."""
    id: str = field(default_factory=_new_id)
    order: int = 0
    name: str = ""

    source_type: str = ""        # "part"|"construct"|"sequence"|"previous_step"|"digest"
    source_id: str | None = None
    source_description: str = ""

    sequence: str = ""
    length: int = 0

    needs_amplification: bool = True
    amplification_note: str = ""  # "linearize with EcoRI", "synthesized by Vazyme"


@dataclass
class JunctionSpec:
    """How two adjacent fragments connect."""
    id: str = field(default_factory=_new_id)
    left_order: int = 0
    right_order: int = 0

    junction_type: str = "overlap"
    # "overlap"        — overlap PCR / Gibson
    # "golden_gate"    — Type IIS RE + 4-nt overhang
    # "sticky_end"     — restriction enzyme sticky ends
    # "blunt"          — blunt-end ligation
    # "preformed"      — ends already compatible, no modification
    # "phosphorylated" — KLD back-to-back

    # Overlap params
    overlap_mode: str = "split"   # "split"|"left_only"|"right_only"|"none"
    overlap_sequence: str = ""
    overlap_length: int = 0
    overlap_tm: float = 0.0
    overlap_gc: float = 0.0

    # Golden Gate params
    overhang_4nt: str = ""
    enzyme: str = ""

    # Restriction params
    re_enzyme: str = ""
    re_end_type: str = ""
    re_overhang: str = ""

    warnings: list[str] = field(default_factory=list)


@dataclass
class StepResult:
    """Result of primer generation for one step."""
    primers: list[Primer]
    output_sequence: str
    output_length: int
    warnings: list[str]


# ── Tail computation ──────────────────────────────────────────

def _compute_fwd_tail(
    junction: JunctionSpec,
    fragments: list[AssemblyFragment],
) -> tuple[str, str]:
    """Compute tail for forward primer of the RIGHT fragment at this junction."""

    if junction.junction_type == "overlap":
        if junction.overlap_mode == "right_only":
            return junction.overlap_sequence, f"full overlap with {fragments[junction.left_order - 1].name}"
        elif junction.overlap_mode == "split":
            half = len(junction.overlap_sequence) // 2
            seq = junction.overlap_sequence[half:]
            return seq, f"overlap (split) with {fragments[junction.left_order - 1].name}"
        else:  # left_only or none
            return "", ""

    elif junction.junction_type == "golden_gate":
        if not junction.enzyme or junction.enzyme not in GG_ENZYMES:
            return "", ""
        ed = GG_ENZYMES[junction.enzyme]
        spacer = "TT"
        tail = spacer + ed["site"] + "A" * ed["cut_offset"] + junction.overhang_4nt
        return tail, f"GG {junction.enzyme} + overhang {junction.overhang_4nt}"

    elif junction.junction_type == "sticky_end":
        if not junction.re_enzyme:
            return "", ""
        from pvcs.restriction import RE_DATABASE
        if junction.re_enzyme not in RE_DATABASE:
            return "", ""
        site = RE_DATABASE[junction.re_enzyme]["site"]
        return "TT" + site, f"RE site {junction.re_enzyme}"

    return "", ""


def _compute_rev_tail(
    junction: JunctionSpec,
    fragments: list[AssemblyFragment],
) -> tuple[str, str]:
    """Compute tail for reverse primer of the LEFT fragment at this junction."""

    if junction.junction_type == "overlap":
        if junction.overlap_mode == "left_only":
            rc = reverse_complement(junction.overlap_sequence)
            return rc, f"full overlap with {fragments[junction.right_order - 1].name}"
        elif junction.overlap_mode == "split":
            half = len(junction.overlap_sequence) // 2
            first_half = junction.overlap_sequence[:half]
            return reverse_complement(first_half), f"overlap (split) with {fragments[junction.right_order - 1].name}"
        else:
            return "", ""

    elif junction.junction_type == "golden_gate":
        if not junction.enzyme or junction.enzyme not in GG_ENZYMES:
            return "", ""
        ed = GG_ENZYMES[junction.enzyme]
        site_rc = reverse_complement(ed["site"])
        oh_rc = reverse_complement(junction.overhang_4nt)
        spacer = "TT"
        tail = spacer + site_rc + "A" * ed["cut_offset"] + oh_rc
        return tail, f"GG {junction.enzyme} RC + overhang RC({junction.overhang_4nt})"

    elif junction.junction_type == "sticky_end":
        if not junction.re_enzyme:
            return "", ""
        from pvcs.restriction import RE_DATABASE
        if junction.re_enzyme not in RE_DATABASE:
            return "", ""
        site_rc = reverse_complement(RE_DATABASE[junction.re_enzyme]["site"])
        return "TT" + site_rc, f"RE site {junction.re_enzyme} RC"

    return "", ""


# ── Main primer generation ────────────────────────────────────

def generate_primers_for_step(
    fragments: list[AssemblyFragment],
    junctions: list[JunctionSpec],
    circular: bool = True,
    binding_tm_target: float = 60.0,
    salt_mm: float = 50.0,
) -> StepResult:
    """Generate primers for all fragments that need amplification.

    For each fragment with needs_amplification=True:
      - Forward primer: binding region + left junction tail
      - Reverse primer: binding region + right junction tail

    Fragments with needs_amplification=False get no primers.
    """
    primers: list[Primer] = []
    warnings: list[str] = []
    n_frags = len(fragments)
    n_junc = len(junctions)

    for i, frag in enumerate(fragments):
        if not frag.needs_amplification:
            continue

        if not frag.sequence:
            warnings.append(f"Fragment {frag.name}: no sequence provided")
            continue

        # ── Forward primer ──
        fwd_binding, fwd_tm, _, _ = _select_binding_region(
            frag.sequence, 0, "forward",
            tm_target=binding_tm_target, salt_mm=salt_mm,
        )

        fwd_tail = ""
        fwd_purpose = ""
        # Junction LEFT of this fragment
        if i > 0 and (i - 1) < n_junc:
            fwd_tail, fwd_purpose = _compute_fwd_tail(junctions[i - 1], fragments)
        elif circular and n_junc > 0:
            fwd_tail, fwd_purpose = _compute_fwd_tail(junctions[-1], fragments)

        fwd_full = fwd_tail + fwd_binding
        primers.append(Primer(
            id=_new_id(), name=f"fwd_{frag.name}",
            sequence=fwd_full,
            binding_start=1, binding_end=len(fwd_binding),
            binding_sequence=fwd_binding,
            tm_binding=fwd_tm,
            tail_sequence=fwd_tail, tail_purpose=fwd_purpose,
            tm_full=calc_tm(fwd_full, salt_mm=salt_mm),
            gc_percent=round(gc_content(fwd_full) * 100, 1),
            length=len(fwd_full), direction="forward",
        ))

        # ── Reverse primer ──
        rev_binding, rev_tm, _, _ = _select_binding_region(
            frag.sequence, len(frag.sequence), "reverse",
            tm_target=binding_tm_target, salt_mm=salt_mm,
        )

        rev_tail = ""
        rev_purpose = ""
        # Junction RIGHT of this fragment
        if i < n_junc:
            rev_tail, rev_purpose = _compute_rev_tail(junctions[i], fragments)
        elif circular and n_junc > 0:
            rev_tail, rev_purpose = _compute_rev_tail(junctions[0], fragments)

        rev_full = rev_tail + rev_binding
        primers.append(Primer(
            id=_new_id(), name=f"rev_{frag.name}",
            sequence=rev_full,
            binding_start=len(frag.sequence) - len(rev_binding) + 1,
            binding_end=len(frag.sequence),
            binding_sequence=rev_binding,
            tm_binding=rev_tm,
            tail_sequence=rev_tail, tail_purpose=rev_purpose,
            tm_full=calc_tm(rev_full, salt_mm=salt_mm),
            gc_percent=round(gc_content(rev_full) * 100, 1),
            length=len(rev_full), direction="reverse",
        ))

    # ── Warnings ──
    for p in primers:
        if p.length > 60:
            warnings.append(f"{p.name}: {p.length} nt — long primer, consider PAGE purification")
        if p.tm_binding < 55:
            warnings.append(f"{p.name}: Tm_bind={p.tm_binding:.1f}°C — low, may need longer binding")
        if p.tm_binding > 68:
            warnings.append(f"{p.name}: Tm_bind={p.tm_binding:.1f}°C — high")
        gc = gc_content(p.binding_sequence)
        if gc < 0.35:
            warnings.append(f"{p.name}: GC={gc:.0%} in binding — low")
        elif gc > 0.70:
            warnings.append(f"{p.name}: GC={gc:.0%} in binding — high")

    # Check ΔTm between fwd/rev pairs
    binding_tms = [p.tm_binding for p in primers]
    if len(binding_tms) >= 2:
        delta = max(binding_tms) - min(binding_tms)
        if delta > 5:
            warnings.append(f"ΔTm between primers: {delta:.1f}°C (ideal < 5°C)")

    # Predicted output sequence
    output = "".join(f.sequence for f in fragments)

    return StepResult(
        primers=primers,
        output_sequence=output,
        output_length=len(output),
        warnings=warnings,
    )


# ── Overlap zone design ───────────────────────────────────────

def design_overlap_junction(
    left_seq: str,
    right_seq: str,
    overlap_length: int = 22,
    tm_target: float = 62.0,
    salt_mm: float = 50.0,
) -> JunctionSpec:
    """Design an overlap junction between two adjacent fragments."""
    # Overlap zone comes from the end of left + start of right
    half = overlap_length // 2
    left_part = left_seq[-half:] if len(left_seq) >= half else left_seq
    right_part = right_seq[:overlap_length - len(left_part)] if len(right_seq) >= overlap_length - len(left_part) else right_seq

    overlap_seq = left_part + right_part
    tm = calc_tm(overlap_seq, salt_mm=salt_mm)
    gc = gc_content(overlap_seq)

    # Extend if Tm too low
    while tm < tm_target and len(overlap_seq) < 35:
        if len(left_part) < len(left_seq):
            left_part = left_seq[-(len(left_part) + 1):]
        elif len(right_part) < len(right_seq):
            right_part = right_seq[:len(right_part) + 1]
        else:
            break
        overlap_seq = left_part + right_part
        tm = calc_tm(overlap_seq, salt_mm=salt_mm)
        gc = gc_content(overlap_seq)

    ws: list[str] = []
    if gc < 0.35:
        ws.append(f"Low GC ({gc:.0%}) in overlap")
    elif gc > 0.70:
        ws.append(f"High GC ({gc:.0%}) in overlap")

    return JunctionSpec(
        junction_type="overlap",
        overlap_mode="split",
        overlap_sequence=overlap_seq.upper(),
        overlap_length=len(overlap_seq),
        overlap_tm=round(tm, 1),
        overlap_gc=round(gc * 100, 1),
        warnings=ws,
    )


# ── Order sheet formatting ────────────────────────────────────

def format_order_sheet(primers: list[Primer], method: str = "") -> str:
    """Format primers for ordering (tab-separated)."""
    lines = ["Name\tSequence\tScale\tPurification\tModification"]
    for p in primers:
        scale = "25 nmol"
        purif = "PAGE" if p.length > 40 else "Desalt"
        mod = "5'-Phosphorylation" if method == "kld" else "\u2014"
        lines.append(f"{p.name}\t{p.sequence}\t{scale}\t{purif}\t{mod}")
    return "\n".join(lines)

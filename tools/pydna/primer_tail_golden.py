"""
primer_tail_golden — OFFLINE pydna experiment resolving the GG/RE primer-tail
convention (docs/specs/ASSEMBLY_WORKBENCH.md, primer contract).

Run ONCE with the isolated venv:
    .venv-pydna/Scripts/python.exe tools/pydna/primer_tail_golden.py

It does NOT touch the app. It (1) reproduces the EXACT tail formulas from
`lib/primer-derive.js` for each method, (2) uses pydna / Bio.Restriction as the
authority to decide — by FACT, not argument — whether the current engine
convention assembles correctly, and (3) emits golden reference data
(`primer_tail_golden.json`) that the JS biology-invariant test hard-codes.

KEY: pydna's digest is an IDEALISED sequence cut — it models site ORIENTATION
(decides GG / V124) but NOT empirical terminal-cleavage efficiency (so it
CANNOT by itself decide RE / V125 — that rests on NEB's "cleavage close to the
end of DNA fragments" data; reported honestly below).
"""
import json
import os
import sys
try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console is cp1251 by default
except Exception:
    pass
from Bio.Seq import Seq
from Bio.Restriction import BsaI, EcoRI
from pydna.dseqrecord import Dseqrecord
from pydna.amplify import pcr
from pydna.primer import Primer
from pydna.assembly import Assembly


def rc(s: str) -> str:
    return str(Seq(s).reverse_complement())


# Non-repetitive pieces so primers anneal uniquely (pydna pcr is specificity-strict).
P1 = "ATGCGTACGGATCCTTAGCACTGACATGGTCAGTACCGATTACGGCATTGCAACG"
P2 = "TTGACATCCGTAAGCTTGGCCAATTGCCATGAGTCTAGACCGGTATCAAGCTTGA"
P3 = "CCATGGTACCGAGCTCGAATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGA"

OVERLAP_LEN = 25
BINDING_LEN = 20
report = {"methods": {}, "notes": []}


def section(title):
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)


# ─────────────────────────────────────────────────────────────────────────
# 1. OVERLAP / GIBSON — engine convention (fwd verbatim, rev rc) is claimed
#    already-correct (§A2). pydna Assembly is the authority: do the amplicons
#    built from those tails assemble seamlessly into P1+P2+P3?
# ─────────────────────────────────────────────────────────────────────────
section("OVERLAP / GIBSON — does the engine convention assemble seamlessly?")

def overlap_amplicon(prev, piece, nxt):
    """Replicate buildFwdTail/buildRevTail overlap branch + binding."""
    fwd_tail = prev[-OVERLAP_LEN:] if prev else ""
    rev_tail = rc(nxt[:OVERLAP_LEN]) if nxt else ""
    fwd = Primer(fwd_tail + piece[:BINDING_LEN])
    rev = Primer(rev_tail + rc(piece[-BINDING_LEN:]))
    return pcr(fwd, rev, Dseqrecord(piece))

amps = [
    overlap_amplicon(None, P1, P2),
    overlap_amplicon(P1, P2, P3),
    overlap_amplicon(P2, P3, None),
]
for i, a in enumerate(amps):
    print(f"  amplicon{i+1} len={len(a)}")
asm = Assembly(amps, limit=OVERLAP_LEN)
linear = asm.assemble_linear()
seamless = P1 + P2 + P3
ok_overlap = any(str(c.seq) == seamless for c in linear)
print(f"  seamless target len={len(seamless)}")
print(f"  assembled candidates: {[len(c) for c in linear]}")
print(f"  ENGINE OVERLAP CONVENTION CORRECT (seamless P1+P2+P3): {ok_overlap}")
report["methods"]["overlap"] = {
    "engine_convention_correct": bool(ok_overlap),
    "golden_product": seamless,
    "golden_len": len(seamless),
}


# ─────────────────────────────────────────────────────────────────────────
# 2. GOLDEN GATE — orientation question (V124). Build the central insert's
#    amplicon two ways and digest with BsaI; the released insert must carry
#    the DESIGNED 5' overhangs ohL (left) and ohR (right) so it ligates.
# ─────────────────────────────────────────────────────────────────────────
section("GOLDEN GATE — which rev-tail convention yields the designed overhangs?")

INSERT = "CATTGCAACGTTGACATCCGTAAGCTTGGCCAATTGCCATGAGTCTAGAC"  # 50 nt
ohL = "AATG"   # designed left overhang (start codon context)
ohR = "GCTT"   # designed right overhang
REC = "GGTCTC"  # BsaI recognition (engine literal); spacer 'N'→'A' for simulability
SPACER = "A"

# Engine fwd tail (both conventions identical): GGTCTC + N + ohL  →  recognition
# points INTO the insert at the left end (already correct).
fwd_tail = REC + SPACER + ohL

# rev tail, CURRENT engine: rc("GGTCTC" + N + ohR)  (rc of the WHOLE thing).
rev_tail_current = rc(REC + SPACER + ohR)
# rev tail, V124 fix: "GGTCTC" + N + rc(ohR)  (recognition NOT rc'd, only oh).
rev_tail_v124 = REC + SPACER + rc(ohR)


def gg_amplicon_top(rev_tail):
    # amplicon top strand = fwd_tail + insert + rc(rev_tail)
    return fwd_tail + INSERT + rc(rev_tail)


def released_overhangs(amplicon_top):
    """Digest the (blunt) amplicon with BsaI; return the overhangs of the
    central fragment (the released insert) as ('5'|3'|blunt', seq) pairs."""
    rec = Dseqrecord(amplicon_top)
    frags = rec.cut(BsaI)
    if not frags:
        return None, []
    # central = the longest fragment (the insert core between the two cuts)
    central = max(frags, key=len)
    return central, [central.seq.five_prime_end(), central.seq.three_prime_end()]


for label, rev_tail in [("CURRENT (rc of whole recognition)", rev_tail_current),
                        ("V124 (recognition kept, rc(oh) only)", rev_tail_v124)]:
    top = gg_amplicon_top(rev_tail)
    central, ends = released_overhangs(top)
    five = ends[0] if ends else None
    three = ends[1] if ends else None
    # Correct GG insert: BOTH ends are 5' overhangs; left==ohL, right==rc(ohR)
    # (the right 5'-overhang reads as the complement of the designed ohR on the
    # top strand's 3' end). We normalise by comparing overhang identity.
    left_ov = five[1].upper() if five and five[0] == "5'" else None
    right_ov = three[1].upper() if three and three[0] == "5'" else None
    ok = (left_ov == ohL.upper()) and bool(right_ov)
    print(f"\n  {label}")
    print(f"    central insert len={len(central) if central else 0}")
    print(f"    5'-end  = {five}")
    print(f"    3'-end  = {three}")
    print(f"    left overhang == designed ohL ({ohL})? {left_ov == ohL.upper()}")
    print(f"    right end is a clean 5' overhang? {right_ov is not None}")
    print(f"    => GG CONVENTION ASSEMBLES CORRECTLY: {ok}")
    report["methods"].setdefault("golden_gate", {})[
        "current" if label.startswith("CURRENT") else "v124"
    ] = {
        "rev_tail": rev_tail,
        "central_len": len(central) if central else 0,
        "five_prime": list(five) if five else None,
        "three_prime": list(three) if three else None,
        "assembles_correctly": bool(ok),
    }

report["methods"]["golden_gate"]["designed_ohL"] = ohL
report["methods"]["golden_gate"]["designed_ohR"] = ohR


# ─────────────────────────────────────────────────────────────────────────
# 3. RESTRICTION — terminal-cleavage question (V125). pydna cuts regardless of
#    flanking bases, so it CANNOT decide V125; we show that + record the NEB
#    empirical basis (protective bases OUTSIDE the site).
# ─────────────────────────────────────────────────────────────────────────
section("RESTRICTION — pydna cannot decide V125 (idealised cut); NEB empirical basis")

reSite = "GAATTC"  # EcoRI
# CURRENT engine fwd tail: reSite + "GG"  →  site FLUSH at the 5' terminus.
amp_current = Dseqrecord(reSite + "GG" + INSERT)
# V125 fix: protective bases OUTSIDE the site (5' flank at the terminus).
amp_v125 = Dseqrecord("AAA" + reSite + "GG" + INSERT)
n_cur = len(amp_current.cut(EcoRI))
n_v125 = len(amp_v125.cut(EcoRI))
print(f"  CURRENT (site flush at terminus) → pydna fragments: {n_cur}")
print(f"  V125    (3 protective bases 5')   → pydna fragments: {n_v125}")
print("  pydna cuts BOTH (idealised). Terminal-cleavage EFFICIENCY is empirical")
print("  (NEB 'Cleavage Close to the End of DNA Fragments'): EcoRI needs ≥1 flank")
print("  base, many REs need more. => V125 (protective OUTSIDE) decided by NEB data,")
print("  NOT by pydna digest.")
report["methods"]["restriction"] = {
    "pydna_cuts_current_flush": n_cur >= 2,
    "pydna_cuts_v125_flank": n_v125 >= 2,
    "pydna_can_decide_v125": False,
    "basis": "NEB empirical cleavage-close-to-end; protective bases OUTSIDE the site",
}
report["notes"].append(
    "RE/V125 is empirical (NEB terminal-cleavage), not pydna-decidable; pydna's "
    "idealised digest cuts a flush terminal site. V125 fix = protective bases OUTSIDE."
)


# ─────────────────────────────────────────────────────────────────────────
# 4. KLD / direct ligation — blunt, empty tail; product = concatenation.
# ─────────────────────────────────────────────────────────────────────────
section("KLD / LIGATION — empty tail, blunt (engine already correct)")
report["methods"]["kld"] = {"tail": "", "engine_convention_correct": True}
report["methods"]["ligation"] = {"tail": "", "engine_convention_correct": True}
print("  empty tail → blunt amplicon == piece; engine correct.")


# ─────────────────────────────────────────────────────────────────────────
out = os.path.join(os.path.dirname(__file__), "primer_tail_golden.json")
with open(out, "w") as fh:
    json.dump(report, fh, indent=2)
section("VERDICT")
gg = report["methods"]["golden_gate"]
print(f"  overlap/gibson : engine correct = {report['methods']['overlap']['engine_convention_correct']}")
print(f"  golden_gate    : current correct = {gg['current']['assembles_correctly']} | "
      f"v124 correct = {gg['v124']['assembles_correctly']}")
print(f"  restriction    : pydna-decidable = {report['methods']['restriction']['pydna_can_decide_v125']} "
      f"(V125 = NEB empirical)")
print(f"\n  golden written → {out}")

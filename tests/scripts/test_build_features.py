"""
test_build_features.py — Sprint Parser-Unification K1 regression guard.

Locks the contract that scripts/build_features_from_snapgene.py imports
the same `parse_dna_file` as the live import pipeline (pvcs.snapgene_parser),
and that the parser honours DEC-PARSER-COORD-01 — 0-based exclusive end
with `(end - start) % 3 == 0` for CDS regions on real reference data.

If a future refactor reintroduces an inline parser in scripts/ (or shifts
coordinates by ±1 anywhere on the path), this test fails.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "build_features_from_snapgene.py"
PUC19_DNA = REPO_ROOT / "scripts" / "snapgene_dna" / "basic_cloning_vectors" / "pUC19.dna"


def _load_script_module():
    """Load build_features_from_snapgene.py as a module (without running main)."""
    spec = importlib.util.spec_from_file_location("build_features_for_test", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None, "Cannot create spec for build script"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_script_imports_parse_dna_file_from_pvcs():
    """The script must use the production .dna parser (DEC-PARSER-UNIFY-01)."""
    module = _load_script_module()
    from pvcs.snapgene_parser import parse_dna_file as canonical_parser
    assert module.parse_dna_file is canonical_parser, (
        "scripts/build_features_from_snapgene.py must import parse_dna_file "
        "from pvcs.snapgene_parser — single source of truth for .dna parsing "
        "(DEC-PARSER-UNIFY-01)."
    )


def test_script_does_not_define_inline_parsers():
    """Inline parse_dna() / parse_features_xml() must remain removed."""
    module = _load_script_module()
    assert not hasattr(module, "parse_dna"), (
        "scripts/build_features_from_snapgene.py must not redefine `parse_dna` — "
        "use pvcs.snapgene_parser.parse_dna_file (DEC-PARSER-UNIFY-01)."
    )
    assert not hasattr(module, "parse_features_xml"), (
        "scripts/build_features_from_snapgene.py must not redefine "
        "`parse_features_xml` — feature parsing belongs to pvcs.snapgene_parser "
        "(DEC-PARSER-UNIFY-01)."
    )


@pytest.mark.skipif(not PUC19_DNA.exists(), reason="pUC19.dna reference fixture not present")
def test_pUC19_AmpR_lacZalpha_have_codon_aligned_lengths():
    """V50 regression — every CDS-like feature on pUC19 must satisfy
    `(end - start) % 3 == 0` per DEC-PARSER-COORD-01.

    Pre-V50 the inline parser produced lacZα 322 (✗) and AmpR 859 (✗).
    Post-V50 we expect 324 and 861 respectively.
    """
    from pvcs.snapgene_parser import parse_dna_file

    parsed = parse_dna_file(PUC19_DNA)
    assert parsed is not None, "parse_dna_file returned None on pUC19.dna"
    features = parsed.get("features") or []
    by_name = {f.get("name"): f for f in features}

    ampr = by_name.get("AmpR")
    lacz = by_name.get("lacZα") or by_name.get("lacZα")  # bytewise ascii fallback
    if lacz is None:
        # Some encodings expose the alpha differently; pick by name prefix.
        for f in features:
            n = (f.get("name") or "").lower()
            if n.startswith("lacz") and ("α" in n or "alpha" in n):
                lacz = f
                break

    assert ampr is not None, "AmpR not found in pUC19 features"
    assert lacz is not None, "lacZα not found in pUC19 features"

    for label, feat, expected_len in (
        ("AmpR", ampr, 861),
        ("lacZα", lacz, 324),
    ):
        length = feat["end"] - feat["start"]
        assert length % 3 == 0, (
            f"{label} length {length} on pUC19 is not a multiple of 3 — "
            "DEC-PARSER-COORD-01 violation (likely off-by-one in parser)."
        )
        assert length == expected_len, (
            f"{label} length {length} on pUC19 does not match the V50-fix "
            f"baseline ({expected_len}). Coordinate convention may have shifted."
        )

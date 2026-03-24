"""Feature list rendering with color badges, ORF info, and inline editing."""

from __future__ import annotations

import streamlit as st
from pvcs.models import Feature
from pvcs.utils import translate_sequence, reverse_complement
from gui.components.plasmid_map import FEATURE_COLORS, MARKER_KEYWORDS

FEATURE_TYPES = [
    "CDS", "promoter", "terminator", "rep_origin",
    "misc_feature", "regulatory", "gene", "marker",
    "misc_RNA", "protein_bind", "enhancer", "RBS",
]


def _feature_color(feat: Feature) -> str:
    name_lower = feat.name.lower()
    if any(kw in name_lower for kw in MARKER_KEYWORDS):
        return "#31AF31"
    return FEATURE_COLORS.get(feat.type, "#6699CC")


def _get_orf_info(feature: Feature, full_sequence: str) -> dict | None:
    """Get ORF details for a CDS feature."""
    if feature.type != "CDS":
        return None
    feat_seq = full_sequence[feature.start - 1:feature.end]
    if feature.strand == -1:
        feat_seq = reverse_complement(feat_seq)
    if len(feat_seq) < 3:
        return None
    protein = translate_sequence(feat_seq)
    has_start = protein.startswith("M")
    stop_pos = protein.find("*")
    has_stop = stop_pos >= 0
    protein_clean = protein[:stop_pos] if has_stop else protein
    return {
        "protein_length": len(protein_clean),
        "has_start_codon": has_start,
        "has_stop_codon": has_stop,
        "reading_frame": (feature.start - 1) % 3 + 1,
        "protein_preview": protein_clean[:30] + ("..." if len(protein_clean) > 30 else ""),
        "molecular_weight_kda": round(len(protein_clean) * 0.11, 1),
    }


def render_feature_table(features: list[Feature], full_sequence: str = "") -> None:
    """Render feature table with ORF info for CDS features."""
    feats = [f for f in features if f.type != "source"]
    if not feats:
        st.info("No features annotated.")
        return

    html = '<table style="width:100%;border-collapse:collapse;font-size:0.88em">'
    html += '<tr style="background:#f0f2f6;font-weight:600">'
    html += '<th style="padding:6px 8px"></th>'
    for col in ["Type", "Name", "Start", "End", "Strand", "Length", "ORF"]:
        html += f'<th style="padding:6px 8px;text-align:left">{col}</th>'
    html += '</tr>'

    for f in sorted(feats, key=lambda x: x.start):
        color = _feature_color(f)
        strand = "\u2192" if f.strand == 1 else "\u2190"
        length = f.end - f.start + 1

        orf_html = ""
        if f.type == "CDS" and full_sequence:
            orf = _get_orf_info(f, full_sequence)
            if orf:
                start_icon = "\u2705" if orf["has_start_codon"] else "\u26a0"
                stop_icon = "\u2705" if orf["has_stop_codon"] else "\u26a0"
                orf_html = (
                    f'<span style="font-size:0.85em">'
                    f'{orf["protein_length"]} aa '
                    f'(~{orf["molecular_weight_kda"]} kDa) '
                    f'{start_icon}ATG {stop_icon}Stop'
                    f'</span>'
                )

        html += '<tr style="border-bottom:1px solid #eee">'
        html += f'<td style="padding:5px 8px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:{color}"></span></td>'
        html += f'<td style="padding:5px 8px"><code>{f.type}</code></td>'
        html += f'<td style="padding:5px 8px;min-width:120px;word-break:break-word"><strong>{f.name}</strong></td>'
        html += f'<td style="padding:5px 8px">{f.start:,}</td>'
        html += f'<td style="padding:5px 8px">{f.end:,}</td>'
        html += f'<td style="padding:5px 8px">{strand}</td>'
        html += f'<td style="padding:5px 8px">{length:,} bp</td>'
        html += f'<td style="padding:5px 8px">{orf_html}</td>'
        html += '</tr>'

    html += '</table>'
    st.html(html)


def render_editable_feature_table(features: list[Feature], key_prefix: str = "feat") -> bool:
    """Feature table with inline editing of type and name."""
    edited = False

    for i, f in enumerate(features):
        if f.type == "source":
            continue

        c1, c2, c3, c4, c5 = st.columns([2, 3, 1, 1, 1])

        with c1:
            idx = FEATURE_TYPES.index(f.type) if f.type in FEATURE_TYPES else 0
            new_type = st.selectbox("Type", FEATURE_TYPES, index=idx,
                                    key=f"{key_prefix}_t_{i}", label_visibility="collapsed")
            if new_type != f.type:
                f.type = new_type
                edited = True

        with c2:
            new_name = st.text_input("Name", value=f.name,
                                     key=f"{key_prefix}_n_{i}", label_visibility="collapsed")
            if new_name != f.name:
                f.name = new_name
                edited = True

        c3.caption(f"{f.start}..{f.end}")
        c4.caption("\u2192" if f.strand == 1 else ("\u2190" if f.strand == -1 else "\u00b7"))
        c5.caption(f"{f.end - f.start + 1} bp")

    return edited

"""Feature table rendering for Streamlit."""

from __future__ import annotations

import streamlit as st
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pvcs.models import Feature

from components.plasmid_map import FEATURE_COLORS, MARKER_KEYWORDS


def _badge_html(feat_type: str, name: str) -> str:
    """Colored badge for a feature type."""
    name_low = name.lower()
    for kw in MARKER_KEYWORDS:
        if kw in name_low:
            color = "#31AF31"
            break
    else:
        color = FEATURE_COLORS.get(feat_type, "#6699CC")

    return (
        f'<span style="background:{color};color:white;padding:2px 8px;'
        f'border-radius:10px;font-size:0.8em">{feat_type}</span>'
    )


def render_feature_table(features: list[Feature]) -> None:
    """Render an HTML feature table in Streamlit."""
    if not features:
        st.info("No features annotated.")
        return

    rows = []
    for f in features:
        strand = "→" if f.strand == 1 else ("←" if f.strand == -1 else "·")
        length = f.end - f.start + 1
        badge = _badge_html(f.type, f.name)
        rows.append(
            f"<tr>"
            f"<td>{badge}</td>"
            f"<td><strong>{f.name}</strong></td>"
            f"<td>{f.start:,}</td>"
            f"<td>{f.end:,}</td>"
            f"<td>{strand}</td>"
            f"<td>{length:,} bp</td>"
            f"</tr>"
        )

    html = (
        '<table style="width:100%;border-collapse:collapse;font-size:0.9em">'
        "<thead><tr>"
        '<th style="text-align:left;padding:6px;border-bottom:2px solid #ddd">Type</th>'
        '<th style="text-align:left;padding:6px;border-bottom:2px solid #ddd">Name</th>'
        '<th style="text-align:right;padding:6px;border-bottom:2px solid #ddd">Start</th>'
        '<th style="text-align:right;padding:6px;border-bottom:2px solid #ddd">End</th>'
        '<th style="text-align:center;padding:6px;border-bottom:2px solid #ddd">Strand</th>'
        '<th style="text-align:right;padding:6px;border-bottom:2px solid #ddd">Length</th>'
        "</tr></thead><tbody>"
        + "\n".join(rows)
        + "</tbody></table>"
    )

    st.html(html)

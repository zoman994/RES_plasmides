"""Feature list rendering with color badges."""

from __future__ import annotations

import streamlit as st
from pvcs.models import Feature
from gui.components.plasmid_map import FEATURE_COLORS, MARKER_KEYWORDS


def _feature_color(feat: Feature) -> str:
    name_lower = feat.name.lower()
    if any(kw in name_lower for kw in MARKER_KEYWORDS):
        return "#31AF31"
    return FEATURE_COLORS.get(feat.type, "#6699CC")


def render_feature_table(features: list[Feature]) -> None:
    """Render an interactive feature table in Streamlit."""
    if not features:
        st.info("No features annotated.")
        return

    # Filter out source features
    feats = [f for f in features if f.type != "source"]
    if not feats:
        st.info("No features (only 'source' annotation).")
        return

    rows = []
    for f in sorted(feats, key=lambda x: x.start):
        color = _feature_color(f)
        strand = "\u2192" if f.strand == 1 else "\u2190"
        length = f.end - f.start + 1
        rows.append({
            "Color": color,
            "Type": f.type,
            "Name": f.name,
            "Start": f.start,
            "End": f.end,
            "Strand": strand,
            "Length (bp)": length,
        })

    # Build HTML table for better styling
    html = '<table style="width:100%;border-collapse:collapse;font-size:0.9em">'
    html += '<tr style="background:#f0f2f6;font-weight:600">'
    html += '<th style="padding:6px 10px"></th>'
    for col in ["Type", "Name", "Start", "End", "Strand", "Length"]:
        html += f'<th style="padding:6px 10px;text-align:left">{col}</th>'
    html += '</tr>'

    for row in rows:
        html += '<tr style="border-bottom:1px solid #eee">'
        html += f'<td style="padding:4px 10px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:{row["Color"]}"></span></td>'
        html += f'<td style="padding:4px 10px"><code>{row["Type"]}</code></td>'
        html += f'<td style="padding:4px 10px;font-weight:500">{row["Name"]}</td>'
        html += f'<td style="padding:4px 10px">{row["Start"]:,}</td>'
        html += f'<td style="padding:4px 10px">{row["End"]:,}</td>'
        html += f'<td style="padding:4px 10px">{row["Strand"]}</td>'
        html += f'<td style="padding:4px 10px">{row["Length (bp)"]:,} bp</td>'
        html += '</tr>'

    html += '</table>'
    st.html(html)

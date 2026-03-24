"""SVG circular and linear plasmid map renderer.

Generates SVG strings in Python — no JavaScript required.
Renders features as colored arcs on a circular backbone.
"""

from __future__ import annotations

import math
from pvcs.models import Feature

# SnapGene-style feature colors
FEATURE_COLORS: dict[str, str] = {
    "CDS": "#F5A623",
    "gene": "#F5A623",
    "promoter": "#B0B0B0",
    "terminator": "#CC0000",
    "rep_origin": "#FFD700",
    "misc_feature": "#6699CC",
    "regulatory": "#9B59B6",
    "misc_RNA": "#E74C3C",
    "repeat_region": "#95A5A6",
    "protein_bind": "#1ABC9C",
    "RBS": "#E67E22",
    "enhancer": "#27AE60",
    "source": "#BDC3C7",
    "primer_bind": "#3498DB",
    "mRNA": "#F39C12",
}

MARKER_KEYWORDS = {"hygr", "ampr", "kanr", "amds", "pyrg", "hph", "ble", "nat", "hygror", "hygromycin"}

DIFF_COLORS = {
    "added": "#27AE60",
    "removed": "#E74C3C",
    "modified": "#F39C12",
}


def _get_feature_color(feature: Feature, highlight: dict[str, str] | None = None) -> str:
    """Determine color for a feature."""
    if highlight and feature.name in highlight:
        return highlight[feature.name]
    name_lower = feature.name.lower()
    if any(kw in name_lower for kw in MARKER_KEYWORDS):
        return "#31AF31"
    return FEATURE_COLORS.get(feature.type, "#6699CC")


def _bp_to_angle(bp_position: int, total_length: int) -> float:
    """Convert bp position to angle in radians. 0 bp = 12 o'clock (top)."""
    return (bp_position / total_length) * 2 * math.pi - math.pi / 2


def _polar_to_cart(cx: float, cy: float, radius: float, angle: float) -> tuple[float, float]:
    """Convert polar to cartesian coordinates."""
    return cx + radius * math.cos(angle), cy + radius * math.sin(angle)


def _arc_path(cx: float, cy: float, r_inner: float, r_outer: float,
              start_angle: float, end_angle: float) -> str:
    """Generate SVG path for a thick arc (annular sector)."""
    sweep = end_angle - start_angle
    if sweep < 0:
        sweep += 2 * math.pi
    large_arc = 1 if sweep > math.pi else 0

    # Outer arc: start → end
    ox1, oy1 = _polar_to_cart(cx, cy, r_outer, start_angle)
    ox2, oy2 = _polar_to_cart(cx, cy, r_outer, end_angle)
    # Inner arc: end → start (reverse)
    ix1, iy1 = _polar_to_cart(cx, cy, r_inner, end_angle)
    ix2, iy2 = _polar_to_cart(cx, cy, r_inner, start_angle)

    return (
        f"M {ox1:.1f} {oy1:.1f} "
        f"A {r_outer:.1f} {r_outer:.1f} 0 {large_arc} 1 {ox2:.1f} {oy2:.1f} "
        f"L {ix1:.1f} {iy1:.1f} "
        f"A {r_inner:.1f} {r_inner:.1f} 0 {large_arc} 0 {ix2:.1f} {iy2:.1f} "
        f"Z"
    )


def _arrow_head(cx: float, cy: float, radius: float, angle: float,
                strand: int, arc_width: float) -> str:
    """Generate a small directional arrow at the end of a feature arc."""
    if strand == -1:
        angle = angle  # arrow at start for reverse strand
    tip_x, tip_y = _polar_to_cart(cx, cy, radius, angle)
    # Small triangle
    offset = 0.04 * strand
    p1x, p1y = _polar_to_cart(cx, cy, radius - arc_width * 0.6, angle - offset)
    p2x, p2y = _polar_to_cart(cx, cy, radius + arc_width * 0.6, angle - offset)
    return f"M {tip_x:.1f} {tip_y:.1f} L {p1x:.1f} {p1y:.1f} L {p2x:.1f} {p2y:.1f} Z"


def render_circular_map(
    features: list[Feature],
    sequence_length: int,
    construct_name: str = "",
    size: int = 500,
    show_labels: bool = True,
    show_scale: bool = True,
    highlight_features: dict[str, str] | None = None,
) -> str:
    """Return SVG string for a circular plasmid map."""
    cx = size / 2
    cy = size / 2
    radius = size * 0.35
    arc_width = size * 0.024
    label_radius = radius + size * 0.09

    parts: list[str] = []
    parts.append(f'<svg viewBox="0 0 {size} {size}" width="{size}" height="{size}" '
                 f'xmlns="http://www.w3.org/2000/svg" '
                 f'font-family="Arial, Helvetica, sans-serif">')

    # Background
    parts.append(f'<rect width="{size}" height="{size}" fill="#FAFBFC" rx="8"/>')

    # Backbone circle
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{radius}" '
                 f'fill="none" stroke="#999" stroke-width="1.5" opacity="0.6"/>')

    # Scale ticks
    if show_scale and sequence_length > 0:
        tick_interval = 1000
        if sequence_length > 10000:
            tick_interval = 2000
        elif sequence_length < 3000:
            tick_interval = 500

        for bp in range(0, sequence_length, tick_interval):
            angle = _bp_to_angle(bp, sequence_length)
            inner_x, inner_y = _polar_to_cart(cx, cy, radius - 6, angle)
            outer_x, outer_y = _polar_to_cart(cx, cy, radius + 6, angle)
            parts.append(f'<line x1="{inner_x:.1f}" y1="{inner_y:.1f}" '
                         f'x2="{outer_x:.1f}" y2="{outer_y:.1f}" '
                         f'stroke="#ccc" stroke-width="0.8"/>')
            if bp > 0:
                lx, ly = _polar_to_cart(cx, cy, radius + 14, angle)
                kb = bp / 1000
                label_text = f"{kb:.0f}k" if kb == int(kb) else f"{kb:.1f}k"
                parts.append(f'<text x="{lx:.1f}" y="{ly:.1f}" '
                             f'text-anchor="middle" dominant-baseline="middle" '
                             f'font-size="{size * 0.018:.0f}" fill="#aaa">{label_text}</text>')

    # Feature arcs
    used_label_angles: list[float] = []

    for feat in features:
        if feat.type == "source":
            continue
        color = _get_feature_color(feat, highlight_features)
        start_angle = _bp_to_angle(feat.start - 1, sequence_length)
        end_angle = _bp_to_angle(feat.end, sequence_length)

        r_inner = radius - arc_width
        r_outer = radius + arc_width

        path_d = _arc_path(cx, cy, r_inner, r_outer, start_angle, end_angle)
        parts.append(f'<path d="{path_d}" fill="{color}" opacity="0.85" '
                     f'stroke="white" stroke-width="0.5">'
                     f'<title>{feat.type}: {feat.name} ({feat.start}..{feat.end})</title></path>')

        # Direction arrow
        arrow_angle = end_angle if feat.strand == 1 else start_angle
        arrow_d = _arrow_head(cx, cy, radius, arrow_angle, feat.strand, arc_width * 0.8)
        parts.append(f'<path d="{arrow_d}" fill="{color}" opacity="0.95"/>')

        # Labels
        if show_labels and len(feat.name) < 20:
            mid_bp = (feat.start + feat.end) / 2
            mid_angle = _bp_to_angle(mid_bp, sequence_length)

            # Avoid label collisions
            too_close = any(abs(mid_angle - ua) < 0.15 for ua in used_label_angles)
            if too_close:
                label_r = label_radius + size * 0.06
            else:
                label_r = label_radius

            used_label_angles.append(mid_angle)

            lx, ly = _polar_to_cart(cx, cy, label_r, mid_angle)

            # Leader line
            line_start_x, line_start_y = _polar_to_cart(cx, cy, r_outer + 2, mid_angle)
            parts.append(f'<line x1="{line_start_x:.1f}" y1="{line_start_y:.1f}" '
                         f'x2="{lx:.1f}" y2="{ly:.1f}" '
                         f'stroke="{color}" stroke-width="0.7" opacity="0.5"/>')

            anchor = "start" if lx > cx else "end"
            if abs(lx - cx) < size * 0.05:
                anchor = "middle"

            font_size = max(size * 0.02, 8)
            parts.append(f'<text x="{lx:.1f}" y="{ly:.1f}" '
                         f'text-anchor="{anchor}" dominant-baseline="middle" '
                         f'font-size="{font_size:.0f}" fill="#333" font-weight="500">'
                         f'{feat.name}</text>')

    # Center text
    if construct_name:
        parts.append(f'<text x="{cx}" y="{cy - size * 0.02}" text-anchor="middle" '
                     f'dominant-baseline="middle" font-size="{size * 0.04:.0f}" '
                     f'fill="#2c3e50" font-weight="bold">{construct_name}</text>')
    if sequence_length > 0:
        bp_text = f"{sequence_length:,} bp"
        parts.append(f'<text x="{cx}" y="{cy + size * 0.04}" text-anchor="middle" '
                     f'dominant-baseline="middle" font-size="{size * 0.028:.0f}" '
                     f'fill="#7f8c8d">{bp_text}</text>')

    parts.append("</svg>")
    return "\n".join(parts)


def render_mini_map(
    features: list[Feature],
    sequence_length: int,
    size: int = 80,
    highlight_features: dict[str, str] | None = None,
) -> str:
    """Render a small thumbnail circular map (no labels, no scale)."""
    return render_circular_map(
        features, sequence_length,
        size=size,
        show_labels=False,
        show_scale=False,
        highlight_features=highlight_features,
    )


def render_linear_map(
    features: list[Feature],
    sequence_length: int,
    construct_name: str = "",
    width: int = 700,
    height: int = 200,
    show_labels: bool = True,
    highlight_features: dict[str, str] | None = None,
) -> str:
    """Render a linear construct map as horizontal bar with features."""
    ml, mr, mt, mb = 60, 30, 55, 55
    tw = width - ml - mr
    by = mt + 45  # backbone y
    fh = 18  # feature height
    fg = 3   # gap between backbone and features

    parts: list[str] = []
    parts.append(f'<svg viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
                 f'xmlns="http://www.w3.org/2000/svg" font-family="Arial,Helvetica,sans-serif">')
    parts.append(f'<rect width="{width}" height="{height}" fill="#FAFBFC" rx="6"/>')

    # Construct name
    if construct_name:
        parts.append(f'<text x="{ml}" y="20" font-size="14" font-weight="bold" fill="#2c3e50">{construct_name}</text>')
    if sequence_length > 0:
        parts.append(f'<text x="{ml}" y="36" font-size="11" fill="#7f8c8d">{sequence_length:,} bp, linear</text>')

    # Backbone line
    parts.append(f'<line x1="{ml}" y1="{by}" x2="{ml + tw}" y2="{by}" stroke="#888" stroke-width="2"/>')
    # 5' and 3' labels
    parts.append(f'<text x="{ml - 8}" y="{by + 4}" text-anchor="end" font-size="10" fill="#999">5\'</text>')
    parts.append(f'<text x="{ml + tw + 8}" y="{by + 4}" text-anchor="start" font-size="10" fill="#999">3\'</text>')
    # Arrow at 3' end
    ax = ml + tw
    parts.append(f'<polygon points="{ax},{by - 5} {ax + 8},{by} {ax},{by + 5}" fill="#888"/>')

    # Scale ticks
    tick_int = 500 if sequence_length < 5000 else 1000 if sequence_length < 15000 else 2000
    for bp in range(0, sequence_length + 1, tick_int):
        x = ml + (bp / sequence_length) * tw if sequence_length > 0 else ml
        parts.append(f'<line x1="{x:.1f}" y1="{by - 4}" x2="{x:.1f}" y2="{by + 4}" stroke="#ccc" stroke-width="0.8"/>')
        if bp > 0 and bp < sequence_length:
            kb = bp / 1000
            label = f"{kb:.0f}k" if kb == int(kb) else f"{kb:.1f}k"
            parts.append(f'<text x="{x:.1f}" y="{by + 16}" text-anchor="middle" font-size="9" fill="#aaa">{label}</text>')

    # Features as colored rectangles with direction arrows
    for feat in sorted(features, key=lambda f: f.start):
        if feat.type == "source":
            continue
        color = _get_feature_color(feat, highlight_features)
        x = ml + ((feat.start - 1) / sequence_length) * tw
        w = max(((feat.end - feat.start + 1) / sequence_length) * tw, 3)

        if feat.strand == -1:
            y = by + fg  # below
        else:
            y = by - fh - fg  # above

        # Rounded rect
        parts.append(f'<rect x="{x:.1f}" y="{y}" width="{w:.1f}" height="{fh}" '
                     f'rx="3" fill="{color}" opacity="0.85" stroke="white" stroke-width="0.5">'
                     f'<title>{feat.type}: {feat.name} ({feat.start}..{feat.end})</title></rect>')

        # Direction arrow inside
        arrow_size = min(6, w * 0.3)
        ay = y + fh / 2
        if feat.strand == 1 and w > 10:
            ax2 = x + w - 2
            parts.append(f'<polygon points="{ax2 - arrow_size:.1f},{ay - 3} {ax2:.1f},{ay} {ax2 - arrow_size:.1f},{ay + 3}" fill="white" opacity="0.7"/>')
        elif feat.strand == -1 and w > 10:
            ax2 = x + 2
            parts.append(f'<polygon points="{ax2 + arrow_size:.1f},{ay - 3} {ax2:.1f},{ay} {ax2 + arrow_size:.1f},{ay + 3}" fill="white" opacity="0.7"/>')

        # Label
        if show_labels and w > 15:
            lx = x + w / 2
            ly = y - 4 if feat.strand != -1 else y + fh + 12
            font_size = min(10, max(7, w * 0.12))
            parts.append(f'<text x="{lx:.1f}" y="{ly}" text-anchor="middle" '
                         f'font-size="{font_size:.0f}" fill="#333" font-weight="500">{feat.name}</text>')

    parts.append("</svg>")
    return "\n".join(parts)


def render_map_auto(
    features: list[Feature],
    sequence_length: int,
    construct_name: str = "",
    topology: str = "circular",
    size: int = 500,
    **kwargs,
) -> str:
    """Auto-select circular or linear map based on topology."""
    if topology == "linear":
        return render_linear_map(features, sequence_length, construct_name,
                                  width=size, height=int(size * 0.4), **kwargs)
    return render_circular_map(features, sequence_length, construct_name,
                               size=size, **kwargs)


def show_svg(svg_string: str, height: int | None = None):
    """Render SVG in Streamlit reliably.
    
    Uses st.components.v1.html with explicit height to avoid
    the iframe-collapse bug with st.html().
    """
    import streamlit.components.v1 as components
    
    # Auto-detect height from SVG if not provided
    if height is None:
        import re
        m = re.search(r'height="(\d+)"', svg_string)
        height = int(m.group(1)) + 10 if m else 420
    
    html = f'<div style="display:flex;justify-content:center;background:transparent">{svg_string}</div>'
    components.html(html, height=height, scrolling=False)

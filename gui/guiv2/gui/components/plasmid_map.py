"""Circular and mini plasmid map SVG renderer.

Generates SVG strings from Feature lists — no external dependencies,
pure math + string formatting.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pvcs.models import Feature


# ── Color scheme (SnapGene de facto standard) ─────────────────────────

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
    "source": "#D5DBDB",
    "primer_bind": "#3498DB",
    "mRNA": "#F39C12",
}

MARKER_KEYWORDS = {
    "hygr", "ampr", "kanr", "amds", "pyrg", "hph", "ble", "nat",
    "aph(4)-ia", "neor", "zeor", "bsd", "pac",
}


def _feature_color(f: Feature) -> str:
    """Pick color for a feature, checking for selection markers."""
    if f.color:
        return f.color
    name_low = f.name.lower()
    for kw in MARKER_KEYWORDS:
        if kw in name_low:
            return "#31AF31"
    return FEATURE_COLORS.get(f.type, "#6699CC")


# ── Math helpers ──────────────────────────────────────────────────────

def _bp_to_angle(bp: int, total: int) -> float:
    """Convert bp position to angle (radians). 0 bp = top (12 o'clock)."""
    return (bp / total) * 2 * math.pi - math.pi / 2


def _polar_to_xy(cx: float, cy: float, r: float, angle: float) -> tuple[float, float]:
    return cx + r * math.cos(angle), cy + r * math.sin(angle)


def _arc_path(
    cx: float, cy: float,
    r: float,
    start_angle: float,
    end_angle: float,
) -> str:
    """SVG arc path from start_angle to end_angle at radius r."""
    x1, y1 = _polar_to_xy(cx, cy, r, start_angle)
    x2, y2 = _polar_to_xy(cx, cy, r, end_angle)

    # Determine arc sweep
    delta = end_angle - start_angle
    if delta < 0:
        delta += 2 * math.pi
    large = 1 if delta > math.pi else 0

    return f"M {x1:.1f},{y1:.1f} A {r:.1f},{r:.1f} 0 {large} 1 {x2:.1f},{y2:.1f}"


def _arrow_head(
    cx: float, cy: float,
    r: float,
    angle: float,
    direction: int,
    size: float = 6,
) -> str:
    """Small triangular arrowhead at the end of a feature arc."""
    # Tip of arrow at the feature end
    tip_x, tip_y = _polar_to_xy(cx, cy, r, angle)

    # Two base points offset tangentially
    offset = size / r  # angular offset for base
    if direction == 1:
        base_angle = angle - offset
    else:
        base_angle = angle + offset

    bx1, by1 = _polar_to_xy(cx, cy, r - size * 0.6, base_angle)
    bx2, by2 = _polar_to_xy(cx, cy, r + size * 0.6, base_angle)

    return (
        f"M {tip_x:.1f},{tip_y:.1f} "
        f"L {bx1:.1f},{by1:.1f} "
        f"L {bx2:.1f},{by2:.1f} Z"
    )


# ── Label placement ───────────────────────────────────────────────────

def _place_label(
    cx: float, cy: float,
    r_label: float,
    mid_angle: float,
    name: str,
) -> str:
    """Place a label outside the ring with a leader line."""
    # Inner point (on the arc)
    ix, iy = _polar_to_xy(cx, cy, r_label - 18, mid_angle)
    # Outer point (where text starts)
    ox, oy = _polar_to_xy(cx, cy, r_label, mid_angle)

    # Text anchor based on side
    anchor = "start" if ox >= cx else "end"

    # Nudge text slightly away
    tx = ox + (4 if ox >= cx else -4)
    ty = oy + 3

    return (
        f'<line x1="{ix:.1f}" y1="{iy:.1f}" '
        f'x2="{ox:.1f}" y2="{oy:.1f}" '
        f'stroke="#888" stroke-width="0.5"/>\n'
        f'<text x="{tx:.1f}" y="{ty:.1f}" '
        f'font-size="9" fill="#333" '
        f'font-family="Helvetica,Arial,sans-serif" '
        f'text-anchor="{anchor}">{_escape(name)}</text>'
    )


def _escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# ── Filtering ─────────────────────────────────────────────────────────

_SKIP_TYPES = {"source"}


def _visible_features(features: list[Feature]) -> list[Feature]:
    """Filter out features that should not be rendered (e.g. 'source')."""
    return [f for f in features if f.type not in _SKIP_TYPES and f.name]


# ── Public API ────────────────────────────────────────────────────────

def render_circular_map(
    features: list[Feature],
    sequence_length: int,
    construct_name: str = "",
    size: int = 500,
    show_labels: bool = True,
    show_scale: bool = True,
    highlight_features: dict[str, str] | None = None,
) -> str:
    """Render a circular plasmid map as an SVG string.

    Args:
        features: List of Feature dataclasses.
        sequence_length: Total sequence length in bp.
        construct_name: Name shown in center.
        size: SVG width and height in pixels.
        show_labels: Whether to show feature names.
        show_scale: Whether to show bp tick marks.
        highlight_features: Optional dict of feature_name → color override.

    Returns:
        SVG string ready for rendering.
    """
    if sequence_length == 0:
        return f'<svg width="{size}" height="{size}"></svg>'

    cx = size / 2
    cy = size / 2
    margin = 80 if show_labels else 30
    radius = (size - 2 * margin) / 2
    arc_width = 14
    label_r = radius + 24

    highlight = highlight_features or {}
    vis_features = _visible_features(features)

    parts: list[str] = []
    parts.append(
        f'<svg viewBox="0 0 {size} {size}" '
        f'width="{size}" height="{size}" '
        f'xmlns="http://www.w3.org/2000/svg" '
        f'style="font-family:Helvetica,Arial,sans-serif">'
    )

    # ── Background backbone circle ────────────────────────────
    parts.append(
        f'<circle cx="{cx}" cy="{cy}" r="{radius}" '
        f'fill="none" stroke="#CCCCCC" stroke-width="2"/>'
    )

    # ── Scale ticks ───────────────────────────────────────────
    if show_scale:
        tick_interval = _scale_interval(sequence_length)
        for bp in range(0, sequence_length, tick_interval):
            angle = _bp_to_angle(bp, sequence_length)
            ix, iy = _polar_to_xy(cx, cy, radius - 6, angle)
            ox, oy = _polar_to_xy(cx, cy, radius + 6, angle)
            parts.append(
                f'<line x1="{ix:.1f}" y1="{iy:.1f}" '
                f'x2="{ox:.1f}" y2="{oy:.1f}" '
                f'stroke="#DDD" stroke-width="1"/>'
            )
            # Label every other tick
            if bp % (tick_interval * 2) == 0 and bp > 0:
                tx, ty = _polar_to_xy(cx, cy, radius + 14, angle)
                anchor = "middle"
                label = f"{bp // 1000}k" if bp >= 1000 else str(bp)
                parts.append(
                    f'<text x="{tx:.1f}" y="{ty:.1f}" '
                    f'font-size="7" fill="#AAA" text-anchor="{anchor}">'
                    f'{label}</text>'
                )

    # ── Feature arcs ──────────────────────────────────────────
    # Sort by size (largest first → drawn first → smaller on top)
    sorted_feats = sorted(vis_features, key=lambda f: -(f.end - f.start))

    for i, feat in enumerate(sorted_feats):
        color = highlight.get(feat.name, _feature_color(feat))

        start_bp = feat.start - 1  # convert to 0-based
        end_bp = feat.end
        if end_bp <= start_bp:
            end_bp += sequence_length  # wrapping feature

        a1 = _bp_to_angle(start_bp, sequence_length)
        a2 = _bp_to_angle(end_bp, sequence_length)

        # Determine ring radius (stagger slightly to avoid overlap)
        feat_r = radius

        # Draw arc (thick colored stroke)
        arc = _arc_path(cx, cy, feat_r, a1, a2)
        parts.append(
            f'<path d="{arc}" fill="none" '
            f'stroke="{color}" stroke-width="{arc_width}" '
            f'stroke-linecap="round" opacity="0.85">'
            f'<title>{_escape(feat.type)}: {_escape(feat.name)} '
            f'({feat.start}..{feat.end})</title></path>'
        )

        # Arrowhead for directionality
        if feat.strand == 1:
            arrow = _arrow_head(cx, cy, feat_r, a2, 1)
        elif feat.strand == -1:
            arrow = _arrow_head(cx, cy, feat_r, a1, -1)
        else:
            arrow = None

        if arrow:
            parts.append(
                f'<path d="{arrow}" fill="{color}" opacity="0.9"/>'
            )

    # ── Labels ────────────────────────────────────────────────
    if show_labels:
        # Place labels — simple radial placement, skip if too many
        max_labels = 15
        label_feats = sorted_feats[:max_labels]

        # Sort by mid-angle for better distribution
        def _mid_angle(f: Feature) -> float:
            s = f.start - 1
            e = f.end if f.end > f.start else f.end + sequence_length
            mid = (s + e) / 2
            return _bp_to_angle(mid % sequence_length, sequence_length)

        label_feats = sorted(label_feats, key=_mid_angle)

        for feat in label_feats:
            mid = _mid_angle(feat)
            parts.append(_place_label(cx, cy, label_r, mid, feat.name))

    # ── Center text ───────────────────────────────────────────
    if construct_name:
        # Shorten name if too long
        display_name = construct_name if len(construct_name) <= 20 else construct_name[:18] + "…"
        parts.append(
            f'<text x="{cx}" y="{cy - 8}" text-anchor="middle" '
            f'font-size="13" font-weight="bold" fill="#2c3e50">'
            f'{_escape(display_name)}</text>'
        )
    parts.append(
        f'<text x="{cx}" y="{cy + 12}" text-anchor="middle" '
        f'font-size="11" fill="#7f8c8d">'
        f'{sequence_length:,} bp</text>'
    )

    parts.append("</svg>")
    return "\n".join(parts)


def render_mini_map(
    features: list[Feature],
    sequence_length: int,
    size: int = 80,
) -> str:
    """Render a small thumbnail map (no labels, no scale)."""
    return render_circular_map(
        features, sequence_length,
        construct_name="", size=size,
        show_labels=False, show_scale=False,
    )


def _scale_interval(seq_len: int) -> int:
    """Pick a nice tick interval based on sequence length."""
    if seq_len < 2000:
        return 500
    if seq_len < 5000:
        return 1000
    if seq_len < 15000:
        return 2000
    return 5000

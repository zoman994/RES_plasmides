"""Diff visualization component — side-by-side maps with highlighting."""

from __future__ import annotations

from pvcs.models import Change, Feature, Revision, SemanticDiff
from gui.components.plasmid_map import render_circular_map, DIFF_COLORS


def _find_feature_by_label(label: str, features: list[Feature]) -> Feature | None:
    """Find feature matching 'type:name' label."""
    if not label:
        return None
    parts = label.split(":", 1)
    if len(parts) != 2:
        return None
    ftype, fname = parts
    for f in features:
        if f.type == ftype and f.name == fname:
            return f
    return None


def compute_diff_highlights(
    rev_a: Revision,
    rev_b: Revision,
    diff_result: SemanticDiff,
) -> tuple[dict[str, str], dict[str, str]]:
    """Compute feature color overrides for diff maps.

    Returns (highlights_a, highlights_b).
    """
    names_a = {f.name for f in rev_a.features if f.type != "source"}
    names_b = {f.name for f in rev_b.features if f.type != "source"}

    highlights_a: dict[str, str] = {}
    highlights_b: dict[str, str] = {}

    # Features only in A (removed)
    for name in names_a - names_b:
        highlights_a[name] = DIFF_COLORS["removed"]

    # Features only in B (added)
    for name in names_b - names_a:
        highlights_b[name] = DIFF_COLORS["added"]

    # Features with changes
    for change in diff_result.changes:
        if change.affected_feature:
            feat_name = change.affected_feature.split(":", 1)[-1] if ":" in change.affected_feature else change.affected_feature
            if feat_name in names_a:
                highlights_a[feat_name] = DIFF_COLORS["modified"]
            if feat_name in names_b:
                highlights_b[feat_name] = DIFF_COLORS["modified"]

    return highlights_a, highlights_b


def render_diff_maps(
    rev_a: Revision,
    rev_b: Revision,
    diff_result: SemanticDiff,
    size: int = 400,
) -> tuple[str, str]:
    """Return (svg_a, svg_b) with diff highlighting."""
    highlights_a, highlights_b = compute_diff_highlights(rev_a, rev_b, diff_result)

    svg_a = render_circular_map(
        rev_a.features, rev_a.length,
        construct_name=f"v{rev_a.version}",
        size=size,
        highlight_features=highlights_a,
    )
    svg_b = render_circular_map(
        rev_b.features, rev_b.length,
        construct_name=f"v{rev_b.version}",
        size=size,
        highlight_features=highlights_b,
    )
    return svg_a, svg_b


def group_changes_by_feature(changes: list[Change]) -> dict[str, list[Change]]:
    """Group changes by affected_feature. None → 'intergenic'."""
    groups: dict[str, list[Change]] = {}
    for c in changes:
        key = c.affected_feature or "intergenic"
        groups.setdefault(key, []).append(c)
    return groups


def change_type_badge(change_type: str) -> str:
    """Return HTML badge for a change type."""
    colors = {
        "point_mutation": ("#3498DB", "POINT MUTATION"),
        "insertion": ("#27AE60", "INSERTION"),
        "deletion": ("#E74C3C", "DELETION"),
        "replacement": ("#F39C12", "REPLACEMENT"),
        "feature_added": ("#27AE60", "FEATURE ADDED"),
        "feature_removed": ("#E74C3C", "FEATURE REMOVED"),
    }
    color, label = colors.get(change_type, ("#7f8c8d", change_type.upper()))
    return (f'<span style="background:{color};color:white;padding:2px 8px;'
            f'border-radius:10px;font-size:0.8em;font-weight:600">{label}</span>')

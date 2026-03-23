"""Visual diff rendering for Streamlit."""

from __future__ import annotations

import streamlit as st
from collections import defaultdict
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pvcs.models import Change, SemanticDiff

CHANGE_COLORS = {
    "point_mutation": "#3498DB",
    "insertion": "#27AE60",
    "deletion": "#E74C3C",
    "replacement": "#F39C12",
    "feature_added": "#27AE60",
    "feature_removed": "#E74C3C",
}


def _change_badge(change_type: str) -> str:
    color = CHANGE_COLORS.get(change_type, "#95A5A6")
    label = change_type.replace("_", " ")
    return (
        f'<span style="background:{color};color:white;padding:2px 8px;'
        f'border-radius:10px;font-size:0.75em;white-space:nowrap">'
        f'{label}</span>'
    )


def group_changes_by_feature(changes: list[Change]) -> dict[str, list[Change]]:
    """Group changes by affected_feature."""
    groups: dict[str, list[Change]] = defaultdict(list)
    for c in changes:
        key = c.affected_feature or "backbone (no feature)"
        groups[key].append(c)
    return dict(groups)


def render_diff_summary(diff_result: SemanticDiff) -> None:
    """Render a summary bar for the diff result."""
    n = len(diff_result.changes)
    if n == 0:
        st.success("Sequences are identical — no changes detected.")
        return

    st.markdown(f"**{diff_result.summary}**")

    # Count by type
    type_counts: dict[str, int] = {}
    for c in diff_result.changes:
        type_counts[c.type] = type_counts.get(c.type, 0) + 1

    cols = st.columns(len(type_counts))
    for col, (ctype, count) in zip(cols, sorted(type_counts.items(), key=lambda x: -x[1])):
        color = CHANGE_COLORS.get(ctype, "#95A5A6")
        label = ctype.replace("_", " ")
        col.markdown(
            f'<div style="text-align:center;padding:8px;background:{color}15;'
            f'border-left:3px solid {color};border-radius:4px">'
            f'<div style="font-size:1.5em;font-weight:bold;color:{color}">{count}</div>'
            f'<div style="font-size:0.8em;color:#666">{label}</div></div>',
            unsafe_allow_html=True,
        )


def render_change_list(changes: list[Change], max_show: int = 50) -> None:
    """Render grouped change list with expandable sections."""
    groups = group_changes_by_feature(changes)

    for feature_key, feature_changes in sorted(groups.items(), key=lambda x: -len(x[1])):
        n = len(feature_changes)
        with st.expander(f"**{feature_key}** — {n} change{'s' if n != 1 else ''}", expanded=(n <= 5)):
            for c in feature_changes[:max_show]:
                badge = _change_badge(c.type)
                st.markdown(
                    f'{badge} &nbsp; pos {c.position_a:,} &nbsp; '
                    f'<span style="color:#555">{c.description}</span>',
                    unsafe_allow_html=True,
                )
            if n > max_show:
                st.caption(f"… and {n - max_show} more changes")

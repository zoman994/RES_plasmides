"""Diff View — THE MOST IMPORTANT PAGE.

Side-by-side circular maps with diff highlighting + change list.
"""

from __future__ import annotations

import streamlit as st
from pvcs import database as db
from pvcs.config import db_path
from pvcs.diff import semantic_diff
from gui.components.plasmid_map import render_circular_map
from gui.components.plasmid_map import show_svg
from gui.components.diff_view import (
    compute_diff_highlights,
    group_changes_by_feature,
    change_type_badge,
)


def _get_conn():
    root = st.session_state.get("project_root")
    if not root:
        return None
    try:
        return db.get_connection(db_path(root))
    except Exception:
        return None


def render():
    st.title("Semantic Diff")

    conn = _get_conn()
    if not conn:
        st.warning("No project loaded.")
        return

    try:
        constructs = db.list_constructs(conn)
        if not constructs:
            st.info("No constructs to compare.")
            return

        # Build spec list: "construct_name:version" for all constructs x versions
        specs: list[str] = []
        spec_map: dict[str, tuple] = {}  # spec → (construct, revision)
        for c in constructs:
            revs = db.list_revisions(conn, c.id)
            for r in revs:
                spec = f"{c.name}:{r.version}"
                specs.append(spec)
                spec_map[spec] = (c, r)

        if len(specs) < 2:
            st.info("Need at least 2 revisions to compare.")
            return

        # --- Section 1: Selectors ---
        col_a, col_b = st.columns(2)
        with col_a:
            spec_a = st.selectbox("Version A", specs, index=0, key="diff_spec_a")
        with col_b:
            default_b = min(1, len(specs) - 1)
            spec_b = st.selectbox("Version B", specs, index=default_b, key="diff_spec_b")

        if spec_a == spec_b:
            st.info("Select two different revisions to compare.")
            return

        c_a, rev_a = spec_map[spec_a]
        c_b, rev_b = spec_map[spec_b]

        # Compute diff
        with st.spinner("Computing semantic diff..."):
            result = semantic_diff(rev_a, rev_b)

        # --- Summary ---
        n = len(result.changes)
        bp_delta = rev_b.length - rev_a.length
        bp_str = f"+{bp_delta}" if bp_delta >= 0 else str(bp_delta)

        type_counts: dict[str, int] = {}
        for ch in result.changes:
            type_counts[ch.type] = type_counts.get(ch.type, 0) + 1

        # Summary badges
        badges = []
        type_colors = {
            "point_mutation": "#3498DB", "insertion": "#27AE60",
            "deletion": "#E74C3C", "replacement": "#F39C12",
        }
        for ctype, count in type_counts.items():
            color = type_colors.get(ctype, "#7f8c8d")
            label = ctype.replace("_", " ")
            badges.append(
                f'<span style="background:{color};color:white;padding:3px 10px;'
                f'border-radius:12px;font-size:0.85em;margin:0 3px">'
                f'{count} {label}</span>'
            )

        st.html(
            f'<div style="background:#f0f2f6;padding:14px 20px;border-radius:8px;'
            f'text-align:center;margin:8px 0">'
            f'<div style="font-size:1.3em;font-weight:700;margin-bottom:6px">'
            f'{n} change{"s" if n != 1 else ""} &nbsp; | &nbsp; {bp_str} bp &nbsp; | &nbsp; '
            f'{rev_a.length:,} bp \u2192 {rev_b.length:,} bp</div>'
            f'<div>{"".join(badges)}</div></div>'
        )

        # --- Section 2: Side-by-side maps ---
        highlights_a, highlights_b = compute_diff_highlights(rev_a, rev_b, result)

        map_a, map_b = st.columns(2)
        with map_a:
            st.caption(f"**{c_a.name}** v{rev_a.version}")
            svg_a = render_circular_map(
                rev_a.features, rev_a.length,
                construct_name=f"v{rev_a.version}",
                size=400,
                highlight_features=highlights_a,
            )
            show_svg(svg_a, height=420)

        with map_b:
            st.caption(f"**{c_b.name}** v{rev_b.version}")
            svg_b = render_circular_map(
                rev_b.features, rev_b.length,
                construct_name=f"v{rev_b.version}",
                size=400,
                highlight_features=highlights_b,
            )
            show_svg(svg_b, height=420)

        # Legend
        st.html(
            '<div style="text-align:center;margin:8px 0;font-size:0.85em">'
            '<span style="color:#27AE60">\u25cf Added</span> &nbsp;&nbsp; '
            '<span style="color:#E74C3C">\u25cf Removed</span> &nbsp;&nbsp; '
            '<span style="color:#F39C12">\u25cf Modified</span> &nbsp;&nbsp; '
            '<span style="color:#999">\u25cf Unchanged</span>'
            '</div>'
        )

        st.divider()

        # --- Section 3: Change list ---
        if not result.changes:
            st.success("No changes \u2014 sequences are identical.")
            return

        st.subheader("Changes")

        groups = group_changes_by_feature(result.changes)

        for feature_label, changes in groups.items():
            with st.expander(
                f"{feature_label} \u2014 {len(changes)} change{'s' if len(changes) != 1 else ''}",
                expanded=len(groups) <= 5,
            ):
                for ch in changes:
                    badge = change_type_badge(ch.type)
                    st.markdown(
                        f'{badge} &nbsp; **pos {ch.position_a}** &mdash; {ch.description}',
                        unsafe_allow_html=True,
                    )
                    if ch.sequence_a or ch.sequence_b:
                        sa = ch.sequence_a[:40] + ("..." if len(ch.sequence_a) > 40 else "")
                        sb = ch.sequence_b[:40] + ("..." if len(ch.sequence_b) > 40 else "")
                        if sa or sb:
                            st.caption(f"`{sa}` \u2192 `{sb}`")

        # Summary metrics
        st.divider()
        if type_counts:
            metric_cols = st.columns(len(type_counts))
            for i, (ctype, count) in enumerate(type_counts.items()):
                metric_cols[i].metric(ctype.replace("_", " ").title(), count)

    finally:
        conn.close()

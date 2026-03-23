"""Diff View — THE MOST IMPORTANT PAGE.

Side-by-side circular maps with diff highlighting + change list.
"""

from __future__ import annotations

import streamlit as st
from pvcs import database as db
from pvcs.config import db_path
from pvcs.diff import semantic_diff
from gui.components.diff_view import (
    render_diff_maps,
    group_changes_by_feature,
    change_type_badge,
)


def _get_conn():
    root = st.session_state.get("project_root")
    if not root:
        return None
    return db.get_connection(db_path(root))


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

        # --- Section 1: Header with selectors ---
        col_a, col_b = st.columns(2)

        with col_a:
            st.markdown("**Version A**")
            name_a = st.selectbox("Construct A", [c.name for c in constructs], key="diff_ca")
            c_a = next(c for c in constructs if c.name == name_a)
            revs_a = db.list_revisions(conn, c_a.id)
            ver_a = st.selectbox("Version A", [r.version for r in revs_a], key="diff_va")

        with col_b:
            st.markdown("**Version B**")
            name_b = st.selectbox("Construct B", [c.name for c in constructs],
                                  index=min(0, len(constructs) - 1), key="diff_cb")
            c_b = next(c for c in constructs if c.name == name_b)
            revs_b = db.list_revisions(conn, c_b.id)
            ver_b_idx = min(len(revs_b) - 1, 1) if len(revs_b) > 1 else 0
            ver_b = st.selectbox("Version B", [r.version for r in revs_b],
                                 index=ver_b_idx, key="diff_vb")

        if st.button("Compare", type="primary", use_container_width=True):
            st.session_state.diff_run = True

        if not st.session_state.get("diff_run"):
            st.info("Select two revisions and click **Compare**.")
            return

        # Get revisions
        rev_a = db.get_revision(conn, c_a.id, ver_a)
        rev_b = db.get_revision(conn, c_b.id, ver_b)
        if not rev_a or not rev_b:
            st.error("Could not load revisions.")
            return

        # Compute diff
        result = semantic_diff(rev_a, rev_b)

        # Summary badge
        n = len(result.changes)
        bp_delta = rev_b.length - rev_a.length
        bp_str = f"+{bp_delta}" if bp_delta >= 0 else str(bp_delta)

        st.markdown(
            f'<div style="background:#f0f2f6;padding:12px 20px;border-radius:8px;'
            f'text-align:center;margin:10px 0">'
            f'<span style="font-size:1.2em;font-weight:600">'
            f'{n} change{"s" if n != 1 else ""}</span>'
            f' &nbsp; | &nbsp; '
            f'<span style="font-size:1.1em">{bp_str} bp</span>'
            f' &nbsp; | &nbsp; '
            f'{rev_a.length:,} bp \u2192 {rev_b.length:,} bp'
            f'</div>',
            unsafe_allow_html=True,
        )

        # --- Section 2: Side-by-side maps ---
        svg_a, svg_b = render_diff_maps(rev_a, rev_b, result, size=400)

        map_a, map_b = st.columns(2)
        with map_a:
            st.html(f'<div style="text-align:center">{svg_a}</div>')
        with map_b:
            st.html(f'<div style="text-align:center">{svg_b}</div>')

        # Legend
        st.html(
            '<div style="text-align:center;margin:8px 0;font-size:0.85em">'
            '<span style="color:#27AE60">\u25cf Added</span> &nbsp; '
            '<span style="color:#E74C3C">\u25cf Removed</span> &nbsp; '
            '<span style="color:#F39C12">\u25cf Modified</span> &nbsp; '
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
                expanded=True,
            ):
                for i, ch in enumerate(changes, 1):
                    badge = change_type_badge(ch.type)
                    st.markdown(
                        f'{badge} &nbsp; **pos {ch.position_a}** &mdash; {ch.description}',
                        unsafe_allow_html=True,
                    )
                    if ch.sequence_a or ch.sequence_b:
                        seq_a_display = ch.sequence_a[:50] + ("..." if len(ch.sequence_a) > 50 else "")
                        seq_b_display = ch.sequence_b[:50] + ("..." if len(ch.sequence_b) > 50 else "")
                        if seq_a_display or seq_b_display:
                            st.caption(f"`{seq_a_display}` \u2192 `{seq_b_display}`")

        # Summary stats
        st.divider()
        st.subheader("Summary")
        type_counts: dict[str, int] = {}
        for c in result.changes:
            type_counts[c.type] = type_counts.get(c.type, 0) + 1

        cols = st.columns(len(type_counts))
        for i, (ctype, count) in enumerate(type_counts.items()):
            cols[i].metric(ctype.replace("_", " ").title(), count)

    finally:
        conn.close()

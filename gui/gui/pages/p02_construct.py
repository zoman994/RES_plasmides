"""Construct View — circular map + features + history + variants."""

from __future__ import annotations

import streamlit as st
from pvcs import database as db
from pvcs.config import db_path
from pvcs.utils import find_re_sites
from gui.components.plasmid_map import render_circular_map
from gui.components.feature_table import render_feature_table
from gui.components.version_tree import render_version_tree


def _get_conn():
    root = st.session_state.get("project_root")
    if not root:
        return None
    return db.get_connection(db_path(root))


def render():
    st.title("Construct View")

    conn = _get_conn()
    if not conn:
        st.warning("No project loaded.")
        return

    try:
        constructs = db.list_constructs(conn)
        if not constructs:
            st.info("No constructs. Import one first.")
            return

        # Construct selector
        names = [c.name for c in constructs]
        selected = st.selectbox("Select construct", names)
        construct = next(c for c in constructs if c.name == selected)

        revisions = db.list_revisions(conn, construct.id)
        variants = db.get_variants(conn, construct.id)

        # Version selector
        if len(revisions) > 1:
            version = st.selectbox(
                "Version",
                [r.version for r in revisions],
                index=len(revisions) - 1,
            )
            rev = next(r for r in revisions if r.version == version)
        elif revisions:
            rev = revisions[-1]
        else:
            st.warning("No revisions for this construct.")
            return

        # Two-column layout
        left, right = st.columns([3, 2])

        with left:
            # Circular map
            svg = render_circular_map(
                rev.features, rev.length,
                construct_name=construct.name,
                size=500,
            )
            st.html(f'<div style="text-align:center">{svg}</div>')

            # Feature table
            st.subheader("Features")
            render_feature_table(rev.features)

            # RE sites
            with st.expander("Restriction Enzyme Sites"):
                sites = find_re_sites(rev.sequence)
                if sites:
                    # Group by enzyme
                    enzyme_groups: dict[str, list] = {}
                    for s in sites:
                        enzyme_groups.setdefault(s["enzyme"], []).append(s)

                    for enz, hits in sorted(enzyme_groups.items()):
                        positions = ", ".join(f'{h["position"]} ({h["strand"]})' for h in hits)
                        st.markdown(f"**{enz}** ({len(hits)}x): {positions}")
                else:
                    st.info("No common RE sites found.")

        with right:
            # Version history
            st.subheader("History")
            for r in reversed(revisions):
                is_current = r.version == rev.version
                icon = "\u25cf" if is_current else "\u25cb"
                color = "#0066CC" if is_current else "#999"

                st.markdown(
                    f'<div style="border-left:3px solid {color};padding:8px 12px;margin-bottom:8px">'
                    f'<strong>v{r.version}</strong> &mdash; {r.message}<br>'
                    f'<span style="color:#7f8c8d;font-size:0.85em">'
                    f'{r.created_at[:10]} | {r.author} | {r.length:,} bp</span></div>',
                    unsafe_allow_html=True,
                )

            # Variant tree
            if variants or len(revisions) > 1:
                st.subheader("Version Tree")
                dot = render_version_tree(construct, revisions, variants, conn)
                st.graphviz_chart(dot)

            # Construct info
            st.subheader("Info")
            st.markdown(f"**Topology:** {construct.topology}")
            if construct.tags:
                tags_html = " ".join(
                    f'<span style="background:#e8f4fd;color:#2980b9;padding:2px 8px;'
                    f'border-radius:12px;font-size:0.85em">{t}</span>'
                    for t in construct.tags
                )
                st.html(tags_html)
            st.markdown(f"**Checksum:** `{rev.checksum[:16]}...`")

            # Milestones
            milestones = db.list_milestones(conn, rev.id)
            if milestones:
                st.subheader("Milestones")
                for m in milestones:
                    st.markdown(f"\U0001f3f7 **{m.name}** — {m.description}")

    finally:
        conn.close()

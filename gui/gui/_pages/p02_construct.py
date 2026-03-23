"""Construct View — circular map + features + history + variants."""

from __future__ import annotations

import streamlit as st
from pvcs import database as db
from pvcs.config import db_path
from pvcs.utils import find_re_sites
from gui.components.plasmid_map import render_circular_map, render_mini_map
from gui.components.feature_table import render_feature_table
from gui.components.version_tree import render_version_tree


def _get_conn():
    root = st.session_state.get("project_root")
    if not root:
        return None
    try:
        return db.get_connection(db_path(root))
    except Exception:
        return None


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

        # Construct selector with URL param support
        names = [c.name for c in constructs]
        url_construct = st.query_params.get("construct")
        default_idx = 0
        if url_construct and url_construct in names:
            default_idx = names.index(url_construct)

        selected = st.selectbox("Select construct", names, index=default_idx)
        construct = next(c for c in constructs if c.name == selected)

        # Update URL param
        st.query_params["construct"] = selected

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

        # Two-column layout: left 60%, right 40%
        left, right = st.columns([3, 2])

        with left:
            # Full circular map
            svg = render_circular_map(
                rev.features, rev.length,
                construct_name=construct.name,
                size=480,
            )
            st.html(f'<div style="text-align:center">{svg}</div>')

            # Feature table
            st.subheader(f"Features ({len([f for f in rev.features if f.type != 'source'])})")
            render_feature_table(rev.features)

            # RE sites
            with st.expander("Restriction Enzyme Sites"):
                sites = find_re_sites(rev.sequence)
                if sites:
                    enzyme_groups: dict[str, list] = {}
                    for s in sites:
                        enzyme_groups.setdefault(s["enzyme"], []).append(s)

                    for enz, hits in sorted(enzyme_groups.items()):
                        positions = ", ".join(f'{h["position"]} ({h["strand"]})' for h in hits)
                        st.markdown(f"**{enz}** ({len(hits)}x): {positions}")
                else:
                    st.info("No common RE sites found.")

        with right:
            # Version history with mini maps
            st.subheader("History")
            for r in reversed(revisions):
                is_current = r.version == rev.version
                color = "#0066CC" if is_current else "#ddd"

                with st.container(border=is_current):
                    hist_cols = st.columns([1, 3])
                    with hist_cols[0]:
                        if r.features:
                            mini = render_mini_map(r.features, r.length, size=70)
                            st.html(f'<div style="text-align:center">{mini}</div>')

                    with hist_cols[1]:
                        weight = "700" if is_current else "500"
                        st.markdown(
                            f'<div style="font-weight:{weight}">v{r.version}</div>'
                            f'<div style="color:#7f8c8d;font-size:0.85em">'
                            f'{r.created_at[:10]} \u00b7 {r.length:,} bp</div>'
                            f'<div style="font-size:0.9em">{r.message[:40]}</div>',
                            unsafe_allow_html=True,
                        )

            # Variant tree (graphviz)
            if variants or len(revisions) > 1:
                st.subheader("Version Tree")
                dot = render_version_tree(construct, revisions, variants, conn)
                st.graphviz_chart(dot)

            # Construct info
            st.subheader("Info")
            st.markdown(f"**Topology:** {construct.topology}")
            st.markdown(f"**Length:** {rev.length:,} bp")
            if construct.tags:
                tags_html = " ".join(
                    f'<span style="background:#e8f4fd;color:#2980b9;padding:2px 8px;'
                    f'border-radius:12px;font-size:0.85em;margin-right:4px">{t}</span>'
                    for t in construct.tags
                )
                st.html(tags_html)
            st.caption(f"Checksum: {rev.checksum[:16]}...")

    finally:
        conn.close()

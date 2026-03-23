"""Dashboard — Project overview, construct grid with mini maps."""

from __future__ import annotations

import streamlit as st
from pvcs import database as db
from pvcs.config import db_path
from gui.components.plasmid_map import render_mini_map


def _get_conn():
    root = st.session_state.get("project_root")
    if not root:
        return None
    return db.get_connection(db_path(root))


def render():
    st.title("Dashboard")

    conn = _get_conn()
    if not conn:
        st.warning("No project loaded. Go to **Import** to initialize a project.")
        return

    try:
        constructs = db.list_constructs(conn)

        # Stats bar
        from pvcs.strains import list_strains
        from pvcs.parts import list_parts
        from pvcs.primers import list_primers

        root = st.session_state.project_root
        n_strains = len(list_strains(root))
        n_parts = len(list_parts(project_root=root))
        n_primers = len(list_primers(root))

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Constructs", len(constructs))
        c2.metric("Strains", n_strains)
        c3.metric("Parts", n_parts)
        c4.metric("Primers", n_primers)

        st.divider()

        if not constructs:
            st.info("No constructs yet. Import a GenBank file to get started.")
            return

        # Construct grid (3 columns)
        cols = st.columns(3)
        for i, construct in enumerate(constructs):
            col = cols[i % 3]
            rev = db.get_latest_revision(conn, construct.id)

            with col:
                with st.container(border=True):
                    if rev and rev.features:
                        svg = render_mini_map(rev.features, rev.length, size=150)
                        st.html(f'<div style="text-align:center">{svg}</div>')

                    st.markdown(f"**{construct.name}**")
                    if rev:
                        st.caption(
                            f"{rev.length:,} bp | {construct.topology} | "
                            f"v{rev.version} | {len(rev.features)} features"
                        )
                        st.caption(f"{rev.created_at[:10]} — {rev.message[:50]}")
                    else:
                        st.caption("No revisions")

        # Recent activity
        st.divider()
        st.subheader("Recent Activity")

        all_revisions = []
        for c in constructs:
            for r in db.list_revisions(conn, c.id):
                all_revisions.append((c.name, r))

        all_revisions.sort(key=lambda x: x[1].created_at, reverse=True)

        for name, rev in all_revisions[:10]:
            st.markdown(
                f"**{name}** v{rev.version} — {rev.message} "
                f"<span style='color:#7f8c8d'>({rev.created_at[:10]}, {rev.author})</span>",
                unsafe_allow_html=True,
            )

    finally:
        conn.close()

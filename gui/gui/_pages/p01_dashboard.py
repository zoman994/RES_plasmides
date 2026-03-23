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
    try:
        return db.get_connection(db_path(root))
    except Exception:
        return None


def render():
    st.title("Dashboard")

    conn = _get_conn()
    if not conn:
        st.warning("No project loaded. Go to **Import** to initialize a project.")
        return

    try:
        constructs = db.list_constructs(conn)
        root = st.session_state.project_root

        # Stats bar
        n_strains = 0
        n_parts = 0
        n_primers = 0
        try:
            from pvcs.strains import list_strains
            n_strains = len(list_strains(project_root=root))
        except Exception:
            pass
        try:
            n_parts = len(db.list_parts(conn))
        except Exception:
            pass
        try:
            n_primers = len(db.list_primers(conn))
        except Exception:
            pass

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
        for row_start in range(0, len(constructs), 3):
            cols = st.columns(3)
            for j in range(3):
                idx = row_start + j
                if idx >= len(constructs):
                    break
                construct = constructs[idx]
                rev = db.get_latest_revision(conn, construct.id)

                with cols[j]:
                    with st.container(border=True):
                        if rev and rev.features:
                            svg = render_mini_map(rev.features, rev.length, size=120)
                            st.html(f'<div style="text-align:center;padding:4px 0">{svg}</div>')

                        st.markdown(f"**{construct.name}**")
                        if rev:
                            feat_count = len([f for f in rev.features if f.type != "source"])
                            st.caption(
                                f"{rev.length:,} bp \u00b7 {construct.topology} \u00b7 "
                                f"v{rev.version} \u00b7 {feat_count} features"
                            )
                            if rev.message:
                                st.caption(f"{rev.created_at[:10]} \u2014 {rev.message[:50]}")
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
                f"\u00b7 **{name}** v{rev.version} \u2014 {rev.message} "
                f"*({rev.created_at[:10]})*"
            )

    finally:
        conn.close()

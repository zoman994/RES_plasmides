"""Dashboard — project overview with construct cards."""

import streamlit as st
from pathlib import Path

from pvcs import database as db
from pvcs.config import db_path
from components.plasmid_map import render_mini_map


root = st.session_state.get("project_root", Path.cwd())

if not (root / ".pvcs").exists():
    st.title("🧬 PlasmidVCS")
    st.info("No project initialized. Run `pvcs init \"Project Name\"` in your project directory, then reload.")
    st.stop()

conn = db.get_connection(db_path(root))
project = db.get_project(conn)
constructs = db.list_constructs(conn)

st.title(f"🧬 {project.name}" if project else "🧬 PlasmidVCS")

# ── Stats row ──────────────────────────────────────────────────────
c1, c2, c3, c4 = st.columns(4)
c1.metric("Constructs", len(constructs))

from pvcs import strains as strain_mod
try:
    all_strains = strain_mod.list_strains(project_root=root)
    c2.metric("Strains", len(all_strains))
except Exception:
    c2.metric("Strains", "—")

from pvcs import parts as parts_mod
try:
    all_parts = parts_mod.list_parts(project_root=root)
    c3.metric("Parts", len(all_parts))
except Exception:
    c3.metric("Parts", "—")

from pvcs import primers as primer_mod
try:
    all_primers = primer_mod.list_primers(project_root=root)
    c4.metric("Primers", len(all_primers))
except Exception:
    c4.metric("Primers", "—")

st.divider()

# ── Construct grid ─────────────────────────────────────────────────
if not constructs:
    st.info("No constructs yet. Go to **Import** to add GenBank files.")
else:
    cols_per_row = 3
    for i in range(0, len(constructs), cols_per_row):
        cols = st.columns(cols_per_row)
        for j, col in enumerate(cols):
            idx = i + j
            if idx >= len(constructs):
                break
            c = constructs[idx]
            rev = db.get_latest_revision(conn, c.id)

            with col:
                with st.container(border=True):
                    # Mini map
                    if rev and rev.features:
                        svg = render_mini_map(rev.features, rev.length, size=120)
                        st.html(f'<div style="text-align:center;padding:8px 0">{svg}</div>')

                    st.markdown(f"**{c.name}**")

                    if rev:
                        st.caption(
                            f"{rev.length:,} bp · {len(rev.features)} features · "
                            f"v{rev.version}"
                        )
                        if rev.message:
                            st.caption(f"_{rev.message[:50]}_")
                    else:
                        st.caption("No revisions")

                    # Link to construct page
                    if st.button("View →", key=f"view_{c.id}", use_container_width=True):
                        st.query_params["construct"] = c.name
                        st.switch_page("pages/02_construct.py")

conn.close()

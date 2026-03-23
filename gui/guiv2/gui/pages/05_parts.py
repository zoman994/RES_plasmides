"""Parts Library — browse and search genetic parts."""

import streamlit as st
from pathlib import Path
from pvcs import database as db
from pvcs.config import db_path
from components.plasmid_map import FEATURE_COLORS

root = st.session_state.get("project_root", Path.cwd())
st.title("📦 Part Library")

if not (root / ".pvcs").exists():
    st.warning("No project initialized.")
    st.stop()

conn = db.get_connection(db_path(root))
all_parts = db.list_parts(conn)

if not all_parts:
    st.info("No parts in library. Use `pvcs part add` to add genetic parts.")
    conn.close()
    st.stop()

# ── Filter ─────────────────────────────────────────────────────────
types = sorted(set(p.type for p in all_parts))
selected_type = st.selectbox("Filter by type", ["All"] + types)

query = st.text_input("Search by name")

filtered = all_parts
if selected_type != "All":
    filtered = [p for p in filtered if p.type == selected_type]
if query:
    q = query.lower()
    filtered = [p for p in filtered if q in p.name.lower()]

st.caption(f"Showing {len(filtered)} of {len(all_parts)} parts")

# ── Card grid ──────────────────────────────────────────────────────
cols_per_row = 4
for i in range(0, len(filtered), cols_per_row):
    cols = st.columns(cols_per_row)
    for j, col in enumerate(cols):
        idx = i + j
        if idx >= len(filtered):
            break
        p = filtered[idx]
        color = FEATURE_COLORS.get(p.type, "#6699CC")
        with col:
            with st.container(border=True):
                st.html(
                    f'<span style="background:{color};color:white;padding:2px 8px;'
                    f'border-radius:10px;font-size:0.75em">{p.type}</span>'
                )
                st.markdown(f"**{p.name}**")
                st.caption(f"{len(p.sequence):,} bp" if p.sequence else "—")
                if p.organism:
                    st.caption(f"_{p.organism}_")

conn.close()

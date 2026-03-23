"""Strains — lineage DAG and registry."""

import streamlit as st
from pathlib import Path
from pvcs import strains as strain_mod

root = st.session_state.get("project_root", Path.cwd())
st.title("🧫 Strain Registry")

try:
    all_strains = strain_mod.list_strains(project_root=root)
except Exception:
    all_strains = []

if not all_strains:
    st.info("No strains registered. Use `pvcs strain add` to register strains.")
    st.stop()

# ── Graphviz lineage ───────────────────────────────────────────────
lines = [
    'digraph {',
    '  rankdir=LR;',
    '  node [shape=box, style="rounded,filled", fillcolor="#E8F5E9", '
    'fontname="Helvetica", fontsize=10];',
]
for s in all_strains:
    label = f"{s.id}\\n{s.name[:20]}"
    if s.method:
        label += f"\\n({s.method})"
    lines.append(f'  "{s.id}" [label="{label}"];')
    if s.parent_id:
        lines.append(f'  "{s.parent_id}" -> "{s.id}";')
lines.append("}")
st.graphviz_chart("\n".join(lines))

# ── Strain details table ──────────────────────────────────────────
st.subheader("All Strains")
for s in all_strains:
    with st.container(border=True):
        c1, c2, c3 = st.columns([1, 2, 2])
        c1.markdown(f"**{s.id}**")
        c2.caption(f"{s.name} · {s.species}")
        c3.caption(f"Parent: {s.parent_id or '—'} · Method: {s.method or '—'}")
        if s.notes:
            st.caption(s.notes)

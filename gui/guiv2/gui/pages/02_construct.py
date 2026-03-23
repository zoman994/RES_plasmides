"""Construct view — plasmid map + features + version history."""

import streamlit as st
from pathlib import Path

from pvcs import database as db
from pvcs.config import db_path
from pvcs.utils import find_re_sites
from components.plasmid_map import render_circular_map
from components.feature_table import render_feature_table
from components.version_tree import render_version_dot


root = st.session_state.get("project_root", Path.cwd())

if not (root / ".pvcs").exists():
    st.warning("No project initialized.")
    st.stop()

conn = db.get_connection(db_path(root))
constructs = db.list_constructs(conn)

if not constructs:
    st.info("No constructs. Import some first.")
    conn.close()
    st.stop()

# ── Construct selector ─────────────────────────────────────────────
names = [c.name for c in constructs]
preselect = st.query_params.get("construct", names[0])
if preselect not in names:
    preselect = names[0]

selected_name = st.selectbox("Construct", names, index=names.index(preselect))
construct = next(c for c in constructs if c.name == selected_name)

revisions = db.list_revisions(conn, construct.id)
variants = db.get_variants(conn, construct.id)
latest = revisions[-1] if revisions else None

if not latest:
    st.warning("No revisions for this construct.")
    conn.close()
    st.stop()

# ── Title ──────────────────────────────────────────────────────────
topo_badge = "🔵" if construct.topology == "circular" else "📏"
st.title(f"{topo_badge} {construct.name}")
st.caption(f"{latest.length:,} bp · {len(latest.features)} features · v{latest.version} · {latest.created_at[:10]}")

if construct.tags:
    tag_html = " ".join(
        f'<span style="background:#E8F4FD;color:#2980B9;padding:2px 8px;'
        f'border-radius:12px;font-size:0.8em">{t}</span>'
        for t in construct.tags
    )
    st.html(tag_html)

# ── Two columns: map + history ─────────────────────────────────────
col_map, col_history = st.columns([3, 2])

with col_map:
    st.subheader("Plasmid Map")
    svg = render_circular_map(
        latest.features,
        latest.length,
        construct.name,
        size=480,
    )
    st.html(f'<div style="text-align:center">{svg}</div>')

    st.subheader("Features")
    render_feature_table(latest.features)

    # RE sites
    with st.expander("Restriction Sites"):
        sites = find_re_sites(latest.sequence)
        if sites:
            for s in sites[:30]:
                st.text(f"  {s['enzyme']:8s}  pos {s['position']:>6,}  ({s['strand']})")
            if len(sites) > 30:
                st.caption(f"… {len(sites) - 30} more sites")
        else:
            st.caption("No common RE sites found")


with col_history:
    st.subheader("Version History")

    for i, rev in enumerate(reversed(revisions)):
        with st.container(border=True):
            c1, c2 = st.columns([1, 4])
            with c1:
                mini = render_circular_map(
                    rev.features, rev.length,
                    size=70, show_labels=False, show_scale=False,
                )
                st.html(mini)
            with c2:
                st.markdown(f"**v{rev.version}** — {rev.created_at[:10]}")
                if rev.message:
                    st.caption(rev.message)
                st.caption(f"{rev.length:,} bp · {len(rev.features)} features")
                if rev.author:
                    st.caption(f"by {rev.author}")

    # Variant tree
    if len(revisions) > 1 or variants:
        st.subheader("Version Tree")
        dot = render_version_dot(construct.name, revisions, variants)
        st.graphviz_chart(dot)

    # Variants
    if variants:
        st.subheader("Variants")
        for v in variants:
            st.markdown(f"- **{v.name}** — {v.description}")

conn.close()

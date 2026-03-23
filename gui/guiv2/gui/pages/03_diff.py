"""Diff view — visual comparison between two construct versions."""

import streamlit as st
from pathlib import Path

from pvcs import database as db
from pvcs.config import db_path
from pvcs.diff import semantic_diff
from components.plasmid_map import render_circular_map
from components.diff_view import render_diff_summary, render_change_list, group_changes_by_feature


root = st.session_state.get("project_root", Path.cwd())

if not (root / ".pvcs").exists():
    st.warning("No project initialized.")
    st.stop()

conn = db.get_connection(db_path(root))
constructs = db.list_constructs(conn)

if len(constructs) < 1:
    st.info("Need at least one construct with multiple versions to compare.")
    conn.close()
    st.stop()

st.title("🔬 Semantic Diff")

# ── Build spec list: "construct_name:version" for all revisions ────
specs_a = []
specs_b = []
spec_to_rev = {}

for c in constructs:
    revs = db.list_revisions(conn, c.id)
    for r in revs:
        spec = f"{c.name}:{r.version}"
        specs_a.append(spec)
        specs_b.append(spec)
        spec_to_rev[spec] = r

if len(specs_a) < 2:
    st.info("Need at least two revisions to compare.")
    conn.close()
    st.stop()

# ── Selectors ──────────────────────────────────────────────────────
col_a, col_b = st.columns(2)
with col_a:
    spec_a = st.selectbox("Version A (original)", specs_a, index=0)
with col_b:
    default_b = min(1, len(specs_b) - 1)
    spec_b = st.selectbox("Version B (modified)", specs_b, index=default_b)

if spec_a == spec_b:
    st.warning("Select two different versions to compare.")
    conn.close()
    st.stop()

# ── Run diff ───────────────────────────────────────────────────────
rev_a = spec_to_rev[spec_a]
rev_b = spec_to_rev[spec_b]

with st.spinner("Computing semantic diff..."):
    result = semantic_diff(rev_a, rev_b)

# ── Summary bar ────────────────────────────────────────────────────
render_diff_summary(result)

st.divider()

# ── Side-by-side maps ──────────────────────────────────────────────
st.subheader("Map Comparison")

# Determine which features changed
features_a_names = {f.name for f in rev_a.features}
features_b_names = {f.name for f in rev_b.features}

# Features with changes (from diff result)
changed_features = set()
for c in result.changes:
    if c.affected_feature:
        # affected_feature is "type:name" format
        parts = c.affected_feature.split(":", 1)
        if len(parts) == 2:
            changed_features.add(parts[1])

added = features_b_names - features_a_names
removed = features_a_names - features_b_names

# Color overrides for map A
highlight_a = {}
for name in removed:
    highlight_a[name] = "#E74C3C"  # red for removed
for name in changed_features:
    if name not in removed:
        highlight_a[name] = "#F39C12"  # amber for modified

# Color overrides for map B
highlight_b = {}
for name in added:
    highlight_b[name] = "#27AE60"  # green for added
for name in changed_features:
    if name not in added:
        highlight_b[name] = "#F39C12"  # amber for modified

col_map_a, col_map_b = st.columns(2)

with col_map_a:
    name_a = spec_a.split(":")[0]
    st.caption(f"**{spec_a}** ({rev_a.length:,} bp)")
    svg_a = render_circular_map(
        rev_a.features, rev_a.length, name_a,
        size=380, highlight_features=highlight_a,
    )
    st.html(f'<div style="text-align:center">{svg_a}</div>')

with col_map_b:
    name_b = spec_b.split(":")[0]
    st.caption(f"**{spec_b}** ({rev_b.length:,} bp)")
    svg_b = render_circular_map(
        rev_b.features, rev_b.length, name_b,
        size=380, highlight_features=highlight_b,
    )
    st.html(f'<div style="text-align:center">{svg_b}</div>')

# Legend
st.html(
    '<div style="text-align:center;padding:8px;font-size:0.85em">'
    '<span style="color:#E74C3C">● Removed</span> &nbsp;&nbsp; '
    '<span style="color:#27AE60">● Added</span> &nbsp;&nbsp; '
    '<span style="color:#F39C12">● Modified</span> &nbsp;&nbsp; '
    '<span style="color:#888">● Unchanged</span>'
    '</div>'
)

st.divider()

# ── Change list ────────────────────────────────────────────────────
st.subheader(f"Changes ({len(result.changes)})")

if result.changes:
    render_change_list(result.changes)
else:
    st.success("No changes detected.")

conn.close()

"""Parts Library — browse and search reusable genetic elements."""

from __future__ import annotations

import streamlit as st
from pvcs.parts import list_parts, find_part_usage
from gui.components.plasmid_map import FEATURE_COLORS


def render():
    st.title("Part Library")

    root = st.session_state.get("project_root")
    if not root:
        st.warning("No project loaded.")
        return

    all_parts = list_parts(project_root=root)

    if not all_parts:
        st.info("No parts in library. Add parts via the CLI or Import page.")
        return

    # Filters
    c1, c2 = st.columns([1, 3])
    types = sorted(set(p.type for p in all_parts))
    with c1:
        filter_type = st.selectbox("Filter by type", ["All"] + types)
    with c2:
        search_q = st.text_input("Search", placeholder="Search by name...")

    filtered = all_parts
    if filter_type != "All":
        filtered = [p for p in filtered if p.type == filter_type]
    if search_q:
        q = search_q.lower()
        filtered = [p for p in filtered if q in p.name.lower() or q in p.description.lower()]

    st.caption(f"Showing {len(filtered)} of {len(all_parts)} parts")

    # Part cards (3 columns)
    cols = st.columns(3)
    for i, part in enumerate(filtered):
        col = cols[i % 3]
        color = FEATURE_COLORS.get(part.type, "#6699CC")

        with col:
            with st.container(border=True):
                st.markdown(
                    f'<span style="background:{color};color:white;padding:2px 8px;'
                    f'border-radius:10px;font-size:0.8em">{part.type}</span> '
                    f'**{part.name}**',
                    unsafe_allow_html=True,
                )
                st.caption(f"{len(part.sequence):,} bp | {part.organism or '—'}")
                if part.description:
                    st.caption(part.description[:80])

                # Usage
                usage = find_part_usage(part.name, project_root=root)
                if usage:
                    st.caption(f"Used in: {len(usage)} construct(s)")
                    for u in usage[:3]:
                        st.caption(f"  \u2022 {u['construct_name']} v{u['version']}")

                # Sequence preview
                with st.expander("Sequence"):
                    seq = part.sequence
                    if len(seq) > 200:
                        st.code(seq[:100] + "..." + seq[-100:], language=None)
                    else:
                        st.code(seq, language=None)

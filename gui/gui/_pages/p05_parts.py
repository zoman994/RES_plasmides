"""Parts Library — browse, search, and add reusable genetic elements."""

from __future__ import annotations

import tempfile
from pathlib import Path

import streamlit as st
from pvcs.parts import list_parts, find_part_usage, add_part, add_part_from_sequence
from gui.components.plasmid_map import FEATURE_COLORS

PART_TYPES = ["promoter", "terminator", "CDS", "marker", "rep_origin", "regulatory", "misc_feature", "other"]


def render():
    st.title("Part Library")

    root = st.session_state.get("project_root")
    if not root:
        st.warning("No project loaded.")
        return

    tab1, tab2 = st.tabs(["Library", "Add Part"])

    # ── Tab 1: Browse ──
    with tab1:
        all_parts = list_parts(project_root=root)

        if not all_parts:
            st.info("No parts in library yet. Use the **Add Part** tab to add parts.")
        else:
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

            for row_start in range(0, len(filtered), 3):
                cols = st.columns(3)
                for j in range(3):
                    idx = row_start + j
                    if idx >= len(filtered):
                        break
                    part = filtered[idx]
                    color = FEATURE_COLORS.get(part.type, "#6699CC")

                    with cols[j]:
                        with st.container(border=True):
                            st.markdown(
                                f'<span style="background:{color};color:white;padding:2px 8px;'
                                f'border-radius:10px;font-size:0.8em">{part.type}</span> '
                                f'**{part.name}**',
                                unsafe_allow_html=True,
                            )
                            st.caption(f"{len(part.sequence):,} bp | {part.organism or '\u2014'}")
                            if part.description:
                                st.caption(part.description[:80])

                            usage = find_part_usage(part.name, project_root=root)
                            if usage:
                                st.caption(f"Used in: {len(usage)} construct(s)")

                            with st.expander("Sequence"):
                                seq = part.sequence
                                if len(seq) > 200:
                                    st.code(seq[:100] + "..." + seq[-100:], language=None)
                                else:
                                    st.code(seq, language=None)

    # ── Tab 2: Add Part ──
    with tab2:
        st.subheader("Add New Part")

        add_method = st.radio(
            "Add from",
            ["GenBank file", "Paste sequence"],
            horizontal=True,
        )

        if add_method == "GenBank file":
            with st.form("add_part_file"):
                uploaded = st.file_uploader("GenBank file", type=["gb", "gbk", "genbank"])
                c1, c2 = st.columns(2)
                name = c1.text_input("Part name", placeholder="PglaA")
                part_type = c2.selectbox("Type", PART_TYPES)
                c3, c4 = st.columns(2)
                organism = c3.text_input("Organism", placeholder="Aspergillus niger")
                description = c4.text_input("Description", placeholder="Glucoamylase promoter")

                if st.form_submit_button("Add Part", type="primary"):
                    if not uploaded or not name:
                        st.error("File and name are required.")
                    else:
                        tmp = Path(tempfile.mktemp(suffix=".gb"))
                        tmp.write_bytes(uploaded.getvalue())
                        try:
                            p = add_part(
                                tmp, name, part_type,
                                organism=organism,
                                description=description,
                                project_root=root,
                            )
                            st.success(f"Added **{p.name}** ({p.type}, {len(p.sequence):,} bp)")
                            st.rerun()
                        except Exception as e:
                            st.error(f"Failed: {e}")
                        finally:
                            tmp.unlink(missing_ok=True)

        else:  # Paste sequence
            with st.form("add_part_seq"):
                c1, c2 = st.columns(2)
                name = c1.text_input("Part name", placeholder="TtrpC")
                part_type = c2.selectbox("Type", PART_TYPES)
                sequence = st.text_area(
                    "DNA sequence",
                    placeholder="ATGCGATCG...",
                    height=120,
                )
                c3, c4 = st.columns(2)
                organism = c3.text_input("Organism", placeholder="Aspergillus nidulans")
                description = c4.text_input("Description", placeholder="trpC terminator")

                if st.form_submit_button("Add Part", type="primary"):
                    if not name or not sequence:
                        st.error("Name and sequence are required.")
                    else:
                        # Clean sequence
                        clean_seq = "".join(c for c in sequence.upper() if c in "ATCGN")
                        if not clean_seq:
                            st.error("No valid DNA characters found.")
                        else:
                            try:
                                p = add_part_from_sequence(
                                    name, part_type, clean_seq,
                                    organism=organism,
                                    description=description,
                                    project_root=root,
                                )
                                st.success(f"Added **{p.name}** ({p.type}, {len(p.sequence):,} bp)")
                                st.rerun()
                            except Exception as e:
                                st.error(f"Failed: {e}")

"""Strains — lineage DAG + strain registry."""

from __future__ import annotations

import streamlit as st
from pvcs.strains import list_strains, get_strain_tree, add_strain
from gui.components.version_tree import render_strain_tree_dot


def render():
    st.title("Strain Registry")

    root = st.session_state.get("project_root")
    if not root:
        st.warning("No project loaded.")
        return

    strains = list_strains(root)

    if not strains:
        st.info("No strains registered.")
    else:
        # Lineage tree
        st.subheader("Lineage")
        # Find root strains (no parent)
        root_strains = [s for s in strains if not s.parent_id or s.parent_id not in {x.id for x in strains}]

        for rs in root_strains:
            try:
                tree = get_strain_tree(rs.id, root)
                dot = render_strain_tree_dot(tree)
                st.graphviz_chart(dot)
            except Exception as e:
                st.error(f"Error rendering tree for {rs.id}: {e}")

        # Strain table
        st.subheader("All Strains")
        for s in strains:
            with st.expander(f"{s.id} — {s.name}"):
                c1, c2 = st.columns(2)
                c1.markdown(f"**Species:** {s.species or '—'}")
                c1.markdown(f"**Parent:** {s.parent_id or '—'}")
                c1.markdown(f"**Verified:** {'Yes' if s.verified else 'No'}")
                c2.markdown(f"**Storage:** {s.storage_location or '—'}")
                c2.markdown(f"**Method:** {s.method or '—'}")
                if s.construct_id:
                    c2.markdown(f"**Construct:** {s.construct_id}")
                if s.notes:
                    st.markdown(f"**Notes:** {s.notes}")

    # Add strain form
    st.divider()
    st.subheader("Register New Strain")

    with st.form("add_strain"):
        c1, c2 = st.columns(2)
        sid = c1.text_input("Strain ID", placeholder="AN-005")
        sname = c2.text_input("Full name", placeholder="A. niger CBS 513.88 ...")
        species = c1.text_input("Species", value="Aspergillus niger")
        parent = c2.text_input("Parent strain ID", placeholder="AN-004")
        method = c1.text_input("Transformation method", placeholder="PEG-protoplast")
        storage = c2.text_input("Storage location", placeholder="Cryo box 3, A5")
        notes = st.text_area("Notes", placeholder="...")

        if st.form_submit_button("Register Strain"):
            if sid and sname:
                add_strain(
                    sid, sname, species=species,
                    parent_id=parent or None,
                    method=method, storage_location=storage,
                    notes=notes, project_root=root,
                )
                st.success(f"Registered strain {sid}")
                st.rerun()
            else:
                st.error("Strain ID and name are required.")

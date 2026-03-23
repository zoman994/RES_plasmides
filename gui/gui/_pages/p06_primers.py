"""Primers — registry, reuse detection."""

from __future__ import annotations

import streamlit as st
from pvcs.primers import list_primers, check_primer_reuse, add_primer
from pvcs import database as db
from pvcs.config import db_path


def render():
    st.title("Primer Registry")

    root = st.session_state.get("project_root")
    if not root:
        st.warning("No project loaded.")
        return

    primers = list_primers(root)

    tab1, tab2, tab3 = st.tabs(["All Primers", "Check Reuse", "Add Primer"])

    with tab1:
        if not primers:
            st.info("No primers registered.")
        else:
            # Filter
            directions = sorted(set(p.direction for p in primers if p.direction))
            filter_dir = st.selectbox("Filter by direction", ["All"] + directions)

            filtered = primers
            if filter_dir != "All":
                filtered = [p for p in filtered if p.direction == filter_dir]

            # Table
            for p in filtered:
                with st.expander(f"{p.name} — {p.direction} | Tm={p.tm_binding:.1f}\u00b0C | {p.length} nt"):
                    c1, c2 = st.columns(2)
                    c1.markdown(f"**Full sequence:** `{p.sequence}`")
                    c1.markdown(f"**Binding:** `{p.binding_sequence}`")
                    if p.tail_sequence:
                        c1.markdown(f"**Tail:** `{p.tail_sequence}` ({p.tail_purpose})")
                    c2.markdown(f"**Tm binding:** {p.tm_binding}\u00b0C")
                    c2.markdown(f"**Tm full:** {p.tm_full}\u00b0C")
                    c2.markdown(f"**GC:** {p.gc_percent}%")
                    if p.vendor:
                        c2.markdown(f"**Vendor:** {p.vendor}")
                    if p.used_in:
                        c2.markdown(f"**Used in:** {len(p.used_in)} operation(s)")

    with tab2:
        st.subheader("Check Primer Reuse")
        conn = db.get_connection(db_path(root))
        try:
            constructs = db.list_constructs(conn)
            if constructs:
                cname = st.selectbox("Construct", [c.name for c in constructs], key="primer_reuse_c")
                if st.button("Check Reuse"):
                    matches = check_primer_reuse(cname, project_root=root)
                    if matches:
                        st.success(f"Found {len(matches)} reusable primer(s)")
                        for m in matches:
                            p = m["primer"]
                            st.markdown(
                                f"**{p.name}** \u2014 pos {m['match_position']} ({m['strand']}) "
                                f"| Tm={p.tm_binding}\u00b0C"
                            )
                    else:
                        st.info("No reusable primers found for this construct.")
            else:
                st.info("No constructs available.")
        finally:
            conn.close()

    with tab3:
        st.subheader("Register New Primer")
        with st.form("add_primer"):
            c1, c2 = st.columns(2)
            pname = c1.text_input("Primer name", placeholder="fwd_PglaA_OL")
            pseq = c2.text_input("Full sequence", placeholder="ATCGATCG...")
            pbind = c1.text_input("Binding sequence", placeholder="(3' binding portion)")
            ptail = c2.text_input("Tail sequence", placeholder="(5' tail, optional)")
            ppurpose = c1.text_input("Tail purpose", placeholder="overlap with XynTL")
            pdir = c2.selectbox("Direction", ["forward", "reverse"])

            if st.form_submit_button("Register Primer"):
                if pname and pseq:
                    add_primer(
                        pname, pseq,
                        binding_sequence=pbind or "",
                        tail_sequence=ptail or "",
                        tail_purpose=ppurpose,
                        direction=pdir,
                        project_root=root,
                    )
                    st.success(f"Registered primer {pname}")
                    st.rerun()
                else:
                    st.error("Name and sequence are required.")

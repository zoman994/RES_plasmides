"""Assembly Pipeline — status kanban, operations, templates."""

from __future__ import annotations

import streamlit as st
from pvcs.assembly import list_assemblies, update_status, list_templates, VALID_STATUSES


def render():
    st.title("Assembly Pipeline")

    root = st.session_state.get("project_root")
    if not root:
        st.warning("No project loaded.")
        return

    tab1, tab2 = st.tabs(["Pipeline Status", "Templates"])

    with tab1:
        assemblies = list_assemblies(root)

        if not assemblies:
            st.info("No assembly operations recorded. Use the CLI to record assemblies.")
            return

        # Status colors
        status_colors = {
            "design": "#3498DB",
            "primers_ordered": "#00BCD4",
            "pcr": "#F39C12",
            "assembly": "#FF9800",
            "transform": "#9B59B6",
            "screen": "#E91E63",
            "verified": "#27AE60",
        }

        # Kanban-style view by status
        statuses_present = sorted(set(a["status"] for a in assemblies),
                                   key=lambda s: list(VALID_STATUSES).index(s))

        cols = st.columns(len(statuses_present))
        for i, status in enumerate(statuses_present):
            color = status_colors.get(status, "#999")
            with cols[i]:
                st.markdown(
                    f'<div style="text-align:center;background:{color};color:white;'
                    f'padding:6px;border-radius:6px;font-weight:600;margin-bottom:8px">'
                    f'{status.upper()}</div>',
                    unsafe_allow_html=True,
                )

                cards = [a for a in assemblies if a["status"] == status]
                for a in cards:
                    with st.container(border=True):
                        st.markdown(f"**{a['construct_name']}**")
                        st.caption(f"v{a['version']} | {a['method']} | {a['fragments_count']} frags")
                        if a["notes"]:
                            st.caption(a["notes"][:60])

        # Status update
        st.divider()
        st.subheader("Update Status")
        c1, c2, c3 = st.columns(3)
        construct_names = list(set(a["construct_name"] for a in assemblies))
        update_construct = c1.selectbox("Construct", construct_names, key="asm_update_c")
        new_status = c2.selectbox("New status", list(VALID_STATUSES), key="asm_update_s")
        note = c3.text_input("Note", key="asm_update_n")

        if st.button("Update"):
            try:
                update_status(update_construct, new_status, note or None, project_root=root)
                st.success(f"Updated {update_construct} \u2192 {new_status}")
                st.rerun()
            except Exception as e:
                st.error(str(e))

    with tab2:
        templates = list_templates(root)

        if not templates:
            st.info("No assembly templates. Create templates via the CLI.")
            return

        for t in templates:
            with st.expander(f"{t.name} [{t.method}]"):
                st.markdown(f"**Method:** {t.method}")
                st.markdown(f"**Overlap length:** {t.overlap_length} bp")
                if t.description:
                    st.markdown(f"**Description:** {t.description}")

                st.markdown("**Slots:**")
                for slot in t.slots:
                    fixed = "fixed" if slot.fixed else "swappable"
                    st.markdown(f"  {slot.position}. **{slot.name}** ({slot.type_constraint}) \u2014 {fixed}")

"""Assembly Pipeline — create assemblies, update status, view templates."""

from __future__ import annotations

import streamlit as st
from pvcs import database as db
from pvcs.config import db_path
from pvcs.assembly import (
    record_assembly,
    update_status,
    list_assemblies,
    list_templates,
    VALID_METHODS,
    VALID_STATUSES,
)
from pvcs.models import Fragment, _new_id


def _get_conn():
    root = st.session_state.get("project_root")
    if not root:
        return None
    try:
        return db.get_connection(db_path(root))
    except Exception:
        return None


def _parse_fragments(text: str) -> list[Fragment]:
    """Parse 'Name:start-end, Name2:start-end' into Fragment objects."""
    fragments = []
    for i, part in enumerate(text.split(","), 1):
        part = part.strip()
        if not part:
            continue
        if ":" in part:
            name, coords = part.split(":", 1)
            name = name.strip()
            if "-" in coords:
                start_s, end_s = coords.split("-", 1)
                start = int(start_s.strip())
                end = int(end_s.strip())
            else:
                start = int(coords.strip())
                end = start
        else:
            name = part
            start = 0
            end = 0

        fragments.append(Fragment(
            id=_new_id(),
            order=i,
            name=name,
            source_type="pcr_product",
            start=start,
            end=end,
        ))
    return fragments


def render():
    st.title("Assembly Pipeline")

    root = st.session_state.get("project_root")
    if not root:
        st.warning("No project loaded.")
        return

    conn = _get_conn()
    if not conn:
        st.warning("No project loaded.")
        return

    try:
        tab1, tab2, tab3 = st.tabs(["Pipeline Status", "New Assembly", "Templates"])

        # ── Tab 1: Pipeline Status ──
        with tab1:
            assemblies = list_assemblies(root)

            if not assemblies:
                st.info("No assembly operations. Create one in the **New Assembly** tab.")
            else:
                status_colors = {
                    "design": "#3498DB", "primers_ordered": "#00BCD4",
                    "pcr": "#F39C12", "assembly": "#FF9800",
                    "transform": "#9B59B6", "screen": "#E91E63",
                    "verified": "#27AE60",
                }

                for a in assemblies:
                    color = status_colors.get(a["status"], "#999")
                    with st.container(border=True):
                        c1, c2, c3 = st.columns([3, 2, 2])

                        with c1:
                            st.markdown(f"**{a['construct_name']}** v{a['version']}")
                            st.caption(f"{a['method']} | {a['fragments_count']} fragments")
                            if a["notes"]:
                                st.caption(a["notes"][:80])

                        with c2:
                            st.html(
                                f'<div style="background:{color};color:white;'
                                f'padding:6px 12px;border-radius:6px;text-align:center;'
                                f'font-weight:600;font-size:0.9em;margin-top:8px">'
                                f'{a["status"].upper()}</div>'
                            )

                        with c3:
                            current_idx = list(VALID_STATUSES).index(a["status"])
                            next_statuses = list(VALID_STATUSES)[current_idx:]
                            key = f"status_{a['operation'].id}"

                            new_st = st.selectbox(
                                "Update to", next_statuses,
                                key=key, label_visibility="collapsed",
                            )
                            if st.button("Update", key=f"btn_{a['operation'].id}"):
                                try:
                                    update_status(a["construct_name"], new_st, project_root=root)
                                    st.success(f"{a['construct_name']} \u2192 {new_st}")
                                    st.rerun()
                                except Exception as e:
                                    st.error(str(e))

        # ── Tab 2: New Assembly ──
        with tab2:
            st.subheader("Record New Assembly")

            constructs = db.list_constructs(conn)
            if not constructs:
                st.info("Import constructs first.")
            else:
                with st.form("new_assembly"):
                    c1, c2 = st.columns(2)
                    construct_name = c1.selectbox("Construct", [c.name for c in constructs])
                    method = c2.selectbox("Method", list(VALID_METHODS))

                    fragments_str = st.text_input(
                        "Fragments",
                        placeholder="PglaA:1-850, XynTL_Q158R:851-1750, TtrpC:1751-2490",
                        help="Format: Name:start-end, comma-separated",
                    )

                    c3, c4 = st.columns(2)
                    initial_status = c3.selectbox("Initial status", list(VALID_STATUSES))
                    notes = c4.text_input("Notes", placeholder="Overlap PCR assembly")

                    if st.form_submit_button("Create Assembly", type="primary"):
                        construct = db.get_construct_by_name(conn, construct_name)
                        if not construct:
                            st.error(f"Construct '{construct_name}' not found")
                        else:
                            rev = db.get_latest_revision(conn, construct.id)
                            if not rev:
                                st.error(f"No revisions for '{construct_name}'")
                            else:
                                fragments = _parse_fragments(fragments_str) if fragments_str else []
                                try:
                                    record_assembly(
                                        rev.id, method, fragments,
                                        status=initial_status, notes=notes,
                                        project_root=root,
                                    )
                                    st.success(
                                        f"Created assembly for **{construct_name}** "
                                        f"({method}, {len(fragments)} fragments, status: {initial_status})"
                                    )
                                    st.rerun()
                                except Exception as e:
                                    st.error(f"Failed: {e}")

        # ── Tab 3: Templates ──
        with tab3:
            templates = list_templates(root)
            if not templates:
                st.info("No assembly templates. Create templates via CLI.")
            else:
                for t in templates:
                    with st.expander(f"{t.name} [{t.method}]"):
                        st.markdown(f"**Method:** {t.method} | **Overlap:** {t.overlap_length} bp")
                        for slot in t.slots:
                            fixed = "fixed" if slot.fixed else "swappable"
                            st.markdown(f"  {slot.position}. **{slot.name}** ({slot.type_constraint}) \u2014 {fixed}")

    finally:
        conn.close()

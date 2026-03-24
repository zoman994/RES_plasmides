"""Assembly Pipeline — kanban board with drag-and-drop, create assemblies."""

from __future__ import annotations

import json

import streamlit as st
import streamlit.components.v1 as components
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
    """Parse 'Name:start-end, ...' into Fragment objects."""
    fragments = []
    for i, part in enumerate(text.split(","), 1):
        part = part.strip()
        if not part:
            continue
        if ":" in part:
            name, coords = part.split(":", 1)
            name = name.strip()
            if "-" in coords:
                s, e = coords.split("-", 1)
                start, end = int(s.strip()), int(e.strip())
            else:
                start = end = int(coords.strip())
        else:
            name, start, end = part, 0, 0
        fragments.append(Fragment(id=_new_id(), order=i, name=name,
                                  source_type="pcr_product", start=start, end=end))
    return fragments


STATUS_COLORS = {
    "design": "#3498DB",
    "primers_ordered": "#0097A7",
    "pcr": "#F39C12",
    "assembly": "#E67E22",
    "transform": "#9B59B6",
    "screen": "#E91E63",
    "verified": "#27AE60",
}

STATUS_LABELS = {
    "design": "Design",
    "primers_ordered": "Primers",
    "pcr": "PCR",
    "assembly": "Assembly",
    "transform": "Transform",
    "screen": "Screen",
    "verified": "Verified",
}


def _build_kanban_html(assemblies: list[dict]) -> str:
    """Build HTML/CSS/JS kanban board with drag-and-drop."""
    statuses = list(VALID_STATUSES)

    # Build cards JSON for JS
    cards = []
    for a in assemblies:
        cards.append({
            "id": a["operation"].id,
            "construct": a["construct_name"],
            "version": a["version"],
            "method": a["method"],
            "frags": a["fragments_count"],
            "status": a["status"],
            "notes": (a["notes"] or "")[:60],
        })
    cards_json = json.dumps(cards)

    # Build column headers
    cols_html = ""
    for s in statuses:
        color = STATUS_COLORS.get(s, "#999")
        label = STATUS_LABELS.get(s, s)
        cols_html += f'''
        <div class="kb-col" data-status="{s}"
             ondragover="event.preventDefault();this.classList.add('kb-col-over')"
             ondragleave="this.classList.remove('kb-col-over')"
             ondrop="onDrop(event, '{s}')">
            <div class="kb-col-header" style="background:{color}">{label}</div>
            <div class="kb-col-body" id="col-{s}"></div>
        </div>'''

    return f'''<!DOCTYPE html>
<html><head><style>
* {{ margin:0; padding:0; box-sizing:border-box; font-family: -apple-system, 'Segoe UI', Arial, sans-serif; }}
body {{ background: transparent; }}
.kb-board {{ display:flex; gap:8px; overflow-x:auto; padding:8px 4px; min-height:320px; }}
.kb-col {{ flex:1; min-width:120px; background:#F5F6F8; border-radius:10px; display:flex; flex-direction:column; }}
.kb-col-over {{ background:#E3E8EF !important; }}
.kb-col-header {{ color:#fff; padding:8px 10px; border-radius:10px 10px 0 0; font-weight:700; font-size:11px;
    text-align:center; text-transform:uppercase; letter-spacing:0.05em; }}
.kb-col-body {{ padding:6px; flex:1; display:flex; flex-direction:column; gap:6px; min-height:60px; }}
.kb-card {{ background:#fff; border-radius:8px; padding:10px 12px; cursor:grab; border:1px solid #E2E6EA;
    box-shadow:0 1px 3px rgba(0,0,0,0.06); transition:box-shadow 0.15s, transform 0.15s; }}
.kb-card:hover {{ box-shadow:0 3px 10px rgba(0,0,0,0.12); }}
.kb-card:active {{ cursor:grabbing; transform:scale(0.97); }}
.kb-card-name {{ font-weight:700; font-size:13px; color:#1A1A2E; margin-bottom:3px; }}
.kb-card-meta {{ font-size:11px; color:#7F8C8D; }}
.kb-card-method {{ display:inline-block; background:#EDF2F7; padding:1px 6px; border-radius:4px;
    font-size:10px; color:#4A5568; margin-top:4px; }}
.kb-empty {{ color:#B0B8C4; font-size:11px; text-align:center; padding:20px 8px; font-style:italic; }}
</style></head><body>
<div class="kb-board">{cols_html}</div>
<script>
const cards = {cards_json};
const statuses = {json.dumps(statuses)};

function renderCards() {{
    statuses.forEach(s => {{
        const col = document.getElementById('col-' + s);
        col.innerHTML = '';
        const colCards = cards.filter(c => c.status === s);
        if (colCards.length === 0) {{
            col.innerHTML = '<div class="kb-empty">Drop here</div>';
        }}
        colCards.forEach(c => {{
            const el = document.createElement('div');
            el.className = 'kb-card';
            el.draggable = true;
            el.dataset.id = c.id;
            el.dataset.construct = c.construct;
            el.innerHTML = '<div class="kb-card-name">' + c.construct + '</div>'
                + '<div class="kb-card-meta">v' + c.version + ' &middot; ' + c.frags + ' frags</div>'
                + (c.notes ? '<div class="kb-card-meta">' + c.notes + '</div>' : '')
                + '<div class="kb-card-method">' + c.method + '</div>';
            el.addEventListener('dragstart', e => {{
                e.dataTransfer.setData('text/plain', JSON.stringify({{id:c.id, construct:c.construct}}));
                el.style.opacity = '0.4';
            }});
            el.addEventListener('dragend', e => {{ el.style.opacity = '1'; }});
            col.appendChild(el);
        }});
    }});
}}

function onDrop(e, newStatus) {{
    e.preventDefault();
    e.currentTarget.classList.remove('kb-col-over');
    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    const card = cards.find(c => c.id === data.id);
    if (card && card.status !== newStatus) {{
        card.status = newStatus;
        renderCards();
        // Notify Streamlit via URL params
        const url = new URL(window.parent.location);
        url.searchParams.set('kb_construct', data.construct);
        url.searchParams.set('kb_status', newStatus);
        window.parent.location.href = url.toString();
    }}
}}

renderCards();
</script></body></html>'''


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
        # ── Handle drag-and-drop status update from kanban ──
        kb_construct = st.query_params.get("kb_construct")
        kb_status = st.query_params.get("kb_status")
        if kb_construct and kb_status:
            try:
                update_status(kb_construct, kb_status, project_root=root)
                st.toast(f"{kb_construct} \u2192 {kb_status}", icon="\u2705")
            except Exception as e:
                st.toast(f"Update failed: {e}", icon="\u274c")
            # Clear params
            params = dict(st.query_params)
            params.pop("kb_construct", None)
            params.pop("kb_status", None)
            st.query_params.update(params)

        tab1, tab2, tab3 = st.tabs(["Kanban Board", "New Assembly", "Templates"])

        # ── Tab 1: Kanban Board ──
        with tab1:
            assemblies = list_assemblies(root)

            if not assemblies:
                st.info("No assemblies yet. Create one in the **New Assembly** tab.")
            else:
                st.caption("Drag cards between columns to update status")
                html = _build_kanban_html(assemblies)
                # Calculate height based on max cards in any column
                max_cards = max(
                    sum(1 for a in assemblies if a["status"] == s)
                    for s in VALID_STATUSES
                )
                height = max(350, 120 + max_cards * 100)
                components.html(html, height=height, scrolling=False)

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
                                        f"({method}, {len(fragments)} fragments)"
                                    )
                                    st.rerun()
                                except Exception as e:
                                    st.error(f"Failed: {e}")

        # ── Tab 3: Templates ──
        with tab3:
            templates = list_templates(root)
            if not templates:
                st.info("No assembly templates.")
            else:
                for t in templates:
                    with st.expander(f"{t.name} [{t.method}]"):
                        st.markdown(f"**Method:** {t.method} | **Overlap:** {t.overlap_length} bp")
                        for slot in t.slots:
                            fixed = "fixed" if slot.fixed else "swappable"
                            st.markdown(f"  {slot.position}. **{slot.name}** ({slot.type_constraint}) \u2014 {fixed}")

    finally:
        conn.close()

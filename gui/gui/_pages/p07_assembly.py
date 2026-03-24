"""Assembly Pipeline — 3-method wizard + kanban board + templates."""

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
from pvcs.models import Fragment, OverlapZone, _new_id
from pvcs.utils import calc_tm, gc_content, reverse_complement


# ═══════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════

STATUS_COLORS = {
    "design": "#3498DB", "primers_ordered": "#0097A7",
    "pcr": "#F39C12", "assembly": "#E67E22",
    "transform": "#9B59B6", "screen": "#E91E63", "verified": "#27AE60",
}
STATUS_LABELS = {
    "design": "Design", "primers_ordered": "Primers",
    "pcr": "PCR", "assembly": "Assembly",
    "transform": "Transform", "screen": "Screen", "verified": "Verified",
}

METHOD_INFO = {
    "overlap_pcr": {
        "label": "Overlap PCR",
        "desc": "Fragments share short overlapping ends. First amplify each fragment with overlap-tailed primers, then fuse in a second PCR.",
        "ol_min": 18, "ol_max": 30, "ol_default": 22,
        "tm_min": 55.0, "tm_max": 68.0, "tm_default": 62.0,
    },
    "gibson": {
        "label": "Gibson Assembly",
        "desc": "Longer overlaps (20-40 bp). Fragments are joined by exonuclease + polymerase + ligase in a single isothermal reaction. No fusion PCR needed.",
        "ol_min": 20, "ol_max": 40, "ol_default": 30,
        "tm_min": 48.0, "tm_max": 65.0, "tm_default": 55.0,
    },
    "golden_gate": {
        "label": "Golden Gate",
        "desc": "Type IIS restriction enzyme cuts outside its recognition site, creating custom 4-nt overhangs. Simultaneous digest + ligation. Scarless, directional, up to 10+ fragments.",
    },
}


# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════

def _get_conn():
    root = st.session_state.get("project_root")
    if not root:
        return None
    try:
        return db.get_connection(db_path(root))
    except Exception:
        return None


def _init_wizard():
    """Initialize wizard session state."""
    defaults = {
        "asm_step": 1,
        "asm_method": "overlap_pcr",
        "asm_fragments": [],
        "asm_primers": [],
        "asm_overlaps": [],
        "asm_warnings": [],
        "asm_overhangs": [],
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def _reset_wizard():
    for k in ["asm_step", "asm_method", "asm_fragments", "asm_primers",
              "asm_overlaps", "asm_warnings", "asm_overhangs"]:
        if k in st.session_state:
            del st.session_state[k]


# ═══════════════════════════════════════════════════════════════
# STEP 1: Choose Method
# ═══════════════════════════════════════════════════════════════

def _step1_method():
    st.subheader("Step 1: Choose Assembly Method")

    method = st.radio(
        "Method",
        ["overlap_pcr", "gibson", "golden_gate"],
        format_func=lambda m: METHOD_INFO[m]["label"],
        index=["overlap_pcr", "gibson", "golden_gate"].index(st.session_state.asm_method),
        horizontal=True,
    )

    info = METHOD_INFO[method]
    st.info(info["desc"])
    st.session_state.asm_method = method

    if st.button("Next \u2192", type="primary"):
        st.session_state.asm_step = 2
        st.rerun()


# ═══════════════════════════════════════════════════════════════
# STEP 2: Select Fragments
# ═══════════════════════════════════════════════════════════════

def _step2_fragments(conn):
    st.subheader("Step 2: Select Fragments")

    frags = st.session_state.asm_fragments

    # Add fragment form
    with st.expander("Add Fragment", expanded=len(frags) == 0):
        source = st.radio("Source", ["Parts Library", "From Construct", "New / Synthesis"],
                          horizontal=True, key="frag_source")

        if source == "Parts Library":
            parts = db.list_parts(conn)
            if not parts:
                st.warning("No parts in library.")
            else:
                part_name = st.selectbox("Part", [p.name for p in parts], key="frag_part")
                part = next(p for p in parts if p.name == part_name)
                st.caption(f"{part.type} | {len(part.sequence):,} bp | {part.organism}")
                if st.button("Add from library"):
                    frags.append({"name": part.name, "sequence": part.sequence,
                                  "source": f"part:{part.name}", "order": len(frags) + 1})
                    st.rerun()

        elif source == "From Construct":
            constructs = db.list_constructs(conn)
            if not constructs:
                st.warning("No constructs.")
            else:
                c1, c2 = st.columns(2)
                cname = c1.selectbox("Construct", [c.name for c in constructs], key="frag_construct")
                con = next(c for c in constructs if c.name == cname)
                rev = db.get_latest_revision(conn, con.id)
                if rev:
                    feat_names = [f.name for f in rev.features if f.type != "source"]
                    if feat_names:
                        fname = c2.selectbox("Feature", feat_names, key="frag_feat")
                        feat = next(f for f in rev.features if f.name == fname)
                        st.caption(f"{feat.type} | {feat.start}..{feat.end} | {len(feat.sequence)} bp")
                        if st.button("Add from construct"):
                            frags.append({"name": feat.name, "sequence": feat.sequence,
                                          "source": f"construct:{cname}", "order": len(frags) + 1})
                            st.rerun()

        else:  # New / Synthesis
            c1, c2 = st.columns([1, 3])
            fname = c1.text_input("Fragment name", key="frag_new_name")
            fseq = c2.text_area("DNA sequence", height=80, key="frag_new_seq")
            if st.button("Add fragment"):
                if fname and fseq:
                    clean = "".join(c for c in fseq.upper() if c in "ATCGN")
                    frags.append({"name": fname, "sequence": clean,
                                  "source": "synthesis", "order": len(frags) + 1})
                    st.rerun()
                else:
                    st.error("Name and sequence required.")

    # Fragment list
    if frags:
        st.markdown("**Fragments in assembly order:**")
        for i, f in enumerate(frags):
            c1, c2, c3 = st.columns([1, 5, 1])
            c1.markdown(f"**{i + 1}.**")
            c2.markdown(f"**{f['name']}** — {len(f['sequence']):,} bp ({f['source']})")
            if c3.button("\u2716", key=f"rm_frag_{i}"):
                frags.pop(i)
                # Re-number
                for j, ff in enumerate(frags):
                    ff["order"] = j + 1
                st.rerun()

    st.session_state.asm_fragments = frags

    # Navigation
    c1, c2 = st.columns(2)
    if c1.button("\u2190 Back"):
        st.session_state.asm_step = 1
        st.rerun()
    if len(frags) >= 2:
        if c2.button("Next \u2192", type="primary"):
            st.session_state.asm_step = 3
            st.rerun()
    else:
        st.caption("Add at least 2 fragments to continue.")


# ═══════════════════════════════════════════════════════════════
# STEP 3: Design Junctions
# ═══════════════════════════════════════════════════════════════

def _step3_junctions():
    method = st.session_state.asm_method
    frags = st.session_state.asm_fragments

    if method in ("overlap_pcr", "gibson"):
        _step3_overlap(method, frags)
    else:
        _step3_golden_gate(frags)


def _step3_overlap(method: str, frags: list[dict]):
    info = METHOD_INFO[method]
    st.subheader(f"Step 3: Design {info['label']} Junctions")

    c1, c2 = st.columns(2)
    ol_len = c1.slider("Overlap length (bp)", info["ol_min"], info["ol_max"],
                        info["ol_default"], key="asm_ol_len")
    tm_target = c2.slider("Target Tm (\u00b0C)", info["tm_min"], info["tm_max"],
                           info["tm_default"], step=0.5, key="asm_tm_target")

    if method == "gibson":
        st.info("Gibson: No fusion PCR needed \u2014 exonuclease/polymerase/ligase mix does the assembly.")

    if st.button("Calculate junctions", type="primary"):
        # Build full sequence and split points
        full_seq = "".join(f["sequence"] for f in frags)
        split_points = []
        pos = 0
        for f in frags[:-1]:
            pos += len(f["sequence"])
            split_points.append(pos)

        from pvcs.overlap import design_overlaps
        try:
            result = design_overlaps(
                full_seq, split_points,
                overlap_length=ol_len, tm_target=tm_target,
                circular=False,
            )

            # Name primers after fragments
            for i, p in enumerate(result.primers):
                frag_idx = i // 2
                direction = "fwd" if i % 2 == 0 else "rev"
                if frag_idx < len(frags):
                    p.name = f"{direction}_{frags[frag_idx]['name']}"

            st.session_state.asm_primers = result.primers
            st.session_state.asm_overlaps = result.overlap_zones
            st.session_state.asm_warnings = result.warnings
            st.success(f"Designed {len(result.overlap_zones)} overlap zones, {len(result.primers)} primers")
        except Exception as e:
            st.error(f"Design failed: {e}")
            return

    # Show results
    if st.session_state.asm_overlaps:
        st.markdown("**Overlap zones:**")
        for i, z in enumerate(st.session_state.asm_overlaps):
            st.markdown(
                f"Junction {i + 1}: `{z.sequence}` \u2014 "
                f"{z.length} bp, Tm={z.tm}\u00b0C, GC={z.gc_percent}%"
            )

        # Delta Tm check
        tms = [z.tm for z in st.session_state.asm_overlaps]
        if len(tms) > 1:
            delta = max(tms) - min(tms)
            if delta > 3:
                st.warning(f"\u0394Tm between overlaps: {delta:.1f}\u00b0C (ideal < 2\u00b0C)")
            else:
                st.success(f"\u0394Tm: {delta:.1f}\u00b0C \u2714")

        for w in st.session_state.asm_warnings:
            st.warning(w)

    # Navigation
    c1, c2 = st.columns(2)
    if c1.button("\u2190 Back"):
        st.session_state.asm_step = 2
        st.rerun()
    if st.session_state.asm_primers:
        if c2.button("Next \u2192", type="primary"):
            st.session_state.asm_step = 4
            st.rerun()


def _step3_golden_gate(frags: list[dict]):
    st.subheader("Step 3: Design Golden Gate Junctions")

    from pvcs.golden_gate import (
        ENZYME_SITES, design_golden_gate, suggest_overhangs,
        check_internal_sites, check_overhang_uniqueness,
    )

    enzyme = st.selectbox("Enzyme", list(ENZYME_SITES.keys()), key="gg_enzyme")
    enzyme_site = ENZYME_SITES[enzyme][0]
    st.caption(f"Recognition site: {enzyme_site}")

    # Check internal sites first
    st.markdown("**Internal site check:**")
    has_internal = False
    for f in frags:
        sites = check_internal_sites(f["sequence"], enzyme_site)
        if sites:
            st.error(f"\u26a0 {f['name']}: internal {enzyme} site at position(s) {', '.join(map(str, sites))} \u2014 needs domestication!")
            has_internal = True
        else:
            st.markdown(f"\u2705 {f['name']}: no internal {enzyme} sites")

    # Overhang inputs
    st.markdown("**Junction overhangs (4-nt):**")
    frag_tuples = [(f["name"], f["sequence"]) for f in frags]
    auto_oh = suggest_overhangs(frag_tuples)

    overhangs = []
    for i in range(len(frags)):
        next_name = frags[(i + 1) % len(frags)]["name"]
        default = auto_oh[i] if i < len(auto_oh) else "NNNN"
        oh = st.text_input(
            f"Junction {i + 1}: {frags[i]['name']} \u2192 {next_name}",
            value=default, max_chars=4, key=f"gg_oh_{i}",
        )
        overhangs.append(oh.upper())

    # Validate
    oh_warnings = check_overhang_uniqueness(overhangs)
    for w in oh_warnings:
        st.warning(w)

    binding_len = st.slider("Binding region length", 18, 25, 20, key="gg_bind_len")

    if st.button("Design primers", type="primary"):
        try:
            result = design_golden_gate(
                frag_tuples, enzyme=enzyme, overhangs=overhangs,
                binding_length=binding_len,
            )
            st.session_state.asm_primers = result.primers
            st.session_state.asm_overhangs = overhangs
            st.session_state.asm_warnings = result.internal_site_warnings + result.overhang_warnings
            st.success(f"Designed {len(result.primers)} primers for {len(frags)} fragments")
        except Exception as e:
            st.error(f"Design failed: {e}")
            return

    # Navigation
    c1, c2 = st.columns(2)
    if c1.button("\u2190 Back"):
        st.session_state.asm_step = 2
        st.rerun()
    if st.session_state.asm_primers:
        if c2.button("Next \u2192", type="primary"):
            st.session_state.asm_step = 4
            st.rerun()


# ═══════════════════════════════════════════════════════════════
# STEP 4: Primers
# ═══════════════════════════════════════════════════════════════

def _step4_primers():
    st.subheader("Step 4: Primers")
    method = st.session_state.asm_method
    primers = st.session_state.asm_primers

    if not primers:
        st.warning("No primers designed. Go back to Step 3.")
        return

    is_gg = method == "golden_gate"

    # Header
    header = "| # | Name | Sequence | Tm bind | Tm full | GC% | Length |"
    align = "|---|------|----------|---------|---------|-----|--------|"
    if is_gg:
        header += " Overhang |"
        align += "----------|"

    rows = [header, align]
    copy_lines = ["Name\tSequence"]

    for i, p in enumerate(primers, 1):
        seq_display = p.sequence if len(p.sequence) <= 50 else p.sequence[:25] + "..." + p.sequence[-15:]
        row = f"| {i} | {p.name} | `{seq_display}` | {p.tm_binding:.1f}\u00b0 | {p.tm_full:.1f}\u00b0 | {p.gc_percent}% | {p.length} |"
        if is_gg:
            oh = p.tail_purpose.split("overhang ")[-1] if "overhang" in p.tail_purpose else ""
            row += f" {oh} |"
        rows.append(row)
        copy_lines.append(f"{p.name}\t{p.sequence}")

    st.markdown("\n".join(rows))

    # Copy for ordering
    copy_text = "\n".join(copy_lines)
    st.code(copy_text, language=None)
    st.caption("Copy the above text and paste into your oligo order form.")

    # Save to primer registry
    if st.button("Save all primers to registry"):
        from pvcs.primers import add_primer
        root = st.session_state.project_root
        saved = 0
        for p in primers:
            try:
                add_primer(
                    p.name, p.sequence,
                    binding_sequence=p.binding_sequence,
                    tail_sequence=p.tail_sequence,
                    tail_purpose=p.tail_purpose,
                    direction=p.direction,
                    project_root=root,
                )
                saved += 1
            except Exception:
                pass  # duplicate name etc.
        st.success(f"Saved {saved}/{len(primers)} primers to registry")

    # Navigation
    c1, c2 = st.columns(2)
    if c1.button("\u2190 Back"):
        st.session_state.asm_step = 3
        st.rerun()
    if c2.button("Next \u2192", type="primary"):
        st.session_state.asm_step = 5
        st.rerun()


# ═══════════════════════════════════════════════════════════════
# STEP 5: Record & Track
# ═══════════════════════════════════════════════════════════════

def _step5_record(conn):
    st.subheader("Step 5: Record Assembly")

    method = st.session_state.asm_method
    frags = st.session_state.asm_fragments
    method_label = METHOD_INFO[method]["label"]

    st.markdown(f"**Method:** {method_label} | **Fragments:** {len(frags)}")
    for f in frags:
        st.caption(f"  {f['order']}. {f['name']} ({len(f['sequence']):,} bp)")

    constructs = db.list_constructs(conn)

    with st.form("record_assembly"):
        construct_name = st.selectbox(
            "Link to construct",
            [c.name for c in constructs] if constructs else ["(none)"],
        )
        notes = st.text_input("Notes", value=f"{method_label}: " + " + ".join(f["name"] for f in frags))
        initial_status = st.selectbox("Initial status", list(VALID_STATUSES))

        if st.form_submit_button("Create Assembly", type="primary"):
            if not constructs:
                st.error("No constructs available.")
            else:
                con = db.get_construct_by_name(conn, construct_name)
                rev = db.get_latest_revision(conn, con.id) if con else None
                if not rev:
                    st.error("No revision found for this construct.")
                else:
                    model_frags = [
                        Fragment(id=_new_id(), order=f["order"], name=f["name"],
                                 source_type="pcr_product", start=0, end=len(f["sequence"]))
                        for f in frags
                    ]
                    try:
                        record_assembly(
                            rev.id, method, model_frags,
                            primer_ids=[p.id for p in st.session_state.asm_primers],
                            status=initial_status, notes=notes,
                            project_root=st.session_state.project_root,
                        )
                        st.success(f"Assembly recorded for **{construct_name}**!")
                        st.balloons()
                        _reset_wizard()
                        st.rerun()
                    except Exception as e:
                        st.error(f"Failed: {e}")

    if st.button("\u2190 Back"):
        st.session_state.asm_step = 4
        st.rerun()


# ═══════════════════════════════════════════════════════════════
# Kanban board (HTML5 drag-and-drop)
# ═══════════════════════════════════════════════════════════════

def _build_kanban_html(assemblies: list[dict]) -> str:
    statuses = list(VALID_STATUSES)
    cards = [{"id": a["operation"].id, "construct": a["construct_name"],
              "version": a["version"], "method": a["method"],
              "frags": a["fragments_count"], "status": a["status"],
              "notes": (a["notes"] or "")[:60]} for a in assemblies]

    cols_html = ""
    for s in statuses:
        color = STATUS_COLORS.get(s, "#999")
        label = STATUS_LABELS.get(s, s)
        cols_html += f'''
        <div class="kb-col" data-status="{s}"
             ondragover="event.preventDefault();this.classList.add('kb-over')"
             ondragleave="this.classList.remove('kb-over')"
             ondrop="onDrop(event,'{s}')">
            <div class="kb-hdr" style="background:{color}">{label}</div>
            <div class="kb-body" id="col-{s}"></div>
        </div>'''

    return f'''<!DOCTYPE html><html><head><style>
*{{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,'Segoe UI',Arial,sans-serif}}
body{{background:transparent}}
.kb-board{{display:flex;gap:8px;padding:8px 4px;min-height:300px}}
.kb-col{{flex:1;min-width:110px;background:#F5F6F8;border-radius:10px;display:flex;flex-direction:column}}
.kb-over{{background:#E3E8EF!important}}
.kb-hdr{{color:#fff;padding:7px;border-radius:10px 10px 0 0;font-weight:700;font-size:10px;text-align:center;text-transform:uppercase;letter-spacing:.05em}}
.kb-body{{padding:5px;flex:1;display:flex;flex-direction:column;gap:5px;min-height:50px}}
.kb-card{{background:#fff;border-radius:7px;padding:8px 10px;cursor:grab;border:1px solid #E2E6EA;box-shadow:0 1px 2px rgba(0,0,0,.05);transition:.15s}}
.kb-card:hover{{box-shadow:0 3px 8px rgba(0,0,0,.1)}}
.kb-card:active{{cursor:grabbing;transform:scale(.97)}}
.kb-name{{font-weight:700;font-size:12px;color:#1A1A2E}}
.kb-meta{{font-size:10px;color:#7F8C8D}}
.kb-tag{{display:inline-block;background:#EDF2F7;padding:1px 5px;border-radius:4px;font-size:9px;color:#4A5568;margin-top:3px}}
.kb-empty{{color:#B0B8C4;font-size:10px;text-align:center;padding:15px 5px;font-style:italic}}
</style></head><body>
<div class="kb-board">{cols_html}</div>
<script>
const cards={json.dumps(cards)};const statuses={json.dumps(statuses)};
function renderCards(){{statuses.forEach(s=>{{const col=document.getElementById('col-'+s);col.innerHTML='';const cc=cards.filter(c=>c.status===s);if(!cc.length)col.innerHTML='<div class="kb-empty">Drop here</div>';cc.forEach(c=>{{const el=document.createElement('div');el.className='kb-card';el.draggable=true;el.dataset.id=c.id;el.innerHTML='<div class="kb-name">'+c.construct+'</div><div class="kb-meta">v'+c.version+' &middot; '+c.frags+' frags</div>'+(c.notes?'<div class="kb-meta">'+c.notes+'</div>':'')+'<div class="kb-tag">'+c.method+'</div>';el.addEventListener('dragstart',e=>{{e.dataTransfer.setData('text/plain',JSON.stringify({{id:c.id,construct:c.construct}}));el.style.opacity='.4'}});el.addEventListener('dragend',()=>{{el.style.opacity='1'}});col.appendChild(el)}})}})}};
function onDrop(e,ns){{e.preventDefault();e.currentTarget.classList.remove('kb-over');const d=JSON.parse(e.dataTransfer.getData('text/plain'));const c=cards.find(x=>x.id===d.id);if(c&&c.status!==ns){{c.status=ns;renderCards();const u=new URL(window.parent.location);u.searchParams.set('kb_construct',d.construct);u.searchParams.set('kb_status',ns);window.parent.location.href=u.toString()}}}};
renderCards();
</script></body></html>'''


# ═══════════════════════════════════════════════════════════════
# Main render
# ═══════════════════════════════════════════════════════════════

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
        # Handle kanban drag-and-drop update
        kb_c = st.query_params.get("kb_construct")
        kb_s = st.query_params.get("kb_status")
        if kb_c and kb_s:
            try:
                update_status(kb_c, kb_s, project_root=root)
                st.toast(f"{kb_c} \u2192 {kb_s}", icon="\u2705")
            except Exception as e:
                st.toast(str(e), icon="\u274c")
            params = dict(st.query_params)
            params.pop("kb_construct", None)
            params.pop("kb_status", None)
            st.query_params.update(params)

        tab1, tab2, tab3 = st.tabs(["New Assembly", "Pipeline Board", "Templates"])

        # ── Tab 1: Wizard ──
        with tab1:
            _init_wizard()

            # Progress bar
            step = st.session_state.asm_step
            steps = ["Method", "Fragments", "Junctions", "Primers", "Record"]
            progress_html = '<div style="display:flex;gap:4px;margin-bottom:16px">'
            for i, name in enumerate(steps, 1):
                color = "#0066CC" if i <= step else "#E0E4E8"
                text_color = "#fff" if i <= step else "#999"
                progress_html += (
                    f'<div style="flex:1;text-align:center;padding:8px;'
                    f'background:{color};color:{text_color};border-radius:6px;'
                    f'font-size:12px;font-weight:600">{i}. {name}</div>'
                )
            progress_html += '</div>'
            st.html(progress_html)

            if step == 1:
                _step1_method()
            elif step == 2:
                _step2_fragments(conn)
            elif step == 3:
                _step3_junctions()
            elif step == 4:
                _step4_primers()
            elif step == 5:
                _step5_record(conn)

        # ── Tab 2: Kanban ──
        with tab2:
            assemblies = list_assemblies(root)
            if not assemblies:
                st.info("No assemblies yet. Create one in **New Assembly**.")
            else:
                st.caption("Drag cards between columns to update status")
                html = _build_kanban_html(assemblies)
                max_cards = max(sum(1 for a in assemblies if a["status"] == s) for s in VALID_STATUSES)
                components.html(html, height=max(340, 110 + max_cards * 95), scrolling=False)

        # ── Tab 3: Templates ──
        with tab3:
            st.subheader("Quick Start Templates")

            templates = [
                {"name": "3-fragment Overlap PCR", "method": "overlap_pcr",
                 "desc": "Promoter + CDS + Terminator", "slots": ["Promoter", "CDS", "Terminator"]},
                {"name": "4-fragment Gibson", "method": "gibson",
                 "desc": "Vector + Insert1 + Insert2 + Insert3", "slots": ["Vector", "Insert 1", "Insert 2", "Insert 3"]},
                {"name": "Golden Gate modular (BsaI)", "method": "golden_gate",
                 "desc": "Up to 8 fragments with BsaI", "slots": [f"Part {i}" for i in range(1, 9)]},
            ]

            for t in templates:
                with st.container(border=True):
                    c1, c2 = st.columns([4, 1])
                    c1.markdown(f"**{t['name']}**")
                    c1.caption(f"{t['desc']} | Slots: {', '.join(t['slots'])}")
                    if c2.button("Use", key=f"tpl_{t['name']}"):
                        _reset_wizard()
                        _init_wizard()
                        st.session_state.asm_method = t["method"]
                        st.session_state.asm_step = 2
                        st.rerun()

            # Saved templates from DB
            st.divider()
            saved = list_templates(root)
            if saved:
                st.subheader("Saved Templates")
                for t in saved:
                    with st.expander(f"{t.name} [{t.method}]"):
                        st.markdown(f"**Overlap:** {t.overlap_length} bp")
                        for slot in t.slots:
                            fixed = "fixed" if slot.fixed else "swappable"
                            st.markdown(f"  {slot.position}. **{slot.name}** ({slot.type_constraint}) \u2014 {fixed}")

    finally:
        conn.close()

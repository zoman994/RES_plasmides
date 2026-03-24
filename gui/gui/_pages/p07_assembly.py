"""Assembly Pipeline — 5-method wizard + multi-step plans + kanban."""

from __future__ import annotations

import json

import streamlit as st
import streamlit.components.v1 as components
from pvcs import database as db
from pvcs.config import db_path
from pvcs.assembly import (
    record_assembly, update_status, list_assemblies, list_templates,
    VALID_METHODS, VALID_STATUSES,
)
from pvcs.models import Fragment, Primer, _new_id
from pvcs.utils import calc_tm, gc_content, reverse_complement

# ═══════════════════════════════════════════════════════════════
STATUS_COLORS = {
    "design": "#3498DB", "primers_ordered": "#0097A7", "pcr": "#F39C12",
    "assembly": "#E67E22", "transform": "#9B59B6", "screen": "#E91E63",
    "verified": "#27AE60",
}
STATUS_LABELS = {
    "design": "Design", "primers_ordered": "Primers", "pcr": "PCR",
    "assembly": "Assembly", "transform": "Transform", "screen": "Screen",
    "verified": "Verified",
}
ALL_METHODS = ["overlap_pcr", "gibson", "golden_gate", "restriction_ligation", "kld"]
METHOD_LABELS = {
    "overlap_pcr": "Overlap PCR",
    "gibson": "Gibson Assembly",
    "golden_gate": "Golden Gate",
    "restriction_ligation": "Restriction / Ligation",
    "kld": "KLD (Site-directed mutagenesis)",
}
METHOD_DESCS = {
    "overlap_pcr": "Fragments share 18-25 bp overlaps. Fuse by overlap-extension PCR.",
    "gibson": "Longer overlaps (20-40 bp). One-step isothermal assembly — no fusion PCR.",
    "golden_gate": "Type IIS RE (BsaI/BbsI) creates 4-nt overhangs. Scarless, directional.",
    "restriction_ligation": "Classic cloning: RE digest + T4 ligase. Insert into vector backbone.",
    "kld": "Inverse PCR + KLD enzyme mix. Point mutations, insertions, deletions on existing plasmid.",
}


def _get_conn():
    root = st.session_state.get("project_root")
    if not root:
        return None
    try:
        return db.get_connection(db_path(root))
    except Exception:
        return None


def _init_wizard():
    for k, v in {"asm_step": 1, "asm_method": "overlap_pcr",
                  "asm_fragments": [], "asm_primers": [],
                  "asm_overlaps": [], "asm_warnings": [],
                  "asm_overhangs": [], "asm_plan_steps": []}.items():
        if k not in st.session_state:
            st.session_state[k] = v


def _reset_wizard():
    for k in ["asm_step", "asm_method", "asm_fragments", "asm_primers",
              "asm_overlaps", "asm_warnings", "asm_overhangs", "asm_plan_steps"]:
        st.session_state.pop(k, None)


# ── STEP 1: Choose Method ─────────────────────────────────────
def _step1():
    st.subheader("Step 1: Choose Method")
    method = st.radio("Method", ALL_METHODS,
                      format_func=lambda m: METHOD_LABELS[m],
                      index=ALL_METHODS.index(st.session_state.asm_method),
                      horizontal=True)
    st.info(METHOD_DESCS[method])
    st.session_state.asm_method = method
    if st.button("Next \u2192", type="primary"):
        st.session_state.asm_step = 2
        st.rerun()


# ── STEP 2: Select Fragments / Template ───────────────────────
def _step2(conn):
    method = st.session_state.asm_method

    if method == "kld":
        _step2_kld(conn)
        return
    if method == "restriction_ligation":
        _step2_restriction(conn)
        return

    st.subheader("Step 2: Select Fragments")
    frags = st.session_state.asm_fragments

    with st.expander("Add Fragment", expanded=len(frags) == 0):
        source = st.radio("Source", ["Parts Library", "From Construct", "New / Synthesis"],
                          horizontal=True, key="fs2")
        if source == "Parts Library":
            parts = db.list_parts(conn)
            if parts:
                pn = st.selectbox("Part", [p.name for p in parts], key="fp2")
                p = next(x for x in parts if x.name == pn)
                st.caption(f"{p.type} | {len(p.sequence):,} bp | {p.organism}")
                if st.button("Add"):
                    frags.append({"name": p.name, "sequence": p.sequence,
                                  "source": f"part:{p.name}", "order": len(frags)+1})
                    st.rerun()
            else:
                st.warning("No parts in library.")
        elif source == "From Construct":
            constructs = db.list_constructs(conn)
            if constructs:
                c1, c2 = st.columns(2)
                cn = c1.selectbox("Construct", [c.name for c in constructs], key="fc2")
                con = next(c for c in constructs if c.name == cn)
                rev = db.get_latest_revision(conn, con.id)
                if rev:
                    fnames = [f.name for f in rev.features if f.type != "source"]
                    if fnames:
                        fn = c2.selectbox("Feature", fnames, key="ff2")
                        feat = next(f for f in rev.features if f.name == fn)
                        st.caption(f"{feat.type} | {feat.start}..{feat.end} | {len(feat.sequence)} bp")
                        if st.button("Add from construct"):
                            frags.append({"name": feat.name, "sequence": feat.sequence,
                                          "source": f"construct:{cn}", "order": len(frags)+1})
                            st.rerun()
        else:
            c1, c2 = st.columns([1, 3])
            fn = c1.text_input("Name", key="fn2")
            fq = c2.text_area("Sequence", height=80, key="fq2")
            if st.button("Add fragment"):
                if fn and fq:
                    clean = "".join(c for c in fq.upper() if c in "ATCGN")
                    frags.append({"name": fn, "sequence": clean,
                                  "source": "synthesis", "order": len(frags)+1})
                    st.rerun()

    if frags:
        st.markdown("**Fragments:**")
        for i, f in enumerate(frags):
            c1, c2, c3 = st.columns([1, 5, 1])
            c1.markdown(f"**{i+1}.**")
            c2.markdown(f"**{f['name']}** \u2014 {len(f['sequence']):,} bp ({f['source']})")
            if c3.button("\u2716", key=f"rm{i}"):
                frags.pop(i)
                for j, ff in enumerate(frags): ff["order"] = j+1
                st.rerun()

    st.session_state.asm_fragments = frags
    c1, c2 = st.columns(2)
    if c1.button("\u2190 Back"): st.session_state.asm_step = 1; st.rerun()
    if len(frags) >= 2 and c2.button("Next \u2192", type="primary"):
        st.session_state.asm_step = 3; st.rerun()


def _step2_kld(conn):
    st.subheader("Step 2: Select Template & Mutation")
    constructs = db.list_constructs(conn)
    if not constructs:
        st.warning("Import constructs first."); return

    cn = st.selectbox("Template construct", [c.name for c in constructs], key="kld_c")
    con = next(c for c in constructs if c.name == cn)
    rev = db.get_latest_revision(conn, con.id)
    if not rev: st.warning("No revisions."); return

    mut_type = st.radio("Mutation type", ["Point mutation", "Insertion", "Deletion"], horizontal=True)
    if mut_type == "Point mutation":
        c1, c2, c3 = st.columns(3)
        pos = c1.number_input("Position (1-based)", min_value=1, max_value=rev.length, value=1)
        old_codon = rev.sequence[pos-1:pos+2].upper()
        c2.text_input("Current codon", value=old_codon, disabled=True)
        new_codon = c3.text_input("New codon", value="", max_chars=3, placeholder="CGG")
        # Find feature at position
        feat_name = ""
        for f in rev.features:
            if f.start <= pos <= f.end and f.type == "CDS":
                feat_name = f.name; break
        if feat_name: st.caption(f"In CDS: {feat_name}")
        st.session_state["kld_data"] = {"type": "point", "pos": pos, "codon": new_codon.upper(),
                                         "feat": feat_name, "seq": rev.sequence, "construct": cn}
    elif mut_type == "Insertion":
        pos = st.number_input("Insert at position", min_value=1, max_value=rev.length, value=1)
        ins_seq = st.text_area("Insert sequence", height=60)
        st.session_state["kld_data"] = {"type": "insertion", "pos": pos,
                                         "ins": "".join(c for c in ins_seq.upper() if c in "ATCGN"),
                                         "seq": rev.sequence, "construct": cn}
    else:
        c1, c2 = st.columns(2)
        s = c1.number_input("Start", min_value=1, max_value=rev.length, value=1)
        e = c2.number_input("End", min_value=1, max_value=rev.length, value=min(100, rev.length))
        st.caption(f"Deleting {e-s+1} bp")
        st.session_state["kld_data"] = {"type": "deletion", "start": s, "end": e,
                                         "seq": rev.sequence, "construct": cn}

    c1, c2 = st.columns(2)
    if c1.button("\u2190 Back"): st.session_state.asm_step = 1; st.rerun()
    if c2.button("Design primers \u2192", type="primary"):
        st.session_state.asm_step = 3; st.rerun()


def _step2_restriction(conn):
    st.subheader("Step 2: Select Insert & Vector")
    from pvcs.restriction import RE_DATABASE, COMMON_PAIRS

    constructs = db.list_constructs(conn)
    parts = db.list_parts(conn)

    st.markdown("**Insert source:**")
    ins_source = st.radio("Insert from", ["Parts Library", "From Construct", "Paste"], horizontal=True, key="ri_src")
    insert_seq = ""
    insert_name = ""
    if ins_source == "Parts Library" and parts:
        pn = st.selectbox("Part", [p.name for p in parts], key="ri_part")
        p = next(x for x in parts if x.name == pn)
        insert_seq = p.sequence; insert_name = p.name
        st.caption(f"{len(insert_seq):,} bp")
    elif ins_source == "From Construct" and constructs:
        cn = st.selectbox("Construct", [c.name for c in constructs], key="ri_con")
        con = next(c for c in constructs if c.name == cn)
        rev = db.get_latest_revision(conn, con.id)
        if rev:
            fnames = [f.name for f in rev.features if f.type != "source"]
            fn = st.selectbox("Feature", fnames, key="ri_feat") if fnames else None
            if fn:
                feat = next(f for f in rev.features if f.name == fn)
                insert_seq = feat.sequence; insert_name = feat.name
    else:
        insert_name = st.text_input("Insert name", key="ri_name")
        insert_seq = st.text_area("Paste insert sequence", key="ri_seq", height=60)
        insert_seq = "".join(c for c in insert_seq.upper() if c in "ATCGN")

    st.markdown("**Enzymes:**")
    enzyme_names = sorted(RE_DATABASE.keys())
    c1, c2 = st.columns(2)
    e5 = c1.selectbox("5' enzyme", enzyme_names, index=enzyme_names.index("EcoRI"), key="re5")
    e3 = c2.selectbox("3' enzyme", enzyme_names, index=enzyme_names.index("BamHI"), key="re3")

    if e5 and e3:
        e5i = RE_DATABASE[e5]; e3i = RE_DATABASE[e3]
        st.caption(f"{e5}: {e5i['site']} ({e5i['end']} overhang: {e5i['overhang']})")
        st.caption(f"{e3}: {e3i['site']} ({e3i['end']} overhang: {e3i['overhang']})")
        directional = e5 != e3
        st.caption(f"{'Directional' if directional else 'Non-directional'} cloning")

    st.session_state["re_data"] = {"insert_seq": insert_seq, "insert_name": insert_name,
                                    "e5": e5, "e3": e3}

    c1, c2 = st.columns(2)
    if c1.button("\u2190 Back"): st.session_state.asm_step = 1; st.rerun()
    if insert_seq and c2.button("Design primers \u2192", type="primary"):
        st.session_state.asm_step = 3; st.rerun()


# ── STEP 3: Design Junctions ──────────────────────────────────
def _step3():
    method = st.session_state.asm_method
    if method in ("overlap_pcr", "gibson"):
        _step3_overlap(method)
    elif method == "golden_gate":
        _step3_gg()
    elif method == "restriction_ligation":
        _step3_re()
    elif method == "kld":
        _step3_kld()


def _step3_overlap(method):
    info = {"overlap_pcr": (18, 30, 22, 55.0, 68.0, 62.0),
            "gibson": (20, 40, 30, 48.0, 65.0, 55.0)}[method]
    ol_min, ol_max, ol_def, tm_min, tm_max, tm_def = info
    st.subheader(f"Step 3: {METHOD_LABELS[method]} Junctions")

    c1, c2 = st.columns(2)
    ol_len = c1.slider("Overlap (bp)", ol_min, ol_max, ol_def, key="ol3")
    tm_target = c2.slider("Tm target (\u00b0C)", tm_min, tm_max, tm_def, step=0.5, key="tm3")

    if method == "gibson":
        st.info("No fusion PCR needed \u2014 isothermal enzyme mix does the assembly.")

    frags = st.session_state.asm_fragments
    if st.button("Calculate", type="primary"):
        full_seq = "".join(f["sequence"] for f in frags)
        splits = []; pos = 0
        for f in frags[:-1]: pos += len(f["sequence"]); splits.append(pos)
        from pvcs.overlap import design_overlaps
        try:
            r = design_overlaps(full_seq, splits, overlap_length=ol_len,
                                tm_target=tm_target, circular=False)
            for i, p in enumerate(r.primers):
                fi = i // 2
                d = "fwd" if i % 2 == 0 else "rev"
                if fi < len(frags): p.name = f"{d}_{frags[fi]['name']}"
            st.session_state.asm_primers = r.primers
            st.session_state.asm_overlaps = r.overlap_zones
            st.session_state.asm_warnings = r.warnings
            st.success(f"{len(r.overlap_zones)} junctions, {len(r.primers)} primers")
        except Exception as e:
            st.error(str(e)); return

    if st.session_state.asm_overlaps:
        for i, z in enumerate(st.session_state.asm_overlaps):
            st.markdown(f"Junction {i+1}: `{z.sequence}` \u2014 {z.length} bp, Tm={z.tm}\u00b0C, GC={z.gc_percent}%")
        tms = [z.tm for z in st.session_state.asm_overlaps]
        if len(tms) > 1:
            d = max(tms) - min(tms)
            (st.success if d <= 3 else st.warning)(f"\u0394Tm: {d:.1f}\u00b0C")
        for w in st.session_state.asm_warnings: st.warning(w)

    _nav_3()


def _step3_gg():
    st.subheader("Step 3: Golden Gate Junctions")
    from pvcs.golden_gate import ENZYME_SITES, design_golden_gate, suggest_overhangs, check_internal_sites, check_overhang_uniqueness

    enzyme = st.selectbox("Enzyme", list(ENZYME_SITES.keys()), key="gge")
    site = ENZYME_SITES[enzyme][0]
    st.caption(f"Site: {site}")

    frags = st.session_state.asm_fragments
    for f in frags:
        sites = check_internal_sites(f["sequence"], site)
        if sites:
            st.error(f"\u26a0 {f['name']}: internal {enzyme} at {', '.join(map(str, sites))}")
        else:
            st.markdown(f"\u2705 {f['name']}: clean")

    auto = suggest_overhangs([(f["name"], f["sequence"]) for f in frags])
    overhangs = []
    for i in range(len(frags)):
        nxt = frags[(i+1) % len(frags)]["name"]
        oh = st.text_input(f"OH {i+1}: {frags[i]['name']}\u2192{nxt}",
                           value=auto[i] if i < len(auto) else "NNNN", max_chars=4, key=f"oh{i}")
        overhangs.append(oh.upper())
    for w in check_overhang_uniqueness(overhangs): st.warning(w)

    bind = st.slider("Binding length", 18, 25, 20, key="ggb")
    if st.button("Design primers", type="primary"):
        try:
            r = design_golden_gate([(f["name"], f["sequence"]) for f in frags],
                                   enzyme=enzyme, overhangs=overhangs, binding_length=bind)
            st.session_state.asm_primers = r.primers
            st.session_state.asm_overhangs = overhangs
            st.session_state.asm_warnings = r.internal_site_warnings + r.overhang_warnings
            st.success(f"{len(r.primers)} primers")
        except Exception as e:
            st.error(str(e))
    _nav_3()


def _step3_re():
    st.subheader("Step 3: Restriction / Ligation Design")
    from pvcs.restriction import design_re_primers, find_sites, RE_DATABASE

    data = st.session_state.get("re_data", {})
    if not data.get("insert_seq"):
        st.warning("Go back and select insert."); return

    if st.button("Design primers", type="primary"):
        try:
            r = design_re_primers(data["insert_seq"], data["e5"], data["e3"])
            st.session_state.asm_primers = r.primers
            st.session_state.asm_warnings = r.warnings
            if r.directional:
                st.success(f"Directional cloning: {data['e5']} / {data['e3']}")
            else:
                st.info("Non-directional (same enzyme both sides)")
            if r.insert_internal_sites:
                for s in r.insert_internal_sites:
                    st.error(f"\u26a0 Internal {s['enzyme']} at pos {s['position']} in insert")
        except Exception as e:
            st.error(str(e))

    for w in st.session_state.asm_warnings: st.warning(w)
    _nav_3()


def _step3_kld():
    st.subheader("Step 3: KLD Primer Design")
    from pvcs.kld import design_kld_point_mutation, design_kld_insertion, design_kld_deletion

    data = st.session_state.get("kld_data", {})
    if not data: st.warning("Go back."); return

    if st.button("Design KLD primers", type="primary"):
        try:
            if data["type"] == "point":
                if not data.get("codon"): st.error("Enter new codon"); return
                r = design_kld_point_mutation(data["seq"], data["pos"], data["codon"], data.get("feat", ""))
            elif data["type"] == "insertion":
                r = design_kld_insertion(data["seq"], data["pos"], data["ins"])
            else:
                r = design_kld_deletion(data["seq"], data["start"], data["end"])
            st.session_state.asm_primers = r.primers
            st.session_state.asm_warnings = r.warnings
            st.success(f"{r.description}")
            st.caption(f"Mutant: {r.template_length} bp \u2192 {len(r.mutant_sequence)} bp")
        except Exception as e:
            st.error(str(e))

    for w in st.session_state.asm_warnings: st.warning(w)
    _nav_3()


def _nav_3():
    c1, c2 = st.columns(2)
    if c1.button("\u2190 Back", key="b3"): st.session_state.asm_step = 2; st.rerun()
    if st.session_state.asm_primers and c2.button("Next \u2192", type="primary", key="n3"):
        st.session_state.asm_step = 4; st.rerun()


# ── STEP 4: Primers (color-coded tail/binding) ────────────────
def _step4():
    st.subheader("Step 4: Primers")
    primers = st.session_state.asm_primers
    if not primers: st.warning("No primers. Go back."); return

    # Color-coded primer display: tail lowercase gray, binding UPPERCASE bold
    html = ('<table style="width:100%;border-collapse:collapse;font-size:0.88em">'
            '<tr style="background:#F0F2F6;font-weight:600">'
            '<th style="padding:8px;text-align:left">#</th>'
            '<th style="padding:8px;text-align:left">Name</th>'
            '<th style="padding:8px;text-align:left">Sequence (tail + BINDING)</th>'
            '<th style="padding:8px;text-align:center">Bind Tm</th>'
            '<th style="padding:8px;text-align:center">Full Tm</th>'
            '<th style="padding:8px;text-align:center">GC%</th>'
            '<th style="padding:8px;text-align:center">Len</th>'
            '<th style="padding:8px;text-align:left">Tail purpose</th>'
            '</tr>')

    copy_lines = ["Name\tSequence"]
    for i, p in enumerate(primers, 1):
        tail = p.tail_sequence.lower() if p.tail_sequence else ""
        bind = p.binding_sequence.upper()
        # Color: tail in teal, binding in dark
        seq_html = (f'<span style="color:#0097A7;font-family:monospace">{tail}</span>'
                    f'<span style="color:#1A1A2E;font-weight:700;font-family:monospace">{bind}</span>')
        # Tm color: green if 58-64, yellow if outside
        tm_color = "#27AE60" if 58 <= p.tm_binding <= 64 else "#F39C12"
        purpose = p.tail_purpose if p.tail_purpose else "\u2014"
        html += (f'<tr style="border-bottom:1px solid #EEE">'
                 f'<td style="padding:6px">{i}</td>'
                 f'<td style="padding:6px;font-weight:600">{p.name}</td>'
                 f'<td style="padding:6px">{seq_html}</td>'
                 f'<td style="padding:6px;text-align:center;color:{tm_color};font-weight:600">{p.tm_binding:.1f}\u00b0C</td>'
                 f'<td style="padding:6px;text-align:center;color:#7F8C8D">{p.tm_full:.1f}\u00b0C</td>'
                 f'<td style="padding:6px;text-align:center">{p.gc_percent}%</td>'
                 f'<td style="padding:6px;text-align:center">{p.length} nt</td>'
                 f'<td style="padding:6px;font-size:0.85em;color:#666">{purpose}</td>'
                 f'</tr>')
        copy_lines.append(f"{p.name}\t{p.sequence}")
    html += '</table>'

    # Legend
    html += ('<div style="margin-top:8px;font-size:0.8em;color:#666">'
             '<span style="color:#0097A7">\u25cf tail (overlap/RE site)</span> &nbsp; '
             '<span style="color:#1A1A2E;font-weight:700">\u25cf BINDING (anneals to template)</span> &nbsp; '
             'Bind Tm = PCR annealing temperature</div>')

    st.html(html)

    # Copy for ordering
    with st.expander("Copy for ordering (tab-separated)"):
        st.code("\n".join(copy_lines), language=None)

    if st.button("Save all to primer registry"):
        from pvcs.primers import add_primer
        root = st.session_state.project_root
        saved = 0
        for p in primers:
            try:
                add_primer(p.name, p.sequence, binding_sequence=p.binding_sequence,
                           tail_sequence=p.tail_sequence, tail_purpose=p.tail_purpose,
                           direction=p.direction, project_root=root); saved += 1
            except Exception: pass
        st.success(f"Saved {saved}/{len(primers)}")

    c1, c2 = st.columns(2)
    if c1.button("\u2190 Back", key="b4"): st.session_state.asm_step = 3; st.rerun()
    if c2.button("Next \u2192", type="primary", key="n4"): st.session_state.asm_step = 5; st.rerun()


# ── STEP 5: Record ────────────────────────────────────────────
def _step5(conn):
    st.subheader("Step 5: Record Assembly")
    method = st.session_state.asm_method
    frags = st.session_state.asm_fragments
    st.markdown(f"**{METHOD_LABELS[method]}** | {len(frags)} fragments")

    constructs = db.list_constructs(conn)
    with st.form("rec5"):
        cn = st.selectbox("Link to construct", [c.name for c in constructs] if constructs else ["(none)"])
        notes = st.text_input("Notes", value=f"{METHOD_LABELS[method]}: " + " + ".join(f["name"] for f in frags))
        status = st.selectbox("Initial status", list(VALID_STATUSES))
        if st.form_submit_button("Create Assembly", type="primary"):
            if not constructs: st.error("No constructs."); return
            con = db.get_construct_by_name(conn, cn)
            rev = db.get_latest_revision(conn, con.id) if con else None
            if not rev: st.error("No revision."); return
            mf = [Fragment(id=_new_id(), order=f["order"], name=f["name"],
                           source_type="pcr_product", start=0, end=len(f["sequence"])) for f in frags]
            try:
                record_assembly(rev.id, method if method in VALID_METHODS else "other", mf,
                                primer_ids=[p.id for p in st.session_state.asm_primers],
                                status=status, notes=notes, project_root=st.session_state.project_root)
                st.success(f"Recorded assembly for **{cn}**!"); st.balloons()
                _reset_wizard(); st.rerun()
            except Exception as e: st.error(str(e))

    if st.button("\u2190 Back", key="b5"): st.session_state.asm_step = 4; st.rerun()


# ── KANBAN ─────────────────────────────────────────────────────
def _kanban(assemblies):
    statuses = list(VALID_STATUSES)
    cards = [{"id": a["operation"].id, "construct": a["construct_name"],
              "version": a["version"], "method": a["method"],
              "frags": a["fragments_count"], "status": a["status"],
              "notes": (a["notes"] or "")[:50]} for a in assemblies]
    cols = ""
    for s in statuses:
        co = STATUS_COLORS.get(s, "#999")
        la = STATUS_LABELS.get(s, s)
        cols += f'<div class="kc" data-status="{s}" ondragover="event.preventDefault();this.classList.add(\'ko\')" ondragleave="this.classList.remove(\'ko\')" ondrop="D(event,\'{s}\')"><div class="kh" style="background:{co}">{la}</div><div class="kb" id="c-{s}"></div></div>'
    html = f'''<!DOCTYPE html><html><head><style>
*{{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,'Segoe UI',sans-serif}}body{{background:transparent}}
.kb-wrap{{display:flex;gap:6px;padding:6px;min-height:280px}}
.kc{{flex:1;min-width:100px;background:#F3F4F6;border-radius:8px;display:flex;flex-direction:column}}
.ko{{background:#E5E7EB!important}}.kh{{color:#fff;padding:6px;border-radius:8px 8px 0 0;font-weight:700;font-size:10px;text-align:center;text-transform:uppercase;letter-spacing:.04em}}
.kb{{padding:4px;flex:1;display:flex;flex-direction:column;gap:4px;min-height:40px}}
.kd{{background:#fff;border-radius:6px;padding:7px 9px;cursor:grab;border:1px solid #E5E7EB;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:.12s}}
.kd:hover{{box-shadow:0 2px 6px rgba(0,0,0,.1)}}.kd:active{{cursor:grabbing;transform:scale(.97)}}
.kn{{font-weight:700;font-size:11px;color:#111}}.km{{font-size:9px;color:#6B7280}}.kt{{display:inline-block;background:#F3F4F6;padding:1px 4px;border-radius:3px;font-size:8px;color:#374151;margin-top:2px}}
.ke{{color:#9CA3AF;font-size:9px;text-align:center;padding:12px 4px;font-style:italic}}
</style></head><body><div class="kb-wrap">{cols}</div><script>
const C={json.dumps(cards)},S={json.dumps(statuses)};
function R(){{S.forEach(s=>{{const c=document.getElementById('c-'+s);c.innerHTML='';const f=C.filter(x=>x.status===s);if(!f.length)c.innerHTML='<div class="ke">Drop here</div>';f.forEach(x=>{{const e=document.createElement('div');e.className='kd';e.draggable=true;e.innerHTML='<div class="kn">'+x.construct+'</div><div class="km">v'+x.version+' &middot; '+x.frags+'f</div>'+(x.notes?'<div class="km">'+x.notes+'</div>':'')+'<div class="kt">'+x.method+'</div>';e.addEventListener('dragstart',v=>{{v.dataTransfer.setData('text/plain',JSON.stringify({{id:x.id,construct:x.construct}}));e.style.opacity='.4'}});e.addEventListener('dragend',()=>{{e.style.opacity='1'}});c.appendChild(e)}})}})}}
function D(e,n){{e.preventDefault();e.currentTarget.classList.remove('ko');const d=JSON.parse(e.dataTransfer.getData('text/plain'));const c=C.find(x=>x.id===d.id);if(c&&c.status!==n){{c.status=n;R();const u=new URL(window.parent.location);u.searchParams.set('kb_construct',d.construct);u.searchParams.set('kb_status',n);window.parent.location.href=u.toString()}}}}
R();</script></body></html>'''
    mx = max((sum(1 for a in assemblies if a["status"] == s) for s in statuses), default=0)
    components.html(html, height=max(300, 100 + mx * 80), scrolling=False)


# ── MAIN RENDER ────────────────────────────────────────────────
def render():
    st.title("Assembly Pipeline")
    root = st.session_state.get("project_root")
    if not root: st.warning("No project loaded."); return
    conn = _get_conn()
    if not conn: st.warning("No project loaded."); return

    try:
        # Handle kanban drop
        kc = st.query_params.get("kb_construct")
        ks = st.query_params.get("kb_status")
        if kc and ks:
            try: update_status(kc, ks, project_root=root); st.toast(f"{kc} \u2192 {ks}", icon="\u2705")
            except Exception as e: st.toast(str(e), icon="\u274c")
            p = dict(st.query_params); p.pop("kb_construct", None); p.pop("kb_status", None)
            st.query_params.update(p)

        tab1, tab2, tab3 = st.tabs(["Design Assembly", "Pipeline Board", "Templates"])

        with tab1:
            _init_wizard()
            step = st.session_state.asm_step
            labels = ["Method", "Fragments", "Junctions", "Primers", "Record"]
            bar = '<div style="display:flex;gap:3px;margin-bottom:14px">'
            for i, l in enumerate(labels, 1):
                bg = "#0066CC" if i <= step else "#E5E7EB"
                fg = "#fff" if i <= step else "#9CA3AF"
                bar += f'<div style="flex:1;text-align:center;padding:7px;background:{bg};color:{fg};border-radius:5px;font-size:11px;font-weight:600">{i}. {l}</div>'
            bar += '</div>'
            st.html(bar)

            if step == 1: _step1()
            elif step == 2: _step2(conn)
            elif step == 3: _step3()
            elif step == 4: _step4()
            elif step == 5: _step5(conn)

        with tab2:
            assemblies = list_assemblies(root)
            if not assemblies:
                st.info("No assemblies. Create one in **Design Assembly**.")
            else:
                st.caption("Drag cards between columns to update status")
                _kanban(assemblies)

        with tab3:
            templates = [
                ("3-part Overlap PCR", "overlap_pcr", "Promoter + CDS + Terminator"),
                ("4-part Gibson", "gibson", "Vector + Insert1 + Insert2 + Insert3"),
                ("Golden Gate modular (BsaI)", "golden_gate", "Up to 8 fragments"),
                ("Restriction + Ligation", "restriction_ligation", "Insert into backbone"),
                ("Site-directed mutagenesis (KLD)", "kld", "Point mutation on template"),
            ]
            for name, m, desc in templates:
                with st.container(border=True):
                    c1, c2 = st.columns([4, 1])
                    c1.markdown(f"**{name}**"); c1.caption(desc)
                    if c2.button("Use", key=f"t_{m}"):
                        _reset_wizard(); _init_wizard()
                        st.session_state.asm_method = m
                        st.session_state.asm_step = 2; st.rerun()

            saved = list_templates(root)
            if saved:
                st.divider(); st.subheader("Saved Templates")
                for t in saved:
                    with st.expander(f"{t.name} [{t.method}]"):
                        for s in t.slots:
                            st.markdown(f"  {s.position}. **{s.name}** \u2014 {'fixed' if s.fixed else 'swappable'}")
    finally:
        conn.close()

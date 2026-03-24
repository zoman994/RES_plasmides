"""FastAPI REST API — thin wrapper around pvcs modules for React designer."""

from __future__ import annotations

import sys
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Ensure pvcs is importable
# gui/api/ → gui/ → RESplasmide/ → RESplasmide/src/
_src = Path(__file__).resolve().parent.parent.parent / "src"
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

from pvcs import database as db
from pvcs.config import db_path, find_project_root
from pvcs.overlap import design_overlaps
from pvcs.assembly_engine import (
    AssemblyFragment, JunctionSpec, generate_primers_for_step,
    design_overlap_junction, format_order_sheet, GG_ENZYMES,
)
from pvcs.golden_gate import design_golden_gate, check_overhang_uniqueness, check_internal_sites
from pvcs.restriction import RE_DATABASE, design_re_primers, check_compatible_ends
from pvcs.utils import calc_tm, gc_content

app = FastAPI(title="PlasmidVCS Designer API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _conn():
    try:
        root = find_project_root()
        return db.get_connection(db_path(root))
    except FileNotFoundError:
        raise HTTPException(404, "No .pvcs project found")


# ── Parts ──────────────────────────────────────────────────────

@app.get("/api/parts")
def list_parts(part_type: str | None = None):
    conn = _conn()
    result = db.list_parts(conn, part_type)
    conn.close()
    return [{"id": p.id, "name": p.name, "type": p.type,
             "sequence": p.sequence, "length": len(p.sequence),
             "organism": p.organism, "description": p.description}
            for p in result]


# ── Constructs + Features ──────────────────────────────────────

@app.get("/api/constructs")
def list_constructs():
    conn = _conn()
    result = db.list_constructs(conn)
    conn.close()
    return [{"id": c.id, "name": c.name, "topology": c.topology} for c in result]


@app.get("/api/constructs/{construct_id}/features")
def get_features(construct_id: str):
    conn = _conn()
    rev = db.get_latest_revision(conn, construct_id)
    conn.close()
    if not rev:
        return []
    return [{"name": f.name, "type": f.type, "start": f.start, "end": f.end,
             "strand": f.strand, "sequence": f.sequence, "length": f.end - f.start + 1}
            for f in rev.features if f.type != "source"]


# ── Primer Design ──────────────────────────────────────────────

class DesignRequest(BaseModel):
    fragments: list[dict]       # [{name, sequence, needsAmplification?}]
    method: str = "overlap_pcr"
    junctions: list[dict] = []  # [{type, overlapMode, overlapLength, tmTarget, enzyme, overhang}]
    circular: bool = False
    bindingTmTarget: float = 60.0


@app.post("/api/design/primers")
def design_primers(req: DesignRequest):
    frags = [
        AssemblyFragment(
            order=i + 1, name=f["name"],
            sequence=f.get("sequence", ""),
            length=len(f.get("sequence", "")),
            needs_amplification=f.get("needsAmplification", True),
            source_type=f.get("sourceType", "part"),
        )
        for i, f in enumerate(req.fragments)
    ]

    juncs: list[JunctionSpec] = []
    n_frags = len(frags)
    for i, j in enumerate(req.junctions):
        jtype = j.get("type", "overlap")

        # For circular: last junction connects last→first fragment
        left_idx = i
        right_idx = (i + 1) % n_frags if req.circular else min(i + 1, n_frags - 1)

        junc = JunctionSpec(
            left_order=left_idx + 1,
            right_order=right_idx + 1,
            junction_type=jtype,
            overlap_mode=j.get("overlapMode", "split"),
            enzyme=j.get("enzyme", ""),
            overhang_4nt=j.get("overhang", ""),
            re_enzyme=j.get("reEnzyme", ""),
        )
        # Design overlap for ALL junctions including circular closing
        if jtype == "overlap" and left_idx < n_frags and right_idx < n_frags:
            ol = design_overlap_junction(
                frags[left_idx].sequence, frags[right_idx].sequence,
                overlap_length=j.get("overlapLength", 30),
                tm_target=j.get("tmTarget", 62.0),
            )
            junc.overlap_sequence = ol.overlap_sequence
            junc.overlap_length = ol.overlap_length
            junc.overlap_tm = ol.overlap_tm
            junc.overlap_gc = ol.overlap_gc
            junc.warnings = ol.warnings
        juncs.append(junc)

    result = generate_primers_for_step(
        frags, juncs, circular=req.circular, binding_tm_target=req.bindingTmTarget,
    )

    return {
        "primers": [
            {"name": p.name, "sequence": p.sequence,
             "bindingSequence": p.binding_sequence,
             "tailSequence": p.tail_sequence,
             "tailPurpose": p.tail_purpose,
             "tmBinding": round(p.tm_binding, 1),
             "tmFull": round(p.tm_full, 1),
             "gcPercent": p.gc_percent,
             "length": p.length,
             "direction": p.direction}
            for p in result.primers
        ],
        "junctions": [
            {"overlapSequence": j.overlap_sequence, "overlapLength": j.overlap_length,
             "overlapTm": j.overlap_tm, "overlapGc": j.overlap_gc,
             "warnings": j.warnings}
            for j in juncs
        ],
        "outputLength": result.output_length,
        "warnings": result.warnings,
        "orderSheet": format_order_sheet(result.primers, req.method),
    }


# ── Golden Gate Validation ─────────────────────────────────────

@app.post("/api/validate/golden-gate")
def validate_gg(body: dict):
    overhangs = body.get("overhangs", [])
    enzyme = body.get("enzyme", "BsaI")
    fragments = body.get("fragments", [])

    warnings = check_overhang_uniqueness(overhangs)
    if enzyme in GG_ENZYMES:
        site = GG_ENZYMES[enzyme]["site"]
        for f in fragments:
            sites = check_internal_sites(f.get("sequence", ""), site)
            if sites:
                warnings.append(f"Internal {enzyme} in {f['name']} at {', '.join(map(str, sites))}")
    return {"warnings": warnings, "valid": len(warnings) == 0}


# ── Restriction Compatibility ──────────────────────────────────

@app.get("/api/restriction/enzymes")
def list_enzymes():
    return [{"name": k, **v} for k, v in RE_DATABASE.items()]


@app.post("/api/restriction/check")
def check_re(body: dict):
    compat, msg = check_compatible_ends(body["enzyme5"], body["enzyme3"])
    return {"compatible": compat, "message": msg}


# ── Utility ────────────────────────────────────────────────────

@app.post("/api/calc/tm")
def calc_tm_api(body: dict):
    return {"tm": round(calc_tm(body["sequence"]), 1),
            "gc": round(gc_content(body["sequence"]) * 100, 1)}


# ── Intron Detection ───────────────────────────────────────────

@app.post("/api/introns/detect")
def detect_introns(body: dict):
    """Detect introns by aligning cDNA to genomic sequence."""
    from pvcs.intron_detection import detect_introns_by_alignment
    return detect_introns_by_alignment(
        body["genomic"], body["cdna"],
        max_intron=body.get("maxIntron", 5000),
    )


@app.post("/api/introns/remove")
def remove_introns(body: dict):
    """Generate exon fusion fragments for overlap PCR."""
    from pvcs.intron_detection import generate_exon_fusion_fragments
    return generate_exon_fusion_fragments(
        body["genomic"], body["exons"],
        overlap_length=body.get("overlapLength", 30),
    )


# ── Serve React build (production) ─────────────────────────────

_designer_dist = Path(__file__).parent.parent / "designer" / "dist"
if _designer_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_designer_dist), html=True))

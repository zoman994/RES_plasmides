"""Import — upload GenBank / SnapGene files."""

import tempfile
import streamlit as st
from pathlib import Path

from pvcs import revision
from pvcs.parser import parse_genbank
from pvcs.utils import format_bp
from components.plasmid_map import render_circular_map
from components.feature_table import render_feature_table


root = st.session_state.get("project_root", Path.cwd())
st.title("📥 Import Construct")

if not (root / ".pvcs").exists():
    st.warning("No .pvcs project. Run `pvcs init` first.")
    st.stop()

# ── File upload ────────────────────────────────────────────────────
uploaded = st.file_uploader(
    "Upload GenBank or SnapGene file",
    type=["gb", "gbk", "genbank", "dna"],
    help="Supports .gb, .gbk (GenBank) and .dna (SnapGene) formats",
)

if not uploaded:
    st.info("Drag and drop a file above, or click to browse.")
    st.stop()

# ── Save to temp and parse ─────────────────────────────────────────
suffix = Path(uploaded.name).suffix
tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
tmp.write(uploaded.read())
tmp.flush()
tmp_path = Path(tmp.name)

try:
    # Handle .dna (SnapGene) files
    if suffix.lower() == ".dna":
        try:
            from snapgene_reader import snapgene_file_to_dict
            from Bio.Seq import Seq
            from Bio.SeqRecord import SeqRecord
            from Bio.SeqFeature import SeqFeature, FeatureLocation
            from Bio import SeqIO

            STRAND_MAP = {'+': 1, '-': -1, '.': 0, 1: 1, -1: -1, 0: 0, None: 0}
            d = snapgene_file_to_dict(str(tmp_path))
            seq = d.get("seq", "")
            record = SeqRecord(
                Seq(seq),
                id=uploaded.name.replace(".dna", ""),
                name=uploaded.name.replace(".dna", "")[:16],
                annotations={"molecule_type": "DNA", "topology": "circular" if d.get("is_circular") else "linear"},
            )
            for f in d.get("features", []):
                quals = {}
                if "name" in f:
                    quals["label"] = [f["name"]]
                if "qualifiers" in f:
                    for k, v in f["qualifiers"].items():
                        quals[k] = v if isinstance(v, list) else [str(v)]
                strand = STRAND_MAP.get(f.get("strand", 0), 0)
                sf = SeqFeature(
                    FeatureLocation(f.get("start", 0), f.get("end", 0), strand=strand),
                    type=f.get("type", "misc_feature"), qualifiers=quals,
                )
                record.features.append(sf)

            # Write as GenBank for pvcs
            gb_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".gb")
            SeqIO.write(record, gb_tmp.name, "genbank")
            gb_tmp.flush()
            tmp_path = Path(gb_tmp.name)
        except ImportError:
            st.error("snapgene_reader not installed. Run: `pip install snapgene_reader`")
            st.stop()

    # Parse GenBank
    sequence, features, metadata = parse_genbank(str(tmp_path))

except Exception as e:
    st.error(f"Failed to parse file: {e}")
    st.stop()

# ── Preview ────────────────────────────────────────────────────────
st.subheader("Preview")

from pvcs.models import Feature as PvcsFeature, Revision
# Create temporary feature list for rendering
preview_features = []
for f in features:
    preview_features.append(f)

col_preview, col_info = st.columns([2, 3])

with col_preview:
    svg = render_circular_map(preview_features, len(sequence), uploaded.name[:20], size=350)
    st.html(f'<div style="text-align:center">{svg}</div>')

with col_info:
    st.metric("Sequence length", f"{len(sequence):,} bp")
    st.metric("Features", len(features))
    topo = metadata.get("topology", "linear")
    st.caption(f"Topology: {topo}")

    render_feature_table(preview_features)

# ── Import form ────────────────────────────────────────────────────
st.divider()
st.subheader("Import Settings")

default_name = Path(uploaded.name).stem
construct_name = st.text_input("Construct name", value=default_name)
message = st.text_input("Import message", value=f"Imported from {uploaded.name}")
author = st.text_input("Author", value="")
tags = st.text_input("Tags (comma-separated)", value="")

if st.button("🧬 Import Construct", type="primary", use_container_width=True):
    try:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
        c, rev = revision.import_construct(
            str(tmp_path),
            name=construct_name,
            message=message,
            author=author or None,
            tags=tag_list,
            project_root=root,
        )
        st.success(
            f"Imported **{c.name}** v{rev.version} — "
            f"{format_bp(rev.length)}, {len(rev.features)} features"
        )
        st.balloons()
    except Exception as e:
        st.error(f"Import failed: {e}")

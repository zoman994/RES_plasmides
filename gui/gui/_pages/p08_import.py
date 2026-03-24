"""Import — upload .gb/.dna/.fasta files and import into PlasmidVCS."""

from __future__ import annotations

import tempfile
from pathlib import Path

import streamlit as st
from pvcs.config import init_project
from pvcs.parser import parse_genbank, infer_all_feature_types
from pvcs.revision import import_construct
from gui.components.plasmid_map import render_map_auto, show_svg
from gui.components.feature_table import render_feature_table, render_editable_feature_table


def _try_convert_dna(uploaded_file) -> Path | None:
    """Convert .dna (SnapGene) to GenBank preserving all feature names."""
    try:
        from snapgene_reader import snapgene_file_to_dict
        from Bio.Seq import Seq
        from Bio.SeqRecord import SeqRecord
        from Bio.SeqFeature import SeqFeature, FeatureLocation
        from Bio import SeqIO

        STRAND_MAP = {"+": 1, "-": -1, ".": 0, 1: 1, -1: -1, 0: 0, None: 0}

        tmp_dna = Path(tempfile.mktemp(suffix=".dna"))
        tmp_dna.write_bytes(uploaded_file.getvalue())

        d = snapgene_file_to_dict(str(tmp_dna))
        seq = d.get("seq", "")
        is_circ = d.get("is_circular", False)

        record = SeqRecord(
            Seq(seq),
            id=uploaded_file.name.replace(".dna", ""),
            name=uploaded_file.name.replace(".dna", "")[:16],
            annotations={
                "molecule_type": "DNA",
                "topology": "circular" if is_circ else "linear",
            },
        )

        for f in d.get("features", []):
            quals: dict = {}
            if "name" in f:
                quals["label"] = [f["name"]]  # FULL name preserved
            if "qualifiers" in f:
                for k, v in f["qualifiers"].items():
                    val = v if isinstance(v, list) else [str(v)]
                    # Sanitize non-ASCII
                    quals[k] = [
                        s.encode("ascii", "replace").decode("ascii") if isinstance(s, str) else s
                        for s in val
                    ]

            strand = STRAND_MAP.get(f.get("strand", 0), 0)
            sf = SeqFeature(
                FeatureLocation(f.get("start", 0), f.get("end", 0), strand=strand),
                type=f.get("type", "misc_feature"),
                qualifiers=quals,
            )
            record.features.append(sf)

        gb_path = tmp_dna.with_suffix(".gb")
        with open(gb_path, "w", encoding="utf-8") as fh:
            SeqIO.write(record, fh, "genbank")
        tmp_dna.unlink()
        return gb_path
    except ImportError:
        st.error("snapgene_reader not installed. Run: pip install snapgene_reader")
        return None
    except Exception as e:
        st.error(f"Failed to convert .dna file: {e}")
        return None


def render():
    st.title("Import Construct")

    root = st.session_state.get("project_root")

    # Project initialization
    if not root or not (root / ".pvcs").is_dir():
        st.subheader("Initialize Project")
        st.info("No PlasmidVCS project found. Create one first.")

        with st.form("init_project"):
            proj_name = st.text_input("Project name", placeholder="A. niger CRISPR platform")
            proj_dir = st.text_input("Directory", value=str(Path.cwd()))
            author = st.text_input("Author", placeholder="Your Name")

            if st.form_submit_button("Initialize Project"):
                if proj_name:
                    new_root = init_project(proj_dir, proj_name, author)
                    st.session_state.project_root = new_root
                    st.success(f"Initialized project at {new_root}")
                    st.rerun()
                else:
                    st.error("Project name is required.")
        return

    # File uploader
    uploaded = st.file_uploader(
        "Upload GenBank / SnapGene / FASTA",
        type=["gb", "gbk", "genbank", "dna", "fasta", "fa"],
        help="GenBank (.gb) is the preferred format.",
    )

    if not uploaded:
        st.info("Upload a GenBank file to preview and import.")
        return

    # Save to temp file
    suffix = Path(uploaded.name).suffix
    tmp_path = Path(tempfile.mktemp(suffix=suffix))

    if suffix == ".dna":
        tmp_path = _try_convert_dna(uploaded)
        if not tmp_path:
            return
    else:
        tmp_path.write_bytes(uploaded.getvalue())

    # Parse and preview — pick parser by extension
    try:
        if suffix.lower() in (".fa", ".fasta"):
            from pvcs.parser import parse_fasta
            sequence, metadata = parse_fasta(tmp_path)
            features = []  # FASTA has no annotations
            metadata.setdefault("topology", "linear")
        else:
            sequence, features, metadata = parse_genbank(tmp_path)
    except Exception as e:
        st.error(f"Failed to parse file: {e}")
        return

    st.subheader("Preview")

    # Map + info
    left, right = st.columns([3, 2])

    topology = metadata.get("topology", "linear")

    with left:
        svg = render_map_auto(
            features, len(sequence),
            construct_name=metadata.get("name", uploaded.name),
            topology=topology, size=420,
        )
        h = 200 if topology == "linear" else 440
        show_svg(svg, height=h)

    with right:
        st.markdown(f"**File:** {uploaded.name}")
        st.markdown(f"**Length:** {len(sequence):,} bp")
        st.markdown(f"**Topology:** {topology}")
        st.markdown(f"**Features:** {len(features)}")
        st.markdown(f"**Organism:** {metadata.get('organism', '\u2014')}")

        type_counts: dict[str, int] = {}
        for f in features:
            if f.type != "source":
                type_counts[f.type] = type_counts.get(f.type, 0) + 1
        if type_counts:
            summary = ", ".join(f"{v} {k}" for k, v in sorted(type_counts.items()))
            st.caption(summary)

    # Editable feature table
    with st.expander("Feature Details (click to edit types/names)", expanded=True):
        edited = render_editable_feature_table(features, key_prefix="imp")
        if edited:
            st.info("Features modified. Changes will be applied on import.")

    # Read-only table with ORF info
    with st.expander("Feature Table with ORF info"):
        render_feature_table(features, full_sequence=sequence)

    # Import form
    st.divider()
    st.subheader("Import")

    with st.form("import_construct"):
        c1, c2 = st.columns(2)
        name = c1.text_input(
            "Construct name",
            value=metadata.get("name", Path(uploaded.name).stem),
        )
        message = c2.text_input("Import message", placeholder="Initial import from SnapGene")
        author = c1.text_input("Author", value="")
        tags_str = c2.text_input("Tags (comma-separated)", placeholder="CRISPR, hygR, ama1")

        if st.form_submit_button("Import", type="primary"):
            if name:
                tags = [t.strip() for t in tags_str.split(",") if t.strip()] if tags_str else []
                try:
                    construct, revision = import_construct(
                        tmp_path,
                        name=name,
                        message=message,
                        author=author or None,
                        tags=tags,
                        project_root=root,
                    )
                    st.success(
                        f"Imported **{construct.name}** v{revision.version} "
                        f"({revision.length:,} bp, {len(revision.features)} features)"
                    )
                    st.balloons()
                except Exception as e:
                    st.error(f"Import failed: {e}")
            else:
                st.error("Construct name is required.")

    # Cleanup
    try:
        if tmp_path.exists():
            tmp_path.unlink()
    except Exception:
        pass

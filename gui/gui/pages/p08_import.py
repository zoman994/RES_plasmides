"""Import — upload .gb/.dna/.fasta files and import into PlasmidVCS."""

from __future__ import annotations

import tempfile
from pathlib import Path

import streamlit as st
from pvcs.config import init_project
from pvcs.parser import parse_genbank
from pvcs.revision import import_construct
from gui.components.plasmid_map import render_circular_map
from gui.components.feature_table import render_feature_table


def _try_convert_dna(uploaded_file) -> Path | None:
    """Try to convert .dna (SnapGene) to GenBank via snapgene_reader."""
    try:
        from snapgene_reader import snapgene_file_to_seqrecord
        from Bio import SeqIO

        tmp = Path(tempfile.mktemp(suffix=".dna"))
        tmp.write_bytes(uploaded_file.getvalue())

        record = snapgene_file_to_seqrecord(str(tmp))
        gb_path = tmp.with_suffix(".gb")
        SeqIO.write(record, gb_path, "genbank")
        tmp.unlink()
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

    # Parse and preview
    try:
        sequence, features, metadata = parse_genbank(tmp_path)
    except Exception as e:
        st.error(f"Failed to parse file: {e}")
        return

    st.subheader("Preview")

    # Map + info
    left, right = st.columns([3, 2])

    with left:
        svg = render_circular_map(
            features, len(sequence),
            construct_name=metadata.get("name", uploaded.name),
            size=400,
        )
        st.html(f'<div style="text-align:center">{svg}</div>')

    with right:
        st.markdown(f"**File:** {uploaded.name}")
        st.markdown(f"**Length:** {len(sequence):,} bp")
        st.markdown(f"**Topology:** {metadata.get('topology', 'unknown')}")
        st.markdown(f"**Features:** {len(features)}")
        st.markdown(f"**Organism:** {metadata.get('organism', '—')}")

        # Feature summary
        type_counts: dict[str, int] = {}
        for f in features:
            if f.type != "source":
                type_counts[f.type] = type_counts.get(f.type, 0) + 1
        if type_counts:
            summary = ", ".join(f"{v} {k}" for k, v in sorted(type_counts.items()))
            st.caption(summary)

    # Feature table
    with st.expander("Feature Details", expanded=False):
        render_feature_table(features)

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

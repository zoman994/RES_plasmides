"""PlasmidVCS — Streamlit Web Interface.

Usage:
    streamlit run gui/app.py

Or with a specific project directory:
    streamlit run gui/app.py -- --project /path/to/project
"""

import sys
from pathlib import Path

import streamlit as st

# ── Ensure pvcs is importable ──────────────────────────────────────
_repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_repo_root / "src"))
sys.path.insert(0, str(_repo_root / "gui"))


def _parse_project_arg() -> Path:
    """Extract --project from sys.argv (after the -- separator)."""
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == "--project" and i + 1 < len(args):
            return Path(args[i + 1]).resolve()
    return Path.cwd()


# ── Page config ────────────────────────────────────────────────────
st.set_page_config(
    page_title="PlasmidVCS",
    page_icon="🧬",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Session state init ─────────────────────────────────────────────
if "project_root" not in st.session_state:
    st.session_state.project_root = _parse_project_arg()

root = st.session_state.project_root
pvcs_dir = root / ".pvcs"

# ── Sidebar ────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("# 🧬 PlasmidVCS")

    if pvcs_dir.exists():
        try:
            from pvcs import database as db
            from pvcs.config import db_path
            conn = db.get_connection(db_path(root))
            project = db.get_project(conn)
            constructs = db.list_constructs(conn)
            conn.close()

            if project:
                st.caption(f"Project: **{project.name}**")
            st.caption(f"{len(constructs)} constructs")
        except Exception as e:
            st.error(f"DB error: {e}")
    else:
        st.warning(f"No .pvcs project in:\n`{root}`")
        st.info("Run `pvcs init` first")

    st.divider()
    st.caption(f"📁 `{root}`")


# ── Main page navigation ──────────────────────────────────────────
page = st.navigation([
    st.Page("pages/01_dashboard.py", title="Dashboard", icon="🏠"),
    st.Page("pages/02_construct.py", title="Construct", icon="🧬"),
    st.Page("pages/03_diff.py", title="Diff", icon="🔬"),
    st.Page("pages/04_strains.py", title="Strains", icon="🧫"),
    st.Page("pages/05_parts.py", title="Parts", icon="📦"),
    st.Page("pages/08_import.py", title="Import", icon="📥"),
])

page.run()

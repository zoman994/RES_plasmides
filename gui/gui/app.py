"""PlasmidVCS — Streamlit Web Interface.

Entry point for the multipage Streamlit app.
Run: streamlit run gui/app.py
"""

import sys
from pathlib import Path

import streamlit as st

st.set_page_config(
    page_title="PlasmidVCS",
    page_icon="🧬",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Load custom CSS via st.markdown (st.html uses iframe, won't work) ──
_css_path = Path(__file__).parent / "style.css"
if _css_path.exists():
    st.markdown(f"<style>{_css_path.read_text()}</style>", unsafe_allow_html=True)

# Ensure root src/ and gui/ are on path so pvcs + gui imports work
_gui_dir = Path(__file__).resolve().parent.parent   # .../gui/
_repo_root = _gui_dir.parent                         # .../RESplasmide/
_src_dir = _repo_root / "src"                        # .../RESplasmide/src/
for p in [str(_src_dir), str(_gui_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)


# --- Project root resolution ---
def _resolve_project_root() -> Path | None:
    """Find a .pvcs project directory."""
    for arg in sys.argv:
        if arg.startswith("--project"):
            idx = sys.argv.index(arg)
            if "=" in arg:
                return Path(arg.split("=", 1)[1])
            elif idx + 1 < len(sys.argv):
                return Path(sys.argv[idx + 1])

    candidates = [Path.cwd(), _gui_dir, _repo_root]
    for p in candidates:
        if (p / ".pvcs").is_dir():
            return p
    return None


if "project_root" not in st.session_state:
    root = _resolve_project_root()
    if root:
        st.session_state.project_root = root


# --- Use st.navigation API (no auto-discovery, single sidebar nav) ---
from gui._pages.p01_dashboard import render as dashboard
from gui._pages.p02_construct import render as construct
from gui._pages.p03_diff import render as diff_page
from gui._pages.p04_strains import render as strains
from gui._pages.p05_parts import render as parts_page
from gui._pages.p06_primers import render as primers_page
from gui._pages.p07_assembly import render as assembly
from gui._pages.p08_import import render as import_page

pg = st.navigation(
    {
        "Main": [
            st.Page(dashboard, title="Dashboard", icon="\U0001f4ca", url_path="dashboard"),
            st.Page(construct, title="Construct", icon="\U0001f9ec", url_path="construct"),
            st.Page(diff_page, title="Diff", icon="\U0001f50d", url_path="diff"),
            st.Page(import_page, title="Import", icon="\U0001f4e5", url_path="import"),
        ],
        "Registry": [
            st.Page(strains, title="Strains", icon="\U0001f9eb", url_path="strains"),
            st.Page(parts_page, title="Parts", icon="\U0001f9f1", url_path="parts"),
            st.Page(primers_page, title="Primers", icon="\U0001f9ea", url_path="primers"),
            st.Page(assembly, title="Assembly", icon="\U0001f527", url_path="assembly"),
        ],
    }
)

# --- Sidebar links ---
st.sidebar.divider()
st.sidebar.page_link("http://localhost:3000", label="Construct Designer", icon="\U0001f9e9")
st.sidebar.divider()
if "project_root" in st.session_state:
    from pvcs.config import load_config
    try:
        cfg = load_config(st.session_state.project_root)
        st.sidebar.caption(f"**{cfg.get('project_name', 'Project')}**")
    except Exception:
        pass
else:
    st.sidebar.warning("No project loaded")

pg.run()

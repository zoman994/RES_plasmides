"""PlasmidVCS — Streamlit Web Interface.

Entry point for the multipage Streamlit app.
Run: streamlit run gui/app.py
"""

import sys
from pathlib import Path

import streamlit as st

# Ensure src/ is on path so pvcs imports work
_gui_root = Path(__file__).resolve().parent.parent
_src_dir = _gui_root / "src"
if str(_src_dir) not in sys.path:
    sys.path.insert(0, str(_src_dir))

st.set_page_config(
    page_title="PlasmidVCS",
    page_icon="\U0001f9ec",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Load custom CSS
_css_path = Path(__file__).parent / "style.css"
if _css_path.exists():
    st.html(f"<style>{_css_path.read_text()}</style>")


# --- Project root resolution ---
def _resolve_project_root() -> Path | None:
    """Find a .pvcs project directory."""
    # Check CLI args
    for arg in sys.argv:
        if arg.startswith("--project"):
            idx = sys.argv.index(arg)
            if "=" in arg:
                return Path(arg.split("=", 1)[1])
            elif idx + 1 < len(sys.argv):
                return Path(sys.argv[idx + 1])

    # Check common locations
    candidates = [Path.cwd(), _gui_root, _gui_root.parent]
    for p in candidates:
        if (p / ".pvcs").is_dir():
            return p

    return None


if "project_root" not in st.session_state:
    root = _resolve_project_root()
    if root:
        st.session_state.project_root = root


# --- Sidebar navigation ---
st.sidebar.title("\U0001f9ec PlasmidVCS")

if "project_root" in st.session_state:
    from pvcs.config import load_config
    try:
        cfg = load_config(st.session_state.project_root)
        st.sidebar.caption(f"Project: **{cfg.get('project_name', 'Unknown')}**")
    except Exception:
        st.sidebar.caption(f"Project: {st.session_state.project_root}")
else:
    st.sidebar.warning("No project loaded")

st.sidebar.divider()

page = st.sidebar.radio(
    "Navigation",
    [
        "\U0001f4ca Dashboard",
        "\U0001f9ec Construct",
        "\U0001f50d Diff",
        "\U0001f9eb Strains",
        "\U0001f9f1 Parts",
        "\U0001f9ea Primers",
        "\U0001f527 Assembly",
        "\U0001f4e5 Import",
    ],
    label_visibility="collapsed",
)

# --- Page routing ---
if page.startswith("\U0001f4ca"):
    from gui.pages.p01_dashboard import render
    render()
elif page.startswith("\U0001f9ec"):
    from gui.pages.p02_construct import render
    render()
elif page.startswith("\U0001f50d"):
    from gui.pages.p03_diff import render
    render()
elif page.startswith("\U0001f9eb"):
    from gui.pages.p04_strains import render
    render()
elif page.startswith("\U0001f9f1"):
    from gui.pages.p05_parts import render
    render()
elif page.startswith("\U0001f9ea"):
    from gui.pages.p06_primers import render
    render()
elif page.startswith("\U0001f527"):
    from gui.pages.p07_assembly import render
    render()
elif page.startswith("\U0001f4e5"):
    from gui.pages.p08_import import render
    render()

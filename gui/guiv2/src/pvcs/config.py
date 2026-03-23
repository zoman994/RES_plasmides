"""Project configuration management (.pvcs/config.json)."""

from __future__ import annotations

import json
from pathlib import Path

_DEFAULT_CONFIG = {
    "version": "0.1.0",
    "project_name": "",
    "project_id": "",
    "author": "",
    "default_topology": "circular",
    "overlap_length": 22,
    "tm_target": 62.0,
    "salt_mm": 50.0,
    "dna_conc_nm": 250.0,
}


def find_project_root(start: str | Path | None = None) -> Path:
    """Walk up from *start* (default cwd) looking for a .pvcs/ directory."""
    current = Path(start) if start else Path.cwd()
    current = current.resolve()

    for parent in [current, *current.parents]:
        if (parent / ".pvcs").is_dir():
            return parent
    raise FileNotFoundError("Not inside a PlasmidVCS project (no .pvcs/ found)")


def pvcs_dir(project_root: Path | None = None) -> Path:
    """Return the .pvcs directory for the project."""
    root = project_root or find_project_root()
    return root / ".pvcs"


def config_path(project_root: Path | None = None) -> Path:
    return pvcs_dir(project_root) / "config.json"


def objects_dir(project_root: Path | None = None) -> Path:
    d = pvcs_dir(project_root) / "objects"
    d.mkdir(parents=True, exist_ok=True)
    return d


def db_path(project_root: Path | None = None) -> Path:
    return pvcs_dir(project_root) / "database.sqlite"


def constructs_dir(project_root: Path | None = None) -> Path:
    root = project_root or find_project_root()
    d = root / "constructs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def parts_dir(project_root: Path | None = None) -> Path:
    root = project_root or find_project_root()
    d = root / "parts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def strains_dir(project_root: Path | None = None) -> Path:
    root = project_root or find_project_root()
    d = root / "strains"
    d.mkdir(parents=True, exist_ok=True)
    return d


def load_config(project_root: Path | None = None) -> dict:
    """Load project config from .pvcs/config.json."""
    cp = config_path(project_root)
    if cp.exists():
        return json.loads(cp.read_text(encoding="utf-8"))
    return dict(_DEFAULT_CONFIG)


def save_config(cfg: dict, project_root: Path | None = None) -> None:
    """Save project config to .pvcs/config.json."""
    cp = config_path(project_root)
    cp.parent.mkdir(parents=True, exist_ok=True)
    cp.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def init_project(directory: str | Path, name: str, author: str = "") -> Path:
    """Initialize a new PlasmidVCS project.

    Creates .pvcs/, config.json, objects/, constructs/, parts/, strains/.
    Returns the project root path.
    """
    from pvcs.models import _new_id

    root = Path(directory).resolve()
    root.mkdir(parents=True, exist_ok=True)

    pvcs = root / ".pvcs"
    pvcs.mkdir(exist_ok=True)
    (pvcs / "objects").mkdir(exist_ok=True)
    (root / "constructs").mkdir(exist_ok=True)
    (root / "parts").mkdir(exist_ok=True)
    (root / "strains").mkdir(exist_ok=True)

    cfg = dict(_DEFAULT_CONFIG)
    cfg["project_name"] = name
    cfg["project_id"] = _new_id()
    cfg["author"] = author

    save_config(cfg, root)

    return root

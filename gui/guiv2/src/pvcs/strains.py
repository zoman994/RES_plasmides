"""Strain registry — YAML-based, human-readable, git-friendly.

Strains are stored as individual YAML files in strains/ directory.
NOT in SQLite (by design).
"""

from __future__ import annotations

from pathlib import Path

import yaml

from pvcs.config import find_project_root, strains_dir
from pvcs.models import Strain, _now


def _strain_path(strain_id: str, project_root: Path | None = None) -> Path:
    root = project_root or find_project_root()
    return strains_dir(root) / f"{strain_id}.yaml"


def _strain_to_dict(strain: Strain) -> dict:
    """Convert a Strain to a YAML-friendly dict."""
    d: dict = {
        "id": strain.id,
        "name": strain.name,
        "species": strain.species,
    }
    if strain.parent_id:
        d["parent"] = strain.parent_id
    if strain.genotype:
        d["genotype"] = strain.genotype
    if strain.method:
        d["method"] = strain.method
    if strain.construct_id:
        d["created"] = {
            "construct": strain.construct_id,
        }
        if strain.revision_id:
            d["created"]["revision"] = strain.revision_id
    d["verification"] = {
        "confirmed": strain.verified,
    }
    if strain.storage_location:
        d["storage"] = {"location": strain.storage_location}
    if strain.notes:
        d["notes"] = strain.notes
    d["created_at"] = strain.created_at
    return d


def _dict_to_strain(d: dict) -> Strain:
    """Convert a YAML dict to a Strain object."""
    created = d.get("created", {})
    verification = d.get("verification", {})
    storage = d.get("storage", {})

    return Strain(
        id=d["id"],
        name=d.get("name", ""),
        species=d.get("species", ""),
        parent_id=d.get("parent"),
        genotype=d.get("genotype", {}),
        construct_id=created.get("construct"),
        revision_id=created.get("revision"),
        method=d.get("method", "") or created.get("method", ""),
        verified=verification.get("confirmed", False),
        storage_location=storage.get("location", ""),
        notes=d.get("notes", ""),
        created_at=d.get("created_at", ""),
    )


def add_strain(
    strain_id: str,
    name: str,
    species: str = "",
    parent_id: str | None = None,
    construct_id: str | None = None,
    revision_id: str | None = None,
    method: str = "",
    genotype: dict | None = None,
    storage_location: str = "",
    notes: str = "",
    project_root: Path | None = None,
) -> Strain:
    """Register a new strain."""
    strain = Strain(
        id=strain_id,
        name=name,
        species=species,
        parent_id=parent_id,
        genotype=genotype or {},
        construct_id=construct_id,
        revision_id=revision_id,
        method=method,
        storage_location=storage_location,
        notes=notes,
        created_at=_now(),
    )

    path = _strain_path(strain_id, project_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.dump(_strain_to_dict(strain), allow_unicode=True, sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )
    return strain


def get_strain(strain_id: str, project_root: Path | None = None) -> Strain | None:
    """Load a strain by ID."""
    path = _strain_path(strain_id, project_root)
    if not path.exists():
        return None
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return _dict_to_strain(data)


def list_strains(project_root: Path | None = None) -> list[Strain]:
    """List all registered strains."""
    root = project_root or find_project_root()
    sdir = strains_dir(root)
    strains = []
    for f in sorted(sdir.glob("*.yaml")):
        data = yaml.safe_load(f.read_text(encoding="utf-8"))
        if data:
            strains.append(_dict_to_strain(data))
    return strains


def update_strain(strain: Strain, project_root: Path | None = None) -> None:
    """Update an existing strain YAML file."""
    path = _strain_path(strain.id, project_root)
    path.write_text(
        yaml.dump(_strain_to_dict(strain), allow_unicode=True, sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )


def get_strain_tree(strain_id: str, project_root: Path | None = None) -> dict:
    """Build lineage tree going up to root ancestor, then down through all descendants."""
    all_strains = list_strains(project_root)
    strain_map = {s.id: s for s in all_strains}

    # Find root ancestor
    current = strain_map.get(strain_id)
    if not current:
        raise ValueError(f"Strain '{strain_id}' not found")

    root = current
    while root.parent_id and root.parent_id in strain_map:
        root = strain_map[root.parent_id]

    # Build tree from root
    def _build(s: Strain) -> dict:
        children = [st for st in all_strains if st.parent_id == s.id]
        return {
            "strain": s,
            "children": [_build(c) for c in sorted(children, key=lambda x: x.id)],
        }

    return _build(root)

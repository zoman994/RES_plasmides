"""Repository contracts for the supported Python launch surfaces.

These tests intentionally inspect source/configuration rather than importing
optional tooling.  They keep a clean install reproducible and prevent the
Windows launcher from starting two API processes on the same port.
"""

from __future__ import annotations

import ast
import os
import re
import subprocess
import tomllib
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parent.parent


def _pyproject() -> dict:
    with (ROOT / "pyproject.toml").open("rb") as stream:
        return tomllib.load(stream)


def _dependency_names(values: list[str]) -> set[str]:
    return {
        re.split(r"[<>=!~;\s\[]", value, maxsplit=1)[0].lower()
        for value in values
    }


def _imported_names(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            names.update(alias.name for alias in node.names)
    return names


def test_obsolete_optional_dependencies_are_not_advertised() -> None:
    extras = _pyproject()["project"]["optional-dependencies"]
    all_dependencies = {
        name
        for values in extras.values()
        for name in _dependency_names(values)
    }

    assert "tatapov" not in all_dependencies
    assert "snapgene-reader" not in all_dependencies


def test_gui_extra_contains_every_direct_api_runtime_dependency() -> None:
    extras = _pyproject()["project"]["optional-dependencies"]
    gui_dependencies = _dependency_names(extras.get("gui", []))

    assert {
        "fastapi",
        "uvicorn",
        "pydantic",
        "python-multipart",
    } <= gui_dependencies


def test_snapgene_catalog_requirements_include_html_parser() -> None:
    requirements = (ROOT / "scripts" / "requirements.txt").read_text(encoding="utf-8")
    names = _dependency_names([
        line.strip()
        for line in requirements.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ])

    assert "beautifulsoup4" in names


@pytest.mark.parametrize(
    "relative_path",
    [
        "scripts/build_catalog_index.py",
        "scripts/fetch_snapgene_plasmids.py",
    ],
)
def test_catalog_scripts_do_not_import_unused_os(relative_path: str) -> None:
    assert "os" not in _imported_names(ROOT / relative_path)


def test_api_does_not_import_unused_design_entrypoints() -> None:
    imports = _imported_names(ROOT / "gui" / "api" / "server.py")

    assert "design_golden_gate" not in imports
    assert "design_re_primers" not in imports


def test_windows_launcher_starts_exactly_one_backend() -> None:
    launcher = (ROOT / "gui" / "run_designer.bat").read_text(encoding="utf-8")

    assert launcher.count("-m uvicorn server:app") == 1
    assert re.search(r"npm\.cmd\s+run\s+dev:front\b", launcher)
    assert not re.search(r"npm\.cmd\s+run\s+dev\s*(?:\r?\n|$)", launcher)


def test_windows_launcher_check_imports_gui_dependencies() -> None:
    launcher = (ROOT / "gui" / "run_designer.bat").read_text(encoding="utf-8")

    assert "import fastapi, uvicorn, pydantic, multipart" in launcher
    assert 'py -m pip install -e "%~dp0..[gui]"' in launcher


def test_windows_launcher_check_fails_with_actionable_dependency_message(
    tmp_path: Path,
) -> None:
    fake_python = tmp_path / "fake-python.cmd"
    fake_python.write_text(
        '@echo off\nif "%~1"=="--version" exit /b 0\nexit /b 1\n',
        encoding="ascii",
    )
    environment = os.environ.copy()
    environment["PYTHON"] = str(fake_python)

    result = subprocess.run(
        ["cmd.exe", "/d", "/c", str(ROOT / "gui" / "run_designer.bat"), "--check"],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    assert result.returncode == 1
    assert "Missing Python GUI dependencies." in result.stdout
    assert 'py -m pip install -e "' in result.stdout
    assert "..[gui]" in result.stdout


@pytest.mark.parametrize("relative_path", ["README.md", "gui/designer/README.md"])
def test_application_readmes_install_gui_extra_from_repository_root(
    relative_path: str,
) -> None:
    readme = (ROOT / relative_path).read_text(encoding="utf-8")

    assert 'py -m pip install -e ".[gui]"' in readme


def test_api_import_route_is_present_in_openapi_contract() -> None:
    """Characterize the only API route consumed by the React application."""
    from gui.api.server import app

    operation = app.openapi()["paths"]["/api/import"]["post"]
    content = operation["requestBody"]["content"]

    assert "multipart/form-data" in content

"""Tests for the CLI entry point."""

import os
from click.testing import CliRunner
from pvcs.cli import main


def test_cli_init(tmp_path):
    runner = CliRunner()
    result = runner.invoke(main, ["init", "TestProject", "--directory", str(tmp_path)])
    assert result.exit_code == 0
    assert "Initialized" in result.output
    assert (tmp_path / ".pvcs").is_dir()
    assert (tmp_path / ".pvcs" / "config.json").exists()


def test_cli_import_and_log(tmp_path, simple_v1_gb):
    runner = CliRunner()

    # Init
    runner.invoke(main, ["init", "TestProject", "--directory", str(tmp_path)])

    # Change to project dir for import
    old_cwd = os.getcwd()
    os.chdir(str(tmp_path))
    try:
        result = runner.invoke(main, [
            "import", str(simple_v1_gb),
            "--name", "pTEST",
            "--message", "Initial import",
            "--tags", "test,demo",
        ])
        assert result.exit_code == 0, result.output
        assert "Imported" in result.output

        # Log
        result = runner.invoke(main, ["log", "pTEST"])
        assert result.exit_code == 0, result.output
    finally:
        os.chdir(old_cwd)


def test_cli_commit_and_diff(tmp_path, simple_v1_gb, simple_v2_gb):
    runner = CliRunner()
    runner.invoke(main, ["init", "TestProject", "--directory", str(tmp_path)])

    old_cwd = os.getcwd()
    os.chdir(str(tmp_path))
    try:
        runner.invoke(main, ["import", str(simple_v1_gb), "--name", "pTEST"])

        result = runner.invoke(main, [
            "commit", str(simple_v2_gb),
            "--construct", "pTEST",
            "--version", "1.1",
            "--message", "Point mutation",
        ])
        assert result.exit_code == 0, result.output
        assert "Committed" in result.output

        # Diff
        result = runner.invoke(main, ["diff", "pTEST:1.0", "pTEST:1.1"])
        assert result.exit_code == 0, result.output
    finally:
        os.chdir(old_cwd)


def test_cli_variant(tmp_path, simple_v1_gb):
    runner = CliRunner()
    runner.invoke(main, ["init", "TestProject", "--directory", str(tmp_path)])

    old_cwd = os.getcwd()
    os.chdir(str(tmp_path))
    try:
        runner.invoke(main, ["import", str(simple_v1_gb), "--name", "pTEST"])

        result = runner.invoke(main, [
            "variant", "pTEST",
            "--name", "pTEST-mut",
            "--from-version", "1.0",
            "--message", "Mutation variant",
        ])
        assert result.exit_code == 0, result.output
        assert "Created variant" in result.output
    finally:
        os.chdir(old_cwd)


def test_cli_version():
    runner = CliRunner()
    result = runner.invoke(main, ["--version"])
    assert result.exit_code == 0
    assert "0.1.0" in result.output

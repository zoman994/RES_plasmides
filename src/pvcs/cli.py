"""Click CLI entry point for PlasmidVCS (pvcs command)."""

from __future__ import annotations

from pathlib import Path

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.tree import Tree

console = Console()


# ---------------------------------------------------------------------------
# Main group
# ---------------------------------------------------------------------------

@click.group()
@click.version_option(package_name="plasmidvcs")
def main():
    """PlasmidVCS — version control for genetic constructs."""


# ---------------------------------------------------------------------------
# init
# ---------------------------------------------------------------------------

@main.command()
@click.argument("name")
@click.option("--author", "-a", default="", help="Default author name.")
@click.option("--directory", "-d", default=".", help="Project directory.")
def init(name: str, author: str, directory: str):
    """Initialize a new PlasmidVCS project."""
    from pvcs.config import init_project

    root = init_project(directory, name, author)
    console.print(f"[green]Initialized PlasmidVCS project[/] in {root / '.pvcs'}/")


# ---------------------------------------------------------------------------
# import
# ---------------------------------------------------------------------------

@main.command("import")
@click.argument("file", type=click.Path(exists=True))
@click.option("--name", "-n", default=None, help="Construct name.")
@click.option("--message", "-m", default="", help="Import message.")
@click.option("--author", "-a", default=None, help="Author name.")
@click.option("--tags", "-t", default="", help="Comma-separated tags.")
def import_cmd(file: str, name: str | None, message: str, author: str | None, tags: str):
    """Import a GenBank file as a new construct."""
    from pvcs.revision import import_construct
    from pvcs.utils import format_bp

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    construct, revision = import_construct(
        file, name=name, message=message, author=author, tags=tag_list,
    )

    console.print(f"[green]Imported:[/] {construct.name} (v{revision.version})")
    console.print(f"  Length: {format_bp(revision.length)} | {construct.topology.capitalize()}")
    console.print(f"  Features: {len(revision.features)}")
    console.print(f"  Checksum: sha256:{revision.checksum[:12]}...")


# ---------------------------------------------------------------------------
# commit
# ---------------------------------------------------------------------------

@main.command()
@click.argument("file", type=click.Path(exists=True))
@click.option("--construct", "-c", required=True, help="Construct name.")
@click.option("--version", "-v", required=True, help="Version string (e.g. 1.1).")
@click.option("--message", "-m", default="", help="Commit message.")
@click.option("--author", "-a", default=None, help="Author name.")
def commit(file: str, construct: str, version: str, message: str, author: str | None):
    """Commit a new revision of an existing construct."""
    from pvcs.revision import commit_revision

    revision, diff_result = commit_revision(
        file, construct, version, message=message, author=author,
    )

    console.print(f"[green]Committed:[/] {construct} v{revision.version}")

    if diff_result and diff_result.changes:
        console.print(f"  Changes from previous:")
        for i, ch in enumerate(diff_result.changes, 1):
            console.print(f"    {i}. {ch.type.upper()}: {ch.description}")


# ---------------------------------------------------------------------------
# variant
# ---------------------------------------------------------------------------

@main.command()
@click.argument("construct")
@click.option("--name", "-n", required=True, help="Variant name.")
@click.option("--from-version", "-f", required=True, help="Branch from this version.")
@click.option("--message", "-m", default="", help="Description.")
def variant(construct: str, name: str, from_version: str, message: str):
    """Create a variant (branch) of a construct."""
    from pvcs.revision import create_variant

    v = create_variant(construct, name, from_version, message)
    console.print(f"[green]Created variant:[/] {v.name}")


# ---------------------------------------------------------------------------
# diff
# ---------------------------------------------------------------------------

@main.command()
@click.argument("spec_a")
@click.argument("spec_b")
def diff(spec_a: str, spec_b: str):
    """Semantic diff between two revision specs (construct:version)."""
    from pvcs.revision import diff_revisions
    from pvcs.utils import format_bp

    result = diff_revisions(spec_a, spec_b)

    bp_delta = 0
    if result.changes:
        for c in result.changes:
            bp_delta += c.length_b - c.length_a

    bp_str = f"+{bp_delta}" if bp_delta >= 0 else str(bp_delta)
    n = len(result.changes)

    header = (
        f"CONSTRUCT: {result.construct_name}\n"
        f"v{result.version_a} → v{result.version_b}  |  "
        f"{n} change{'s' if n != 1 else ''}  |  {bp_str} bp"
    )
    console.print(Panel(header, title="Semantic Diff", border_style="blue"))

    if not result.changes:
        console.print("[green]  No changes — sequences are identical.[/]")
        return

    for i, ch in enumerate(result.changes, 1):
        type_color = {
            "point_mutation": "yellow",
            "insertion": "green",
            "deletion": "red",
            "replacement": "magenta",
        }.get(ch.type, "white")

        console.print(f"\n  {i}. [{type_color}]{ch.type.upper().replace('_', ' ')}[/] pos {ch.position_a}")
        if ch.affected_feature:
            console.print(f"     Feature: {ch.affected_feature}")
        console.print(f"     {ch.description}")

    console.print(f"\n  [dim]{result.summary}[/]")


# ---------------------------------------------------------------------------
# log
# ---------------------------------------------------------------------------

@main.command()
@click.argument("construct")
def log(construct: str):
    """Show revision history of a construct."""
    from pvcs.revision import get_log
    from pvcs.utils import format_bp

    data = get_log(construct)
    c = data["construct"]
    revs = data["revisions"]

    latest = revs[-1] if revs else None
    header = f"{c.name}"
    if latest:
        header += f" ({format_bp(latest.length)}, {c.topology})"

    tree = Tree(f"[bold]{header}[/]")
    for r in revs:
        tree.add(f"v{r.version}  {r.created_at[:10]}  {r.author}  {r.message}")

    for v in data["variants"]:
        branch = tree.add(f"[cyan]variant: {v.name}[/]")
        # We don't fetch variant revisions here for brevity
        branch.add(f"[dim]{v.description}[/]")

    console.print(tree)


# ---------------------------------------------------------------------------
# tree
# ---------------------------------------------------------------------------

@main.command()
@click.argument("construct")
def tree(construct: str):
    """Show variant tree of a construct."""
    from pvcs.revision import get_tree

    data = get_tree(construct)

    def _render(node: dict, parent_tree):
        c = node["construct"]
        branch = parent_tree.add(f"[bold]{c.name}[/]")
        for r in node["revisions"]:
            branch.add(f"v{r.version} — {r.message}")
        for v in node["variants"]:
            _render(v, branch)

    root_tree = Tree(f"[bold]{data['construct'].name}[/]")
    for r in data["revisions"]:
        root_tree.add(f"v{r.version} — {r.message}")
    for v in data["variants"]:
        _render(v, root_tree)

    console.print(root_tree)


# ---------------------------------------------------------------------------
# tag
# ---------------------------------------------------------------------------

@main.command()
@click.argument("spec")  # construct:version
@click.argument("milestone")
@click.option("--description", "-d", default="", help="Tag description.")
def tag(spec: str, milestone: str, description: str):
    """Tag a revision with a milestone name."""
    from pvcs.revision import tag_revision

    if ":" not in spec:
        raise click.BadParameter("Spec must be 'construct:version'")
    name, version = spec.rsplit(":", 1)

    m = tag_revision(name, version, milestone, description)
    console.print(f"[green]Tagged[/] {name}:{version} as '{m.name}'")


# ---------------------------------------------------------------------------
# part
# ---------------------------------------------------------------------------

@main.group()
def part():
    """Part library commands."""


@part.command("add")
@click.argument("file", type=click.Path(exists=True))
@click.option("--name", "-n", required=True, help="Part name.")
@click.option("--type", "part_type", required=True, help="Part type (promoter, terminator, CDS, marker, other).")
@click.option("--organism", "-o", default="", help="Source organism.")
def part_add(file: str, name: str, part_type: str, organism: str):
    """Add a part to the library."""
    from pvcs.parts import add_part

    p = add_part(file, name, part_type, organism=organism)
    console.print(f"[green]Added part:[/] {p.name} ({p.type}, {len(p.sequence)} bp)")


@part.command("list")
@click.option("--type", "part_type", default=None, help="Filter by type.")
def part_list(part_type: str | None):
    """List all parts."""
    from pvcs.parts import list_parts

    parts = list_parts(part_type)
    if not parts:
        console.print("[dim]No parts in library.[/]")
        return

    table = Table(title="Part Library")
    table.add_column("Name", style="bold")
    table.add_column("Type")
    table.add_column("Length")
    table.add_column("Organism")

    for p in parts:
        table.add_row(p.name, p.type, f"{len(p.sequence)} bp", p.organism)

    console.print(table)


# ---------------------------------------------------------------------------
# strain
# ---------------------------------------------------------------------------

@main.group()
def strain():
    """Strain registry commands."""


@strain.command("add")
@click.argument("strain_id")
@click.option("--name", "-n", required=True, help="Strain full name.")
@click.option("--parent", "-p", default=None, help="Parent strain ID.")
@click.option("--construct", "-c", default=None, help="Construct used (name:version).")
@click.option("--method", "-m", default="", help="Transformation method.")
@click.option("--genotype", "-g", default="", help="Genotype string.")
def strain_add(strain_id: str, name: str, parent: str | None, construct: str | None,
               method: str, genotype: str):
    """Register a new strain."""
    from pvcs.strains import add_strain

    construct_id = None
    revision_id = None
    if construct and ":" in construct:
        construct_id, revision_id = construct.rsplit(":", 1)

    genotype_dict = {"description": genotype} if genotype else {}

    s = add_strain(
        strain_id, name, parent_id=parent,
        construct_id=construct_id, revision_id=revision_id,
        method=method, genotype=genotype_dict,
    )
    console.print(f"[green]Registered strain:[/] {s.id} — {s.name}")


@strain.command("tree")
@click.argument("strain_id")
def strain_tree_cmd(strain_id: str):
    """Show strain lineage tree."""
    from pvcs.strains import get_strain_tree

    data = get_strain_tree(strain_id)

    def _render(node: dict, parent_tree):
        s = node["strain"]
        label = f"{s.id} {s.name}"
        if s.construct_id:
            label += f" ← {s.construct_id}"
        branch = parent_tree.add(label)
        for child in node["children"]:
            _render(child, branch)

    s = data["strain"]
    root_tree = Tree(f"[bold]{s.id} {s.name}[/]")
    for child in data["children"]:
        _render(child, root_tree)

    console.print(root_tree)


@strain.command("list")
def strain_list():
    """List all strains."""
    from pvcs.strains import list_strains

    strains = list_strains()
    if not strains:
        console.print("[dim]No strains registered.[/]")
        return

    table = Table(title="Strain Registry")
    table.add_column("ID", style="bold")
    table.add_column("Name")
    table.add_column("Parent")
    table.add_column("Verified")

    for s in strains:
        table.add_row(s.id, s.name, s.parent_id or "—", "✓" if s.verified else "—")

    console.print(table)


# ---------------------------------------------------------------------------
# search
# ---------------------------------------------------------------------------

@main.command()
@click.argument("query")
@click.option("--feature", is_flag=True, help="Search features only.")
@click.option("--re-site", is_flag=True, help="Search restriction enzyme sites.")
def search(query: str, feature: bool, re_site: bool):
    """Search across all constructs."""
    from pvcs.search import search_features, search_re_sites, search_sequence

    if re_site:
        results = search_re_sites(query)
        if not results:
            console.print(f"[dim]No {query} sites found.[/]")
            return
        table = Table(title=f"RE Sites: {query}")
        table.add_column("Construct")
        table.add_column("Version")
        table.add_column("Enzyme")
        table.add_column("Position")
        table.add_column("Strand")
        for r in results:
            table.add_row(r["construct_name"], r["version"],
                          r["enzyme"], str(r["position"]), r["strand"])
        console.print(table)

    elif feature:
        results = search_features(query)
        if not results:
            console.print(f"[dim]No features matching '{query}'.[/]")
            return
        table = Table(title=f"Features: {query}")
        table.add_column("Construct")
        table.add_column("Version")
        table.add_column("Type")
        table.add_column("Name")
        table.add_column("Position")
        for r in results:
            f = r["feature"]
            table.add_row(r["construct_name"], r["version"],
                          f.type, f.name, f"{f.start}..{f.end}")
        console.print(table)

    else:
        # Try as RE enzyme name first, then as sequence, then as feature
        from pvcs.utils import COMMON_RE_SITES
        if query in COMMON_RE_SITES:
            results = search_re_sites(query)
            if results:
                site_seq = COMMON_RE_SITES[query]
                console.print(f"[bold]Found {query} ({site_seq}) in {len(set(r['construct_name'] for r in results))} construct(s):[/]")
                for r in results:
                    console.print(f"  {r['construct_name']} v{r['version']}  pos {r['position']} ({r['strand']})")
                return

        # Search features
        feat_results = search_features(query)
        if feat_results:
            console.print(f"[bold]Features matching '{query}':[/]")
            for r in feat_results:
                f = r["feature"]
                console.print(f"  {r['construct_name']} v{r['version']}: {f.type} {f.name} ({f.start}..{f.end})")
            return

        # Search sequence
        seq_results = search_sequence(query)
        if seq_results:
            console.print(f"[bold]Sequence matches:[/]")
            for r in seq_results:
                console.print(f"  {r['construct_name']} v{r['version']} pos {r['position']} ({r['strand']})")
            return

        console.print(f"[dim]No results for '{query}'.[/]")


# ---------------------------------------------------------------------------
# export
# ---------------------------------------------------------------------------

@main.command()
@click.argument("construct")
@click.option("--format", "fmt", default="gb", type=click.Choice(["gb", "html", "yaml"]))
@click.option("--output", "-o", default=None, help="Output file path.")
@click.option("--version", "-v", default=None, help="Specific version to export.")
def export(construct: str, fmt: str, output: str | None, version: str | None):
    """Export a construct."""
    from pvcs.export import export_genbank, export_html, export_yaml

    if output is None:
        output = f"{construct}.{fmt}" if fmt != "yaml" else f"{construct}.yaml"

    if fmt == "gb":
        path = export_genbank(construct, output, version)
    elif fmt == "html":
        path = export_html(construct, output)
    elif fmt == "yaml":
        path = export_yaml(construct, output, version)

    console.print(f"[green]Exported:[/] {path}")


# ---------------------------------------------------------------------------
# Assembly commands
# ---------------------------------------------------------------------------

@main.group("overlap")
def overlap_group():
    """Overlap design commands."""


@overlap_group.command("design")
@click.argument("file", type=click.Path(exists=True))
@click.option("--split", "-s", required=True, help="Comma-separated split positions (bp).")
@click.option("--overlap-length", "-l", default=22, help="Overlap length (bp).")
@click.option("--tm-target", "-t", default=62.0, help="Target Tm for overlaps.")
def overlap_design(file: str, split: str, overlap_length: int, tm_target: float):
    """Design overlaps for assembly."""
    from pvcs.overlap import design_overlaps
    from pvcs.parser import parse_genbank

    sequence, features, metadata = parse_genbank(file)
    split_points = [int(x.strip()) for x in split.split(",")]

    result = design_overlaps(
        sequence, split_points,
        overlap_length=overlap_length,
        tm_target=tm_target,
    )

    console.print(Panel(f"Fragments: {len(result.fragments)}  |  Overlaps: {len(result.overlap_zones)}", title="Overlap Design"))

    # Fragments table
    frag_table = Table(title="Fragments")
    frag_table.add_column("#")
    frag_table.add_column("Start")
    frag_table.add_column("End")
    frag_table.add_column("Length")
    for f in result.fragments:
        frag_table.add_row(str(f.order), str(f.start), str(f.end),
                           f"{f.end - f.start + 1} bp")
    console.print(frag_table)

    # Overlap zones
    ol_table = Table(title="Overlap Zones")
    ol_table.add_column("Position")
    ol_table.add_column("Sequence")
    ol_table.add_column("Length")
    ol_table.add_column("Tm")
    ol_table.add_column("GC%")
    for z in result.overlap_zones:
        ol_table.add_row(str(z.position_in_construct), z.sequence,
                         f"{z.length} bp", f"{z.tm}°C", f"{z.gc_percent}%")
    console.print(ol_table)

    # Primers
    if result.primers:
        pr_table = Table(title="Primers")
        pr_table.add_column("Name")
        pr_table.add_column("Sequence")
        pr_table.add_column("Tm bind")
        pr_table.add_column("Length")
        for p in result.primers:
            pr_table.add_row(p.name, p.sequence, f"{p.tm_binding}°C", str(p.length))
        console.print(pr_table)

    # Warnings
    if result.warnings:
        console.print("[yellow]Warnings:[/]")
        for w in result.warnings:
            console.print(f"  ⚠ {w}")


@main.command()
@click.argument("spec")
@click.option("--swap-fragment", "-f", required=True, type=int, help="Fragment number to swap.")
@click.option("--new-source", "-s", required=True, type=click.Path(exists=True), help="New fragment GenBank file.")
@click.option("--output", "-o", required=True, help="Output GenBank file.")
def reassemble(spec: str, swap_fragment: int, new_source: str, output: str):
    """Swap a fragment in an existing assembly."""
    from pvcs.assembly import reassemble as do_reassemble

    if ":" not in spec:
        raise click.BadParameter("Spec must be 'construct:version'")
    name, version = spec.rsplit(":", 1)

    result = do_reassemble(name, version, swap_fragment, new_source, output)
    console.print(f"[green]Reassembled:[/] swapped fragment {swap_fragment}")
    console.print(f"  New length: {result['new_sequence_length']} bp")
    console.print(f"  Output: {result['output_file']}")


# ---------------------------------------------------------------------------
# Primer commands
# ---------------------------------------------------------------------------

@main.group()
def primer():
    """Primer registry commands."""


@primer.command("list")
def primer_list():
    """List all primers."""
    from pvcs.primers import list_primers

    primers = list_primers()
    if not primers:
        console.print("[dim]No primers registered.[/]")
        return

    table = Table(title="Primer Registry")
    table.add_column("Name", style="bold")
    table.add_column("Sequence")
    table.add_column("Tm bind")
    table.add_column("Length")
    table.add_column("Direction")
    table.add_column("Used in")

    for p in primers:
        table.add_row(p.name, p.sequence[:30] + ("..." if len(p.sequence) > 30 else ""),
                      f"{p.tm_binding}°C", f"{p.length} nt", p.direction,
                      str(len(p.used_in)))
    console.print(table)


@primer.command("show")
@click.argument("name")
def primer_show(name: str):
    """Show primer details."""
    from pvcs.primers import get_primer

    p = get_primer(name)
    if not p:
        console.print(f"[red]Primer '{name}' not found.[/]")
        return

    console.print(Panel(
        f"[bold]{p.name}[/]\n"
        f"Sequence:  5'-{p.sequence}-3'\n"
        f"Binding:   {p.binding_sequence}\n"
        f"Tail:      {p.tail_sequence or '—'} ({p.tail_purpose or '—'})\n"
        f"Tm bind:   {p.tm_binding}°C\n"
        f"Tm full:   {p.tm_full}°C\n"
        f"GC:        {p.gc_percent}%\n"
        f"Length:    {p.length} nt\n"
        f"Direction: {p.direction}\n"
        f"Vendor:    {p.vendor or '—'}\n"
        f"Used in:   {len(p.used_in)} operation(s)",
        title="Primer Detail",
    ))


@primer.command("find")
@click.option("--binds-to", required=True, help="Part name to search primers for.")
def primer_find(binds_to: str):
    """Find primers binding to a part."""
    from pvcs.primers import find_primers_for_part

    matches = find_primers_for_part(binds_to)
    if not matches:
        console.print(f"[dim]No primers found binding to '{binds_to}'.[/]")
        return
    for p in matches:
        console.print(f"  {p.name} — {p.sequence[:30]}... (Tm={p.tm_binding}°C)")


@primer.command("check-reuse")
@click.argument("spec")
def primer_check_reuse(spec: str):
    """Check if existing primers can be reused for a construct."""
    from pvcs.primers import check_primer_reuse

    if ":" in spec:
        name, version = spec.rsplit(":", 1)
        matches = check_primer_reuse(name, version)
    else:
        matches = check_primer_reuse(spec)

    if not matches:
        console.print("[dim]No reusable primers found.[/]")
        return

    console.print(f"[bold]Found {len(matches)} reusable primer(s):[/]")
    for m in matches:
        p = m["primer"]
        console.print(f"  {p.name} — pos {m['match_position']} ({m['strand']})")


# ---------------------------------------------------------------------------
# Template commands
# ---------------------------------------------------------------------------

@main.group()
def template():
    """Assembly template commands."""


@template.command("create")
@click.argument("name")
@click.option("--method", "-m", required=True, help="Assembly method.")
@click.option("--slot", "-s", multiple=True, help="Slot spec: 'Name:fixed|swappable[:PartID]'.")
@click.option("--overlap-length", "-l", default=22, help="Default overlap length.")
def template_create(name: str, method: str, slot: tuple[str, ...], overlap_length: int):
    """Create an assembly template."""
    from pvcs.assembly import create_template

    slots = []
    for s in slot:
        parts = s.split(":")
        slot_name = parts[0]
        fixed = parts[1] == "fixed" if len(parts) > 1 else False
        part_id = parts[2] if len(parts) > 2 else None
        slots.append({
            "name": slot_name,
            "type_constraint": slot_name.lower(),
            "fixed": fixed,
            "default_part_id": part_id,
        })

    t = create_template(name, method, slots, overlap_length=overlap_length)
    console.print(f"[green]Created template:[/] {t.name} ({len(t.slots)} slots)")


@template.command("list")
def template_list():
    """List assembly templates."""
    from pvcs.assembly import list_templates

    templates = list_templates()
    if not templates:
        console.print("[dim]No templates.[/]")
        return
    for t in templates:
        slots_str = " → ".join(s.name for s in t.slots)
        console.print(f"  {t.name} [{t.method}]: {slots_str}")


@template.command("use")
@click.argument("name")
@click.option("--fill", "-f", multiple=True, help="Fill slot: 'SlotName=file.gb'.")
@click.option("--output", "-o", required=True, help="Output GenBank file.")
def template_use(name: str, fill: tuple[str, ...], output: str):
    """Use a template to assemble a construct."""
    from pvcs.assembly import use_template

    fill_dict = {}
    for f in fill:
        key, val = f.split("=", 1)
        fill_dict[key] = val

    result = use_template(name, fill_dict, output)
    console.print(f"[green]Assembled:[/] {result['sequence_length']} bp → {result['output_file']}")


# ---------------------------------------------------------------------------
# Assembly pipeline status
# ---------------------------------------------------------------------------

@main.group("assembly")
def assembly_group():
    """Assembly pipeline commands."""


@assembly_group.command("status")
def assembly_status():
    """Show assembly pipeline status."""
    from pvcs.assembly import list_assemblies

    assemblies = list_assemblies()
    if not assemblies:
        console.print("[dim]No active assemblies.[/]")
        return

    table = Table(title="Assembly Pipeline")
    table.add_column("Construct", style="bold")
    table.add_column("Method")
    table.add_column("Fragments")
    table.add_column("Status")
    table.add_column("Notes")

    status_colors = {
        "design": "blue", "primers_ordered": "cyan",
        "pcr": "yellow", "assembly": "yellow",
        "transform": "magenta", "screen": "magenta",
        "verified": "green",
    }

    for a in assemblies:
        color = status_colors.get(a["status"], "white")
        table.add_row(
            a["construct_name"],
            a["method"],
            str(a["fragments_count"]),
            f"[{color}]{a['status']}[/]",
            a["notes"][:40] if a["notes"] else "",
        )
    console.print(table)


@assembly_group.command("set")
@click.argument("construct")
@click.option("--status", "-s", required=True, help="New status.")
@click.option("--note", "-n", default=None, help="Note.")
def assembly_set(construct: str, status: str, note: str | None):
    """Update assembly status for a construct."""
    from pvcs.assembly import update_status

    update_status(construct, status, note)
    console.print(f"[green]Updated:[/] {construct} → {status}")


if __name__ == "__main__":
    main()

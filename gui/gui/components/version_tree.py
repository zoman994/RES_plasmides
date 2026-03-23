"""Graphviz version/variant tree renderer."""

from __future__ import annotations

from pvcs.models import Construct, Revision
from pvcs import database as db


def render_version_tree(
    construct: Construct,
    revisions: list[Revision],
    variants: list[Construct],
    conn,
) -> str:
    """Return graphviz DOT string for the version/variant tree."""
    lines = [
        'digraph G {',
        '  rankdir=TB;',
        '  node [shape=box, style="rounded,filled", fontname="Arial", fontsize=10, fillcolor="#E8F4FD"];',
        '  edge [color="#999", arrowsize=0.7];',
        f'  labelloc=t; label="{construct.name}"; fontsize=14; fontname="Arial";',
    ]

    # Main revision chain
    prev_id = None
    for rev in revisions:
        label = f"v{rev.version}\\n{rev.created_at[:10]}\\n{rev.message[:30]}"
        node_id = f'rev_{rev.id[:8]}'
        lines.append(f'  {node_id} [label="{label}", fillcolor="#D5E8D4"];')
        if prev_id:
            lines.append(f'  {prev_id} -> {node_id};')
        prev_id = node_id

    # Variant branches
    variant_colors = ["#DAE8FC", "#FFF2CC", "#F8CECC", "#E1D5E7", "#D5E8D4"]
    for i, variant in enumerate(variants):
        color = variant_colors[i % len(variant_colors)]
        var_revisions = db.list_revisions(conn, variant.id)

        # Find branch point
        if var_revisions and var_revisions[0].parent_revision_id:
            parent_node = f'rev_{var_revisions[0].parent_revision_id[:8]}'
        elif revisions:
            parent_node = f'rev_{revisions[-1].id[:8]}'
        else:
            parent_node = None

        var_prev = None
        for j, rev in enumerate(var_revisions):
            label = f"{variant.name}\\nv{rev.version}\\n{rev.message[:25]}"
            node_id = f'var_{variant.id[:8]}_{rev.id[:8]}'
            lines.append(f'  {node_id} [label="{label}", fillcolor="{color}"];')

            if j == 0 and parent_node:
                lines.append(f'  {parent_node} -> {node_id} [style=dashed, label="variant"];')
            elif var_prev:
                lines.append(f'  {var_prev} -> {node_id};')
            var_prev = node_id

    lines.append('}')
    return '\n'.join(lines)


def render_strain_tree_dot(tree: dict) -> str:
    """Render a strain lineage tree as graphviz DOT string."""
    lines = [
        'digraph StrainTree {',
        '  rankdir=TB;',
        '  node [shape=box, style="rounded,filled", fontname="Arial", fontsize=10, fillcolor="#E8F4FD"];',
        '  edge [color="#666", arrowsize=0.7];',
    ]

    def _add_node(node: dict):
        s = node["strain"]
        verified = " [check]" if s.verified else ""
        label = f"{s.id}\\n{s.name[:30]}{verified}"
        color = "#D5E8D4" if s.verified else "#FFF2CC"
        lines.append(f'  "{s.id}" [label="{label}", fillcolor="{color}"];')
        for child in node.get("children", []):
            cs = child["strain"]
            edge_label = cs.method[:15] if cs.method else ""
            lines.append(f'  "{s.id}" -> "{cs.id}" [label="{edge_label}"];')
            _add_node(child)

    _add_node(tree)
    lines.append('}')
    return '\n'.join(lines)

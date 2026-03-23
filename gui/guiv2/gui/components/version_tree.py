"""Version / variant tree via graphviz DOT."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pvcs.models import Construct, Revision


def render_version_dot(
    construct_name: str,
    revisions: list[Revision],
    variants: list[Construct] | None = None,
) -> str:
    """Return a graphviz DOT string for the version tree."""
    lines = [
        "digraph G {",
        '  rankdir=TB;',
        '  node [shape=box, style="rounded,filled", fillcolor="#E8F4FD", '
        'fontname="Helvetica", fontsize=10];',
        '  edge [color="#999"];',
    ]

    # Main construct revisions
    prev_id = None
    for rev in revisions:
        label = f"v{rev.version}\\n{rev.created_at[:10]}\\n{rev.message[:25]}"
        node_id = f"r_{rev.id[:8]}"
        lines.append(f'  {node_id} [label="{label}"];')
        if prev_id:
            lines.append(f"  {prev_id} -> {node_id};")
        prev_id = node_id

    # Variants as branches
    if variants:
        colors = ["#FFF3E0", "#E8F5E9", "#FCE4EC", "#E3F2FD", "#FFF8E1"]
        for i, var in enumerate(variants):
            color = colors[i % len(colors)]
            var_id = f"v_{var.id[:8]}"
            label = f"variant:\\n{var.name}"
            lines.append(
                f'  {var_id} [label="{label}", fillcolor="{color}", '
                f'style="rounded,filled,bold"];'
            )
            # Connect to last main revision (simplification)
            if prev_id:
                lines.append(f'  {prev_id} -> {var_id} [style=dashed];')

    lines.append("}")
    return "\n".join(lines)

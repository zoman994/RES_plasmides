/**
 * StitchMarkers — визуализация концов junction'а зависит от kind.
 *  - overlap (Gibson) — overlap-zone: small parallelogram между концами.
 *  - golden_gate — 4-nt overhang shown as ▶◀ pair, green-tinted.
 *  - re_ligation — sticky-end shown as zigzag steps.
 *  - kld — phosphate dots (small circles) на каждой стороне.
 *  - ligation (blunt) — vertical bars (||).
 *  - blunt / preformed / auto — no markers (clean line).
 *
 * Markers рисуются на каждой стороне path рядом с blocks (не в midpoint).
 *
 * Extracted from CanvasLayoutView.jsx (size-budget decomposition,
 * 2026-05-16) — pure presentational, props-only, behavior unchanged.
 */
export default function StitchMarkers({ kind, x1, y1, x2, y2, stroke }) {
  if (kind === 'auto' || kind === 'blunt' || kind === 'preformed') return null;

  const dx = x2 - x1;
  // Marker spots: 14px from each block edge along the path.
  const tA = 0.18;
  const tB = 0.82;
  const ax = x1 + dx * tA;
  const ay = y1 + (y2 - y1) * tA;
  const bx = x1 + dx * tB;
  const by = y1 + (y2 - y1) * tB;

  if (kind === 'overlap') {
    // Overlap zone — parallelogram bridging two side-points.
    return (
      <polygon
        data-testid="stitch-overlap"
        points={`${ax},${ay - 4} ${bx},${by - 4} ${bx},${by + 4} ${ax},${ay + 4}`}
        fill={stroke}
        opacity={0.18}
      />
    );
  }
  if (kind === 'golden_gate') {
    // Two arrows pointing toward each other (4-nt overhang).
    return (
      <g data-testid="stitch-gg">
        <polygon
          points={`${ax - 6},${ay - 5} ${ax + 4},${ay} ${ax - 6},${ay + 5}`}
          fill={stroke}
        />
        <polygon
          points={`${bx + 6},${by - 5} ${bx - 4},${by} ${bx + 6},${by + 5}`}
          fill={stroke}
        />
      </g>
    );
  }
  if (kind === 're_ligation' || kind === 'sticky_end') {
    // Zigzag steps — sticky end illustration.
    return (
      <g data-testid="stitch-re" stroke={stroke} strokeWidth={1.6} fill="none">
        <polyline points={`${ax - 5},${ay - 4} ${ax},${ay - 4} ${ax},${ay + 4} ${ax + 5},${ay + 4}`} />
        <polyline points={`${bx - 5},${by - 4} ${bx},${by - 4} ${bx},${by + 4} ${bx + 5},${by + 4}`} />
      </g>
    );
  }
  if (kind === 'kld') {
    // Phosphate dots on each side.
    return (
      <g data-testid="stitch-kld" fill={stroke}>
        <circle cx={ax} cy={ay} r={3.5} />
        <circle cx={bx} cy={by} r={3.5} />
      </g>
    );
  }
  if (kind === 'ligation') {
    // Blunt ligation — vertical bars on each side (||).
    return (
      <g data-testid="stitch-ligation" stroke={stroke} strokeWidth={2.5} strokeLinecap="round">
        <line x1={ax - 1} y1={ay - 6} x2={ax - 1} y2={ay + 6} />
        <line x1={ax + 2} y1={ay - 6} x2={ax + 2} y2={ay + 6} />
        <line x1={bx - 2} y1={by - 6} x2={bx - 2} y2={by + 6} />
        <line x1={bx + 1} y1={by - 6} x2={bx + 1} y2={by + 6} />
      </g>
    );
  }
  return null;
}

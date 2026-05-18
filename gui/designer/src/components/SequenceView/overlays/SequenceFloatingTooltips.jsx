/**
 * SequenceFloatingTooltips — the two fixed-position tooltips painted
 * over the viewer: the annotation drag readout and the V76 near-cursor
 * selection-Tm. Extracted verbatim from SequenceView/index.jsx
 * (size-budget decomposition, 2026-05-16) — markup/behavior unchanged.
 */
export default function SequenceFloatingTooltips({ dragTooltip, selectionTm, tmPt }) {
  return (
    <>
      {dragTooltip ? (
        <div
          data-testid="sequence-view-drag-tooltip"
          style={{
            position: "fixed",
            left: dragTooltip.x,
            top: dragTooltip.y,
            background: "var(--surface-1, #fff)",
            border: "0.5px solid var(--accent-500, #f97316)",
            borderRadius: "var(--radius-sm, 3px)",
            padding: "2px 6px",
            fontSize: 10,
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--text-primary, #111)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >{dragTooltip.label}</div>
      ) : null}
      {selectionTm ? (
        <div
          data-testid="sequence-view-tm-tooltip"
          style={{
            position: "fixed",
            left: tmPt.x + 14,
            top: tmPt.y + 14,
            background: "var(--surface-1, #fff)",
            border: "0.5px solid var(--accent-500, #f97316)",
            borderRadius: "var(--radius-sm, 3px)",
            padding: "2px 6px",
            fontSize: 10,
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--text-primary, #111)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
            pointerEvents: "none",
            zIndex: 50,
            whiteSpace: "nowrap",
          }}
        >{selectionTm.tm != null
            ? `Tm ≈ ${selectionTm.tm}°C · ${selectionTm.len} bp`
            : `${selectionTm.len} bp`}</div>
      ) : null}
    </>
  );
}

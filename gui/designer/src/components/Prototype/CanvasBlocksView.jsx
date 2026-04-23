/**
 * Sprint UX-1 prototype — K2 Canvas Blocks view (fork).
 *
 * Fork of DesignCanvas Blocks branch: render-only, no Zustand, no drag-and-drop,
 * no context menus. Reason: PartBlock.jsx imports `getFragColor`/`FEATURE_COLORS`
 * directly from theme.js (lines 3, 64, 323) — can't be overridden via prop or
 * React context without editing PartBlock.jsx, and PartBlock.jsx edits are OUT
 * of scope per spec §3 (25.85 KB, also touches DesignCanvas.jsx chain).
 *
 * Each fixture annotation is rendered as one "fragment block" — rounded card
 * with palette-sourced gradient background, SBOL glyph, name, size. Junction
 * separators are pure visual beads, no overlap/GG semantics.
 */
import { SBOLIcon } from '../../sbol-glyphs';
import { featureColor, FEATURE_STROKE } from '../../feature-palette';
import { fixture } from './fixture';

function blockWidth(bp) {
  if (!bp || bp <= 20) return 80;
  if (bp >= 1000) return 200;
  const frac = (Math.log(bp) - Math.log(20)) / (Math.log(1000) - Math.log(20));
  return Math.round(80 + frac * 120);
}

function BlockJunction() {
  return (
    <div
      aria-hidden
      style={{
        width: 18, height: 28, flex: 'none',
        borderLeft: `1px solid ${FEATURE_STROKE}`,
        borderRight: `1px solid ${FEATURE_STROKE}`,
        background: 'transparent',
        alignSelf: 'center',
      }}
    />
  );
}

function FragmentCard({ ann }) {
  const color = featureColor(ann.type, ann.name);
  const bp = ann.end - ann.start;
  const width = blockWidth(bp);
  const flipped = ann.strand === -1;

  return (
    <div
      data-proto-block
      data-block-color={color}
      data-block-type={ann.type}
      data-block-name={ann.name}
      style={{
        width,
        minWidth: 80,
        padding: '10px 12px',
        borderRadius: 6,
        background: `linear-gradient(135deg, ${color} 0%, ${color}CC 100%)`,
        border: `1px solid ${FEATURE_STROKE}`,
        borderLeft: `4px solid ${FEATURE_STROKE}`,
        color: FEATURE_STROKE,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        boxShadow: '0 1px 2px rgba(58,47,31,0.08)',
      }}
      title={`${ann.name} — ${ann.type}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ transform: flipped ? 'scaleX(-1)' : 'none', display: 'inline-flex' }}>
          <SBOLIcon type={ann.type} size={14} color={FEATURE_STROKE} />
        </span>
        <span style={{
          fontFamily: "'Geist', system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 12,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {ann.name}
        </span>
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10,
        opacity: 0.7,
      }}>
        {bp} bp · {ann.type}
      </div>
    </div>
  );
}

export default function CanvasBlocksView({ data = fixture }) {
  const annotations = data.annotations || [];
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      padding: '12px 4px',
      overflowX: 'auto',
      flex: 1,
    }}>
      {annotations.map((a, i) => (
        <div key={a.id || i} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <BlockJunction />}
          <FragmentCard ann={a} />
        </div>
      ))}
    </div>
  );
}

/**
 * Sprint UX-1 prototype — K3 PlasmidViewer wrapper.
 *
 * Wrapper, not fork. Full PlasmidViewer is a fixed-position fullscreen modal
 * (line 153: `fixed inset-0 z-50`) — doesn't fit in the prototype's inline row
 * panel. Its sequence pane also uses legacy theme.js FEATURE_COLORS (line 14,
 * 259, 274, 307). The palette-relevant surface is the circular map:
 * `PlasmidMap.jsx` already resolves sub-arc fill via `featureColor(r.type,
 * r.name)` from feature-palette.js V2 (line 12, 263), stroke/label via
 * `FEATURE_STROKE` — Sprint Map-WS-1-fix delivered this and passed visual
 * acceptance 21.04.2026.
 *
 * Strategy: pass fixture as a single whole-plasmid fragment to PlasmidMap.
 * Zero PlasmidViewer edits, zero PlasmidMap edits. Outer frame arc still uses
 * legacy getFragColor (theme.js) — that's the hollow ring, not fill — noted in
 * K3 report as acceptable gap for prototype, covered in phase 2 UX-1a.
 */
import PlasmidMap from '../PlasmidMap';
import { fixture } from './fixture';

export default function PlasmidViewerWrapper({ data = fixture }) {
  const fragments = [{
    id: data.id,
    name: data.name,
    type: 'misc_feature',
    length: data.length,
    sequence: data.sequence,
    annotations: data.annotations,
  }];

  return (
    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <PlasmidMap
        fragments={fragments}
        constructName={data.name}
        totalBp={data.length}
      />
    </div>
  );
}

/**
 * Annotator — Sprint M-X.2 fullscreen annotation orchestrator.
 *
 * **Stub introduced in K3** so the IMPORTER_STRINGS coverage test
 * stays green — the `annotator` namespace gets referenced from
 * here. K8 fills in the real layout (header + TargetPreview +
 * PluginPanel + ResultsPane + footer); K10 wires
 * `onApplyAnnotatorResults` to the Importer SingleInspector.
 *
 * The component renders nothing in K3 — it's just a stub mounted
 * via the `state.annotator.open` flag (added in K6). When K8
 * fills it in, the surface area expands but the entry-point
 * contract (controlled by closeAnnotator in the store) stays
 * stable.
 */

import { STRINGS } from '../../lib/strings';

const S = STRINGS.importer.annotator;

export default function Annotator(/* { onApplyAnnotatorResults } */) {
  // K8 will replace this with the actual fullscreen layout.
  // For now: render a minimal placeholder so consumers can mount
  // the component without crashing during development.
  return (
    <div data-testid="annotator-root" data-stub="true" style={{ display: 'none' }}>
      {S.title}
    </div>
  );
}

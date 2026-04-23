/**
 * Sprint UX-1 prototype — K4 AnnotationEditor wrapper.
 *
 * Wrapper, not fork. AnnotationEditor.jsx reads chip colors in two render
 * paths (lines 174, 234): `ann.color || ANNOTATION_COLORS[ann.type]`. The
 * per-annotation `color` field takes precedence — so injecting
 * `featureColor(type, name)` into each annotation before passing to
 * AnnotationEditor overrides the legacy ANNOTATION_COLORS lookup from
 * auto-annotate.js without any file edits.
 *
 * Not overridden (acceptable for prototype, phase 2 UX-1a): child-row border
 * color (line 260 `regionColor = ANNOTATION_COLORS[region.type]`) and edit-
 * mode SBOL glyph (line 179) still use legacy palette — neither is a main
 * review surface. SBOL glyphs in tree rows (line 207) use `ann.color` and
 * DO get V2 palette — covered.
 */
import AnnotationEditor from '../AnnotationEditor';
import { featureColor } from '../../feature-palette';
import { fixture } from './fixture';

export default function AnnotationEditorWrapper({ data = fixture }) {
  const enriched = (data.annotations || []).map((a) => ({
    ...a,
    color: featureColor(a.type, a.name),
  }));

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <AnnotationEditor
        annotations={enriched}
        seqLength={data.length}
        onChange={() => {}}
        readOnly
      />
    </div>
  );
}

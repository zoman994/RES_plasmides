/**
 * assembly-annotations — remap each sourced segment's source-container
 * annotations onto assembly coordinates so the shared SequenceView
 * features track shows fragment features ON the assembly (Игорь
 * 17.05.2026: «фичи фрагментов должны показываться на сборке»).
 *
 * Pure. Forward segment: a container interval clipped to the segment's
 * slice [seg.start, seg.end) maps to b.startOnAssembly + (clip -
 * seg.start). RC segment: the segment sequence is reverse-complemented,
 * so the clipped interval mirrors within the segment length and the
 * strand flips. Gap / non-container / source-unavailable segments
 * contribute nothing (no real source coordinates).
 *
 * Annotation ids are namespaced per segment (`asm:<segId>:<orig>`) so
 * the same container reused in two segments yields two distinct,
 * non-colliding features.
 */
import {
  shiftAnnotations,
  transferAnnotationsForRanges,
} from './segment-annotation-transfer';

export function collectAssemblyAnnotations(draft, boundaries, containers) {
  const segs = (draft && draft.segments) || [];
  if (segs.length === 0) return [];
  const cmap = new Map((containers || []).map((c) => [c.id, c]));
  const out = [];
  for (let i = 0; i < segs.length; i += 1) {
    const seg = segs[i];
    const b = boundaries && boundaries[i];
    if (!seg || !b) continue;
    if (!seg.source || seg.source.type !== 'container' || seg.source.unavailable) continue;
    const base = b.startOnAssembly || 0;
    // Current drafts persist one canonical, identity-safe projection per
    // segment. Reuse it so render-time selection never remints identities.
    if (Array.isArray(seg.annotations)) {
      out.push(...shiftAnnotations(seg.annotations, base));
      continue;
    }

    // Legacy drafts may predate stored segment annotations. Project from the
    // source with deterministic per-segment namespacing as a read-only fallback.
    const c = cmap.get(seg.source.containerId);
    if (!c || !Array.isArray(c.annotations)) continue;
    const segStart = Number(seg.start) || 0;
    const segEnd = Number.isFinite(seg.end) ? seg.end : segStart;
    if (segEnd <= segStart) continue;
    out.push(...transferAnnotationsForRanges(
      c.annotations,
      [{
        start: segStart,
        end: segEnd,
        offset: base,
        rc: !!seg.reverseComplement,
      }],
      c.id,
      {
        idFactory: (source, index, attempt) => {
          const sourceKey = source?.id ?? `${index}`;
          return `asm:${seg.id}:${sourceKey}${attempt ? `:${attempt}` : ''}`;
        },
      },
    ));
  }
  return out;
}

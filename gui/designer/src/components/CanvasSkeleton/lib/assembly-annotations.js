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
    const c = cmap.get(seg.source.containerId);
    if (!c || !Array.isArray(c.annotations)) continue;
    const segStart = Number(seg.start) || 0;
    const segEnd = Number.isFinite(seg.end) ? seg.end : segStart;
    const L = Math.max(0, segEnd - segStart);
    if (L === 0) continue;
    const rc = !!seg.reverseComplement;
    const base = b.startOnAssembly || 0;
    for (const a of c.annotations) {
      const aS = Number(a.start);
      const aE = Number(a.end);
      if (!Number.isFinite(aS) || !Number.isFinite(aE) || aE <= aS) continue;
      const s = Math.max(aS, segStart);
      const e = Math.min(aE, segEnd);
      if (e <= s) continue; // annotation lies outside this segment's slice
      const ls = s - segStart;
      const le = e - segStart;
      const localStart = rc ? (L - le) : ls;
      const localEnd = rc ? (L - ls) : le;
      out.push({
        ...a,
        id: `asm:${seg.id}:${a.id != null ? a.id : `${aS}-${aE}`}`,
        start: base + localStart,
        end: base + localEnd,
        strand: rc ? -(Number(a.strand) || 1) : (Number(a.strand) || 1),
      });
    }
  }
  return out;
}

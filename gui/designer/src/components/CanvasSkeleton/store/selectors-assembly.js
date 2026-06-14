/**
 * selectors-assembly — pure derived reads over state.assemblyDrafts (A1
 * K3). Sequence is concat of CACHED segment sequences (frozen
 * semantics); boundaries derived cumulatively (no stored offset).
 */
import { computeAssemblySequence, segmentBoundaries } from '../lib/assembly-model';
import { draftFromZone } from '../lib/zone-pieces-to-dag';

/**
 * T6 K10 — single dual-resolution chokepoint for the assembly
 * selectors. A zone id projects to a pieces-shaped draft-like
 * (draftFromZone); a legacy assemblyDrafts id resolves unchanged
 * (transition window). Every selectAssemblyDraft* + selectBoundaryCoverage
 * built on this becomes zone-aware automatically.
 */
export function selectAssemblyDraftById(state, draftId) {
  const zone = ((state && state.zones) || []).find((z) => z.id === draftId);
  if (zone) return draftFromZone(state, zone);
  return (state?.assemblyDrafts || []).find((d) => d.id === draftId) || null;
}

export function selectAssemblyDraftSequence(state, draftId) {
  const d = selectAssemblyDraftById(state, draftId);
  return d ? computeAssemblySequence(d).sequence : '';
}

export function selectAssemblyDraftLength(state, draftId) {
  const d = selectAssemblyDraftById(state, draftId);
  return d ? segmentBoundaries(d).totalLength : 0;
}

export function selectSegmentBoundaries(state, draftId) {
  const d = selectAssemblyDraftById(state, draftId);
  return d ? segmentBoundaries(d).boundaries : [];
}

/**
 * Aggregate segment-local annotations onto assembly coordinates.
 * Segment-local annotation coords are 1-based inclusive; the segment
 * starts at boundary.startOnAssembly (0-based) → assembly 1-based coord
 * = localStart + startOnAssembly.
 */
/**
 * A3 DEC-CANVAS-ASM-PRIMER-05 — per internal boundary, whether a
 * forward / reverse boundary-primer covers it. Internal boundaries =
 * the N-1 segment joins (offset = each segment end except the last).
 */
export function selectBoundaryCoverage(state, draftId) {
  const d = selectAssemblyDraftById(state, draftId);
  if (!d) return [];
  const { boundaries } = segmentBoundaries(d);
  const primers = (state?.assemblyDraftPrimers && state.assemblyDraftPrimers[draftId]) || [];
  const out = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const off = boundaries[i].endOnAssembly;
    // Node A §A3/§5.4 — key on `source.boundaryAtOffset`, not `source.kind`.
    // Now a manual-boundary primer AND an auto-group primer with an overlap
    // tail both count toward coverage; `kind` stays honest ('auto-group' ≠
    // 'boundary') for labelling.
    const at = primers.filter(
      (p) => p.source && Number.isFinite(p.source.boundaryAtOffset) && p.source.boundaryAtOffset === off,
    );
    const fwd = at.find((p) => p.direction === 'forward');
    const rev = at.find((p) => p.direction === 'reverse');
    out.push({
      boundaryAtOffset: off,
      leftSegmentId: boundaries[i].segmentId,
      rightSegmentId: boundaries[i + 1].segmentId,
      fwd: !!fwd,
      rev: !!rev,
      fwdPrimerId: fwd ? fwd.id : undefined,
      revPrimerId: rev ? rev.id : undefined,
    });
  }
  // L5 (audit) — a single-fragment CIRCULAR draft has one self-closure boundary
  // (last↔first of the same fragment); the N-1 loop above yields nothing, so the
  // panel read «границы 0 / 0». Emit a closure row covered by the self-closure pair.
  if (d.topology && d.topology.circular && boundaries.length === 1) {
    const sc = primers.filter((p) => p.source && p.source.kind === 'self-closure');
    out.push({
      boundaryAtOffset: boundaries[0].endOnAssembly,
      leftSegmentId: boundaries[0].segmentId,
      rightSegmentId: boundaries[0].segmentId,
      selfClosure: true,
      fwd: sc.some((p) => p.direction === 'forward'),
      rev: sc.some((p) => p.direction === 'reverse'),
      fwdPrimerId: (sc.find((p) => p.direction === 'forward') || {}).id,
      revPrimerId: (sc.find((p) => p.direction === 'reverse') || {}).id,
    });
  }
  return out;
}

export function selectAssemblyDraftAnnotations(state, draftId) {
  const d = selectAssemblyDraftById(state, draftId);
  if (!d) return [];
  const { boundaries } = segmentBoundaries(d);
  const out = [];
  d.segments.forEach((s, i) => {
    const off = boundaries[i] ? boundaries[i].startOnAssembly : 0;
    for (const a of s.annotations || []) {
      out.push({ ...a, start: a.start + off, end: a.end + off });
    }
  });
  return out;
}

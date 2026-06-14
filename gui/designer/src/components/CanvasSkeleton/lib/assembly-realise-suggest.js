/**
 * assembly-realise-suggest — A4 per-boundary method heuristic
 * (DEC-CANVAS-ASM-REAL-05). Pure. Decision tree:
 *
 *   boundary primer present ? tail-length →
 *       <10  : overlap_pcr (medium)
 *       10-25: overlap_pcr (high)
 *       >25  : gibson      (high)
 *   else compatible RE sites in both flanking sources → restriction (medium)
 *   else both flanking segments blunt/manual            → direct_ligation (medium)
 *   else                                                → gibson (low, default)
 *
 * Methods: overlap_pcr | gibson | golden_gate | restriction | direct_ligation.
 * golden_gate is never auto-suggested (needs explicit enzyme) — biolog picks.
 */
import { segmentBoundaries } from './assembly-model';
import { draftFromZone } from './zone-pieces-to-dag';
import { RE_ENZYMES } from '../../../restriction-db';

/** T6 K11 — zone id → pieces-shaped draft-like, else legacy draft. */
function resolveDraft(state, draftId) {
  const zone = ((state && state.zones) || []).find((z) => z.id === draftId);
  if (zone) return draftFromZone(state, zone);
  return ((state && state.assemblyDrafts) || []).find((x) => x.id === draftId) || null;
}

/**
 * V109 (WT-B-7) — find the op-group covering a boundary. A zone op-group
 * (a `state.operations` entry with `isOpGroup`) records the assembly method
 * chosen at «Auto-собрать» time as `kind` — a design FACT, not a guess.
 * Returns the single op-group of this zone whose `inputPieces` contain BOTH
 * pieces flanking `boundaryIdx`, else `null` (boundary spans two groups, the
 * zone has no groups, or it's a legacy assemblyDraft). Zone-draft segments
 * carry the piece id as `segment.id` (draftFromZone), so the boundary→piece
 * map is direct; legacy drafts have no zone op-groups → `null` → fallback.
 */
function boundaryOpGroup(state, draftId, boundaryIdx) {
  const d = resolveDraft(state, draftId);
  if (!d || !Array.isArray(d.segments)) return null;
  const left = d.segments[boundaryIdx];
  const right = d.segments[boundaryIdx + 1];
  const leftPid = left && left.id;
  const rightPid = right && right.id;
  if (!leftPid || !rightPid) return null;
  const groups = ((state && state.operations) || []).filter(
    (o) => o && o.isOpGroup && o.zoneId === draftId && Array.isArray(o.inputPieces),
  );
  const covering = groups.filter(
    (g) => g.inputPieces.includes(leftPid) && g.inputPieces.includes(rightPid),
  );
  return covering.length === 1 ? covering[0] : null;
}

export function getBoundaryPrimerInfo(state, draftId, boundaryIdx) {
  const d = resolveDraft(state, draftId);
  if (!d) return { hasPrimer: false, tailLength: 0 };
  const { boundaries } = segmentBoundaries(d);
  const off = boundaries[boundaryIdx] ? boundaries[boundaryIdx].endOnAssembly : null;
  if (off == null) return { hasPrimer: false, tailLength: 0 };
  const primers = (state.assemblyDraftPrimers && state.assemblyDraftPrimers[draftId]) || [];
  // Node A §5.5 — key on `source.boundaryAtOffset` (manual-boundary AND
  // auto-group both), and read the now-stored `tail` directly. §9b: under
  // one-sided overlap (overlapTarget='right') BOTH the downstream fwd and the
  // upstream rev record the same boundary, but only the fwd carries the
  // homology-arm tail — pick the primer with the LONGEST tail so the boundary's
  // tailLength reflects the actual overlap (not the empty rev primer).
  const hits = primers.filter(
    (p) => p.source && Number.isFinite(p.source.boundaryAtOffset) && p.source.boundaryAtOffset === off,
  );
  if (hits.length === 0) return { hasPrimer: false, tailLength: 0 };
  const hit = hits.reduce(
    (best, p) => ((p.tail || '').length > (best.tail || '').length ? p : best),
    hits[0],
  );
  return {
    hasPrimer: true,
    tailLength: (hit.tail || '').length,
  };
}

export function detectCompatibleREsites(leftSeq, rightSeq) {
  const a = String(leftSeq || '').toUpperCase();
  const b = String(rightSeq || '').toUpperCase();
  if (!a || !b) return [];
  const out = [];
  for (const [name, e] of Object.entries(RE_ENZYMES)) {
    if (e && e.site && a.includes(e.site) && b.includes(e.site)) out.push(name);
  }
  return out;
}

function segContainerSeq(state, seg) {
  if (!seg || seg.source?.type !== 'container') return null;
  const c = (state.containers || []).find((x) => x.id === seg.source.containerId);
  return c ? c.sequence : null;
}

export function suggestMethodForBoundary(state, draftId, boundaryIdx) {
  const d = resolveDraft(state, draftId);
  // AM-5 — the low-confidence default is topology-aware: a LINEAR join defaults
  // to overlap PCR (never gibson, a ring-forming method); a CIRCULAR construct
  // to gibson. (suggestMethodForBoundary is only called for INTERNAL boundaries.)
  if (!d) return { method: 'overlap_pcr', confidence: 'low', rationale: 'нет данных' };
  const topoDefault = (d.topology && d.topology.circular) ? 'gibson' : 'overlap_pcr';

  // V109 — the op-group kind is the recorded design decision; prefer it
  // over the tail-length heuristic (which only guesses, and which misses
  // «Auto-собрать» primers entirely — see §1). A boundary inside one
  // op-group → that group's method. Boundaries without a single covering
  // group fall through to the heuristic below (legacy assemblyDraft path,
  // multi-layer joins between distinct groups).
  const og = boundaryOpGroup(state, draftId, boundaryIdx);
  if (og && og.kind) {
    return { method: og.kind, confidence: 'high', rationale: 'из группы операций' };
  }

  const left = d.segments[boundaryIdx];
  const right = d.segments[boundaryIdx + 1];

  const pi = getBoundaryPrimerInfo(state, draftId, boundaryIdx);
  if (pi.hasPrimer) {
    if (pi.tailLength < 10) {
      return { method: 'overlap_pcr', confidence: 'medium', rationale: `короткий tail ${pi.tailLength} bp` };
    }
    if (pi.tailLength <= 25) {
      return { method: 'overlap_pcr', confidence: 'high', rationale: `overlap-tail ${pi.tailLength} bp` };
    }
    return { method: 'gibson', confidence: 'high', rationale: `Gibson overlap ${pi.tailLength} bp из tail праймера` };
  }

  const lSeq = segContainerSeq(state, left);
  const rSeq = segContainerSeq(state, right);
  const re = detectCompatibleREsites(lSeq, rSeq);
  if (re.length > 0) {
    return { method: 'restriction', confidence: 'medium', rationale: `общий сайт: ${re[0]}` };
  }

  const bothManual = left?.source?.type !== 'container' && right?.source?.type !== 'container';
  if (bothManual) {
    return { method: 'direct_ligation', confidence: 'medium', rationale: 'оба сегмента manual (blunt)' };
  }

  return { method: topoDefault, confidence: 'low', rationale: topoDefault === 'gibson' ? 'по умолчанию (Gibson — кольцо)' : 'по умолчанию (Overlap PCR — линейно)' };
}

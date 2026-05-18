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

export function getBoundaryPrimerInfo(state, draftId, boundaryIdx) {
  const d = resolveDraft(state, draftId);
  if (!d) return { hasPrimer: false, tailLength: 0 };
  const { boundaries } = segmentBoundaries(d);
  const off = boundaries[boundaryIdx] ? boundaries[boundaryIdx].endOnAssembly : null;
  if (off == null) return { hasPrimer: false, tailLength: 0 };
  const primers = (state.assemblyDraftPrimers && state.assemblyDraftPrimers[draftId]) || [];
  const hit = primers.find(
    (p) => p.source && p.source.kind === 'boundary' && p.source.boundaryAtOffset === off,
  );
  if (!hit) return { hasPrimer: false, tailLength: 0 };
  return {
    hasPrimer: true,
    tailLength: Math.max(0, (hit.sequence || '').length - (hit.bindingSequence || '').length),
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
  if (!d) return { method: 'gibson', confidence: 'low', rationale: 'нет данных' };
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

  return { method: 'gibson', confidence: 'low', rationale: 'по умолчанию (Gibson — самый общий)' };
}

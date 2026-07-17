/**
 * Adapts the pure local primer-design core to the current CanvasSkeleton
 * operation shape. Primer records are persisted through the canonical
 * PrimerPool; this bridge never owns a second local registry.
 */
import { designPrimersLocal } from '../../../local-primer-design';
import { calcTm } from '../../../tm-calculator';

export const OLIGO_STATUSES = ['pending', 'ordered', 'shipping', 'received', 'bad'];

export function calcGC(seq) {
  const s = (seq || '').toUpperCase();
  if (!s.length) return 0;
  return Math.round(((s.match(/[GC]/g) || []).length / s.length) * 100);
}

// skeleton container → v0.5 designPrimersLocal fragment shape.
function toFragment(container, seqOverride) {
  return {
    name: container?.name || 'template',
    sequence: seqOverride != null ? seqOverride : (container?.sequence || ''),
    annotations: container?.annotations || [],
    topology: container?.topology?.circular ? 'circular' : 'linear',
    needsAmplification: true,
  };
}

function pairFromPrimers(primers) {
  const fwd = primers.find((p) => p.direction === 'forward');
  const rev = primers.find((p) => p.direction === 'reverse');
  if (!fwd || !rev) return null;
  return {
    forward: fwd.sequence,
    reverse: rev.sequence,
    // V71: keep the binding-only sequences the v0.5 core already
    // computed. The shared SequenceView PrimerTrack places primers by
    // indexOf-matching the binding region against the template — for a
    // tailed self-closure pair the full `sequence` would never match.
    fwdBinding: fwd.bindingSequence || fwd.sequence,
    revBinding: rev.bindingSequence || rev.sequence,
    fwdTm: fwd.tmBinding ?? fwd.tmAdjusted ?? calcTm(fwd.bindingSequence || fwd.sequence),
    revTm: rev.tmBinding ?? rev.tmAdjusted ?? calcTm(rev.bindingSequence || rev.sequence),
    fwdName: fwd.name,
    revName: rev.name,
  };
}

/**
 * suggestPrimers — auto-design a primer pair for a single-input PCR
 * (DEC-CANVAS-PCR-05). `tails` (from F2 selectTailsForJunction) are
 * prepended to the 5′ ends when present.
 */
export function suggestPrimers(template, tails, opts = {}) {
  if (!template || !template.sequence) return { pairs: [], warnings: ['Нет шаблона'], status: 'error' };
  const circular = !!template.topology?.circular;
  const { primers = [], warnings = [] } = designPrimersLocal(
    [toFragment(template)], [], circular, opts,
  ) || {};
  const base = pairFromPrimers(primers);
  if (!base) return { pairs: [], warnings, status: 'error' };
  const hasTails = !!(tails && (tails.forwardTail || tails.reverseTail));
  const pair = hasTails
    ? {
        ...base,
        forward: (tails.forwardTail || '') + base.forward,
        reverse: (tails.reverseTail || '') + base.reverse,
        source: 'junction-derived',
      }
    : { ...base, source: 'auto' };
  return { pairs: [pair], warnings, status: 'ready' };
}

/**
 * recomputeFromSelection — re-derive the pair for an explicit sub-range
 * of the template (drag-handle / manual selection, DEC-CANVAS-PCR-06).
 */
export function recomputeFromSelection(template, start, end, tails) {
  if (!template || !template.sequence) return null;
  const lo = Math.max(0, Math.min(start ?? 0, end ?? 0));
  const hi = Math.max(start ?? 0, end ?? 0);
  const region = template.sequence.slice(lo, hi);
  const { primers = [] } = designPrimersLocal(
    [toFragment(template, region)], [], false, {},
  ) || {};
  const base = pairFromPrimers(primers);
  if (!base) return null;
  if (tails && (tails.forwardTail || tails.reverseTail)) {
    return {
      ...base,
      forward: (tails.forwardTail || '') + base.forward,
      reverse: (tails.reverseTail || '') + base.reverse,
    };
  }
  return base;
}

/**
 * validatePrimer — basic length / Tm / GC advisory. `ok` is gated on
 * length only (15–60); Tm/GC are non-blocking warnings.
 */
export function validatePrimer(primer) {
  const seq = (primer?.sequence || primer?.forward || '').toUpperCase();
  // AM-5 — the annealing Tm is computed on the BINDING region only (the 5' tail
  // is non-complementary in the first PCR cycles); using the full oligo inflates
  // Tm and misjudges the window. Length/GC stay on the whole oligo (synthesis).
  const binding = (primer?.bindingSequence || primer?.fwdBinding || seq).toUpperCase();
  const L = seq.length;
  const warnings = [];
  if (L < 15) warnings.push(`Праймер короткий (${L} nt < 15) — неспецифичен`);
  if (L > 35) warnings.push(`Праймер длинный (${L} nt > 35) — дорого синтезировать`);
  const tm = binding.length >= 4 ? calcTm(binding) : 0;
  if (L >= 15 && (tm < 52 || tm > 70)) warnings.push(`Tm ${tm}°C вне комфортного диапазона 52–70`);
  const gc = calcGC(seq);
  if (L >= 15 && (gc < 35 || gc > 65)) warnings.push(`GC ${gc}% вне 35–65`);
  return { ok: L >= 15 && L <= 60, warnings, tm, gc, length: L };
}

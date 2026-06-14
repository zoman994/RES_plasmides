/**
 * operation-pcr-bridge — adapts the v0.5 pure primer-design core to the
 * skeleton-state shape. F3 M-CANVAS-PCR (DEC-CANVAS-PCR-05).
 *
 * ═══════════════════════════ HARVEST DISCOVERY (K1) ═══════════════════
 * v0.5 files read; what is cherry-picked vs left alone:
 *
 * src/local-primer-design.js (19.8 KB) — REUSED AS-IS via this bridge.
 *   - designPrimersLocal(fragments, junctions, circular, opts) — single
 *     export, PURE (no Zustand). opts = {tmTarget=60, primerPrefix='P',
 *     polymerase='phusion'}.
 *   - fragment shape it expects: {sequence, name, annotations,
 *     topology:'circular'|'linear', needsAmplification}.
 *   - returns {primers:[{name, sequence, bindingSequence, tailSequence,
 *     tmBinding, tmAdjusted, direction:'forward'|'reverse', fragmentName,
 *     length, purpose, ...}], warnings:[]}.
 *   - fragments.length===1 path = PCR-amplification (our case):
 *       circular → self-closure pair (15-bp tails);
 *       linear  → terminal pair (binding-only, no tails).
 *   - internal findBinding / findBindingTagAware / checkRepeats — not
 *     exported; reached only through designPrimersLocal (good — opaque).
 *
 * src/primer-reuse.js — AVAILABLE, deferred in F3 (pool empty).
 *   - findCompatiblePrimers(newPrimer, existing, opts) — similarity
 *     match (length / Tm). For PrimerReusePicker similarity ranking —
 *     follow-up (F3 ships substring filter; see F3 deviations).
 *   - buildOrderSheet(primers, reusedNames) — order text (optional).
 *
 * src/components/OligoManager.jsx (13.5 KB) — VALUES harvested only.
 *   - STATUSES enum: pending / ordered / shipping / received / bad.
 *   - calcGC(seq) reimplemented here (tiny, avoids importing the
 *     Tailwind/localStorage-coupled component).
 *   - localStorage 'pvcs-oligo-registry' — NOT used; skeleton keeps the
 *     pool in state.primers (exists as [] — no R2 gap).
 *
 * src/components/PrimerPanel.jsx (9.4 KB) — UX PATTERN only.
 *   - prop-driven shape {primers, warnings, onReusePrimer, onDeletePrimer}
 *     mirrored by the new PrimerSuggestionsPanel (rebuilt with skeleton
 *     design tokens — v0.5 file is Tailwind/legacy-shape coupled).
 *
 * src/components/JunctionBlock.jsx (29 KB) — NOT integrated. Tail
 *   construction already lives inside designPrimersLocal; F2
 *   selectTailsForJunction supplies skeleton-side tails.
 * src/components/PlasmidUseWizard.jsx (38.8 KB) — NOT mounted. It is
 *   mode-based (use_whole/disassemble/extract), no reusable 5′-drag
 *   handle; PrimerDragHandles is built fresh (transparent rects).
 * src/components/MutagenesisWizard.jsx — OUT (mutagenesis = later sprint).
 *
 * GAPS / FLAGS: none blocking. state.primers pool exists ([]), R1/R2
 * mitigations not needed. tm via tm-calculator (SantaLucia NN).
 * ══════════════════════════════════════════════════════════════════════
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

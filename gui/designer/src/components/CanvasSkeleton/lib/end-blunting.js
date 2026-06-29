/**
 * end-blunting — GAP-1 pure biology engine (Игорь /loop 28.06): «обработать
 * экзонуклеазой до тупых концов, чтобы гибсон/оверлап делать». Given a fragment's
 * sticky end + a blunting enzyme, decide HOW the end goes blunt (fill-in vs
 * chew-back) and WHETHER the chosen enzyme can do it at all. This is the engine
 * the future `blunt` operation (op-kinds-registry) and the DAG/canvas node call —
 * no UI, no store, fully unit-tested (end-blunting.test.js).
 *
 * Biology (the capability matrix):
 *   • T4 DNA pol — 5′→3′ polymerase FILLS 5′ overhangs + 3′→5′ exo CHEWS 3′
 *     overhangs ⇒ blunts BOTH polarities (the standard blunting enzyme, +dNTP).
 *   • Klenow — fills 5′ overhangs; NO strong 3′→5′ exo ⇒ cannot blunt a 3′ overhang.
 *   • Mung Bean / S1 — single-strand nucleases: chew AWAY any ss overhang ⇒ blunt.
 *
 * Footprint effect: FILL makes the overhang double-stranded IN PLACE (molecule
 * length unchanged); CHEW removes the overhang nucleotides (footprint shrinks by
 * the overhang length). `bluntFragment.overhangsRemoved` sums only the chews.
 * The byte-exact top-strand rewrite (fill adds complement / chew trims) belongs
 * with the op adapter, which has the container + the V155/V159 extent helpers.
 *
 * Reuses segmentOverhangs (the SINGLE end-state source) so blunting can never
 * disagree with the seam / interlock / orientation about what end a fragment has.
 */
import { segmentOverhangs } from './segment-overhangs.js';

/** @typedef {{name:string, blunts5:'fill'|'chew'|null, blunts3:'fill'|'chew'|null, temp:number, notes:string}} BluntingEnzyme */

/** @type {Object<string, BluntingEnzyme>} */
export const BLUNTING_ENZYMES = {
  T4pol: {
    name: 'T4 ДНК-полимераза',
    blunts5: 'fill',
    blunts3: 'chew',
    temp: 12,
    notes: 'Достраивает 5′-выступы и срезает 3′-выступы (с dNTP) — затупляет любой конец.',
  },
  Klenow: {
    name: 'Фрагмент Кленова',
    blunts5: 'fill',
    blunts3: null,
    temp: 25,
    notes: 'Достраивает 5′-выступы; 3′-выступы не убирает (нет сильной 3′-экзонуклеазы).',
  },
  MungBean: {
    name: 'Mung Bean нуклеаза',
    blunts5: 'chew',
    blunts3: 'chew',
    temp: 30,
    notes: 'Одноцепочечная нуклеаза — срезает любой выступ (5′ или 3′).',
  },
  S1: {
    name: 'S1 нуклеаза',
    blunts5: 'chew',
    blunts3: 'chew',
    temp: 37,
    notes: 'Одноцепочечная нуклеаза — срезает любой выступ (5′ или 3′).',
  },
};

const BLUNT_END = Object.freeze({ type: 'blunt', seq: '', delta: 0, label: 'тупой' });

/** Single-strand overhang length of an end ({type,seq,delta}); 0 for blunt/null. */
function overhangLenOf(end) {
  if (!end || end.type === 'blunt') return 0;
  return Math.abs(end.delta || 0) || (end.seq ? end.seq.length : 0);
}

/**
 * bluntEnd — decide how ONE end goes blunt with `enzymeKey`.
 * @param {{type:string, seq?:string, delta?:number, label?:string}|null} end
 * @param {string} enzymeKey  key into BLUNTING_ENZYMES
 * @returns {{ ok:boolean, mode:'fill'|'chew'|'none'|'blocked',
 *   result:{type:'blunt',seq:'',delta:0,label:string}|null, overhangLen:number, reason:string }}
 */
export function bluntEnd(end, enzymeKey) {
  const enz = BLUNTING_ENZYMES[enzymeKey];
  if (!enz) {
    return {
      ok: false, mode: 'blocked', result: null, overhangLen: 0,
      reason: `Неизвестный фермент затупления: ${enzymeKey}`,
    };
  }
  // Nothing to blunt — already blunt / no overhang info → no-op success.
  if (!end || end.type === 'blunt') {
    return {
      ok: true, mode: 'none', result: { ...BLUNT_END }, overhangLen: 0, reason: '',
    };
  }
  const len = overhangLenOf(end);
  const cap = end.type === '5prime' ? enz.blunts5 : (end.type === '3prime' ? enz.blunts3 : null);
  if (cap === 'fill' || cap === 'chew') {
    return {
      ok: true, mode: cap, result: { ...BLUNT_END }, overhangLen: len, reason: '',
    };
  }
  const poly = end.type === '3prime' ? '3′' : (end.type === '5prime' ? '5′' : '?');
  return {
    ok: false, mode: 'blocked', result: null, overhangLen: len,
    reason: `${enz.name} не убирает ${poly}-выступ — возьмите T4 ДНК-полимеразу или Mung Bean нуклеазу`,
  };
}

/**
 * bluntingEnzymesFor — UX suggestion list: which enzymes can blunt this end.
 * Empty for a blunt/null end (nothing to do). 5′ overhang → all four; 3′ overhang
 * → Klenow excluded (no 3′ exo).
 * @returns {string[]}
 */
export function bluntingEnzymesFor(end) {
  if (!end || end.type === 'blunt') return [];
  return Object.keys(BLUNTING_ENZYMES).filter((k) => {
    const r = bluntEnd(end, k);
    return r.ok && r.mode !== 'none';
  });
}

/**
 * bluntFragment — apply a blunting enzyme to BOTH ends of a fragment. Pulls the
 * end-states from segmentOverhangs (null = non-restriction / no overhangs → a
 * clean no-op). `ok` is true only when every overhang the fragment HAS can be
 * blunted by this enzyme (a 3′ overhang + Klenow → not ok, named in `warnings`).
 * @param {object} segment  assembly segment (acquisitionMethod / acquisitionParams)
 * @param {string} enzymeKey  BLUNTING_ENZYMES key
 * @param {object} reEnzymes  RE_ENZYMES dict (for segmentOverhangs)
 * @returns {{ ok:boolean, left:object|null, right:object|null,
 *   overhangsRemoved:number, warnings:string[] }}
 */
export function bluntFragment(segment, enzymeKey, reEnzymes) {
  const enz = BLUNTING_ENZYMES[enzymeKey];
  if (!enz) {
    return {
      ok: false, left: null, right: null, overhangsRemoved: 0,
      warnings: [`Неизвестный фермент затупления: ${enzymeKey}`],
    };
  }
  const oh = segmentOverhangs(segment, reEnzymes); // null for non-restriction segments
  const left = bluntEnd(oh ? oh.left : null, enzymeKey);
  const right = bluntEnd(oh ? oh.right : null, enzymeKey);
  const warnings = [];
  if (!left.ok) warnings.push(`Левый конец: ${left.reason}`);
  if (!right.ok) warnings.push(`Правый конец: ${right.reason}`);
  const overhangsRemoved = (left.mode === 'chew' ? left.overhangLen : 0)
    + (right.mode === 'chew' ? right.overhangLen : 0);
  return {
    ok: left.ok && right.ok, left, right, overhangsRemoved, warnings,
  };
}

/**
 * sanger-primer-design — designer Sanger sequencing primers.
 *
 * R7-2 (14.05.2026). Биолог хочет посеквенировать регион (insert,
 * mutation site, junction). Sanger чит ~700-900 bp после первичного
 * "dead zone" в ~50 bp. Primer ставится ~50-100 bp upstream от target.
 *
 * Strategy:
 *   - fwd primer: ищем в template region upstream от target,
 *     ~50-100 bp от target start. Picks Tm closest to 58°C, len 18-25.
 *   - rev primer (опционально): downstream target end.
 *   - Чекаем GC 40-60% и absence of 4+ same-base runs (rough proxy
 *     для hairpin/run prevention).
 *
 * Также есть designSangerWalk который размещает праймеры через
 * длинный регион с заданным шагом (default 600 bp) для long-read walk.
 */
import { calcTm } from '../../tm-calculator';

const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
function reverseComplement(s) {
  if (!s) return '';
  return s.toUpperCase().split('').reverse().map((c) => COMPLEMENT[c] || c).join('');
}

function gcPercent(s) {
  if (!s) return 0;
  return ((s.toUpperCase().match(/[GC]/g) || []).length / s.length) * 100;
}

function has4PlusRun(s) {
  return /AAAA|TTTT|GGGG|CCCC/.test(s.toUpperCase());
}

/**
 * pickPrimerAt — find a primer окно [start..start+len-1] в seq,
 * trying multiple lengths и positions, picking best Tm / GC score.
 *
 * @param seq          — template strand (top, 5'→3').
 * @param windowStart  — earliest position primer's 5' end can be.
 * @param windowEnd    — latest position primer's 3' end can be.
 * @param strand       — 'fwd' (sense) или 'rev' (revcomp).
 * @param opts         — {minLen, maxLen, targetTm, gcMin, gcMax}.
 * @returns {{sequence, position, length, Tm, GC, strand}} | null.
 */
function pickPrimerAt(seq, windowStart, windowEnd, strand, opts = {}) {
  const minLen = opts.minLen ?? 18;
  const maxLen = opts.maxLen ?? 25;
  const targetTm = opts.targetTm ?? 58;
  const gcMin = opts.gcMin ?? 40;
  const gcMax = opts.gcMax ?? 60;
  let best = null;
  for (let pos = Math.max(0, windowStart); pos + minLen <= Math.min(seq.length, windowEnd + 1); pos += 1) {
    for (let len = minLen; len <= maxLen; len += 1) {
      if (pos + len > seq.length) break;
      if (pos + len > windowEnd + 1) break;
      const sub = seq.slice(pos, pos + len);
      const s = strand === 'rev' ? reverseComplement(sub) : sub;
      const tm = calcTm(s);
      const gc = gcPercent(s);
      // Strict filters first.
      if (gc < gcMin || gc > gcMax) continue;
      if (has4PlusRun(s)) continue;
      const diff = Math.abs(tm - targetTm);
      if (!best || diff < best.diff) {
        best = {
          sequence: s,
          position: pos,
          length: len,
          Tm: Math.round(tm * 10) / 10,
          GC: Math.round(gc * 10) / 10,
          strand,
          diff,
        };
      }
    }
  }
  if (best) delete best.diff;
  return best;
}

/**
 * designSangerPrimer — fwd primer ~50-100 bp upstream от target, OR
 * rev primer ~50-100 bp downstream.
 *
 * @param template     — molecule container {sequence, topology}.
 * @param target       — {start, end} в template.
 * @param strand       — 'fwd' (default) или 'rev'.
 * @param opts         — {deadZone=50, walkLen=50, minLen, maxLen, targetTm, gcMin, gcMax, circular}.
 * @returns {{sequence, position, length, Tm, GC, strand, distance}} | {error}.
 */
export function designSangerPrimer(template, target, strand = 'fwd', opts = {}) {
  if (!template?.sequence) return { error: 'Template без sequence' };
  if (typeof target?.start !== 'number' || typeof target?.end !== 'number') {
    return { error: 'Target {start, end} обязателен' };
  }
  const deadZone = opts.deadZone ?? 50;
  const walkLen = opts.walkLen ?? 50;
  const seq = template.sequence.toUpperCase();
  const L = seq.length;
  const isCircular = !!template.topology?.circular;

  let windowStart;
  let windowEnd;
  if (strand === 'fwd') {
    // Primer 3' end должен быть [target.start - deadZone - walkLen ..
    //                              target.start - deadZone].
    windowEnd = target.start - deadZone;
    windowStart = windowEnd - walkLen;
  } else {
    // rev: primer's 3' end (в revcomp) maps to position target.end + deadZone..
    //   На top strand: primer covers [target.end + deadZone .. target.end + deadZone + walkLen].
    windowStart = target.end + deadZone;
    windowEnd = windowStart + walkLen;
  }
  if (windowStart < 0 || windowEnd >= L) {
    // For circular, мы можем wrap — пока не реализую (опционально).
    if (!isCircular) {
      return { error: `Target слишком близко к концу template (need ${deadZone + walkLen} bp буфера)` };
    }
  }
  const result = pickPrimerAt(seq, windowStart, windowEnd, strand, opts);
  if (!result) {
    return { error: 'Не найдено окно с подходящим Tm/GC (попробуйте смягчить gcMin/gcMax)' };
  }
  // distance = bp от primer 3' end до target start (fwd) или target end до primer 3' (rev).
  const distance = strand === 'fwd'
    ? target.start - (result.position + result.length)
    : result.position - target.end;
  return { ...result, distance };
}

/**
 * designSangerWalk — серия praimer'ов через длинный регион с шагом.
 *
 * @param template  — {sequence, topology}.
 * @param region    — {start, end}.
 * @param stepBp    — шаг между primers (default 600 — Sanger read length).
 * @param opts      — общие primer opts.
 * @returns Array<{sequence, position, Tm, GC, strand, distance}>.
 */
export function designSangerWalk(template, region, stepBp = 600, opts = {}) {
  if (!template?.sequence) return [];
  if (typeof region?.start !== 'number' || typeof region?.end !== 'number') return [];
  const out = [];
  let pos = region.start;
  while (pos < region.end) {
    const localTarget = { start: pos, end: pos + 1 };
    const p = designSangerPrimer(template, localTarget, 'fwd', opts);
    if (!p.error) out.push(p);
    pos += stepBp;
  }
  return out;
}

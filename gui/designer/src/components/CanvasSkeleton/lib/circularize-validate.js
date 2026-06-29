/**
 * circularize-validate — M-CIRCULARIZE C4. Pure live biovalidation of a chosen
 * closure method against the ACTUAL fragment sequences, surfaced as ✓/⚠/info in
 * the CircularizeModal. Grounds the modal's biology in the real construct, not
 * just static per-method requirements:
 *   • Golden Gate → real internal Type IIS site scan (go/no-go) via golden-gate.
 *   • Gibson/overlap → last≠first (distinguishable ends) + length for terminal
 *     homology (the primers ADD the overlap, so this checks feasibility).
 *   • KLD → single-fragment self-closure only.
 *   • blunt → self-ligation risk.
 *   • RE → directional vs self-ligation note.
 * Returns { level: 'ok'|'warn'|'info', message }.
 */
import { checkInternalSites } from '../../../golden-gate';
import { RE_ENZYMES } from '../../../restriction-db';
import { segmentOverhangs, junctionInterlock } from './segment-overhangs';

const MIN_HOMOLOGY = 20; // bp — terminal homology Gibson/overlap needs (≥15–20).

// RC-CLOSE-GATE (Игорь 25.06) — the closure seam's interlock: last fragment's
// RIGHT end vs first fragment's LEFT end (for a 1-fragment self-closure that is the
// fragment's own two ends). Used ONLY for the direct-ligation methods (RE / blunt),
// which join the PRE-EXISTING physical ends — KLD/overlap/Gibson rework them. null
// when no RE end chemistry is known (segmentOverhangs → null → interlock 'unknown').
function closureInterlock(segments = []) {
  const list = Array.isArray(segments) ? segments : [];
  if (list.length < 1) return null;
  const last = segmentOverhangs(list[list.length - 1], RE_ENZYMES);
  const first = segmentOverhangs(list[0], RE_ENZYMES);
  return junctionInterlock(last && last.right, first && first.left);
}

export function validateClosure({
  method, segments = [], circular = false, enzyme = 'BsaI',
}) {
  if (!circular) return { level: 'info', message: 'линейная сборка — без реакции замыкания' };

  const frags = (segments || [])
    .filter((s) => s && typeof s.sequence === 'string' && s.sequence.length > 0)
    .map((s, i) => ({ name: s.label || s.id || `фрагмент ${i + 1}`, sequence: s.sequence }));

  switch (method) {
    case 'moclo': // #111 — MoClo = Golden Gate (Type IIS) preset → same internal-site gate.
    case 'golden_gate': {
      const label = method === 'moclo' ? 'MoClo' : 'Golden Gate';
      const r = checkInternalSites(frags, enzyme);
      if (r.ok) return { level: 'ok', message: `внутренних сайтов ${enzyme} нет — ${label} сработает` };
      const alt = (r.alternatives && r.alternatives.length) ? ` · альтернатива: ${r.alternatives[0]}` : '';
      return { level: 'warn', message: `${r.message} — ${label} не сработает${alt}` };
    }
    case 'slic': // #111 — SLIC = overlap homology (Gibson family) → same terminal-homology gate.
    case 'gibson':
    case 'overlap_pcr': {
      const seqs = frags.map((f) => f.sequence);
      if (seqs.length >= 2 && seqs[seqs.length - 1] === seqs[0]) {
        return { level: 'warn', message: 'последний и первый фрагменты идентичны — гомология не различит концы' };
      }
      if (seqs.some((s) => s.length < MIN_HOMOLOGY)) {
        return { level: 'warn', message: `фрагмент <${MIN_HOMOLOGY} bp — мало для гомологии ≥15–20 bp` };
      }
      return { level: 'ok', message: 'концов хватает для гомологии (хвосты добавят праймеры)' };
    }
    case 'kld': {
      if (segments.length !== 1) {
        return { level: 'warn', message: 'KLD — только для само-замыкания 1 фрагмента' };
      }
      // RC-SEP-KLD (Игорь 25.06) — KLD and blunt ligation go hand-in-hand (both T4-ligate
      // blunt ends), so steer the user to the right one. KLD is the tool for a PCR /
      // mutagenesis PRODUCT: kinase phosphorylates the unphosphorylated PCR ends, ligase
      // closes the blunt circle, DpnI removes the methylated template. If the lone
      // fragment is a PHYSICAL blunt RE-cut фрагмент (ends already blunt + in hand), KLD
      // is over-tooling → point to direct blunt ligation.
      const seg = segments[0];
      if (seg && seg.acquisitionMethod === 'restriction') {
        const oh = segmentOverhangs(seg, RE_ENZYMES);
        const bothBlunt = oh && oh.left && oh.right && oh.left.type === 'blunt' && oh.right.type === 'blunt';
        if (bothBlunt) {
          return { level: 'info', message: 'концы уже тупые (рестриктаза) — хватит прямого тупого лигирования; KLD нужен для ПЦР-продукта (киназа + DpnI)' };
        }
      }
      return { level: 'ok', message: 'ПЦР всей плазмиды back-to-back → киназа (5′-P) + лигаза + DpnI (убрать матрицу). Для ПЦР-продукта.' };
    }
    case 'restriction': {
      // Honest end-compatibility: RE-ligation joins the physical ends AS-IS, so a
      // blunt + sticky (or non-matching overhang) closure CANNOT seal — warn, don't
      // assert «совместимые концы».
      const il = closureInterlock(segments);
      if (il && il.verdict === 'incompatible') {
        return { level: 'warn', message: `Концы не лигируются: ${il.message}` };
      }
      return { level: 'info', message: 'совместимые концы; разные ферменты → направленно, один фермент → риск само-лигирования' };
    }
    case 'direct_ligation': {
      // Blunt ligation needs BOTH ends blunt; a sticky end present → cannot blunt-ligate.
      const il = closureInterlock(segments);
      if (il && il.verdict === 'incompatible') {
        return { level: 'warn', message: `Тупое лигирование невозможно: ${il.message}` };
      }
      // RC-SEP-KLD — direct blunt ligation = T4 ligase on ALREADY-blunt, 5′-phosphorylated
      // ends. A PCR / cursor PRODUCT has no physical blunt ends yet + no 5′-P → that is
      // KLD's job (kinase + DpnI). Steer when the lone fragment is amplified, not RE-cut.
      if (segments.length === 1 && segments[0] && segments[0].acquisitionMethod !== 'restriction') {
        return { level: 'warn', message: 'ПЦР-/курсор-фрагмент без 5′-фосфата → это KLD (киназа + лигаза + DpnI); прямое тупое лигирование — для физически тупых концов рестриктазы' };
      }
      return { level: 'warn', message: 'тупое лигирование — риск само-лигирования; для само-замыкания концы должны быть фосфорилированы' };
    }
    default:
      return { level: 'info', message: '' };
  }
}

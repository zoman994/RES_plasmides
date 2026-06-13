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

const MIN_HOMOLOGY = 20; // bp — terminal homology Gibson/overlap needs (≥15–20).

export function validateClosure({
  method, segments = [], circular = false, enzyme = 'BsaI',
}) {
  if (!circular) return { level: 'info', message: 'линейная сборка — без реакции замыкания' };

  const frags = (segments || [])
    .filter((s) => s && typeof s.sequence === 'string' && s.sequence.length > 0)
    .map((s, i) => ({ name: s.label || s.id || `фрагмент ${i + 1}`, sequence: s.sequence }));

  switch (method) {
    case 'golden_gate': {
      const r = checkInternalSites(frags, enzyme);
      if (r.ok) return { level: 'ok', message: `внутренних сайтов ${enzyme} нет — Golden Gate сработает` };
      const alt = (r.alternatives && r.alternatives.length) ? ` · альтернатива: ${r.alternatives[0]}` : '';
      return { level: 'warn', message: `${r.message} — GG не сработает${alt}` };
    }
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
    case 'kld':
      return segments.length === 1
        ? { level: 'ok', message: 'само-замыкание 1 фрагмента — ПЦР всей плазмиды + киназа/лигаза/DpnI' }
        : { level: 'warn', message: 'KLD — только для само-замыкания 1 фрагмента' };
    case 'restriction':
      return { level: 'info', message: 'совместимые концы; разные ферменты → направленно, один фермент → риск само-лигирования' };
    case 'direct_ligation':
      return { level: 'warn', message: 'тупое лигирование — риск само-лигирования; дефосфорилируйте вектор' };
    default:
      return { level: 'info', message: '' };
  }
}

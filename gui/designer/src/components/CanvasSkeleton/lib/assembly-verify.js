/**
 * assembly-verify — S4 (V164). Pure. ONE transparent verdict for "can I build
 * this, and if not / not cleanly — why?", aggregating the per-aspect chemistry
 * summaries already computed by the assembler:
 *   • readiness   (S1) — incompatible sticky ends (BLOCKER), tentative junctions
 *   • endChem     (S2) — 5′-OH ends bound for ligation (T4 PNK), unresolved tails
 *   • reCloning   (S3) — sequential double-digest, dephosphorylation
 *
 * A BLOCKER makes the construct un-buildable as drawn (mirrors the Realise
 * gate); a WARNING is protocol guidance that doesn't stop the build. This is the
 * single source of truth the readiness UI, the protocol export, and the future
 * build-plan view read — no recomputation, no new biology.
 */

/**
 * @returns {{ buildable:boolean, blockers:Array<{kind,message}>,
 *   warnings:Array<{kind,message}> }}
 */
export function verifyAssembly({ readiness, endChem, reCloning } = {}) {
  const r = readiness || {};
  const ec = endChem || {};
  const rc = reCloning || {};
  const blockers = [];
  const warnings = [];

  // ── BLOCKERS — the construct can't ligate as drawn ──────────────────────────
  if (r.incompatible > 0) {
    blockers.push({ kind: 'incompatible-ends', message: `Несовместимые липкие концы на ${r.incompatible} стык(ах)` });
  }

  // ── WARNINGS — protocol guidance, not impossibilities ───────────────────────
  if (r.tentative > 0) {
    warnings.push({ kind: 'tentative', message: `${r.tentative} стык(ов) по умолчанию — проверьте` });
  }
  if (ec.unresolvedTailCount > 0) {
    warnings.push({ kind: 'no-enzyme', message: `${ec.unresolvedTailCount} стык(ов) без выбранного фермента` });
  }
  if (ec.needsPhosphorylationCount > 0) {
    warnings.push({ kind: 'phosphorylation', message: `${ec.needsPhosphorylationCount} стык(ов) 5′-OH — фосфорилирование (T4 PNK)` });
  }
  if (rc.sequentialDigestCount > 0) {
    warnings.push({ kind: 'sequential-digest', message: `${rc.sequentialDigestCount}: последовательный дайджест` });
  }
  if (rc.dephosphorylationCount > 0) {
    warnings.push({ kind: 'dephosphorylation', message: `${rc.dephosphorylationCount}: дефосфорилировать вектор (CIP/rSAP)` });
  }

  const hasJunctions = (r.total || 0) > 0;
  const buildable = hasJunctions && blockers.length === 0;
  return { buildable, blockers, warnings };
}

/** One-line human headline for the verdict. */
export function verifyHeadline(verify, ready) {
  if (!verify) return '';
  if (verify.blockers.length > 0) return `✗ Нельзя собрать: ${verify.blockers.map((b) => b.message).join('; ')}`;
  if (ready) return '✓ Все стыки заданы — готово к сборке';
  return null; // tentative / detail handled by the caller
}

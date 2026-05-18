/**
 * strain-compatibility — E.coli dam/dcm methylation checks.
 *
 * R8-1 (14.05.2026). Standard E.coli lab strains (DH5α, NEB 5-alpha,
 * JM109, TOP10) — dam+/dcm+. Это методит:
 *   - dam: GATC → G^m6ATC (adenine methylation at position 6).
 *   - dcm: CCWGG → CC^m5WGG (cytosine methylation at position 5).
 *
 * Многие Type II restriction enzymes blocked этими методиляциями.
 *   → биолог должен использовать dam-/dcm- strain (JM110, GM2163,
 *     INV110) для isolation темплейта перед digest.
 *
 * KLD/DpnI наоборот ТРЕБУЕТ dam+ template (DpnI режет только
 * methylated GATC — это убирает parental plasmid после PCR).
 *
 * Sources:
 *   - NEB methylation sensitivity chart.
 *   - https://www.neb.com/tools-and-resources/selection-charts/dam-dcm-methylation
 *
 * Список не исчерпывающий — содержит наиболее распространённые
 * dam/dcm-sensitive enzymes и enzymes, требующие methylated substrate.
 */

// Enzymes blocked by dam methylation (require dam- strain).
export const DAM_BLOCKED = new Set([
  'BclI',    // T^GATCA — site contains GATC
  'MboI',    // ^GATC — Type IIm
  'BspDI',   // AT^CGAT — overlapping GATC
  'ClaI',    // AT^CGAT — context-sensitive
  'NruI',    // TCG^CGA — context-sensitive
  'XbaI',    // T^CTAGA — context-sensitive (TCTAGATC)
  'MboII',   // GAAGA(N)8/7 — context-sensitive
  'HphI',    // GGTGA(N)8/7
  'TaqI',    // T^CGA — context-sensitive
  'AlwNI',   // CAGNNN^CTG — partial
]);

// Enzymes blocked by dcm methylation (require dcm- strain).
export const DCM_BLOCKED = new Set([
  'EcoRII',  // ^CCWGG
  'StuI',    // AGG^CCT — context-sensitive
  'AvrII',   // C^CTAGG — context-sensitive
  'EcoO109I',// RG^GNCCY — partial
  'NciI',    // CC^SGG — context-sensitive
  'PpuMI',   // RG^GWCCY — partial
  'ScrFI',   // CC^NGG — partial
]);

// Enzymes that REQUIRE dam-methylated substrate (e.g., DpnI). Used by KLD.
export const DAM_REQUIRED = new Set([
  'DpnI',    // ^G^m6ATC — cuts only methylated GATC
]);

/**
 * checkStrainCompatibility — анализирует список operations и emit'ит
 * warnings про strain selection.
 *
 * @param operations Array<Operation> — already executed (or planned).
 * @returns Array<{kind: 'dam-sensitive'|'dcm-sensitive'|'dam-required',
 *                 enzyme: string, opId: string, message: string,
 *                 recommendedStrain: string}>.
 */
export function checkStrainCompatibility(operations) {
  const out = [];
  for (const op of operations || []) {
    if (!op || !op.kind) continue;
    const enzymes = collectEnzymes(op);
    for (const e of enzymes) {
      if (DAM_BLOCKED.has(e)) {
        out.push({
          kind: 'dam-sensitive',
          enzyme: e,
          opId: op.id,
          opKind: op.kind,
          message: `${e} is blocked by dam methylation. Isolate template from dam- strain (JM110, GM2163, INV110).`,
          recommendedStrain: 'JM110 (dam- dcm-)',
        });
      }
      if (DCM_BLOCKED.has(e)) {
        out.push({
          kind: 'dcm-sensitive',
          enzyme: e,
          opId: op.id,
          opKind: op.kind,
          message: `${e} is blocked by dcm methylation. Isolate template from dcm- strain (JM110 / GM2163).`,
          recommendedStrain: 'JM110 (dam- dcm-)',
        });
      }
    }
    if (op.kind === 'kld') {
      // KLD relies on DpnI which requires dam+ template. Note in protocol.
      out.push({
        kind: 'dam-required',
        enzyme: 'DpnI',
        opId: op.id,
        opKind: 'kld',
        message: 'KLD uses DpnI to digest methylated parent. Template MUST come from dam+ strain (DH5α, NEB 5-alpha, JM109). dam- template won\'t be digested → high background.',
        recommendedStrain: 'DH5α (dam+ dcm+)',
      });
    }
  }
  return out;
}

function collectEnzymes(op) {
  const enz = [];
  if (op.kind === 'cut' && Array.isArray(op.params?.enzymes)) {
    enz.push(...op.params.enzymes);
  }
  if (op.kind === 'golden_gate' && op.params?.enzyme) {
    enz.push(op.params.enzyme);
  }
  return enz;
}

/**
 * recommendStrainsForOps — derives a single strain recommendation per
 * operation set. Если есть dam-sensitive enzymes → JM110. Иначе если
 * только KLD → DH5α. Иначе standard.
 */
export function recommendStrainsForOps(operations) {
  const warnings = checkStrainCompatibility(operations);
  const hasDamSensitive = warnings.some((w) => w.kind === 'dam-sensitive');
  const hasDcmSensitive = warnings.some((w) => w.kind === 'dcm-sensitive');
  const hasKLD = (operations || []).some((o) => o.kind === 'kld');

  const recommendations = [];
  if (hasDamSensitive && hasKLD) {
    // Conflict: KLD needs dam+, но один из enzymes dam-sensitive.
    recommendations.push({
      severity: 'high',
      message: 'CONFLICT: KLD requires dam+ template, но один из enzymes dam-sensitive. Сначала KLD в dam+ strain (DH5α), затем re-isolate в dam- strain (JM110) для последующего digest.',
    });
  } else if (hasDamSensitive) {
    recommendations.push({
      severity: 'medium',
      message: 'Isolate template from dam- strain (JM110, GM2163, INV110) перед restriction digest.',
    });
  } else if (hasDcmSensitive) {
    recommendations.push({
      severity: 'medium',
      message: 'Isolate template from dcm- strain (JM110, GM2163) перед restriction digest.',
    });
  } else if (hasKLD) {
    recommendations.push({
      severity: 'info',
      message: 'KLD: используйте dam+ strain (DH5α, NEB 5-alpha) для template prep — DpnI digestion of methylated parent.',
    });
  } else {
    recommendations.push({
      severity: 'info',
      message: 'Standard dam+ dcm+ strain (DH5α / NEB 5-alpha / TOP10) подходит.',
    });
  }
  return recommendations;
}

/**
 * annotation-conflicts — detects suspicious annotation overlaps.
 *
 * R8-3 (14.05.2026). После Cut → Gibson / Ligate биолог получает
 * собранную плазмиду с merged annotations. Иногда merge приводит к:
 *   - Duplicate annotations (same name, same range) — junction artifact.
 *   - Overlapping CDS annotations on same strand — frame conflict.
 *   - Промоторы over CDS regions — biologically unusual.
 *
 * Helper: detectAnnotationConflicts(container) → array warnings.
 *
 * Conflict types:
 *   - 'duplicate': two annotations с same name/range.
 *   - 'overlapping_cds': two CDS annotations пересекаются (≥6 bp).
 *   - 'promoter_in_cds': promoter полностью внутри CDS.
 *   - 'cds_no_start': CDS не начинается с ATG.
 *   - 'cds_no_stop': CDS не оканчивается stop codon.
 *   - 'cds_not_triplet': CDS длина не делится на 3.
 */

const STOP_CODONS = new Set(['TAA', 'TAG', 'TGA']);

function getAnnType(ann) {
  return (ann?.type || ann?.kind || ann?.feature || ann?.featureType || '').toUpperCase();
}

/**
 * detectAnnotationConflicts — scans annotations и выдаёт warnings.
 *
 * @param container — {sequence, annotations, name}.
 * @returns Array<{kind, severity, message, annotations: string[]}>.
 */
export function detectAnnotationConflicts(container) {
  if (!container || !Array.isArray(container.annotations)) return [];
  const anns = container.annotations.filter(
    (a) => a && typeof a.start === 'number' && typeof a.end === 'number' && a.end > a.start,
  );
  const seq = container.sequence || '';
  const warnings = [];

  // Duplicate detection (same name, same range).
  const dupMap = new Map();
  for (const a of anns) {
    const key = `${a.name || '?'}__${a.start}__${a.end}`;
    if (!dupMap.has(key)) dupMap.set(key, []);
    dupMap.get(key).push(a);
  }
  for (const [, group] of dupMap) {
    if (group.length > 1) {
      warnings.push({
        kind: 'duplicate',
        severity: 'medium',
        message: `Duplicate annotation "${group[0].name || '?'}" at ${group[0].start}-${group[0].end} (${group.length} copies).`,
        annotations: group.map((a) => a.id || a.name).filter(Boolean),
      });
    }
  }

  // Overlapping CDS (different annotations).
  const cdsList = anns.filter((a) => getAnnType(a) === 'CDS');
  for (let i = 0; i < cdsList.length; i += 1) {
    for (let j = i + 1; j < cdsList.length; j += 1) {
      const a = cdsList[i];
      const b = cdsList[j];
      const ovStart = Math.max(a.start, b.start);
      const ovEnd = Math.min(a.end, b.end);
      const ov = ovEnd - ovStart;
      if (ov >= 6) {
        warnings.push({
          kind: 'overlapping_cds',
          severity: 'low',
          message: `CDS overlap: "${a.name || '?'}" и "${b.name || '?'}" пересекаются на ${ov} bp (${ovStart}-${ovEnd}).`,
          annotations: [a.id || a.name, b.id || b.name].filter(Boolean),
        });
      }
    }
  }

  // Promoter completely inside CDS.
  const promoters = anns.filter((a) => /PROMOTER/i.test(getAnnType(a)));
  for (const p of promoters) {
    for (const cds of cdsList) {
      if (p.start >= cds.start && p.end <= cds.end) {
        warnings.push({
          kind: 'promoter_in_cds',
          severity: 'low',
          message: `Promoter "${p.name || '?'}" (${p.start}-${p.end}) inside CDS "${cds.name || '?'}" — biologically unusual.`,
          annotations: [p.id || p.name, cds.id || cds.name].filter(Boolean),
        });
      }
    }
  }

  // CDS structural checks.
  for (const cds of cdsList) {
    if (!seq) continue;
    const len = cds.end - cds.start;
    if (len % 3 !== 0) {
      warnings.push({
        kind: 'cds_not_triplet',
        severity: 'medium',
        message: `CDS "${cds.name || '?'}" length ${len} bp не кратно 3 — frame shift.`,
        annotations: [cds.id || cds.name].filter(Boolean),
      });
    }
    if (cds.start >= 0 && cds.start + 3 <= seq.length) {
      const startCodon = seq.slice(cds.start, cds.start + 3).toUpperCase();
      if (startCodon !== 'ATG' && startCodon !== 'GTG' && startCodon !== 'TTG') {
        warnings.push({
          kind: 'cds_no_start',
          severity: 'medium',
          message: `CDS "${cds.name || '?'}" не начинается с ATG/GTG/TTG (фактически: ${startCodon}).`,
          annotations: [cds.id || cds.name].filter(Boolean),
        });
      }
    }
    if (cds.end >= 3 && cds.end <= seq.length) {
      const stopCodon = seq.slice(cds.end - 3, cds.end).toUpperCase();
      if (!STOP_CODONS.has(stopCodon)) {
        warnings.push({
          kind: 'cds_no_stop',
          severity: 'medium',
          message: `CDS "${cds.name || '?'}" не оканчивается stop codon (фактически: ${stopCodon}).`,
          annotations: [cds.id || cds.name].filter(Boolean),
        });
      }
    }
  }

  return warnings;
}

/**
 * summarizeConflicts — короткий summary string для toast / log.
 */
export function summarizeConflicts(conflicts) {
  if (!conflicts || conflicts.length === 0) return null;
  const byKind = {};
  for (const c of conflicts) {
    byKind[c.kind] = (byKind[c.kind] || 0) + 1;
  }
  const parts = Object.entries(byKind).map(([k, n]) => `${n} ${k}`);
  return parts.join(', ');
}

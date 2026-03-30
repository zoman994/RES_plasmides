/**
 * Migration: upgrade legacy Parts to region-based annotation model.
 *
 * Handles:
 * - Parts with no regions → create primary region from part.type
 * - Parts with domains[] (AA-based) → convert to detail annotations
 * - Flat annotations (no level) → assign level: 'detail' + regionId
 */

import { generateRegionId } from './domain-detection';

/**
 * Ensure a Part has region-level annotations.
 * Non-destructive: preserves existing regions and manual annotations.
 *
 * @param {Object} part — { name, type, sequence, annotations?, domains? }
 * @returns {Array} migrated annotations array
 */
export function migratePartAnnotations(part) {
  const annotations = (part.annotations || []).map(a => ({ ...a }));

  // 1. If no regions exist, create primary region from part.type
  const hasRegions = annotations.some(a => a.level === 'region');
  let primaryRegionId;
  if (!hasRegions) {
    primaryRegionId = generateRegionId();
    annotations.unshift({
      id: primaryRegionId,
      name: part.name || part.type || 'Unknown',
      type: part.type || 'misc',
      start: 0,
      end: part.sequence?.length || 0,
      level: 'region',
      auto: true,
    });
  }

  // 2. Convert part.domains[] → detail annotations
  if (part.domains?.length) {
    const regionId = primaryRegionId || annotations.find(a => a.level === 'region')?.id;
    for (const d of part.domains) {
      // Skip if an equivalent detail already exists
      const ntStart = (d.startAA - 1) * 3;
      const ntEnd = d.endAA * 3;
      const alreadyExists = annotations.some(a =>
        a.level === 'detail' && a.name === d.name && a.start === ntStart && a.end === ntEnd
      );
      if (alreadyExists) continue;

      annotations.push({
        name: d.name,
        type: d.type || 'domain',
        start: ntStart,
        end: ntEnd,
        level: 'detail',
        regionId,
        color: d.color,
        migrated: true,
      });
    }
  }

  // 3. Upgrade flat annotations (no level) → detail with regionId
  for (const a of annotations) {
    if (!a.level) {
      a.level = 'detail';
      a.regionId = a.regionId || primaryRegionId ||
        annotations.find(r => r.level === 'region' && a.start >= r.start && a.end <= r.end)?.id;
    }
  }

  // 4. Convert mutations[] → point annotations (if not already present)
  if (part.mutations?.length && !annotations.some(a => a.type === 'mutation')) {
    for (const m of part.mutations) {
      const pos = m.codonStart ?? ((m.position || 0) * 3);
      const parentRegion = annotations.find(r =>
        r.level === 'region' && pos >= r.start && pos < r.end
      );
      annotations.push({
        name: m.label || `${m.aaFrom || m.from || ''}${(m.position || 0) + 1}${m.aaTo || m.to || ''}`,
        type: 'mutation',
        start: pos,
        end: pos + 3,
        level: 'point',
        regionId: parentRegion?.id || null,
        auto: false,
        source: 'mutagenesis',
        details: m,
      });
    }
  }

  return annotations;
}

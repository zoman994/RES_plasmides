/**
 * annotator-plugins/common-features.js — Sprint M-X.2 K7.
 *
 * Wraps the existing `detectCommonFeaturesAsync` (homology lookup
 * against the bundled feature DB) as an Annotator plugin. Async by
 * nature — the DB load is a fetch the first time it runs.
 *
 * Region scope: slice the input sequence to [region.start..region.end]
 * and shift returned region coords by +region.start.
 *
 * Bug-rush #24 (04.05.2026 evening): `detectCommonFeaturesAsync`
 * returns rows of shape `{ feature, start, end, strand, identity,
 * method }` — the underlying DB feature (with `name` / `type` /
 * `description`) is NESTED on the row. Annotator UI (`ResultRow`)
 * reads `region.name`, so before this fix every common-features hit
 * showed «(unnamed)» in the panel and the saved annotation went into
 * the sequence with no label. Flatten the rows here so they match
 * the shape the structural plugins emit (`{ name, type, level,
 * confidence, … }`).
 */

import { registerPlugin } from './registry.js';
import { detectCommonFeaturesAsync } from '../../feature-detection.js';

function shiftCoord(value, offset) {
  return Math.max(0, (value | 0) + offset);
}

/** Strip any HTML the SnapGene-derived feature DB may carry in
 *  `description`. The DB has bodies like
 *  `<html><body>confers resistance…</body></html>` — those leak into
 *  the inline-edit description field and look wrong. Keep it dumb
 *  (no parser): drop tags, decode the few entities the DB uses,
 *  collapse whitespace. */
function stripHtml(html) {
  if (typeof html !== 'string' || !html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Map one detector row to a region the Annotator UI understands. */
function rowToRegion(row, offset) {
  const feat = row?.feature || {};
  const region = {
    name: typeof feat.name === 'string' && feat.name ? feat.name : '(unnamed)',
    type: typeof feat.type === 'string' && feat.type ? feat.type : 'misc_feature',
    level: 'region',
    start: shiftCoord(row.start, offset),
    end: shiftCoord(row.end, offset),
    strand: row.strand === -1 ? -1 : 1,
    confidence: typeof row.identity === 'number' ? row.identity : null,
    method: typeof row.method === 'string' ? row.method : undefined,
  };
  if (feat.id) region.featureId = feat.id;
  const desc = stripHtml(feat.description);
  if (desc) region.description = desc;
  return region;
}

export const commonFeaturesPlugin = {
  id: 'common-features-homology',
  name: 'Common features (homology)',
  shortDescription: 'pUC19, AmpR, lacZα, …',
  capabilities: {
    needsRegion: false, fullSequenceOk: true,
    async: true, requiresNetwork: false, requiresBackend: false,
    speedHint: 'fast',
  },
  isAvailable: () => true,
  run: async (sequence, region, _options = {}) => {
    const t0 = Date.now();
    const offset = region ? Math.max(0, region.start | 0) : 0;
    const sub = region
      ? sequence.slice(offset, Math.min(sequence.length, region.end | 0))
      : sequence;
    let rows = [];
    try {
      const out = await detectCommonFeaturesAsync(sub);
      rows = Array.isArray(out) ? out : [];
    } catch {
      rows = [];
    }
    const regions = rows.map((row) => rowToRegion(row, offset));
    return {
      pluginId: 'common-features-homology',
      pluginName: commonFeaturesPlugin.name,
      regions,
      runAt: Date.now(),
      parameters: { region },
      durationMs: Math.max(0, Date.now() - t0),
    };
  },
};

registerPlugin(commonFeaturesPlugin);

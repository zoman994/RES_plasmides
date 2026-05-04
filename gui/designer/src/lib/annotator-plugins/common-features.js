/**
 * annotator-plugins/common-features.js — Sprint M-X.2 K7.
 *
 * Wraps the existing `detectCommonFeaturesAsync` (homology lookup
 * against the bundled feature DB) as an Annotator plugin. Async by
 * nature — the DB load is a fetch the first time it runs.
 *
 * Region scope: slice the input sequence to [region.start..region.end]
 * and shift returned region coords by +region.start.
 */

import { registerPlugin } from './registry.js';
import { detectCommonFeaturesAsync } from '../../feature-detection.js';

function shiftRegions(regions, offset) {
  if (!offset) return regions;
  return regions.map((r) => ({
    ...r,
    start: (r.start || 0) + offset,
    end: (r.end || 0) + offset,
  }));
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
    let regions = [];
    try {
      const out = await detectCommonFeaturesAsync(sub);
      regions = Array.isArray(out) ? out : [];
    } catch {
      regions = [];
    }
    return {
      pluginId: 'common-features-homology',
      pluginName: commonFeaturesPlugin.name,
      regions: shiftRegions(regions, offset),
      runAt: Date.now(),
      parameters: { region },
      durationMs: Math.max(0, Date.now() - t0),
    };
  },
};

registerPlugin(commonFeaturesPlugin);

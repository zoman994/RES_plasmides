/**
 * annotator-plugins/structural.js — Sprint M-X.2 K7.
 *
 * Four adapters wrapping M-X.1's direct detector functions
 * (predicted-detection.js) as Annotator plugins:
 *   - 'orf-scan'             — detectORFsAsPredicted
 *   - 'sigma70-promoter'     — detectPromotersSigma70(seq, threshold)
 *   - 'stem-loop-terminator' — detectTerminatorsStemLoop(seq, threshold)
 *   - 'sgrna-scaffold'       — detectGuideRNAScaffolds(seq)
 *
 * Each adapter handles the region-scoped run by slicing the input
 * sequence to [region.start..region.end], invoking the detector,
 * and shifting all returned region.start / region.end coords by
 * +region.start so the caller sees absolute coords in the full
 * sequence.
 */

import { registerPlugin } from './registry.js';
import {
  detectORFsAsPredicted,
  detectPromotersSigma70,
  detectTerminatorsStemLoop,
  detectGuideRNAScaffolds,
} from '../../predicted-detection.js';

function shiftRegions(regions, offset) {
  if (!offset) return regions;
  return regions.map((r) => ({
    ...r,
    start: r.start + offset,
    end: r.end + offset,
  }));
}

function maybeSlice(sequence, region) {
  if (!region) return { sub: sequence, offset: 0 };
  const start = Math.max(0, region.start | 0);
  const end = Math.min(sequence.length, region.end | 0);
  if (end <= start) return { sub: '', offset: start };
  return { sub: sequence.slice(start, end), offset: start };
}

function buildResult(pluginId, pluginName, regions, parameters, startTime) {
  return {
    pluginId,
    pluginName,
    regions,
    runAt: Date.now(),
    parameters,
    durationMs: Math.max(0, Date.now() - startTime),
  };
}

export const orfScanPlugin = {
  id: 'orf-scan',
  name: 'ORF scan',
  shortDescription: 'ATG→stop ≥100 aa, обе цепи',
  capabilities: {
    needsRegion: false, fullSequenceOk: true,
    async: false, requiresNetwork: false, requiresBackend: false,
    speedHint: 'fast',
  },
  isAvailable: () => true,
  run: async (sequence, region, options = {}) => {
    const t0 = Date.now();
    const { sub, offset } = maybeSlice(sequence, region);
    const existing = Array.isArray(options.existingConfident) ? options.existingConfident : [];
    const out = detectORFsAsPredicted(sub, existing);
    return buildResult('orf-scan', orfScanPlugin.name, shiftRegions(out, offset), { region }, t0);
  },
};

// Sprint M-X.2 K9-fix (post-K10 review): plugins are now run with
// a FIXED minimum-confidence threshold (`PLUGIN_MIN_THRESHOLD`)
// so the slider in the Annotator UI is the *single* filter point.
// Pre-fix the slider was a double filter — moving it down didn't
// reveal previously-skipped hits (the plugin was called with the
// slider value as a hard cutoff). Now run() over-fetches; the
// render layer respects the slider live.
const PLUGIN_MIN_THRESHOLD = 0.5;

export const sigma70PromoterPlugin = {
  id: 'sigma70-promoter',
  name: 'σ70 promoter (PWM)',
  shortDescription: 'PWM на -35 / -10 / spacer',
  capabilities: {
    needsRegion: false, fullSequenceOk: true,
    async: false, requiresNetwork: false, requiresBackend: false,
    speedHint: 'fast',
  },
  isAvailable: () => true,
  run: async (sequence, region, _options = {}) => {
    const t0 = Date.now();
    const { sub, offset } = maybeSlice(sequence, region);
    // Always over-fetch — slider does the user-visible filter at
    // render time so dragging it is instant (no re-run).
    const out = detectPromotersSigma70(sub, PLUGIN_MIN_THRESHOLD);
    return buildResult('sigma70-promoter', sigma70PromoterPlugin.name, shiftRegions(out, offset), { threshold: PLUGIN_MIN_THRESHOLD, region }, t0);
  },
};

export const stemLoopTerminatorPlugin = {
  id: 'stem-loop-terminator',
  name: 'Терминатор stem-loop',
  shortDescription: 'GC-stem + poly-T tail',
  capabilities: {
    needsRegion: false, fullSequenceOk: true,
    async: false, requiresNetwork: false, requiresBackend: false,
    speedHint: 'fast',
  },
  isAvailable: () => true,
  run: async (sequence, region, _options = {}) => {
    const t0 = Date.now();
    const { sub, offset } = maybeSlice(sequence, region);
    // Same single-filter-point rule as sigma70-promoter — plugin
    // over-fetches, slider filters at render.
    const out = detectTerminatorsStemLoop(sub, PLUGIN_MIN_THRESHOLD);
    return buildResult('stem-loop-terminator', stemLoopTerminatorPlugin.name, shiftRegions(out, offset), { threshold: PLUGIN_MIN_THRESHOLD, region }, t0);
  },
};

export const sgrnaScaffoldPlugin = {
  id: 'sgrna-scaffold',
  name: 'sgRNA scaffold (Cas9)',
  shortDescription: 'DNA-identity match',
  capabilities: {
    needsRegion: false, fullSequenceOk: true,
    async: false, requiresNetwork: false, requiresBackend: false,
    speedHint: 'instant',
  },
  isAvailable: () => true,
  run: async (sequence, region, _options = {}) => {
    const t0 = Date.now();
    const { sub, offset } = maybeSlice(sequence, region);
    const out = detectGuideRNAScaffolds(sub);
    return buildResult('sgrna-scaffold', sgrnaScaffoldPlugin.name, shiftRegions(out, offset), { region }, t0);
  },
};

registerPlugin(orfScanPlugin);
registerPlugin(sigma70PromoterPlugin);
registerPlugin(stemLoopTerminatorPlugin);
registerPlugin(sgrnaScaffoldPlugin);

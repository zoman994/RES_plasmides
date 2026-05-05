/**
 * annotator-plugins/blast-ncbi-stub.js — Sprint M-X.2 K7 (DEC-ANN-11).
 *
 * Sprint M-X.3 follow-up (05.05.2026) — biolog asked for an honest
 * placeholder instead of fake hits «ок поставь пока заглушку». The
 * old stub generated 5-10 fake hits with realistic-looking names
 * (`beta-lactamase TEM-1 P0DTC2.1`, etc.) which polluted the
 * predicted-region store with imaginary annotations the user would
 * have no way to validate. Now the run() returns a deterministic
 * empty result tagged `placeholder: true` so LevelPanel can render
 * a clear «not implemented» message in the L3 section.
 *
 * Real NCBI BLAST integration needs a backend proxy (CORS) and
 * polling against /Blast.cgi — out of scope for the current sprint;
 * the plugin contract stays stable so swapping run() in is the
 * only edit needed.
 */

import { registerPlugin } from './registry.js';

export const blastNcbiPlugin = {
  id: 'blast-ncbi',
  name: 'BLAST (NCBI)',
  shortDescription: 'Coming soon — needs backend proxy.',
  capabilities: {
    needsRegion: false, fullSequenceOk: true,
    async: true, requiresNetwork: true, requiresBackend: true,
    speedHint: 'slow',
  },
  // Plugin is technically available (no setup required), but its
  // run() is a no-op until the backend wires up the NCBI BLAST
  // REST proxy. LevelPanel reads `placeholder: true` on the
  // result and surfaces the «Coming soon» panel instead of the
  // generic Run button.
  isAvailable: () => true,
  unavailableReason: () => null,
  run: async (sequence, region, _options = {}) => {
    const t0 = Date.now();
    return {
      pluginId: 'blast-ncbi',
      pluginName: blastNcbiPlugin.name,
      regions: [],
      placeholder: true,
      runAt: Date.now(),
      parameters: { region },
      durationMs: Math.max(0, Date.now() - t0),
    };
  },
};

registerPlugin(blastNcbiPlugin);

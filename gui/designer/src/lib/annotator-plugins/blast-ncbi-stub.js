/**
 * annotator-plugins/blast-ncbi-stub.js — Sprint M-X.2 K7 (DEC-ANN-11).
 *
 * Stub BLAST plugin — returns 5-10 fake hits with realistic-looking
 * names + e-values + identities. Real NCBI integration lands in
 * M-X.2.1 mini-sprint (replaces only the `run()` body; the plugin
 * contract is stable).
 *
 * Visible badge `(mock)` in pluginName makes the stub status
 * obvious to biologs during acceptance.
 *
 * Async with intentional 300-1500ms random delay so the spinner
 * UI gets exercised under realistic latency.
 */

import { registerPlugin } from './registry.js';

const FAKE_NAMES = [
  'hypothetical protein WP_000123456.1',
  'putative ABC transporter WP_000234567.1',
  'methyltransferase family protein WP_000345678.1',
  'transcriptional regulator WP_000456789.1',
  'serine/threonine kinase WP_000567890.1',
  'glycosyltransferase WP_000678901.1',
  'ribosomal protein L1 WP_000789012.1',
  'sigma factor RpoD WP_000890123.1',
  'putative phosphatase WP_000901234.1',
  'NAD(P)H dehydrogenase WP_001012345.1',
  'beta-lactamase TEM-1 P0DTC2.1',
  'green fluorescent protein P42212.1',
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
function randFloat(lo, hi) { return lo + Math.random() * (hi - lo); }
function randomDelay() { return randInt(300, 1500); }

function generateFakeHits(sequence, region) {
  const seqLen = (region ? Math.max(0, (region.end | 0) - (region.start | 0)) : sequence.length);
  const offset = region ? Math.max(0, region.start | 0) : 0;
  const count = randInt(5, 10);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (seqLen < 20) break;
    const start = offset + randInt(0, Math.max(0, seqLen - 60));
    const len = randInt(60, Math.min(500, seqLen));
    const end = Math.min(offset + seqLen, start + len);
    if (end <= start) continue;
    const evalExp = randInt(50, 5);
    const ident = randInt(40, 99);
    out.push({
      id: `blast:${start}:${end}:${i}`,
      name: pickRandom(FAKE_NAMES),
      type: 'CDS',
      start,
      end,
      strand: Math.random() < 0.5 ? -1 : 1,
      level: 'region',
      predicted: true,
      source: 'blast-ncbi-mock',
      confidence: ident / 100,
      signals: [{
        type: 'blast-hit',
        eValue: Math.pow(10, -evalExp),
        identity: ident,
        coverage: randFloat(0.6, 0.99),
      }],
    });
  }
  return out;
}

export const blastNcbiPlugin = {
  id: 'blast-ncbi',
  name: 'BLAST (NCBI) (mock)',
  shortDescription: 'Stub — реальная интеграция в M-X.2.1',
  capabilities: {
    needsRegion: false, fullSequenceOk: true,
    async: true, requiresNetwork: true, requiresBackend: false,
    speedHint: 'slow',
  },
  isAvailable: () => true, // mock always available; real plugin will check navigator.onLine
  unavailableReason: () => null,
  run: async (sequence, region, _options = {}) => {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, randomDelay()));
    const regions = generateFakeHits(sequence, region);
    return {
      pluginId: 'blast-ncbi',
      pluginName: blastNcbiPlugin.name,
      regions,
      runAt: Date.now(),
      parameters: { region },
      durationMs: Math.max(0, Date.now() - t0),
    };
  },
};

registerPlugin(blastNcbiPlugin);

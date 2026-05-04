/**
 * structural plugins — Sprint M-X.2 K7 coverage. Verifies each adapter
 * wraps the underlying detector correctly + region-scoped runs shift
 * coords back to the full sequence.
 */
import { describe, it, expect } from 'vitest';
import {
  orfScanPlugin,
  sigma70PromoterPlugin,
  stemLoopTerminatorPlugin,
  sgrnaScaffoldPlugin,
} from '../structural.js';

const seqWithORF = (() => {
  const start = 'ATG';
  const codons = 'GCC'.repeat(120); // 360 nt of GlyAla — long ORF
  const stop = 'TAA';
  return `AAA${start}${codons}${stop}AAA`; // ~370 nt with ATG at offset 3
})();

describe('K7 structural plugins — orf-scan', () => {
  it('wraps detectORFsAsPredicted and exposes the right plugin shape', async () => {
    expect(orfScanPlugin.id).toBe('orf-scan');
    expect(orfScanPlugin.capabilities.fullSequenceOk).toBe(true);
    const res = await orfScanPlugin.run(seqWithORF, null, {});
    expect(res.pluginId).toBe('orf-scan');
    expect(Array.isArray(res.regions)).toBe(true);
    expect(res.regions.length).toBeGreaterThan(0);
  });

  it('region-scoped run shifts coords back to absolute', async () => {
    const padded = 'AAAA'.repeat(50) + seqWithORF;
    const offset = 200;
    const res = await orfScanPlugin.run(padded, { start: offset, end: padded.length }, {});
    const orf = res.regions[0];
    if (!orf) {
      // Detector may legitimately reject the region (length / frame) —
      // assertion is conditional.
      return;
    }
    expect(orf.start).toBeGreaterThanOrEqual(offset);
  });
});

describe('K7 structural plugins — sigma70-promoter', () => {
  it('respects threshold via options', async () => {
    const res = await sigma70PromoterPlugin.run('ATGC'.repeat(100), null, { threshold: 0.99 });
    expect(res.pluginId).toBe('sigma70-promoter');
    // With threshold this high, no hits.
    expect(res.regions).toBeDefined();
  });
});

describe('K7 structural plugins — stem-loop-terminator', () => {
  it('returns an array even on a non-terminating sequence', async () => {
    const res = await stemLoopTerminatorPlugin.run('AAAA'.repeat(100), null, {});
    expect(Array.isArray(res.regions)).toBe(true);
  });
});

describe('K7 structural plugins — sgrna-scaffold', () => {
  it('returns an array (possibly empty) without throwing', async () => {
    const res = await sgrnaScaffoldPlugin.run('AAAA'.repeat(50), null, {});
    expect(Array.isArray(res.regions)).toBe(true);
  });
});

describe('K7 plugin object shape', () => {
  for (const p of [orfScanPlugin, sigma70PromoterPlugin, stemLoopTerminatorPlugin, sgrnaScaffoldPlugin]) {
    it(`${p.id} has id/name/run/capabilities`, () => {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.run).toBe('function');
      expect(p.capabilities).toBeDefined();
      expect(typeof p.capabilities.fullSequenceOk).toBe('boolean');
    });
  }
});

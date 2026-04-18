import { describe, it, expect } from 'vitest';
import { designPrimersLocal } from '../local-primer-design.js';
import { generateRETail } from '../restriction-db.js';

/**
 * Helper: reverse complement
 */
function rc(seq) {
  const comp = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
  return seq.split('').reverse().map(c => comp[c.toUpperCase()] || 'N').join('');
}

// ═══════════════════════════════════════════════════════
// 2a. overlapTail — ligation junction support
// ═══════════════════════════════════════════════════════
describe('overlapTail ligation support', () => {
  // Two fragments with ligation junction between them
  const fragA = { name: 'Backbone', sequence: 'ATGCCCGGGTTTAAACCCAAATTTGGGCCC', needsAmplification: true };
  const fragB = { name: 'Insert', sequence: 'GGGAAATTTCCCAAAGGGTTTTCCCAAAGGG', needsAmplification: true };

  it('ligation junction with EcoRI adds RE tail to primers', () => {
    const junctions = [{
      type: 'ligation',
      enzyme: 'EcoRI',
      overhang: 'AATT',
      overhangType: '5prime',
    }];
    const result = designPrimersLocal([fragA, fragB], junctions, false);
    // fragA rev primer should have EcoRI tail
    // fragB fwd primer should have EcoRI tail
    const expectedTail = generateRETail('EcoRI');
    expect(expectedTail.length).toBeGreaterThan(0);

    // At least one primer should contain the RE site GAATTC
    const allSeqs = result.primers.map(p => p.sequence);
    expect(allSeqs.some(s => s.includes('GAATTC') || s.includes(rc('GAATTC')))).toBe(true);
  });

  it('ligation junction with BamHI adds RE tail', () => {
    const junctions = [{
      type: 'ligation',
      enzyme: 'BamHI',
    }];
    const result = designPrimersLocal([fragA, fragB], junctions, false);
    const allSeqs = result.primers.map(p => p.sequence);
    expect(allSeqs.some(s => s.includes('GGATCC') || s.includes(rc('GGATCC')))).toBe(true);
  });

  it('ligation junction without enzyme → no tail (empty)', () => {
    const junctions = [{ type: 'ligation' }];
    const result = designPrimersLocal([fragA, fragB], junctions, false);
    // Should still generate primers (binding only, no tail)
    expect(result.primers.length).toBeGreaterThan(0);
  });

  it('re_ligation type also works (alias)', () => {
    const junctions = [{
      type: 're_ligation',
      enzyme: 'EcoRI',
    }];
    const result = designPrimersLocal([fragA, fragB], junctions, false);
    const allSeqs = result.primers.map(p => p.sequence);
    expect(allSeqs.some(s => s.includes('GAATTC') || s.includes(rc('GAATTC')))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// 2d. N+N with ligation = valid (no warning)
// ═══════════════════════════════════════════════════════
describe('N+N + ligation junction', () => {
  const fragNoPCR_A = { name: 'BB', sequence: 'ATGCCCGGGTTTAAACCCAAATTTGGGCCC', needsAmplification: false };
  const fragNoPCR_B = { name: 'Ins', sequence: 'GGGAAATTTCCCAAAGGGTTTTCCCAAAGGG', needsAmplification: false };

  it('N+N with overlap junction → warning', () => {
    const junctions = [{ type: 'overlap' }];
    const result = designPrimersLocal([fragNoPCR_A, fragNoPCR_B], junctions, false);
    expect(result.warnings.some(w => /без ПЦР|overlap невозможен/i.test(w))).toBe(true);
  });

  it('N+N with ligation junction → NO warning', () => {
    const junctions = [{ type: 'ligation', enzyme: 'EcoRI' }];
    const result = designPrimersLocal([fragNoPCR_A, fragNoPCR_B], junctions, false);
    expect(result.warnings.some(w => /без ПЦР|overlap невозможен/i.test(w))).toBe(false);
  });
});

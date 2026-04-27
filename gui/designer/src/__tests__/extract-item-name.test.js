/**
 * Kfix-1 — extractItemName helper.
 *
 * Priority: internal record name (LOCUS / FASTA header / SnapGene metadata) →
 * file.name without extension → part_N fallback. Backend tempfile leaks
 * (tmpXXXXX) and `<unknown...>` markers must be rejected at the internal layer.
 */
import { describe, it, expect } from 'vitest';
import { extractItemName } from '../file-import';

describe('extractItemName', () => {
  it('prefers internal name when present and clean', () => {
    expect(extractItemName({ name: 'pET-28a' }, { name: 'random_upload.gb' })).toBe('pET-28a');
  });

  it('falls back to file.name (sans extension) when internal is empty', () => {
    expect(extractItemName({ name: '' }, { name: 'pUC19_with_EGFP.dna' })).toBe('pUC19_with_EGFP');
  });

  it('rejects backend tempfile basenames like tmpe2oww0me', () => {
    expect(extractItemName({ name: 'tmpe2oww0me' }, { name: 'pUC19.dna' })).toBe('pUC19');
  });

  it('rejects <unknown...> markers from BioPython', () => {
    expect(extractItemName({ name: '<unknown name>' }, { name: 'x.gb' })).toBe('x');
  });

  it('falls back to part_N when both internal and file are missing', () => {
    expect(extractItemName({}, null, 7)).toBe('part_7');
    expect(extractItemName({ name: '' }, { name: '' }, 3)).toBe('part_3');
  });
});

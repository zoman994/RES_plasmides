/**
 * legacyPrimerToCanonical — the LOSSLESS legacy-primer → pool transform (REV#2 K6-P1-2b).
 * The round-2 migration dropped tm/length/direction/binding/tail/status/origin/addedAt and,
 * because addPrimerToPool's default status='imported' is a valid enum that clobbers input.status,
 * silently downgraded ordered primers to imported. This helper must carry EVERY field and hand
 * back status + origin as SEPARATE args so the pool-writer's defaults can't override them.
 */
import { describe, it, expect } from 'vitest';
import { legacyPrimerToCanonical } from '../legacy-primer-migrate';

describe('legacyPrimerToCanonical', () => {
  it('null / id-less entry → null', () => {
    expect(legacyPrimerToCanonical(null)).toBeNull();
    expect(legacyPrimerToCanonical({ kind: 'primer' })).toBeNull();
  });

  it('carries every top-level field (nothing dropped)', () => {
    const entry = {
      id: 'pr1', kind: 'primer', name: 'T7-rev',
      sequence: 'GCTAGTTATTGCTCAGCGG', bindingSequence: 'GCTAGTTATTGCTCAGC', tail: 'GGGG',
      tm: 58.2, length: 19, direction: 'reverse', status: 'ordered', description: 'fwd cloning primer',
      addedAt: '2026-01-02T00:00:00.000Z', resourceHash: 'h-top', projectId: 'proj9',
      origin: { kind: 'design', resourceHash: 'h-origin' }, tags: ['seq'],
    };
    const out = legacyPrimerToCanonical(entry);
    expect(out.projectId).toBe('proj9');
    expect(out.status).toBe('ordered');            // separate arg — not defaulted to 'imported'
    expect(out.origin).toEqual({ kind: 'design', resourceHash: 'h-origin' });
    expect(out.primer).toMatchObject({
      id: 'pr1', name: 'T7-rev', sequence: 'GCTAGTTATTGCTCAGCGG',
      bindingSequence: 'GCTAGTTATTGCTCAGC', tail: 'GGGG',
      tm: 58.2, length: 19, direction: 'reverse', description: 'fwd cloning primer',
      addedAt: '2026-01-02T00:00:00.000Z', resourceHash: 'h-top',
    });
  });

  it('reads the payload / origin forms (legacy LibraryEntry shape)', () => {
    const entry = {
      id: 'pr2', kind: 'primer',
      payload: {
        sequence: 'ACGTACGT', bindingSequence: 'ACGTAC', tailSequence: 'TTTT',
        tm: 61.4, length: 8, direction: 'forward', tags: ['colony'], addedAt: '2026-02-03T00:00:00.000Z',
        description: 'colony-screen rev',
      },
      origin: { kind: 'paste', status: 'received', resourceHash: 'h-origin2' },
    };
    const out = legacyPrimerToCanonical(entry);
    expect(out.status).toBe('received');           // from origin.status
    expect(out.origin.resourceHash).toBe('h-origin2');
    expect(out.primer).toMatchObject({
      sequence: 'ACGTACGT', bindingSequence: 'ACGTAC', tm: 61.4, length: 8,
      direction: 'forward', addedAt: '2026-02-03T00:00:00.000Z', description: 'colony-screen rev',
      resourceHash: 'h-origin2',                    // falls back to origin.resourceHash
    });
    expect(out.primer.tags).toEqual(['colony']);
    // tail is carried through the tailSequence alias (normalizePrimer canonicalizes to `tail`)
    expect(out.primer.tail ?? out.primer.tailSequence).toBe('TTTT');
  });

  it('defaults status to imported ONLY when the legacy entry truly has none', () => {
    const out = legacyPrimerToCanonical({ id: 'pr3', kind: 'primer', sequence: 'AA' });
    expect(out.status).toBe('imported');
    expect(out.origin).toBeNull();
  });
});

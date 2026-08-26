/**
 * ANN-0L — the canonical imported primer record (v2).
 *
 * The scalar model this replaces could not describe what a source file actually
 * contains, and the loss was silent:
 *
 *   * two `<Primer>` entries or two `primer_bind` features with the same name
 *     or the same oligo collapsed into one row — the biologist ordered two
 *     things and saw one;
 *   * a primer with several binding sites kept only the first;
 *   * a primer with no site, or with no known full oligo, was dropped
 *     entirely rather than shown as an incomplete record;
 *   * a stretch read off the template was published as if it were the full
 *     ordered oligo.
 *
 * Record v2 keeps every source record, `0..N` sites per record, and keeps
 * `sequence` (the full oligo), `annealedSequence` (what anneals) and `tail`
 * as three separate facts — with `null` meaning "unknown", never "absent".
 */
import { describe, it, expect } from 'vitest';

import {
  makePrimerRecord,
  primerRecordsFromSnapGenePacket,
  primerRecordsFromFeatures,
  PRIMER_RECORD_VERSION,
} from '../primer-record';

const TEMPLATE = ('ACGTACGTAC'.repeat(60)).toUpperCase();   // 600 bp
const BIND = TEMPLATE.slice(100, 118);
const TAIL = 'GGATCC';

function rc(seq) {
  return seq.split('').reverse()
    .map((c) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[c] || 'N')).join('');
}

// ── RED 1 — every source record survives, sites are 0..N ────────────────────

describe('ANN-0L/1 — lossless source records', () => {
  it('two identically named SnapGene primers stay two records', () => {
    const packet = [
      { name: 'P', sequence: BIND, sites: [{ start: 100, end: 118, strand: 1 }] },
      { name: 'P', sequence: BIND, sites: [{ start: 200, end: 218, strand: 1 }] },
    ];
    const records = primerRecordsFromSnapGenePacket(packet, { template: TEMPLATE });

    expect(records).toHaveLength(2);
    expect(records[0].id).not.toBe(records[1].id);
    expect(records.map((r) => r.name)).toEqual(['P', 'P']);
  });

  it('a record with NO site is still a record', () => {
    const [rec] = primerRecordsFromSnapGenePacket(
      [{ name: 'orphan', sequence: BIND, sites: [] }], { template: TEMPLATE },
    );
    expect(rec).toBeTruthy();
    expect(rec.sites).toEqual([]);
    expect(rec.sequence).toBe(BIND);
  });

  it('a record with NO known full sequence is still a record', () => {
    const [rec] = primerRecordsFromSnapGenePacket(
      [{ name: 'noSeq', sequence: '', sites: [{ start: 100, end: 118, strand: 1 }] }],
      { template: TEMPLATE },
    );
    expect(rec).toBeTruthy();
    // unknown, not invented from the template
    expect(rec.sequence).toBeNull();
    expect(rec.sequenceSource).toBe('unknown');
    // …but what anneals there IS known
    expect(rec.sites[0].annealedSequence).toBe(BIND);
  });

  it('keeps every binding site in source order', () => {
    const [rec] = primerRecordsFromSnapGenePacket([{
      name: 'multi',
      sequence: BIND,
      sites: [
        { start: 100, end: 118, strand: 1 },
        { start: 200, end: 218, strand: -1 },
        { start: 300, end: 318, strand: 1 },
      ],
    }], { template: TEMPLATE });

    expect(rec.sites).toHaveLength(3);
    expect(rec.sites.map((s) => s.strand)).toEqual([1, -1, 1]);
    expect(rec.sites.map((s) => s.sourceIndex)).toEqual([0, 1, 2]);
  });

  it('a hidden site is kept and marked, never discarded', () => {
    const [rec] = primerRecordsFromSnapGenePacket([{
      name: 'hidden',
      sequence: BIND,
      sites: [{ start: 100, end: 118, strand: 1 }],
      allSites: [
        { start: 100, end: 118, strand: 1 },
        { start: 400, end: 418, strand: -1 },
      ],
    }], { template: TEMPLATE });

    expect(rec.sites).toHaveLength(2);
    const visibility = rec.sites.map((s) => s.sourceVisibility);
    expect(visibility).toContain('shown');
    expect(visibility).toContain('hidden');
  });

  it('a duplicate `simplified` serialisation of one site collapses to one site', () => {
    const [rec] = primerRecordsFromSnapGenePacket([{
      name: 'dupSimplified',
      sequence: BIND,
      sites: [
        { start: 100, end: 118, strand: 1 },
        { start: 100, end: 118, strand: 1, simplified: true },
      ],
    }], { template: TEMPLATE });

    // one biological site, both source forms remembered
    expect(rec.sites).toHaveLength(1);
    expect(rec.sites[0].sourceForms.length).toBeGreaterThan(1);
  });
});

// ── RED 2 — GenBank duplicates are not merged ───────────────────────────────

describe('ANN-0L/2 — duplicate GenBank primer_bind records', () => {
  const feature = (name, start, end, strand = 1, qualifiers = {}) => ({
    type: 'primer_bind', name, start, end, strand, qualifiers,
  });

  it('two primer_bind features with the same name and sequence stay two records', () => {
    const records = primerRecordsFromFeatures([
      feature('P', 100, 118, 1, { primer_seq: BIND }),
      feature('P', 100, 118, 1, { primer_seq: BIND }),
    ], { template: TEMPLATE });

    expect(records).toHaveLength(2);
    expect(records[0].id).not.toBe(records[1].id);
  });

  it('each record remembers where in the file it came from', () => {
    const records = primerRecordsFromFeatures([
      feature('A', 100, 118, 1, { primer_seq: BIND }),
      feature('B', 200, 218, 1, { primer_seq: BIND }),
    ], { template: TEMPLATE, sourceFileName: 'vec.gb' });

    expect(records.map((r) => r.origin.sourceRecordIndex)).toEqual([0, 1]);
    expect(records.every((r) => r.origin.sourceFileName === 'vec.gb')).toBe(true);
  });

  it('a primer_bind with no usable oligo is still listed', () => {
    const [rec] = primerRecordsFromFeatures(
      [feature('bare', 100, 118, 1)], { template: TEMPLATE },
    );
    expect(rec).toBeTruthy();
    expect(rec.sequence).toBeNull();
    expect(rec.sites[0].annealedSequence).toBe(BIND);
  });
});

// ── three separate facts ────────────────────────────────────────────────────

describe('ANN-0L — full oligo, annealed part and tail are distinct', () => {
  it('a sourced tailed oligo proves its tail', () => {
    const [rec] = primerRecordsFromFeatures([{
      type: 'primer_bind', name: 'tailed', start: 100, end: 118, strand: 1,
      qualifiers: { primer_seq: TAIL + BIND },
    }], { template: TEMPLATE });

    expect(rec.sequence).toBe(TAIL + BIND);
    expect(rec.sites[0].annealedSequence).toBe(BIND);
    expect(rec.sites[0].tail).toBe(TAIL);
  });

  it('a template-derived stretch is never published as the full oligo', () => {
    const [rec] = primerRecordsFromFeatures([{
      type: 'primer_bind', name: 'derived', start: 100, end: 118, strand: 1,
      qualifiers: {},
    }], { template: TEMPLATE });

    expect(rec.sequence).toBeNull();          // unknown full oligo
    expect(rec.sites[0].annealedSequence).toBe(BIND);
    expect(rec.sites[0].tail).toBeNull();     // unprovable, not ''
  });

  it('a reverse site anneals as the reverse complement', () => {
    const [rec] = primerRecordsFromFeatures([{
      type: 'primer_bind', name: 'rev', start: 100, end: 118, strand: -1,
      qualifiers: {},
    }], { template: TEMPLATE });

    expect(rec.sites[0].annealedSequence).toBe(rc(BIND));
    expect(rec.sites[0].strand).toBe(-1);
  });

  it('tail is "" only when the sourced oligo demonstrably has none', () => {
    const [rec] = primerRecordsFromFeatures([{
      type: 'primer_bind', name: 'flush', start: 100, end: 118, strand: 1,
      qualifiers: { primer_seq: BIND },
    }], { template: TEMPLATE });

    expect(rec.sites[0].tail).toBe('');
  });
});

describe('ANN-0L — record shape', () => {
  it('carries the schema version and a stable id', () => {
    const rec = makePrimerRecord({ name: 'x' });
    expect(rec.schemaVersion).toBe(PRIMER_RECORD_VERSION);
    expect(typeof rec.id).toBe('string');
    expect(rec.id.length).toBeGreaterThan(0);
    expect(rec.sites).toEqual([]);
    expect(rec.sequence).toBeNull();
  });

  it('never invents a direction — strand lives on the site', () => {
    const rec = makePrimerRecord({ name: 'x' });
    expect(rec.direction ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANN-0L - a primer_bind that crosses the origin is a compound location.
//
// Flattening it to one start/end pair produces the wrap sentinel (end <= start),
// which downstream reads as an inverted or out-of-range span - so the primer
// either disappears from the map or is drawn in the wrong place.
// ---------------------------------------------------------------------------
describe('primerRecordsFromFeatures - origin-crossing binding', () => {
  const TEMPLATE = 'ACGTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTGGCC'; // 51 nt

  const wrapFeature = {
    type: 'primer_bind',
    name: 'wrap-fwd',
    location: { kind: 'join', segments: [{ start: 47, end: 51 }, { start: 0, end: 4 }] },
    start: 47,
    end: 4,          // the scalar wrap sentinel: end <= start
    strand: 1,
    qualifiers: { primer_seq: 'GGCCACGT' },
  };

  it('keeps BOTH segments in the canonical site', () => {
    const [rec] = primerRecordsFromFeatures([wrapFeature], { template: TEMPLATE, entryId: 'E1' });
    expect(rec.sites).toHaveLength(1);
    expect(rec.sites[0].location.kind).toBe('join');
    expect(rec.sites[0].location.segments).toEqual([{ start: 47, end: 51 }, { start: 0, end: 4 }]);
  });

  it('reads the annealed stretch across the origin, in traversal order', () => {
    const [rec] = primerRecordsFromFeatures([wrapFeature], { template: TEMPLATE, entryId: 'E1' });
    expect(rec.sites[0].annealedSequence).toBe('GGCCACGT');
  });

  it('proves an absent tail for an oligo that equals the annealed stretch', () => {
    const [rec] = primerRecordsFromFeatures([wrapFeature], { template: TEMPLATE, entryId: 'E1' });
    expect(rec.sequence).toBe('GGCCACGT');
    expect(rec.sites[0].tail).toBe('');
  });

  it('still handles a plain single-segment feature', () => {
    const [rec] = primerRecordsFromFeatures([{
      type: 'primer_bind', name: 'plain', start: 4, end: 12, strand: 1, qualifiers: {},
    }], { template: TEMPLATE, entryId: 'E1' });
    expect(rec.sites[0].location.kind).toBe('single');
    expect(rec.sites[0].location.segments).toEqual([{ start: 4, end: 12 }]);
  });
});

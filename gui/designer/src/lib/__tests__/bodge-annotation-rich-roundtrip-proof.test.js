/**
 * bodge-annotation-rich-roundtrip-proof.test.js — ANN-INTEGRITY seam BG-033
 * (observable point 6). The `.bodge` GenBank bridge must preserve ordered
 * segments, strand, level, the canonical `regionId` link (via /parent_feature),
 * the opaque id, and repeated / flag / unknown INSDC qualifiers.
 *
 * Negative control: the pre-fix writer never emitted `ann.qualifiers`, so the
 * rich qualifier assertions fail; and the reader mapped /parent_feature only to
 * the legacy `parentId`, so the canonical `regionId` assertion fails. That is
 * the RED for this seam.
 */
import { describe, it, expect } from 'vitest';
import {
  writeContainerToGenBank,
  readContainerFromGenBank,
} from '../bodge-container-genbank';
import { getSegments, makeLocation, LOCATION_KINDS } from '../annotation-location';

const container = {
  id: 'c-op-1',
  name: 'opGene',
  topology: 'linear',
  version: 1,
  sequence: 'ACGT'.repeat(15), // 60 nt
  annotations: [
    { id: 'reg-op', name: 'operon', type: 'CDS', start: 0, end: 60, strand: 1, level: 'region' },
    // A canonical type that maps to a LOSSY GenBank type (marker → CDS).
    { id: 'mk', name: 'AmpR', type: 'marker', start: 20, end: 40, strand: 1, level: 'region' },
    {
      id: 'det-op',
      name: 'domainX',
      type: 'domain',
      strand: -1,
      level: 'detail',
      regionId: 'reg-op', // canonical parent link (not legacy parentId)
      location: makeLocation(LOCATION_KINDS.JOIN, [
        { start: 3, end: 9 },
        { start: 12, end: 18 },
      ]),
      start: 3,
      end: 18,
      qualifiers: {
        gene: 'lacZ',
        db_xref: ['taxon:562', 'GI:12345'], // repeated qualifier → array
        pseudo: true,                        // valueless flag
        EC_number: '3.2.1.23',               // arbitrary lab-tracked key
      },
    },
  ],
};

function roundTrip() {
  const gb = writeContainerToGenBank(container);
  const back = readContainerFromGenBank(gb);
  return back.annotations.find((a) => a.id === 'det-op' || a.name === 'domainX');
}

describe('.bodge rich annotation round-trip', () => {
  it('preserves ordered compound segments and strand', () => {
    const det = roundTrip();
    expect(det).toBeTruthy();
    expect(getSegments(det)).toEqual([{ start: 3, end: 9 }, { start: 12, end: 18 }]);
    expect(det.strand).toBe(-1);
  });

  it('preserves level and the opaque id', () => {
    const det = roundTrip();
    expect(det.level).toBe('detail');
    expect(det.id).toBe('det-op');
  });

  it('maps /parent_feature to the canonical regionId', () => {
    const det = roundTrip();
    expect(det.regionId).toBe('reg-op');
  });

  it('preserves the canonical Bodge type even when it maps to a lossy GenBank type', () => {
    const gb = writeContainerToGenBank(container);
    const back = readContainerFromGenBank(gb);
    const mk = back.annotations.find((a) => a.id === 'mk');
    expect(mk).toBeTruthy();
    expect(mk.type).toBe('marker'); // NOT flattened to 'CDS'
  });

  it('preserves repeated, flag and unknown qualifiers', () => {
    const det = roundTrip();
    expect(det.qualifiers).toBeTruthy();
    expect(det.qualifiers.gene).toBe('lacZ');
    expect(det.qualifiers.db_xref).toEqual(['taxon:562', 'GI:12345']);
    expect(det.qualifiers.pseudo).toBe(true);
    expect(det.qualifiers.EC_number).toBe('3.2.1.23');
  });
});

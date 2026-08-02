/**
 * U5-B P1 — the annotation no-op guard must not be a data-loss bug, and the version stamp must
 * accept exactly what the reading end accepts.
 *
 * The guard exists so that opening a molecule (which hands the same annotations straight back to the
 * safety-net) does not replace the entry object and age the search corpus. That is worth having, but
 * only while «the same» means the same. A field-list comparison made `qualifiers.product`, `gene`,
 * `EC_number`, `codon_start`, `transl_table`, colours and notes invisible: an edit to any of them
 * compared equal, the write was cancelled, and the change was dropped from the store AND from Dexie
 * with nothing reported. These contracts pin equality to the RECORD, not to a list of fields somebody
 * remembered.
 */
import { describe, it, expect } from 'vitest';
import { sameAnnotationSet, withEntryVersion, isEntryVersion } from '../library-entry-normalize';

const CDS = {
  id: 'f1', level: 'region', type: 'CDS', name: 'glaA', start: 12, end: 480, strand: 1,
  qualifiers: { product: 'glucoamylase', gene: 'glaA', EC_number: '3.2.1.3', codon_start: 1 },
};

describe('sameAnnotationSet — equality is over the WHOLE record', () => {
  it('an exact copy is a no-op — deep, not by reference', () => {
    expect(sameAnnotationSet([CDS], [JSON.parse(JSON.stringify(CDS))])).toBe(true);
    expect(sameAnnotationSet([], [])).toBe(true);
    expect(sameAnnotationSet(undefined, [])).toBe(true);
  });

  it('a change to qualifiers.product is a REAL change — the data-loss case', () => {
    const edited = { ...CDS, qualifiers: { ...CDS.qualifiers, product: 'glucoamylase precursor' } };
    expect(sameAnnotationSet([CDS], [edited])).toBe(false);
  });

  it('every other qualifier a biologist actually edits is visible too', () => {
    const q = (over) => [{ ...CDS, qualifiers: { ...CDS.qualifiers, ...over } }];
    expect(sameAnnotationSet([CDS], q({ gene: 'glaB' })), 'gene').toBe(false);
    expect(sameAnnotationSet([CDS], q({ EC_number: '3.2.1.1' })), 'EC_number').toBe(false);
    expect(sameAnnotationSet([CDS], q({ codon_start: 2 })), 'codon_start').toBe(false);
    expect(sameAnnotationSet([CDS], q({ transl_table: 11 })), 'transl_table').toBe(false);
    expect(sameAnnotationSet([CDS], q({ note: 'checked by RT-PCR' })), 'an added note').toBe(false);
    // …and REMOVING a qualifier is a change as much as adding one.
    const stripped = { ...CDS, qualifiers: { product: 'glucoamylase' } };
    expect(sameAnnotationSet([CDS], [stripped]), 'a removed qualifier').toBe(false);
  });

  it('non-qualifier fields outside the old list are visible — colour, note, anything', () => {
    expect(sameAnnotationSet([CDS], [{ ...CDS, color: '#ff0000' }])).toBe(false);
    expect(sameAnnotationSet([{ ...CDS, color: '#ff0000' }], [CDS])).toBe(false);
    expect(sameAnnotationSet([CDS], [{ ...CDS, notes: 'sequenced' }])).toBe(false);
  });

  it('the annotation contract itself is still pinned — id and the [start,end) span', () => {
    expect(sameAnnotationSet([CDS], [{ ...CDS, id: 'f2' }]), 'id').toBe(false);
    expect(sameAnnotationSet([CDS], [{ ...CDS, start: 13 }]), 'start').toBe(false);
    expect(sameAnnotationSet([CDS], [{ ...CDS, end: 481 }]), 'end (exclusive)').toBe(false);
    expect(sameAnnotationSet([CDS], [{ ...CDS, strand: -1 }]), 'strand').toBe(false);
    expect(sameAnnotationSet([CDS], [{ ...CDS, level: 'detail' }]), 'level').toBe(false);
    expect(sameAnnotationSet([CDS], [{ ...CDS, regionId: 'r9' }]), 'regionId link').toBe(false);
    expect(sameAnnotationSet([CDS], [CDS, CDS]), 'a different count').toBe(false);
    expect(sameAnnotationSet([CDS, { id: 'f2' }], [{ id: 'f2' }, CDS]), 'reordered').toBe(false);
  });

  it('key ORDER is not data — the same record serialised differently is still the same record', () => {
    const reordered = { qualifiers: { ...CDS.qualifiers }, strand: 1, end: 480, start: 12, name: 'glaA', type: 'CDS', level: 'region', id: 'f1' };
    expect(sameAnnotationSet([CDS], [reordered])).toBe(true);
  });

  it('nested and empty values compare structurally, not by identity', () => {
    expect(sameAnnotationSet([{ id: 'a', qualifiers: null }], [{ id: 'a', qualifiers: null }])).toBe(true);
    // `null` and «absent» are not the same record: one round-trips through Dexie as a field, the other does not.
    expect(sameAnnotationSet([{ id: 'a', qualifiers: null }], [{ id: 'a' }])).toBe(false);
    expect(sameAnnotationSet([{ id: 'a', xs: [1, 2] }], [{ id: 'a', xs: [1, 2] }])).toBe(true);
    expect(sameAnnotationSet([{ id: 'a', xs: [1, 2] }], [{ id: 'a', xs: [2, 1] }])).toBe(false);
  });
});

describe('withEntryVersion — the same predicate as the reading end', () => {
  it('a valid counter is never overwritten', () => {
    expect(withEntryVersion({ id: 'e', version: 7 }).version).toBe(7);
    expect(withEntryVersion({ id: 'e', version: 1 }).version).toBe(1);
  });

  it('anything that is not a positive safe integer is replaced, not preserved', () => {
    // `Number.isFinite` used to pass these. A fractional or string «version» names nothing, and it
    // breaks every ordering comparison built on top of it.
    for (const bad of [1.5, 0, -3, NaN, Infinity, '2', null, undefined, Number.MAX_SAFE_INTEGER + 2]) {
      expect(withEntryVersion({ id: 'e', version: bad }).version, String(bad)).toBe(1);
      expect(isEntryVersion(bad), String(bad)).toBe(false);
    }
  });

  it('a non-object passes through untouched', () => {
    expect(withEntryVersion(null)).toBeNull();
    expect(withEntryVersion(undefined)).toBeUndefined();
  });
});

/**
 * search-pick-route — kind-aware routing of a picked search result (REV #2 §10.4/§10.5).
 * One `onPickSearchResult(entityRef, occurrence)` → a discriminated action the surface
 * dispatches. Routing is by entityRef.kind so an entry / project / primer sharing a local
 * id never collide; entityRef.id stays RAW (nav channel / store lookup).
 */
import { describe, it, expect } from 'vitest';
import { resolveSearchPick } from '../search-pick-route';

describe('resolveSearchPick — route by kind (§10.4)', () => {
  const occ = { location: { segments: [{ start: 3, end: 9 }], strand: '+', wrapsOrigin: false } };

  it('entry → openMolecule with raw id + the occurrence to jump to', () => {
    expect(resolveSearchPick({ kind: 'entry', id: 'e1' }, occ))
      .toEqual({ type: 'openMolecule', id: 'e1', occurrence: occ, revision: null, docEpoch: null });
  });

  it('carries the REVISION the result was computed on — the sink must not re-stamp it (U5-B)', () => {
    // A hit found on version 1 does not describe version 2. Deriving the revision at click time from
    // the entry as it is NOW makes every stale result look fresh, which is precisely the guard this
    // field exists to feed.
    expect(resolveSearchPick({ kind: 'entry', id: 'e1', revision: 1 }, occ).revision).toBe(1);
    expect(resolveSearchPick({ kind: 'entry', id: 'e1', revision: 7 }, occ).revision).toBe(7);
    // …and an unidentifiable result stays unidentifiable rather than borrowing «current».
    expect(resolveSearchPick({ kind: 'entry', id: 'e1' }, occ).revision).toBeNull();
    // The document epoch travels the same way: created by the search, never re-derived on click.
    expect(resolveSearchPick({ kind: 'entry', id: 'e1', docEpoch: 'v3#g4' }, occ).docEpoch).toBe('v3#g4');
    expect(resolveSearchPick({ kind: 'entry', id: 'e1' }, occ).docEpoch).toBeNull();
  });
  it('project → activateProject', () => {
    expect(resolveSearchPick({ kind: 'project', id: 'p1' })).toEqual({ type: 'activateProject', id: 'p1' });
  });
  it('primer → openPrimer (pool + selectedPrimerId)', () => {
    expect(resolveSearchPick({ kind: 'primer', id: 'pr1' })).toEqual({ type: 'openPrimer', id: 'pr1' });
  });
  it('enzyme → openEnzymeCard (a card — NOT a re: query rewrite / site-scan)', () => {
    const a = resolveSearchPick({ kind: 'enzyme', id: 'EcoRI' });
    expect(a).toEqual({ type: 'openEnzymeCard', id: 'EcoRI' });
    expect(a.type).not.toBe('reScan'); // the site-scan is a SEPARATE action on the card
  });

  it('COLLISION — the SAME local id under entry / project / primer routes distinctly by kind', () => {
    const id = 'x';
    const types = ['entry', 'project', 'primer'].map((kind) => resolveSearchPick({ kind, id }).type);
    expect(types).toEqual(['openMolecule', 'activateProject', 'openPrimer']);
    expect(new Set(types).size).toBe(3); // no cross-kind collision
  });

  it('a missing / kindless ref → a safe no-op (never a mis-routed entry)', () => {
    expect(resolveSearchPick(null).type).toBe('none');
    expect(resolveSearchPick({ id: 'x' }).type).toBe('none');
    expect(resolveSearchPick({ kind: 'entry' }).type).toBe('none');
    expect(resolveSearchPick({ kind: 'reSite', id: 'z' }).type).toBe('unknown'); // future kind, not silently an entry
  });
});

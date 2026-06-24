/**
 * RS-C2 — the scan/digest/search engine sees user-defined custom enzymes ON TOP
 * of the 63 built-ins, via a module-level registry that customEnzymesSlice pushes
 * to (no store import in restriction-db → no circular dep). Empty registry =
 * byte-identical to the built-in-only behaviour. Bio-invariant: Type II only.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  RE_ENZYMES,
  setCustomEnzymeRegistry,
  effectiveEnzymes,
  scanAllSites,
  searchRE,
  digest,
  findSitesInSequence,
} from '../restriction-db.js';
import { normalizeCustomEnzyme } from '../lib/custom-enzymes.js';
import { useStore } from '../store/index.js';
import { resetDBForTests } from '../db/dexie-schema.js';

// A custom enzyme whose site (AAATTT, palindrome) matches NO built-in.
const XYZ = normalizeCustomEnzyme({ name: 'XyzI', site: 'AAATTT', cut: [3, 3] }, { id: 'x1' });

afterEach(() => setCustomEnzymeRegistry({}));

describe('custom enzyme registry — effectiveEnzymes / scan / search', () => {
  it('effectiveEnzymes equals the built-ins when the registry is empty', () => {
    setCustomEnzymeRegistry({});
    expect(effectiveEnzymes()).toBe(RE_ENZYMES); // same ref → identical behaviour
  });

  it('effectiveEnzymes layers the custom enzyme over the built-ins', () => {
    setCustomEnzymeRegistry({ XyzI: XYZ });
    const eff = effectiveEnzymes();
    expect(eff.XyzI).toBeTruthy();
    expect(eff.EcoRI).toBeTruthy();
    expect(Object.keys(eff).length).toBe(Object.keys(RE_ENZYMES).length + 1);
  });

  it('scanAllSites finds the custom enzyme site', () => {
    const seq = `GGGG${'AAATTT'}GGGG`; // one XyzI site
    expect(scanAllSites(seq).some((s) => s.enzyme === 'XyzI')).toBe(false); // not yet registered
    setCustomEnzymeRegistry({ XyzI: XYZ });
    const hit = scanAllSites(seq).find((s) => s.enzyme === 'XyzI');
    expect(hit).toBeTruthy();
    expect(hit.cutCount).toBe(1);
    expect(hit.isUnique).toBe(true);
  });

  it('searchRE finds the custom enzyme by name', () => {
    setCustomEnzymeRegistry({ XyzI: XYZ });
    expect(searchRE('XyzI').some(([n]) => n === 'XyzI')).toBe(true);
  });

  it('findSitesInSequence resolves a custom enzyme name', () => {
    setCustomEnzymeRegistry({ XyzI: XYZ });
    expect(findSitesInSequence('XyzI', 'GGGGAAATTTGGGG')).toHaveLength(1);
  });

  it('digest cuts with a custom enzyme (no «Unknown enzyme»)', () => {
    const cust = normalizeCustomEnzyme({ name: 'CustI', site: 'GAATTC', cut: [1, 5] }, { id: 'c1' });
    setCustomEnzymeRegistry({ CustI: cust });
    const seq = 'AAAAGAATTCAAAA'; // one CustI site, treated as circular
    const r = digest(seq, [], 'CustI');
    expect(r.error).toBeUndefined();
    expect(r.backbone).toBeTruthy();
  });

  it('resetting the registry removes the custom enzyme from scans', () => {
    setCustomEnzymeRegistry({ XyzI: XYZ });
    expect(scanAllSites('GGGGAAATTTGGGG').some((s) => s.enzyme === 'XyzI')).toBe(true);
    setCustomEnzymeRegistry({});
    expect(scanAllSites('GGGGAAATTTGGGG').some((s) => s.enzyme === 'XyzI')).toBe(false);
  });
});

describe('customEnzymesSlice → registry sync (integration)', () => {
  beforeEach(async () => {
    const db = resetDBForTests(`bodge-c2-${Math.random().toString(36).slice(2)}`);
    await db.delete();
    await db.open();
    useStore.setState((s) => { s.customEnzymes.byId = {}; s.customEnzymes.sets = {}; s.customEnzymes._hydrated = false; });
    setCustomEnzymeRegistry({});
  });

  it('addCustomEnzyme makes scanAllSites see the new enzyme', async () => {
    await useStore.getState().addCustomEnzyme({ name: 'XyzI', site: 'AAATTT', cut: [3, 3] });
    const hit = scanAllSites('GGGGAAATTTGGGG').find((s) => s.enzyme === 'XyzI');
    expect(hit).toBeTruthy();
  });

  it('removeCustomEnzyme drops it from scanAllSites again', async () => {
    const { id } = await useStore.getState().addCustomEnzyme({ name: 'XyzI', site: 'AAATTT', cut: [3, 3] });
    await useStore.getState().removeCustomEnzyme(id);
    expect(scanAllSites('GGGGAAATTTGGGG').some((s) => s.enzyme === 'XyzI')).toBe(false);
  });
});

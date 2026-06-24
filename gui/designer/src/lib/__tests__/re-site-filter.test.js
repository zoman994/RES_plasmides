/**
 * RS-B1 — one shared RE-site visibility filter for BOTH chokepoints (the circular
 * map PlasmidMapV2 + the linear SequenceView). Replaces the duplicated
 * unique/double/enzyme-list logic and adds an N-cut mode + an enzyme allow-list
 * (the «active set», RS-C4). Pure; operates on scanAllSites' grouped result.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { filterReSites } from '../re-site-filter.js';
import { flattenSites } from '../../components/SequenceView/lib/feature-map.js';
import { setCustomEnzymeRegistry } from '../../restriction-db.js';

const SCAN = [
  { enzyme: 'EcoRI', cutCount: 1, isUnique: true, positions: [{ position: 10 }] },
  { enzyme: 'BamHI', cutCount: 2, isUnique: false, positions: [{ position: 20 }, { position: 40 }] },
  { enzyme: 'HindIII', cutCount: 3, isUnique: false, positions: [{ position: 5 }, { position: 25 }, { position: 60 }] },
];

afterEach(() => setCustomEnzymeRegistry({}));

describe('filterReSites', () => {
  it('mode «all» keeps everything', () => {
    expect(filterReSites(SCAN, { mode: 'all' }).map((s) => s.enzyme)).toEqual(['EcoRI', 'BamHI', 'HindIII']);
  });
  it('mode «unique» keeps only single cutters', () => {
    expect(filterReSites(SCAN, { mode: 'unique' }).map((s) => s.enzyme)).toEqual(['EcoRI']);
  });
  it('mode «double» keeps cutCount ≤ 2', () => {
    expect(filterReSites(SCAN, { mode: 'double' }).map((s) => s.enzyme)).toEqual(['EcoRI', 'BamHI']);
  });
  it('mode «ncut» keeps exactly N cutters', () => {
    expect(filterReSites(SCAN, { mode: 'ncut', cutCount: 3 }).map((s) => s.enzyme)).toEqual(['HindIII']);
    expect(filterReSites(SCAN, { mode: 'ncut', cutCount: 2 }).map((s) => s.enzyme)).toEqual(['BamHI']);
  });
  it('enzyme allow-list keeps only the listed enzymes (active set)', () => {
    expect(filterReSites(SCAN, { enzymes: ['EcoRI', 'HindIII'] }).map((s) => s.enzyme)).toEqual(['EcoRI', 'HindIII']);
  });
  it('allow-list + cut-count mode compose', () => {
    expect(filterReSites(SCAN, { enzymes: ['BamHI', 'HindIII'], mode: 'unique' })).toEqual([]);
    expect(filterReSites(SCAN, { enzymes: ['BamHI', 'HindIII'], mode: 'double' }).map((s) => s.enzyme)).toEqual(['BamHI']);
  });
  it('empty allow-list is treated as «no allow-list» (keep all)', () => {
    expect(filterReSites(SCAN, { enzymes: [] }).map((s) => s.enzyme)).toEqual(['EcoRI', 'BamHI', 'HindIII']);
  });
  it('tolerates a non-array input', () => {
    expect(filterReSites(null, { mode: 'unique' })).toEqual([]);
  });
});

describe('flattenSites uses the shared filter + effectiveEnzymes for cut offset', () => {
  it('back-compat: a string filterMode still filters by unique/double', () => {
    expect(flattenSites(SCAN, 'unique').map((r) => r.enzyme)).toEqual(['EcoRI']);
  });
  it('accepts an options object (new N-cut mode)', () => {
    // flattenSites emits one entry per cut position → BamHI (2 cuts) → 2 rows.
    expect([...new Set(flattenSites(SCAN, { mode: 'ncut', cutCount: 2 }).map((r) => r.enzyme))]).toEqual(['BamHI']);
  });
  it('cut offset for a CUSTOM enzyme resolves via the registry (RS-C2)', () => {
    setCustomEnzymeRegistry({ MyR: { name: 'MyR', site: 'AAATTT', cut: [2, 4] } });
    const out = flattenSites([{ enzyme: 'MyR', cutCount: 1, isUnique: true, positions: [{ position: 100 }] }], 'all');
    expect(out).toEqual([{ enzyme: 'MyR', position: 102 }]); // 100 + cut[0]=2
  });
});

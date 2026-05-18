/**
 * export-genbank — pure builder tests + zip bundling.
 */
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { entryToGenbank, buildProjectZipBytes } from '../export-genbank';

function makeEntry(over = {}) {
  return {
    id: over.id || 'e1',
    name: over.name || 'pUC19',
    payload: {
      // Use ?? so callers can explicitly pass `sequence: ''`.
      sequence: over.sequence ?? 'atgcatgcatgc',
      annotations: over.annotations || [
        { id: 'a1', start: 0, end: 12, type: 'CDS', name: 'AmpR', strand: 1, level: 'region' },
      ],
      topology: over.topology || 'circular',
    },
  };
}

describe('entryToGenbank', () => {
  it('emits LOCUS with correct length, topology, FEATURES + ORIGIN, terminating //', () => {
    const gb = entryToGenbank(makeEntry({ sequence: 'atgcatgcatgcatgc' }));
    expect(gb).toMatch(/^LOCUS\s+pUC19\s+16 bp\s+DNA\s+circular/);
    expect(gb).toMatch(/^DEFINITION\s+pUC19/m);
    expect(gb).toMatch(/^FEATURES\s+Location\/Qualifiers$/m);
    expect(gb).toMatch(/^ORIGIN$/m);
    expect(gb.trim().endsWith('//')).toBe(true);
  });

  it('renders annotations with location + label qualifier; complement(...) for strand=-1', () => {
    const gb = entryToGenbank(makeEntry({
      annotations: [
        { id: 'a1', start: 0, end: 6, type: 'CDS', name: 'fwdGene', strand: 1, level: 'region' },
        { id: 'a2', start: 6, end: 12, type: 'CDS', name: 'revGene', strand: -1, level: 'region' },
      ],
    }));
    expect(gb).toMatch(/CDS\s+1\.\.6/);
    expect(gb).toMatch(/\/label="fwdGene"/);
    expect(gb).toMatch(/CDS\s+complement\(7\.\.12\)/);
    expect(gb).toMatch(/\/label="revGene"/);
  });

  it('linear topology surfaces as "linear" not "circular"', () => {
    const gb = entryToGenbank(makeEntry({ topology: 'linear' }));
    expect(gb).toMatch(/^LOCUS.*\s+linear\s+SYN/);
  });

  it('writes ORIGIN sequence in 60-bp lines, lowercase, with positional offset', () => {
    const seq = 'A'.repeat(70);
    const gb = entryToGenbank(makeEntry({ sequence: seq, annotations: [] }));
    // First positional line begins at column 1; second at 61.
    expect(gb).toMatch(/^\s+1 a{10} a{10} a{10} a{10} a{10} a{10}$/m);
    expect(gb).toMatch(/^\s+61 a{10}$/m);
  });
});

describe('buildProjectZipBytes', () => {
  it('produces a zip whose entries match `<safeName>.gb` and contain the per-entry GenBank', () => {
    const e1 = makeEntry({ id: 'e1', name: 'pUC19', sequence: 'aaaaaaaa' });
    const e2 = makeEntry({ id: 'e2', name: 'pET28b', sequence: 'cccccccc' });
    const { bytes, written } = buildProjectZipBytes('MyProject', [e1, e2]);
    expect(written).toBe(2);
    const unzipped = unzipSync(bytes);
    expect(Object.keys(unzipped).sort()).toEqual(['pET28b.gb', 'pUC19.gb']);
    expect(strFromU8(unzipped['pUC19.gb'])).toMatch(/^LOCUS\s+pUC19/);
    expect(strFromU8(unzipped['pET28b.gb'])).toMatch(/^LOCUS\s+pET28b/);
  });

  it('skips entries with empty sequence', () => {
    const empty = makeEntry({ id: 'x', name: 'no-seq', sequence: '' });
    const ok = makeEntry({ id: 'y', name: 'ok' });
    const { written } = buildProjectZipBytes('P', [empty, ok]);
    expect(written).toBe(1);
  });

  it('deduplicates colliding filenames with __N suffix', () => {
    const a = makeEntry({ id: 'a', name: 'plasmid' });
    const b = makeEntry({ id: 'b', name: 'plasmid' });
    const { bytes, written } = buildProjectZipBytes('P', [a, b]);
    expect(written).toBe(2);
    const names = Object.keys(unzipSync(bytes)).sort();
    expect(names).toEqual(['plasmid.gb', 'plasmid__2.gb']);
  });

  it('sanitises names with filesystem-unsafe characters (consecutive runs collapse)', () => {
    const e = makeEntry({ name: 'pBad/Name:test*?' });
    const { bytes } = buildProjectZipBytes('P', [e]);
    const names = Object.keys(unzipSync(bytes));
    // /, :, then the *? run together → three underscores.
    expect(names[0]).toBe('pBad_Name_test_.gb');
    // No filesystem-unsafe characters survived in the final filename.
    expect(/[\\/:*?"<>|]/.test(names[0])).toBe(false);
  });
});

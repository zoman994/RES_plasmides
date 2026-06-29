/**
 * export-genbank — pure builder tests + zip bundling.
 */
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { entryToGenbank, buildProjectZipBytes } from '../export-genbank';
import { parseGenBank } from '../../genbank-parser';

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

  it('FEAT-QUALIFIERS — round-trips preserved INSDC qualifiers (export → re-parse)', () => {
    const gb = entryToGenbank(makeEntry({
      annotations: [
        { id: 'a1', start: 0, end: 12, type: 'CDS', name: 'glaA', strand: 1, level: 'region',
          qualifiers: { gene: 'glaA', product: 'glucoamylase', note: 'fungal', EC_number: '3.2.1.3' } },
      ],
    }));
    expect(gb).toMatch(/\/gene="glaA"/);
    expect(gb).toMatch(/\/product="glucoamylase"/);
    expect(gb).toMatch(/\/note="fungal"/);
    expect(gb).toMatch(/\/EC_number="3\.2\.1\.3"/);
    // the parser reads them back as feature qualifiers
    const parsed = parseGenBank(gb);
    const cds = (parsed.features || []).find((f) => f.type === 'CDS');
    expect(cds && cds.qualifiers && cds.qualifiers.product).toBe('glucoamylase');
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

describe('entryToGenbank — spliced CDS join()', () => {
  const spliced = (strand) => [
    { id: 'cds1', start: 0, end: 30, type: 'CDS', name: 'glaA', strand, level: 'region' },
    { id: 'i1', start: 10, end: 20, type: 'intron', name: 'интрон 1', strand, level: 'detail', regionId: 'cds1' },
  ];

  it('writes a spliced CDS as join(exons) and round-trips the exons through the parser', () => {
    const gb = entryToGenbank(makeEntry({ sequence: 'a'.repeat(30), annotations: spliced(1) }));
    expect(gb).toMatch(/CDS\s+join\(1\.\.10,21\.\.30\)/);
    const parsed = parseGenBank(gb);
    const cds = parsed.features.find((f) => f.type === 'CDS');
    expect(cds.qualifiers.exons).toEqual([{ start: 0, end: 10 }, { start: 20, end: 30 }]);
  });

  it('reverse-strand spliced CDS → complement(join(...))', () => {
    const gb = entryToGenbank(makeEntry({ sequence: 'a'.repeat(30), annotations: spliced(-1) }));
    expect(gb).toMatch(/CDS\s+complement\(join\(1\.\.10,21\.\.30\)\)/);
  });

  it('a single-exon CDS (no introns) keeps a plain span', () => {
    const gb = entryToGenbank(makeEntry({
      annotations: [{ id: 'c', start: 0, end: 12, type: 'CDS', name: 'x', strand: 1, level: 'region' }],
    }));
    expect(gb).toMatch(/CDS\s+1\.\.12/);
    expect(gb).not.toMatch(/join\(/);
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

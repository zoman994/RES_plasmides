/**
 * buildEntriesFromImportResults — maps the output of
 * `handleFilesImport` (file-import.js) into library entries, separating
 * out parse failures. Used by the assembly picker's inline file-import
 * (Игорь «нужна возможность импортировать файл прямо в сборке») so a
 * dropped .gb/.fasta/.dna lands in the library + becomes a segment
 * source without a detour through the Library workspace.
 */
import { describe, it, expect } from 'vitest';
import { buildEntriesFromImportResults } from '../build-library-entry';

const okItem = {
  name: 'pUC19', sequence: 'ATGCATGCATGC', length: 12, topology: 'circular',
  annotations: [{ start: 0, end: 4, name: 'x', level: 'region' }], _fileName: 'pUC19.gb',
};

describe('buildEntriesFromImportResults', () => {
  it('maps a good parsed item to a container library entry (origin file_import)', () => {
    const { entries, errors } = buildEntriesFromImportResults([okItem]);
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.kind).toBe('container');
    expect(e.name).toBe('pUC19');
    expect(typeof e.id).toBe('string');
    expect(e.payload.sequence).toBe('ATGCATGCATGC');
    expect(e.payload.topology).toBe('circular');
    expect(e.payload.annotations).toHaveLength(1);
    expect(e.payload.origin.kind).toBe('file_import');
    expect(e.payload.origin.sourceFile).toBe('pUC19.gb');
  });

  it('separates parse-failure items (_error) into errors, not entries', () => {
    const { entries, errors } = buildEntriesFromImportResults([
      okItem,
      { _fileName: 'broken.dna', _error: 'backend down', sequence: '' },
    ]);
    expect(entries).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].name).toBe('broken.dna');
    expect(errors[0].error).toMatch(/backend/);
  });

  it('skips items with no sequence (degenerate parse) as an error', () => {
    const { entries, errors } = buildEntriesFromImportResults([
      { name: 'empty', sequence: '', _fileName: 'empty.fasta' },
    ]);
    expect(entries).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].name).toBe('empty.fasta');
  });

  it('falls back to file name when the parsed item has no name', () => {
    const { entries } = buildEntriesFromImportResults([
      { sequence: 'ACGT', _fileName: 'mystery.fa' },
    ]);
    expect(entries[0].name).toBe('mystery.fa');
  });

  it('each entry gets a distinct id', () => {
    const { entries } = buildEntriesFromImportResults([
      { ...okItem, _fileName: 'a.gb' },
      { ...okItem, _fileName: 'b.gb' },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0].id).not.toBe(entries[1].id);
  });

  it('handles empty / nullish input gracefully', () => {
    expect(buildEntriesFromImportResults([])).toEqual({ entries: [], errors: [] });
    expect(buildEntriesFromImportResults(null)).toEqual({ entries: [], errors: [] });
  });
});

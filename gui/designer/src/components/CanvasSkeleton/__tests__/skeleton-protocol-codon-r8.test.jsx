/**
 * skeleton-protocol-codon-r8.test.jsx — Codon stats в protocol export.
 *
 * R8-2 (14.05.2026). Если output container имеет CDS annotation,
 * protocol должен показать codon usage stats и rare codons.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { buildProtocol } from '../canvas/operations/protocol-export';

describe('R8-2 — protocol export codon block', () => {
  it('Output с CDS annotation → "Codon usage" section', () => {
    const containers = [
      {
        id: 'amplicon-1', kind: 'molecule', name: 'MyGene_amplicon',
        sequence: 'ATGTTCCTGATCGCGTAA', // all preferred
        annotations: [{ name: 'MyGene', type: 'CDS', start: 0, end: 18 }],
      },
    ];
    const operations = [{
      id: 'op-1', kind: 'pcr', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { templateId: 't' },
      outputs: ['amplicon-1'],
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/Codon usage/);
    expect(out.text).toMatch(/MyGene_amplicon/);
    expect(out.text).toMatch(/MyGene/);
    expect(out.text).toMatch(/100%/); // all preferred
  });

  it('CDS с rare codons → список rare codons', () => {
    const containers = [
      {
        id: 'a1', kind: 'molecule', name: 'eukaryotic_gene',
        sequence: 'ATGTTTTTAATATAA', // many rare: TTT, TTA, ATA
        annotations: [{ name: 'gene', type: 'CDS', start: 0, end: 15 }],
      },
    ];
    const operations = [{
      id: 'op', kind: 'pcr', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { templateId: 't' },
      outputs: ['a1'],
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/Rare codons/);
    expect(out.text).toMatch(/TTT/);
  });

  it('Output без CDS annotation → нет codon section', () => {
    const containers = [
      {
        id: 'a1', kind: 'molecule', name: 'untyped',
        sequence: 'ATGAAATTT',
        annotations: [{ name: 'promoter', type: 'promoter', start: 0, end: 9 }],
      },
    ];
    const operations = [{
      id: 'op', kind: 'cut', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { templateId: 't', enzymes: ['EcoRI'] },
      outputs: ['a1'],
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).not.toMatch(/Codon usage/);
  });

  it('Detects CDS via different field names', () => {
    const containers = [
      {
        id: 'a1', kind: 'molecule', name: 'via_kind',
        sequence: 'ATGTTCCTGTAA',
        annotations: [{ name: 'g1', kind: 'CDS', start: 0, end: 12 }],
      },
      {
        id: 'a2', kind: 'molecule', name: 'via_feature',
        sequence: 'ATGTTCCTGTAA',
        annotations: [{ name: 'g2', feature: 'CDS', start: 0, end: 12 }],
      },
    ];
    const operations = [{
      id: 'op', kind: 'pcr', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { templateId: 't' },
      outputs: ['a1', 'a2'],
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/via_kind/);
    expect(out.text).toMatch(/via_feature/);
  });
});

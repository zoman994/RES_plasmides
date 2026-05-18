/**
 * skeleton-protocol-export-r6.test.jsx — Lab-notebook protocol generation.
 *
 * R6-2 (14.05.2026). Verifies:
 *   - buildProtocol собирает executed operations в человеческий текст.
 *   - Каждый kind (cut / pcr / gibson / golden_gate / ligate / kld) имеет
 *     корректный шаблон с реагентами + температурой + временем.
 *   - Bio-fidelity warnings (missingOverlap, sticky no-overhang)
 *     включены в текст.
 *   - Reagents block содержит ferments + primers list.
 *   - Empty operations → graceful "нет выполненных" message.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { buildProtocol } from '../canvas/operations/protocol-export';

describe('R6-2 — buildProtocol', () => {
  it('returns "нет выполненных" message при пустых operations', () => {
    const out = buildProtocol([], []);
    expect(out.text).toMatch(/Нет выполненных/);
    expect(out.steps).toEqual([]);
  });

  it('skips draft / committed / failed operations', () => {
    const out = buildProtocol([
      { id: 'op1', kind: 'cut', status: 'draft' },
      { id: 'op2', kind: 'cut', status: 'committed' },
      { id: 'op3', kind: 'cut', status: 'failed', executedAt: '2026-05-14T10:00:00Z' },
    ], []);
    expect(out.steps).toHaveLength(0);
  });

  it('orders executed operations by executedAt', () => {
    const containers = [
      { id: 'c1', kind: 'molecule', name: 'pUC19' },
      { id: 'c2', kind: 'molecule', name: 'insert' },
    ];
    const operations = [
      {
        id: 'op-late', kind: 'cut', status: 'executed',
        executedAt: '2026-05-14T11:00:00Z',
        params: { templateId: 'c1', enzymes: ['EcoRI'] },
      },
      {
        id: 'op-early', kind: 'pcr', status: 'executed',
        executedAt: '2026-05-14T10:00:00Z',
        params: { templateId: 'c2', autoDesign: true },
      },
    ];
    const out = buildProtocol(operations, containers);
    expect(out.steps).toHaveLength(2);
    // Step 1 = PCR (earliest), Step 2 = Cut.
    expect(out.steps[0].title).toMatch(/PCR/);
    expect(out.steps[1].title).toMatch(/Рестрикция/);
  });

  it('cut step содержит enzyme + buffer + температуру', () => {
    const containers = [{ id: 't', kind: 'molecule', name: 'pUC19' }];
    const operations = [{
      id: 'op', kind: 'cut', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { templateId: 't', enzymes: ['EcoRI', 'BamHI'] },
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/EcoRI \+ BamHI/);
    expect(out.text).toMatch(/CutSmart/);
    expect(out.text).toMatch(/37°C/);
  });

  it('PCR auto-design step содержит сгенерированные праймеры', () => {
    const containers = [
      { id: 't', kind: 'molecule', name: 'pUC19' },
      {
        id: 'oligo-out', kind: 'oligonucleotide', name: 'pUC19_primers',
        payload: {
          sequences: [
            { name: 'fwd', sequence: 'ATCGATCGATCGATCG', Tm: 58.2, GC: 50 },
            { name: 'rev', sequence: 'CCCGGGCCCGGGCCCG', Tm: 62.5, GC: 75 },
          ],
        },
      },
    ];
    const operations = [{
      id: 'op', kind: 'pcr', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { templateId: 't', autoDesign: true },
      outputs: ['amplicon-id', 'oligo-out'],
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/ATCGATCGATCGATCG/);
    expect(out.text).toMatch(/CCCGGGCCCGGGCCCG/);
    expect(out.text).toMatch(/Tm 58.2°C/);
    expect(out.text).toMatch(/Q5/);
  });

  it('Gibson step с missingOverlap > 0 содержит ⚠ WARNING', () => {
    const containers = [
      { id: 'f1', kind: 'molecule', name: 'frag1' },
      { id: 'f2', kind: 'molecule', name: 'frag2' },
    ];
    const operations = [{
      id: 'op', kind: 'gibson', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { fragmentIds: ['f1', 'f2'], circular: false },
      origin: { missingOverlap: 1 },
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/Gibson/);
    expect(out.text).toMatch(/NEBuilder/);
    expect(out.text).toMatch(/⚠/);
    expect(out.text).toMatch(/homology overlap/);
  });

  it('Golden Gate step содержит enzyme + T4 ligase cycling program', () => {
    const containers = [
      { id: 'f1', kind: 'molecule', name: 'level0-A' },
      { id: 'f2', kind: 'molecule', name: 'level0-B' },
    ];
    const operations = [{
      id: 'op', kind: 'golden_gate', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { fragmentIds: ['f1', 'f2'], enzyme: 'BsaI', circular: true },
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/BsaI/);
    expect(out.text).toMatch(/T4 DNA Ligase/);
    expect(out.text).toMatch(/37°C 1 мин → 16°C 1 мин/);
  });

  it('Ligate sticky без overhang match → WARNING', () => {
    const containers = [
      { id: 'f1', kind: 'molecule', name: 'X' },
      { id: 'f2', kind: 'molecule', name: 'Y' },
    ];
    const operations = [{
      id: 'op', kind: 'ligate', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { fragmentIds: ['f1', 'f2'], ends: 'sticky' },
      origin: { ends: 'sticky', overlaps: [0] },
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/⚠/);
    expect(out.text).toMatch(/overhang/);
  });

  it('KLD step содержит DpnI + insertion/deletion mut description', () => {
    const containers = [
      { id: 't', kind: 'molecule', name: 'pET28a' },
      { id: 'p', kind: 'oligonucleotide', name: 'mut_primers' },
    ];
    const operations = [{
      id: 'op', kind: 'kld', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { templateId: 't', primerPairId: 'p', dpniDigest: true },
      origin: { insertionSize: 3, deletionSize: 0, dpniDigest: true },
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/insertion 3 bp/);
    expect(out.text).toMatch(/DpnI|KLD/);
    expect(out.text).toMatch(/dam\+/);
  });

  it('Reagents block lists enzymes + oligonucleotides', () => {
    const containers = [
      { id: 't', kind: 'molecule', name: 'pUC19' },
      {
        id: 'oligo', kind: 'oligonucleotide', name: 'pUC_primers',
        payload: { sequences: [{ name: 'fwd', sequence: 'ATGCATGC' }] },
      },
    ];
    const operations = [
      {
        id: 'op1', kind: 'cut', status: 'executed',
        executedAt: '2026-05-14T10:00:00Z',
        params: { templateId: 't', enzymes: ['EcoRI'] },
      },
      {
        id: 'op2', kind: 'pcr', status: 'executed',
        executedAt: '2026-05-14T10:01:00Z',
        params: { templateId: 't', primerPairId: 'oligo' },
      },
    ];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/Реагенты/);
    expect(out.text).toMatch(/- EcoRI/);
    expect(out.text).toMatch(/pUC_primers/);
    expect(out.text).toMatch(/ATGCATGC/);
  });
});

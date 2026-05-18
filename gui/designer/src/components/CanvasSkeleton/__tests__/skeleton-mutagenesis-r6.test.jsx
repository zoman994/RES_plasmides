/**
 * skeleton-mutagenesis-r6.test.jsx — Mutagenesis preserves annotations.
 *
 * R6-6 (14.05.2026). Biologist делает point/insertion/deletion → ori,
 * AmpR, MCS должны сохраниться (с shift'ами для indel). Эти тесты
 * проверяют shift arithmetic.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { executeMutagenesis } from '../canvas/operations/lib-adapters';

function makeTpl(seq, anns) {
  return {
    id: 't', kind: 'molecule', name: 'tpl',
    sequence: seq,
    topology: { circular: true },
    annotations: anns,
  };
}

describe('R6-6 — executeMutagenesis annotation preservation', () => {
  it('point mutation: annotations unchanged', () => {
    const tpl = makeTpl('AAAATTTTGGGG', [
      { id: 'a', name: 'feat', start: 2, end: 6 },
    ]);
    const op = {
      id: 'op', kind: 'mutagenesis',
      params: {
        templateId: 't',
        mutationType: 'point',
        mutations: [{ position: 5, from: 'T', to: 'C' }],
      },
    };
    const result = executeMutagenesis(op, { containers: { t: tpl } });
    expect(result.error).toBeUndefined();
    expect(result.outputs[0].sequence).toBe('AAAATCTTGGGG');
    expect(result.outputs[0].annotations).toEqual([
      expect.objectContaining({ id: 'a', start: 2, end: 6 }),
    ]);
  });

  it('insertion: annotations справа shift, до — keep', () => {
    const tpl = makeTpl('AAAATTTTGGGG', [
      { id: 'a', name: 'left', start: 0, end: 4 },  // до позиции вставки
      { id: 'b', name: 'right', start: 8, end: 12 }, // после позиции
    ]);
    const op = {
      id: 'op', kind: 'mutagenesis',
      params: {
        templateId: 't',
        mutationType: 'insertion',
        mutations: [{ position: 6, insert: 'CCC' }], // insert 3 bp
      },
    };
    const result = executeMutagenesis(op, { containers: { t: tpl } });
    expect(result.error).toBeUndefined();
    expect(result.outputs[0].sequence).toBe('AAAATTCCCTTGGGG');
    const anns = result.outputs[0].annotations;
    const left = anns.find((a) => a.id === 'a');
    const right = anns.find((a) => a.id === 'b');
    expect(left).toEqual(expect.objectContaining({ start: 0, end: 4 }));
    expect(right).toEqual(expect.objectContaining({ start: 11, end: 15 })); // shifted +3
  });

  it('insertion crossing annotation: extend end', () => {
    const tpl = makeTpl('AAAATTTTGGGG', [
      { id: 'a', name: 'crosser', start: 2, end: 10 }, // crosses pos=6
    ]);
    const op = {
      id: 'op', kind: 'mutagenesis',
      params: {
        templateId: 't',
        mutationType: 'insertion',
        mutations: [{ position: 6, insert: 'CCC' }],
      },
    };
    const result = executeMutagenesis(op, { containers: { t: tpl } });
    const ann = result.outputs[0].annotations[0];
    expect(ann.start).toBe(2);
    expect(ann.end).toBe(13); // 10 + 3
  });

  it('deletion: annotations внутри dropped, справа shift, до — keep', () => {
    const tpl = makeTpl('AAAATTTTGGGGCCCC', [
      { id: 'a', name: 'left', start: 0, end: 4 },
      { id: 'b', name: 'doomed', start: 5, end: 7 }, // в [4, 8) — dropped
      { id: 'c', name: 'right', start: 10, end: 14 },
    ]);
    const op = {
      id: 'op', kind: 'mutagenesis',
      params: {
        templateId: 't',
        mutationType: 'deletion',
        mutations: [{ position: 4, length: 4 }],
      },
    };
    const result = executeMutagenesis(op, { containers: { t: tpl } });
    expect(result.outputs[0].sequence).toBe('AAAAGGGGCCCC');
    const anns = result.outputs[0].annotations;
    expect(anns.find((a) => a.id === 'a')).toEqual(expect.objectContaining({ start: 0, end: 4 }));
    expect(anns.find((a) => a.id === 'b')).toBeUndefined(); // dropped
    expect(anns.find((a) => a.id === 'c')).toEqual(expect.objectContaining({ start: 6, end: 10 })); // shifted -4
  });

  it('deletion spanning annotation: trim end', () => {
    const tpl = makeTpl('AAAATTTTGGGG', [
      { id: 'a', name: 'spanner', start: 0, end: 10 },
    ]);
    const op = {
      id: 'op', kind: 'mutagenesis',
      params: {
        templateId: 't',
        mutationType: 'deletion',
        mutations: [{ position: 4, length: 4 }], // delete [4, 8)
      },
    };
    const result = executeMutagenesis(op, { containers: { t: tpl } });
    const ann = result.outputs[0].annotations[0];
    expect(ann.start).toBe(0);
    expect(ann.end).toBe(6); // spans whole deletion: end -= 4
  });
});

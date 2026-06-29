/**
 * operation-info — CANVAS-CLICK-2. Pins the reaction summary shown when a Cut/Ligate/
 * ромб is clicked: kind, enzyme(s), method, inputs→output. Resolves container names.
 */
import { describe, it, expect } from 'vitest';
import { operationInfo } from '../operation-info';

const containers = [
  { id: 'src1', name: 'pUC' },
  { id: 'frag1', name: 'insert' },
  { id: 'prod1', name: 'Сборка 1 (плазмида)' },
];

describe('operationInfo', () => {
  it('cut op: label, enzymes, input→output names', () => {
    const op = {
      kind: 'cut', _derived: true,
      params: { enzymes: ['EcoRI', 'BamHI'], cutSites: [] },
      inputs: ['src1'], outputs: ['frag1'],
    };
    const r = operationInfo(op, containers);
    expect(r.kindLabel).toBe('Рестрикция (Cut)');
    expect(r.enzymes).toEqual(['EcoRI', 'BamHI']);
    expect(r.inputNames).toEqual(['pUC']);
    expect(r.outputNames).toEqual(['insert']);
    expect(r.derived).toBe(true);
  });

  it('ligate closure op: label, inputs (multi) → product, method/selfClosure', () => {
    const op = {
      kind: 'ligate', params: { method: 'restriction', selfClosure: false },
      inputs: ['frag1', 'src1'], outputs: ['prod1'],
    };
    const r = operationInfo(op, containers);
    expect(r.kindLabel).toBe('Лигирование');
    expect(r.method).toBe('restriction');
    expect(r.inputNames).toEqual(['insert', 'pUC']);
    expect(r.outputNames).toEqual(['Сборка 1 (плазмида)']);
  });

  it('pcr op label; unresolved container id falls back to the id', () => {
    const r = operationInfo({ kind: 'pcr', inputs: ['ghost'], outputs: ['frag1'] }, containers);
    expect(r.kindLabel).toBe('ПЦР');
    expect(r.inputNames).toEqual(['ghost']);
    expect(r.enzymes).toEqual([]);
  });

  it('unknown kind → kind string; null op → null', () => {
    expect(operationInfo({ kind: 'weird' }).kindLabel).toBe('weird');
    expect(operationInfo(null)).toBeNull();
  });
});

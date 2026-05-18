/**
 * pcr-piece-resolve.test.js — T2 K8. Adapter surgical opt-in:
 * piece-resolution kicks in ONLY when op.inputPieces is populated;
 * otherwise the legacy op.inputs / params path is byte-identical
 * (DEC-T2-01 hybrid). ctx.containers is the existing MAP form.
 */
import { describe, it, expect } from 'vitest';
import { executePCR, executeGibson, executeCut } from '../canvas/operations/lib-adapters';

const cTpl = { id: 'c-tpl', name: 'pUC', sequence: 'ATGCATGCATGCATGCATGC', topology: { circular: false } };
const cF1 = { id: 'c-1', name: 'f1', sequence: 'AAAACCCC' };
const cF2 = { id: 'c-2', name: 'f2', sequence: 'GGGGTTTT' };
const containersMap = { 'c-tpl': cTpl, 'c-1': cF1, 'c-2': cF2 };

const piece = (id, sourceId) => ({
  id, name: `${sourceId}-pc`, sourceIds: [sourceId],
  ranges: [{ sourceId, start: 0, end: 8, orientation: 'forward' }],
  origin: 'legacy-migration', acquisitionMethod: 'undefined', acquisitionParams: {},
});

describe('T2 K8 PCR adapter', () => {
  it('resolves the template from inputPieces when populated', () => {
    const op = { id: 'op1', kind: 'pcr', inputPieces: ['pc-tpl'], inputs: [], params: {} };
    const ctx = { containers: containersMap, pieces: [piece('pc-tpl', 'c-tpl')] };
    const r = executePCR(op, ctx);
    expect(r.error).toBeUndefined();
    expect(r.outputs[0].sequence).toBe(cTpl.sequence); // auto-design full-template amplicon
  });

  it('legacy path identical when no inputPieces (params.templateId)', () => {
    const op = { id: 'op1', kind: 'pcr', inputPieces: [], inputs: [], params: { templateId: 'c-tpl' } };
    const r = executePCR(op, { containers: containersMap, pieces: [] });
    expect(r.error).toBeUndefined();
    expect(r.outputs[0].sequence).toBe(cTpl.sequence);
  });

  it('graceful when ctx has no pieces array (R-T2-5) + legacy inputs', () => {
    const op = { id: 'op1', kind: 'pcr', inputs: ['c-tpl'], params: {} };
    const r = executePCR(op, { containers: containersMap }); // no .pieces
    expect(r.error).toBeUndefined();
    expect(r.outputs[0].sequence).toBe(cTpl.sequence);
  });
});

describe('T2 K8 Gibson adapter', () => {
  it('resolves multi-input from inputPieces', () => {
    const op = { id: 'g', kind: 'gibson', inputPieces: ['p1', 'p2'], inputs: [], params: { circular: false } };
    const ctx = { containers: containersMap, pieces: [piece('p1', 'c-1'), piece('p2', 'c-2')] };
    const r = executeGibson(op, ctx);
    expect(r.error).toBeUndefined();
    expect(r.outputs[0].sequence.length).toBeGreaterThan(0);
  });
  it('legacy inputs path identical when no inputPieces', () => {
    const op = { id: 'g', kind: 'gibson', inputPieces: [], inputs: ['c-1', 'c-2'], params: { circular: false } };
    const r = executeGibson(op, { containers: containersMap, pieces: [] });
    expect(r.error).toBeUndefined();
    expect(r.outputs[0].sequence.length).toBeGreaterThan(0);
  });
});

describe('T2 K8 Cut adapter', () => {
  it('resolves template via inputPieces (linear, EcoRI present)', () => {
    const lin = { id: 'c-lin', name: 'lin', sequence: 'TTTGAATTCTTT', topology: { circular: false } };
    const op = { id: 'cut1', kind: 'cut', inputPieces: ['pc-lin'], inputs: [], params: { enzymes: ['EcoRI'] } };
    const ctx = {
      containers: { 'c-lin': lin },
      pieces: [{ id: 'pc-lin', sourceIds: ['c-lin'], ranges: [{ sourceId: 'c-lin', start: 0, end: 12, orientation: 'forward' }] }],
    };
    const r = executeCut(op, ctx);
    expect(r.error).toBeUndefined();
    expect(r.outputs.length).toBeGreaterThan(0);
  });
});

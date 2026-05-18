/**
 * op-piece-bridge.test.js — T2 K3. Pure resolvers bridging legacy
 * op.inputs (containerId[]) ↔ T1 op.inputPieces (pieceId[]).
 *
 * Robustness contract (T2 realization): the bridge tolerates `containers`
 * as EITHER an array (canonical state) OR a map keyed by id (adapter ctx,
 * the existing executeOperation contract). Both forms tested.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveOpTemplate, resolveOpRange, resolveOpInputContainers,
  resolveOpInputPieces, isOpReadyToExecute,
} from '../lib/op-piece-bridge';

const cA = { id: 'c-A', name: 'tpl', sequence: 'AAAACCCCGGGGTTTT' };
const cB = { id: 'c-B', name: 'fragB', sequence: 'GGGGCCCC' };
const pieceA = {
  id: 'pc-A', name: 'A(4-8)', sourceIds: ['c-A'],
  ranges: [{ sourceId: 'c-A', start: 4, end: 8, orientation: 'forward' }],
  origin: 'legacy-migration',
};
const pieceB = {
  id: 'pc-B', name: 'B', sourceIds: ['c-B'],
  ranges: [{ sourceId: 'c-B', start: 0, end: 8, orientation: 'forward' }],
  origin: 'legacy-migration',
};
const arrState = { containers: [cA, cB], pieces: [pieceA, pieceB] };
const mapCtx = { containers: { 'c-A': cA, 'c-B': cB }, pieces: [pieceA, pieceB] };

describe('T2 K3 resolveOpTemplate', () => {
  it('prefers inputPieces[0] → piece.sourceIds[0] → container', () => {
    const op = { kind: 'pcr', inputPieces: ['pc-A'], inputs: ['c-B'], params: {} };
    expect(resolveOpTemplate(op, arrState)).toBe(cA);
  });
  it('falls back to params.templateId then inputs[0] when no inputPieces', () => {
    expect(resolveOpTemplate({ inputPieces: [], params: { templateId: 'c-B' } }, arrState)).toBe(cB);
    expect(resolveOpTemplate({ inputPieces: [], params: {}, inputs: ['c-A'] }, arrState)).toBe(cA);
  });
  it('fallback chain includes params.templateIds[0] (superset of legacy pcr resolution)', () => {
    expect(resolveOpTemplate({ params: { templateIds: ['c-B'] } }, arrState)).toBe(cB);
  });
  it('works with map-form containers (adapter ctx)', () => {
    const op = { inputPieces: ['pc-A'], params: {} };
    expect(resolveOpTemplate(op, mapCtx)).toBe(cA);
  });
  it('returns null when nothing resolves', () => {
    expect(resolveOpTemplate({ inputPieces: [], params: {}, inputs: [] }, arrState)).toBeNull();
  });
});

describe('T2 K3 resolveOpRange', () => {
  it('returns the piece range when inputPieces set', () => {
    const op = { inputPieces: ['pc-A'], params: {} };
    expect(resolveOpRange(op, arrState)).toEqual({ sourceId: 'c-A', start: 4, end: 8, orientation: 'forward' });
  });
  it('falls back to params.range (legacy forward default)', () => {
    const op = { inputPieces: [], params: { range: { start: 2, end: 5 }, templateId: 'c-A' } };
    expect(resolveOpRange(op, arrState)).toEqual({ start: 2, end: 5, orientation: 'forward' });
  });
  it('final fallback = full-length range of resolved template', () => {
    const op = { inputPieces: [], params: { templateId: 'c-A' } };
    expect(resolveOpRange(op, arrState)).toEqual({ sourceId: 'c-A', start: 0, end: 16, orientation: 'forward' });
  });
});

describe('T2 K3 resolveOpInputContainers / resolveOpInputPieces', () => {
  it('multi-input via inputPieces resolves each piece → container', () => {
    const op = { kind: 'gibson', inputPieces: ['pc-A', 'pc-B'], inputs: [] };
    expect(resolveOpInputContainers(op, arrState)).toEqual([cA, cB]);
  });
  it('legacy multi-input via op.inputs when no inputPieces (back-compat)', () => {
    const op = { kind: 'gibson', inputPieces: [], inputs: ['c-A', 'c-B'] };
    expect(resolveOpInputContainers(op, mapCtx)).toEqual([cA, cB]);
  });
  it('deleted piece drops out (R-T2-2: not silently back-filled from inputs)', () => {
    const op = { inputPieces: ['pc-A', 'pc-GONE'], inputs: ['c-A', 'c-B'] };
    expect(resolveOpInputContainers(op, arrState)).toEqual([cA]);
  });
  it('resolveOpInputPieces → null when inputPieces empty, pieces[] otherwise', () => {
    expect(resolveOpInputPieces({ inputPieces: [] }, arrState)).toBeNull();
    expect(resolveOpInputPieces({ inputPieces: ['pc-B'] }, arrState)).toEqual([pieceB]);
  });
});

describe('T2 K3 isOpReadyToExecute', () => {
  it('committed PCR with one input → ok', () => {
    const op = { kind: 'pcr', status: 'committed', inputPieces: ['pc-A'] };
    expect(isOpReadyToExecute(op, arrState)).toEqual({ ok: true });
  });
  it('not-committed / no-kind / no-inputs reasons', () => {
    expect(isOpReadyToExecute({ kind: 'pcr', status: 'draft', inputPieces: ['pc-A'] }, arrState).reason).toBe('not-committed');
    expect(isOpReadyToExecute({ status: 'committed', inputPieces: ['pc-A'] }, arrState).reason).toBe('no-kind');
    expect(isOpReadyToExecute({ kind: 'pcr', status: 'committed', inputPieces: ['pc-GONE'], inputs: [] }, arrState).reason).toBe('no-inputs');
  });
  it('kind-specific arity (pcr single / gibson ≥2)', () => {
    expect(isOpReadyToExecute({ kind: 'pcr', status: 'committed', inputPieces: ['pc-A', 'pc-B'] }, arrState).reason).toBe('pcr-multi-input');
    expect(isOpReadyToExecute({ kind: 'gibson', status: 'committed', inputPieces: ['pc-A'] }, arrState).reason).toBe('gibson-too-few');
  });
});

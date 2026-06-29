/**
 * circularize-apply.test.js — RC-SEP. Pure mapping from the «Замыкание» (closure-
 * reaction) decision → a single SET_CLOSURE_METHOD action that stores the ring-closing
 * reaction as ONE assembly property (zone.closureMethod), decoupled from internal
 * junctions and topology.
 */
import { describe, it, expect } from 'vitest';
import { closureActions, applyClosure } from '../circularize-apply';

describe('closureActions', () => {
  it('maps the chosen reaction → a closureMethod action', () => {
    expect(closureActions({ draftId: 'z1', method: 'restriction' })).toEqual([
      { kind: 'closureMethod', zoneId: 'z1', method: 'restriction', enzyme: null },
    ]);
  });

  it('carries the chosen enzyme (GG / RE)', () => {
    expect(closureActions({ draftId: 'z1', method: 'golden_gate', enzyme: 'BsmBI' })[0].enzyme).toBe('BsmBI');
  });

  it('no method → no action', () => {
    expect(closureActions({ draftId: 'z1', method: null })).toEqual([]);
  });
});

describe('applyClosure', () => {
  it('dispatches SET_CLOSURE_METHOD on the zone', () => {
    const calls = [];
    const actions = { zoneDispatch: (a) => calls.push(a) };
    applyClosure(actions, { draftId: 'z1', method: 'gibson', enzyme: null });
    expect(calls).toEqual([{ type: 'SET_CLOSURE_METHOD', zoneId: 'z1', method: 'gibson', enzyme: null }]);
  });

  it('no-op when no method', () => {
    const calls = [];
    applyClosure({ zoneDispatch: (a) => calls.push(a) }, { draftId: 'z1', method: null });
    expect(calls).toEqual([]);
  });
});

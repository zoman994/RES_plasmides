/**
 * consistency-op-kind-map.test.js — audit fix (enzyme-separation AM-2):
 * METHOD_TO_OP_KIND mapped 'restriction' → 'restriction', but no such op kind is
 * registered (op-kinds-registry KNOWN_OP_KINDS) → the realised assembly op had no
 * adapter (a dead, un-executable node). Guard: every assembly method must resolve
 * to a REAL registered op kind, so this can never regress.
 */
import { describe, it, expect } from 'vitest';
import { METHOD_TO_OP_KIND } from '../lib/zone-pieces-to-dag';
import { KNOWN_OP_KINDS } from '../canvas/operations/op-kinds-registry';

describe('METHOD_TO_OP_KIND ↔ op-kinds-registry consistency', () => {
  it('every assembly method resolves to a registered, executable op kind', () => {
    for (const [method, kind] of Object.entries(METHOD_TO_OP_KIND)) {
      expect(KNOWN_OP_KINDS.has(kind), `${method} → ${kind} must be a registered op kind`).toBe(true);
    }
  });

  it("'restriction' resolves to the ligate join step (RE digest is a separate cut op)", () => {
    expect(METHOD_TO_OP_KIND.restriction).toBe('ligate');
  });
});

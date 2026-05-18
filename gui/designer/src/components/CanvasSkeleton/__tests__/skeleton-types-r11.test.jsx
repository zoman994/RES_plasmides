/**
 * skeleton-types-r11.test.jsx — Container / Origin validators.
 *
 * R11-1 (15.05.2026 — DEC-OPS-FORMAL-TYPES-01). Verifies:
 *   - Valid containers / origins → no errors.
 *   - Missing required fields → каждая поле produces error.
 *   - Unknown origin.kind → error с list знакомых kinds.
 *   - validateContainer surface origin errors через prefix.
 *   - Real adapter outputs pass validation (smoke).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  validateOrigin,
  validateContainer,
  KNOWN_ORIGIN_KINDS,
} from '../canvas/operations/types';
import { executeCut } from '../canvas/operations/adapters/cut';
import { executeGibson } from '../canvas/operations/adapters/gibson';
import { executeMutagenesis } from '../canvas/operations/adapters/mutagenesis';

describe('R11 — validateOrigin', () => {
  it('null / undefined / non-object → error', () => {
    expect(validateOrigin(null).length).toBeGreaterThan(0);
    expect(validateOrigin(undefined).length).toBeGreaterThan(0);
    expect(validateOrigin('not-obj').length).toBeGreaterThan(0);
  });

  it('missing kind → error', () => {
    const errs = validateOrigin({});
    expect(errs.some((e) => /kind missing/.test(e))).toBe(true);
  });

  it('unknown kind → error с list знакомых', () => {
    const errs = validateOrigin({ kind: 'op_chimera' });
    expect(errs.some((e) => /unknown/.test(e))).toBe(true);
  });

  it('valid op_cut origin → no errors', () => {
    const errs = validateOrigin({
      kind: 'op_cut',
      operationId: 'op-1',
      parentContainerId: 'c-1',
      enzymes: ['EcoRI'],
      parentWasCircular: true,
      isExcised: false,
      fragmentIndex: 0,
    });
    expect(errs).toEqual([]);
  });

  it('op_cut missing parentWasCircular → error', () => {
    const errs = validateOrigin({
      kind: 'op_cut',
      operationId: 'op-1',
      parentContainerId: 'c-1',
      enzymes: ['EcoRI'],
      isExcised: false,
      fragmentIndex: 0,
    });
    expect(errs.some((e) => /parentWasCircular/.test(e))).toBe(true);
  });

  it('op_kld missing required fields → errors', () => {
    const errs = validateOrigin({ kind: 'op_kld', operationId: 'op-1' });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('placeholder без полей → no errors', () => {
    expect(validateOrigin({ kind: 'placeholder' })).toEqual([]);
  });

  it('tree_drag без обязательных полей → no errors', () => {
    expect(validateOrigin({ kind: 'tree_drag' })).toEqual([]);
  });
});

describe('R11 — validateContainer', () => {
  it('valid container → no errors', () => {
    const c = {
      id: 'c1', kind: 'molecule', name: 'tpl',
      sequence: 'ATGC', length: 4,
      topology: { circular: false },
      annotations: [], ends: null,
      origin: { kind: 'placeholder' },
      parentCommitId: null,
    };
    expect(validateContainer(c)).toEqual([]);
  });

  it('container.id missing → error', () => {
    const errs = validateContainer({
      kind: 'molecule', name: 'x', sequence: '', topology: { circular: false }, annotations: [],
    });
    expect(errs.some((e) => /id/.test(e))).toBe(true);
  });

  it('container.sequence not string → error', () => {
    const errs = validateContainer({
      id: 'c1', kind: 'molecule', name: 'x', sequence: null,
      topology: { circular: false }, annotations: [],
    });
    expect(errs.some((e) => /sequence/.test(e))).toBe(true);
  });

  it('container.topology.circular missing → error', () => {
    const errs = validateContainer({
      id: 'c1', kind: 'molecule', name: 'x', sequence: 'ATGC',
      topology: {}, annotations: [],
    });
    expect(errs.some((e) => /circular/.test(e))).toBe(true);
  });

  it('invalid kind → error', () => {
    const errs = validateContainer({
      id: 'c1', kind: 'something_weird', name: 'x', sequence: 'A',
      topology: { circular: false }, annotations: [],
    });
    expect(errs.some((e) => /kind/.test(e))).toBe(true);
  });

  it('container с invalid origin surfaces origin errors', () => {
    const errs = validateContainer({
      id: 'c1', kind: 'molecule', name: 'x', sequence: 'A',
      topology: { circular: false }, annotations: [],
      origin: { kind: 'op_cut' }, // missing required cut fields
    });
    expect(errs.some((e) => /origin/.test(e))).toBe(true);
  });
});

describe('R11 — Real adapter outputs pass validation (smoke)', () => {
  it('executeCut produces valid containers', () => {
    const tpl = {
      id: 't', kind: 'molecule', name: 'pUC',
      sequence: 'AAAATTTTGGGGCCCCGAATTCCCGGGGAAAAATTTTTGGGGGCCCCC',
      topology: { circular: true },
      annotations: [], length: 48,
    };
    const op = {
      id: 'op-c', kind: 'cut',
      inputs: ['t'],
      params: { templateId: 't', enzymes: ['EcoRI'] },
    };
    const result = executeCut(op, { containers: { t: tpl } });
    expect(result.error).toBeUndefined();
    for (const out of result.outputs) {
      const errs = validateContainer(out);
      expect(errs).toEqual([]);
    }
  });

  it('executeGibson produces valid container', () => {
    const f1 = {
      id: 'f1', kind: 'molecule', name: 'A',
      sequence: 'AAAATTTTGGGGCCCC',
      topology: { circular: false }, annotations: [],
    };
    const f2 = {
      id: 'f2', kind: 'molecule', name: 'B',
      sequence: 'GGGGCCCCAAAAGGGG',
      topology: { circular: false }, annotations: [],
    };
    const op = {
      id: 'op-g', kind: 'gibson',
      params: { fragmentIds: ['f1', 'f2'], circular: false },
    };
    const result = executeGibson(op, { containers: { f1, f2 } });
    expect(result.error).toBeUndefined();
    for (const out of result.outputs) {
      const errs = validateContainer(out);
      expect(errs).toEqual([]);
    }
  });

  it('executeMutagenesis produces valid container', () => {
    const tpl = {
      id: 't', kind: 'molecule', name: 'pUC',
      sequence: 'ATGCATGCATGC', topology: { circular: true },
      annotations: [], length: 12,
    };
    const op = {
      id: 'op-m', kind: 'mutagenesis',
      params: { templateId: 't', mutationType: 'point', mutations: [{ position: 5, from: 'T', to: 'C' }] },
    };
    const result = executeMutagenesis(op, { containers: { t: tpl } });
    expect(result.error).toBeUndefined();
    for (const out of result.outputs) {
      const errs = validateContainer(out);
      expect(errs).toEqual([]);
    }
  });
});

describe('R11 — KNOWN_ORIGIN_KINDS', () => {
  it('contains all expected kinds', () => {
    const expected = [
      'placeholder', 'tree_drag', 'tree_pick', 'fork',
      'op_pcr', 'op_pcr_designed', 'op_cut', 'op_gibson',
      'op_golden_gate', 'op_ligate', 'op_kld', 'op_mutagenesis',
      'op_gibson_primer_designed',
    ];
    for (const k of expected) {
      expect(KNOWN_ORIGIN_KINDS.has(k)).toBe(true);
    }
  });
});

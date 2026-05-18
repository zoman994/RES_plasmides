/**
 * skeleton-strain-compat-r8.test.jsx — E.coli dam/dcm strain checks.
 *
 * R8-1 (14.05.2026). Verifies:
 *   - Cut с BclI / MboI / etc → dam-sensitive warning.
 *   - Cut с EcoRII → dcm-sensitive warning.
 *   - KLD → dam-required note.
 *   - KLD + dam-sensitive enzyme в одном protocol → conflict recommendation.
 *   - Protocol export текст содержит strain block.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  checkStrainCompatibility,
  recommendStrainsForOps,
  DAM_BLOCKED,
  DCM_BLOCKED,
} from '../../../lib/bio/strain-compatibility';
import { buildProtocol } from '../canvas/operations/protocol-export';

describe('R8-1 — checkStrainCompatibility', () => {
  it('BclI emits dam-sensitive warning', () => {
    const ops = [{
      id: 'op', kind: 'cut',
      params: { enzymes: ['BclI'] },
    }];
    const w = checkStrainCompatibility(ops);
    expect(w).toHaveLength(1);
    expect(w[0].kind).toBe('dam-sensitive');
    expect(w[0].enzyme).toBe('BclI');
    expect(w[0].message).toMatch(/dam-/);
  });

  it('EcoRII emits dcm-sensitive warning', () => {
    const ops = [{
      id: 'op', kind: 'cut',
      params: { enzymes: ['EcoRII'] },
    }];
    const w = checkStrainCompatibility(ops);
    expect(w[0].kind).toBe('dcm-sensitive');
  });

  it('common enzymes (EcoRI, BamHI) — no warnings', () => {
    const ops = [{
      id: 'op', kind: 'cut',
      params: { enzymes: ['EcoRI', 'BamHI'] },
    }];
    const w = checkStrainCompatibility(ops);
    expect(w).toHaveLength(0);
  });

  it('KLD always emits dam-required note', () => {
    const ops = [{ id: 'op', kind: 'kld' }];
    const w = checkStrainCompatibility(ops);
    expect(w).toHaveLength(1);
    expect(w[0].kind).toBe('dam-required');
    expect(w[0].enzyme).toBe('DpnI');
  });

  it('Mixed: KLD + BclI → both warnings', () => {
    const ops = [
      { id: 'op-kld', kind: 'kld' },
      { id: 'op-cut', kind: 'cut', params: { enzymes: ['BclI'] } },
    ];
    const w = checkStrainCompatibility(ops);
    expect(w).toHaveLength(2);
  });
});

describe('R8-1 — recommendStrainsForOps', () => {
  it('KLD + BclI → CONFLICT high severity', () => {
    const ops = [
      { id: 'op-kld', kind: 'kld' },
      { id: 'op-cut', kind: 'cut', params: { enzymes: ['BclI'] } },
    ];
    const recs = recommendStrainsForOps(ops);
    expect(recs[0].severity).toBe('high');
    expect(recs[0].message).toMatch(/CONFLICT/);
  });

  it('Only dam-sensitive → medium severity (JM110)', () => {
    const ops = [{ id: 'op', kind: 'cut', params: { enzymes: ['BclI'] } }];
    const recs = recommendStrainsForOps(ops);
    expect(recs[0].severity).toBe('medium');
    expect(recs[0].message).toMatch(/JM110/);
  });

  it('Only KLD → info severity (DH5α)', () => {
    const ops = [{ id: 'op', kind: 'kld' }];
    const recs = recommendStrainsForOps(ops);
    expect(recs[0].severity).toBe('info');
    expect(recs[0].message).toMatch(/DH5/);
  });

  it('Common enzymes → info severity (standard)', () => {
    const ops = [{ id: 'op', kind: 'cut', params: { enzymes: ['EcoRI'] } }];
    const recs = recommendStrainsForOps(ops);
    expect(recs[0].severity).toBe('info');
    expect(recs[0].message).toMatch(/Standard|DH5/);
  });
});

describe('R8-1 — protocol export integrates strain block', () => {
  it('dam-sensitive enzyme → protocol contains E.coli strain section', () => {
    const containers = [{ id: 't', kind: 'molecule', name: 'tpl' }];
    const operations = [{
      id: 'op-1', kind: 'cut', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { templateId: 't', enzymes: ['BclI'] },
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/E\.coli strain/);
    expect(out.text).toMatch(/BclI/);
    expect(out.text).toMatch(/JM110/);
  });

  it('Standard enzyme → standard strain note', () => {
    const containers = [{ id: 't', kind: 'molecule', name: 'tpl' }];
    const operations = [{
      id: 'op-1', kind: 'cut', status: 'executed',
      executedAt: '2026-05-14T10:00:00Z',
      params: { templateId: 't', enzymes: ['EcoRI'] },
    }];
    const out = buildProtocol(operations, containers);
    expect(out.text).toMatch(/E\.coli strain/);
    expect(out.text).toMatch(/Standard|DH5/);
  });
});

describe('R8-1 — enzyme lists are populated', () => {
  it('DAM_BLOCKED contains classic dam-sensitive enzymes', () => {
    expect(DAM_BLOCKED.has('BclI')).toBe(true);
    expect(DAM_BLOCKED.has('MboI')).toBe(true);
    expect(DAM_BLOCKED.has('ClaI')).toBe(true);
  });

  it('DCM_BLOCKED contains classic dcm-sensitive enzymes', () => {
    expect(DCM_BLOCKED.has('EcoRII')).toBe(true);
    expect(DCM_BLOCKED.has('StuI')).toBe(true);
  });
});

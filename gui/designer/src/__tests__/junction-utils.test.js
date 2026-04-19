import { describe, it, expect } from 'vitest';
import { resetJunctionForType } from '../lib/junction-utils';

const ligationJ = {
  id: 'j1', type: 'ligation',
  reEnzyme: 'NcoI', enzyme: 'NcoI', overhang: 'CATG',
  overlapLength: 20, overlapMode: 'split',
  autoMode: true, calcMode: 'length', tmTarget: 62,
};

const ggJ = {
  id: 'j2', type: 'golden_gate',
  enzyme: 'BsaI', overhang: 'AATG',
  overlapLength: 20, overlapMode: 'split',
};

describe('resetJunctionForType', () => {
  it('ligation → golden_gate drops reEnzyme, sets BsaI default', () => {
    const r = resetJunctionForType(ligationJ, 'golden_gate');
    expect(r.type).toBe('golden_gate');
    expect(r.enzyme).toBe('BsaI');
    expect(r.overhang).toBe('');
    expect(r.reEnzyme).toBeUndefined();
  });

  it('ligation → overlap drops all enzyme/overhang fields', () => {
    const r = resetJunctionForType(ligationJ, 'overlap');
    expect(r.type).toBe('overlap');
    expect(r.enzyme).toBeUndefined();
    expect(r.reEnzyme).toBeUndefined();
    expect(r.overhang).toBeUndefined();
  });

  it('golden_gate → kld drops GG enzyme', () => {
    const r = resetJunctionForType(ggJ, 'kld');
    expect(r.type).toBe('kld');
    expect(r.enzyme).toBeUndefined();
    expect(r.overhang).toBeUndefined();
  });

  it('preserves id and overlap geometry across type change', () => {
    const r = resetJunctionForType(ligationJ, 'overlap');
    expect(r.id).toBe('j1');
    expect(r.overlapLength).toBe(20);
    expect(r.overlapMode).toBe('split');
    expect(r.autoMode).toBe(true);
    expect(r.calcMode).toBe('length');
    expect(r.tmTarget).toBe(62);
  });

  it('overlap → ligation sets reEnzyme empty (no prior RE info)', () => {
    const overlapJ = { id: 'j3', type: 'overlap', overlapLength: 20 };
    const r = resetJunctionForType(overlapJ, 'ligation');
    expect(r.type).toBe('ligation');
    expect(r.reEnzyme).toBe('');
    expect(r.enzyme).toBe('');
  });

  it('ligation → re_ligation preserves reEnzyme', () => {
    const r = resetJunctionForType(ligationJ, 're_ligation');
    expect(r.type).toBe('re_ligation');
    expect(r.reEnzyme).toBe('NcoI');
    expect(r.enzyme).toBe('NcoI');
  });
});

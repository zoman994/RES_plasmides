/**
 * derived-mutagenesis-op — editor edit → canvas op_mutagenesis payload
 * (Кирпич 3c).
 */
import { describe, it, expect } from 'vitest';
import { buildMutagenesisOpPayload } from '../lib/derived-mutagenesis-op';

describe('buildMutagenesisOpPayload', () => {
  it('maps {position,fromBase,toBase} → op {position,from,to} + templateId input', () => {
    const payload = buildMutagenesisOpPayload({
      templateId: 'c1',
      mutations: [{ position: 30, fromBase: 'g', toBase: 't' }],
      zoneId: 'z1',
    });
    expect(payload.kind).toBe('mutagenesis');
    expect(payload.inputs).toEqual(['c1']);
    expect(payload.zoneId).toBe('z1');
    expect(payload.params).toEqual({
      templateId: 'c1', mutationType: 'point', mutations: [{ position: 30, from: 'G', to: 'T' }],
    });
  });

  it('returns null without a template or mutations', () => {
    expect(buildMutagenesisOpPayload({ templateId: '', mutations: [{ position: 1, fromBase: 'A', toBase: 'C' }] })).toBeNull();
    expect(buildMutagenesisOpPayload({ templateId: 'c1', mutations: [] })).toBeNull();
    expect(buildMutagenesisOpPayload({})).toBeNull();
  });
});

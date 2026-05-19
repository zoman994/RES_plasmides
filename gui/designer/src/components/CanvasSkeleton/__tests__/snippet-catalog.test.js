/**
 * snippet-catalog.test.js — M-CANVAS-WORKFLOW-UX K2.
 *
 * Built-in snippet catalog per SPEC §8 (8 tags + 5 linkers + 5
 * start/stop + 30 RE sites) + custom-snippet validation + Dexie
 * `snippets` table (account-global, additive v4→v5).
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, beforeEach,
} from 'vitest';
import {
  BUILTIN_SNIPPETS, SNIPPET_CATEGORIES, getSnippetById, searchSnippets,
  isValidSnippetSequence,
} from '../lib/snippet-catalog';
import {
  resetDBForTests, putSnippet, listSnippets, deleteSnippet,
} from '../../../db/dexie-schema';

describe('K2 — built-in snippet catalog (SPEC §8)', () => {
  it('has the 4 categories and ≥48 built-ins (8+5+5+30)', () => {
    expect(SNIPPET_CATEGORIES.map((c) => c.id)).toEqual(
      ['tag', 'linker', 'startstop', 'restriction'],
    );
    expect(BUILTIN_SNIPPETS.length).toBeGreaterThanOrEqual(48);
  });

  it('category counts match SPEC §8', () => {
    const by = (cat) => BUILTIN_SNIPPETS.filter((s) => s.category === cat).length;
    expect(by('tag')).toBe(8);
    expect(by('linker')).toBe(5);
    expect(by('startstop')).toBe(5);
    expect(by('restriction')).toBe(30);
  });

  it('canonical sequences verbatim (6×His, FLAG)', () => {
    expect(getSnippetById('snip-tag-6xHis').sequence).toBe('CATCATCATCATCATCAT');
    expect(getSnippetById('snip-tag-FLAG').sequence).toBe('GATTACAAGGATGACGATGACAAG');
  });

  it('every built-in: stable id + ACGT-only sequence + category + isCustom:false', () => {
    for (const s of BUILTIN_SNIPPETS) {
      expect(typeof s.id).toBe('string');
      expect(s.id.startsWith('snip-')).toBe(true);
      expect(/^[ACGT]+$/.test(s.sequence)).toBe(true);
      expect(SNIPPET_CATEGORIES.some((c) => c.id === s.category)).toBe(true);
      expect(s.isCustom).toBe(false);
    }
  });

  it('RE-site snippet embeds the recognition site (NotI → GCGGCCGC)', () => {
    const notI = getSnippetById('snip-restriction-NotI');
    expect(notI).toBeTruthy();
    expect(notI.sequence.includes('GCGGCCGC')).toBe(true);
  });

  it('searchSnippets — name + sequence substring over built-in + extra', () => {
    expect(searchSnippets('his').some((s) => s.name === '6xHis')).toBe(true);
    expect(searchSnippets('GATTACAAG').some((s) => s.name === 'FLAG')).toBe(true);
    const extra = [{ id: 'snip-custom-x', name: 'MyTag', sequence: 'ACGT', category: 'custom', isCustom: true }];
    expect(searchSnippets('mytag', extra).map((s) => s.id)).toContain('snip-custom-x');
    expect(searchSnippets('', extra).length).toBe(BUILTIN_SNIPPETS.length + 1);
  });

  it('isValidSnippetSequence — ACGT-only, 1..200 nt', () => {
    expect(isValidSnippetSequence('ACGTacgt')).toBe(true);
    expect(isValidSnippetSequence('')).toBe(false);
    expect(isValidSnippetSequence('ACGTX')).toBe(false);
    expect(isValidSnippetSequence('A'.repeat(201))).toBe(false);
    expect(isValidSnippetSequence('A'.repeat(200))).toBe(true);
  });
});

describe('K2 — Dexie snippets table (account-global custom)', () => {
  beforeEach(() => { resetDBForTests('bodgegene-db-snip-test'); });

  it('put → list → delete round-trip', async () => {
    await putSnippet({
      id: 'snip-custom-1', name: 'pelB', sequence: 'ATGAAATAC', category: 'custom',
      isCustom: true, createdAt: new Date().toISOString(),
    });
    let rows = await listSnippets();
    expect(rows.map((r) => r.id)).toContain('snip-custom-1');
    await deleteSnippet('snip-custom-1');
    rows = await listSnippets();
    expect(rows.map((r) => r.id)).not.toContain('snip-custom-1');
  });
});

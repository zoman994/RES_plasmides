/**
 * search-query-lexer — a small pure lexer that replaces `split(' ')` (REV #2 §6.1).
 * Tokenizes on spaces outside quotes, groups double-quoted values (with \" and \\
 * escapes), records a source span per token (so the UI can atomically lift a chip),
 * and reports an unclosed quote as a diagnostic instead of crashing. Prefix RESOLUTION
 * is classifyQuery's job — the lexer only splits `prefix:value`.
 */
import { describe, it, expect } from 'vitest';
import { tokenizeQuery } from '../search-query-lexer';

const toks = (s) => tokenizeQuery(s).tokens;

describe('tokenizeQuery — free terms + spans', () => {
  it('splits on spaces, records value + source span', () => {
    const { tokens, diagnostics } = tokenizeQuery('pUC19  glaA');
    expect(diagnostics).toEqual([]);
    expect(tokens.map((t) => t.value)).toEqual(['pUC19', 'glaA']);
    expect(tokens.every((t) => t.prefix === null)).toBe(true);
    expect(tokens[0].span).toEqual({ start: 0, end: 5 });
    expect(tokens[1].span).toEqual({ start: 7, end: 11 });
  });
  it('empty / whitespace → no tokens', () => {
    expect(toks('')).toEqual([]);
    expect(toks('   ')).toEqual([]);
  });
});

describe('tokenizeQuery — prefixes', () => {
  it('splits prefix:value', () => {
    const [t] = toks('seq:GAATTC');
    expect(t).toMatchObject({ prefix: 'seq', value: 'GAATTC', quoted: false });
    expect(t.raw).toBe('seq:GAATTC');
  });
  it('keeps an unknown prefix candidate verbatim (resolution is classifyQuery)', () => {
    const [t] = toks('http://x');
    expect(t.prefix).toBe('http');
    expect(t.value).toBe('//x');
    expect(t.raw).toBe('http://x');
  });
  it('a leading colon is not a prefix', () => {
    const [t] = toks(':foo');
    expect(t.prefix).toBeNull();
    expect(t.value).toBe(':foo');
  });
  it('an empty prefixed value is preserved (classifyQuery decides not to run)', () => {
    const [t] = toks('seq:');
    expect(t).toMatchObject({ prefix: 'seq', value: '' });
  });
});

describe('tokenizeQuery — quoted values + escapes', () => {
  it('groups a quoted value with spaces', () => {
    const [t] = toks('project:"Gla optimization"');
    expect(t).toMatchObject({ prefix: 'project', value: 'Gla optimization', quoted: true });
  });
  it('a quoted value then a free term', () => {
    const tokens = toks('in:"Project Alpha" AmpR');
    expect(tokens.map((t) => t.value)).toEqual(['Project Alpha', 'AmpR']);
    expect(tokens[0].prefix).toBe('in');
    expect(tokens[1].prefix).toBeNull();
  });
  it('unescapes \\" and \\\\ inside a quoted value', () => {
    expect(toks('feature:"a\\"b"')[0].value).toBe('a"b');
    expect(toks('name:"a\\\\b"')[0].value).toBe('a\\b');
  });
  it('an unclosed quote → diagnostic (severity error), value = the rest, no crash', () => {
    const { tokens, diagnostics } = tokenizeQuery('feature:"signal peptide');
    expect(tokens[0].value).toBe('signal peptide');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'unclosed-quote', severity: 'error' });
  });
});

describe('tokenizeQuery — span integrity + Unicode whitespace (§13.7)', () => {
  it('raw === source.slice(span.start, span.end) for quoted / escaped tokens', () => {
    for (const src of ['project:"Gla optimization" AmpR', 'name:pUC feature:"a\\"b" tag:gfp', '  seq:GAATTC  ']) {
      const { tokens } = tokenizeQuery(src);
      for (const t of tokens) expect(t.raw).toBe(src.slice(t.span.start, t.span.end));
    }
  });
  it('NBSP and other Unicode whitespace (clipboard) split tokens', () => {
    const NBSP = String.fromCharCode(0x00A0); // non-breaking space
    const THIN = String.fromCharCode(0x2009); // thin space
    const src = `pUC19${NBSP}glaA${THIN}tag:gfp`;
    const { tokens } = tokenizeQuery(src);
    expect(tokens.map((t) => t.value)).toEqual(['pUC19', 'glaA', 'gfp']);
    expect(tokens[2].prefix).toBe('tag');
  });
});

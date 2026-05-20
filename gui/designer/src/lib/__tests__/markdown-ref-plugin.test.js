/**
 * NB-K3 — bodgeRefPlugin tokenizer + display label resolver.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  bodgeRefPlugin,
  setRefDisplayLabelResolver,
  getRefDisplayLabel,
  snapshotRefsToPlain,
} from '../markdown-ref-plugin';

async function makeMd() {
  const { default: MarkdownIt } = await import('markdown-it');
  return new MarkdownIt({ html: false }).use(bodgeRefPlugin);
}

beforeEach(() => setRefDisplayLabelResolver(null));

describe('NB-K3 — tokenizer parses @@ref:kind:id@@', () => {
  it('emits a md-ref button with data-ref-kind / data-ref-id', async () => {
    const md = await makeMd();
    const html = md.render('See @@ref:operation:op01PCR01@@.');
    expect(html).toContain('class="md-ref"');
    expect(html).toContain('data-ref-kind="operation"');
    expect(html).toContain('data-ref-id="op01PCR01"');
  });

  it('uses display-label resolver when set', async () => {
    setRefDisplayLabelResolver((kind, id) => `${kind.toUpperCase()}-${id.slice(0, 4)}`);
    const md = await makeMd();
    const html = md.render('@@ref:zone:zn01XYZABCDEF@@');
    expect(html).toContain('→ ZONE-zn01');
  });

  it('falls back to short id when resolver missing', async () => {
    const md = await makeMd();
    const html = md.render('@@ref:zone:zn01XYZABCDEF@@');
    // Default fallback: id.slice(0, 8) = "zn01XYZA".
    expect(html).toContain('→ zn01XYZA');
  });

  it('tolerates resolver throwing — falls back to short id', async () => {
    setRefDisplayLabelResolver(() => { throw new Error('boom'); });
    const md = await makeMd();
    const html = md.render('@@ref:zone:zn01XYZABCDEF@@');
    expect(html).toContain('→ zn01XYZA');
  });
});

describe('NB-K3 — 7 ref kinds + default', () => {
  const kinds = ['container', 'zone', 'operation', 'piece', 'primer', 'clone', 'external'];
  it.each(kinds)('parses @@ref:%s:foo01@@', async (kind) => {
    const md = await makeMd();
    const html = md.render(`@@ref:${kind}:foo01@@`);
    expect(html).toContain(`data-ref-kind="${kind}"`);
    expect(html).toContain('data-ref-id="foo01"');
  });

  it('parses unknown kind as opaque (no special handling)', async () => {
    const md = await makeMd();
    const html = md.render('@@ref:mystery:x@@');
    expect(html).toContain('data-ref-kind="mystery"');
  });
});

describe('NB-K3 — escape safety', () => {
  it('escapes HTML-ish chars in resolver output', async () => {
    setRefDisplayLabelResolver(() => '<script>alert("x")</script>');
    const md = await makeMd();
    const html = md.render('@@ref:zone:z01@@');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('ID containing only allowed chars [a-zA-Z0-9_-]', async () => {
    const md = await makeMd();
    const html1 = md.render('@@ref:zone:abc-XYZ_123@@');
    expect(html1).toContain('data-ref-id="abc-XYZ_123"');
    // A dot in the id breaks the pattern and the ref is rendered as plain text.
    const html2 = md.render('@@ref:zone:abc.bad@@');
    expect(html2).not.toContain('class="md-ref"');
  });
});

describe('NB-K3 — getRefDisplayLabel + snapshotRefsToPlain', () => {
  it('getRefDisplayLabel returns short id without resolver', () => {
    expect(getRefDisplayLabel('zone', 'abcdef1234')).toBe('abcdef12');
  });

  it('getRefDisplayLabel uses resolver when set', () => {
    setRefDisplayLabelResolver((kind, id) => `${kind}!${id}!`);
    expect(getRefDisplayLabel('zone', 'abc')).toBe('zone!abc!');
  });

  it('snapshotRefsToPlain replaces @@ref@@ with resolver labels', () => {
    setRefDisplayLabelResolver((kind, id) => `[${kind}:${id}]`);
    const out = snapshotRefsToPlain('See @@ref:zone:z1@@ and @@ref:operation:op1@@.');
    expect(out).toBe('See [zone:z1] and [operation:op1].');
  });

  it('snapshotRefsToPlain handles missing resolver via short id', () => {
    const out = snapshotRefsToPlain('@@ref:zone:abcdef1234@@');
    expect(out).toBe('abcdef12');
  });
});

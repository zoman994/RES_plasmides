/**
 * NB-K1 — Smoke test: notebook deps installed and importable.
 *
 * Verifies the markdown stack (markdown-it + plugins + dompurify) is
 * available and renders the minimum CommonMark + GFM features we rely
 * on (paragraphs, tables, task lists). Real rendering pipeline tested
 * in K2.
 */
import { describe, it, expect } from 'vitest';

describe('NB-K1 — deps installed', () => {
  it('markdown-it imports + renders "hello"', async () => {
    const { default: MarkdownIt } = await import('markdown-it');
    const md = new MarkdownIt();
    const html = md.render('hello');
    expect(html).toContain('<p>hello</p>');
  });

  it('markdown-it parses a GFM table', async () => {
    const { default: MarkdownIt } = await import('markdown-it');
    const md = new MarkdownIt();
    const html = md.render('| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('markdown-it-task-lists wraps `- [ ]` items', async () => {
    const { default: MarkdownIt } = await import('markdown-it');
    const { default: taskLists } = await import('markdown-it-task-lists');
    const md = new MarkdownIt().use(taskLists);
    const html = md.render('- [ ] todo\n- [x] done\n');
    expect(html).toMatch(/<input[^>]*type="checkbox"/);
  });

  it('markdown-it-footnote handles [^1] syntax', async () => {
    const { default: MarkdownIt } = await import('markdown-it');
    const { default: footnote } = await import('markdown-it-footnote');
    const md = new MarkdownIt().use(footnote);
    const html = md.render('Text[^1]\n\n[^1]: note\n');
    expect(html).toContain('footnote');
  });

  it('markdown-it-mark handles ==highlight==', async () => {
    const { default: MarkdownIt } = await import('markdown-it');
    const { default: mark } = await import('markdown-it-mark');
    const md = new MarkdownIt().use(mark);
    const html = md.render('==yellow==');
    expect(html).toContain('<mark>yellow</mark>');
  });

  it('isomorphic-dompurify strips script tags', async () => {
    const DOMPurifyMod = await import('isomorphic-dompurify');
    const DOMPurify = DOMPurifyMod.default || DOMPurifyMod;
    const clean = DOMPurify.sanitize('<p>safe<script>alert(1)</script></p>');
    expect(clean).not.toContain('<script>');
    expect(clean).toContain('<p>safe');
  });
});

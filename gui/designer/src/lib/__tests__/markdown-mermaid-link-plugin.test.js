/**
 * NB-K5 — mermaid-link stub fence renderer.
 */
import { describe, it, expect } from 'vitest';
import { mermaidLinkPlugin } from '../markdown-mermaid-link-plugin';

async function makeMd() {
  const { default: MarkdownIt } = await import('markdown-it');
  return new MarkdownIt({ html: false }).use(mermaidLinkPlugin);
}

describe('NB-K5 — mermaidLinkPlugin', () => {
  it('emits preview face with line count + raw source + Copy + ↗ Open', async () => {
    const md = await makeMd();
    const html = md.render('```mermaid\ngraph TD\n  A --> B\n```');
    expect(html).toContain('mermaid-link-block');
    expect(html).toContain('Mermaid diagram (2 lines)');
    expect(html).toContain('graph TD');
    expect(html).toContain('📋 Copy');
    expect(html).toContain('↗ Open in editor');
  });

  it('escapes HTML inside mermaid source', async () => {
    const md = await makeMd();
    const html = md.render('```mermaid\nA --> "<script>"\n```');
    expect(html).not.toMatch(/<script[\s>]/i);
    expect(html).toContain('&lt;script&gt;');
  });

  it('builds mermaid.live URL with encoded source', async () => {
    const md = await makeMd();
    const html = md.render('```mermaid\ngraph A\n```');
    expect(html).toMatch(/href="https:\/\/mermaid\.live\/edit\?code=graph%20A/);
  });

  it('aliases mermaid-link to the same renderer', async () => {
    const md = await makeMd();
    const html = md.render('```mermaid-link\ngraph A\n```');
    expect(html).toContain('mermaid-link-block');
  });

  it('passes through other fenced langs', async () => {
    const md = await makeMd();
    const html = md.render('```dna\nATGC\n```');
    expect(html).not.toContain('mermaid-link-block');
  });
});

/**
 * NB-K4 — DNA/AA fence highlight.
 */
import { describe, it, expect } from 'vitest';
import {
  dnaHighlightPlugin,
  DNA_COLOURS,
  AA_COLOURS,
} from '../markdown-dna-highlight-plugin';

async function makeMd() {
  const { default: MarkdownIt } = await import('markdown-it');
  return new MarkdownIt({ html: false }).use(dnaHighlightPlugin);
}

describe('NB-K4 — fenced ```dna highlight', () => {
  it('colours A T G C with canonical palette', async () => {
    const md = await makeMd();
    const html = md.render('```dna\nATGC\n```');
    expect(html).toContain(`<span style="color: ${DNA_COLOURS.A}">A</span>`);
    expect(html).toContain(`<span style="color: ${DNA_COLOURS.T}">T</span>`);
    expect(html).toContain(`<span style="color: ${DNA_COLOURS.G}">G</span>`);
    expect(html).toContain(`<span style="color: ${DNA_COLOURS.C}">C</span>`);
    expect(html).toContain('class="seq-block seq-dna"');
  });

  it('auto-uppercases lowercase input', async () => {
    const md = await makeMd();
    const html = md.render('```dna\natgc\n```');
    expect(html).toContain(`<span style="color: ${DNA_COLOURS.A}">A</span>`);
    expect(html).not.toContain('>a<');
  });

  it('renders gap "-" with grey colour, preserves whitespace via <pre>', async () => {
    const md = await makeMd();
    const html = md.render('```dna\nAT-GC\n```');
    expect(html).toContain(`<span style="color: ${DNA_COLOURS['-']}">-</span>`);
  });

  it('U in rna block coloured red (same as T)', async () => {
    const md = await makeMd();
    const html = md.render('```rna\nAUGC\n```');
    expect(html).toContain(`<span style="color: ${DNA_COLOURS.U}">U</span>`);
    expect(html).toContain('class="seq-block seq-rna"');
  });

  it('cdna alias picked up', async () => {
    const md = await makeMd();
    const html = md.render('```cdna\nATGC\n```');
    expect(html).toContain('class="seq-block seq-cdna"');
  });
});

describe('NB-K4 — fenced ```aa / ```protein highlight', () => {
  it('colours hydrophobic group grey (A V L I M F W P)', async () => {
    const md = await makeMd();
    const html = md.render('```aa\nAVLIM\n```');
    // Each char wrapped, all grey.
    for (const ch of 'AVLIM') {
      expect(html).toContain(`<span style="color: ${AA_COLOURS[ch]}">${ch}</span>`);
    }
  });

  it('colours acidic group red (D E)', async () => {
    const md = await makeMd();
    const html = md.render('```aa\nDE\n```');
    expect(html).toContain(`<span style="color: ${AA_COLOURS.D}">D</span>`);
    expect(html).toContain(`<span style="color: ${AA_COLOURS.E}">E</span>`);
  });

  it('renders stop codon "*" in black', async () => {
    const md = await makeMd();
    const html = md.render('```aa\nMKL*\n```');
    expect(html).toContain(`<span style="color: ${AA_COLOURS['*']}">*</span>`);
  });

  it('protein alias picked up', async () => {
    const md = await makeMd();
    const html = md.render('```protein\nMKL\n```');
    expect(html).toContain('class="seq-block seq-protein"');
  });
});

describe('NB-K4 — passes through unknown fenced langs', () => {
  it('non-DNA/AA language renders default code block', async () => {
    const md = await makeMd();
    const html = md.render('```python\nprint("hi")\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code class="language-python">');
    expect(html).toMatch(/print\(&quot;hi&quot;\)|print\("hi"\)/);
    expect(html).not.toContain('seq-block');
  });

  it('un-info fence (no language) renders default', async () => {
    const md = await makeMd();
    const html = md.render('```\nsome plain code\n```');
    expect(html).toContain('<pre>');
    expect(html).not.toContain('seq-block');
  });
});

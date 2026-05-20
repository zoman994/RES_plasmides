/**
 * markdown-dna-highlight-plugin — fenced code-block colourisation for
 * DNA / RNA / amino-acid sequences.
 *
 * Spec §10. Recognised infos: dna, cdna, rna, aa, protein.
 *
 * Render shape:
 *   <pre class="seq-block seq-<lang>"><code>
 *     <span style="color:#3DA635">A</span>...
 *   </code></pre>
 *
 * Char colours come from canonical biology palettes (§10.2). Lowercase
 * input is auto-uppercased so editing typos don't break the highlight.
 * Non-palette chars stay bare (no <span>) — preserves whitespace + gaps
 * naturally.
 */

const DNA_COLOURS = {
  A: '#3DA635',
  T: '#D62828',
  U: '#D62828',
  G: '#F77F00',
  C: '#3D7EA6',
  N: '#888888',
  '-': '#cccccc',
};

const AA_COLOURS = {
  // Hydrophobic
  A: '#888888', V: '#888888', L: '#888888', I: '#888888',
  M: '#888888', F: '#888888', W: '#888888', P: '#888888',
  // Polar uncharged
  S: '#3DA635', T: '#3DA635', C: '#3DA635', Y: '#3DA635',
  N: '#3DA635', Q: '#3DA635',
  // Basic (positive)
  K: '#3D7EA6', R: '#3D7EA6', H: '#3D7EA6',
  // Acidic (negative)
  D: '#D62828', E: '#D62828',
  // Special
  G: '#F77F00',
  // Stop
  '*': '#000000',
};

const DNA_INFOS = new Set(['dna', 'cdna', 'rna']);
const AA_INFOS = new Set(['aa', 'protein']);

export function dnaHighlightPlugin(md) {
  const originalFence = md.renderer.rules.fence
    || ((tokens, idx, options, env, slf) => slf.renderToken(tokens, idx, options));
  md.renderer.rules.fence = function fence(tokens, idx, options, env, slf) {
    const token = tokens[idx];
    const info = (token.info || '').trim().toLowerCase();
    if (DNA_INFOS.has(info)) {
      return renderSeqBlock(token.content, DNA_COLOURS, info);
    }
    if (AA_INFOS.has(info)) {
      return renderSeqBlock(token.content, AA_COLOURS, info);
    }
    return originalFence.call(this, tokens, idx, options, env, slf);
  };
}

function renderSeqBlock(content, palette, lang) {
  const upper = (content || '').toUpperCase();
  let out = `<pre class="seq-block seq-${escape(lang)}"><code>`;
  for (const ch of upper) {
    if (ch === '\n') {
      out += '\n';
      continue;
    }
    const colour = palette[ch];
    if (colour) {
      out += `<span style="color: ${colour}">${escapeChar(ch)}</span>`;
    } else {
      out += escapeChar(ch);
    }
  }
  out += '</code></pre>\n';
  return out;
}

function escape(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeChar(c) {
  if (c === '&') return '&amp;';
  if (c === '<') return '&lt;';
  if (c === '>') return '&gt;';
  if (c === '"') return '&quot;';
  if (c === "'") return '&#39;';
  return c;
}

export { DNA_COLOURS, AA_COLOURS };

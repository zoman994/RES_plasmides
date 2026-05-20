/**
 * markdown-mermaid-link-plugin — external editor stub for mermaid blocks.
 *
 * Spec §11. v2.0.0 does NOT inline-render mermaid (would pull in ~700 KB
 * mermaid lib). Instead the plugin emits a preview face with:
 *   - 📊 icon + line count.
 *   - Raw source visible in <pre><code>.
 *   - Copy button.
 *   - Open-in-editor link to mermaid.live with the source preloaded.
 *
 * Biologist's flow: write mermaid in notebook → click ↗ Open → mermaid.live
 * renders → export PNG → drag-drop back into notebook as a regular image.
 */

const MERMAID_INFOS = new Set(['mermaid', 'mermaid-link']);

export function mermaidLinkPlugin(md) {
  const originalFence = md.renderer.rules.fence
    || ((tokens, idx, options, env, slf) => slf.renderToken(tokens, idx, options));
  md.renderer.rules.fence = function fence(tokens, idx, options, env, slf) {
    const token = tokens[idx];
    const info = (token.info || '').trim().toLowerCase();
    if (!MERMAID_INFOS.has(info)) {
      return originalFence.call(this, tokens, idx, options, env, slf);
    }
    return renderMermaidStub(token.content, md);
  };
}

function renderMermaidStub(content, md) {
  const safe = md.utils.escapeHtml(content || '');
  const lineCount = (content || '').split('\n').filter(Boolean).length;
  // mermaid.live uses base64-encoded JSON state in the URL fragment.
  // We pass an opaque source value via `pako=` would require pako; for
  // the lightweight stub we use the `#edit?code=` legacy path with raw.
  const encoded = encodeURIComponent(content || '');
  const editUrl = `https://mermaid.live/edit?code=${encoded}`;
  return [
    '<div class="mermaid-link-block">',
    `  <div class="mermaid-link-header">📊 Mermaid diagram (${lineCount} lines)</div>`,
    `  <pre><code>${safe}</code></pre>`,
    '  <div class="mermaid-link-actions">',
    `    <button class="md-copy" data-content="${md.utils.escapeHtml(content || '')}">📋 Copy</button>`,
    `    <a href="${md.utils.escapeHtml(editUrl)}" target="_blank" rel="noopener">↗ Open in editor</a>`,
    '  </div>',
    '</div>\n',
  ].join('\n');
}

/**
 * markdown-ref-plugin — custom `@@ref:kind:id@@` inline syntax.
 *
 * Spec §3. Tokenizes the @@ref@@ marker into a `bodge_ref` token with
 * meta `{kind, id}`. Renderer looks up a display label via a global
 * resolver (set by useMarkdownRefResolver in the host React app).
 *
 * Plugin is pure markdown-it — no React deps. The host app sets the
 * resolver on mount; renderer fetches synchronously.
 */

let displayLabelResolver = null;

/**
 * Set the global display-label resolver. Called by useMarkdownRefResolver
 * on notebook mount. Without a resolver, the renderer falls back to
 * `<short-id>` for the label.
 *
 * @param {(kind: string, id: string) => string} resolver
 */
export function setRefDisplayLabelResolver(resolver) {
  displayLabelResolver = resolver;
}

/**
 * Read the current resolver — used by snapshotRefsToPlain (§3.4) and
 * tests.
 */
export function getRefDisplayLabel(kind, id) {
  if (displayLabelResolver) {
    try {
      return displayLabelResolver(kind, id);
    } catch {
      // Fall through to default.
    }
  }
  return id?.slice(0, 8) || '';
}

/**
 * Snapshot all `@@ref:kind:id@@` markers in a text into plain text
 * labels. Used by public-supp export to bake refs into the markdown.
 */
export function snapshotRefsToPlain(text) {
  if (!text) return '';
  return text.replace(/@@ref:([a-z]+):([a-zA-Z0-9_-]+)@@/g, (_, kind, id) => {
    return getRefDisplayLabel(kind, id);
  });
}

/**
 * Main markdown-it plugin entry. Registers an inline rule before
 * `emphasis` so `@@ref@@` parses first.
 */
export function bodgeRefPlugin(md) {
  md.inline.ruler.before('emphasis', 'bodge_ref', refTokenizer);
  md.renderer.rules.bodge_ref = renderRefBadge;
}

const REF_PATTERN = /^@@ref:([a-z]+):([a-zA-Z0-9_-]+)@@/;

function refTokenizer(state, silent) {
  if (state.src.charCodeAt(state.pos) !== 0x40 /* @ */) return false;
  if (state.src.charCodeAt(state.pos + 1) !== 0x40) return false;
  const tail = state.src.slice(state.pos);
  const match = REF_PATTERN.exec(tail);
  if (!match) return false;
  if (!silent) {
    const token = state.push('bodge_ref', '', 0);
    token.meta = { kind: match[1], id: match[2] };
    token.content = match[0];
  }
  state.pos += match[0].length;
  return true;
}

function renderRefBadge(tokens, idx, options, env, slf) {
  const tok = tokens[idx];
  const { kind, id } = tok.meta || {};
  const label = getRefDisplayLabel(kind, id);
  const safeKind = escape(kind);
  const safeId = escape(id);
  const safeLabel = escape(label);
  return `<button class="md-ref" data-ref-kind="${safeKind}" data-ref-id="${safeId}" title="${safeKind}: ${safeId}">→ ${safeLabel}</button>`;
}

function escape(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

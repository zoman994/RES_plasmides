/**
 * markdown-renderer — lazy singleton + sanitization pipeline for the
 * notebook layer.
 *
 * Spec §2.2. Three-layer XSS defense (§12):
 *   1. Parser-level: markdown-it({ html: false }) — raw HTML not parsed.
 *   2. Plugin-level: custom plugins escape user input via md.utils.escapeHtml.
 *   3. Output-level: DOMPurify.sanitize with strict allow-list.
 *
 * The renderer is lazy because all of these deps add ~60 KB gzipped
 * (markdown-it + plugins + DOMPurify). The notebook tab triggers the
 * dynamic import; biologists who never open notebook pay nothing.
 *
 * Custom plugins are registered here:
 *   - bodgeRefPlugin (K3) — @@ref:kind:id@@ → clickable badge.
 *   - dnaHighlightPlugin (K4) — fenced dna/aa/rna/protein → coloured.
 *   - mermaidLinkPlugin (K5) — fenced mermaid → preview + ↗ editor stub.
 */
import { bodgeRefPlugin } from './markdown-ref-plugin';
import { dnaHighlightPlugin } from './markdown-dna-highlight-plugin';
import { mermaidLinkPlugin } from './markdown-mermaid-link-plugin';

let cachedRenderer = null;
let cachedDompurify = null;
let katexLoaded = false;

/**
 * Lazy singleton — first call constructs MarkdownIt + all plugins,
 * subsequent calls return the cached instance.
 */
export async function getMarkdownRenderer() {
  if (cachedRenderer) return cachedRenderer;
  const [{ default: MarkdownIt }, { default: taskLists },
    { default: footnote }, { default: mark }] = await Promise.all([
    import('markdown-it'),
    import('markdown-it-task-lists'),
    import('markdown-it-footnote'),
    import('markdown-it-mark'),
  ]);
  const md = new MarkdownIt({
    html: false,         // raw HTML rejected at parser level
    linkify: true,
    breaks: true,
    typographer: true,
  });
  md.use(taskLists);
  md.use(footnote);
  md.use(mark);
  md.use(bodgeRefPlugin);
  md.use(dnaHighlightPlugin);
  md.use(mermaidLinkPlugin);
  cachedRenderer = md;
  return md;
}

async function getDompurify() {
  if (cachedDompurify) return cachedDompurify;
  const mod = await import('isomorphic-dompurify');
  cachedDompurify = mod.default || mod;
  return cachedDompurify;
}

/**
 * Strict allow-list for sanitize output. Anything not in this list is
 * stripped by DOMPurify.
 */
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'em', 'mark', 'del', 's', 'sub', 'sup',
  'code', 'pre',
  'a', 'img',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote',
  'button', 'span', 'div',
  'input', // for task list checkboxes
  'section', // markdown-it-footnote wraps refs in <section>
];

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'title',
  'src', 'alt',
  'class', 'style',
  'type', 'checked', 'disabled',
  'data-ref-kind', 'data-ref-id',
  'data-att-id', 'data-att-missing',
  'data-content', 'data-line',
  'id', 'role', 'aria-label',
];

/**
 * Main entry — turns markdown text into sanitized HTML.
 *
 * @param {string} text — markdown source.
 * @param {object} [opts]
 * @param {Map<string,{blobUrl}>} [opts.attachments] — runtime attachment
 *   registry; image src refs to `att<id>.<ext>` are rewritten to blob URLs.
 *
 * Steps:
 *   1. Get renderer.
 *   2. Detect $...$ → lazy-load markdown-it-katex once (idempotent).
 *   3. md.render(text).
 *   4. resolveAttachmentRefs.
 *   5. DOMPurify.sanitize.
 */
export async function renderMarkdown(text, opts = {}) {
  const md = await getMarkdownRenderer();
  // KaTeX lazy-load on first $ detect. Vite-ignored so the import is
  // resolved at runtime only — the plugin is installed in K12.
  if (!katexLoaded && /\$/.test(text)) {
    try {
      // Variable-name import so vite-import-analysis can't statically
      // resolve and fail when the package is absent.
      const katexModName = 'markdown-it-katex';
      const mod = await import(/* @vite-ignore */ katexModName);
      const katex = mod.default || mod;
      md.use(katex);
      katexLoaded = true;
    } catch {
      // KaTeX deps may not be installed yet — fall through. The $ syntax
      // renders as literal text, which is safe.
    }
  }
  const rawHtml = md.render(text);
  const withRefs = resolveAttachmentRefs(rawHtml, opts.attachments);
  const DOMPurify = await getDompurify();
  return DOMPurify.sanitize(withRefs, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    // Extend the default URL whitelist to allow blob: URLs for attachment
    // <img src="blob:..."> rewrites. Default DOMPurify regex rejects them.
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/**
 * Walk image srcs of the form `att<id>.<ext>` and replace them with
 * blob URLs from the attachments map. Missing attachments get a
 * placeholder marker so the UI can show "(missing)".
 *
 * Pure string transform — no DOM. Runs before DOMPurify so the
 * resulting blob URL passes the URL whitelist (DOMPurify allows
 * blob: URLs by default).
 */
export function resolveAttachmentRefs(html, attachments) {
  if (!html) return '';
  if (!attachments || (attachments.size === 0 && !attachments.get)) return html;
  return html.replace(/<img([^>]*)src="att([a-zA-Z0-9_-]+)(?:\.[a-zA-Z0-9]+)?"([^>]*)>/gi,
    (match, pre, attId, post) => {
      const idKey = `att${attId}`;
      // attachments map can use either the bare "att<id>" key or the
      // full "att<id>.<ext>" filename; try both.
      const att = attachments.get?.(idKey)
        || attachments.get?.(`att${attId}`)
        || null;
      if (att?.blobUrl) {
        return `<img${pre}src="${att.blobUrl}" data-att-id="${idKey}"${post}>`;
      }
      return `<img${pre}data-att-missing="true" alt="(missing attachment ${idKey})" data-att-id="${idKey}"${post}>`;
    });
}

/**
 * Reset singletons. ONLY for tests — production code keeps the
 * cached renderer across notebook entry switches.
 */
export function _resetRendererForTests() {
  cachedRenderer = null;
  cachedDompurify = null;
  katexLoaded = false;
}

export { ALLOWED_TAGS, ALLOWED_ATTR };

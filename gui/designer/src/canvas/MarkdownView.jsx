/**
 * MarkdownView — React component that consumes the markdown-renderer
 * pipeline (lib/markdown-renderer.js).
 *
 * Spec §2.3.
 *   - Async render; cleanup flag avoids stale setState on unmount.
 *   - Refs come through as <button class="md-ref" data-ref-kind data-ref-id>;
 *     a delegated click handler turns those into onRefClick({kind, id}).
 *   - innerHTML is set from sanitized output (DOMPurify upstream); content
 *     is opaque so we don't try to React-render it.
 *
 * The host page (NotebookEntryEditor in K8) is expected to call
 * useMarkdownRefResolver() so the resolver is set on mount.
 */
import { useEffect, useRef, useState } from 'react';
import { renderMarkdown } from '../lib/markdown-renderer';

export default function MarkdownView({
  text,
  attachments,
  onRefClick,
  className,
  style,
  testId = 'markdown-view',
}) {
  const [html, setHtml] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const out = await renderMarkdown(text || '', { attachments });
        if (!cancelled) setHtml(out);
      } catch (e) {
        if (!cancelled) {
          setHtml(`<p style="color:var(--accent-500,#b85c3e)">Render error: ${escapeHtml(e?.message || 'unknown')}</p>`);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [text, attachments]);

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      className={className}
      style={style}
      onClick={(e) => dispatchRefClick(e, onRefClick)}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function dispatchRefClick(e, onRefClick) {
  if (typeof onRefClick !== 'function') return;
  const target = e.target?.closest?.('.md-ref');
  if (!target) return;
  const kind = target.getAttribute('data-ref-kind');
  const id = target.getAttribute('data-ref-id');
  if (!kind || !id) return;
  e.preventDefault();
  onRefClick({ kind, id });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

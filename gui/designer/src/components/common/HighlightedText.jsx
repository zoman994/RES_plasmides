/**
 * HighlightedText — render `text` with <mark> around matched ranges.
 *
 * Uses React children (auto-escaped) — NEVER dangerouslySetInnerHTML — so a name,
 * feature label, or qualifier that happens to contain markup is shown as literal
 * text, not injected. Accepts explicit `spans` (0-based, end-exclusive; overlapping
 * / unsorted are normalized) or a case-insensitive `query` substring fallback.
 */
import React from 'react';

const MARK_STYLE = { background: 'var(--search-mark-bg, #fde68a)', color: 'inherit', padding: '0 1px', borderRadius: 2 };

function normalizeSpans(spans, len) {
  const clean = (spans || [])
    .filter((s) => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(len, s.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  // merge overlapping / adjacent
  const merged = [];
  for (const s of clean) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged;
}

function spansFromQuery(text, query) {
  if (!query) return [];
  const i = text.toLowerCase().indexOf(String(query).toLowerCase());
  return i < 0 ? [] : [{ start: i, end: i + query.length }];
}

export default function HighlightedText({ text = '', spans, query, style, markStyle, testId }) {
  const str = String(text ?? '');
  const ranges = normalizeSpans(spans && spans.length ? spans : spansFromQuery(str, query), str.length);
  if (!ranges.length) {
    return <span data-testid={testId} style={style}>{str}</span>;
  }
  const nodes = [];
  let cursor = 0;
  ranges.forEach((r, idx) => {
    if (r.start > cursor) nodes.push(str.slice(cursor, r.start));
    nodes.push(
      <mark key={`m${idx}`} style={{ ...MARK_STYLE, ...markStyle }}>{str.slice(r.start, r.end)}</mark>,
    );
    cursor = r.end;
  });
  if (cursor < str.length) nodes.push(str.slice(cursor));
  return <span data-testid={testId} style={style}>{nodes}</span>;
}

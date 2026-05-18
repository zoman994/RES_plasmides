/**
 * SequenceSearchPopover — Sprint M-X.9 K2.
 *
 * Modal popover that runs a seed-and-extend DNA search against a
 * caller-provided target sequence and surfaces the hits as a list.
 * Used by:
 *   • Local Ctrl+F path (K2): caller supplies the currently
 *     visible sequence (the active library entry's payload).
 *   • Future SequenceView overlay-rect rendering — deferred to a
 *     follow-up iteration; the popover already exposes per-hit
 *     positions so SequenceView only needs to read them.
 *
 * Algorithm wiring is in `lib/sequence-search.js` (pure). Recent
 * searches persist via `lib/sequence-search-recent.js`.
 *
 * IUPAC validation per K4 §4 — degenerate codes get a toast and
 * the search is skipped.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import {
  searchSequence, identityBucket, hasIupacAmbiguity,
} from '../lib/sequence-search';
import {
  getRecentSearches, pushRecentSearch,
} from '../lib/sequence-search-recent';

const MIN_QUERY = 8;
// FAIL-fix-pass 6 — bucket colours include `orange` tier (70-79%)
// per the spec. <70% (`low`) renders grey since the threshold also
// filters those out by default.
const BUCKET_COLOR = {
  high: 'var(--success-fg, #16a34a)',
  mid: '#d97706',    // amber (80-89%)
  orange: '#ea580c',  // orange (70-79%)
  low: 'var(--text-tertiary)', // grey (<70%, only with relaxed slider)
};

function HitRow({ hit, target, onJumpTo }) {
  // FAIL-fix-pass 6 — primary metric: per-query identity. Coverage
  // string is mandatory (`query[X..Y) · M/N nt`). Tooltip surfaces
  // the secondary hit-identity so biolog can confirm the extension
  // itself was clean even when queryIdentity is dragged down by an
  // overhang.
  const color = BUCKET_COLOR[identityBucket(hit.queryIdentity)] || 'var(--text-secondary)';
  const queryPct = (hit.queryIdentity * 100).toFixed(1);
  const range = `${hit.targetStart + 1}–${hit.targetEnd}`;
  const strand = hit.strand === -1 ? '−' : '+';
  // Фикс 7 — `query[X..Y)` prefix only when the hit is a partial
  // overhang. Full-coverage hits show just `M/N nt`.
  const isPartial = hit.queryStart > 0 || hit.queryEnd < (hit.matches + hit.mismatches + (hit.gapsInQuery || 0));
  const coverageText = isPartial
    ? `query[${hit.queryStart}..${hit.queryEnd}) · ${hit.matches}/${hit.length} nt`
    : `${hit.matches}/${hit.length} nt`;
  const secondaryTip = (hit.gapsInQuery || hit.gapsInTarget)
    ? `${hit.gapsInQuery + hit.gapsInTarget} indel(s) · ${hit.length} nt window`
    : `${hit.length} nt window`;
  const tipFor3p = hit.threePrimeOk === true ? '✓ 3′-end' :
    hit.threePrimeOk === false ? '⚠ 3′-end mm' : null;
  const fragment = target?.slice(hit.targetStart, Math.min(hit.targetEnd, hit.targetStart + 60));
  return (
    <button
      type="button"
      data-testid={`search-hit-${hit.targetStart}-${hit.strand}`}
      onClick={() => onJumpTo?.(hit)}
      title={secondaryTip}
      style={{
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        padding: '6px 10px',
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12,
        cursor: onJumpTo ? 'pointer' : 'default',
        borderTop: '1px solid var(--border-subtle)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span
        title="strand"
        style={{
          fontFamily: 'var(--font-mono, monospace)',
          width: 14, textAlign: 'center',
          color: hit.strand === -1 ? 'var(--text-tertiary)' : 'var(--accent-700)',
        }}
      >{strand}</span>
      <span
        style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 11, color: 'var(--text-secondary)',
          minWidth: 90,
        }}
      >{range}</span>
      <span
        data-testid={`search-hit-${hit.targetStart}-${hit.strand}-identity`}
        style={{
          color, fontWeight: 500, minWidth: 56,
        }}
      >{queryPct}%</span>
      <span
        data-testid={`search-hit-${hit.targetStart}-${hit.strand}-coverage`}
        style={{ color: 'var(--text-tertiary)', fontSize: 11, minWidth: 170 }}
      >{coverageText}</span>
      {tipFor3p && (
        <span
          title={tipFor3p}
          style={{
            fontSize: 10, padding: '0 5px', borderRadius: 9,
            background: hit.threePrimeOk ? 'var(--success-50, var(--surface-2))' : '#fef3c7',
            color: hit.threePrimeOk ? 'var(--success-fg)' : '#92400e',
            border: '1px solid var(--border-subtle)',
          }}
        >{hit.threePrimeOk ? '✓ 3′' : '⚠ 3′'}</span>
      )}
      <span
        title={fragment}
        style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'var(--font-mono, monospace)', fontSize: 10,
          color: 'var(--text-tertiary)',
        }}
      >{fragment}</span>
    </button>
  );
}

export const SequenceSearchPopover = memo(function SequenceSearchPopover({
  open,
  onClose,
  targetSequence,
  targetName,
  // entryId — needed so the overlay-rect publish only matches when
  // SequenceTab is rendering the same entry. Optional (omit → no
  // overlay rects, popover-only flow).
  entryId = null,
  onJumpTo,
}) {
  const showToast = useStore((s) => s.showToast);
  const setSearchHits = useStore((s) => s.setSearchHits);
  const clearSearchHits = useStore((s) => s.clearSearchHits);
  const [query, setQuery] = useState('');
  const [threshold, setThreshold] = useState(80);
  const [showRecent, setShowRecent] = useState(false);
  const [recents, setRecents] = useState(() => getRecentSearches());
  const inputRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Reset when target changes — different sequence, different
  // index. Keep query so user can pivot.
  useEffect(() => {
    setShowRecent(false);
  }, [targetSequence]);

  const trimmed = (query || '').trim().toUpperCase();
  const hasIupac = hasIupacAmbiguity(trimmed);
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_QUERY;
  const validQuery = trimmed.length >= MIN_QUERY && !hasIupac
    && /^[ACGT]+$/.test(trimmed);
  const hits = useMemo(() => {
    if (!validQuery || !targetSequence) return [];
    return searchSequence(trimmed, targetSequence, {
      identityThreshold: threshold / 100,
    });
  }, [validQuery, trimmed, targetSequence, threshold]);

  // Publish hits to the store so SequenceTab/SequenceView can render
  // overlay rects (TD-SEARCH-OVERLAY-RECTS). Scoped by entryId so
  // stale hits don't smear over a different entry.
  useEffect(() => {
    if (!open) return;
    if (!entryId || !validQuery) {
      setSearchHits?.(null, '', []);
      return;
    }
    setSearchHits?.(entryId, trimmed, hits);
  }, [open, entryId, trimmed, validQuery, hits, setSearchHits]);

  // Clear hits when popover closes.
  useEffect(() => {
    if (!open) clearSearchHits?.();
  }, [open, clearSearchHits]);

  const onSubmit = (e) => {
    e?.preventDefault?.();
    if (tooShort) {
      showToast?.('Минимум 8 нт. Для RE-сайтов используй панель ферментов.', 'info');
      return;
    }
    if (hasIupac) {
      showToast?.('IUPAC будет в следующей итерации, используй plain ACGT.', 'info');
      return;
    }
    if (validQuery) {
      pushRecentSearch(trimmed);
      setRecents(getRecentSearches());
    }
  };

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const pickRecent = (q) => {
    setQuery(q);
    setShowRecent(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return createPortal(
    // 11.05.2026 — non-modal floating panel. Backdrop dimmed the
    // SequenceView and made the search overlay rects invisible;
    // worse, biolog couldn't scroll/click the sequence while the
    // popover was open. Now the panel sits in the top-right
    // corner with no backdrop and `pointer-events: none` on the
    // outer wrapper so clicks fall through everywhere except
    // inside the panel itself.
    <div
      ref={overlayRef}
      data-testid="sequence-search-overlay"
      style={{
        position: 'fixed', top: 64, right: 16,
        zIndex: 95,
        pointerEvents: 'none',
      }}
    >
      <div
        data-testid="sequence-search-popover"
        role="dialog"
        aria-label="Поиск ПСО"
        style={{
          width: 560, maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 96px)',
          background: 'var(--surface-1)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,0.32)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}
      >
        <form
          onSubmit={onSubmit}
          style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                ref={inputRef}
                type="text"
                data-testid="sequence-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Найти ПСО (ACGT, мин. 8 нт)…"
                style={{
                  width: '100%', height: 32, padding: '0 32px 0 10px',
                  fontSize: 13,
                  background: 'var(--surface-2)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  outline: 'none',
                  fontFamily: 'var(--font-mono, monospace)',
                  textTransform: 'uppercase',
                }}
              />
              <button
                type="button"
                data-testid="sequence-search-recent-toggle"
                onClick={() => setShowRecent((v) => !v)}
                title="Недавние запросы"
                style={{
                  position: 'absolute', right: 4, top: 4, height: 24, width: 24,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text-tertiary)', fontSize: 11,
                }}
              >▾</button>
              {showRecent && recents.length > 0 && (
                <div
                  data-testid="sequence-search-recent-list"
                  style={{
                    position: 'absolute', top: 36, left: 0, right: 0,
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 4,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                    maxHeight: 220, overflowY: 'auto',
                    zIndex: 1,
                  }}
                >
                  {recents.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => pickRecent(q)}
                      style={{
                        width: '100%', textAlign: 'left',
                        padding: '6px 10px',
                        fontSize: 11, fontFamily: 'var(--font-mono, monospace)',
                        background: 'transparent', border: 'none',
                        color: 'var(--text-primary)', cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >{q.length > 60 ? q.slice(0, 57) + '…' : q}</button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              data-testid="sequence-search-submit"
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 500,
                background: 'var(--accent-500)',
                color: '#fff', border: 'none', borderRadius: 4,
                cursor: 'pointer',
              }}
            >Найти</button>
            <button
              type="button"
              data-testid="sequence-search-close"
              title="Закрыть (Esc)"
              onClick={() => onClose?.()}
              style={{
                fontSize: 14, padding: '0 8px',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                border: '1px solid transparent',
                borderRadius: 4,
                cursor: 'pointer',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >✕</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
            <label htmlFor="search-threshold">Identity ≥</label>
            <input
              id="search-threshold"
              type="range"
              data-testid="sequence-search-threshold"
              min={50} max={100} step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value) || 80)}
              style={{ flex: 1 }}
            />
            <span style={{ width: 36, fontFamily: 'var(--font-mono, monospace)' }}>{threshold}%</span>
          </div>
          {targetName && (
            <div
              style={{
                fontSize: 11, color: 'var(--text-tertiary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              data-testid="sequence-search-target-name"
            >Поиск в: {targetName}</div>
          )}
        </form>
        <div
          data-testid="sequence-search-results"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
        >
          {validQuery && hits.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
              Ничего не найдено при identity ≥ {threshold}%.
            </div>
          )}
          {!validQuery && trimmed.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
              Введите ПСО (минимум {MIN_QUERY} нт).
            </div>
          )}
          {tooShort && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
              Минимум {MIN_QUERY} нт. Для RE-сайтов используй панель ферментов.
            </div>
          )}
          {hasIupac && trimmed.length >= MIN_QUERY && (
            <div style={{ padding: 12, fontSize: 12, color: '#92400e' }}>
              IUPAC degenerate codes (N/W/R/…) пока не поддерживаются — используй plain ACGT.
            </div>
          )}
          {hits.length > 0 && (
            <>
              <div
                data-testid="sequence-search-hit-count"
                style={{
                  padding: '8px 10px', fontSize: 11,
                  color: 'var(--text-tertiary)',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--surface-2)',
                }}
              >Найдено: {hits.length}</div>
              {hits.map((h) => (
                <HitRow
                  key={`${h.strand}-${h.targetStart}-${h.targetEnd}`}
                  hit={h}
                  target={targetSequence}
                  onJumpTo={onJumpTo}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
});

export default SequenceSearchPopover;

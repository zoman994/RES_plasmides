/**
 * SequenceSearchPopover — in-molecule Ctrl+F, on the SAME worker as every other search surface (U4).
 *
 * It used to call the legacy `searchSequence` synchronously in a `useMemo` — on the UI thread, on a
 * different engine from the global bar. Two surfaces onto one molecule could disagree, and a
 * biologist had no way to tell which answer was right. Now the popover borrows the app-wide worker
 * through the `popover` channel (`useSequenceSearchChannel`): one owner, one heavy pass at a time.
 *
 * The canonical unit is the OCCURRENCE — `location.segments` (0-based half-open, TWO of them for an
 * origin wrap), `location.strand` (+ / − / both), and the finalized `metrics`. The popover stores
 * occurrences WITHOUT flattening them, so a circular hit keeps both segments and a palindrome stays
 * on both strands all the way to the click. No sequence fragment, edit script, or mismatch overlay
 * is ever shown here — the finalized metrics carry none of it.
 *
 * The Overlay (SequenceView) still reads the FLAT `searchHits` slice, so — until that surface is
 * migrated — the ONLY thing written there is a temporary projection via `overlayHitsFromLocation`.
 * Canonical occurrences never touch `searchHits`.
 *
 * Distinct outcomes, never conflated: pending (checking), honest empty (a proven miss), routed (too
 * long → alignment), incomplete (the check did not finish — resource limit / worker fault). No
 * unfinished state ever renders a row or «nothing found».
 *
 * Alphabet validation per §2.5 — A/C/G/T only, checked before length, so `U` is named as RNA rather
 * than told to «add more bases».
 */
import {
  memo, useCallback, useEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { t, tf } from '../i18n';
import { canonicalDnaQuery } from '../lib/sequence-search';
import { getRecentSearches, pushRecentSearch } from '../lib/sequence-search-recent';
import { useSequenceSearchChannel } from './sequence-search-context';
import SearchProgressTrack from './Search/SearchProgressTrack';
import { SEARCH_ABORT } from '../lib/sequence-search-coordinator';
import { locusSummary, formatLocationCount } from '../lib/search-locus-summary';
import LocusSummary from './Search/LocusSummary';
import { LOCUS_LABELS } from '../lib/search-locus-labels';

const MIN_QUERY = 8;
// Only the query keystroke is debounced — the heavy pass, never the UI. 200 ms is short enough to
// feel live and long enough that a fast typist does not spawn a pass per character.
const DEBOUNCE_MS = 200;

/** A stable key that identifies THIS occurrence — segments (both wrap segments) AND strand. Two hits
 * at the same physical locus on opposite strands are distinct occurrences, so they must not collide
 * on one React key / testid. */
function occurrenceKey(occ) {
  return `${(occ.location.segments || []).map((s) => `${s.start}_${s.end}`).join('-')}@${occ.location.strand}`;
}
function HitRow({ occ, onJumpTo }) {
  // U5-A — the SAME summary object and the SAME presentation component the global dropdown row
  // uses. This row used to compute strand, coordinates, M/L, X·I·D and the percentage from private
  // helpers here, which is how the two surfaces ended up describing one occurrence differently (the
  // dropdown re-rounded a float, this one read basis points) and how the unit label got hard-coded.
  const summary = locusSummary(occ);
  return (
    <button
      type="button"
      data-testid={`search-hit-${occurrenceKey(occ)}`}
      onClick={() => onJumpTo?.(occ)}
      style={{
        width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
        padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
        cursor: onJumpTo ? 'pointer' : 'default', borderTop: '1px solid var(--border-subtle)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <LocusSummary summary={summary} testIdPrefix="hitcell" labels={LOCUS_LABELS()} />
    </button>
  );
}

export const SequenceSearchPopover = memo(function SequenceSearchPopover({
  open,
  onClose,
  targetSequence,
  targetName,
  targetTopology,
  // entryId — scopes the flat overlay projection so stale hits don't smear over a different entry.
  entryId = null,
  // revision — pinned onto the jump so an edit landing mid-jump is caught as stale by the consumer.
  revision,
  onJumpTo,
}) {
  const showToast = useStore((s) => s.showToast);
  const setSearchHits = useStore((s) => s.setSearchHits);
  const clearSearchHits = useStore((s) => s.clearSearchHits);
  const channel = useSequenceSearchChannel('popover');

  const [query, setQuery] = useState('');
  const [threshold, setThreshold] = useState(80);
  const [showRecent, setShowRecent] = useState(false);
  const [recents, setRecents] = useState(() => getRecentSearches());
  // Find / retry: bumping this re-dispatches the same query on a fresh pass (used to recover from a
  // CANCELLED steal). It is part of the request facts so pressing it re-pends at once.
  const [retryTick, setRetryTick] = useState(0);
  // The settled outcome of the LATEST dispatch, TAGGED with the FULL request facts it answers (query,
  // threshold, the molecule ITSELF, its topology, entryId, revision, retry). Written only from the
  // async settlement, so «this run answers a stale request» is a pure render-time comparison — not a
  // state to clear by hand. Tagging by query text ALONE was the bug: a revision bump with the same
  // text left old rows clickable, and the Host then stamped stale coordinates onto the new revision.
  // `kind` ∈ results | empty | routed | incomplete | cancelled.
  const [run, setRun] = useState({ facts: null, kind: 'idle', occurrences: [], routedMax: 0 });
  const inputRef = useRef(null);
  const overlayRef = useRef(null);
  // Monotonic generation: retired at the START of every effect run and on unmount, so a late settle
  // from a superseded / cancelled dispatch can never publish.
  const runRef = useRef(0);
  // A worker reply can land after unmount — never touch state then. MUST be re-armed in setup: React
  // StrictMode double-invokes (setup→cleanup→setup), and a guard cleared only on cleanup would stay
  // false forever, silently dropping every reply (the popup would hang on "checking…" in dev).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const trimmed = (query || '').trim().toUpperCase();
  // Alphabet BEFORE length, independently — `U` is RNA, not «too short» (§2.5).
  const badAlphabet = trimmed.length > 0 && canonicalDnaQuery(trimmed, 1) === null;
  const tooShort = !badAlphabet && trimmed.length > 0 && trimmed.length < MIN_QUERY;
  const validQuery = !badAlphabet && !tooShort && trimmed.length > 0;
  const docId = `entry:${entryId ?? '__popover__'}`;

  // The request THIS render describes. `seq` is held by REFERENCE, never stringified/hashed — a
  // megabase molecule must not be re-serialised on every keystroke.
  const currentFacts = {
    query: trimmed, threshold, seq: targetSequence, topology: targetTopology, entryId, revision, tick: retryTick,
  };
  const factsMatch = (a, b) => !!a && !!b
    && a.query === b.query && a.threshold === b.threshold && a.seq === b.seq
    && a.topology === b.topology && a.entryId === b.entryId && a.revision === b.revision && a.tick === b.tick;
  // Phase is DERIVED: until the settlement for THESE EXACT facts lands, we are pending. Any change —
  // query, threshold, molecule, topology, entryId, revision, retry — invalidates the old rows at once.
  const settledForQuery = validQuery && factsMatch(run.facts, currentFacts);
  // A valid query with NO molecule to search (a transient item=null, a document switch, an empty
  // sequence) fails CLOSED to `incomplete`: the effect cancels and creates no worker, so nothing can
  // ever answer — deriving `pending` here would hang the popup on «checking» forever.
  const noTarget = validQuery && !targetSequence;
  const phase = !validQuery ? 'idle'
    : (noTarget ? 'incomplete' : (settledForQuery ? run.kind : 'pending'));
  const occurrences = phase === 'results' ? run.occurrences : [];
  // How many loci EXIST — measured by the engine before its payload cap. The listed rows are the
  // retained window and can be fewer (P1-2).
  const locationCount = phase === 'results'
    ? (Number.isFinite(run.locationCount) ? run.locationCount : occurrences.length) : 0;

  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(id); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  // Publishes the CANONICAL occurrences to `searchHits` (an external store, so writing it from an
  // effect is fine). The Overlay now reads occurrences directly — `location.segments` (both wrap
  // segments), `location.strand` and `metrics.identityBps` — so no flat projection is built here.
  const publishOverlay = useCallback((occ, q) => {
    if (!entryId) { setSearchHits?.(null, '', []); return; }
    setSearchHits?.(entryId, q, occ || []);
  }, [entryId, setSearchHits]);

  // Search on the shared worker, debounced. The effect writes only the EXTERNAL overlay store
  // synchronously (clearing it for the new request); React state (`run`) is written solely from the
  // async settlement, tagged with the request facts, so a superseded answer can never surface.
  useEffect(() => {
    if (!open) return undefined;
    // Retire the previous generation IMMEDIATELY — any in-flight settlement is now stale and its
    // guard (`runRef.current !== runId`) will drop it. Do this even on invalidation.
    const runId = (runRef.current += 1);
    if (!validQuery || !targetSequence) {
      // An empty / short / invalid query is not «no result» — STOP the running pass so it does not
      // keep grinding a megabase and cannot re-publish the old highlight. Owner-scoped: another
      // surface's pass is untouched.
      channel.cancel();
      publishOverlay([], '');
      return () => { channel.cancel(); };
    }
    publishOverlay([], trimmed); // the new request owns the overlay now — clear the previous hits
    // The exact facts this dispatch answers — built from the same primitives the deps track, so the
    // settlement can be matched to «is this still the current request?» at render time.
    const facts = { query: trimmed, threshold, seq: targetSequence, topology: targetTopology, entryId, revision, tick: retryTick };
    const documents = [{
      ref: { kind: 'entry', id: entryId ?? '__popover__', revision },
      sequence: { seq: targetSequence, topology: targetTopology },
    }];
    const ctx = { identityThreshold: threshold / 100, bothStrands: true };
    const handle = setTimeout(() => {
      channel.search(trimmed, documents, ctx).then((map) => {
        if (!mountedRef.current || runRef.current !== runId) return; // unmounted / superseded locally
        // The map value is a LOCUS ENVELOPE, not a bare array (P1-2/P1-3): the retained window plus
        // the true locus count and the canonical winner. Reading `.length` off the envelope gives
        // `undefined`, so every real hit rendered as «nothing found» — an honest-empty that is a lie.
        const env = map.get(docId);
        const occ = (env && env.occurrences) || [];
        // `locationCount` is kept SEPARATELY from the window, because they are different numbers
        // (P1-2): on a repeat-rich molecule the engine retains 500 loci out of 501, and rendering
        // `occurrences.length` would tell the biologist there are 500 sites. The window is what can
        // be listed and clicked; the count is what exists.
        setRun({
          facts,
          kind: occ.length ? 'results' : 'empty',
          occurrences: occ,
          locationCount: env && Number.isFinite(env.locationCount) ? env.locationCount : occ.length,
          routedMax: 0,
        });
        publishOverlay(occ, trimmed);
      }).catch((err) => {
        if (!mountedRef.current || runRef.current !== runId) return;
        const reason = err && (err.reason || err.code);
        if (reason === SEARCH_ABORT.TERMINATED) return; // the client closed (unmount) — nothing to show
        publishOverlay([], trimmed);
        if (reason === SEARCH_ABORT.CANCELLED) {
          // Another OWNER stole the single worker (our own supersede is dropped by the runId guard
          // above, so reaching here means an external cancel). Surface it distinctly — Find retries.
          setRun({ facts, kind: 'cancelled', occurrences: [], routedMax: 0 });
        } else if (reason === SEARCH_ABORT.REQUIRES_ALIGNMENT) {
          setRun({ facts, kind: 'routed', occurrences: [], routedMax: Number.isInteger(err.maxApproxLength) ? err.maxApproxLength : 100 });
        } else {
          // RESOURCE_LIMIT / WORKER_FAILURE / TIMEOUT / INVALID_DNA / anything else: the sequence
          // dimension did NOT run. Never a row, never an honest zero.
          setRun({ facts, kind: 'incomplete', occurrences: [], routedMax: 0 });
        }
      });
    }, DEBOUNCE_MS);
    // Cleanup on re-run OR unmount: drop the pending debounce AND cancel OUR pass, so a query change
    // or an unmount never leaves a worker grinding.
    return () => { clearTimeout(handle); channel.cancel(); };
  }, [open, validQuery, trimmed, targetSequence, targetTopology, threshold, entryId, revision, retryTick, channel, publishOverlay, docId]);

  // Closing cancels OUR work only (the coordinator no-ops if another owner holds the pass) and clears
  // the overlay — both external systems, no React state. A busy sync sweep can't be asked politely,
  // so cancel() terminates its worker.
  useEffect(() => {
    if (open) return undefined;
    channel.cancel();
    clearSearchHits?.();
    return undefined;
  }, [open, channel, clearSearchHits]);

  const onSubmit = (e) => {
    e?.preventDefault?.();
    if (badAlphabet) { showToast?.(t('search.popover.invalidDnaToast'), 'info'); return; }
    if (tooShort) { showToast?.(tf('search.popover.minLengthToast', { min: MIN_QUERY }), 'info'); return; }
    if (validQuery) {
      pushRecentSearch(trimmed);
      setRecents(getRecentSearches());
      // Find re-runs the SAME query on a fresh pass — the way to recover from a CANCELLED steal.
      setRetryTick((n) => n + 1);
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
    <div
      ref={overlayRef}
      data-testid="sequence-search-overlay"
      style={{ position: 'fixed', top: 64, right: 16, zIndex: 95, pointerEvents: 'none' }}
    >
      <div
        data-testid="sequence-search-popover"
        role="dialog"
        aria-label={t('search.popover.dialogLabel')}
        style={{
          width: 560, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 96px)',
          background: 'var(--surface-1)', border: '1px solid var(--border-default)', borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,0.32)', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', pointerEvents: 'auto',
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
                placeholder={t('search.popover.placeholder')}
                style={{
                  width: '100%', height: 32, padding: '0 32px 0 10px', fontSize: 13,
                  background: 'var(--surface-2)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)', borderRadius: 4, outline: 'none',
                  fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase',
                }}
              />
              <button
                type="button"
                data-testid="sequence-search-recent-toggle"
                onClick={() => setShowRecent((v) => !v)}
                title={t('search.popover.recentTitle')}
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
                    position: 'absolute', top: 36, left: 0, right: 0, background: 'var(--surface-1)',
                    border: '1px solid var(--border-default)', borderRadius: 4,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.18)', maxHeight: 220, overflowY: 'auto', zIndex: 1,
                  }}
                >
                  {recents.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => pickRecent(q)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11,
                        fontFamily: 'var(--font-mono, monospace)', background: 'transparent',
                        border: 'none', color: 'var(--text-primary)', cursor: 'pointer',
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
                padding: '6px 12px', fontSize: 12, fontWeight: 500, background: 'var(--accent-500)',
                color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
              }}
            >Найти</button>
            <button
              type="button"
              data-testid="sequence-search-close"
              title={t('search.popover.closeTitle')}
              onClick={() => onClose?.()}
              style={{
                fontSize: 14, padding: '0 8px', background: 'transparent', color: 'var(--text-tertiary)',
                border: '1px solid transparent', borderRadius: 4, cursor: 'pointer', lineHeight: 1,
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
              style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              data-testid="sequence-search-target-name"
            >Поиск в: {targetName}</div>
          )}
        </form>
        <div data-testid="sequence-search-results" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {trimmed.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
              {tf('search.popover.empty', { min: MIN_QUERY })}
            </div>
          )}
          {badAlphabet && (
            <div data-testid="sequence-search-invalid-dna" style={{ padding: 12, fontSize: 12, color: 'var(--warning-fg)' }}>
              {t('search.popover.invalidDna')}
            </div>
          )}
          {tooShort && (
            <div data-testid="sequence-search-too-short" style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
              {tf('search.popover.minLength', { min: MIN_QUERY })}
            </div>
          )}
          {phase === 'pending' && (
            <div data-testid="sequence-search-checking" role="status" aria-live="polite" style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
              {t('search.popover.checking')}
              {/* Decorative, inside the line that already announces this state — so the stripe adds
                  no second live region, and it is unmounted by the same `phase` change that replaces
                  the wording. The shared component is the SAME file the global dropdown mounts. */}
              <div style={{ marginTop: 8 }}><SearchProgressTrack /></div>
            </div>
          )}
          {phase === 'cancelled' && (
            <div data-testid="sequence-search-cancelled" role="status" aria-live="polite" style={{ padding: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('search.popover.cancelled')}
            </div>
          )}
          {phase === 'routed' && (
            <div data-testid="sequence-search-requires-alignment" role="status" aria-live="polite" style={{ padding: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              {tf('search.requiresAlignment', { max: run.routedMax || 100 })}
            </div>
          )}
          {phase === 'incomplete' && (
            <div data-testid="sequence-search-incomplete" role="status" aria-live="assertive" style={{ padding: 12, fontSize: 12, color: 'var(--warning-fg)' }}>
              {t('search.popover.incomplete')}
            </div>
          )}
          {phase === 'empty' && (
            <div data-testid="sequence-search-empty" role="status" aria-live="polite" style={{ padding: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
              {tf('search.popover.noHits', { threshold })}
            </div>
          )}
          {phase === 'results' && (
            <>
              <div
                data-testid="sequence-search-hit-count"
                style={{
                  padding: '8px 10px', fontSize: 11, color: 'var(--text-tertiary)',
                  borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)',
                }}
              >{formatLocationCount(locationCount)}</div>
              {occurrences.map((o) => (
                <HitRow key={occurrenceKey(o)} occ={o} onJumpTo={onJumpTo} />
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

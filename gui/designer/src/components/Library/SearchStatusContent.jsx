/**
 * SearchStatusContent — the ONE place that turns a `statusKind` into the single message the search
 * dropdown is allowed to show.
 *
 * Extracted verbatim from `LibrarySmartSearchBar` (no behaviour change). Two reasons it is its own
 * module rather than a table inside the bar:
 *
 *   • the bar had grown to 186 bytes below the hard size ceiling — the next honest edit would have
 *     broken it, and shaving bytes off comments is not engineering;
 *   • the seam is real, not cosmetic: `deriveSearchSessionPresentation` DECIDES which claim the
 *     search may make, and this file only WORDS it. Keeping the decision and its wording in
 *     separate files is what stops a future edit from quietly re-deciding precedence inside JSX —
 *     which is exactly the two-owners bug the projection was introduced to kill.
 *
 * An unknown kind renders NOTHING. That is deliberate: `none` (hidden / invalid / metadata-preview
 * / complete-results) means «this state announces nothing», and inventing a message for it would
 * put words in the engine's mouth.
 *
 * Presentational only: no store, no facade, no decisions. Every callback is supplied by the bar.
 */
import { t, tf } from '../../i18n';
import { Icon } from '../icons/Icon';
import SearchProgressTrack from '../Search/SearchProgressTrack';

/** An action inside a status line: a link, not a control that competes with the result rows. */
const LINK_BUTTON = {
  padding: 0, border: 'none', background: 'none', color: 'var(--accent-text)',
  cursor: 'pointer', font: 'inherit', textDecoration: 'underline',
};

const BLOCK_LINK = { ...LINK_BUTTON, display: 'block', marginTop: 6 };

export function SearchNotice({ testId, children }) {
  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 6,
        padding: '6px 10px', fontSize: 11, lineHeight: 1.35,
        color: 'var(--warning-fg)', background: 'var(--warning-bg)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <Icon name="warning" size={12} />
      <span>{children}</span>
    </div>
  );
}

const PLAIN_LINE = { padding: '6px 10px', fontSize: 11, color: 'var(--text-tertiary)' };

/**
 * @param {Object} p
 * @param {string} p.statusKind — from `deriveSearchSessionPresentation`; unknown → null
 * @param {string} [p.blockingText] — parser diagnostic; blank falls back to the generic wording
 * @param {string} [p.incompleteText] — already names the failed provider(s)
 * @param {number} [p.maxApproxLength] — comes from the ROUTE payload, which is the only authority
 *   on the limit that actually applied. This module deliberately does not import the engine to
 *   learn it: a presentational file that reaches into `seq-match` would start disagreeing with the
 *   route the moment either side moved.
 * @param {string} [p.query] — passed to `onOpenAlignment`, which owns what to do with it
 * @param {Function} [p.onOpenAlignment] — when it is absent the notice renders WITHOUT the action
 *   button: the text still says what was not done, but nothing offers to do it
 * @param {Function} [p.onCancel] — stop the running pass
 * @param {Function} [p.onResume] — run the same query again after a stop
 */
export default function SearchStatusContent({
  statusKind, blockingText, incompleteText, maxApproxLength,
  query, onOpenAlignment, onCancel, onResume,
}) {
  switch (statusKind) {
    // The wait is neither hidden nor mandatory: the line that admits the search is running also
    // offers the way out of it.
    case 'loading':
      return (
        <div style={{ ...PLAIN_LINE, paddingBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{t('search.results.loadingBio')}</span>
            <button type="button" data-testid="search-cancel-action" onClick={onCancel} style={LINK_BUTTON}>
              {t('search.results.cancel')}
            </button>
          </div>
          {/* Decorative — the wording above is the announcement; this only makes the wait visible.
              Mounted ONLY here, so it disappears the instant the projection moves to any terminal
              kind: a stripe that outlives its search says work is happening when it is not. */}
          <div style={{ marginTop: 6 }}><SearchProgressTrack /></div>
        </div>
      );
    case 'cancelled':
      return (
        <SearchNotice testId="search-cancelled-notice">
          {t('search.results.cancelled')}
          <button type="button" data-testid="search-cancelled-resume" onClick={onResume} style={BLOCK_LINK}>
            {t('search.results.resume')}
          </button>
        </SearchNotice>
      );
    case 'blocked':
      return (
        <SearchNotice testId="search-blocked-notice">
          {blockingText || t('search.results.blocked')}
        </SearchNotice>
      );
    case 'incomplete':
      return (
        <SearchNotice testId="search-provider-incomplete-warning">{incompleteText}</SearchNotice>
      );
    // NOT a miss: the message says what was not done and offers the way to do it. When the caller
    // passes no `onOpenAlignment` the button is simply not rendered, and the notice is text only —
    // the user is told to open alignment but not taken there.
    case 'requires-alignment':
      return (
        <SearchNotice testId="search-requires-alignment-notice">
          {tf('search.requiresAlignment', { max: maxApproxLength })}
          {onOpenAlignment ? (
            <button
              type="button"
              data-testid="search-requires-alignment-action"
              onClick={() => onOpenAlignment(query)}
              style={BLOCK_LINK}
            >
              {t('search.requiresAlignment.action')}
            </button>
          ) : null}
        </SearchNotice>
      );
    case 'empty':
      return <div style={{ padding: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>{t('search.results.empty')}</div>;
    default:
      return null;
  }
}

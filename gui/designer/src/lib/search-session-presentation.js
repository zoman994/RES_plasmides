/**
 * search-session-presentation — the ONE projection from a search session to what the UI is
 * allowed to claim (REV #2 S3-CLOSE K3.1).
 *
 * Until K3 «what is this search showing?» was assembled from four independent booleans in the
 * bar (`complete` / `finalEmpty` / `unconfirmed` / `countKind`), while `SearchResultsListbox`
 * separately re-decided the empty state through `!loading && !diagnostic`. Two owners, two
 * precedences — so the bar could believe «not verified» while the listbox rendered «nothing
 * found». It is also why K2's «allow empty while incomplete» mutation stayed GREEN: the bar's
 * guard was real but structurally unobservable behind the listbox's own gate.
 *
 * Precedence is now a single ordered decision, and every component reads its output.
 *
 * The order is a CLAIM LADDER — the further down, the stronger the evidence required:
 *
 *   hidden → blocked → requires-alignment → cancelled → incomplete → checking → metadata-preview
 *   → complete-results / complete-empty
 *
 * Every token is kebab-case machine text, and a test asserts that over EVERY returned string —
 * which is how `requiresAlignment` was caught: it had been camelCase since the day it was added,
 * invisible because the state was missing from that test's hand-built list of states.
 *
 * Two rungs carry the biology:
 *   • `incomplete` outranks `checking`: a check that FAILED is «not confirmed», not «still
 *     running» — telling a biologist to keep waiting for an answer that will never come is a lie.
 *   • a FINAL that still carries pending rows falls back to `checking` (fail-closed). It can
 *     never be promoted to confirmed just because the phase says «final».
 *
 * Returns machine tokens only — never localized text. Wording stays in the bar.
 * Pure: no React, no store, no i18n. Nothing imports back.
 */

const STATUS_NONE = 'none';

/** Every state, with the fixed consequences that state implies. `countKind`/`showRows` still
 * depend on rowCount, so they are decided per call below. */
const HIDDEN = { state: 'hidden', statusKind: STATUS_NONE, countKind: 'none', showRows: false, rowsDisabled: true, ariaBusy: false };
const BLOCKED = { state: 'blocked', statusKind: 'blocked', countKind: 'none', showRows: false, rowsDisabled: true, ariaBusy: false };
const INVALID = { state: 'invalid', statusKind: STATUS_NONE, countKind: 'none', showRows: false, rowsDisabled: true, ariaBusy: false };

/**
 * @param {{
 *   ownsQuery?: boolean,          // is this session's result the one for the query on screen?
 *   phase?: 'partial'|'final',
 *   rowCount?: number,
 *   providerExpected?: boolean,   // seq/aa/cut/re requested — NOT metadata or the enz: catalog
 *   providerPending?: boolean,    // at least one row still awaits its biological confirmation
 *   incomplete?: boolean,         // a requested check did not run
 *   cancelled?: boolean,          // the user stopped it — the JOB is over, no answer is coming
 *   blocked?: boolean,            // the query never ran at all
 *   interactionDisabled?: boolean // IME composition / external UI gate — selection only
 * }} input
 * @returns {{ state:string, statusKind:string, countKind:string, showRows:boolean,
 *   rowsDisabled:boolean, ariaBusy:boolean }}
 */
export function deriveSearchSessionPresentation(input) {
  if (!input || typeof input !== 'object') return { ...INVALID };
  const {
    ownsQuery, phase, rowCount, providerExpected,
    providerPending, incomplete, blocked, interactionDisabled, requiresAlignment, cancelled,
  } = input;

  // 1 — not our query (or none): publish nothing. A stale warning or count must never outlive
  // the text it was about.
  if (!ownsQuery) return { ...HIDDEN };

  // 2 — blocked: the search never ran, so there is nothing to count and nothing to show. Checked
  // BEFORE the shape guard below: a query rejected by the parser never reached a session, so it
  // legitimately has no phase — that is «blocked», not «contradictory».
  if (blocked) return { ...BLOCKED };

  // 8 — a contradictory input is not a state to guess at.
  if (phase !== 'partial' && phase !== 'final') return { ...INVALID };
  if (!Number.isInteger(rowCount) || rowCount < 0) return { ...INVALID };

  const hasRows = rowCount > 0;

  // 2.5 — the length route (§4.2.0): a >100 nt query with no exact hit was never compared
  // approximately. Ranked ABOVE `incomplete` because nothing failed, and far above `empty`
  // because «nothing found» here would assert an absence the engine never tested.
  //
  // Rows here are UNSELECTABLE CANDIDATES. A compound query («pUC19 seq:<400 nt>») can produce
  // name matches while the sequence leg never ran, so counting them as «results» would tell a
  // biologist the library holds exactly 3 molecules related to their insert — when the insert was
  // never compared at all. Over-claiming completeness can end an investigation early; under-
  // claiming only invites a second look.
  //
  // And they are not openable either (reviewer decision, 21.07.2026, pending a dedicated design
  // pass): opening one would put an UNCOMPARED molecule in front of the user as though the search
  // had confirmed it. The only live action under this state is the move to alignment.
  if (requiresAlignment) {
    return {
      state: 'requires-alignment',
      statusKind: 'requires-alignment',
      countKind: hasRows ? 'candidates' : 'none',
      showRows: hasRows,
      rowsDisabled: true,
      ariaBusy: false,
    };
  }

  // 2.7 — the user pressed stop. Ranked ABOVE `incomplete` because the two answer different
  // questions: `incomplete` blames the engine, and saying «the check could not be performed» to
  // someone who just cancelled it is a lie about our own software. Ranked BELOW the route because
  // §4.2.0 is a definite fact about the QUERY — a stop cannot make a 400-mer approximable.
  //
  // Never busy — and the reason is about the JOB, not about the thread. An ordinary cancel is
  // cooperative: the running job is told to stop, unwinds through its own `finally` blocks and
  // acknowledges (or its terminal reply beat the cancel). Either way THIS job is over and no answer
  // is coming for it, so a spinner would wait forever. The worker itself stays alive and takes the
  // next query immediately; `ariaBusy: false` states «nothing is running for this session», never
  // «the worker was destroyed».
  if (cancelled) {
    return {
      state: 'cancelled',
      statusKind: 'cancelled',
      countKind: hasRows ? 'candidates' : 'none',
      showRows: hasRows,
      rowsDisabled: true,
      ariaBusy: false,
    };
  }

  // 3 — incomplete: a requested check FAILED. Surviving rows are metadata candidates only —
  // always disabled, counted as candidates, never as results. With no rows there is no number
  // at all: «· 0» beside «check did not run» reads as «zero matches».
  if (incomplete) {
    return {
      state: 'incomplete',
      statusKind: 'incomplete',
      countKind: hasRows ? 'candidates' : 'none',
      showRows: hasRows,
      rowsDisabled: true,
      ariaBusy: false,
    };
  }

  // 4 — checking: a biological check is still outstanding. Also the FAIL-CLOSED landing for a
  // `final` that still carries pending rows — the phase alone never confirms anything.
  if (providerPending || (phase === 'partial' && providerExpected)) {
    return {
      state: 'checking',
      statusKind: 'loading',
      countKind: hasRows ? 'candidates' : 'none',
      showRows: hasRows,
      rowsDisabled: true,
      ariaBusy: true,
    };
  }

  // 5 — a metadata-only partial has nothing to confirm: its rows are already as good as final,
  // so they stay selectable and must NOT be labelled «checking».
  if (phase === 'partial') {
    return {
      state: 'metadata-preview',
      statusKind: STATUS_NONE,
      countKind: 'none', // no number until the (instant) final lands
      showRows: hasRows,
      rowsDisabled: !!interactionDisabled,
      ariaBusy: false,
    };
  }

  // 6 / 7 — a completed check: the ONLY evidence that licenses a RESULT count, and the only
  // state allowed to say «nothing found» — with an honest zero.
  return hasRows
    ? {
      state: 'complete-results',
      statusKind: STATUS_NONE,
      countKind: 'results',
      showRows: true,
      rowsDisabled: !!interactionDisabled,
      ariaBusy: false,
    }
    : {
      state: 'complete-empty',
      statusKind: 'empty',
      countKind: 'results', // honest 0
      showRows: false,
      rowsDisabled: true,
      ariaBusy: false,
    };
}

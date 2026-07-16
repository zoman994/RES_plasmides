/**
 * REV #2 — S3-CLOSE / K3.1: ONE pure projection from a search session to what the UI may claim.
 *
 * Until K3 the answer to «what is this search showing?» was assembled from four independent
 * booleans in the bar (`complete` / `finalEmpty` / `unconfirmed` / `countKind`) while the listbox
 * separately re-decided the empty state via `!loading && !diagnostic`. Two owners, two
 * precedences — so the bar could believe «not verified» while the listbox rendered «nothing
 * found». That is why K2's «allow empty while incomplete» mutation stayed GREEN: the guard was
 * real but structurally unobservable.
 *
 * Here precedence is a single ordered decision, and every component reads its output.
 *
 * The order is not arbitrary — it is a claim ladder, strongest evidence last:
 *   hidden → blocked → incomplete → checking → metadata-preview → complete-results/empty.
 * `incomplete` outranks `checking` because a check that FAILED is «not confirmed», not «still
 * running». And a final that still carries pending rows is fail-closed back to `checking`: it can
 * never be promoted to confirmed.
 */
import { describe, it, expect } from 'vitest';
import { deriveSearchSessionPresentation } from '../search-session-presentation';

const base = {
  ownsQuery: true,
  phase: 'final',
  rowCount: 0,
  providerExpected: false,
  providerPending: false,
  incomplete: false,
  blocked: false,
  interactionDisabled: false,
};
const derive = (over) => deriveSearchSessionPresentation({ ...base, ...over });

describe('deriveSearchSessionPresentation — the precedence ladder', () => {
  it('1. a query that is not ours is hidden entirely', () => {
    expect(derive({ ownsQuery: false, rowCount: 5, incomplete: true, blocked: true })).toMatchObject({
      state: 'hidden', statusKind: 'none', countKind: 'none', showRows: false, ariaBusy: false,
    });
  });

  it('2. blocked outranks everything below it — the search never ran, so there is nothing to count', () => {
    expect(derive({ blocked: true, rowCount: 3, incomplete: true, providerPending: true })).toMatchObject({
      state: 'blocked', statusKind: 'blocked', countKind: 'none', showRows: false, ariaBusy: false,
    });
  });

  it('2b. a blocked query has no phase at all — the parser rejected it before any session existed', () => {
    // Not «contradictory»: it is exactly what a blocked query looks like from the bar.
    expect(derive({ blocked: true, phase: 'idle', rowCount: 0 })).toMatchObject({ state: 'blocked', statusKind: 'blocked' });
    expect(derive({ blocked: true, phase: undefined })).toMatchObject({ state: 'blocked' });
  });

  it('3. incomplete outranks checking — a FAILED check is «not confirmed», not «still running»', () => {
    expect(derive({ incomplete: true, providerPending: true, rowCount: 2, providerExpected: true })).toMatchObject({
      state: 'incomplete', statusKind: 'incomplete', countKind: 'candidates', showRows: true, rowsDisabled: true, ariaBusy: false,
    });
  });

  it('3b. incomplete with NO rows publishes no number at all («· 0» would read as «zero matches»)', () => {
    expect(derive({ incomplete: true, rowCount: 0, providerExpected: true })).toMatchObject({
      state: 'incomplete', statusKind: 'incomplete', countKind: 'none', showRows: false,
    });
  });

  it('4. a pending provider is «checking»: rows visible but never selectable', () => {
    expect(derive({ phase: 'partial', providerExpected: true, providerPending: true, rowCount: 1 })).toMatchObject({
      state: 'checking', statusKind: 'loading', countKind: 'candidates', showRows: true, rowsDisabled: true, ariaBusy: true,
    });
  });

  it('4b. a partial that expects a provider is «checking» even before any row is pending', () => {
    expect(derive({ phase: 'partial', providerExpected: true, rowCount: 0 })).toMatchObject({
      state: 'checking', statusKind: 'loading', countKind: 'none', showRows: false, ariaBusy: true,
    });
  });

  it('4c. FAIL-CLOSED: a FINAL that still carries pending rows can never be promoted to confirmed', () => {
    expect(derive({ phase: 'final', providerExpected: true, providerPending: true, rowCount: 1 })).toMatchObject({
      state: 'checking', countKind: 'candidates', rowsDisabled: true,
    });
  });

  it('5. a metadata-only partial has nothing to confirm: selectable, and never falsely «checking»', () => {
    expect(derive({ phase: 'partial', providerExpected: false, rowCount: 2 })).toMatchObject({
      state: 'metadata-preview', statusKind: 'none', countKind: 'none', showRows: true, rowsDisabled: false, ariaBusy: false,
    });
  });

  it('6. a complete final with rows is the only state that publishes RESULTS', () => {
    expect(derive({ phase: 'final', rowCount: 3 })).toMatchObject({
      state: 'complete-results', statusKind: 'none', countKind: 'results', showRows: true, rowsDisabled: false, ariaBusy: false,
    });
  });

  it('7. a complete final with no rows is the ONLY state allowed to say «nothing found» — with an honest 0', () => {
    expect(derive({ phase: 'final', rowCount: 0 })).toMatchObject({
      state: 'complete-empty', statusKind: 'empty', countKind: 'results', showRows: false, ariaBusy: false,
    });
  });

  it.each([
    ['an unknown phase', { phase: 'weird' }],
    ['a missing phase', { phase: undefined }],
    ['a non-numeric rowCount', { rowCount: 'many' }],
    ['a negative rowCount', { rowCount: -1 }],
  ])('8. %s is invalid — it publishes nothing rather than guessing', (_l, over) => {
    expect(derive(over)).toMatchObject({
      state: 'invalid', statusKind: 'none', countKind: 'none', showRows: false, rowsDisabled: true, ariaBusy: false,
    });
  });

  it('a non-object input is invalid, and never throws', () => {
    for (const v of [null, undefined, 'x', 7]) {
      expect(deriveSearchSessionPresentation(v)).toMatchObject({ state: 'invalid', showRows: false });
    }
  });
});

describe('deriveSearchSessionPresentation — mutually exclusive by construction', () => {
  const ALL = [
    derive({ ownsQuery: false }),
    derive({ blocked: true }),
    derive({ incomplete: true, rowCount: 1 }),
    derive({ phase: 'partial', providerExpected: true, rowCount: 1 }),
    derive({ phase: 'partial', rowCount: 1 }),
    derive({ phase: 'final', rowCount: 1 }),
    derive({ phase: 'final', rowCount: 0 }),
    derive({ phase: 'nonsense' }),
  ];

  it('statusKind is always exactly one of the five kinds — never two at once', () => {
    const kinds = ['none', 'loading', 'blocked', 'incomplete', 'empty'];
    for (const p of ALL) expect(kinds).toContain(p.statusKind);
  });

  it('ariaBusy is true ONLY while checking', () => {
    for (const p of ALL) expect(p.ariaBusy).toBe(p.state === 'checking');
  });

  it('rows are published only when there ARE rows and the state can show them', () => {
    const publishable = new Set(['checking', 'incomplete', 'metadata-preview', 'complete-results']);
    for (const p of ALL) if (p.showRows) expect(publishable.has(p.state)).toBe(true);
    // hidden / blocked / complete-empty / invalid never publish rows, whatever the row count
    for (const state of ['hidden', 'blocked', 'complete-empty', 'invalid']) {
      const p = ALL.find((x) => x.state === state);
      expect(p.showRows).toBe(false);
    }
  });

  it('a RESULT count is only ever published by a completed check', () => {
    for (const p of ALL) {
      if (p.countKind === 'results') expect(['complete-results', 'complete-empty']).toContain(p.state);
    }
  });

  it('«nothing found» is only ever published by a completed check', () => {
    for (const p of ALL) if (p.statusKind === 'empty') expect(p.state).toBe('complete-empty');
  });

  it('returns no localized strings — wording stays in the bar', () => {
    for (const p of ALL) {
      for (const v of Object.values(p)) {
        if (typeof v === 'string') expect(v).toMatch(/^[a-z-]+$/); // machine tokens only
      }
    }
  });
});

describe('deriveSearchSessionPresentation — interactionDisabled', () => {
  it('an IME composition disables selection without rewriting the biological status', () => {
    const p = derive({ phase: 'final', rowCount: 2, interactionDisabled: true });
    expect(p.state).toBe('complete-results'); // still a confirmed result…
    expect(p.countKind).toBe('results');
    expect(p.rowsDisabled).toBe(true); // …just not selectable right now
  });

  it('it can never RE-ENABLE rows that biology disabled', () => {
    const p = derive({ incomplete: true, rowCount: 1, interactionDisabled: false });
    expect(p.rowsDisabled).toBe(true);
  });
});

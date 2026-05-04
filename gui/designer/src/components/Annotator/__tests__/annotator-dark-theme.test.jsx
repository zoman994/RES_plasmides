/**
 * annotator-dark-theme.test.jsx — bug-rush #26 coverage.
 *
 * Biolog: «в темной теме аннотатор имеет кривой интерфейс».
 *
 * Root cause: the modal panel's background was `var(--surface-0,
 * #fafaf9)` — but `--surface-0` is NOT defined in any theme block in
 * index.css (only --surface-1 / --surface-2 exist). In dark theme
 * the variable resolved to its inline fallback `#fafaf9` (near-
 * white), so the modal rendered bright white while
 * `--text-primary` resolved to the dark-theme light grey — the
 * results pane was unreadable.
 *
 * happy-dom strips `var(...)` wrappers when serialising inline
 * styles back to attributes (no path — getAttribute, style.cssText,
 * style.background, outerHTML — preserves them). So a runtime
 * assertion is impossible. Read the source file directly: if anyone
 * reintroduces --surface-0 OR drops the --surface-1 guard from this
 * file, the test fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ANNOTATOR_INDEX = path.resolve(HERE, '..', 'index.jsx');
const RESULT_ROW = path.resolve(HERE, '..', 'ResultRow.jsx');

describe('Annotator — dark theme readability (bug-rush #26)', () => {
  it('Annotator/index.jsx panel uses --surface-1 (defined) and never --surface-0 (undefined)', () => {
    const src = readFileSync(ANNOTATOR_INDEX, 'utf8');
    // Only flag the LIVE token reference `var(--surface-0…)` — the
    // historical-context comment that explains why we banned it is
    // allowed to keep the literal name. Strip block comments before
    // the check so a future engineer who explains the regression
    // doesn't accidentally trip the guard.
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/var\(--surface-0/);
    // The panel's background CSS variable must be the defined
    // --surface-1 token.
    expect(codeOnly).toMatch(/var\(--surface-1[^)]*\)/);
  });

  it('Annotator/ResultRow.jsx inline-edit input has explicit theme-aware background + colour', () => {
    const src = readFileSync(RESULT_ROW, 'utf8');
    // The input USED to ride on the browser default (white bg /
    // black text) — unreadable in dark theme. Lock in the explicit
    // tokens so a regression flips the test red.
    expect(src).toMatch(/var\(--surface-1[^)]*\)/);
    expect(src).toMatch(/var\(--text-primary[^)]*\)/);
  });
});

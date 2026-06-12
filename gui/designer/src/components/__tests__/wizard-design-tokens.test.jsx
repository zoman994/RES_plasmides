/**
 * wizard-design-tokens.test.jsx — design-system migration guard.
 *
 * PlasmidUseWizard.jsx and MutagenesisWizard.jsx are two large legacy
 * wizards that used raw Tailwind grey/white/black-backdrop utility
 * classes (text-gray-*, bg-gray-*, border-gray-*, bg-white, bg-black/NN)
 * instead of the BodgeGene design-system CSS variables. That violates
 * the design-system convention (no raw tailwind greys — they must go
 * through --text-* / --surface-* / --border-* vars; see index.css and
 * the .importer-annotation-editor-wrap overrides) and breaks theme
 * adaptivity: raw greys are hard-coded for light theme only.
 *
 * happy-dom strips var(...) wrappers when serialising inline styles, and
 * Tailwind utility classes are not resolved to colours in jsdom-like
 * environments, so a runtime DOM assertion can't see these. Mirror the
 * Annotator dark-theme guard (annotator-dark-theme.test.jsx): read the
 * source directly so any reintroduced raw grey/white/black-backdrop
 * class flips this test red.
 *
 * Scope note: `text-white` on coloured action buttons (bg-blue/red/
 * purple/green) is intentionally NOT migrated here — the coloured
 * backgrounds themselves are out of scope for this grey migration, so
 * flipping only the text colour would be a half-migration. Likewise the
 * inline `'#999'` annotation-colour fallback is data-driven, not chrome.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILES = {
  'PlasmidUseWizard.jsx': path.resolve(HERE, '..', 'PlasmidUseWizard.jsx'),
  'MutagenesisWizard.jsx': path.resolve(HERE, '..', 'MutagenesisWizard.jsx'),
};

// Raw Tailwind tokens banned from these wizards' chrome. The substring
// patterns also catch prefixed variants (hover:bg-gray-50,
// disabled:bg-gray-300, hover:text-gray-600, …).
const BANNED = [
  { name: 'text-gray-*', re: /text-gray-\d/ },
  { name: 'bg-gray-*', re: /bg-gray-\d/ },
  { name: 'border-gray-*', re: /border-gray-\d/ },
  { name: 'bg-white', re: /\bbg-white\b/ },
  { name: 'bg-black/NN backdrop', re: /bg-black\/\d/ },
];

describe('Wizard design-system tokens — no raw Tailwind greys', () => {
  for (const [label, file] of Object.entries(FILES)) {
    describe(label, () => {
      // Strip comments so a future explanatory comment that names a
      // banned token doesn't trip the guard (matches the Annotator
      // dark-theme guard convention).
      const codeOnly = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      for (const { name, re } of BANNED) {
        it(`uses no raw ${name}`, () => {
          expect(codeOnly).not.toMatch(re);
        });
      }

      it('routes greys through --text-* / --surface-* / --border-* vars', () => {
        // Sanity: the migrated files should reference at least one
        // design-system var, proving the migration happened (and a
        // wholesale revert to raw classes would drop these).
        expect(codeOnly).toMatch(/var\(--(text|surface|border)-/);
      });
    });
  }
});

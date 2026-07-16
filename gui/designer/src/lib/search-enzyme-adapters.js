/**
 * search-enzyme-adapters — the restriction catalog as searchable SearchDocuments
 * (P5). Kept SEPARATE from search-document-adapters so a widely-imported module
 * (entryToDocument is used by library-search, the tree filter, the assembly picker
 * via makeEntryMatcher, the align panel…) does NOT statically pull the ~459-enzyme
 * restriction DB into every chunk. Only the library topbar (enzyme-entity search)
 * imports this.
 */
import { effectiveEnzymes } from '../restriction-db.js';

/**
 * Enzyme-as-entity documents (P5) — the restriction catalog (classical + custom
 * overlay) as searchable entities, so a bare «EcoRI» surfaces the enzyme itself.
 * They carry NO sequence (metadata-only: name + site/overhang tags), so the seq /
 * protein / enzyme cut-site dims skip them — an enzyme card matches purely by name
 * or by its recognition site (as a tag). ref.kind='enzyme' lets the pick handler
 * route a click to the enzyme's cut-site search instead of a sequence jump.
 * @returns {Array} SearchDocuments with ref.kind='enzyme'
 */
export function collectEnzymeDocuments() {
  let eff;
  // restriction-db is a pure data module; guard so a load hiccup never breaks search.
  try { eff = effectiveEnzymes(); } catch { return []; }
  if (!eff || typeof eff !== 'object') return [];
  return Object.entries(eff).map(([name, info]) => ({
    ref: { kind: 'enzyme', id: name },
    title: name,
    subtitle: info?.site || '',
    textFields: {
      name,
      tags: [info?.site, info?.overhang].filter(Boolean),
      status: null,
      description: '',
      organism: '',
    },
    kind: 'enzyme',
  }));
}

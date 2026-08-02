/**
 * library-search-metadata — the METADATA dimensions of a search: name, tag, feature, type, status.
 *
 * Extracted from `library-search.js` (P1-2/P1-3), which had reached its hard size budget. A pure
 * move, not a rewrite: the same functions, the same rules, the same behaviour. What makes it a
 * genuine leaf rather than a file split is that none of it knows about providers, caps, sessions or
 * ranking — it answers one question, «does this document's TEXT match this term, and where», over a
 * SearchDocument. The orchestrator keeps the parts that decide what a RESULT is.
 *
 * The one subtlety worth keeping in view: a `feature` hit is the only metadata occurrence that
 * carries COORDINATES. That is why it can act as a locus when no biological provider answered
 * (P1-1) — and why the other dimensions must never be counted as places on the DNA.
 *
 * Pure: no store, no engine, no UI.
 */
import { inferType, inferStatus } from './query-classify';

/** Lower rank = stronger relation. Shared with the orchestrator's relevance tuple. */
export const RELATION_RANK = {
  exact: 0, prefix: 1, substring: 2, approximate: 3, compatible: 4,
};

export function findSub(hay, needle) {
  if (!hay || !needle) return null;
  const H = String(hay).toLowerCase();
  const N = String(needle).toLowerCase();
  const i = H.indexOf(N);
  if (i < 0) return null;
  const relation = H === N ? 'exact' : i === 0 ? 'prefix' : 'substring';
  return { start: i, end: i + N.length, relation };
}

export function docType(doc) {
  // ref.kind is AUTHORITATIVE (§10.4). The `type` dimension is TOPOLOGY, which is an
  // ENTRY-only concept (§4.5): a primer is its own type; project / enzyme / reSite do NOT
  // support `type` at all → null so NO `type:` value ever matches them (a topology filter
  // must never leak an enzyme into `type:linear`, nor a project into `type:project`).
  const kind = doc.ref?.kind;
  if (kind === 'primer') return 'primer';
  if (kind && kind !== 'entry') return null; // project / enzyme / reSite → not a `type`
  // entry (or a kindless legacy doc): topology + the legacy primer-by-shape heuristic.
  const k = doc.kind;
  if (k === 'primer' || k === 'oligonucleotide' || /primer|праймер/i.test(doc.textFields?.name || '')) return 'primer';
  if ((doc.topology || doc.sequence?.topology) === 'circular') return 'circular';
  return 'linear';
}

export const docStatus = (doc) => doc.textFields?.status || null;

/** Does a doc satisfy ONE supported metadata filter (type/status/tag)? A non-supported dim
 * (sequence/protein/enzyme) is SKIPPED here → true, so runSearch keeps its behaviour: those
 * provider dims are evaluated by the injected engines in matchDocument, not by this filter. */
export function passesSupportedFilter(doc, f) {
  if (f.dim === 'type') return docType(doc) === f.value;
  if (f.dim === 'status') return docStatus(doc) === f.value;
  if (f.dim === 'tag') {
    const tags = doc.textFields?.tags || [];
    return tags.some((t) => String(t).toLowerCase().includes(String(f.value).toLowerCase()));
  }
  return true; // provider dim — not this filter's job
}

/** A document passes the DELIBERATE (prefix) filters — hard AND. Provider dims are skipped
 * (handled by matchDocument); an unconsumed metadata dim short-circuits earlier via the
 * planRequiresFullSearch guard in matchesEntry / runSearch. */
export function passesExplicitFilters(doc, filters) {
  return filters.every((f) => passesSupportedFilter(doc, f));
}

const entryOcc = (doc) => ({ targetRef: doc.ref });

/**
 * Match one free term against a document's metadata dims. Mutates `bag` (a
 * Map<dimension, {relation,highlights[],occurrences[]}>) and returns whether it matched.
 */
export function matchTerm(doc, term, bag) {
  let hit = false;
  const add = (dim, field, span, occ) => {
    hit = true;
    let m = bag.get(dim);
    if (!m) { m = { relation: span.relation, highlights: [], occurrences: [] }; bag.set(dim, m); }
    if (RELATION_RANK[span.relation] < RELATION_RANK[m.relation]) m.relation = span.relation;
    m.highlights.push({ field, start: span.start, end: span.end });
    if (occ) m.occurrences.push(occ);
  };

  const nm = findSub(doc.textFields?.name, term);
  if (nm) add('name', 'name', nm, entryOcc(doc));

  for (const tag of doc.textFields?.tags || []) {
    const tg = findSub(tag, term);
    if (tg) { add('tag', 'tag', tg, entryOcc(doc)); break; }
  }

  for (const feat of doc.features || []) {
    let span = findSub(feat.name, term); let field = 'feature.name';
    if (!span) { const ts = findSub(feat.type, term); if (ts) { span = ts; field = 'feature.type'; } }
    if (!span && feat.qualifiers) {
      for (const [k, v] of Object.entries(feat.qualifiers)) {
        const val = Array.isArray(v) ? v.join(' ') : String(v);
        const qs = findSub(val, term);
        if (qs) { span = qs; field = `feature.${k}`; break; }
      }
    }
    if (span) {
      const location = Number.isFinite(feat.start) && Number.isFinite(feat.end)
        ? { segments: [{ start: feat.start, end: feat.end }], strand: feat.strand === -1 ? '-' : '+', wrapsOrigin: false }
        : undefined;
      add('feature', field, span, { targetRef: { kind: 'feature', id: feat.id, ownerRef: doc.ref }, location });
    }
  }

  // Keyword-as-filter UNION: a term that names a type/status matches docs of that
  // type/status (in addition to any literal text hit above).
  const ty = inferType(term);
  if (ty && docType(doc) === ty) add('type', 'type', { start: 0, end: term.length, relation: 'exact' }, entryOcc(doc));
  const st = inferStatus(term);
  if (st && docStatus(doc) === st) add('status', 'status', { start: 0, end: term.length, relation: 'exact' }, entryOcc(doc));

  return hit;
}

/**
 * search-types — the normalized SEARCH contract (P0).
 *
 * Single source of truth for the SHAPES the search subsystem passes around. Both
 * the INPUT (`SearchDocument`) and the OUTPUT (`SearchResult`) are entity-agnostic
 * so the same orchestrator serves the library today and projects / features /
 * primers / enzymes / RE-sites later (P5) without a rewrite.
 *
 * JSDoc-only (no runtime shape) except the shared enums below — importing modules
 * annotate against these typedefs; the tests assert the shape at runtime.
 *
 * Layering (strictly one-way, no cycle):
 *   document-adapters → literal-match (library-match, primitive) → orchestrator
 *   (library-search) → UI
 */

/** The searchable dimensions. `sequence`/`protein`/`enzyme` carry biological metrics. */
export const SEARCH_DIMENSIONS = Object.freeze([
  'name', 'tag', 'type', 'status', 'feature', 'sequence', 'protein', 'enzyme',
]);

/** Entity kinds a result can point at (grows with providers in P5). */
export const ENTITY_KINDS = Object.freeze([
  'entry', 'project', 'feature', 'primer', 'enzyme', 'reSite',
]);

/** How closely a match relates to the query (for the honest metric readout). */
export const RELATIONS = Object.freeze([
  'exact', 'prefix', 'substring', 'approximate', 'compatible',
]);

/**
 * @typedef {Object} EntityRef
 * @property {'entry'|'project'|'feature'|'primer'|'enzyme'|'reSite'} kind
 * @property {string} id
 * @property {EntityRef} [ownerRef]   // REQUIRED for sub-entity kinds (feature id is
 *                                    // unique only within its molecule; RE-site depends
 *                                    // on molecule + enzyme).
 * @property {string} [revision]      // REQUIRED for coordinate results — makes the
 *                                    // stale-check real, not declarative.
 */

/**
 * Normalized INPUT. Every entity type is adapted to this before searching, so the
 * orchestrator never touches raw store shapes.
 * @typedef {Object} SearchDocument
 * @property {EntityRef} ref
 * @property {string} title
 * @property {string} [subtitle]
 * @property {{ name?:string, tags?:string[], status?:string, description?:string,
 *   organism?:string, qualifiers?:Object }} textFields
 * @property {{ seq:string, topology?:'circular'|'linear', fingerprint?:string }} [sequence]
 * @property {Array<Object>} [features]   // annotations — protein-match translates the CDS ones
 * @property {'circular'|'linear'} [topology]  // top-level mirror of sequence.topology; the row VM
 *                                    //   reads it for the kind/topology glyph
 * @property {string} [kind]          // 'catalog' | 'primer' | … — scope filtering reads it
 * @property {string|null} [projectId] // parent, so a child hit can bubble its project up
 * @property {{ start:number, end:number, strand?:1|-1, segments?:Array<{start:number,end:number}> }} [coords]
 */

/**
 * Biological metrics — per OCCURRENCE, never per result (one molecule can hold
 * hits at 100 / 95 / 90 %). `identity` is null for an IUPAC hit: an N is COMPATIBLE,
 * not proven identical.
 * @typedef {Object} SeqMetrics
 * @property {number} length            // query length in nt/aa — the metrics readout prints it
 * @property {number|null} identity
 * @property {number} compatibility
 * @property {number} coverage
 * @property {number} exactMatches
 * @property {number} compatibleMatches
 * @property {number} uncertainMatches
 * @property {number} mismatches
 * @property {number} indels
 * @property {number[]} mismatchPositions
 */

/**
 * A single physical location of a match. `segments` (not a single start/end) so a
 * circular origin-spanning or spliced hit is one location with several arcs.
 * @typedef {Object} SearchLocation
 * @property {Array<{start:number,end:number}>} segments
 * @property {'+'|'-'|'both'} strand
 * @property {boolean} wrapsOrigin
 */

/**
 * What a PROVIDER (seq/protein/enzyme engine) returns per hit. It describes WHERE the hit is —
 * never WHOSE it is: there is deliberately no `targetRef`. `library-search` enriches with
 * `{ targetRef: doc.ref, ...o }`, so a provider-owned ref would win the spread and re-attribute
 * the hit to another molecule; `search-provider-contract` rejects any occurrence carrying one.
 * @typedef {Object} ProviderOccurrence
 * @property {SearchLocation} location
 * @property {SeqMetrics} [metrics]
 * @property {Object} [protein]   // CDS/frame/exon explanation (protein-match)
 * @property {Object} [enzyme]    // enzyme name/site/overhang (re-match)
 */

/**
 * A ProviderOccurrence after the orchestrator named its owner — plus metadata occurrences, which
 * are just the owner ref (a name/tag/status hit has no coordinates), hence optional `location`.
 * @typedef {Object} SearchOccurrence
 * @property {EntityRef} targetRef
 * @property {SearchLocation} [location]
 * @property {SeqMetrics} [metrics]
 * @property {Object} [protein]
 * @property {Object} [enzyme]
 */

/**
 * @typedef {Object} SearchMatch
 * @property {'name'|'tag'|'type'|'status'|'feature'|'sequence'|'protein'|'enzyme'} dimension
 * @property {'exact'|'prefix'|'substring'|'approximate'|'compatible'} relation
 * @property {Array<{field:string,start:number,end:number}>} highlights
 * @property {SearchOccurrence[]} occurrences  // RETAINED window, capped at maxLocationsPerEntity
 * @property {number} locationCount  // how many PHYSICAL loci exist — measured before every cap
 *                                   //   (P1-2), so a count shown to a biologist is not the size of
 *                                   //   the window
 * @property {number} bestIndex  // index into `occurrences` of the §3.2 winner, or −1 when this
 *                               //   dimension declares none. Rule 7 is decided where the edit
 *                               //   script exists and cannot be re-derived later (P1-3).
 */

/**
 * @typedef {Object} SearchResult
 * @property {string} entityKey
 * @property {EntityRef} entityRef
 * @property {SearchMatch[]} matches
 * @property {string} primaryMatchId
 * @property {Array<number|string>} relevanceKey   // TUPLE, context-dependent; sort only.
 * @property {boolean} providerPending  // a metadata candidate still awaiting biological
 *                                      //   confirmation; a confirmed final hit is false.
 */

/**
 * `status` is what the runtime ACTUALLY assigns: search-service stamps 'partial' on the instant
 * metadata pass and 'done' on the resolved final; the facade's K7 error-gate returns 'blocked'.
 * @typedef {Object} SearchSession
 * @property {string} requestId
 * @property {QueryPlan} plan
 * @property {'partial'|'done'|'blocked'} status
 * @property {SearchResult[]} results
 * @property {Object} diagnostics
 * @property {boolean} truncated
 * @property {boolean} [blocked]              // K7 gate: the query never ran
 * @property {boolean} [incomplete]           // a requested provider did NOT run
 * @property {string[]} [incompleteDims]      // ordered sequence → protein → enzyme
 * @property {Array<{dimension:string, reason:'TIMEOUT'|'WORKER_FAILURE'|'PROVIDER_ERROR'}>} [providerFailures]
 * @property {Set<string>} [matchingEntryIds]
 * @property {Set<string>} [matchingProjectIds]
 */

/**
 * @typedef {Object} QueryFilter
 * @property {'name'|'tag'|'type'|'status'|'feature'|'sequence'|'protein'|'enzyme'} dim
 * @property {string} value
 * @property {string} [id]           // parser-owned clause id, shared with the FieldClause it
 *                                   //   mirrors. OPTIONAL: transitional / inferred filters are
 *                                   //   synthesized without one.
 * @property {boolean} [removable]   // inferred filters are removable chips, explicit are not.
 */

/**
 * A structured field/filter clause (REV #2 §7). `name/tag/feature` are field clauses;
 * `type/status/withinProject` are filter clauses. Separate from the free `textTerms`.
 * @typedef {Object} FieldClause
 * @property {string} id       // parser-owned clause id (K7) assigned in PARSE order, BEFORE the
 *                             //   fieldClause sort, so repeated `tag:` stay distinct in the
 *                             //   consumed-clause ledger. A type/status/tag clause shares its id
 *                             //   with its transitional explicitFilter (one logical clause).
 * @property {'name'|'tag'|'feature'|'type'|'status'|'withinProject'} field
 * @property {string} value
 * @property {'contains'|'equals'} operator
 */

/**
 * A parser/capability diagnostic (REV #2 §7). `error` severity blocks the run; `warning`
 * / `info` do not. `REQUIRES_FULL_SEARCH` (profile capability) is an `info` escalation.
 * @typedef {Object} QueryDiagnostic
 * @property {string} code
 * @property {'info'|'warning'|'error'} severity
 * @property {string} [token]
 * @property {string} messageKey
 * @property {string} [suggestion]
 */

/**
 * Output of `classifyQuery` (REV #2 §7). The EXECUTABLE semantics are three independent
 * parts — `entityScope` (where), `providerIntent` (what compute), `fieldClauses` (extra
 * AND constraints); `uiPreset` is display-only. The LEGACY views (`textTerms`,
 * `explicitFilters`, `inferredFilters`, `interpretations`, `seqQuery/aaQuery/reQuery`)
 * are TRANSITIONAL — the un-migrated engine reads them until Stages 2–3; the engine must
 * not apply both the new fields and the legacy views (§7 invariant 6).
 * @typedef {Object} QueryPlan
 * @property {string} raw
 * @property {string} normalizedText
 * @property {'library'|'molecule'|'primer'|'project'|'sequence'|'protein'|'enzymeCatalog'|'restrictionSites'} uiPreset  // display-only, deterministic
 * @property {{ includeKinds:string[], excludeKinds:string[] }} entityScope
 * @property {'lib'|'mol'|'primer'|'project'|null} scopePreset  // canonical scope provenance (NOT derived from uiPreset); 'lib' = explicit default scope
 * @property {'metadata'|'sequence'|'protein'|'enzymeCatalog'|'restrictionSites'} providerIntent
 * @property {'explicit'|'inferred'} intentSource  // inferred = an auto-detected bare DNA motif
 * @property {Array<{canonical:string, span:{start:number,end:number}, explicit:boolean}>} prefixUsages
 * @property {string[]} textTerms
 * @property {FieldClause[]} fieldClauses
 * @property {string|null} seqQuery
 * @property {string|null} aaQuery
 * @property {string|null} enzymeCatalogQuery
 * @property {string|null} cutQuery
 * @property {string|null} reQuery                 // transitional mirror of cutQuery
 * @property {QueryDiagnostic[]} diagnostics
 * @property {QueryFilter[]} explicitFilters       // transitional
 * @property {QueryFilter[]} inferredFilters       // transitional
 * @property {Array<{kind:'text'|'dna'|'protein'|'enzyme', confidence:number}>} interpretations // transitional
 */

export {};

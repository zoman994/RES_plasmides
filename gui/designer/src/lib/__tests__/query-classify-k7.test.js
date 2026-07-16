/**
 * query-classify — REV#2 Stage 2 K7: parser-owned clause IDs (assigned BEFORE the fieldClause
 * sort, so repeated tag: don't collapse) + `type:`→scope narrowing (§4.5). The clause IDs are
 * the anchor for the consumed-clause ledger in library-search.
 */
import { describe, it, expect } from 'vitest';
import { classifyQuery } from '../query-classify';

describe('K7.1 — parser-owned clause IDs', () => {
  it('every explicit filter carries a unique parser-owned id', () => {
    const p = classifyQuery('tag:a tag:b type:circular');
    const ids = p.explicitFilters.map((f) => f.id);
    expect(ids.every((x) => typeof x === 'string' && x)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length); // all distinct
  });

  it('repeated identical tag: clauses stay TWO distinct clauses (no collapse)', () => {
    const p = classifyQuery('tag:x tag:x');
    const tagClauses = p.explicitFilters.filter((f) => f.dim === 'tag');
    expect(tagClauses.length).toBe(2);
    expect(tagClauses[0].id).not.toBe(tagClauses[1].id);
  });

  it('field clauses keep their parse-order id THROUGH the sort (ids assigned before sorting)', () => {
    // status sorts after type in FIELD_ORDER, but status: is typed FIRST here — so its id must be
    // 'c0' (parse order) and type's 'c1', even though the SORTED order puts type before status.
    const p = classifyQuery('status:wip type:linear');
    const byField = Object.fromEntries(p.fieldClauses.map((c) => [c.field, c.id]));
    expect(byField.status).toBe('c0'); // parsed first → id c0 (assigned BEFORE the sort)
    expect(byField.type).toBe('c1');   // parsed second → id c1
    expect(p.fieldClauses.map((c) => c.field)).toEqual(['type', 'status']); // sorted: type (rank 3) first
  });

  it('a type/status/tag clause shares ONE id across its fieldClause + explicitFilter (same logical clause)', () => {
    const p = classifyQuery('type:circular');
    const fc = p.fieldClauses.find((c) => c.field === 'type');
    const ef = p.explicitFilters.find((f) => f.dim === 'type');
    expect(fc.id).toBe(ef.id);
  });
});

describe('K7.1 — type:→scope narrowing (§4.5)', () => {
  it('type:primer narrows entityScope to [primer]', () => {
    const p = classifyQuery('type:primer');
    expect(p.entityScope.includeKinds).toEqual(['primer']);
  });

  it('type:circular / type:linear narrow entityScope to [entry] (topology is entry-only)', () => {
    expect(classifyQuery('type:circular').entityScope.includeKinds).toEqual(['entry']);
    expect(classifyQuery('type:linear').entityScope.includeKinds).toEqual(['entry']);
  });

  it('type:primer INTERSECTS a provider scope — type:primer seq:… stays [primer], never entry', () => {
    const p = classifyQuery('type:primer seq:GAATTCGG');
    expect(p.entityScope.includeKinds).toEqual(['primer']);
  });

  it('a contradictory scope+type yields an EMPTY include (fail-closed), never wrong kinds', () => {
    // primer: scope narrows to [primer]; type:circular is entry-only → intersection empty.
    const p = classifyQuery('primer:foo type:circular');
    expect(p.entityScope.includeKinds).toEqual([]);
  });

  it('an unknown type value does NOT narrow (keeps the default multi-kind scope)', () => {
    const p = classifyQuery('type:weird');
    expect(p.entityScope.includeKinds).toEqual(['entry', 'project', 'primer']);
  });

  it('TWO contradictory type: clauses collapse to [] REGARDLESS of order (intersect ALL, not just first)', () => {
    expect(classifyQuery('type:primer type:circular').entityScope.includeKinds).toEqual([]);
    expect(classifyQuery('type:circular type:primer').entityScope.includeKinds).toEqual([]);
  });

  it('two AGREEING type: clauses keep the shared kind', () => {
    expect(classifyQuery('type:circular type:linear').entityScope.includeKinds).toEqual(['entry']);
  });

  it('explicit type: is EXACT-matched, not prefix — type:primerjunk / type:linearity do NOT normalize', () => {
    // prefix recognition is for FREE text only; an explicit filter value must match an enum exactly.
    expect(classifyQuery('type:primerjunk').entityScope.includeKinds).toEqual(['entry', 'project', 'primer']);
    expect(classifyQuery('type:linearity').entityScope.includeKinds).toEqual(['entry', 'project', 'primer']);
    // the fieldClause value is NOT silently normalized to a real enum
    const p = classifyQuery('type:primerjunk');
    expect(p.fieldClauses.find((c) => c.field === 'type').value).not.toBe('primer');
  });

  it('explicit status: is EXACT-matched too — status:releasexyz does not normalize to release', () => {
    const p = classifyQuery('status:releasexyz');
    expect(p.fieldClauses.find((c) => c.field === 'status').value).not.toBe('release');
  });
});

describe('K7 round-3 — status: is entity-scoped (archived≠deprecated)', () => {
  const statusValue = (q) => classifyQuery(q).fieldClauses.find((c) => c.field === 'status')?.value;
  const scope = (q) => classifyQuery(q).entityScope.includeKinds;

  it('archived / архив → archived (a PRIMER status), NOT deprecated', () => {
    expect(statusValue('status:archived')).toBe('archived');
    expect(statusValue('status:архив')).toBe('archived');
    expect(statusValue('status:архивная')).toBe('archived');
  });
  it('deprecated / устар* → deprecated (an ENTRY status), never archived', () => {
    expect(statusValue('status:deprecated')).toBe('deprecated');
    expect(statusValue('status:устаревшая')).toBe('deprecated');
  });

  it('a PRIMER status narrows scope to [primer]; an ENTRY status to [entry]', () => {
    expect(scope('status:archived')).toEqual(['primer']);
    expect(scope('status:ordered')).toEqual(['primer']);
    expect(scope('status:received')).toEqual(['primer']);
    expect(scope('status:deprecated')).toEqual(['entry']);
    expect(scope('status:release')).toEqual(['entry']);
  });

  it('two contradictory status: clauses collapse to [] REGARDLESS of order', () => {
    expect(scope('status:release status:archived')).toEqual([]);
    expect(scope('status:archived status:release')).toEqual([]);
  });

  it('an EXPLICIT scope incompatible with a status → [] AND an error diagnostic (both orders)', () => {
    for (const q of ['primer:foo status:release', 'status:release primer:foo', 'mol:foo status:archived']) {
      const p = classifyQuery(q);
      expect(p.entityScope.includeKinds, q).toEqual([]);
      expect(p.diagnostics.some((d) => d.code === 'incompatible-scope-status' && d.severity === 'error'), q).toBe(true);
    }
  });

  it('free-text `archived` infers the PRIMER status archived (not deprecated)', () => {
    const p = classifyQuery('archived');
    expect(p.inferredFilters).toContainEqual({ dim: 'status', value: 'archived', removable: true });
    expect(p.inferredFilters).not.toContainEqual({ dim: 'status', value: 'deprecated', removable: true });
  });
});

describe('K7 round-3 — parameterized type: + status: scope matrix', () => {
  const scope = (q) => classifyQuery(q).entityScope.includeKinds;

  // COMPATIBLE type+status (same owning kind) keep that kind — asserted in BOTH token orders.
  it.each([
    ['type:primer status:archived', ['primer']],
    ['status:archived type:primer', ['primer']],
    ['type:circular status:release', ['entry']],
    ['status:release type:circular', ['entry']],
    ['type:linear status:deprecated', ['entry']],
    ['type:primer status:ordered', ['primer']],
  ])('compatible %s → %o', (q, expected) => {
    expect(scope(q)).toEqual(expected);
  });

  // CROSS-KIND type+status (entry-type + primer-status, or vice versa) → [] regardless of order.
  it.each([
    'type:primer status:release',
    'status:release type:primer',
    'type:circular status:archived',
    'status:archived type:circular',
  ])('cross-kind %s → [] (both orders)', (q) => {
    expect(scope(q)).toEqual([]);
  });
});

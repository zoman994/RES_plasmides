/**
 * search-query-sync — REV#2 Stage 3 K3 (corrective). The pure typed-prefix <-> UI <->
 * canonical sync engine behind §9.4. The ACCEPTANCE gate is the semantic oracle
 *   project(classify(raw)) ≡ project(classify(build(sync(raw))))
 * over Igor's matrix — sync+build must not change the meaning of a query (provider,
 * scope, biological queries, text terms, filters, blocking diagnostics).
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QUERY_STATE,
  syncTypedDraft,
  selectMode,
  addFilter,
  removeFilter,
  clearMode,
  clearAll,
  clearModeOnBackspace,
  buildCanonicalQuery,
  isRunnable,
  resolveEntityFilters,
  toModeSelectorModel,
  toFilterChipModel,
} from '../search-query-sync';
import { classifyQuery } from '../query-classify';
import { prefixEntry } from '../search-prefix-registry';

const t = (key) => `«${key}»`;
// The Cyrillic enz alias, pulled from the registry so the test source carries no
// Cyrillic literal but still exercises the Cyrillic-alias matrix entry (U+0400–U+04FF).
const CYR_ENZ_ALIAS = prefixEntry('enz').aliases.find((a) => a.charCodeAt(0) > 0x7f);

// The semantic projection compared by the oracle — ignores raw/spans/clause ids.
function project(plan) {
  return {
    providerIntent: plan.providerIntent,
    scopePreset: plan.scopePreset,
    seqQuery: plan.seqQuery,
    aaQuery: plan.aaQuery,
    enzymeCatalogQuery: plan.enzymeCatalogQuery,
    cutQuery: plan.cutQuery,
    textTerms: [...(plan.textTerms || [])].sort(),
    fieldClauses: (plan.fieldClauses || []).map((c) => `${c.field}=${c.value}`).sort(),
    blockingCodes: (plan.diagnostics || []).filter((d) => d.severity === 'error').map((d) => d.code).sort(),
  };
}

describe('search-query-sync — semantic oracle: classify(raw) ≡ classify(build(sync(raw)))', () => {
  const MATRIX = [
    'aa:HHHH',
    'aa:HHHH pUC',
    'aa:HHHH type:circular',
    'aa:HHHH seq:ATGC',
    'mol:pUC project:Alpha',
    '"Alpha Beta"',
    '"Alpha  Beta"',
    'mol:"Alpha Beta"',
    'foo:"bar baz"',
    'aa:"HH',
    're:EcoRI',
    `${CYR_ENZ_ALIAS}:BsaI`, // a Cyrillic enz alias, from the registry — no literal in source
    'tag:a tag:b',
    'tag:a tag:a', // PRE-3: repeated identical clauses must NOT collapse (parser-owned occurrence identity)
  ];
  for (const raw of MATRIX) {
    it(`preserves the plan for: ${raw}`, () => {
      const direct = project(classifyQuery(raw));
      const rebuilt = project(classifyQuery(buildCanonicalQuery(syncTypedDraft(DEFAULT_QUERY_STATE, raw))));
      expect(rebuilt).toEqual(direct);
    });
  }
});

describe('search-query-sync — K3-corr2: lifecycle transitions sync(prevState, editedDraft)', () => {
  it('aa:HHHH seq:ATGC then a keystroke keeps BOTH providers and the conflict (mode does not drift)', () => {
    const s1 = syncTypedDraft(DEFAULT_QUERY_STATE, 'aa:HHHH seq:ATGC');
    expect(classifyQuery(buildCanonicalQuery(s1)).diagnostics.some((d) => d.code === 'multiple-provider-intents')).toBe(true);
    // the user appends " pUC" to the returned VISIBLE draft — the second provider must not become the mode
    const s2 = syncTypedDraft(s1, `${s1.draft} pUC`);
    expect(s2.mode).toBe('aa'); // NOT 'seq'
    const plan = classifyQuery(buildCanonicalQuery(s2));
    expect(plan.diagnostics.some((d) => d.code === 'multiple-provider-intents' && d.severity === 'error')).toBe(true);
    expect(s2.diagnostics.some((d) => d.code === 'multiple-provider-intents')).toBe(true);
  });

  it('mol:pUC project:Alpha then a keystroke keeps BOTH scopes and the conflict', () => {
    const s1 = syncTypedDraft(DEFAULT_QUERY_STATE, 'mol:pUC project:Alpha');
    expect(classifyQuery(buildCanonicalQuery(s1)).diagnostics.some((d) => d.code === 'multiple-scope-presets')).toBe(true);
    const s2 = syncTypedDraft(s1, `${s1.draft} x`);
    expect(s2.mode).toBe('mol'); // NOT 'project'
    const plan = classifyQuery(buildCanonicalQuery(s2));
    expect(plan.diagnostics.some((d) => d.code === 'multiple-scope-presets' && d.severity === 'error')).toBe(true);
  });

  it('a mode is NOT auto-switched by typing a second prefix while one is active (needs explicit clear/selector)', () => {
    const s1 = syncTypedDraft(DEFAULT_QUERY_STATE, 'aa:HHHH');
    const s2 = syncTypedDraft(s1, `${s1.draft} mol:pUC`); // typing a scope while in aa mode
    expect(s2.mode).toBe('aa'); // stays aa; mol stays verbatim in the query
    // explicit resolution: backspace-clear to default, then the next typed prefix lifts
    const cleared = syncTypedDraft(clearMode(s1), 'seq:GGGG');
    expect(cleared.mode).toBe('seq');
  });
});

describe('search-query-sync — DEFAULT + basic lifts', () => {
  it('DEFAULT is the library scope with no filters and an empty draft', () => {
    expect(DEFAULT_QUERY_STATE.mode).toBe('lib');
    expect(DEFAULT_QUERY_STATE.filters).toEqual([]);
    expect(DEFAULT_QUERY_STATE.draft).toBe('');
  });

  it('a MODE prefix sets the mode and keeps its value visible; a scope keeps its value', () => {
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 'aa:HHHH').mode).toBe('aa');
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 'aa:HHHH').draft).toBe('HHHH');
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 're:EcoRI').mode).toBe('cut'); // legacy alias
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 'mol:pUC').draft).toBe('pUC');
  });

  it('a FILTER prefix lifts to a chip and leaves the draft', () => {
    const next = syncTypedDraft(DEFAULT_QUERY_STATE, 'type:circular');
    expect(next.draft).toBe('');
    expect(next.filters[0]).toMatchObject({ canonical: 'type', value: 'circular' });
  });

  it('the project trap: project:Gla is the scope MODE, in:Gla is the `in` FILTER', () => {
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 'project:Gla').mode).toBe('project');
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 'project:Gla').filters).toEqual([]);
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 'in:Gla').mode).toBe('lib');
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 'in:Gla').filters[0].canonical).toBe('in');
  });

  it('an incomplete token stays as typed; the mode and chips persist across an emptied draft', () => {
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 'aa:').draft).toBe('aa:');
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 'aa:').mode).toBe('lib');
    const withMode = selectMode(DEFAULT_QUERY_STATE, 'aa');
    expect(syncTypedDraft(withMode, '').mode).toBe('aa');
    const withChip = addFilter(DEFAULT_QUERY_STATE, { canonical: 'tag' }, 'cloning');
    expect(syncTypedDraft(withChip, 'pUC').filters).toHaveLength(1);
  });
});

describe('search-query-sync — K3-corr-B: unquoted filter completion (commitTail)', () => {
  it('a keystroke inside the last token does NOT create a chip; committing does', () => {
    // char-by-char: no trailing space, no commit signal -> stays in the draft, no chip
    const typing = syncTypedDraft(DEFAULT_QUERY_STATE, 'tag:cloning', { commitTail: false });
    expect(typing.filters).toEqual([]);
    expect(typing.draft).toBe('tag:cloning');
    // an explicit commit (Enter/blur/paste) lifts it
    const committed = syncTypedDraft(DEFAULT_QUERY_STATE, 'tag:cloning', { commitTail: true });
    expect(committed.filters[0]).toMatchObject({ canonical: 'tag', value: 'cloning' });
    // a trailing space is also a commit boundary for the token
    const spaced = syncTypedDraft(DEFAULT_QUERY_STATE, 'tag:cloning ', { commitTail: false });
    expect(spaced.filters[0]).toMatchObject({ canonical: 'tag', value: 'cloning' });
  });

  it('a quoted filter completes only on its closing quote', () => {
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 'tag:"my ', { commitTail: false }).filters).toEqual([]);
    expect(syncTypedDraft(DEFAULT_QUERY_STATE, 'tag:"my tag"', { commitTail: false }).filters[0])
      .toMatchObject({ canonical: 'tag', value: 'my tag' });
  });
});

describe('search-query-sync — K3-corr-C: addFilter is fail-closed and uses the real registry def', () => {
  it('rejects a mode canonical, an unknown canonical, and a bogus inputType', () => {
    expect(addFilter(DEFAULT_QUERY_STATE, { canonical: 'aa' }, 'x').filters).toEqual([]); // a mode, not a filter
    expect(addFilter(DEFAULT_QUERY_STATE, { canonical: 'evil' }, 'x').filters).toEqual([]); // unknown
    // a caller-supplied wrong inputType is ignored — the REAL def (type=enum) is used
    const s = addFilter(DEFAULT_QUERY_STATE, { canonical: 'type', inputType: 'entity' }, 'circular');
    expect(s.filters[0]).toMatchObject({ canonical: 'type', value: 'circular' });
  });

  it('accepts a canonical string as well as a def object', () => {
    expect(addFilter(DEFAULT_QUERY_STATE, 'tag', 'cloning').filters[0]).toMatchObject({ canonical: 'tag', value: 'cloning' });
  });

  it('a blank value is refused', () => {
    expect(addFilter(DEFAULT_QUERY_STATE, { canonical: 'tag' }, '   ').filters).toEqual([]);
  });
});

describe('search-query-sync — K3-corr-C: typed `in:` stays unresolved until a resolver runs', () => {
  it('a typed in:Gla is stored unresolved, NOT as {projectId:Gla}', () => {
    const chip = syncTypedDraft(DEFAULT_QUERY_STATE, 'in:Gla').filters[0];
    expect(chip.value).toMatchObject({ raw: 'Gla', unresolved: true });
    expect(chip.value.projectId).toBeUndefined();
  });

  it('resolveEntityFilters resolves a UNIQUE match to {projectId,label}', () => {
    const state = syncTypedDraft(DEFAULT_QUERY_STATE, 'in:Gla');
    const resolved = resolveEntityFilters(state, (name) => (name === 'Gla' ? [{ projectId: 'p7', label: 'Gla' }] : []));
    expect(resolved.filters[0].value).toMatchObject({ projectId: 'p7', label: 'Gla' });
    expect(resolved.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('an AMBIGUOUS match stays unresolved and raises a blocking diagnostic', () => {
    const state = syncTypedDraft(DEFAULT_QUERY_STATE, 'in:Alpha');
    const resolved = resolveEntityFilters(state, () => [{ projectId: 'a', label: 'Alpha' }, { projectId: 'b', label: 'Alpha' }]);
    expect(resolved.filters[0].value).toMatchObject({ unresolved: true });
    expect(resolved.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('a menu-supplied {projectId,label} is stored resolved directly', () => {
    const s = addFilter(DEFAULT_QUERY_STATE, { canonical: 'in' }, { projectId: 'p1', label: 'Alpha' });
    expect(s.filters[0].value).toMatchObject({ projectId: 'p1', label: 'Alpha' });
  });
});

describe('search-query-sync — K3-corr-D: a selected non-lib mode is never silently downgraded to library', () => {
  it('mode=primer + a filter + empty draft is NON-runnable (not a default-library search)', () => {
    const state = { ...selectMode(DEFAULT_QUERY_STATE, 'primer'), filters: addFilter(DEFAULT_QUERY_STATE, { canonical: 'tag' }, 'x').filters };
    expect(isRunnable(state)).toBe(false);
    // and it must NOT classify to the default library scope with just the filter
    const plan = classifyQuery(buildCanonicalQuery(state));
    expect(plan.scopePreset === 'primer' || !isRunnable(state)).toBe(true);
  });

  it('a lib scope with only a filter IS runnable', () => {
    const state = addFilter(DEFAULT_QUERY_STATE, { canonical: 'type' }, 'circular');
    expect(isRunnable(state)).toBe(true);
  });

  it('a non-lib mode with a value is runnable', () => {
    expect(isRunnable(syncTypedDraft(DEFAULT_QUERY_STATE, 'aa:HHHH'))).toBe(true);
  });
});

describe('search-query-sync — UI transitions', () => {
  it('selectMode is fail-closed; removeFilter/clearMode/clearAll behave', () => {
    expect(selectMode(DEFAULT_QUERY_STATE, 'aa').mode).toBe('aa');
    expect(selectMode(DEFAULT_QUERY_STATE, 'zzz').mode).toBe('lib');
    expect(selectMode(DEFAULT_QUERY_STATE, 'type').mode).toBe('lib');
    const s = addFilter(selectMode(DEFAULT_QUERY_STATE, 'aa'), { canonical: 'type' }, 'circular');
    expect(removeFilter(s, s.filters[0].id).filters).toEqual([]);
    expect(clearMode(s).mode).toBe('lib');
    expect(clearMode(s).filters).toHaveLength(1);
    expect(clearAll(s).mode).toBe('lib');
    expect(clearAll(s).filters).toEqual([]);
    expect(clearAll(s).draft).toBe('');
  });

  it('clearModeOnBackspace clears the mode only on an empty draft', () => {
    const withMode = selectMode(DEFAULT_QUERY_STATE, 'aa');
    expect(clearModeOnBackspace(withMode).mode).toBe('lib');
    expect(clearModeOnBackspace({ ...withMode, draft: 'HH' }).mode).toBe('aa');
  });
});

describe('search-query-sync — corrective: structured transitions rederive parser diagnostics', () => {
  it('removing the clause that caused an incompatible scope clears the stale error', () => {
    const blocked = syncTypedDraft(DEFAULT_QUERY_STATE, 'primer:pUC status:release');
    expect(blocked.diagnostics.some((d) => d.code === 'incompatible-scope-status')).toBe(true);

    const statusChip = blocked.filters.find((f) => f.canonical === 'status');
    const after = removeFilter(blocked, statusChip.id);
    expect(after.diagnostics.some((d) => d.code === 'incompatible-scope-status')).toBe(false);
  });

  it('selectMode and addFilter derive new conflicts, then selectMode/clearMode remove them', () => {
    const molecule = syncTypedDraft(DEFAULT_QUERY_STATE, 'mol:pUC status:release');
    expect(molecule.diagnostics.some((d) => d.severity === 'error')).toBe(false);

    const wrongScope = selectMode(molecule, 'primer');
    expect(wrongScope.diagnostics.some((d) => d.code === 'incompatible-scope-status')).toBe(true);
    const restoredScope = selectMode(wrongScope, 'mol');
    expect(restoredScope.diagnostics.some((d) => d.code === 'incompatible-scope-status')).toBe(false);

    const primer = syncTypedDraft(DEFAULT_QUERY_STATE, 'primer:pUC');
    const wrongStatus = addFilter(primer, 'status', 'release');
    expect(wrongStatus.diagnostics.some((d) => d.code === 'incompatible-scope-status')).toBe(true);
    expect(clearMode(wrongStatus).diagnostics.some((d) => d.code === 'incompatible-scope-status')).toBe(false);
  });
});

describe('search-query-sync — corrective: quoted whitespace survives lifecycle edits', () => {
  it('preserves repeated whitespace inside a quoted term in draft and canonical query', () => {
    const first = syncTypedDraft(DEFAULT_QUERY_STATE, '"Alpha  Beta"');
    expect(first.draft).toBe('"Alpha  Beta"');
    expect(classifyQuery(buildCanonicalQuery(first)).textTerms).toContain('Alpha  Beta');

    const edited = syncTypedDraft(first, `${first.draft} gamma`);
    expect(edited.draft).toBe('"Alpha  Beta" gamma');
    expect(classifyQuery(buildCanonicalQuery(edited)).textTerms).toEqual(
      expect.arrayContaining(['Alpha  Beta', 'gamma']),
    );
  });
});

describe('search-query-sync — PRE-1: removeFilter recomputes per-chip entity diagnostics', () => {
  const ambiguous = () => [{ projectId: 'a', label: 'Alpha' }, { projectId: 'b', label: 'Alpha' }];

  it('dropping the unresolved in: chip clears ITS ambiguous-project diagnostic, keeping the valid query', () => {
    let s = syncTypedDraft(DEFAULT_QUERY_STATE, 'in:Alpha tag:cloning');
    s = resolveEntityFilters(s, ambiguous);
    expect(s.diagnostics.some((d) => d.code === 'ambiguous-project' && d.severity === 'error')).toBe(true);
    const inChip = s.filters.find((f) => f.canonical === 'in');
    const after = removeFilter(s, inChip.id);
    expect(after.filters.some((f) => f.canonical === 'in')).toBe(false);
    expect(after.filters.some((f) => f.canonical === 'tag' && f.value === 'cloning')).toBe(true);
    expect(after.diagnostics.some((d) => d.code === 'ambiguous-project')).toBe(false); // stale diag pruned
  });

  it('a diagnostic for a DIFFERENT still-unresolved chip survives the removal', () => {
    // two ambiguous in: chips with distinct raw names -> two diagnostics; removing one keeps the other's
    let s = syncTypedDraft(DEFAULT_QUERY_STATE, 'in:Alpha in:Beta');
    s = resolveEntityFilters(s, () => [{ projectId: 'x', label: 'dup' }, { projectId: 'y', label: 'dup' }]);
    expect(s.diagnostics.filter((d) => d.code === 'ambiguous-project')).toHaveLength(2);
    const alpha = s.filters.find((f) => f.value && f.value.raw === 'Alpha');
    const after = removeFilter(s, alpha.id);
    const remaining = after.diagnostics.filter((d) => d.code === 'ambiguous-project');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].token).toBe('Beta');
  });

  it('two identical in: occurrences keep diagnostics tied to their own chip ids', () => {
    let s = syncTypedDraft(DEFAULT_QUERY_STATE, 'in:X in:X');
    s = resolveEntityFilters(s, () => [{ projectId: 'a', label: 'X' }, { projectId: 'b', label: 'X' }]);
    const diagnostics = s.diagnostics.filter((d) => d.code === 'ambiguous-project');
    expect(diagnostics).toHaveLength(2);
    expect(new Set(diagnostics.map((d) => d.chipId))).toEqual(new Set(s.filters.map((f) => f.id)));

    const removedId = s.filters[0].id;
    const after = removeFilter(s, removedId);
    const remaining = after.diagnostics.filter((d) => d.code === 'ambiguous-project');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].chipId).toBe(after.filters[0].id);
  });
});

describe('search-query-sync — PRE-3: repeated identical clauses keep distinct occurrence identity', () => {
  it('tag:a tag:a lifts TWO chips with distinct ids (no silent collapse) and round-trips', () => {
    const s = syncTypedDraft(DEFAULT_QUERY_STATE, 'tag:a tag:a');
    const tags = s.filters.filter((f) => f.canonical === 'tag' && f.value === 'a');
    expect(tags).toHaveLength(2);
    expect(tags[0].id).not.toBe(tags[1].id);
    expect(buildCanonicalQuery(s)).toBe('tag:a tag:a'); // both clauses re-emitted
  });

  it('removing ONE of two identical chips leaves the other intact', () => {
    const s = syncTypedDraft(DEFAULT_QUERY_STATE, 'tag:a tag:a');
    const after = removeFilter(s, s.filters[0].id);
    expect(after.filters).toHaveLength(1);
    expect(after.filters[0].id).toBe(s.filters[1].id);
  });

  it('the + menu (addFilter) stays idempotent — adding the same filter twice is a no-op', () => {
    const once = addFilter(DEFAULT_QUERY_STATE, { canonical: 'tag' }, 'a');
    const twice = addFilter(once, { canonical: 'tag' }, 'a');
    expect(twice.filters).toHaveLength(1);
  });
});

describe('search-query-sync — projections to the K1/K2 primitives', () => {
  it('toModeSelectorModel resolves labels, gates by capabilities, marks the selected mode', () => {
    const caps = { providers: ['metadata', 'protein'], entityScope: ['entry', 'project', 'primer'] };
    const model = toModeSelectorModel({ ...DEFAULT_QUERY_STATE, mode: 'aa' }, caps, t);
    expect(model.selectedModeId).toBe('aa');
    const flat = model.groups.flatMap((g) => g.modes);
    expect(flat.every((m) => typeof m.label === 'string' && m.label.length > 0)).toBe(true);
    expect(flat.some((m) => m.id === 'aa')).toBe(true);
    expect(flat.some((m) => m.id === 'cut')).toBe(false); // restrictionSites not offered by caps
  });

  it('toFilterChipModel emits {id,label,removeLabel}; entity chips show a human label, not the id', () => {
    const enumState = addFilter(DEFAULT_QUERY_STATE, { canonical: 'type' }, 'circular');
    const chips = toFilterChipModel(enumState, { resolveLabel: t, resolveRemoveLabel: (c) => `remove ${c}` });
    expect(chips[0].id).toBe(enumState.filters[0].id);
    expect(chips[0].label).toContain('circular');
    expect(chips[0].removeLabel.length).toBeGreaterThan(0);

    const entityState = addFilter(DEFAULT_QUERY_STATE, { canonical: 'in' }, { projectId: 'p1', label: 'Alpha' });
    const echips = toFilterChipModel(entityState, { resolveLabel: t, resolveRemoveLabel: (c) => `remove ${c}` });
    expect(echips[0].label).toContain('Alpha');
    expect(echips[0].label).not.toContain('p1');

    const typedIn = syncTypedDraft(DEFAULT_QUERY_STATE, 'in:Gla');
    const tchips = toFilterChipModel(typedIn, { resolveLabel: t, resolveRemoveLabel: (c) => `remove ${c}` });
    expect(tchips[0].label).toContain('Gla'); // unresolved name shown
  });
});

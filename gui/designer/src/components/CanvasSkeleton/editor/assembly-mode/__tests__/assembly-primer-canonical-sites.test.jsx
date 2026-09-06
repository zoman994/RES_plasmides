import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  cleanup, render, renderHook, screen, waitFor,
} from '@testing-library/react';

import SequenceTab from '../../../../Library/inspector/tabs/SequenceTab';
import {
  buildPrimerFromSelection, documentIdentityOf,
} from '../../../../../lib/primer-live-workflow';
import { attachKnownPrimerSite } from '../../../../../lib/primer-known-placement';
import { projectPrimerPool } from '../../../../../lib/primer-site-projection';
import { migrateSnapshot } from '../../../store/skeleton-persistence';
import { buildInitialState, skeletonReducer } from '../../../store/skeleton-state';
import { useAssemblyPrimerWriting } from '../useAssemblyPrimerWriting';
import {
  assemblyPrimerSiteRepairPatch,
  canonicalAssemblyPrimerForDocument,
} from '../../../lib/assembly-primer-site';

const { addPrimerToPool, storeState } = vi.hoisted(() => {
  const add = vi.fn(() => Promise.resolve());
  return {
    addPrimerToPool: add,
    storeState: {
      addPrimerToPool: add,
      currentProjectId: null,
      primersById: {},
      searchHits: null,
    },
  };
});

vi.mock('../../../../../store', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useStore: (selector) => selector(storeState),
  };
});

afterEach(() => {
  cleanup();
  addPrimerToPool.mockClear();
  storeState.primersById = {};
});

const ZONE_ID = 'z1';
const LEFT = 'AAAAAAAAAAAAAAAAAAAAAAAACCCCCC';
const RIGHT = 'GATCGTACGATTCGAGCTAACGTTAGCATC';
const TEMPLATE = `${LEFT}${RIGHT}`;
const EXPECTED_TAIL = 'CCCCCC';
const DAMAGED_BINDING = 'GATCGTAAGATTCGAGCTAA';
const DAMAGED_OLIGO = `${EXPECTED_TAIL}${DAMAGED_BINDING}`;
const DOCUMENT_HASH = documentIdentityOf({ sequence: TEMPLATE, topology: 'linear' });
const BOUNDARIES = [
  { segmentId: 'p-a', startOnAssembly: 0, endOnAssembly: 30 },
  { segmentId: 'p-b', startOnAssembly: 30, endOnAssembly: 60 },
];

function damagedV12Snapshot() {
  return {
    containers: [],
    assemblyDrafts: [],
    zones: [{
      id: ZONE_ID,
      name: 'P10 parity',
      topology: { circular: false },
      assemblyMethod: 'overlap_pcr',
      junctions: {
        'p-a__p-b': {
          method: 'overlap_pcr',
          overlapTarget: 'right',
          overlapLength: 6,
          overlapTm: null,
          bindingLength: 20,
          bindingTm: null,
        },
      },
    }],
    pieces: [
      {
        id: 'p-a', zoneId: ZONE_ID, kind: 'synthesis', sequence: LEFT,
        name: 'left', createdAt: 1, mutations: [],
      },
      {
        id: 'p-b', zoneId: ZONE_ID, kind: 'synthesis', sequence: RIGHT,
        name: 'right', createdAt: 2, mutations: [],
      },
    ],
    operations: [],
    junctions: [],
    assemblyDraftPrimers: {
      [ZONE_ID]: [{
        id: 'legacy-damaged',
        draftId: ZONE_ID,
        pairId: 'pair-legacy',
        name: 'legacy damaged',
        label: 'legacy damaged',
        direction: 'forward',
        sequence: DAMAGED_OLIGO,
        bindingSequence: DAMAGED_OLIGO,
        tail: '',
        range: null,
        autoMode: 'manual',
        status: 'edited',
        source: {
          kind: 'auto-group',
          opGroupId: `zgrp-${ZONE_ID}`,
          pieceId: 'p-b',
          side: 'fwd',
          boundaryAtOffset: 30,
          leftSegmentId: 'p-a',
          rightSegmentId: 'p-b',
        },
      }],
    },
  };
}

function assemblyViewerPrimers(state, draftId = ZONE_ID) {
  return renderHook(() => useAssemblyPrimerWriting({
    draftId,
    sequence: TEMPLATE,
    boundaries: BOUNDARIES,
    caretAnchor: 0,
    caretPos: 0,
    actions: { showToast: vi.fn(), writeAssemblyPrimer: vi.fn() },
    state,
  })).result.current.primers;
}

function reverseDamagedV12Snapshot() {
  const snapshot = damagedV12Snapshot();
  const expectedTail = 'ACGATC';
  const expectedBinding = 'GGGGGGTTTTTTTTTTTTTT';
  const damagedBinding = replaceBase(expectedBinding, 8);
  snapshot.zones[0].junctions['p-a__p-b'].overlapTarget = 'left';
  snapshot.assemblyDraftPrimers[ZONE_ID][0] = {
    ...snapshot.assemblyDraftPrimers[ZONE_ID][0],
    direction: 'reverse',
    sequence: `${expectedTail}${damagedBinding}`,
    bindingSequence: `${expectedTail}${damagedBinding}`,
    source: {
      kind: 'auto-group',
      opGroupId: `zgrp-${ZONE_ID}`,
      pieceId: 'p-a',
      side: 'rev',
      boundaryAtOffset: 30,
      leftSegmentId: 'p-a',
      rightSegmentId: 'p-b',
    },
  };
  return { snapshot, expectedTail, damagedBinding };
}

function renderSequence(primers) {
  render(
    <SequenceTab
      sequence={TEMPLATE}
      annotations={[]}
      topology="linear"
      name="P10 parity"
      entryId={ZONE_ID}
      documentHash={DOCUMENT_HASH}
      primers={primers}
    />,
  );
}

function replaceBase(sequence, index) {
  const next = sequence[index] === 'A' ? 'C' : 'A';
  return `${sequence.slice(0, index)}${next}${sequence.slice(index + 1)}`;
}

function projected(primer) {
  return projectPrimerPool([primer], {
    template: TEMPLATE,
    topology: 'linear',
    entryId: ZONE_ID,
    documentHash: DOCUMENT_HASH,
  });
}

function alignmentTotals(occurrence) {
  return occurrence.alignment.runs.reduce((out, run) => ({
    ...out,
    [run.op]: (out[run.op] || 0) + (run.queryEnd - run.queryStart),
  }), {});
}

describe('P10 canonical primer sites — persisted Assembly/Library parity', () => {
  it('repairs a provable stale auto-group anchor before one X can hide the primer', async () => {
    const start = 30;
    const end = 50;
    const exact = TEMPLATE.slice(start, end);
    const mismatched = replaceBase(exact, 8);
    const legacy = attachKnownPrimerSite({
      id: 'legacy-stale-target',
      draftId: ZONE_ID,
      name: 'legacy stale target',
      label: 'legacy stale target',
      direction: 'forward',
      sequence: mismatched,
      bindingSequence: mismatched,
      bindingModel: 'aligned-v1',
      bindingTargetLength: end - start,
      tail: '',
      range: null,
      source: {
        kind: 'auto-group', pieceId: 'p-b', side: 'fwd',
        boundaryAtOffset: 30, leftSegmentId: 'p-a', rightSegmentId: 'p-b',
      },
      autoMode: 'manual',
      status: 'edited',
    }, {
      entryId: 'legacy-zone-id',
      documentHash: 'legacy-document-hash',
      topology: 'linear',
      template: TEMPLATE,
      start,
      end,
    });
    const state = {
      assemblyDraftPrimers: { [ZONE_ID]: [legacy] },
    };
    const updateAssemblyPrimer = vi.fn();
    const { result } = renderHook(() => useAssemblyPrimerWriting({
      draftId: ZONE_ID,
      sequence: TEMPLATE,
      topology: 'linear',
      boundaries: BOUNDARIES,
      caretAnchor: 0,
      caretPos: 0,
      actions: {
        showToast: vi.fn(), writeAssemblyPrimer: vi.fn(), updateAssemblyPrimer,
      },
      state,
    }));

    expect(result.current.primers).toHaveLength(1);
    expect(result.current.primers[0].id).toBe(legacy.id);
    renderSequence(result.current.primers);
    const glyph = screen.getByTestId('sequence-view-primer');
    expect(glyph.dataset.primerId).toBe(legacy.id);
    expect(glyph.querySelector('[data-primer-alignment-op="X"]')).not.toBeNull();
    await waitFor(() => expect(updateAssemblyPrimer).toHaveBeenCalledTimes(1));
    const [, repairedId, patch] = updateAssemblyPrimer.mock.calls[0];
    expect(repairedId).toBe(legacy.id);
    expect(patch.sites).toEqual(result.current.primers[0].sites);
    await waitFor(() => expect(addPrimerToPool).toHaveBeenCalled());
    const poolWrite = addPrimerToPool.mock.calls
      .map(([payload]) => payload)
      .find((payload) => payload?.origin?.draftPrimerId === legacy.id);
    expect(poolWrite.primer.sites.some((site) => (
      site.target.entryId === ZONE_ID && site.target.resourceHash === DOCUMENT_HASH
    ))).toBe(true);
  });

  it('does not mint a current source site without exact owner and source geometry proof', () => {
    const base = {
      id: 'unproved-anchor',
      draftId: ZONE_ID,
      direction: 'forward',
      sequence: DAMAGED_BINDING,
      bindingSequence: DAMAGED_BINDING,
      bindingModel: 'aligned-v1',
      bindingTargetLength: 20,
      tail: '',
      autoMode: 'manual',
      status: 'edited',
      sites: [],
    };
    const context = {
      entryId: ZONE_ID,
      template: TEMPLATE,
      topology: 'linear',
      boundaries: BOUNDARIES,
    };
    const unproved = [
      {
        ...base,
        draftId: 'other-draft',
        source: { kind: 'auto-group', pieceId: 'p-b', side: 'fwd' },
      },
      {
        ...base,
        source: { kind: 'auto-group', pieceId: 'removed-piece', side: 'fwd' },
      },
      {
        ...base,
        direction: 'reverse',
        source: { kind: 'auto-group', pieceId: 'p-b', side: 'fwd' },
      },
      {
        ...base,
        range: { start: 20, end: 40 },
        source: { kind: 'segment', segmentId: 'p-a' },
      },
      {
        ...base,
        range: { start: 20, end: 40 },
        source: {
          kind: 'boundary', boundaryAtOffset: 30,
          leftSegmentId: 'wrong-left', rightSegmentId: 'p-b',
        },
      },
    ];

    for (const primer of unproved) {
      expect(canonicalAssemblyPrimerForDocument(primer, context)).toBe(primer);
      expect(assemblyPrimerSiteRepairPatch(primer, context)).toBeNull();
    }
  });

  it('repairs the proven v12 split and keeps its one-X landing visible through Assembly SequenceTab', () => {
    const migrated = migrateSnapshot(damagedV12Snapshot(), 12);
    const repaired = migrated.assemblyDraftPrimers[ZONE_ID][0];
    const viewerPrimers = assemblyViewerPrimers(migrated);

    renderSequence(viewerPrimers);

    const glyph = screen.queryByTestId('sequence-view-primer');
    expect(glyph).not.toBeNull();
    expect(glyph.dataset.primerEvidence).toBe('source');
    expect(glyph.dataset.primerSpan).toBe('24-50');
    expect(glyph.querySelector('[data-primer-alignment-op="X"]')).not.toBeNull();

    expect(repaired.tail).toBe(EXPECTED_TAIL);
    expect(repaired.bindingSequence).toBe(DAMAGED_BINDING);
    expect(repaired.bindingTargetLength).toBe(20);
    expect(repaired.sites).toHaveLength(1);
    const [occurrence] = projected(repaired);
    expect(occurrence.evidence).toBe('source');
    expect(occurrence).toMatchObject({
      segments: [{ start: 24, end: 50 }],
      tail: null,
      unpairedPrefixLength: 0,
      annealedSequence: DAMAGED_OLIGO,
    });
    expect(alignmentTotals(occurrence)).toMatchObject({ M: 25, X: 1 });
  });

  it('feeds the same canonical record to Assembly and Library after two substitutions', async () => {
    const migrated = migrateSnapshot(damagedV12Snapshot(), 12);
    const repaired = migrated.assemblyDraftPrimers[ZONE_ID][0];
    const twiceEditedBinding = replaceBase(repaired.bindingSequence, 12);
    const edited = {
      ...repaired,
      bindingSequence: twiceEditedBinding,
      sequence: `${repaired.tail}${twiceEditedBinding}`,
    };
    const state = {
      ...migrated,
      assemblyDraftPrimers: { [ZONE_ID]: [edited] },
    };
    const assemblyPrimers = assemblyViewerPrimers(state);

    await waitFor(() => expect(addPrimerToPool).toHaveBeenCalled());
    expect(addPrimerToPool.mock.calls.at(-1)[0].primer.sites).toEqual(edited.sites);
    expect(assemblyPrimers[0].sites).toEqual(edited.sites);
    expect(alignmentTotals(projected(assemblyPrimers[0])[0])).toMatchObject({ M: 24, X: 2 });

    renderSequence(assemblyPrimers);
    const assemblyGlyph = screen.getByTestId('sequence-view-primer');
    const assemblyShape = {
      evidence: assemblyGlyph.dataset.primerEvidence,
      span: assemblyGlyph.dataset.primerSpan,
    };
    expect(assemblyGlyph.querySelector('[data-primer-alignment-op="X"]')).not.toBeNull();

    cleanup();
    renderSequence([edited]);
    const libraryGlyph = screen.getByTestId('sequence-view-primer');
    expect({
      evidence: libraryGlyph.dataset.primerEvidence,
      span: libraryGlyph.dataset.primerSpan,
    }).toEqual(assemblyShape);
    expect(libraryGlyph.querySelector('[data-primer-alignment-op="X"]')).not.toBeNull();
  });

  it('keeps a terminal X visible while the shared 10-nt guard marks it non-annealing', () => {
    const migrated = migrateSnapshot(damagedV12Snapshot(), 12);
    const repaired = migrated.assemblyDraftPrimers[ZONE_ID][0];
    const terminalBinding = replaceBase(repaired.bindingSequence, repaired.bindingSequence.length - 1);
    const edited = {
      ...repaired,
      bindingSequence: terminalBinding,
      sequence: `${repaired.tail}${terminalBinding}`,
    };
    renderSequence([edited]);
    const glyph = screen.getByTestId('sequence-view-primer');
    expect(glyph.querySelector('[data-primer-alignment-op="X"]')).not.toBeNull();
    expect(glyph.dataset.primerAnnealingStatus).toBe('non-annealing');
  });

  it('preserves foreign sites, repairs legacy 2+X, and refuses ambiguous geometry', () => {
    const foreignSite = {
      id: 'foreign-site',
      target: { entryId: 'other', resourceHash: 'other-hash', topology: 'linear' },
      location: { kind: 'single', segments: [{ start: 1, end: 21 }] },
      strand: 1,
      annealedSequence: 'AAAAAAAAAAAAAAAAAAAA',
    };
    const withForeign = damagedV12Snapshot();
    withForeign.assemblyDraftPrimers[ZONE_ID][0].sites = [foreignSite];
    const repaired = migrateSnapshot(withForeign, 12).assemblyDraftPrimers[ZONE_ID][0];
    expect(repaired.sites).toHaveLength(2);
    expect(repaired.sites[0]).toEqual(foreignSite);
    expect(repaired.sites[1].target.entryId).toBe(ZONE_ID);

    const multiMismatch = damagedV12Snapshot();
    const multiPrimer = multiMismatch.assemblyDraftPrimers[ZONE_ID][0];
    const twiceDamagedBinding = replaceBase(DAMAGED_BINDING, 12);
    multiPrimer.sequence = `${EXPECTED_TAIL}${twiceDamagedBinding}`;
    multiPrimer.bindingSequence = multiPrimer.sequence;
    const repairedMulti = migrateSnapshot(multiMismatch, 12).assemblyDraftPrimers[ZONE_ID][0];
    expect(repairedMulti.tail).toBe(EXPECTED_TAIL);
    expect(repairedMulti.bindingSequence).toBe(twiceDamagedBinding);
    expect(repairedMulti.sites).toHaveLength(1);
    expect(alignmentTotals(projected(repairedMulti)[0])).toMatchObject({ M: 24, X: 2 });

    const ambiguous = damagedV12Snapshot();
    ambiguous.pieces.push({ ...ambiguous.pieces[1], createdAt: 3 });
    const withheld = migrateSnapshot(ambiguous, 12).assemblyDraftPrimers[ZONE_ID][0];
    expect(withheld.tail).toBe('');
    expect(withheld.sites).toBeUndefined();
  });

  it('repairs reverse legacy geometry and is idempotent', () => {
    const { snapshot, expectedTail, damagedBinding } = reverseDamagedV12Snapshot();
    const once = migrateSnapshot(snapshot, 12);
    const repaired = once.assemblyDraftPrimers[ZONE_ID][0];
    expect(repaired.tail).toBe(expectedTail);
    expect(repaired.bindingSequence).toBe(damagedBinding);
    expect(repaired.sites[0]).toMatchObject({
      target: { entryId: ZONE_ID, resourceHash: DOCUMENT_HASH },
      location: { kind: 'single', segments: [{ start: 10, end: 30 }] },
      strand: -1,
    });
    expect(migrateSnapshot(once, 12)).toEqual(once);
  });

  it('refuses damaged signatures that do not prove owner, strand, alphabet, length, or current geometry', () => {
    const cases = [];
    const wrongDraft = damagedV12Snapshot();
    wrongDraft.assemblyDraftPrimers[ZONE_ID][0].draftId = 'other-draft';
    cases.push(wrongDraft);

    const wrongSide = damagedV12Snapshot();
    wrongSide.assemblyDraftPrimers[ZONE_ID][0].source.side = 'rev';
    cases.push(wrongSide);

    const invalidDna = damagedV12Snapshot();
    invalidDna.assemblyDraftPrimers[ZONE_ID][0].sequence = `${EXPECTED_TAIL}${DAMAGED_BINDING.slice(0, -1)}Z`;
    invalidDna.assemblyDraftPrimers[ZONE_ID][0].bindingSequence = invalidDna.assemblyDraftPrimers[ZONE_ID][0].sequence;
    cases.push(invalidDna);

    const wrongTargetLength = damagedV12Snapshot();
    wrongTargetLength.assemblyDraftPrimers[ZONE_ID][0].bindingTargetLength = 19;
    cases.push(wrongTargetLength);

    const splitConflict = damagedV12Snapshot();
    splitConflict.assemblyDraftPrimers[ZONE_ID][0].bindingSequence = `${EXPECTED_TAIL}${DAMAGED_BINDING.slice(1)}A`;
    cases.push(splitConflict);

    const conflictingCurrentSite = damagedV12Snapshot();
    const primer = conflictingCurrentSite.assemblyDraftPrimers[ZONE_ID][0];
    primer.sites = [{
      id: 'conflicting-current',
      target: { entryId: ZONE_ID, resourceHash: DOCUMENT_HASH, topology: 'linear' },
      location: { kind: 'single', segments: [{ start: 31, end: 51 }] },
      strand: 1,
      annealedSequence: RIGHT.slice(1, 21),
    }];
    cases.push(conflictingCurrentSite);

    for (const snapshot of cases) {
      const refused = migrateSnapshot(snapshot, 12).assemblyDraftPrimers[ZONE_ID][0];
      expect(refused.tail).toBe('');
      expect(refused.bindingSequence).toBe(snapshot.assemblyDraftPrimers[ZONE_ID][0].bindingSequence);
      expect(refused.sites).toEqual(snapshot.assemblyDraftPrimers[ZONE_ID][0].sites);
    }
  });

  it('keeps unrelated same-entry loci and versions while replacing only the same generated site', () => {
    const migrated = migrateSnapshot(damagedV12Snapshot(), 12);
    const primer = migrated.assemblyDraftPrimers[ZONE_ID][0];
    const otherLocus = {
      id: 'manual-other-locus',
      target: { entryId: ZONE_ID, resourceHash: DOCUMENT_HASH, topology: 'linear' },
      location: { kind: 'single', segments: [{ start: 5, end: 25 }] },
      strand: 1,
      annealedSequence: TEMPLATE.slice(5, 25),
      sourceForms: ['manual-import'],
    };
    const withOther = { ...primer, sites: [otherLocus] };
    const first = attachKnownPrimerSite(withOther, {
      entryId: ZONE_ID, documentHash: DOCUMENT_HASH, topology: 'linear',
      template: TEMPLATE, start: 30, end: 50,
    });
    const second = attachKnownPrimerSite(first, {
      entryId: ZONE_ID, documentHash: 'next-version', topology: 'linear',
      template: TEMPLATE, start: 30, end: 50,
    });
    const repeated = attachKnownPrimerSite(second, {
      entryId: ZONE_ID, documentHash: 'next-version', topology: 'linear',
      template: TEMPLATE, start: 30, end: 50,
    });
    expect(first.sites).toContainEqual(otherLocus);
    expect(second.sites).toContainEqual(otherLocus);
    expect(new Set(second.sites.map((site) => site.id)).size).toBe(second.sites.length);
    expect(second.sites.at(-1).id).not.toBe(first.sites.at(-1).id);
    expect(repeated.sites).toHaveLength(second.sites.length);
  });

  it('persists a canonical source site when WRITE_ASSEMBLY_PRIMER creates a manual primer', () => {
    const base = buildInitialState();
    const state = {
      ...base,
      zones: [{ id: ZONE_ID, name: 'manual', topology: { circular: false } }],
      pieces: [{
        id: 'p-manual', zoneId: ZONE_ID, kind: 'synthesis', sequence: RIGHT,
        name: 'manual piece', createdAt: 1, mutations: [],
      }],
      assemblyDraftPrimers: {},
    };
    const next = skeletonReducer(state, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: ZONE_ID,
      range: { start: 0, end: 20 },
      direction: 'forward',
    });
    const primer = next.assemblyDraftPrimers[ZONE_ID][0];
    expect(primer.bindingTargetLength).toBe(20);
    expect(primer.sites).toHaveLength(1);
    expect(primer.sites[0]).toMatchObject({
      target: { entryId: ZONE_ID, topology: 'linear' },
      location: { kind: 'single', segments: [{ start: 0, end: 20 }] },
      strand: 1,
    });
    expect(projectPrimerPool([primer], {
      template: RIGHT,
      topology: 'linear',
      entryId: ZONE_ID,
      documentHash: documentIdentityOf({ sequence: RIGHT, topology: 'linear' }),
    })).toHaveLength(1);
  });

  it.each([
    ['forward', { start: 20, end: 30 }, 1],
    ['reverse', { start: 30, end: 40 }, -1],
  ])('persists the %s junction binding footprint and keeps it through an edit', (direction, footprint, strand) => {
    const base = buildInitialState();
    const fixture = damagedV12Snapshot();
    let state = {
      ...base,
      zones: fixture.zones,
      pieces: fixture.pieces,
      assemblyDraftPrimers: {},
    };
    state = skeletonReducer(state, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: ZONE_ID,
      range: { start: 20, end: 40 },
      direction,
    });
    const primer = state.assemblyDraftPrimers[ZONE_ID][0];
    expect(primer.source.kind).toBe('boundary');
    expect(primer.sites[0]).toMatchObject({
      location: { kind: 'single', segments: [footprint] },
      strand,
    });
    expect(projected(primer)).toHaveLength(1);

    const editedBinding = replaceBase(primer.bindingSequence, 2);
    state = skeletonReducer(state, {
      type: 'WRITE_ASSEMBLY_PRIMER',
      draftId: ZONE_ID,
      primerId: primer.id,
      range: { start: 20, end: 40 },
      direction,
      tail: primer.tail,
      binding: editedBinding,
      sequence: `${primer.tail}${editedBinding}`,
    });
    const edited = state.assemblyDraftPrimers[ZONE_ID].find((item) => item.id === primer.id);
    expect(edited.sites).toEqual(primer.sites);
    expect(projected(edited)).toHaveLength(1);
  });

  it('unions sites into the same physical pool row for same-draft edits and a second draft', async () => {
    const migrated = migrateSnapshot(damagedV12Snapshot(), 12);
    const primer = migrated.assemblyDraftPrimers[ZONE_ID][0];
    const foreignSite = {
      id: 'pool-foreign',
      target: { entryId: 'foreign', resourceHash: 'foreign-hash', topology: 'linear' },
      location: { kind: 'single', segments: [{ start: 0, end: 20 }] },
      strand: 1,
      annealedSequence: 'AAAAAAAAAAAAAAAAAAAA',
    };
    const poolId = `asm-${ZONE_ID}-${primer.id}`;
    storeState.primersById = {
      [poolId]: {
        ...primer,
        id: poolId,
        sites: [foreignSite],
        origin: { kind: 'assembly-derived', draftId: ZONE_ID, draftPrimerId: primer.id },
      },
    };
    assemblyViewerPrimers(migrated);
    await waitFor(() => expect(addPrimerToPool).toHaveBeenCalledTimes(1));
    expect(addPrimerToPool.mock.calls[0][0].primer.sites).toEqual([
      foreignSite, ...primer.sites,
    ]);

    cleanup();
    addPrimerToPool.mockClear();
    const secondDraft = 'z2';
    const secondPrimer = attachKnownPrimerSite({
      ...primer, id: 'second-draft-primer', draftId: secondDraft, sites: [],
    }, {
      entryId: secondDraft,
      documentHash: DOCUMENT_HASH,
      topology: 'linear',
      template: TEMPLATE,
      start: 30,
      end: 50,
    });
    const secondState = {
      ...migrated,
      assemblyDraftPrimers: { [secondDraft]: [secondPrimer] },
    };
    storeState.primersById = {
      [poolId]: {
        ...primer,
        id: poolId,
        origin: { kind: 'assembly-derived', draftId: ZONE_ID, draftPrimerId: primer.id },
      },
    };
    assemblyViewerPrimers(secondState, secondDraft);
    await waitFor(() => expect(addPrimerToPool).toHaveBeenCalledTimes(1));
    const upsert = addPrimerToPool.mock.calls[0][0].primer;
    expect(upsert.id).toBe(poolId);
    expect(upsert.sites).toEqual([...primer.sites, ...secondPrimer.sites]);
  });

  it('selection constructor emits the shared site shape, including circular joins', () => {
    const record = buildPrimerFromSelection({
      template: TEMPLATE,
      topology: 'circular',
      start: 55,
      end: 65,
      direction: 'forward',
      entryId: ZONE_ID,
      documentHash: DOCUMENT_HASH,
      id: 'selection-primer',
    });
    expect(record.sites).toHaveLength(1);
    expect(record.sites[0]).toMatchObject({
      target: { entryId: ZONE_ID, resourceHash: DOCUMENT_HASH, topology: 'circular' },
      location: { kind: 'join', segments: [{ start: 55, end: 60 }, { start: 0, end: 5 }] },
      strand: 1,
      sourceForms: ['designed'],
    });
    expect(record.sites[0].id).toMatch(/selection-primer.*z1/i);
  });
});

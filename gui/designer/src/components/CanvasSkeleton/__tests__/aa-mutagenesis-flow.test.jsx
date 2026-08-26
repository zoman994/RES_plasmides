import 'fake-indexeddb/auto';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';
import { bootstrapStore, useStore } from '../../../store';
import { segmentBoundaries } from '../lib/assembly-model';
import { deriveMutationMechanism } from '../lib/mutation-to-mechanism';
import { buildInitialState, skeletonReducer } from '../store/skeleton-state';
import {
  prepareAAMutagenesisCommit,
  resolveAASelectionToPiece,
} from '../store/skeleton-state-aa-mutagenesis';

afterEach(cleanup);

beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  useStore.setState((state) => ({
    displaySettings: { ...state.displaySettings, framesMode: 'single' },
  }));
});

const TEMPLATE = `ATG${'ACG'.repeat(99)}AAA${'TGC'.repeat(99)}TAA`;
const SELECTION = {
  aa: 'K', codon: 'AAA', aaIndex: 101, strand: 1, frame: 0,
  regionId: 'cds-1', genomicPositions: [300, 301, 302], displayAnchor: 301,
};

const SOURCE_PIECE = {
  id: 'piece-parent', kind: 'sourced', name: 'parent', sourceIds: ['container-1'],
  ranges: [{ sourceId: 'container-1', start: 0, end: TEMPLATE.length, orientation: 'forward' }],
  mutations: [], zoneId: 'draft-1', order: 0, createdAt: 1, updatedAt: 1,
};

function draft(topology = 'circular') {
  return {
    id: 'draft-1', name: 'AA construct', topology: { circular: topology === 'circular' },
    segments: [{
      id: SOURCE_PIECE.id,
      source: { type: 'container', containerId: 'container-1' },
      sequence: TEMPLATE,
      length: TEMPLATE.length,
      annotations: [],
    }],
  };
}

function state() {
  return {
    ...buildInitialState(),
    containers: [{ id: 'container-1', name: 'parent', sequence: TEMPLATE, topology: { circular: true } }],
    pieces: [SOURCE_PIECE],
    zones: [{ id: 'draft-1', name: 'AA construct', topology: { circular: true } }],
    operations: [],
    assemblyDraftPrimers: { 'draft-1': [] },
  };
}

describe('AA click → assembly mutagenesis vertical flow', () => {
  it('threads the exact codon payload through real SequenceTab → SequenceView → SequenceLine', async () => {
    const onAAClick = vi.fn();
    render(
      <SequenceTab
        sequence="ATGAAATAA"
        annotations={[{
          id: 'cds-small', type: 'CDS', level: 'region', start: 0, end: 9, strand: 1,
        }]}
        topology="linear"
        name="small-cds"
        onAAClick={onAAClick}
      />,
    );

    const cells = await screen.findAllByTestId('sequence-view-aa-char');
    fireEvent.click(cells.find((cell) => cell.dataset.aa === 'K'));
    expect(onAAClick).toHaveBeenCalledWith(expect.objectContaining({
      aa: 'K', codon: 'AAA', aaIndex: 2, strand: 1,
      genomicPositions: [3, 4, 5], displayAnchor: 4,
    }));
  });

  it('maps a non-contiguous splice codon only when all three bases belong to one piece', () => {
    const assembly = draft();
    const mapped = resolveAASelectionToPiece({
      selection: { ...SELECTION, genomicPositions: [3, 12, 13] },
      boundaries: segmentBoundaries(assembly).boundaries,
      draft: assembly,
      state: state(),
    });
    expect(mapped).toMatchObject({
      sourcePieceId: 'piece-parent',
      localPositions: [3, 12, 13],
      sourceSequence: TEMPLATE,
    });
  });

  it('fails closed when one splice codon crosses piece boundaries', () => {
    const splitDraft = {
      id: 'draft-1', topology: { circular: true }, segments: [
        { id: 'piece-a', sequence: TEMPLATE.slice(0, 10), length: 10 },
        { id: 'piece-b', sequence: TEMPLATE.slice(10), length: TEMPLATE.length - 10 },
      ],
    };
    const boundaries = segmentBoundaries(splitDraft).boundaries;
    const selection = { ...SELECTION, genomicPositions: [9, 10, 11] };
    expect(resolveAASelectionToPiece({
      selection, boundaries, draft: splitDraft, state: state(),
    })).toBeNull();
    expect(prepareAAMutagenesisCommit({
      state: state(), draft: splitDraft, boundaries, selection, targetAA: 'E',
    })).toBeNull();
  });

  it('keeps a near non-contiguous two-edit codon when both substitutions are explicit in one primer site', () => {
    const bases = Array.from({ length: 100 }, () => 'C');
    for (const position of [3, 5, 6]) bases[position] = 'A';
    const template = bases.join('');
    const sourcePiece = {
      ...SOURCE_PIECE,
      ranges: [{ sourceId: 'container-1', start: 0, end: template.length, orientation: 'forward' }],
    };
    const assembly = {
      id: 'draft-1', topology: { circular: true }, segments: [{
        id: sourcePiece.id, source: { type: 'container', containerId: 'container-1' },
        sequence: template, length: template.length, annotations: [],
      }],
    };
    const before = {
      ...state(),
      containers: [{ id: 'container-1', sequence: template, topology: { circular: true } }],
      pieces: [sourcePiece],
    };
    let serial = 0;
    const tx = prepareAAMutagenesisCommit({
      state: before,
      draft: assembly,
      boundaries: segmentBoundaries(assembly).boundaries,
      selection: {
        aa: 'K', codon: 'AAA', aaIndex: 2, strand: 1, frame: 0,
        regionId: 'splice-near', genomicPositions: [3, 5, 6], displayAnchor: 5,
      },
      targetAA: 'D',
      idGen: () => `near-${serial += 1}`,
    });

    expect(tx).not.toBeNull();
    const forward = tx.primers.find((primer) => primer.direction === 'forward');
    const site = forward.sites[0];
    const targetCoordinates = site.location.segments.flatMap(({ start, end }) => (
      Array.from({ length: end - start }, (_, offset) => start + offset)
    ));
    const substitutionCoordinates = site.alignment.runs
      .filter((run) => run.op === 'X')
      .flatMap((run) => targetCoordinates.slice(run.targetStart, run.targetEnd));
    expect(substitutionCoordinates).toEqual([3, 6]);
  });

  it('uses the production designer, then atomically saves one variant, reaction and canonical pair', () => {
    const before = state();
    const parentSnapshot = structuredClone(before.pieces[0]);
    const assembly = draft();
    let serial = 0;
    const tx = prepareAAMutagenesisCommit({
      state: before,
      draft: assembly,
      boundaries: segmentBoundaries(assembly).boundaries,
      selection: SELECTION,
      targetAA: 'E',
      projectId: 'project-1',
      idGen: () => `aa-${serial += 1}`,
      now: () => 123,
    });

    expect(tx).not.toBeNull();
    const production = deriveMutationMechanism({
      templateSequence: TEMPLATE,
      editorMutations: [{ position: 300, fromBase: 'A', toBase: 'G', label: 'K101E' }],
      fragmentContext: {
        topology: 'circular', isStandalone: true, length: TEMPLATE.length, needsAmplification: true,
      },
    });
    expect(tx.primers.map((primer) => primer.sequence))
      .toEqual(production.plan.primers.map((primer) => primer.sequence));
    expect(tx.primers).toHaveLength(2);
    expect(tx.primers.every((primer) => (
      primer.bindingModel === 'aligned-v1'
      && primer.sequence === `${primer.tail}${primer.bindingSequence}`
      && primer.sites.length === 1
      && primer.sites[0].alignment
    ))).toBe(true);

    const next = skeletonReducer(before, { type: 'COMMIT_AA_MUTAGENESIS', payload: tx });
    expect(next.pieces).toHaveLength(2);
    expect(next.pieces[0]).toEqual(parentSnapshot);
    expect(next.pieces[1]).toMatchObject({ variantOf: SOURCE_PIECE.id });
    expect(next.operations).toHaveLength(1);
    expect(next.operations[0]).toMatchObject({ kind: 'mutagenesis', status: 'committed' });
    expect(next.assemblyDraftPrimers['draft-1']).toHaveLength(2);
    expect(new Set(next.assemblyDraftPrimers['draft-1'].map((primer) => primer.pairId)).size).toBe(1);
  });

  it('fails closed when production returns no physical primer pair', () => {
    const before = state();
    const assembly = draft('linear');
    const tx = prepareAAMutagenesisCommit({
      state: before,
      draft: assembly,
      boundaries: segmentBoundaries(assembly).boundaries,
      selection: SELECTION,
      targetAA: 'E',
    });
    expect(tx).toBeNull();
    expect(skeletonReducer(before, { type: 'COMMIT_AA_MUTAGENESIS', payload: tx })).toBe(before);
  });
});

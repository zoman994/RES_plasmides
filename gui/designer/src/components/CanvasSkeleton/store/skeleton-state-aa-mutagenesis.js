/** Atomic commit boundary for one amino-acid substitution workflow. */

import { translateCodon } from '../../../codons';
import { chooseMutantCodon } from '../../../mutagenesis';
import { reverseComplement } from '../../../sequence-utils';
import { makeId } from '../../../lib/ids';
import { documentIdentityOf } from '../../../lib/primer-live-workflow';
import { deriveAssemblyPrimerRecords } from '../lib/derived-primer-records';
import { deriveMutationMechanism } from '../lib/mutation-to-mechanism';

function uniqueNonEmpty(values) {
  return values.every(Boolean) && new Set(values).size === values.length;
}

// Map coding-order genomic coordinates onto one physical assembly piece. A
// splice may make the positions non-contiguous; crossing a piece boundary is
// not one mutagenesis template and therefore fails closed.
export function resolveAASelectionToPiece({
  selection, boundaries, draft, state,
} = {}) {
  const positions = selection?.genomicPositions;
  if (!Array.isArray(positions) || positions.length !== 3
    || !positions.every(Number.isInteger) || new Set(positions).size !== 3) return null;
  const matching = (Array.isArray(boundaries) ? boundaries : []).filter((boundary) => (
    Number.isInteger(boundary?.startOnAssembly)
    && Number.isInteger(boundary?.endOnAssembly)
    && positions.every((position) => (
      position >= boundary.startOnAssembly && position < boundary.endOnAssembly
    ))
  ));
  if (matching.length !== 1) return null;
  const boundary = matching[0];
  const segment = (draft?.segments || []).find((item) => item?.id === boundary.segmentId);
  const sourcePiece = (state?.pieces || []).find((piece) => piece?.id === boundary.segmentId);
  if (!segment || !sourcePiece || typeof segment.sequence !== 'string' || !segment.sequence) return null;
  const localPositions = positions.map((position) => position - boundary.startOnAssembly);
  if (!localPositions.every((position) => position >= 0 && position < segment.sequence.length)) return null;
  return {
    sourcePieceId: sourcePiece.id,
    sourcePiece,
    segment,
    boundary,
    sourceSequence: segment.sequence.toUpperCase(),
    localPositions,
  };
}

function codingCodon(sourceSequence, localPositions, strand) {
  const topBases = localPositions.map((position) => sourceSequence[position]);
  if (!topBases.every((base) => /^[ACGT]$/.test(base))) return null;
  return strand === -1
    ? topBases.map((base) => reverseComplement(base)).join('')
    : topBases.join('');
}

function editorMutationsFor(sourceSequence, localPositions, strand, toCodon, label) {
  const edits = [];
  for (let i = 0; i < 3; i += 1) {
    const position = localPositions[i];
    const fromBase = sourceSequence[position];
    const toBase = strand === -1 ? reverseComplement(toCodon[i]) : toCodon[i];
    if (fromBase !== toBase) edits.push({ position, fromBase, toBase, label });
  }
  return edits;
}

function siteCoordinatesInPrimerOrientation(site) {
  const segments = site?.location?.segments;
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const topCoordinates = [];
  for (const segment of segments) {
    if (!Number.isInteger(segment?.start) || !Number.isInteger(segment?.end)
      || segment.end <= segment.start) return [];
    for (let position = segment.start; position < segment.end; position += 1) {
      topCoordinates.push(position);
    }
  }
  return site.strand === -1 ? topCoordinates.reverse() : topCoordinates;
}

function primerSiteEncodesSubstitution(primer, edit, coordinateOffset) {
  const query = String(primer?.bindingSequence || '').toUpperCase();
  const expectedCoordinate = coordinateOffset + edit.position;
  const expectedBase = primer?.direction === 'reverse'
    ? reverseComplement(edit.toBase) : String(edit.toBase || '').toUpperCase();
  for (const site of primer?.sites || []) {
    const targetCoordinates = siteCoordinatesInPrimerOrientation(site);
    const targetOffset = targetCoordinates.indexOf(expectedCoordinate);
    if (targetOffset < 0) continue;
    for (const run of site?.alignment?.runs || []) {
      if (run.op !== 'X' || targetOffset < run.targetStart || targetOffset >= run.targetEnd) continue;
      const queryOffset = run.queryStart + (targetOffset - run.targetStart);
      if (query[queryOffset] === expectedBase) return true;
    }
  }
  return false;
}

function primersEncodeEverySubstitution(primers, editorMutations, coordinateOffset) {
  return editorMutations.every((edit) => (
    primerSiteEncodesSubstitution(primers[0], edit, coordinateOffset)
    || primerSiteEncodesSubstitution(primers[1], edit, coordinateOffset)
  ));
}

export function prepareAAMutagenesisCommit({
  state, draft, boundaries, selection, targetAA, targetCodon = null,
  projectId = null, idGen = makeId, now = () => Date.now(),
} = {}) {
  const mapped = resolveAASelectionToPiece({ selection, boundaries, draft, state });
  if (!mapped || !draft?.id) return null;
  const strand = selection?.strand === -1 ? -1 : 1;
  const fromCodon = codingCodon(mapped.sourceSequence, mapped.localPositions, strand);
  const declaredCodon = String(selection?.codon || '').toUpperCase();
  const fromAA = translateCodon(fromCodon || '');
  const declaredAA = String(selection?.aa || '').toUpperCase();
  const toAA = String(targetAA || '').toUpperCase();
  if (!fromCodon || declaredCodon !== fromCodon || declaredAA !== fromAA || !toAA || toAA === fromAA) return null;
  const automatic = chooseMutantCodon(fromCodon, toAA);
  const toCodon = String(targetCodon || automatic?.codon || '').toUpperCase();
  if (!/^[ACGT]{3}$/.test(toCodon) || translateCodon(toCodon) !== toAA) return null;

  const label = `${fromAA}${selection.aaIndex || '?'}${toAA}`;
  const editorMutations = editorMutationsFor(
    mapped.sourceSequence, mapped.localPositions, strand, toCodon, label,
  );
  if (editorMutations.length === 0) return null;
  const circular = !!draft.topology?.circular;
  const isStandalone = (draft.segments || []).length === 1;
  const design = deriveMutationMechanism({
    templateSequence: mapped.sourceSequence,
    editorMutations,
    fragmentContext: {
      topology: circular ? 'circular' : 'linear',
      isStandalone,
      length: mapped.sourceSequence.length,
      needsAmplification: mapped.sourcePiece.needsAmplification !== false,
    },
  });
  const designedPrimers = design?.plan?.primers;
  if ((design?.blockers || []).length > 0 || !Array.isArray(designedPrimers)
    || designedPrimers.length !== 2
    || !designedPrimers.some((primer) => primer.direction === 'forward')
    || !designedPrimers.some((primer) => primer.direction === 'reverse')) return null;

  const timestamp = now();
  const mutation = {
    kind: 'aa-substitution',
    regionId: selection.regionId || null,
    aaIndex: Number.isInteger(selection.aaIndex) ? selection.aaIndex : null,
    strand,
    frame: Number.isInteger(selection.frame) ? selection.frame : null,
    fromAA,
    toAA,
    fromCodon,
    toCodon,
    genomicPositions: [...selection.genomicPositions],
    localPositions: [...mapped.localPositions],
    sourcePieceId: mapped.sourcePieceId,
  };
  const variantId = `piece-${idGen()}`;
  const reactionId = `reaction-${idGen()}`;
  const variant = {
    ...mapped.sourcePiece,
    id: variantId,
    name: `${mapped.sourcePiece.name || 'variant'} ${label}`,
    zoneId: null,
    order: null,
    variantOf: mapped.sourcePieceId,
    mutations: [...(mapped.sourcePiece.mutations || []), ...editorMutations],
    aaMutation: mutation,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const reaction = {
    id: reactionId,
    kind: 'mutagenesis',
    status: 'committed',
    zoneId: draft.id,
    inputs: [mapped.sourcePieceId],
    outputs: [variantId],
    inputPieces: [mapped.sourcePieceId],
    outputPieces: [variantId],
    createdAt: timestamp,
    updatedAt: timestamp,
    params: {
      mechanism: design.mechanism,
      sourcePieceId: mapped.sourcePieceId,
      variantPieceId: variantId,
      mutation,
      protocol: design.plan.protocol || null,
      warnings: design.plan.warnings || [],
    },
  };
  const topology = circular ? 'circular' : 'linear';
  const documentHash = documentIdentityOf({ sequence: mapped.sourceSequence, topology });
  const anchorPos = mapped.boundary.startOnAssembly + design.mutations[0].dnaPosition;
  const primers = deriveAssemblyPrimerRecords(designedPrimers, {
    draftId: draft.id,
    anchorPos,
    templateSequence: mapped.sourceSequence,
    target: { entryId: draft.id, resourceHash: documentHash, topology },
    reactionId,
    sourcePieceId: mapped.sourcePieceId,
    variantPieceId: variantId,
    provenance: {
      kind: 'aa-mutagenesis', projectId, assemblyId: draft.id, mechanism: design.mechanism,
    },
    idGen,
    now,
  });
  if (primers.length !== 2) return null;
  const coordinateOffset = Number.isInteger(mapped.boundary.startOnAssembly)
    ? mapped.boundary.startOnAssembly : 0;
  if (!primersEncodeEverySubstitution(primers, editorMutations, coordinateOffset)) return null;
  return {
    draftId: draft.id,
    sourcePieceId: mapped.sourcePieceId,
    mutation,
    variant,
    reaction,
    primers,
  };
}

export function commitAAMutagenesis(state, payload = {}) {
  if (!payload || typeof payload !== 'object') return state;
  const {
    draftId, sourcePieceId, mutation, variant, reaction, primers,
  } = payload;
  const pieces = Array.isArray(state?.pieces) ? state.pieces : [];
  const operations = Array.isArray(state?.operations) ? state.operations : [];
  const existingPrimers = state?.assemblyDraftPrimers?.[draftId] || [];
  const source = pieces.find((piece) => piece?.id === sourcePieceId);

  if (!draftId || !source || !mutation || mutation.kind !== 'aa-substitution') return state;
  if (!variant?.id || variant.variantOf !== sourcePieceId || variant.aaMutation !== mutation) return state;
  if (pieces.some((piece) => piece?.id === variant.id)) return state;
  if (!reaction?.id || reaction.kind !== 'mutagenesis') return state;
  if (operations.some((op) => op?.id === reaction.id)) return state;
  if (!reaction.inputs?.includes(sourcePieceId) || !reaction.outputs?.includes(variant.id)) return state;
  if (reaction.params?.sourcePieceId !== sourcePieceId
    || reaction.params?.variantPieceId !== variant.id
    || reaction.params?.mutation !== mutation) return state;
  if (!Array.isArray(primers) || primers.length !== 2) return state;
  if (!uniqueNonEmpty(primers.map((primer) => primer?.id))) return state;
  if (primers.some((primer) => existingPrimers.some((old) => old?.id === primer.id))) return state;
  if (new Set(primers.map((primer) => primer?.direction)).size !== 2
    || !primers.some((primer) => primer.direction === 'forward')
    || !primers.some((primer) => primer.direction === 'reverse')) return state;
  const primerPairIds = primers.map((primer) => primer?.pairId);
  if (!primerPairIds.every(Boolean) || new Set(primerPairIds).size !== 1) return state;
  const canonical = primers.every((primer) => (
    primer.draftId === draftId
    && primer.reactionId === reaction.id
    && primer.bindingModel === 'aligned-v1'
    && typeof primer.sequence === 'string' && primer.sequence.length > 0
    && primer.sequence === `${primer.tail || ''}${primer.bindingSequence || ''}`
    && Array.isArray(primer.sites) && primer.sites.length > 0
    && primer.source?.sourcePieceId === sourcePieceId
    && primer.source?.variantPieceId === variant.id
    && primer.source?.reactionId === reaction.id
  ));
  if (!canonical) return state;

  return {
    ...state,
    pieces: [...pieces, variant],
    operations: [...operations, reaction],
    assemblyDraftPrimers: {
      ...(state.assemblyDraftPrimers || {}),
      [draftId]: [...existingPrimers, ...primers],
    },
  };
}

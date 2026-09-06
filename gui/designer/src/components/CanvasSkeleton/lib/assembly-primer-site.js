import { documentIdentityOf } from '../../../lib/primer-live-workflow';
import { attachKnownPrimerSite } from '../../../lib/primer-known-placement';

function knownBindingLength(primer) {
  if (Number.isSafeInteger(primer?.bindingTargetLength) && primer.bindingTargetLength > 0) {
    return primer.bindingTargetLength;
  }
  const binding = typeof primer?.bindingSequence === 'string'
    ? primer.bindingSequence
    : primer?.sequence;
  return typeof binding === 'string' && binding.length > 0 ? binding.length : null;
}

function autoSourceBoundaryMatches(source, segmentId, boundaries, topology) {
  const hasRecordedBoundary = [
    source?.boundaryAtOffset,
    source?.leftSegmentId,
    source?.rightSegmentId,
  ].some((value) => value != null);
  if (!hasRecordedBoundary) return true;
  if (!Number.isSafeInteger(source.boundaryAtOffset)
    || !source.leftSegmentId || !source.rightSegmentId
    || !Array.isArray(boundaries) || boundaries.length === 0) return false;
  const leftIndex = boundaries.findIndex((candidate) => (
    candidate?.segmentId === source.leftSegmentId
    && candidate.endOnAssembly === source.boundaryAtOffset
  ));
  const rightIndex = boundaries.findIndex((candidate) => (
    candidate?.segmentId === source.rightSegmentId
  ));
  if (leftIndex < 0 || rightIndex < 0) return false;
  const adjacent = rightIndex === leftIndex + 1
    && boundaries[rightIndex].startOnAssembly === source.boundaryAtOffset;
  const circularClosure = topology === 'circular'
    && leftIndex === boundaries.length - 1
    && rightIndex === 0
    && boundaries[rightIndex].startOnAssembly === 0;
  if (!adjacent && !circularClosure) return false;
  return source.side === 'fwd'
    ? segmentId === source.rightSegmentId
    : segmentId === source.leftSegmentId;
}

function autoGroupFootprint(primer, boundaries, topology) {
  const source = primer?.source;
  if (!['auto-group', 'self-closure'].includes(source?.kind)) return null;
  const expectedSide = primer.direction === 'reverse'
    ? 'rev'
    : (primer.direction === 'forward' ? 'fwd' : null);
  if (!expectedSide || source.side !== expectedSide) return null;
  const segmentId = source.pieceId || source.segmentId;
  const segment = Array.isArray(boundaries)
    ? boundaries.find((boundary) => boundary?.segmentId === segmentId)
    : null;
  const length = knownBindingLength(primer);
  if (!segment || !length
    || !autoSourceBoundaryMatches(source, segmentId, boundaries, topology)) return null;
  const segmentLength = segment.endOnAssembly - segment.startOnAssembly;
  if (!Number.isSafeInteger(segmentLength) || length > segmentLength) return null;
  return primer.direction === 'reverse'
    ? { start: segment.endOnAssembly - length, end: segment.endOnAssembly }
    : { start: segment.startOnAssembly, end: segment.startOnAssembly + length };
}

function segmentFootprint(primer, range, boundaries) {
  const source = primer?.source;
  if (source?.kind !== 'segment') return null;
  const lo = Math.min(range?.start, range?.end);
  const hi = Math.max(range?.start, range?.end);
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || hi <= lo) return null;
  if (Array.isArray(boundaries) && boundaries.length > 0) {
    const segment = boundaries.find((candidate) => candidate?.segmentId === source.segmentId);
    if (!segment || lo < segment.startOnAssembly || hi > segment.endOnAssembly) return null;
  }
  return { start: lo, end: hi };
}

function boundaryFootprint(primer, range, boundaries) {
  const source = primer?.source;
  if (source?.kind !== 'boundary' || !Number.isSafeInteger(source.boundaryAtOffset)) return null;
  const lo = Math.min(range?.start, range?.end);
  const hi = Math.max(range?.start, range?.end);
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || hi <= lo) return null;
  const boundary = source.boundaryAtOffset;
  if (boundary <= lo || boundary >= hi) return null;
  if (Array.isArray(boundaries) && boundaries.length > 0) {
    const leftIndex = boundaries.findIndex((candidate) => (
      candidate?.segmentId === source.leftSegmentId
      && candidate.endOnAssembly === boundary
    ));
    const right = leftIndex >= 0 ? boundaries[leftIndex + 1] : null;
    if (!right || right.segmentId !== source.rightSegmentId
      || right.startOnAssembly !== boundary) return null;
  }
  return primer.direction === 'reverse'
    ? { start: boundary, end: hi }
    : { start: lo, end: boundary };
}

function bindingFootprint(primer, range, boundaries, topology) {
  const automatic = autoGroupFootprint(primer, boundaries, topology);
  if (automatic) return automatic;
  return segmentFootprint(primer, range, boundaries)
    || boundaryFootprint(primer, range, boundaries);
}

function targetKey(target) {
  if (!target?.entryId || !target?.resourceHash) return null;
  return [target.entryId, target.resourceHash, target.topology || 'linear'].join('|');
}

/** Persist only the annealing footprint; a junction overhang is not a landing. */
export function attachAssemblyPrimerSite(primer, {
  entryId, template = '', topology = 'linear', range, boundaries,
} = {}) {
  if (!entryId || primer?.draftId !== entryId) return null;
  const footprint = bindingFootprint(primer, range, boundaries, topology);
  if (!footprint) return null;
  const documentHash = documentIdentityOf({ sequence: template, topology });
  if (!documentHash) return null;
  const placed = attachKnownPrimerSite(primer, {
    entryId,
    documentHash,
    topology,
    template,
    ...footprint,
  });
  if (!placed) return null;
  const currentSite = placed.sites?.at(-1);
  if (!currentSite) return placed;
  const currentTarget = targetKey(currentSite.target);
  return {
    ...placed,
    // An assembly record has one intended source landing per molecule version.
    // Replace conflicting assembly-generated geometry on the current version,
    // while retaining sites from older/foreign versions and other evidence.
    sites: placed.sites.filter((site) => (
      site === currentSite
      || targetKey(site?.target) !== currentTarget
      || !site?.sourceForms?.includes('assembly-draft')
    )),
  };
}

/**
 * Rebuild the current draft landing only when the assembly record itself proves
 * the footprint. This is the single repair owner used by both the viewer and
 * the editor; the generic projector remains fail-closed for foreign/stale sites.
 */
export function canonicalAssemblyPrimerForDocument(primer, context = {}) {
  if (!primer || primer.status === 'stale'
    || !context.entryId || primer.draftId !== context.entryId
    || !Array.isArray(context.boundaries) || context.boundaries.length === 0) return primer;
  const range = context.range || primer.range;
  const placed = attachAssemblyPrimerSite(primer, { ...context, range });
  return placed || primer;
}

/** The one current assembly-generated landing that may drive the edit modal. */
export function currentAssemblyPrimerSites(primer, context = {}) {
  if (!primer || !context.entryId || primer.draftId !== context.entryId) return [];
  const canonical = canonicalAssemblyPrimerForDocument(primer, context);
  const documentHash = documentIdentityOf({
    sequence: context.template || '', topology: context.topology || 'linear',
  });
  if (!documentHash) return [];
  const expectedTarget = targetKey({
    entryId: context.entryId,
    resourceHash: documentHash,
    topology: context.topology || 'linear',
  });
  const matches = (Array.isArray(canonical?.sites) ? canonical.sites : []).filter((site) => (
    targetKey(site?.target) === expectedTarget
    && site?.sourceForms?.includes('assembly-draft')
  ));
  return matches.length ? [matches.at(-1)] : [];
}

/** Replace only the active current landing after an explicit direction flip. */
export function mergeEditedAssemblyPrimerSites(primer, activeSites, editedSites) {
  const activeIds = new Set((activeSites || []).map((site) => site?.id).filter(Boolean));
  const preserved = (Array.isArray(primer?.sites) ? primer.sites : [])
    .filter((site) => !activeIds.has(site?.id));
  return [...preserved, ...(Array.isArray(editedSites) ? editedSites : [])];
}

/** Minimal idempotent state patch for a proven site repair. */
export function assemblyPrimerSiteRepairPatch(primer, context = {}) {
  const canonical = canonicalAssemblyPrimerForDocument(primer, context);
  if (canonical === primer) return null;
  const currentSites = Array.isArray(primer?.sites) ? primer.sites : [];
  const canonicalSites = Array.isArray(canonical?.sites) ? canonical.sites : [];
  if (JSON.stringify(currentSites) === JSON.stringify(canonicalSites)
    && primer.bindingTargetLength === canonical.bindingTargetLength) return null;
  return {
    sites: canonicalSites,
    bindingTargetLength: canonical.bindingTargetLength,
  };
}

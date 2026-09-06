import { reverseComplement } from '../sequence-utils';
import { normalizeOligoSequence } from './primer-identity';

function validSegments(start, end, length, circular) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || !Number.isSafeInteger(length) || length <= 0
    || start < 0 || start >= length || end <= start || end - start > length) return null;
  if (end <= length) return [{ start, end }];
  if (!circular) return null;
  return [{ start, end: length }, { start: 0, end: end - length }];
}

function sourceKey(primer) {
  const source = primer?.source;
  if (!source || !source.kind || !source.pieceId || !source.side) return null;
  return [source.kind, source.opGroupId || '', source.pieceId, source.side].join(':');
}

const DNA_IUPAC = /^[ATGCNRYSWKMBDHV]+$/i;
const SUPPORTED_AUTO_SOURCES = new Set(['auto-group', 'self-closure']);

function strictDna(value, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') return null;
  if (!value) return allowEmpty ? '' : null;
  if (!DNA_IUPAC.test(value)) return null;
  return value.toUpperCase();
}

function safeIdToken(value) {
  return String(value).replace(/[^A-Za-z0-9_-]+/g, '-');
}

function targetKey(target) {
  if (!target?.entryId || !target?.resourceHash) return null;
  return [target.entryId, target.resourceHash, target.topology || 'linear'].join('|');
}

function geometryKey(site) {
  const segments = site?.location?.segments;
  if (!Array.isArray(segments) || segments.length === 0) return null;
  if (segments.some((segment) => !Number.isSafeInteger(segment?.start)
    || !Number.isSafeInteger(segment?.end))) return null;
  return [
    targetKey(site.target), site.location.kind || '',
    segments.map((segment) => `${segment.start}-${segment.end}`).join(','),
    site.strand,
  ].join('|');
}

function generatedSiteKey(site, sourceForm) {
  if (!Array.isArray(site?.sourceForms) || !site.sourceForms.includes(sourceForm)) return null;
  return geometryKey(site);
}

function sameCurrentTarget(site, expectedSite) {
  return targetKey(site?.target) === targetKey(expectedSite?.target);
}

function currentGeometryIsSafe(primer, expectedSite) {
  const current = (Array.isArray(primer?.sites) ? primer.sites : [])
    .filter((site) => sameCurrentTarget(site, expectedSite));
  return current.every((site) => (
    geometryKey(site) === geometryKey(expectedSite)
    && (!site.annealedSequence
      || normalizeOligoSequence(site.annealedSequence) === expectedSite.annealedSequence)
  ));
}

/** Attach one proved molecule/version landing, preserving sites on other molecules. */
export function attachKnownPrimerSite(primer, {
  entryId, documentHash, topology = 'linear', template = '', start, end,
  sourceForm = 'assembly-draft',
} = {}) {
  if (!primer?.id || !entryId || !documentHash || typeof template !== 'string') return null;
  const circular = topology === 'circular';
  const segments = validSegments(start, end, template.length, circular);
  if (!segments) return null;
  const strand = primer.direction === 'reverse' ? -1 : 1;
  const top = segments.map((segment) => template.slice(segment.start, segment.end)).join('').toUpperCase();
  if (!top || top.length !== end - start) return null;
  const annealedSequence = strand === -1 ? reverseComplement(top) : top;
  const site = {
    id: [
      primer.id, 'site', safeIdToken(entryId), safeIdToken(documentHash),
      strand === -1 ? 'rev' : 'fwd',
      segments.map((segment) => `${segment.start}-${segment.end}`).join('_'),
    ].join('-'),
    sourceIndex: 0,
    target: { entryId, resourceHash: documentHash, topology: circular ? 'circular' : 'linear' },
    location: { kind: segments.length > 1 ? 'join' : 'single', segments },
    strand,
    annealedSequence,
    tail: typeof primer.tail === 'string' ? primer.tail : '',
    meltingTemperature: Number.isFinite(primer.tmBinding)
      ? primer.tmBinding : (Number.isFinite(primer.tm) ? primer.tm : null),
    sourceVisibility: 'shown',
    sourceForms: [sourceForm],
  };
  const generatedKey = generatedSiteKey(site, sourceForm);
  const foreignSites = (Array.isArray(primer.sites) ? primer.sites : []).filter(
    (existing) => generatedSiteKey(existing, sourceForm) !== generatedKey,
  );
  return {
    ...primer,
    bindingTargetLength: end - start,
    sites: [...foreignSites, site],
  };
}

/**
 * Repair the one proven v12 corruption: an auto-group tail was folded into
 * bindingSequence. The current auto design must be the exact source candidate,
 * the expected tail must still be an exact prefix and the remaining binding
 * must have the exact expected length. Substitutions are intentional biology,
 * so their count is not a migration gate. Anything else stays untouched.
 */
export function repairKnownAutoPrimer(primer, expected, placement) {
  if (!primer || !expected || sourceKey(primer) == null
    || sourceKey(primer) !== sourceKey(expected)) return primer;

  const source = primer.source;
  const expectedSource = expected.source;
  if (!SUPPORTED_AUTO_SOURCES.has(source.kind)
    || !SUPPORTED_AUTO_SOURCES.has(expectedSource?.kind)
    || primer.draftId !== placement?.entryId
    || expected.draftId !== placement?.entryId) return primer;
  const expectedDirection = source.side === 'rev' ? 'reverse'
    : (source.side === 'fwd' ? 'forward' : null);
  if (!expectedDirection || primer.direction !== expectedDirection
    || expected.direction !== expectedDirection
    || expectedSource.side !== source.side) return primer;

  const expectedTail = strictDna(expected.tail, { allowEmpty: true });
  const expectedBinding = strictDna(expected.bindingSequence);
  const tail = strictDna(primer.tail, { allowEmpty: true });
  const binding = strictDna(primer.bindingSequence);
  const sequence = strictDna(primer.sequence);
  if (expectedTail == null || expectedBinding == null
    || tail == null || binding == null || sequence == null) return primer;
  const statedTargetLength = Number.isSafeInteger(primer.bindingTargetLength)
    ? primer.bindingTargetLength : null;
  if (statedTargetLength != null && statedTargetLength !== expectedBinding.length) return primer;

  const probe = attachKnownPrimerSite({ ...primer, sites: [] }, placement);
  const expectedSite = probe?.sites?.[0];
  if (!expectedSite || !currentGeometryIsSafe(primer, expectedSite)) return primer;
  let canonical = primer;

  if (!tail && expectedTail) {
    if (binding !== sequence
      || sequence.length !== expectedTail.length + expectedBinding.length
      || !sequence.startsWith(expectedTail)) return primer;
    const repairedBinding = sequence.slice(expectedTail.length);
    if (repairedBinding.length !== expectedBinding.length) return primer;
    canonical = {
      ...primer,
      sequence,
      bindingSequence: repairedBinding,
      tail: expectedTail,
      bindingModel: 'aligned-v1',
    };
  } else {
    if (!binding || sequence !== `${tail}${binding}`) return primer;
    if (binding.length !== expectedBinding.length) return primer;
  }

  return attachKnownPrimerSite(canonical, placement) || primer;
}

export function sameAutoPrimerSource(primer, expected) {
  const key = sourceKey(primer);
  return key != null && key === sourceKey(expected);
}

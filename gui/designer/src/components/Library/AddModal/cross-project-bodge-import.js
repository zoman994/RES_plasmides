import { v7 as uuidv7 } from 'uuid';
import { canonicalToSkeleton } from '../../CanvasSkeleton/lib/skeleton-bodge-bridge';
import { normalizeLocation } from '../../../lib/annotation-location';
import { readBodge } from '../../../lib/bodge-zip';
import { makeId } from '../../../lib/ids';
import { computeResourceHash } from '../lib/resource-hash';

const LEVEL_RANK = Object.freeze({ region: 0, detail: 1, point: 2 });
const ENTRY_ONLY_KEYS = new Set([
  'id', 'kind', 'name', 'tags', 'folderPath', 'zone', 'zoneId', 'projectId',
  'inLabStock', 'parentEntryId', 'parentEntryHash', 'addedAt', 'origin',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)]));
  }
  return value;
}

function contractError(message) {
  return new Error(`cross-project .bodge: ${message}`);
}

function requireText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw contractError(`${field} is required`);
  return text;
}

function normalizeTopology(value) {
  if (value === 'circular' || value === 'linear') return value;
  if (isRecord(value) && typeof value.circular === 'boolean') {
    return value.circular ? 'circular' : 'linear';
  }
  return null;
}

function normalizeContainer(raw) {
  if (!isRecord(raw)) throw contractError('container must be an object');
  const donorId = requireText(raw.id, 'container id');
  const payload = isRecord(raw.payload) ? raw.payload : raw;
  const sequence = typeof payload.sequence === 'string' ? payload.sequence : '';
  const annotations = payload.annotations ?? raw.annotations ?? [];
  return {
    donorId,
    name: requireText(raw.name ?? payload.name, `container ${donorId} name`),
    sequence,
    length: sequence.length,
    topology: normalizeTopology(payload.topology ?? raw.topology),
    ends: payload.ends ?? raw.ends ?? null,
    annotations,
    source: cloneJson(raw),
    payloadSource: cloneJson(payload),
    sourceWasEntry: isRecord(raw.payload),
  };
}

function addUniqueContainers(target, seen, source) {
  for (const raw of source || []) {
    const normalized = normalizeContainer(raw);
    if (seen.has(normalized.donorId)) continue;
    seen.add(normalized.donorId);
    target.push(normalized);
  }
}

function containerEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter((entry) => entry?.kind === 'container');
}

export function extractPortableBodgeContainers(parsed) {
  if (!isRecord(parsed)) throw contractError('reader returned no project');
  const containers = [];
  const seen = new Set();

  if (isRecord(parsed.state)) {
    const state = parsed.state;
    const skeleton = canonicalToSkeleton(state);
    if (Array.isArray(skeleton?.containers) && skeleton.containers.length > 0) {
      addUniqueContainers(containers, seen, skeleton.containers);
    }
    if (containers.length === 0 && Array.isArray(state.containers) && state.containers.length > 0) {
      addUniqueContainers(containers, seen, state.containers);
    }
    if (containers.length === 0) {
      addUniqueContainers(containers, seen, containerEntries(parsed.libraryEntries));
    }
    return {
      donorProjectId: typeof state.projectMeta?.id === 'string'
        ? state.projectMeta.id
        : (typeof parsed.project?.id === 'string' ? parsed.project.id : null),
      containers,
    };
  }

  const project = isRecord(parsed.project) ? parsed.project : {};
  if (Array.isArray(project.containers)) {
    addUniqueContainers(containers, seen, project.containers);
  }
  addUniqueContainers(containers, seen, containerEntries(parsed.libraryEntries));
  return {
    donorProjectId: typeof project.id === 'string' ? project.id : null,
    containers,
  };
}

export async function loadPortableBodgeContainers(pick) {
  if (!pick?.file) throw contractError('file is required');
  const parsed = await readBodge(pick.file);
  const extracted = extractPortableBodgeContainers(parsed);
  return {
    ...extracted,
    sourceFileName: typeof pick.fileName === 'string' && pick.fileName
      ? pick.fileName
      : (pick.file.name || 'project.bodge'),
  };
}

function sameLocation(left, right) {
  if (left.kind !== right.kind || left.segments.length !== right.segments.length) return false;
  return left.segments.every((segment, index) => (
    segment.start === right.segments[index].start && segment.end === right.segments[index].end
  ));
}

function normalizeAnnotationLocation(annotation, doc, donorId) {
  const hasBareSegments = Object.hasOwn(annotation, 'segments');
  if (!hasBareSegments) return normalizeLocation(annotation, doc);
  if (!Array.isArray(annotation.segments) || annotation.segments.length === 0) {
    throw contractError(`container ${donorId} annotation has invalid segments`);
  }
  const bareLocation = {
    kind: annotation.location?.kind || (annotation.segments.length === 1 ? 'single' : 'join'),
    segments: annotation.segments,
  };
  const normalizedBare = normalizeLocation({ ...annotation, location: bareLocation }, doc);
  if (annotation.location) {
    const normalizedCanonical = normalizeLocation(annotation, doc);
    if (!sameLocation(normalizedCanonical.location, normalizedBare.location)) {
      throw contractError(`container ${donorId} annotation location and segments disagree`);
    }
  }
  const { segments: _bareSegments, ...withoutBareSegments } = normalizedBare;
  return withoutBareSegments;
}

function validateAndCloneAnnotations(annotations, sequenceLength, topology, donorId) {
  if (!Array.isArray(annotations)) {
    throw contractError(`container ${donorId} annotations must be an array`);
  }
  const normalizedAnnotations = annotations.map((annotation, index) => {
    if (!isRecord(annotation)) {
      throw contractError(`container ${donorId} has invalid annotation ${index}`);
    }
    const cloned = cloneJson(annotation);
    cloned.level = cloned.level == null ? 'region' : cloned.level;
    if (!Object.hasOwn(LEVEL_RANK, cloned.level)) {
      throw contractError(`container ${donorId} has invalid annotation level ${index}`);
    }
    cloned.id = typeof cloned.id === 'string' && cloned.id.trim()
      ? cloned.id.trim()
      : `__file_annotation_${index}`;
    try {
      return normalizeAnnotationLocation(
        cloned,
        { length: sequenceLength, topology },
        donorId,
      );
    } catch (error) {
      throw contractError(`container ${donorId} has invalid annotation ${index}: ${error.message}`);
    }
  });
  const byId = new Map();
  for (const [index, annotation] of normalizedAnnotations.entries()) {
    const annotationId = requireText(annotation.id, `container ${donorId} annotation ${index} id`);
    if (byId.has(annotationId)) {
      throw contractError(`container ${donorId} has duplicate annotation id ${annotationId}`);
    }
    byId.set(annotationId, annotation);
  }

  for (const annotation of normalizedAnnotations) {
    if (annotation.level === 'region' && (annotation.parentId != null || annotation.regionId != null)) {
      throw contractError(`container ${donorId} region annotation has a parent`);
    }
    if (annotation.parentId != null) {
      const parent = byId.get(annotation.parentId);
      if (!parent || LEVEL_RANK[parent.level] >= LEVEL_RANK[annotation.level]) {
        throw contractError(`container ${donorId} has an incoherent annotation parent`);
      }
    }
    if (annotation.regionId != null) {
      const region = byId.get(annotation.regionId);
      if (!region || region.level !== 'region') {
        throw contractError(`container ${donorId} has an incoherent annotation region`);
      }
    }
  }

  const ancestry = new Map();
  const resolveRegionId = (annotation) => {
    if (annotation.level === 'region') return annotation.id;
    if (ancestry.has(annotation.id)) return ancestry.get(annotation.id);
    const explicit = annotation.regionId == null ? null : annotation.regionId;
    let throughParent = null;
    if (annotation.parentId != null) {
      const parent = byId.get(annotation.parentId);
      throughParent = parent.level === 'region' ? parent.id : resolveRegionId(parent);
      if (parent.level !== 'region' && throughParent == null) {
        throw contractError(`container ${donorId} annotation ancestry is incomplete`);
      }
    }
    if (explicit != null && throughParent != null && explicit !== throughParent) {
      throw contractError(`container ${donorId} annotation hierarchy disagrees`);
    }
    const resolved = throughParent || explicit || null;
    ancestry.set(annotation.id, resolved);
    return resolved;
  };

  for (const annotation of normalizedAnnotations) {
    if (annotation.level === 'region') continue;
    const regionId = resolveRegionId(annotation);
    if (regionId != null) annotation.regionId = regionId;
  }

  const freshIds = new Map([...byId.keys()].map((id) => [id, makeId()]));
  return normalizedAnnotations.map((annotation) => {
    const cloned = cloneJson(annotation);
    cloned.id = freshIds.get(annotation.id);
    if (annotation.parentId != null) cloned.parentId = freshIds.get(annotation.parentId);
    if (annotation.regionId != null) cloned.regionId = freshIds.get(annotation.regionId);
    return cloned;
  });
}

function clonePayloadBase(container) {
  const payload = cloneJson(container.payloadSource);
  if (container.sourceWasEntry) return payload;
  for (const key of ENTRY_ONLY_KEYS) delete payload[key];
  return payload;
}

async function materializeContainer(container, context) {
  const sequence = requireText(container.sequence, `container ${container.donorId} sequence`).toUpperCase();
  const topology = normalizeTopology(container.topology);
  if (!topology) throw contractError(`container ${container.donorId} has invalid topology`);
  if (Number.isFinite(container.payloadSource.length)
    && container.payloadSource.length !== sequence.length) {
    throw contractError(`container ${container.donorId} length does not match sequence`);
  }
  const ends = cloneJson(container.ends);
  const annotations = validateAndCloneAnnotations(
    container.annotations, sequence.length, topology, container.donorId,
  );
  const resourceHash = await computeResourceHash({ sequence, topology, ends });
  if (!resourceHash) throw contractError(`container ${container.donorId} could not be hashed`);
  const payload = clonePayloadBase(container);
  payload.sequence = sequence;
  payload.length = sequence.length;
  payload.topology = topology;
  payload.ends = ends;
  payload.annotations = annotations;
  payload.resourceHash = resourceHash;

  return {
    id: uuidv7(),
    kind: 'container',
    name: container.name,
    tags: Array.isArray(container.source.tags) ? cloneJson(container.source.tags) : [],
    zone: context.projectId ? 'active_bodge' : 'loose',
    projectId: context.projectId,
    inLabStock: false,
    parentEntryId: null,
    parentEntryHash: null,
    addedAt: context.importedAt,
    origin: {
      kind: 'cross_project_clone',
      donorContainerId: container.donorId,
      donorProjectId: context.donorProjectId,
      sourceFileName: context.sourceFileName,
      importedAt: context.importedAt,
    },
    payload,
  };
}

export async function materializeCrossProjectEntries({
  containers,
  selectedIds,
  target,
  donorProjectId,
  sourceFileName,
  now = () => new Date().toISOString(),
}) {
  const wanted = new Set(selectedIds || []);
  const selected = (containers || []).filter((container) => wanted.has(container.donorId));
  if (selected.length !== wanted.size) throw contractError('selection contains an unknown container');
  const projectId = typeof target === 'string' && target.startsWith('project:')
    ? target.slice('project:'.length) || null
    : null;
  const context = {
    projectId,
    donorProjectId: donorProjectId || null,
    sourceFileName: requireText(sourceFileName, 'source file name'),
    importedAt: now(),
  };
  return Promise.all(selected.map((container) => materializeContainer(container, context)));
}

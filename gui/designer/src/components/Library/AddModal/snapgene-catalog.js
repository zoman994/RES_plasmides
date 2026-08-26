import { v7 as uuidv7 } from 'uuid';
import { makeId } from '../../../lib/ids';
import { computeResourceHash } from '../lib/resource-hash';

export const SNAPGENE_INDEX_URL = '/plasmids-index.json';
export const SNAPGENE_RESULTS_LIMIT = 100;
export const SNAPGENE_EXPECTED_CATEGORIES = 19;
export const SNAPGENE_EXPECTED_TOTAL = 2822;

const VALID_LEVELS = new Set(['region', 'detail', 'point']);

function catalogError(message) {
  return new Error(`SnapGene catalog: ${message}`);
}

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw catalogError(`invalid ${field}`);
  }
  return value;
}

function validateIndex(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.categories) || !Array.isArray(payload.plasmids)) {
    throw catalogError('invalid index payload');
  }
  if (payload.categories.length === 0 || payload.plasmids.length === 0) {
    throw catalogError('index payload is empty');
  }
  if (!Number.isInteger(payload.total) || payload.total < 0) {
    throw catalogError('invalid index total');
  }
  if (payload.categories.length !== SNAPGENE_EXPECTED_CATEGORIES
    || payload.total !== SNAPGENE_EXPECTED_TOTAL
    || payload.plasmids.length !== SNAPGENE_EXPECTED_TOTAL) {
    throw catalogError('index package identity does not match bundled catalog');
  }

  const categorySlugs = new Set();
  const categories = payload.categories.map((category) => {
    if (!isRecord(category)) throw catalogError('invalid category metadata');
    const slug = requireString(category.slug, 'category slug');
    if (categorySlugs.has(slug)) throw catalogError(`duplicate category ${slug}`);
    categorySlugs.add(slug);
    return {
      ...category,
      slug,
      name: requireString(category.name, `category ${slug} name`),
      count: (() => {
        if (!Number.isInteger(category.count) || category.count < 0) {
          throw catalogError(`invalid category ${slug} count`);
        }
        return category.count;
      })(),
    };
  });

  const plasmidIds = new Set();
  const plasmids = payload.plasmids.map((plasmid) => {
    if (!isRecord(plasmid)) throw catalogError('invalid plasmid metadata');
    const id = requireString(plasmid.id, 'plasmid id');
    const category = requireString(plasmid.category, `plasmid ${id} category`);
    if (!categorySlugs.has(category)) throw catalogError(`unknown category ${category}`);
    if (plasmidIds.has(id)) throw catalogError(`duplicate plasmid ${id}`);
    plasmidIds.add(id);
    if (!Number.isInteger(plasmid.length) || plasmid.length < 0) {
      throw catalogError(`invalid plasmid ${id} length`);
    }
    if (plasmid.topology !== 'linear' && plasmid.topology !== 'circular') {
      throw catalogError(`invalid plasmid ${id} topology`);
    }
    return {
      ...plasmid,
      id,
      category,
      name: requireString(plasmid.name, `plasmid ${id} name`),
      length: plasmid.length,
      topology: plasmid.topology,
      features: Array.isArray(plasmid.features) ? plasmid.features : [],
    };
  });

  if (payload.total !== plasmids.length) {
    throw catalogError('index total does not match plasmid metadata');
  }
  const actualCounts = new Map(categories.map(({ slug }) => [slug, 0]));
  for (const plasmid of plasmids) {
    actualCounts.set(plasmid.category, actualCounts.get(plasmid.category) + 1);
  }
  for (const category of categories) {
    if (actualCounts.get(category.slug) !== category.count) {
      throw catalogError(`category ${category.slug} count does not match metadata`);
    }
  }

  return {
    ...payload,
    categories,
    plasmids,
    total: payload.total,
  };
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Catalog request was cancelled');
  error.name = 'AbortError';
  throw error;
}

async function fetchJson(fetchImpl, url, signal) {
  if (typeof fetchImpl !== 'function') throw catalogError('fetch is unavailable');
  throwIfAborted(signal);
  const response = signal ? await fetchImpl(url, { signal }) : await fetchImpl(url);
  throwIfAborted(signal);
  if (!response?.ok) {
    throw catalogError(`${url} returned ${response?.status ?? 'an error'}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throwIfAborted(signal);
    throw catalogError(`${url} contains invalid JSON`);
  }
  throwIfAborted(signal);
  return payload;
}

export async function loadSnapGeneIndex(fetchImpl = globalThis.fetch, signal) {
  return validateIndex(await fetchJson(fetchImpl, SNAPGENE_INDEX_URL, signal));
}

export function filterSnapGeneIndex(index, {
  category = 'all', query = '', limit = SNAPGENE_RESULTS_LIMIT,
} = {}) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  const all = Array.isArray(index?.plasmids) ? index.plasmids : [];
  const matches = all.filter((plasmid) => {
    if (category !== 'all' && plasmid.category !== category) return false;
    if (!normalizedQuery) return true;
    const searchable = [
      plasmid.name,
      plasmid.organism,
      plasmid.description,
      ...(Array.isArray(plasmid.features) ? plasmid.features : []),
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return searchable.includes(normalizedQuery);
  });
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : SNAPGENE_RESULTS_LIMIT;
  return {
    items: matches.slice(0, safeLimit),
    total: matches.length,
    truncated: matches.length > safeLimit,
  };
}

function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)]));
  }
  return value;
}

function cloneAnnotations(annotations, plasmidId, sequenceLength, topology) {
  if (!Array.isArray(annotations)) throw catalogError(`plasmid ${plasmidId} has invalid annotations`);
  return annotations.map((annotation, index) => {
    if (!isRecord(annotation)
      || !VALID_LEVELS.has(annotation.level)
      || !Number.isInteger(annotation.start)
      || !Number.isInteger(annotation.end)
      || annotation.start < 0
      || annotation.end < 0
      || annotation.start > sequenceLength
      || annotation.end > sequenceLength
      || (annotation.start > annotation.end && topology !== 'circular')) {
      throw catalogError(`plasmid ${plasmidId} has invalid annotation ${index}`);
    }
    const cloned = cloneJson(annotation);
    cloned.id = makeId();
    return cloned;
  });
}

async function materializeEntry(plasmid, metadata, category, { projectId, importedAt }) {
  if (!isRecord(plasmid) || plasmid.id !== metadata.id) {
    throw catalogError(`selected plasmid ${metadata.id} is missing`);
  }
  const sequence = requireString(plasmid.sequence, `plasmid ${plasmid.id} sequence`).toUpperCase();
  const topology = plasmid.topology === 'circular' ? 'circular'
    : plasmid.topology === 'linear' ? 'linear'
      : null;
  if (!topology) throw catalogError(`plasmid ${plasmid.id} has invalid topology`);
  if (Number.isFinite(plasmid.length) && plasmid.length !== sequence.length) {
    throw catalogError(`plasmid ${plasmid.id} length does not match sequence`);
  }
  const annotations = cloneAnnotations(
    plasmid.annotations, plasmid.id, sequence.length, topology,
  );
  const ends = null;
  const resourceHash = await computeResourceHash({ sequence, topology, ends });
  if (!resourceHash) throw catalogError(`could not hash plasmid ${plasmid.id}`);

  return {
    id: uuidv7(),
    kind: 'container',
    name: requireString(plasmid.name, `plasmid ${plasmid.id} name`),
    tags: ['SnapGene', category.name].filter(Boolean),
    folderPath: `SnapGene / ${category.name}`,
    zone: projectId ? 'active_bodge' : 'loose',
    projectId,
    inLabStock: false,
    parentEntryId: null,
    parentEntryHash: null,
    addedAt: importedAt,
    origin: Object.freeze({
      kind: 'catalog',
      sourceCatalog: 'snapgene-public',
      sourcePlasmidId: plasmid.id,
      categorySlug: category.slug,
      importedAt,
    }),
    payload: {
      sequence,
      length: sequence.length,
      topology,
      ends,
      organism: typeof plasmid.organism === 'string' ? plasmid.organism : '',
      description: typeof plasmid.description === 'string' ? plasmid.description : '',
      annotations,
      resourceHash,
    },
  };
}

export async function loadSelectedSnapGeneEntries({
  index,
  selectedIds,
  target,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  signal,
}) {
  if (!index || !Array.isArray(index.categories) || !Array.isArray(index.plasmids)) {
    throw catalogError('index is not loaded');
  }
  const ids = [...new Set(Array.from(selectedIds || []))];
  if (ids.length === 0) return [];

  const metadataById = new Map(index.plasmids.map((plasmid) => [plasmid.id, plasmid]));
  const categoryBySlug = new Map(index.categories.map((category) => [category.slug, category]));
  const selected = ids.map((id) => {
    const metadata = metadataById.get(id);
    if (!metadata) throw catalogError(`unknown selected plasmid ${id}`);
    return metadata;
  });
  const byCategory = new Map();
  for (const metadata of selected) {
    const group = byCategory.get(metadata.category) || [];
    group.push(metadata);
    byCategory.set(metadata.category, group);
  }

  const projectId = typeof target === 'string' && target.startsWith('project:')
    ? target.slice('project:'.length) || null
    : null;
  const importedAt = now();
  const entriesBySourceId = new Map();

  // Sequential category reads keep peak memory bounded on the 8 GB baseline.
  for (const [categorySlug, group] of byCategory) {
    throwIfAborted(signal);
    const category = categoryBySlug.get(categorySlug);
    if (!category) throw catalogError(`unknown category ${categorySlug}`);
    const payload = await fetchJson(
      fetchImpl,
      `/plasmids-data/${encodeURIComponent(categorySlug)}.json`,
      signal,
    );
    if (!isRecord(payload) || !Array.isArray(payload.plasmids)) {
      throw catalogError(`category ${categorySlug} has invalid payload`);
    }
    const categoryMetadata = index.plasmids.filter(
      (plasmid) => plasmid.category === categorySlug,
    );
    if (payload.plasmids.length !== category.count
      || categoryMetadata.length !== category.count) {
      throw catalogError(`category ${categorySlug} payload count does not match index`);
    }
    const expectedById = new Map(categoryMetadata.map((metadata) => [metadata.id, metadata]));
    const fullById = new Map();
    for (const plasmid of payload.plasmids) {
      if (!isRecord(plasmid)) throw catalogError(`category ${categorySlug} has invalid plasmid`);
      const id = requireString(plasmid.id, `category ${categorySlug} plasmid id`);
      if (fullById.has(id)) throw catalogError(`category ${categorySlug} has duplicate plasmid ${id}`);
      const metadata = expectedById.get(id);
      if (!metadata) throw catalogError(`category ${categorySlug} has unexpected plasmid ${id}`);
      if (plasmid.name !== metadata.name
        || plasmid.length !== metadata.length
        || plasmid.topology !== metadata.topology) {
        throw catalogError(`plasmid ${id} metadata does not match index`);
      }
      fullById.set(id, plasmid);
    }
    if (fullById.size !== expectedById.size) {
      throw catalogError(`category ${categorySlug} payload is incomplete`);
    }
    for (const metadata of group) {
      throwIfAborted(signal);
      const entry = await materializeEntry(
        fullById.get(metadata.id), metadata, category, { projectId, importedAt },
      );
      throwIfAborted(signal);
      entriesBySourceId.set(metadata.id, entry);
    }
  }

  return selected.map((metadata) => entriesBySourceId.get(metadata.id));
}

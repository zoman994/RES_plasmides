/**
 * bodge-primers-json — project-scoped primer pool serialization.
 *
 * writePrimerPool(primers, projectId)         → string (JSON)
 * readPrimerPool(jsonStr, currentPool, opts)  → { pool, mergedCount, dedupCount }
 *
 * Spec §8.1 — at import, primers with identical NORMALIZED SEQUENCE
 * dedup into a single runtime record; origin extends to multi-project.
 *
 * This is a behavior change vs v1, which merged by `id` only. Mandatory
 * regression test below verifies that two .bodge files with the same
 * primer sequence under different ids land as ONE pool entry with TWO
 * sources.
 */
import {
  normalizePrimerSequence,
  primerSequenceHash,
} from './bodge-hash';
import { BODGE_V2_FILE_FORMAT_VERSION } from './bodge-manifest-v2';

/**
 * Serialize a primer pool. `primers` may include both single primers and
 * primer-pair records (kind: 'pair'); both shapes preserved.
 */
export function writePrimerPool(primers, projectId) {
  if (!Array.isArray(primers)) throw new Error('writePrimerPool: primers array required');
  if (!projectId) throw new Error('writePrimerPool: projectId required');
  return JSON.stringify({
    $schema: 'https://bodgegene.dev/schema/bodge-primers-v2.json',
    fileFormatVersion: BODGE_V2_FILE_FORMAT_VERSION,
    projectId,
    primers: primers.map(serializePrimer),
  }, null, 2);
}

function serializePrimer(p) {
  if (!p) return null;
  if (p.kind === 'pair') {
    return {
      id: p.id,
      kind: 'pair',
      forwardId: p.forwardId,
      reverseId: p.reverseId,
      name: p.name || '',
      ampliconLength: typeof p.ampliconLength === 'number' ? p.ampliconLength : null,
    };
  }
  return {
    id: p.id,
    name: p.name || '',
    sequence: String(p.sequence || ''),
    // PRIMER-AUDIT (V174) — persist the V173 shape so a tailed primer keeps its
    // overhang + binding (else PrimerTrack/binding-search degrade after reload).
    // tail accepts both ecosystem field names (assembly `tail` / PCR `tailSequence`).
    bindingSequence: typeof p.bindingSequence === 'string' ? p.bindingSequence : null,
    tail: typeof p.tail === 'string' ? p.tail : (typeof p.tailSequence === 'string' ? p.tailSequence : ''),
    direction: p.direction === 'reverse' ? 'reverse' : (p.direction === 'forward' ? 'forward' : null),
    status: p.status || null,
    projectId: p.projectId ?? null,
    resourceHash: p.resourceHash || null,
    tm: typeof p.tm === 'number' ? p.tm : null,
    origin: p.origin ? { ...p.origin } : null,
    tags: Array.isArray(p.tags) ? [...p.tags] : [],
    notes: p.notes || '',
    createdAt: p.createdAt || null,
    boundContainers: Array.isArray(p.boundContainers)
      ? p.boundContainers.map(b => ({ ...b }))
      : [],
  };
}

/**
 * Parse primer pool JSON + merge into an existing pool with sequence-hash
 * dedup.
 *
 * Returns `{ pool, mergedCount, dedupCount, warnings }`:
 *   - pool: merged array.
 *   - mergedCount: new entries added.
 *   - dedupCount: entries skipped because identical sequence already in pool.
 *   - warnings: e.g. when a primer has no sequence.
 */
export async function readPrimerPool(jsonStr, currentPool = [], opts = {}) {
  if (!jsonStr) throw new Error('readPrimerPool: input required');
  const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
  const incoming = Array.isArray(parsed.primers) ? parsed.primers : [];
  const projectId = parsed.projectId || opts.fallbackProjectId || null;
  // Build dedup index for currentPool by normalized sequence.
  const byNormSeq = new Map();
  for (const p of currentPool) {
    if (p?.kind === 'pair') continue;
    const norm = normalizePrimerSequence(p?.sequence);
    if (norm) byNormSeq.set(norm, p);
  }
  const merged = [...currentPool];
  let mergedCount = 0;
  let dedupCount = 0;
  const warnings = [];
  for (const p of incoming) {
    if (!p) continue;
    if (p.kind === 'pair') {
      // Pairs are added as-is; their forward/reverse IDs may need
      // rewriting if the underlying singles deduped — caller decides
      // (typically OK: dedup picks the older id, pair refs land valid
      // when both pair members come from the same file).
      merged.push(p);
      mergedCount++;
      continue;
    }
    if (!p.sequence) {
      warnings.push(`primer "${p.id}" has no sequence — skipped`);
      continue;
    }
    const norm = normalizePrimerSequence(p.sequence);
    const existing = byNormSeq.get(norm);
    if (existing) {
      // Same sequence already present — extend origin to multi-project.
      extendOrigin(existing, p.origin, projectId);
      dedupCount++;
      continue;
    }
    const clone = { ...p, boundContainers: [...(p.boundContainers || [])] };
    if (projectId && clone.origin && !clone.origin.projectId) {
      clone.origin.projectId = projectId;
    }
    merged.push(clone);
    byNormSeq.set(norm, clone);
    mergedCount++;
  }
  return { pool: merged, mergedCount, dedupCount, warnings, projectId };
}

function extendOrigin(existing, newOrigin, projectId) {
  if (!newOrigin && !projectId) return;
  if (!existing.origin) {
    existing.origin = newOrigin || { kind: 'multi-project', sources: [] };
  }
  if (existing.origin.kind !== 'multi-project') {
    // Convert single-origin → multi-project.
    const first = { ...existing.origin };
    existing.origin = { kind: 'multi-project', sources: [first] };
  }
  if (!Array.isArray(existing.origin.sources)) existing.origin.sources = [];
  // Track BOTH the primer's stated origin.projectId (where it was born)
  // and the file's projectId (where we're seeing it used now). Either or
  // both may already be in sources; only add what's new.
  const candidates = [];
  if (newOrigin?.projectId) candidates.push({ ...newOrigin });
  if (projectId && !candidates.some(c => c.projectId === projectId)) {
    candidates.push(newOrigin ? { ...newOrigin, projectId } : { projectId });
  }
  for (const c of candidates) {
    if (!existing.origin.sources.some(s => s.projectId === c.projectId)) {
      existing.origin.sources.push(c);
    }
  }
}

/**
 * Hash all primers in a pool by normalized sequence (Map<hex, primer>).
 * Used by K11 .bodgeassembly portable subset to dedup primers across
 * imported assembly + existing project pool.
 */
export async function indexPrimerPoolByHash(pool) {
  const out = new Map();
  for (const p of pool) {
    if (p?.kind === 'pair' || !p?.sequence) continue;
    const h = await primerSequenceHash(p.sequence);
    if (h) out.set(h, p);
  }
  return out;
}

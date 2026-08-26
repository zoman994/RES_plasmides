/**
 * bodge-primers-json — project-scoped primer pool serialization.
 *
 * writePrimerPool(primers, projectId)         → string (JSON)
 * readPrimerPool(jsonStr, currentPool, opts)  → { pool, mergedCount, dedupCount }
 *   opts.dedupBySequence — opt-in, portable `.bodgeassembly` merge only.
 *
 * ANN-0L — the FULL PROJECT container is LOSSLESS. Identity is the record
 * `id` and nothing else: two records that merely share an oligo are two
 * entries the user created, and a record with no known sequence is still a
 * record. The earlier §8.1 rule merged by normalized sequence and skipped
 * sequence-less rows, destroying data on every round-trip. That policy now
 * survives only as an explicit option on the portable `.bodgeassembly` merge
 * path, which is a different contract.
 */
import {
  primerSequenceHash,
} from './bodge-hash';
import { BODGE_V2_FILE_FORMAT_VERSION } from './bodge-manifest-v2';
import { PRIMER_SCOPE_PROJECT } from './primer-identity';

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
  // ANN-0L C0 — the record travels WHOLE. A hand-kept allowlist silently
  // dropped whatever it had not been taught about (`description` and the
  // `addedAt` that orders the pool were both lost this way), and every field
  // added later would have been lost too. Spread first, then normalise the
  // fields that carry meaning; nothing is left behind by omission.
  return {
    ...p,
    id: p.id,
    name: p.name || '',
    description: typeof p.description === 'string' ? p.description : null,
    // stable ordering field — without it a reopened pool comes back shuffled
    addedAt: p.addedAt || null,
    // ANN-0L — `null` (unknown oligo) must survive as null. Coercing it to ''
    // claimed we knew the sequence was empty and, with the reader's skip rule,
    // deleted the record entirely.
    sequence: typeof p.sequence === 'string' ? p.sequence : null,
    schemaVersion: p.schemaVersion || null,
    sequenceSource: p.sequenceSource || null,
    // Every declared binding site, in source order, with the null/'' meaning
    // preserved per site.
    sites: Array.isArray(p.sites) ? p.sites.map((x) => ({ ...x })) : [],
    // PRIMER-AUDIT (V174) — persist the V173 shape so a tailed primer keeps its
    // overhang + binding (else PrimerTrack/binding-search degrade after reload).
    // tail accepts both ecosystem field names (assembly `tail` / PCR `tailSequence`).
    bindingSequence: typeof p.bindingSequence === 'string' ? p.bindingSequence : null,
    tail: typeof p.tail === 'string' ? p.tail
      : (typeof p.tailSequence === 'string' ? p.tailSequence : null),
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
 * Parse primer pool JSON and merge into an existing pool, keyed by record id.
 *
 * Returns `{ pool, mergedCount, dedupCount, warnings, projectId }`:
 *   - pool: merged array.
 *   - mergedCount: new records added.
 *   - dedupCount: records skipped because the SAME id was already present.
 *   - warnings: e.g. a record kept with an unknown sequence.
 */
export async function readPrimerPool(jsonStr, currentPool = [], opts = {}) {
  if (!jsonStr) throw new Error('readPrimerPool: input required');
  const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
  const incoming = Array.isArray(parsed.primers) ? parsed.primers : [];
  const projectId = parsed.projectId || opts.fallbackProjectId || null;

  // Identity is the record id — never the sequence. Re-importing the SAME
  // container must not duplicate rows, but two distinct records that share an
  // oligo must both survive.
  const byId = new Map();
  for (const p of currentPool) {
    if (p?.kind === 'pair') continue;
    if (p?.id) byId.set(p.id, p);
  }

  const merged = [...currentPool];
  let mergedCount = 0;
  let dedupCount = 0;
  const warnings = [];
  // ANN-0L C4 — incoming record id → the record actually kept. Folding two
  // identical oligos is fine; doing it without telling the caller left every
  // pair and PCR operation pointing at an id that no longer exists.
  const remap = new Map();

  // The portable `.bodgeassembly` merge is a DIFFERENT contract: it folds an
  // assembly into an existing project, where two identical oligos really are
  // one reagent. That policy is opt-in and must never be the default — as the
  // container default it silently deleted records on every save/open.
  const bySeq = new Map();
  if (opts.dedupBySequence) {
    for (const p of currentPool) {
      if (p?.kind === 'pair' || !p?.sequence) continue;
      const h = await primerSequenceHash(p.sequence);
      if (h) bySeq.set(h, p);
    }
  }

  for (const incomingRecord of incoming) {
    if (!incomingRecord) continue;
    let p = incomingRecord;
    if (p.kind === 'pair') {
      merged.push(p);
      mergedCount++;
      continue;
    }
    // A record with no known oligo is incomplete, not invalid: the user can
    // see it in the list and delete it deliberately.
    if (!p.sequence) {
      warnings.push(`primer "${p.id}" has no sequence — kept as an incomplete record`);
    }
    // PRIMER-LIVE-1 — a file can describe a project's primers. It cannot
    // describe THIS lab's freezer. An incoming record claiming the personal
    // inventory scope is landed as a project record: the oligo, its sites and
    // its history are all preserved, but the file does not get to assert that
    // a tube of it physically exists on this machine.
    if (p.scope && p.scope !== PRIMER_SCOPE_PROJECT) {
      p = { ...p, scope: PRIMER_SCOPE_PROJECT, rawId: p.rawId || p.id };
      warnings.push(`primer "${p.id}" claimed personal inventory — imported as a project record`);
    }
    if (p.id && byId.has(p.id)) {
      remap.set(p.id, p.id);
      dedupCount++;
      continue;
    }
    if (opts.dedupBySequence && p.sequence) {
      const h = await primerSequenceHash(p.sequence);
      if (h && bySeq.has(h)) {
        const kept = bySeq.get(h);
        if (p.id && kept?.id) remap.set(p.id, kept.id);
        dedupCount++;
        continue;
      }
      if (h) bySeq.set(h, p);
    }
    if (p.id) remap.set(p.id, p.id);
    if (p.id) byId.set(p.id, p);
    merged.push(p);
    mergedCount++;
  }

  return { pool: merged, mergedCount, dedupCount, warnings, projectId, remap };
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

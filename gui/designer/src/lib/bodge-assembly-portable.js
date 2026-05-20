/**
 * bodge-assembly-portable — `.bodgeassembly` portable subset.
 *
 * Spec §7.2 — exportType: 'assembly'. ZIP contains:
 *   manifest + project.json (minimal) + assemblies/<one>.json +
 *   containers/<refs>.gb + primers/pool.json (filtered) +
 *   notebook/ (zone-filtered).
 *
 * Receiver imports → merge zone into existing project with:
 *   - container dedup by sha256 (lib/bodge-hash).
 *   - primer dedup by normalized-sequence-hash (lib/bodge-primers-json).
 */
import { writeBodgeV2, readBodge } from './bodge-zip';
import { applyProfile } from './bodge-export-profiles';
import { sha256Hex } from './bodge-hash';
import { writeContainerToGenBank } from './bodge-container-genbank';
import { readPrimerPool } from './bodge-primers-json';

/**
 * Write a `.bodgeassembly` portable subset for a single zone.
 *
 * @param {object} state — canonical state.
 * @param {string} zoneId — chosen assembly's zone.
 * @param {object} [opts] — { appVersion }.
 * @returns {Blob}
 */
export async function writeBodgeAssembly(state, zoneId, opts = {}) {
  if (!zoneId) throw new Error('writeBodgeAssembly: zoneId required');
  const filtered = applyProfile('single-assembly', state, {
    singleAssemblyZoneId: zoneId,
  });
  return writeBodgeV2(filtered, {
    exportType: 'assembly',
    exportProfile: 'single-assembly',
    singleAssemblyZoneId: zoneId,
    appVersion: opts.appVersion,
  });
}

/**
 * Import a `.bodgeassembly` into an existing state. Returns a merged
 * state + report of dedup actions.
 *
 * Dedup rules:
 *   - Container with identical sha256(sequence) → keep existing,
 *     remap incoming refs.
 *   - Primer with identical normalized sequence → keep existing,
 *     remap incoming refs.
 *   - Zone keeps its incoming id (unique by uuidv7).
 *   - Library entries: dedup by resourceHash + projectId+id match.
 */
export async function importBodgeAssembly(blob, currentState) {
  const r = await readBodge(blob);
  if (r.formatVersion !== '2.0.0' && r.formatVersion !== 'unknown') {
    // Allow only v2 .bodgeassembly. v1 would have to be migrated first.
    if (r.formatVersion === '1.0.0') {
      throw new Error('importBodgeAssembly: v1 input — run migration first');
    }
  }
  if (r.manifest?.exportType && r.manifest.exportType !== 'assembly') {
    // Still accept project exports — the merge logic is identical.
  }
  const incoming = r.state;

  const report = {
    containersAdded: 0,
    containersDedup: 0,
    primersAdded: 0,
    primersDedup: 0,
    zonesAdded: 0,
    libraryAdded: 0,
    refRemap: new Map(), // oldId → newId for containers / primers.
  };

  const out = {
    ...currentState,
    containers: [...(currentState.containers || [])],
    pieces: [...(currentState.pieces || [])],
    operations: [...(currentState.operations || [])],
    zones: [...(currentState.zones || [])],
    junctions: [...(currentState.junctions || [])],
    primers: [...(currentState.primers || [])],
    libraryEntries: [...(currentState.libraryEntries || [])],
  };

  // 1. Container dedup by sha256(sequence).
  const existingContainerBySha = new Map();
  for (const c of out.containers) {
    const h = await sha256Hex((c.sequence || '').toUpperCase());
    existingContainerBySha.set(h, c.id);
  }
  for (const c of incoming.containers || []) {
    const h = await sha256Hex((c.sequence || '').toUpperCase());
    if (existingContainerBySha.has(h)) {
      const existingId = existingContainerBySha.get(h);
      if (existingId !== c.id) report.refRemap.set(c.id, existingId);
      report.containersDedup++;
    } else {
      out.containers.push(c);
      existingContainerBySha.set(h, c.id);
      report.containersAdded++;
    }
  }

  // 2. Primer dedup via readPrimerPool sequence-hash flow.
  const incomingPool = { primers: incoming.primers || [] };
  const merged = await readPrimerPool(
    JSON.stringify(incomingPool),
    out.primers,
    { fallbackProjectId: incoming.projectMeta?.id || 'imported' },
  );
  out.primers = merged.pool;
  report.primersAdded = merged.mergedCount;
  report.primersDedup = merged.dedupCount;

  // 3. Remap incoming pieces / operations / junctions to use deduped IDs.
  const remap = report.refRemap;
  out.pieces.push(...(incoming.pieces || []).map(p => ({
    ...p,
    sourceIds: (p.sourceIds || []).map(id => remap.get(id) || id),
  })));
  out.operations.push(...(incoming.operations || []).map(o => ({
    ...o,
    inputs: (o.inputs || []).map(id => remap.get(id) || id),
    outputs: (o.outputs || []).map(id => remap.get(id) || id),
    materializedClones: o.materializedClones?.map(c => ({
      ...c,
      cloneId: remap.get(c.cloneId) || c.cloneId,
    })) || null,
  })));
  out.junctions.push(...(incoming.junctions || []));

  // 4. Zones — append by id (callers should ensure uuid uniqueness).
  for (const z of incoming.zones || []) {
    if (!out.zones.some(existing => existing.id === z.id)) {
      out.zones.push(z);
      report.zonesAdded++;
    }
  }

  // 5. Library entries — dedup by (resourceHash, projectId, name).
  const existingLibraryKeys = new Set(
    out.libraryEntries.map(libraryKey),
  );
  for (const le of incoming.libraryEntries || []) {
    const k = libraryKey(le);
    if (existingLibraryKeys.has(k)) continue;
    out.libraryEntries.push(le);
    existingLibraryKeys.add(k);
    report.libraryAdded++;
  }

  return { state: out, report };
}

function libraryKey(le) {
  return `${le.resourceHash || ''}::${le.projectId || ''}::${le.name || ''}`;
}

/**
 * notebook-migrations/t10-to-notebook — T10 Sanger notes → notebook entries.
 *
 * Spec §14.2. Idempotent migration. Detects v0.8.x state where
 * `op.materializedClones[i].notes` was a free-text plain string (T10
 * MVP). Promotes each such clone-note into a `kind: 'sanger'` notebook
 * entry + stamps `clone.sangerNotebookEntryId = entry.id` so the T10
 * panel can route clicks to the new entry.
 *
 * Backward compatibility: keeps the old `notes` field readable for one
 * version cycle. Removal scheduled for v0.9.x + ≥1 acceptance cycle
 * (semver-minor breaking, called out in release notes).
 */
import { v7 as uuidv7 } from 'uuid';

const NB_ID_PREFIX = 'nb';

export function migrateT10NotesToNotebook(state) {
  if (!state || typeof state !== 'object') return state;
  const operations = Array.isArray(state.operations) ? state.operations : [];
  const existingEntries = Array.isArray(state.notebookEntries) ? state.notebookEntries : [];
  const newEntries = [];
  const updatedOps = operations.map(op => {
    if (!Array.isArray(op.materializedClones) || op.materializedClones.length === 0) return op;
    let touched = false;
    const updatedClones = op.materializedClones.map(clone => {
      if (!clone || !clone.cloneId) return clone;
      if (clone.sangerNotebookEntryId) return clone; // already migrated
      if (!clone.notes) return clone;                 // nothing to migrate
      const entryId = `${NB_ID_PREFIX}${uuidv7().slice(0, 12)}`;
      const ts = clone.createdAt || new Date().toISOString();
      const entry = {
        id: entryId,
        kind: 'sanger',
        title: `Sanger ${clone.label || clone.cloneId}`,
        text: clone.notes,
        createdAt: ts,
        updatedAt: ts,
        author: state.projectMeta?.author
          ? { ...state.projectMeta.author }
          : { name: 'Igor', deviceId: '' },
        tags: ['sanger'],
        refs: [
          { kind: 'operation', id: op.id },
          { kind: 'clone', id: clone.cloneId },
        ],
        attachments: [],
        data: {
          sangerVerified: clone.sangerVerified || 'pending',
          primer: null,
          qualityScore: null,
          discrepancies: [],
          expectedSequence: null,
          actualSequence: null,
        },
      };
      newEntries.push(entry);
      touched = true;
      return { ...clone, sangerNotebookEntryId: entryId };
    });
    return touched ? { ...op, materializedClones: updatedClones } : op;
  });

  if (!newEntries.length) return state;

  return {
    ...state,
    operations: updatedOps,
    notebookEntries: [...existingEntries, ...newEntries],
  };
}

/**
 * Soft probe — does this state have any unmigrated T10 notes?
 * Used by UI to show migration toast on open.
 */
export function hasUnmigratedT10Notes(state) {
  if (!state || !Array.isArray(state.operations)) return false;
  for (const op of state.operations) {
    if (!Array.isArray(op.materializedClones)) continue;
    for (const clone of op.materializedClones) {
      if (clone?.notes && !clone.sangerNotebookEntryId) return true;
    }
  }
  return false;
}

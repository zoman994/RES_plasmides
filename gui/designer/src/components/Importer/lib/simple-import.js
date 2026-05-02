import { v7 as uuidv7 } from 'uuid';
import { computeResourceHash } from './resource-hash';

/**
 * Simple-mode import handler (M-B.1 K3, DEC-IMP-06 ⚓ rewrite v1.1).
 *
 * Skips the Combined view entirely: each parsed file is sanitised, hashed,
 * deduped (silent autoname on collision), turned into a Library container
 * entry, and — if `target='project'` — pinned to the current project's
 * `containerIds`. Auto-annotate is OFF (DEC-IMP-09): biolog gets exactly the
 * features the file carried, no enrichment.
 *
 * The handler is pure (no React, no setTimeout) — the Importer fullscreen
 * component drives the 1-second flash + auto-close around it.
 *
 * Signature:
 *   handleSimpleImport({ parsedItems, target, currentProjectId, store }) →
 *     { added: ResultEntry[], skipped: { fileName, reason }[] }
 *
 * `store` is `useStore.getState()` — passed in instead of imported so the
 * function stays trivially testable. It must expose:
 *   - checkLibraryDedup(resourceHash) → existing entry | undefined
 *   - getSuggestedLibraryName(baseName) → autoname candidate
 *   - addLibraryEntry(entry) → void (persists to Dexie)
 *   - addContainerToCurrentProject(libraryEntryId) → void (no-op outside project)
 *
 * Each `added` entry is the persisted LibraryEntry plus two diagnostic fields
 * the Importer uses for toast copy:
 *   _baseName    : the parsed name before autoname
 *   _wasCollision: true iff dedup found an existing entry with the same hash
 */

function buildLibraryEntry(parsedItem, finalName, resourceHash) {
  return {
    id: uuidv7(),
    kind: 'container',
    name: finalName,
    tags: [],
    addedAt: new Date().toISOString(),
    payload: {
      sequence: parsedItem.sequence || '',
      length: parsedItem.length || (parsedItem.sequence ? parsedItem.sequence.length : 0),
      topology: parsedItem.topology || 'linear',
      ends: parsedItem.ends || null,
      annotations: Array.isArray(parsedItem.annotations) ? parsedItem.annotations : [],
      organism: parsedItem.organism || '',
      description: parsedItem.description || '',
      resourceHash: resourceHash || null,
      origin: { kind: 'file_import', sourceFile: parsedItem._fileName || null },
    },
    ext: {},
  };
}

export async function handleSimpleImport({
  parsedItems = [],
  target = 'project',
  currentProjectId = null,
  store,
} = {}) {
  if (!store) throw new Error('handleSimpleImport: store is required');

  const added = [];
  const skipped = [];

  for (const item of parsedItems) {
    if (!item || item._error) {
      skipped.push({
        fileName: item?._fileName || 'unknown',
        reason: item?._error || 'no-file',
      });
      continue;
    }
    if (!item.sequence) {
      skipped.push({ fileName: item._fileName || item.name || 'unknown', reason: 'empty-sequence' });
      continue;
    }

    const baseName = item.name || (item._fileName ? item._fileName.replace(/\.[^.]+$/, '') : 'imported');

    let resourceHash = null;
    try { resourceHash = await computeResourceHash(item); } catch { /* leave null */ }

    const collision = resourceHash ? await store.checkLibraryDedup(resourceHash) : null;
    const finalName = store.getSuggestedLibraryName(baseName);

    const entry = buildLibraryEntry(item, finalName, resourceHash);
    await store.addLibraryEntry(entry);
    if (target === 'project' && currentProjectId && typeof store.addContainerToCurrentProject === 'function') {
      store.addContainerToCurrentProject(entry.id);
    }
    added.push({ ...entry, _baseName: baseName, _wasCollision: !!collision });
  }

  return { added, skipped };
}

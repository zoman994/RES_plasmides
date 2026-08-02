import { v7 as uuidv7 } from 'uuid';

/**
 * Build a fresh LibraryEntry container from a parsed import item.
 * Canonical Library import paths share this builder so every row has
 * the same shape.
 *
 * Caller controls `finalName` (autoname-resolved) and `resourceHash`
 * (SHA-256 over canonical sequence/topology/ends — usually computed via
 * `computeResourceHash`).
 *
 * @param {object} parsedItem  ParsedItem with possibly-edited fields
 *                             (sequence, annotations may already be rotated).
 * @param {string} finalName
 * @param {string|null} resourceHash
 * @param {{ id?: string }} [opts]  Optional explicit id (used for "replace
 *                                  existing" — keep collision row's id).
 */
export function buildLibraryEntry(parsedItem, finalName, resourceHash, opts = {}) {
  const seq = parsedItem.sequence || '';
  return {
    id: opts.id || uuidv7(),
    kind: 'container',
    name: finalName,
    tags: Array.isArray(opts.tags) ? opts.tags : [],
    // Where the entry lives in the catalog tree. Slash-separated path
    // (e.g. 'Vectors/CRISPR'); empty string = top of «Mine». Decoupled
    // from `tags` — tags are free-form metadata for search, the
    // folder path is structural placement.
    folderPath: typeof opts.folderPath === 'string' ? opts.folderPath : '',
    addedAt: new Date().toISOString(),
    // Saved-revision counter. The store guarantees it too (withEntryVersion), but
    // stamping it here means the entry is identifiable the moment it is built —
    // callers that read it back before the async `addLibraryEntry` resolves
    // (LibraryWorkspace.importFiles stamps `origin` onto this object first) never
    // hold a version-less molecule.
    version: 1,
    payload: {
      sequence: seq,
      length: parsedItem.length || seq.length,
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

/**
 * Map the output of `handleFilesImport` (file-import.js) into library
 * entries, separating parse failures. Lets a surface OUTSIDE the Library
 * workspace (the assembly picker's inline file-import) turn dropped
 * files into entries without re-implementing the shaping. Items carrying
 * `_error` (parse failed) or no sequence become `errors`; the rest
 * become full `file_import` container entries via `buildLibraryEntry`.
 *
 * @param {Array<object>} items  ParsedItem[] (may carry `_error`/`_fileName`)
 * @returns {{ entries: object[], errors: Array<{name:string, error:string}> }}
 */
export function buildEntriesFromImportResults(items) {
  const entries = [];
  const errors = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || it._error) {
      errors.push({ name: it?._fileName || it?.name || '?', error: it?._error || 'не удалось разобрать' });
      continue;
    }
    if (!it.sequence) {
      errors.push({ name: it._fileName || it.name || '?', error: 'последовательность не найдена' });
      continue;
    }
    const name = it.name || it._fileName || 'imported';
    entries.push(buildLibraryEntry(it, name, null, {}));
  }
  return { entries, errors };
}

import { v7 as uuidv7 } from 'uuid';

/**
 * Build a fresh LibraryEntry container from a parsed Importer item
 * (M-B.1 K3 + K6). Shared between handleSimpleImport and the K6 Confirm flow
 * so a Library row from Simple mode and a row from Advanced mode have the
 * exact same shape.
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
    addedAt: new Date().toISOString(),
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

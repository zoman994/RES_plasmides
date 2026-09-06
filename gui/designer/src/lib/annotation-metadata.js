/**
 * Lossless merge policy for annotation fields outside the deliberate dominant
 * geometry/identity shape. Kept separate from mutation routing so the latter
 * stays below its hard size budget.
 */
const MERGE_SHAPE_FIELDS = new Set([
  'id', 'name', 'type', 'start', 'end', 'strand', 'level',
  'location', 'segments', 'regionId', 'parentId',
]);

function metadataEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b)
      && a.length === b.length
      && a.every((value, index) => metadataEqual(value, b[index]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    return aKeys.length === bKeys.length
      && aKeys.every(
        (key, index) => key === bKeys[index] && metadataEqual(a[key], b[key]),
      );
  }
  return false;
}

export function mergeCompatibleAnnotationMetadata(dominant, other) {
  const merged = { ...dominant };
  const keys = new Set([...Object.keys(dominant || {}), ...Object.keys(other || {})]);
  for (const key of keys) {
    if (MERGE_SHAPE_FIELDS.has(key)) continue;
    const a = dominant?.[key];
    const b = other?.[key];
    if (a !== undefined && b !== undefined && !metadataEqual(a, b)) {
      throw new Error(`mergeAnnotations: conflicting metadata field '${key}'`);
    }
    if (a === undefined && b !== undefined) merged[key] = b;
  }
  return merged;
}

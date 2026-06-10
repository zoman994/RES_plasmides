/**
 * Shared annotation/entity id factory — `crypto.randomUUID` with feature-detect
 * (⚓ DEC-ANN-10 write-path id standard). Single source so importers,
 * auto-annotate and migration don't each reinvent `Math.random` ids or a
 * reset-on-reload counter. Mirrors the feature-detect in `lib/plasmid-git.js`.
 */
const _hasUUID = typeof globalThis !== 'undefined'
  && globalThis.crypto
  && typeof globalThis.crypto.randomUUID === 'function';

/** Opaque, collision-safe id. Use for any newly created annotation object. */
export function makeId() {
  if (_hasUUID) return globalThis.crypto.randomUUID();
  // prod fallback (should not hit under Chrome 92+ / Node 19+)
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

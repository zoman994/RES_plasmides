/**
 * bodge-extensions — vendor extension points (bit-perfect preserve).
 *
 * Spec §10. Core BodgeGene reads `extensions/<vendor>/*` files,
 * stores them in `state.extensions[<vendor>] = { <path>: bytes|json }`,
 * writes them back unchanged. Core does NOT validate extension content;
 * vendor is responsible for its own schema.
 *
 * The ZIP writer (K6) already round-trips extensions via state.extensions.
 * This module provides convenience helpers + the manifest discovery API
 * used in UI ("Этот .bodge использует extension X v1.2.0").
 */
import { strFromU8 } from 'fflate';

/**
 * List all vendor namespaces present in state.extensions.
 */
export function listVendors(extensions) {
  if (!extensions || typeof extensions !== 'object') return [];
  return Object.keys(extensions);
}

/**
 * Read an optional vendor manifest at `extensions/<vendor>/manifest.json`.
 * Returns parsed object or null. Core does NOT enforce shape.
 */
export function readVendorManifest(extensions, vendor) {
  const tree = extensions?.[vendor];
  if (!tree) return null;
  const m = tree['manifest.json'];
  if (!m) return null;
  try {
    const str = typeof m === 'string' ? m : strFromU8(m);
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Total size of a vendor's data in bytes (UI surfaces "Extensions: X MB
 * total").
 */
export function vendorSize(extensions, vendor) {
  const tree = extensions?.[vendor];
  if (!tree) return 0;
  let sum = 0;
  for (const value of Object.values(tree)) {
    if (value instanceof Uint8Array) sum += value.byteLength;
    else if (typeof value === 'string') sum += value.length;
  }
  return sum;
}

/**
 * Sum across all vendors.
 */
export function totalExtensionsSize(extensions) {
  return listVendors(extensions).reduce((sum, v) => sum + vendorSize(extensions, v), 0);
}

/**
 * Register a vendor's file. Mutates the extensions object in place.
 * Path is relative to `extensions/<vendor>/`.
 */
export function writeVendorFile(extensions, vendor, relPath, content) {
  if (!extensions[vendor]) extensions[vendor] = {};
  extensions[vendor][relPath] = content;
  return extensions;
}

/**
 * Drop a vendor namespace entirely (e.g. when user disables the vendor).
 */
export function dropVendor(extensions, vendor) {
  delete extensions[vendor];
  return extensions;
}

/**
 * Diff two extension trees — bit-perfect comparator used by K12 tests
 * to verify round-trip preserves vendor data exactly.
 */
export function diffExtensions(a, b) {
  const aVendors = new Set(listVendors(a));
  const bVendors = new Set(listVendors(b));
  const diffs = [];
  for (const v of new Set([...aVendors, ...bVendors])) {
    if (!aVendors.has(v)) { diffs.push(`vendor "${v}" missing on left`); continue; }
    if (!bVendors.has(v)) { diffs.push(`vendor "${v}" missing on right`); continue; }
    const aFiles = a[v];
    const bFiles = b[v];
    for (const key of new Set([...Object.keys(aFiles), ...Object.keys(bFiles)])) {
      if (!(key in aFiles)) { diffs.push(`vendor "${v}" file "${key}" missing on left`); continue; }
      if (!(key in bFiles)) { diffs.push(`vendor "${v}" file "${key}" missing on right`); continue; }
      if (!bytesEqual(aFiles[key], bFiles[key])) {
        diffs.push(`vendor "${v}" file "${key}" bytes differ`);
      }
    }
  }
  return { equal: diffs.length === 0, diffs };
}

function bytesEqual(a, b) {
  const av = a instanceof Uint8Array ? a : new TextEncoder().encode(String(a));
  const bv = b instanceof Uint8Array ? b : new TextEncoder().encode(String(b));
  if (av.byteLength !== bv.byteLength) return false;
  for (let i = 0; i < av.byteLength; i++) {
    if (av[i] !== bv[i]) return false;
  }
  return true;
}

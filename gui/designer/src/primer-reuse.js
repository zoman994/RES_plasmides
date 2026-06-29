/** Primer reuse detection — find compatible primers in inventory/registry. */

const PRIMER_KEY = 'pvcs-primer-registry';

// ═══ Primer registry (localStorage) ═══

export function getPrimerRegistry() {
  try { return JSON.parse(localStorage.getItem(PRIMER_KEY) || '[]'); } catch { return []; }
}

export function addPrimerToRegistry(primer) {
  const reg = getPrimerRegistry();
  // Deduplicate by sequence
  if (reg.some(p => p.sequence === primer.sequence)) return;
  reg.push({
    ...primer,
    id: `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    addedAt: new Date().toISOString(),
  });
  localStorage.setItem(PRIMER_KEY, JSON.stringify(reg));
}

export function addPrimersToRegistry(primers) {
  primers.forEach(p => addPrimerToRegistry(p));
}

// ═══ Matching logic ═══

/**
 * Find compatible existing primers for a newly calculated primer.
 * @param {Object} newPrimer - calculated primer with tailSequence, bindingSequence, tmBinding
 * @param {Object[]} existingPrimers - registry/inventory primers
 * @param {Object} options - matching options
 * @returns {Object[]} compatible matches sorted by quality
 */
export function findCompatiblePrimers(newPrimer, existingPrimers, options = {}) {
  const { minOverlap = 20, maxTmDiff = 3 } = options;

  const newBind = (newPrimer.bindingSequence || '').toUpperCase();
  // V174 — accept both tail field names (PCR `tailSequence` / assembly `tail`).
  const newTail = (newPrimer.tailSequence ?? newPrimer.tail ?? '').toUpperCase();
  const newDir = newPrimer.direction;

  if (!newBind) return [];

  return existingPrimers
    .map(existing => {
      // Must be same direction
      if (existing.direction && existing.direction !== newDir) return null;

      const exBind = (existing.bindingSequence || '').toUpperCase();
      const exTail = (existing.tailSequence ?? existing.tail ?? '').toUpperCase();

      // 1. Binding region must match (identical)
      if (exBind !== newBind) return null;

      // 2. Tail (overlap) — existing may be shorter but >= minOverlap
      const exOverlap = exTail.length;
      if (newTail.length > 0 && exOverlap < minOverlap) return null;

      // 3. Tail sequence must be compatible (one is substring of the other)
      if (exTail.length > 0 && newTail.length > 0) {
        if (!newTail.endsWith(exTail) && !exTail.endsWith(newTail)) return null;
      }

      // 4. Tm must be close
      const tmDiff = Math.abs((newPrimer.tmBinding || 60) - (existing.tmBinding || 60));
      if (tmDiff > maxTmDiff) return null;

      // Never match a primer against ITSELF (same id) — the true self-guard.
      if (existing.id && newPrimer.id && existing.id === newPrimer.id) return null;
      // Skip same-name matches by default (avoids recommending a near-twin under
      // the same label). `ignoreName` disables this for pool-reuse, where a
      // durable copy legitimately carries the draft's name (PRIMER-4).
      if (!options.ignoreName && existing.name === newPrimer.name) return null;

      return {
        existing,
        overlapLength: exOverlap,
        overlapDiff: newTail.length - exOverlap,
        tmDiff: Math.round(tmDiff * 10) / 10,
        reason: exOverlap === newTail.length
          ? 'Полное совпадение'
          : exOverlap < newTail.length
            ? `Overlap ${exOverlap} п.н. вместо ${newTail.length} — допустимо`
            : `Overlap ${exOverlap} п.н. (больше расчётного)`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.overlapDiff - b.overlapDiff);
}

/**
 * Find reuse matches for all primers against the registry.
 * @returns {{ [primerName]: Object[] }} map of primer name → compatible matches
 */
export function findAllMatches(primers, options = {}) {
  const registry = getPrimerRegistry();
  if (registry.length === 0) return {};

  const matches = {};
  for (const p of primers) {
    const m = findCompatiblePrimers(p, registry, options);
    if (m.length > 0) matches[p.name] = m;
  }
  return matches;
}

/**
 * PRIMER-6 (V180) — auto-reuse against the UNIFIED POOL (primerSlice.primersById),
 * not the legacy global registry. Answers «does this auto-derived primer already
 * exist in my pool?» so the assembly panel can flag it WITHOUT a manual picker.
 * Adapts both the query primer and pool rows (assembly/pool use `tm`,
 * findCompatiblePrimers reads `tmBinding`). Returns compatible matches (empty = none).
 * @param {Object} primer derived primer ({bindingSequence, tail, direction, tm|tmBinding})
 * @param {Object[]} poolPrimers pool rows (primersById values)
 */
export function primerPoolReuse(primer, poolPrimers, options = {}) {
  if (!primer || !Array.isArray(poolPrimers) || poolPrimers.length === 0) return [];
  const adapted = { ...primer, tmBinding: primer.tmBinding ?? primer.tm };
  const pool = poolPrimers.map((e) => ({ ...e, tmBinding: e.tmBinding ?? e.tm }));
  // Pool reuse: a durable pool copy may legitimately share the draft's name
  // (saved «＋ в пул»), so don't exclude same-name — id-based self-guard suffices.
  return findCompatiblePrimers(adapted, pool, { ignoreName: true, ...options });
}

/**
 * Generate order sheet with reused primers separated.
 */
export function buildOrderSheet(primers, reusedNames = new Set()) {
  const toOrder = [];
  const inStock = [];

  for (const p of primers) {
    if (reusedNames.has(p.name)) {
      inStock.push(p);
    } else {
      toOrder.push(p);
    }
  }

  let sheet = '';
  if (toOrder.length > 0) {
    sheet += '=== ЗАКАЗАТЬ (новые) ===\n';
    sheet += toOrder.map(p =>
      `${p.name}\t${p.sequence}\t25nmol\tDesalt`
    ).join('\n');
  }
  if (inStock.length > 0) {
    sheet += '\n\n=== УЖЕ В НАЛИЧИИ (не заказывать) ===\n';
    sheet += inStock.map(p =>
      `${p.reusedFrom || p.name}\t(совместим, не заказывать)`
    ).join('\n');
  }
  return sheet;
}

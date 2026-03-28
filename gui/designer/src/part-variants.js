/** Part variant detection and management utilities. */

/** Count single-nucleotide mismatches between two equal-length sequences. */
function countMismatches(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) n++;
  }
  return n;
}

/** Auto-detect the type of modification between old and new sequence. */
export function detectModification(oldSeq, newSeq) {
  if (!oldSeq || !newSeq) return null;
  const oU = oldSeq.toUpperCase(), nU = newSeq.toUpperCase();
  if (oU === nU) return null;

  if (nU.length < oU.length) {
    const diff = oU.length - nU.length;
    if (oU.endsWith(nU))
      return { type: 'truncation', description: `5'-обрезка, удалено ${diff} п.н.` };
    if (oU.startsWith(nU))
      return { type: 'truncation', description: `3'-обрезка, удалено ${diff} п.н.` };
    // Check if it's an internal deletion
    for (let i = 0; i < nU.length; i++) {
      if (oU[i] !== nU[i]) {
        const tail = nU.slice(i);
        if (oU.endsWith(tail))
          return { type: 'deletion', description: `Делеция ${diff} п.н. в позиции ${i + 1}` };
        break;
      }
    }
    return { type: 'deletion', description: `Делеция ${diff} п.н.` };
  }

  if (nU.length === oU.length) {
    const diffs = countMismatches(oU, nU);
    if (diffs <= 3) {
      const positions = [];
      for (let i = 0; i < oU.length; i++) {
        if (oU[i] !== nU[i]) positions.push(`${oU[i]}${i + 1}${nU[i]}`);
      }
      return { type: 'mutation', description: `Замены: ${positions.join(', ')}` };
    }
    return { type: 'mutation', description: `${diffs} замен` };
  }

  if (nU.length > oU.length) {
    const diff = nU.length - oU.length;
    if (nU.startsWith(oU))
      return { type: 'insertion', description: `3'-вставка ${diff} п.н.` };
    if (nU.endsWith(oU))
      return { type: 'insertion', description: `5'-вставка ${diff} п.н.` };
    return { type: 'insertion', description: `Вставка ${diff} п.н.` };
  }

  return { type: 'other', description: 'Модификация последовательности' };
}

/** Suggest a variant name based on parent name and modification. */
export function suggestVariantName(parentName, modification, existingNames) {
  const base = parentName || 'Part';
  const names = new Set(existingNames || []);

  if (modification?.type === 'truncation') {
    // Try PglaA-500 style (by length)
    return base;
  }

  // Try incrementing: PglaA-v2, PglaA-v3, etc.
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-v${i}`;
    if (!names.has(candidate)) return candidate;
  }
  return `${base}-variant`;
}

/** Find the root part of a variant chain. */
export function findRoot(partId, partsMap) {
  let current = partsMap[partId];
  while (current?.parentId && partsMap[current.parentId]) {
    current = partsMap[current.parentId];
  }
  return current;
}

/** Collect all variants in a family (root + all descendants). */
export function collectFamily(partId, parts) {
  const map = {};
  parts.forEach(p => { map[p.id] = p; });
  const root = findRoot(partId, map);
  if (!root) return [];
  const family = [root];
  const queue = [root.id];
  while (queue.length) {
    const pid = queue.shift();
    parts.forEach(p => {
      if (p.parentId === pid && !family.includes(p)) {
        family.push(p);
        queue.push(p.id);
      }
    });
  }
  return family;
}

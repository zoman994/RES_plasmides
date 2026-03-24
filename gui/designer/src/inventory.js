/** Inventory — localStorage CRUD for measured PCR products and plasmids. */

const KEY = 'pvcs-inventory';

export function getInventory() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function addToInventory(item) {
  const inv = getInventory();
  const entry = { id: `inv_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, ...item, createdAt: new Date().toISOString() };
  inv.push(entry);
  localStorage.setItem(KEY, JSON.stringify(inv));
  return entry;
}

export function updateInventoryItem(id, updates) {
  const inv = getInventory();
  const i = inv.findIndex(x => x.id === id);
  if (i >= 0) { inv[i] = { ...inv[i], ...updates }; localStorage.setItem(KEY, JSON.stringify(inv)); }
}

export function removeFromInventory(id) {
  localStorage.setItem(KEY, JSON.stringify(getInventory().filter(x => x.id !== id)));
}

export function getPCRProducts() {
  return getInventory().filter(i => i.type === 'pcr_product').sort((a, b) => b.createdAt?.localeCompare(a.createdAt));
}

export function getVerifiedPlasmids() {
  return getInventory().filter(i => i.type === 'plasmid' && i.verified).sort((a, b) => b.createdAt?.localeCompare(a.createdAt));
}

/** Part collections — curated sets of parts for specific projects. */

const COLL_KEY = 'pvcs-collections';

export function getCollections() {
  try { return JSON.parse(localStorage.getItem(COLL_KEY) || '[]'); } catch { return []; }
}

export function saveCollections(colls) {
  localStorage.setItem(COLL_KEY, JSON.stringify(colls));
}

export function createCollection(name) {
  const colls = getCollections();
  const c = { id: `col_${Date.now()}`, name, partIds: [], createdAt: new Date().toISOString() };
  colls.push(c);
  saveCollections(colls);
  return c;
}

export function addToCollection(collId, partId) {
  const colls = getCollections();
  const c = colls.find(x => x.id === collId);
  if (c && !c.partIds.includes(partId)) { c.partIds.push(partId); saveCollections(colls); }
}

export function removeFromCollection(collId, partId) {
  const colls = getCollections();
  const c = colls.find(x => x.id === collId);
  if (c) { c.partIds = c.partIds.filter(id => id !== partId); saveCollections(colls); }
}

export function deleteCollection(collId) {
  saveCollections(getCollections().filter(c => c.id !== collId));
}

export function renameCollection(collId, name) {
  const colls = getCollections();
  const c = colls.find(x => x.id === collId);
  if (c) { c.name = name; saveCollections(colls); }
}

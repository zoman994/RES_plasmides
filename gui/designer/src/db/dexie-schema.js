import Dexie from 'dexie';

export const DB_NAME = 'bodgegene-db';
export const DB_VERSION = 1;

export class BodgeDB extends Dexie {
  constructor(name = DB_NAME) {
    super(name);
    this.version(DB_VERSION).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
    });
  }
}

let _db = null;

export function getDB() {
  if (!_db) _db = new BodgeDB();
  return _db;
}

export function resetDBForTests(name) {
  if (_db) {
    try { _db.close(); } catch { /* ignore */ }
  }
  _db = name ? new BodgeDB(name) : null;
  return _db;
}

export async function putProject(record) {
  return getDB().projects.put(record);
}

export async function getProject(id) {
  return getDB().projects.get(id);
}

export async function listAllProjects() {
  return getDB().projects.toArray();
}

export async function listRecentProjects(limit = 10) {
  const all = await getDB().projects.orderBy('updatedAt').reverse().toArray();
  return all.slice(0, limit);
}

export async function deleteProject(id) {
  const db = getDB();
  await db.transaction('rw', db.projects, db.containers, async () => {
    await db.projects.delete(id);
    await db.containers.where('projectId').equals(id).delete();
  });
}

export async function clearAll() {
  const db = getDB();
  await db.transaction('rw', db.projects, db.containers, async () => {
    await db.projects.clear();
    await db.containers.clear();
  });
}

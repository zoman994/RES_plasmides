/**
 * Sprint Catalog Polish FIX F3 — parts annotation `.level = 'region'` migration.
 *
 * Ensures legacy `mine` parts whose annotations carry no `level` get backfilled
 * once on rehydrate; idempotent on subsequent loads via the
 * `partsSchemaVersion` marker.
 */
import { describe, it, expect } from 'vitest';
import { migratePartsAnnotationLevel, PARTS_SCHEMA_VERSION } from '../store/parts-migration';

const OLD_PART = {
  id: 'mine_lac',
  name: 'lacP',
  type: 'promoter',
  sequence: 'ATGC',
  annotations: [
    { id: 'a1', start: 0, end: 4, type: 'promoter', name: 'lacP' }, // no level
    { id: 'a2', start: 0, end: 4, type: 'misc', name: 'tag' },      // no level
  ],
};

const NEW_PART = {
  id: 'mine_t7',
  name: 'T7',
  type: 'promoter',
  sequence: 'GG',
  annotations: [
    { id: 'b1', start: 0, end: 2, level: 'region', type: 'promoter', name: 'T7' },
  ],
};

const MIXED_PART = {
  id: 'mine_mixed',
  name: 'M',
  type: 'CDS',
  sequence: 'AAAA',
  annotations: [
    { id: 'c1', start: 0, end: 4, level: 'region', type: 'CDS', name: 'cds' }, // keep
    { id: 'c2', start: 1, end: 3, type: 'misc' },                              // backfill
  ],
};

describe('F3 migratePartsAnnotationLevel', () => {
  it('old shape (no level on any annotation) → all annotations get level=region', () => {
    const { parts, schemaVersion, changed } = migratePartsAnnotationLevel([OLD_PART], undefined);
    expect(changed).toBe(true);
    expect(schemaVersion).toBe(PARTS_SCHEMA_VERSION);
    expect(parts[0].annotations.every((a) => a.level === 'region')).toBe(true);
  });

  it('new shape (already has level=region) → no-op, returns same parts ref content', () => {
    const { parts, schemaVersion, changed } = migratePartsAnnotationLevel([NEW_PART], undefined);
    expect(changed).toBe(false);
    expect(schemaVersion).toBe(PARTS_SCHEMA_VERSION);
    expect(parts[0].annotations[0].level).toBe('region');
  });

  it('mixed (some level present, some missing) → empty backfilled, existing untouched', () => {
    const { parts, changed } = migratePartsAnnotationLevel([MIXED_PART], undefined);
    expect(changed).toBe(true);
    expect(parts[0].annotations[0].level).toBe('region');
    expect(parts[0].annotations[0].id).toBe('c1');
    expect(parts[0].annotations[1].level).toBe('region');
    expect(parts[0].annotations[1].type).toBe('misc'); // existing fields preserved
  });

  it('schemaVersion already >= 2 → no-op even with old-shape data (idempotent guard)', () => {
    const { parts, changed } = migratePartsAnnotationLevel([OLD_PART], PARTS_SCHEMA_VERSION);
    expect(changed).toBe(false);
    // OLD_PART left unchanged — guard prevents re-migration on subsequent rehydrate.
    expect(parts[0].annotations[0].level).toBeUndefined();
  });

  it('repeated migration on already-migrated parts is a no-op (idempotent on output)', () => {
    const first = migratePartsAnnotationLevel([OLD_PART], undefined);
    expect(first.changed).toBe(true);
    const second = migratePartsAnnotationLevel(first.parts, first.schemaVersion);
    expect(second.changed).toBe(false);
    expect(second.parts).toBe(first.parts); // input forwarded as-is
  });

  it('handles undefined / empty parts gracefully', () => {
    const r1 = migratePartsAnnotationLevel(undefined, undefined);
    expect(r1.changed).toBe(false);
    expect(r1.parts).toEqual([]);
    expect(r1.schemaVersion).toBe(PARTS_SCHEMA_VERSION);
    const r2 = migratePartsAnnotationLevel([], undefined);
    expect(r2.changed).toBe(false);
    expect(r2.schemaVersion).toBe(PARTS_SCHEMA_VERSION);
  });
});

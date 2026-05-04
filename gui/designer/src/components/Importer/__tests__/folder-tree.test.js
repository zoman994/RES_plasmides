/**
 * folder-tree.test.js — Sprint M-X.3 K1 coverage for the shared
 * tag-prefix-folder tree builder. The CatalogColumn-side copy of
 * `buildFolderTree` was already battle-tested through render
 * snapshots; these tests lock the behaviour in the new shared
 * module so PreImportModal + CatalogColumn cannot drift apart.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildFolderTree, readFolders, readFolderTree } from '../lib/folder-tree';

describe('buildFolderTree', () => {
  it('returns [] for empty / non-array input', () => {
    expect(buildFolderTree([])).toEqual([]);
    expect(buildFolderTree(null)).toEqual([]);
    expect(buildFolderTree(undefined)).toEqual([]);
    expect(buildFolderTree('Vectors')).toEqual([]);
  });

  it('builds a flat forest when no slashes are present', () => {
    const tree = buildFolderTree(['Vectors', 'Promoters', 'CDS']);
    expect(tree).toHaveLength(3);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
    // Sorted alphabetically (parents-before-children sort is stable).
    expect(tree.map((n) => n.path)).toEqual(['CDS', 'Promoters', 'Vectors']);
  });

  it('nests children under their parent', () => {
    const tree = buildFolderTree(['Vectors', 'Vectors/CRISPR', 'Vectors/Cloning']);
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe('Vectors');
    expect(tree[0].children.map((c) => c.path)).toEqual(['Vectors/CRISPR', 'Vectors/Cloning']);
    expect(tree[0].children.every((c) => c.children.length === 0)).toBe(true);
  });

  it('orphan (parent missing) lands as a root', () => {
    const tree = buildFolderTree(['Vectors/CRISPR']); // parent 'Vectors' absent
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe('Vectors/CRISPR');
  });

  it('skips empty / non-string entries', () => {
    const tree = buildFolderTree(['Vectors', '', null, 0, 'Promoters']);
    expect(tree.map((n) => n.path)).toEqual(['Promoters', 'Vectors']);
  });
});

describe('readFolders + readFolderTree', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('returns [] when no localStorage entry exists', () => {
    expect(readFolders('mine')).toEqual([]);
    expect(readFolderTree('mine')).toEqual([]);
  });

  it('reads the per-group entry from the multi-group storage key', () => {
    localStorage.setItem(
      'pvcs-catalog-user-folders-by-group',
      JSON.stringify({ mine: ['Vectors', 'Vectors/CRISPR'], snapgene: ['Anything'] })
    );
    expect(readFolders('mine')).toEqual(['Vectors', 'Vectors/CRISPR']);
    expect(readFolders('snapgene')).toEqual(['Anything']);
    expect(readFolders('canvas')).toEqual([]);
  });

  it('migrates the legacy single-array key as `mine` (no write-back)', () => {
    localStorage.setItem('pvcs-catalog-user-folders', JSON.stringify(['Lab', 'Lab/2025']));
    expect(readFolders('mine')).toEqual(['Lab', 'Lab/2025']);
    // No write-back: the legacy key still owns the data; CatalogColumn
    // is the one that migrates with a write.
    expect(localStorage.getItem('pvcs-catalog-user-folders-by-group')).toBeNull();
  });

  it('readFolderTree wraps readFolders + buildFolderTree', () => {
    localStorage.setItem(
      'pvcs-catalog-user-folders-by-group',
      JSON.stringify({ mine: ['Vectors', 'Vectors/CRISPR'] })
    );
    const tree = readFolderTree('mine');
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe('Vectors');
    expect(tree[0].children[0].path).toBe('Vectors/CRISPR');
  });

  it('survives malformed JSON without throwing', () => {
    localStorage.setItem('pvcs-catalog-user-folders-by-group', 'not-json');
    expect(readFolders('mine')).toEqual([]);
  });
});

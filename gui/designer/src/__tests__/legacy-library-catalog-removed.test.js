import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const REMOVED_PATHS = [
  'components/Library/hooks/useLibrarySources.js',
  'components/Library/lib/catalog-cache.js',
  'components/Library/lib/length-pattern.js',
  'components/Library/lib/__tests__/catalog-cache.test.js',
  'components/Library/lib/__tests__/length-pattern.test.js',
];

function productionSources(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') files.push(...productionSources(path));
    } else if (/\.[jt]sx?$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function importSpecifiers(source) {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

describe('legacy Library catalog closure', () => {
  it('keeps the retired catalog modules and their direct tests absent', () => {
    const present = REMOVED_PATHS.filter((path) => existsSync(resolve(SRC_ROOT, path)));
    expect(present).toEqual([]);
  });

  it('keeps production code free of imports from the retired catalog cluster', () => {
    const offenders = productionSources(SRC_ROOT).flatMap((file) =>
      importSpecifiers(readFileSync(file, 'utf8'))
        .filter((specifier) => /(?:useLibrarySources|catalog-cache|length-pattern)$/.test(specifier))
        .map((specifier) => `${relative(SRC_ROOT, file)} -> ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });
});

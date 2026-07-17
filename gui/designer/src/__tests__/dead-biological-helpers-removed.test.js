import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(__dirname, '..');
const RETIRED = [
  resolve(SRC, 'plasmid-sequence.js'),
  resolve(SRC, 'lib/split-annotations.js'),
  resolve(SRC, '__tests__/plasmid-sequence.test.js'),
  resolve(SRC, '__tests__/split-annotations.test.js'),
];

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.(?:js|jsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('retired fragment-level biological helpers stay removed', () => {
  it('does not keep the isolated modules or their direct tests', () => {
    expect(RETIRED.filter(existsSync)).toEqual([]);
  });

  it('has no remaining source reference to their old API', () => {
    const currentTest = resolve(__filename);
    const references = sourceFiles(SRC)
      .filter((path) => resolve(path) !== currentTest)
      .filter((path) => /buildPlasmidSequence|trimAnnotationsForSubFragment/.test(
        readFileSync(path, 'utf8'),
      ));
    expect(references).toEqual([]);
  });
});

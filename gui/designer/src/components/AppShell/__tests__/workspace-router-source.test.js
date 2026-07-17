import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { describe, expect, it } from 'vitest';

const ROUTER_SOURCE = readFileSync(
  resolve(cwd(), 'src/components/AppShell/index.jsx'),
  'utf8',
);

describe('WorkspaceRouter retired-route contract', () => {
  it('does not lazy-load or render the retired importer workspace', () => {
    expect(ROUTER_SOURCE).not.toMatch(/import\(['"]\.\.\/Library['"]\)/);
    expect(ROUTER_SOURCE).not.toMatch(/active\s*===\s*['"]importer['"]/);
  });
});

/**
 * K1 boundary — the WHOLE components/Search cluster is UI-only. Every non-test
 * source file (recursively) may import ONLY: react, the project Icon, and paths
 * that RESOLVE to inside the cluster. Any import that resolves to the store,
 * query parser, search profiles, the facade/service, workers, document/enzyme
 * adapters, or a biological DB fails this test — including `./../store/foo`
 * (which merely *starts with* `./` but resolves OUTSIDE), re-exports, and
 * dynamic `import()` / `require()`.
 *
 * Import extraction is AST-based (@babel/parser), NOT regex: a regex that only
 * inspects the first argument character is fooled by `import('./' + name)`
 * (starts with a quote, so it looks literal but is actually computed) and by a
 * comment after the literal. The AST resolves the real argument node type, so a
 * concatenation / identifier / call is correctly flagged as an unverifiable
 * dynamic import (fail-closed), while an import of a literal with a trailing
 * inline comment is correctly read as that literal. Also bans emoji, inline hex,
 * and outline:none.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const SEARCH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_ABS = path.resolve(SEARCH_DIR, '../icons/Icon');

function walk(dir) {
  const out = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.name === '__tests__') continue;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...walk(full));
    else if (/\.jsx?$/.test(d.name) && !/\.test\.jsx?$/.test(d.name)) out.push(full);
  }
  return out;
}

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'range', 'leadingComments', 'trailingComments', 'innerComments', 'comments', 'tokens']);
function walkAst(node, visit) {
  if (Array.isArray(node)) { for (const n of node) walkAst(n, visit); return; }
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    walkAst(node[key], visit);
  }
}

// { specs: string[] (literal module specifiers), computed: string[] (dynamic
// import()/require() whose argument is NOT a plain string literal) }.
function analyzeImports(code) {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const specs = [];
  const computed = [];
  walkAst(ast.program, (node) => {
    if (node.type === 'ImportDeclaration' && node.source) specs.push(node.source.value);
    else if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) specs.push(node.source.value);
    else if (node.type === 'ImportExpression') {
      if (node.source && node.source.type === 'StringLiteral') specs.push(node.source.value);
      else computed.push('import()');
    } else if (node.type === 'CallExpression' && node.callee) {
      if (node.callee.type === 'Import') {
        const arg = node.arguments && node.arguments[0];
        if (arg && arg.type === 'StringLiteral') specs.push(arg.value);
        else computed.push('import()');
      } else if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
        const arg = node.arguments && node.arguments[0];
        if (arg && arg.type === 'StringLiteral') specs.push(arg.value);
        else computed.push('require()');
      }
    }
  });
  return { specs, computed };
}

function isInside(dir, p) {
  const rel = path.relative(dir, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// Allowed: react, the project Icon, and any specifier that RESOLVES inside the
// cluster. A bare package (store, zustand, engine, adapter, …) is rejected.
function isAllowedImport(spec, fromFile) {
  if (spec === 'react') return true;
  if (spec.startsWith('.')) {
    const resolved = path.resolve(path.dirname(fromFile), spec);
    if (resolved === ICON_ABS) return true;
    return isInside(SEARCH_DIR, resolved);
  }
  return false;
}

describe('components/Search — UI-only import boundary (AST)', () => {
  it('there are source files to check (guards against an empty walk passing vacuously)', () => {
    expect(walk(SEARCH_DIR).length).toBeGreaterThanOrEqual(5);
  });

  it('no file imports anything that resolves outside the cluster (except react + Icon)', () => {
    const violations = [];
    for (const file of walk(SEARCH_DIR)) {
      const { specs } = analyzeImports(readFileSync(file, 'utf8'));
      for (const spec of specs) {
        if (!isAllowedImport(spec, file)) violations.push(`${path.relative(SEARCH_DIR, file)} → '${spec}'`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file uses a computed/dynamic import (unverifiable → forbidden)', () => {
    const violations = [];
    for (const file of walk(SEARCH_DIR)) {
      const { computed } = analyzeImports(readFileSync(file, 'utf8'));
      if (computed.length) violations.push(`${path.relative(SEARCH_DIR, file)} → ${computed.join(', ')}`);
    }
    expect(violations).toEqual([]);
  });
});

describe('components/Search — boundary analyzer (self-test, AST is not fooled)', () => {
  const fromFile = path.join(SEARCH_DIR, 'SearchField.jsx');

  it('accepts react, the Icon, and in-cluster siblings/subdirs; rejects escapes + bare packages', () => {
    expect(isAllowedImport('react', fromFile)).toBe(true);
    expect(isAllowedImport('../icons/Icon', fromFile)).toBe(true);
    expect(isAllowedImport('./searchUiContract', fromFile)).toBe(true);
    expect(isAllowedImport('./../store/uiSlice', fromFile)).toBe(false);
    expect(isAllowedImport('../../lib/library-search', fromFile)).toBe(false);
    expect(isAllowedImport('zustand', fromFile)).toBe(false);
  });

  it('extracts static / re-export / literal-dynamic / require specifiers', () => {
    const { specs, computed } = analyzeImports(`
      import a from './ok';
      export { b } from './../store/leak';
      const c = import('../../lib/library-search');
      const d = require('zustand');
    `);
    expect(specs).toEqual(expect.arrayContaining(['./ok', './../store/leak', '../../lib/library-search', 'zustand']));
    expect(computed).toEqual([]);
  });

  it('FLAGS concatenation — import("./" + name) is computed, not a literal "./"', () => {
    const { specs, computed } = analyzeImports('const x = import("./" + name);');
    expect(computed.length).toBe(1);
    expect(specs).not.toContain('./'); // the old regex would wrongly capture './'
  });

  it('reads a literal despite a trailing comment; flags identifier / call args', () => {
    expect(analyzeImports("const x = import('a' /* c */);").specs).toContain('a');
    expect(analyzeImports("const x = import('a' /* c */);").computed).toEqual([]);
    expect(analyzeImports('const x = import(modulePath);').computed.length).toBe(1);
    expect(analyzeImports('const x = require(resolve(p));').computed.length).toBe(1);
  });

  it('treats import with a second (options) argument as a literal source', () => {
    const { specs, computed } = analyzeImports("const x = import('a', { with: { type: 'json' } });");
    expect(specs).toContain('a');
    expect(computed).toEqual([]);
  });
});

describe('components/Search — design-system hygiene (recursive)', () => {
  it('no emoji / pictographs (typographic arrows and math symbols are fine)', () => {
    const offenders = walk(SEARCH_DIR).filter((f) => /\p{Extended_Pictographic}/u.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SEARCH_DIR, f))).toEqual([]);
  });

  it('no inline hex colours (tokens only)', () => {
    const offenders = walk(SEARCH_DIR).filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SEARCH_DIR, f))).toEqual([]);
  });

  it('no outline:none anywhere (a keyboard user must see focus)', () => {
    const offenders = walk(SEARCH_DIR).filter((f) => /outline(Style)?['"\s:]+['"]?none/i.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SEARCH_DIR, f))).toEqual([]);
  });
});

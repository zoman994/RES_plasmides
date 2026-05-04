/**
 * Sprint M-B.2 K6 — STRINGS sweep / coverage guard.
 *
 * Verifies every key in IMPORTER_STRINGS is referenced from at least one
 * file under components/Importer/ OR a known external mount-point
 * (Topbar import button). New unused keys → failure → forces author to
 * either delete the key or wire it into the UI.
 *
 * Pure regex grep over source files; does not exercise React. fs reads
 * stay scoped to the project tree.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { IMPORTER_STRINGS } from '../lib/importer-strings';

const REPO_ROOT = resolve(__dirname, '../../../../');
const IMPORTER_DIR = resolve(REPO_ROOT, 'src/components/Importer');
const SEQUENCE_VIEW_DIR = resolve(REPO_ROOT, 'src/components/SequenceView');
const EXTERNAL_KNOWN_FILES = [
  resolve(REPO_ROOT, 'src/components/AppShell/Topbar.jsx'),
];

function walkExternal(dir, out = []) {
  // Sprint M-X.2 K3 — annotation editing popups + Annotator UI live
  // under components/SequenceView/popups and components/Annotator,
  // but reference STRINGS.importer.annotationEdit / .annotator. We
  // deliberately namespace under `importer` because the Inspector
  // owns the editing surface; widen the source-blob scan rather
  // than fork the dictionary.
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === '__tests__') continue;
      walkExternal(full, out);
    } else if (full.endsWith('.jsx') || full.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'lib') {
      // include lib (importer-strings) but skip tests
      if (entry === '__tests__') continue;
    }
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (full.endsWith('.jsx') || full.endsWith('.js')) {
      if (full.endsWith('importer-strings.js')) continue;
      if (full.includes(`__tests__`)) continue;
      out.push(full);
    }
  }
  return out;
}

const ANNOTATOR_DIR = resolve(REPO_ROOT, 'src/components/Annotator');

let externalAnnotatorFiles = [];
try { externalAnnotatorFiles = walkExternal(ANNOTATOR_DIR); } catch { /* dir may not exist yet */ }

const SOURCE_FILES = [
  ...walk(IMPORTER_DIR),
  ...walkExternal(SEQUENCE_VIEW_DIR),
  ...externalAnnotatorFiles,
  ...EXTERNAL_KNOWN_FILES,
];
const SOURCE_BLOB = SOURCE_FILES.map((p) => readFileSync(p, 'utf8')).join('\n');

describe('M-B.2 K6 — IMPORTER_STRINGS coverage', () => {
  it('every defined key appears in at least one source file', () => {
    const orphans = [];
    for (const key of Object.keys(IMPORTER_STRINGS)) {
      // Match S.<key> OR STRINGS.importer.<key> followed by a non-word char.
      const re = new RegExp(`(\\bS\\.${key}\\b|\\bSTRINGS\\.importer\\.${key}\\b)`);
      if (!re.test(SOURCE_BLOB)) orphans.push(key);
    }
    expect(orphans).toEqual([]);
  });
});

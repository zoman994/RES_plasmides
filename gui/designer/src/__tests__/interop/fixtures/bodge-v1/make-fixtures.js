/**
 * Generates the frozen v1 .bodge reference fixtures used by K1/K8 tests.
 *
 * Re-run from this directory after schema-touching changes:
 *   node make-fixtures.js
 *
 * Output: v1-empty.bodge, v1-with-library.bodge, v1-with-extras.bodge.
 */
import { zipSync, strToU8 } from 'fflate';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const V1_MANIFEST = {
  fileFormatVersion: 1,
  schemaVersion: 1,
  appVersion: '0.8.3-alpha',
  createdAt: '2026-04-01T10:00:00.000Z',
  updatedAt: '2026-05-18T14:00:00.000Z',
};

const PROJECT_EMPTY = {
  id: '01900000-7000-7000-8000-000000000001',
  schemaVer: 1,
  name: 'Empty v1 project',
  description: '',
  tags: [],
  createdAt: V1_MANIFEST.createdAt,
  updatedAt: V1_MANIFEST.updatedAt,
  agent: { name: 'Igor', email: '' },
  containerIds: [],
  projectCommitIds: [],
  primerIds: [],
  settings: {},
  ext: {},
};

const PROJECT_WITH_LIBRARY = {
  ...PROJECT_EMPTY,
  id: '01900000-7000-7000-8000-000000000002',
  name: 'v1 with library',
  tags: ['demo', 'fixture'],
};

const LIBRARY_ENTRIES = [
  {
    id: 'le01XYZ',
    kind: 'container',
    name: 'pUC19',
    resourceHash: 'sha256:abc',
    payload: { sequence: 'atgc'.repeat(50), topology: 'circular', annotations: [] },
    tags: ['standard', 'cloning-vector'],
    status: 'verified',
    projectId: PROJECT_WITH_LIBRARY.id,
  },
];

function writeFixture(name, files) {
  const zipped = zipSync(files);
  const outPath = resolve(__dirname, name);
  writeFileSync(outPath, Buffer.from(zipped));
  // eslint-disable-next-line no-console
  console.log(`wrote ${outPath} (${zipped.length} bytes)`);
}

writeFixture('v1-empty.bodge', {
  'manifest.json': strToU8(JSON.stringify(V1_MANIFEST, null, 2)),
  'project.json': strToU8(JSON.stringify(PROJECT_EMPTY, null, 2)),
});

writeFixture('v1-with-library.bodge', {
  'manifest.json': strToU8(JSON.stringify(V1_MANIFEST, null, 2)),
  'project.json': strToU8(JSON.stringify(PROJECT_WITH_LIBRARY, null, 2)),
  'library/entries.json': strToU8(JSON.stringify(LIBRARY_ENTRIES, null, 2)),
});

writeFixture('v1-with-extras.bodge', {
  'manifest.json': strToU8(JSON.stringify(V1_MANIFEST, null, 2)),
  'project.json': strToU8(JSON.stringify(PROJECT_WITH_LIBRARY, null, 2)),
  'containers/c01XYZ.json': strToU8('{}'),
  'primers/pool.json': strToU8('[]'),
});

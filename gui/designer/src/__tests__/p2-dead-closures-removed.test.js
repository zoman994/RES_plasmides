import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(SRC, '../../..');

const RETIRED = [
  'components/CanvasSkeleton/canvas/MaterializeCloneModal.jsx',
  'components/CanvasSkeleton/__tests__/variant-ui.test.jsx',
  'components/SequenceView/tracks/FeatureGlyph.jsx',
  'components/SequenceView/tracks/feature-glyph-shapes.js',
  'components/SequenceView/__tests__/feature-glyph.test.jsx',
  'components/SequenceView/__tests__/feature-glyph-shapes.test.js',
  'lib/plasmid-git-reducers.js',
  'lib/plasmid-git.js',
  'lib/__tests__/plasmid-git.test.js',
];

const read = (path) => readFileSync(resolve(REPO, path), 'utf8');

describe('P2 dead closures stay retired without deleting live contracts', () => {
  it('removes the nine test-only files and stale names while retaining current models', () => {
    const violations = RETIRED
      .filter((path) => existsSync(resolve(SRC, path)))
      .map((path) => `retired file remains: ${path}`);

    const staleReferences = [
      ['gui/designer/src/lib/strings.js', /\bmaterialize:\s*\{/],
      ['gui/designer/src/lib/ids.js', /lib\/plasmid-git\.js/],
      ['gui/designer/src/canvas/ExportProjectModal.jsx', /Plasmid-git history/],
      ['docs/BACKLOG.md', /MaterializeCloneModal|FeatureGlyph|old fragment-git contract/],
      ['docs/specs/ASSEMBLY_WORKBENCH.md', /FeatureGlyph/],
    ];
    for (const [path, pattern] of staleReferences) {
      if (pattern.test(read(path))) violations.push(`stale reference remains: ${path}`);
    }

    const i18n = read('gui/designer/src/i18n.js');
    if ((i18n.match(/'export\.section\.containerHistory':/g) || []).length !== 2) {
      violations.push('neutral container-history label is not defined in both locales');
    }

    const modal = read('gui/designer/src/canvas/ExportProjectModal.jsx');
    if (!/t\('export\.section\.containerHistory'\)/.test(modal)) {
      violations.push('ExportProjectModal does not consume the neutral i18n label');
    }

    const liveContracts = [
      ['gui/designer/src/components/CanvasSkeleton/store/skeleton-state-operations.js', /MATERIALIZE_REACTION/],
      ['gui/designer/src/components/CanvasSkeleton/store/skeleton-state-operations.js', /materializedClones/],
      ['gui/designer/src/components/SequenceView/tracks/AnnotationTrack.jsx', /SBOLIcon/],
      ['gui/designer/src/sbol-glyphs.jsx', /export function SBOLIcon/],
      ['gui/designer/src/lib/bodge-migrations/v1-to-v2.js', /plasmid-git-history-missing/],
      ['gui/designer/src/lib/bodge-export-profiles.js', /provenance\.commits/],
    ];
    for (const [path, pattern] of liveContracts) {
      if (!pattern.test(read(path))) violations.push(`live contract missing: ${path}`);
    }

    expect(violations).toEqual([]);
  });
});

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const REMOVED_MODULES = [
  'components/CanvasSkeleton/LibraryTreeHost.jsx',
  'components/CanvasSkeleton/canvas/PlaceholderTreePicker.jsx',
  'components/CanvasSkeleton/canvas/AssemblyDraftsPanel.jsx',
  'components/CanvasSkeleton/canvas/AssemblyDraftBlock.jsx',
  'components/QuickStart.jsx',
  'components/DagPlaceholder.jsx',
  'components/CanvasSkeleton/canvas/HoverOpIconRow.jsx',
  'inventory.js',
  'components/utils/fragment-topology.js',
  'components/CanvasSkeleton/canvas/OpRhombusTemplatePicker.jsx',
  'components/Search/SearchCombobox.jsx',
  'components/CanvasSkeleton/canvas/PieceContextMenu.jsx',
  'components/CanvasSkeleton/canvas/OpContextMenu.jsx',
  'components/CanvasSkeleton/editor/assembly-mode/SnippetOnboardingTip.jsx',
  'components/CanvasSkeleton/lib/snippet-catalog.js',
];

const REMOVED_DIRECT_TESTS = [
  'components/CanvasSkeleton/__tests__/library-tree-host-import-v104.test.jsx',
  'components/CanvasSkeleton/canvas/__tests__/PlaceholderTreePicker-v85.test.jsx',
  'components/CanvasSkeleton/__tests__/assembly-drafts-panel-v82.test.jsx',
  'components/CanvasSkeleton/__tests__/assembly-draft-block.test.jsx',
  'components/CanvasSkeleton/__tests__/pc-k6-assembly-drafts-counter.test.jsx',
  'components/Search/__tests__/SearchCombobox.test.jsx',
  'components/CanvasSkeleton/canvas/__tests__/PieceOpContextMenu.test.jsx',
  'components/CanvasSkeleton/__tests__/snippet-catalog.test.js',
];

const REMOVED_SPECIFIERS = [
  'LibraryTreeHost',
  'PlaceholderTreePicker',
  'AssemblyDraftsPanel',
  'AssemblyDraftBlock',
  'QuickStart',
  'DagPlaceholder',
  'HoverOpIconRow',
  'inventory',
  'fragment-topology',
  'OpRhombusTemplatePicker',
  'SearchCombobox',
  'PieceContextMenu',
  'OpContextMenu',
  'SnippetOnboardingTip',
  'snippet-catalog',
];

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.js', '.jsx'].includes(extname(entry.name)) ? [path] : [];
  });
}

describe('dead canvas closure', () => {
  it('keeps retired modules and their direct tests absent', () => {
    const lingering = [...REMOVED_MODULES, ...REMOVED_DIRECT_TESTS]
      .filter((path) => existsSync(join(SRC_ROOT, path)));

    expect(lingering).toEqual([]);
  });

  it('has no remaining static or dynamic import of a retired module', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const importLike = /(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g;
    const lingering = [];

    for (const path of sourceFiles(SRC_ROOT)) {
      if (path === thisFile) continue;
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(importLike)) {
        const basename = match[1].split('/').at(-1).replace(/\.(?:js|jsx)$/, '');
        if (REMOVED_SPECIFIERS.includes(basename)) {
          lingering.push(`${relative(SRC_ROOT, path)} -> ${match[1]}`);
        }
      }
    }

    expect(lingering).toEqual([]);
  });
});

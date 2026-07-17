import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..');
const INDEX_CSS = readFileSync(resolve(SRC, 'index.css'), 'utf8');
const START_SCREEN_CSS = readFileSync(
  resolve(SRC, 'components/StartScreen/StartScreen.css'),
  'utf8',
);

describe('global cleanup: retired CSS stays removed', () => {
  it('drops legacy global selectors, keyframes, and private token families', () => {
    expect(INDEX_CSS).not.toMatch(/--zone-/);
    expect(INDEX_CSS).not.toMatch(/--sanger-/);
    expect(INDEX_CSS).not.toMatch(/--ss-(?:bg|text|border|accent)-/);
    expect(INDEX_CSS).not.toMatch(/^\.ss-(?:action|sb|header|recent|tag|card|view|install)/m);
    expect(INDEX_CSS).not.toContain('save-flash-bounce');
    expect(INDEX_CSS).not.toContain('editable-pulse');
    expect(INDEX_CSS).not.toMatch(/--border-radius-(?:md|lg)\s*:/);
    expect(INDEX_CSS).not.toContain('docs/SPRINT_M-A.md');
    expect(INDEX_CSS).not.toContain('`--ss-*` aliases');
  });

  it('drops StartScreen selectors whose DOM producers no longer exist', () => {
    expect(START_SCREEN_CSS).not.toMatch(/^\.start-screen-root \.kbd\s*\{/m);
    expect(START_SCREEN_CSS).not.toContain('.start-screen-root .top-search');
    expect(START_SCREEN_CSS).not.toContain('.start-screen-root .status-dot.unsaved');
    expect(START_SCREEN_CSS).not.toContain('.start-screen-root .sb.collapsed .sb-name');
  });

  it('keeps the explicitly excluded P2 and documented contracts', () => {
    expect(INDEX_CSS).toContain('.sequence');
    expect(INDEX_CSS).toMatch(/--success-bg\s*:/);
    expect(INDEX_CSS).toMatch(/--radius-xl\s*:/);
    expect(INDEX_CSS).toMatch(/--shadow-sm\s*:/);
    expect(START_SCREEN_CSS).toContain('.start-screen-root .sb-item[disabled]');
    expect(START_SCREEN_CSS).toContain('.start-screen-root .badge-soon');
  });
});

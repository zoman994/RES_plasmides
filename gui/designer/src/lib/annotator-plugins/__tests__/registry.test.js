/**
 * annotator-plugins registry — Sprint M-X.2 K7 coverage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPlugin,
  getAllPlugins,
  getPluginById,
  getAvailablePlugins,
  _resetRegistry,
} from '../registry.js';

const fakePlugin = (id, available = true) => ({
  id,
  name: `Plugin ${id}`,
  shortDescription: '',
  capabilities: { needsRegion: false, fullSequenceOk: true, async: false, requiresNetwork: false, requiresBackend: false, speedHint: 'instant' },
  isAvailable: () => available,
  run: async () => ({ pluginId: id, regions: [] }),
});

describe('K7 registry', () => {
  beforeEach(() => { _resetRegistry(); });

  it('registerPlugin + getAllPlugins reflects registration order', () => {
    registerPlugin(fakePlugin('a'));
    registerPlugin(fakePlugin('b'));
    registerPlugin(fakePlugin('c'));
    expect(getAllPlugins().map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('getPluginById returns null for unknown id', () => {
    expect(getPluginById('nope')).toBeNull();
  });

  it('getAvailablePlugins filters by isAvailable', () => {
    registerPlugin(fakePlugin('a', true));
    registerPlugin(fakePlugin('b', false));
    registerPlugin(fakePlugin('c', true));
    const ids = getAvailablePlugins({}).map((p) => p.id).sort();
    expect(ids).toEqual(['a', 'c']);
  });

  it('register is idempotent on the same id (overwrite)', () => {
    registerPlugin(fakePlugin('a'));
    registerPlugin({ ...fakePlugin('a'), name: 'updated' });
    expect(getAllPlugins()).toHaveLength(1);
    expect(getPluginById('a').name).toBe('updated');
  });

  it('module-load registration: importing the index registers all 6 plugins', async () => {
    _resetRegistry();
    await import('../index.js');
    const ids = getAllPlugins().map((p) => p.id);
    expect(ids).toContain('orf-scan');
    expect(ids).toContain('sigma70-promoter');
    expect(ids).toContain('stem-loop-terminator');
    expect(ids).toContain('sgrna-scaffold');
    expect(ids).toContain('common-features-homology');
    expect(ids).toContain('blast-ncbi');
  });
});

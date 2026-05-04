/**
 * annotator-pipeline — Sprint M-X.2 K7 coverage. Tests the
 * orchestrator's parallel run / errors-isolated / region-scope
 * passing semantics on a curated mock-plugin registry.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { runAnnotatorPipeline } from '../annotator-pipeline.js';
import { registerPlugin, _resetRegistry } from '../annotator-plugins/registry.js';

function fakeOk(id, regions = []) {
  return {
    id,
    name: id,
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'instant' },
    isAvailable: () => true,
    run: async () => ({ pluginId: id, pluginName: id, regions, runAt: 0, parameters: {}, durationMs: 0 }),
  };
}
function fakeFail(id, msg) {
  return {
    id,
    name: id,
    capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'instant' },
    isAvailable: () => true,
    run: async () => { throw new Error(msg); },
  };
}

describe('K7 annotator-pipeline', () => {
  beforeEach(() => { _resetRegistry(); });

  it('runs only enabled plugins', async () => {
    registerPlugin(fakeOk('a', [{ id: 'a1', start: 0, end: 10 }]));
    registerPlugin(fakeOk('b', [{ id: 'b1', start: 10, end: 20 }]));
    registerPlugin(fakeOk('c', [{ id: 'c1', start: 20, end: 30 }]));
    const out = await runAnnotatorPipeline('AAAA', null, { a: true, c: true });
    expect(Object.keys(out.results).sort()).toEqual(['a', 'c']);
    expect(Object.keys(out.errors)).toHaveLength(0);
  });

  it('isolates a thrown error to its own bucket', async () => {
    registerPlugin(fakeOk('a', []));
    registerPlugin(fakeFail('b', 'boom'));
    const out = await runAnnotatorPipeline('AAAA', null, { a: true, b: true });
    expect(out.results.a).toBeDefined();
    expect(out.results.b).toBeUndefined();
    expect(out.errors.b).toBe('boom');
  });

  it('empty enabled set → empty results', async () => {
    registerPlugin(fakeOk('a', []));
    const out = await runAnnotatorPipeline('AAAA', null, {});
    expect(out.results).toEqual({});
    expect(out.errors).toEqual({});
  });

  it('passes region scope to plugins', async () => {
    let captured = null;
    registerPlugin({
      id: 'sniff',
      name: 'sniff',
      capabilities: { fullSequenceOk: true, async: false, needsRegion: false, requiresNetwork: false, requiresBackend: false, speedHint: 'instant' },
      isAvailable: () => true,
      run: async (_seq, region) => { captured = region; return { pluginId: 'sniff', regions: [], runAt: 0, parameters: {}, durationMs: 0 }; },
    });
    await runAnnotatorPipeline('AAAA', { start: 5, end: 15 }, { sniff: true });
    expect(captured).toEqual({ start: 5, end: 15 });
  });

  it('invokes onPluginStart / onPluginEnd hooks', async () => {
    registerPlugin(fakeOk('a', []));
    const events = [];
    await runAnnotatorPipeline('AAAA', null, { a: true }, {
      onPluginStart: (id) => events.push(`start:${id}`),
      onPluginEnd: (id) => events.push(`end:${id}`),
    });
    expect(events).toEqual(['start:a', 'end:a']);
  });
});

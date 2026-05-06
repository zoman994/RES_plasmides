/**
 * annotator-worker-client — Sprint v0.7.2 perf K1 coverage.
 *
 * Under vitest's happy-dom we want `runPluginInWorker` to bail out
 * with a `null` return so the pipeline falls back to the synchronous
 * main-thread plugin.run path. This test pins that contract — if a
 * future refactor flips the bail-out condition we'd hang every
 * pipeline test instead of getting a clean signal here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { runPluginInWorker, _resetAnnotatorWorker } from '../annotator-worker-client.js';

describe('annotator-worker-client (vitest happy-dom: null-bypass)', () => {
  beforeEach(() => { _resetAnnotatorWorker(); });

  it('returns null in vitest so the pipeline falls back to main thread', () => {
    const out = runPluginInWorker('any-plugin-id', 'AAAA', null, {});
    expect(out).toBeNull();
  });

  it('repeated calls keep returning null without crashing', () => {
    const a = runPluginInWorker('a', 'AAAA', null, {});
    const b = runPluginInWorker('b', 'CCCC', { start: 0, end: 4 }, { threshold: 0.5 });
    expect(a).toBeNull();
    expect(b).toBeNull();
  });
});

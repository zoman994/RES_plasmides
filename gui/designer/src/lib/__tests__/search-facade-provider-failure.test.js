/**
 * search-facade — fail-safe provider-failure diagnostics (task #168 P1-3).
 *
 * The `incomplete` flag must be FAIL-SAFE: only a superseded search (CANCELLED /
 * TERMINATED) is a normal drop. ANY other failure — including a plain Error from the
 * inline engine that carries no `reason` — must flag the session incomplete, never a
 * silent «nothing found». Isolated file: it mocks the sequence engine to throw.
 */
import { describe, it, expect, vi } from 'vitest';
import { createSearchFacade } from '../search-facade';
import { entryToDocument } from '../search-document-adapters';

// vitest hoists vi.mock above the imports at transform time, so the engine is mocked
// before search-worker-client (transitively imported by the facade) binds it.
vi.mock('../search-worker-core', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, searchAllSequences: () => { throw new Error('inline engine boom'); } };
});

const mk = (over) => entryToDocument({
  id: over.id, name: over.name, origin: { status: 'release' },
  payload: { sequence: over.seq || '', topology: 'linear', annotations: [] },
});
const DOCS = [mk({ id: 'a', name: 'plasmid-A', seq: 'AAAGAATTGCCC' })];

describe('createSearchFacade — provider failure is never a silent false negative', () => {
  it('an unknown Error (no reason) from the inline engine → session flagged incomplete', async () => {
    // No worker → inline client → runInline → the mocked engine throws a plain Error.
    const facade = createSearchFacade({});
    const out = await facade.search('seq:GAATTG', DOCS, {});
    expect(out.stale).toBe(false);
    expect(out.session.incomplete).toBe(true);
    expect(out.session.incompleteDims).toContain('sequence');
  });
});

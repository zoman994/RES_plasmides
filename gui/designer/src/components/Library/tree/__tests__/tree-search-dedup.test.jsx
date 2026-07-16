/**
 * tree-search-dedup — the tree filter now runs on the shared search engine
 * (query-classify + library-search::matchesEntry), not a name-only substring.
 * So tags / type / status / feature all filter the tree, and a project stays
 * visible when a CHILD matches by a non-name dimension (fixes the «child matched
 * by feature → parent hidden» bug). Empty query still shows everything.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useStore } from '../../../../store';
import { resetDBForTests } from '../../../../db/dexie-schema';
import { setLang } from '../../../../i18n';
import LibraryTreeRoot from '../LibraryTreeRoot';

async function freshDB() {
  const name = `bodgegene-treesearch-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

const container = (over = {}) => ({
  id: over.id,
  kind: 'container',
  name: over.name || 'pUC19',
  tags: over.tags || [],
  addedAt: new Date(2026, 0, 1).toISOString(),
  projectId: over.projectId ?? null,
  origin: over.origin || { kind: 'file_import' },
  payload: {
    length: over.length || 2686,
    topology: over.topology || 'circular',
    annotations: over.anns || [],
  },
  ...over,
});

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.projects = {};
    s.looseFolders = [];
    s.pinnedProjectIds = [];
    s.currentProjectId = null;
    s.workspace = { active: 'library', history: [], context: {} };
  });
});
afterEach(() => {
  setLang('ru');
  cleanup();
});

describe('LibraryTreeRoot — filter runs through its single shared session', () => {
  it('a TAG match reveals an entry whose NAME does not match', () => {
    useStore.setState((s) => {
      s.libraryEntries = { e1: container({ id: 'e1', name: 'pUC19', tags: ['bacterial'] }) };
    });
    render(<LibraryTreeRoot query="bacterial" />);
    // name-only would hide it (no «bacterial» in «pUC19»); the engine matches the tag.
    expect(screen.getByTestId('tree-item-loose-e1')).toBeTruthy();
  });

  it('a TYPE keyword («circular») filters by topology, not name', () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        c1: container({ id: 'c1', name: 'ring-one', topology: 'circular' }),
        l1: container({ id: 'l1', name: 'ring-two', topology: 'linear' }),
      };
    });
    render(<LibraryTreeRoot query="circular" />);
    expect(screen.getByTestId('tree-item-loose-c1')).toBeTruthy();
    expect(screen.queryByTestId('tree-item-loose-l1')).toBeNull();
  });

  it('a FEATURE name reveals the entry that carries it', () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        f1: container({ id: 'f1', name: 'plasmid-x', anns: [{ id: 'a1', name: 'AmpR', type: 'CDS' }] }),
      };
    });
    render(<LibraryTreeRoot query="AmpR" />);
    expect(screen.getByTestId('tree-item-loose-f1')).toBeTruthy();
  });

  it('empty query shows all entries (no filter)', () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        a: container({ id: 'a', name: 'alpha' }),
        b: container({ id: 'b', name: 'beta' }),
      };
    });
    render(<LibraryTreeRoot query="" />);
    expect(screen.getByTestId('tree-item-loose-a')).toBeTruthy();
    expect(screen.getByTestId('tree-item-loose-b')).toBeTruthy();
  });

  it('a non-matching name still hides the entry (parity with old behaviour)', () => {
    useStore.setState((s) => {
      s.libraryEntries = { z: container({ id: 'z', name: 'pUC19', tags: [] }) };
    });
    render(<LibraryTreeRoot query="zzz-nomatch" />);
    expect(screen.queryByTestId('tree-item-loose-z')).toBeNull();
  });
});

describe('LibraryTreeRoot — row enrichment from the shared session', () => {
  it('a name match highlights the matched substring', () => {
    useStore.setState((s) => { s.libraryEntries = { e1: container({ id: 'e1', name: 'pUC19' }) }; });
    render(<LibraryTreeRoot query="pUC" />);
    const row = screen.getByTestId('tree-item-loose-e1');
    expect(row.querySelector('mark').textContent).toBe('pUC');
  });
  it('a tag match shows a reason chip «тег» (no name highlight)', () => {
    useStore.setState((s) => { s.libraryEntries = { e1: container({ id: 'e1', name: 'pUC19', tags: ['bacterial'] }) }; });
    render(<LibraryTreeRoot query="bacterial" />);
    expect(screen.getByTestId('tree-item-loose-e1-reason').textContent).toBe('тег');
    expect(screen.getByTestId('tree-item-loose-e1').querySelector('mark')).toBeNull();
  });
  it('localizes a tree-row match reason in English', () => {
    setLang('en');
    useStore.setState((s) => { s.libraryEntries = { e1: container({ id: 'e1', name: 'pUC19', tags: ['bacterial'] }) }; });
    render(<LibraryTreeRoot query="bacterial" />);
    expect(screen.getByTestId('tree-item-loose-e1-reason').textContent).toBe('tag');
  });
  it('no query → no highlight, no reason chip', () => {
    useStore.setState((s) => { s.libraryEntries = { e1: container({ id: 'e1', name: 'pUC19' }) }; });
    render(<LibraryTreeRoot query="" />);
    expect(screen.getByTestId('tree-item-loose-e1').querySelector('mark')).toBeNull();
    expect(screen.queryByTestId('tree-item-loose-e1-reason')).toBeNull();
  });
});

describe('LibraryTreeRoot — project visibility via the engine (child match reveals parent)', () => {
  it('a project stays visible when a child matches by TAG (not name)', () => {
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'MyProject', containerIds: ['e1'], createdAt: '2026-01-01' } };
      s.libraryEntries = { e1: container({ id: 'e1', name: 'pUC19', tags: ['kanamycin'], projectId: 'p1' }) };
      s.currentProjectId = null;
    });
    render(<LibraryTreeRoot query="kanamycin" />);
    // The project zone header must render — child matched by tag reveals the parent.
    expect(screen.getByTestId('library-zone-project-p1')).toBeTruthy();
  });

  it('a project with NO matching child and non-matching name is hidden', () => {
    useStore.setState((s) => {
      s.projects = { p2: { id: 'p2', name: 'OtherProject', containerIds: ['e2'], createdAt: '2026-01-01' } };
      s.libraryEntries = { e2: container({ id: 'e2', name: 'pUC19', tags: [], projectId: 'p2' }) };
      s.currentProjectId = null;
    });
    render(<LibraryTreeRoot query="kanamycin" />);
    expect(screen.queryByTestId('library-zone-project-p2')).toBeNull();
  });

  it('a containerIds-only child reveals its project even without entry.projectId', () => {
    useStore.setState((s) => {
      s.projects = { p3: { id: 'p3', name: 'UnrelatedProjectName', containerIds: ['e3'], createdAt: '2026-01-01' } };
      s.libraryEntries = { e3: container({ id: 'e3', name: 'pUC19', tags: ['kanamycin'], projectId: null }) };
    });
    render(<LibraryTreeRoot query="kanamycin" />);
    expect(screen.getByTestId('library-zone-project-p3')).toBeTruthy();
  });
});

describe('LibraryTreeRoot — kind-aware project and primer documents', () => {
  it.each(['primer:T7', 'type:primer', 'status:archived'])(
    '%s finds the primer row through ref.kind=primer',
    (query) => {
      useStore.setState((s) => {
        s.libraryEntries = {
          pr1: container({
            id: 'pr1', kind: 'primer', name: 'T7 forward',
            origin: { kind: 'file_import', status: 'archived' },
            payload: { sequence: 'TAATACGACTCACTATAGGG', length: 20, tm: 58.2 },
          }),
          e1: container({ id: 'e1', name: 'unrelated molecule' }),
        };
      });
      render(<LibraryTreeRoot query={query} />);
      fireEvent.click(screen.getByTestId('tree-folder-loose-primers'));
      expect(screen.getByTestId('tree-item-loose-pr1')).toBeTruthy();
      expect(screen.queryByTestId('tree-item-loose-e1')).toBeNull();
    },
  );

  it('project:Alpha finds a project document, not a name-prefix literal', () => {
    useStore.setState((s) => {
      s.projects = { p1: { id: 'p1', name: 'Alpha', containerIds: [], createdAt: '2026-01-01' } };
    });
    render(<LibraryTreeRoot query="project:Alpha" />);
    expect(screen.getByTestId('library-zone-project-p1')).toBeTruthy();
  });
});

describe('LibraryTreeRoot — blocked and unsupported queries fail closed honestly', () => {
  it('shows a blocked diagnostic for a severity:error plan without a full-search action', () => {
    render(<LibraryTreeRoot query="primer:foo status:release" onRequestFullSearch={vi.fn()} />);
    expect(screen.getByTestId('tree-search-blocked')).toBeTruthy();
    expect(screen.queryByTestId('tree-full-search')).toBeNull();
    expect(screen.queryByTestId('tree-requires-full-search-action')).toBeNull();
  });

  it.each(['name:pUC', 'feature:glaA', 'in:Alpha'])(
    '%s is reported unsupported locally and never points to an equally unsupported global search',
    (query) => {
      render(<LibraryTreeRoot query={query} onRequestFullSearch={vi.fn()} />);
      expect(screen.getByTestId('tree-search-unsupported')).toBeTruthy();
      expect(screen.queryByTestId('tree-full-search')).toBeNull();
      expect(screen.queryByTestId('tree-requires-full-search-action')).toBeNull();
    },
  );

  it('localizes the full-search recovery notice and action', () => {
    setLang('en');
    render(<LibraryTreeRoot query="seq:GAATTC" onRequestFullSearch={vi.fn()} />);
    expect(screen.getByTestId('tree-search').getAttribute('placeholder')).toBe('Filter the library tree…');
    expect(screen.getByTestId('tree-search').getAttribute('aria-label')).toBe('Filter the library tree');
    expect(screen.getByTestId('tree-requires-full-search').textContent)
      .toContain('Sequence, protein, and restriction-site searches run in full search.');
    expect(screen.getByTestId('tree-requires-full-search-action').textContent).toBe('Open full search');
  });

  it('does not suppress the keyboard focus indicator on the quick-search input', () => {
    render(<LibraryTreeRoot query="" onQueryChange={vi.fn()} />);
    expect(screen.getByTestId('tree-search').style.outlineStyle).not.toBe('none');
  });
});

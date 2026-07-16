import 'fake-indexeddb/auto';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const calls = vi.hoisted(() => ({
  runSearch: vi.fn(),
  makeEntryMatcher: vi.fn(),
  describeEntryMatch: vi.fn(),
}));

vi.mock('../../../../lib/library-search', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runSearch: (...args) => {
      calls.runSearch(...args);
      return actual.runSearch(...args);
    },
    makeEntryMatcher: (...args) => {
      calls.makeEntryMatcher(...args);
      return actual.makeEntryMatcher(...args);
    },
    describeEntryMatch: (...args) => {
      calls.describeEntryMatch(...args);
      return actual.describeEntryMatch(...args);
    },
  };
});

import { useStore } from '../../../../store';
import LibraryTreeRoot from '../LibraryTreeRoot';

const entry = (id, name, tags = []) => ({
  id, kind: 'container', name, tags, projectId: null,
  origin: { kind: 'file_import' },
  payload: { topology: 'circular', length: 100, annotations: [] },
});

beforeEach(() => {
  cleanup();
  calls.runSearch.mockClear();
  calls.makeEntryMatcher.mockClear();
  calls.describeEntryMatch.mockClear();
  useStore.setState((s) => {
    s.libraryEntries = {
      a: entry('a', 'alpha plasmid', ['match']),
      b: entry('b', 'beta plasmid', ['match']),
      c: entry('c', 'gamma plasmid'),
    };
    s.projects = {};
    s.looseFolders = [];
    s.pinnedProjectIds = [];
    s.currentProjectId = null;
  });
});

describe('LibraryTreeRoot — one search session owns visibility and row explanations', () => {
  it('runs the engine once and never falls back to per-zone/per-row search', () => {
    render(<LibraryTreeRoot query="match" />);
    expect(calls.runSearch).toHaveBeenCalledTimes(1);
    expect(calls.makeEntryMatcher).not.toHaveBeenCalled();
    expect(calls.describeEntryMatch).not.toHaveBeenCalled();
  });

  it.each(['primer:foo status:release', 'name:pUC'])(
    'does not run the metadata engine for blocked/unsupported query %s',
    (query) => {
      render(<LibraryTreeRoot query={query} onRequestFullSearch={vi.fn()} />);
      expect(calls.runSearch).not.toHaveBeenCalled();
      expect(calls.makeEntryMatcher).not.toHaveBeenCalled();
      expect(calls.describeEntryMatch).not.toHaveBeenCalled();
    },
  );
});

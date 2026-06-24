import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import VersionTimeline from '../VersionTimeline';
import { buildVersionTimeline } from '../../lib/version-lineage';

const E = {
  imp: { id: 'imp', name: 'pUC19', addedAt: '2026-06-16T10:02:00Z', origin: { kind: 'file_import' } },
  e1: { id: 'e1', name: 'pUC19 · испр.', addedAt: '2026-06-16T10:05:00Z', parentEntryId: 'imp', origin: { kind: 'manual_edit', parentEntryId: 'imp', editedAt: '2026-06-16T10:05:00Z', changes: 'замена 66: G→A' } },
  v1: { id: 'v1', name: 'pUC19-T7', addedAt: '2026-06-16T10:05:30Z', parentEntryId: 'imp', origin: { kind: 'version', parentEntryId: 'imp', createdAt: '2026-06-16T10:05:30Z', changes: '+промотор T7' } },
};

afterEach(cleanup);

describe('VersionTimeline', () => {
  it('renders a node per version + edges, marks the current one, fires onSelect', () => {
    const onSelect = vi.fn();
    render(<VersionTimeline model={buildVersionTimeline(E, 'e1')} onSelect={onSelect} />);
    expect(screen.getByTestId('version-timeline')).toBeTruthy();
    expect(screen.getByTestId('version-node-imp')).toBeTruthy();
    expect(screen.getByTestId('version-node-e1').getAttribute('data-current')).toBe('true');
    expect(screen.getByTestId('version-node-v1').getAttribute('data-current')).toBe('false');
    // the «что изменено» one-liner rides on the node
    expect(screen.getByTestId('version-node-e1').textContent).toContain('замена 66: G→A');
    fireEvent.click(screen.getByTestId('version-node-imp'));
    expect(onSelect).toHaveBeenCalledWith('imp');
  });

  it('shows an empty hint when there is no history', () => {
    render(<VersionTimeline model={{ root: null, nodes: [], edges: [] }} />);
    expect(screen.getByTestId('version-timeline-empty')).toBeTruthy();
  });
});

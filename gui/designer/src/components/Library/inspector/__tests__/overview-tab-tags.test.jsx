/**
 * overview-tab-tags.test.jsx — editable entry tags in the workspace Overview.
 *
 * Real-case sweep: LibraryWorkspace had no UI to edit a library entry's
 * organizational tags (the editor lived only in the Importer's MetaColumn).
 * OverviewTab now renders a TagsEditor when an `onUpdateTags` callback is
 * provided (workspace), and stays read-only without it (Importer path,
 * which keeps its own MetaColumn editor).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import OverviewTab from '../tabs/OverviewTab';
import { useStore } from '../../../../store';

vi.mock('../../../PlasmidMiniMap', () => ({
  default: () => <div data-testid="mock-mini-map" />,
}));

beforeEach(() => { try { useStore.setState({ libraryEntries: {} }); } catch { /* */ } });
afterEach(cleanup);

const ITEM = {
  id: 'e1', name: 'pUC19', length: 200, sequence: 'A'.repeat(200),
  topology: 'circular', annotations: [], tags: ['cloning'],
};

describe('OverviewTab — editable entry tags', () => {
  it('renders the entry-tags editor when onUpdateTags is provided + add calls it', () => {
    const onUpdateTags = vi.fn();
    render(<OverviewTab item={ITEM} onUpdateTags={onUpdateTags} />);
    expect(screen.getByTestId('overview-tags-editor')).toBeTruthy();
    expect(screen.getByTestId('importer-tag-cloning')).toBeTruthy();
    const input = screen.getByTestId('importer-tag-input');
    fireEvent.change(input, { target: { value: 'expression' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onUpdateTags).toHaveBeenCalledWith(['cloning', 'expression']);
  });

  it('stays read-only (no tags editor) when onUpdateTags is absent', () => {
    render(<OverviewTab item={ITEM} />);
    expect(screen.queryByTestId('overview-tags-editor')).toBeNull();
  });
});

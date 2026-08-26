/**
 * AddModal SnapGene catalog tile regression tests.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import AddModal from '../../Library/AddModal/AddModal';
import {
  bootstrapStore,
  useStore,
} from '../../../store';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try { useStore.setState({ libraryEntries: {} }); } catch { /* */ }
});

beforeEach(() => {
  try { bootstrapStore(); } catch { /* */ }
});

describe('AddModal — SnapGene catalog tile', () => {
  it('catalog tile truthfully names the local collection', () => {
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    const tile = screen.getByTestId('add-modal-source-catalog');
    expect(tile.textContent).toMatch(/Каталог SnapGene/);
    expect(tile.textContent).toMatch(/2822/);
    expect(tile.textContent).not.toMatch(/в разработке/);
  });

  it('picking catalog hides the irrelevant homology auto-annotation toggle', () => {
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-source-catalog'));
    expect(screen.queryByTestId('add-modal-catalog-in-dev')).toBeNull();
    expect(screen.queryByTestId('add-modal-auto-annotate')).toBeNull();
  });

  it('submit with catalog opens the on-demand picker, not the file ingress fallback', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })));
    const calls = [];
    render(
      <AddModal
        open
        onClose={() => {}}
        onLaunchPreImport={(p) => calls.push(p)}
      />,
    );
    fireEvent.click(screen.getByTestId('add-modal-source-catalog'));
    fireEvent.click(screen.getByTestId('add-modal-submit'));
    expect(screen.getByTestId('snapgene-catalog-picker')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});

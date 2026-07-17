/**
 * AddModal SnapGene catalog tile regression tests.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import AddModal from '../../Library/AddModal/AddModal';
import {
  bootstrapStore,
  useStore,
} from '../../../store';

afterEach(() => {
  cleanup();
  try { useStore.setState({ libraryEntries: {} }); } catch { /* */ }
});

beforeEach(() => {
  try { bootstrapStore(); } catch { /* */ }
});

describe('AddModal — SnapGene catalog tile', () => {
  it('catalog tile shows «в разработке» в подзаголовке', () => {
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    const tile = screen.getByTestId('add-modal-source-catalog');
    expect(tile.textContent).toMatch(/Каталог SnapGene/);
    expect(tile.textContent).toMatch(/в разработке/);
  });

  it('picking catalog → inline banner появляется', () => {
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-source-catalog'));
    expect(screen.getByTestId('add-modal-catalog-in-dev')).toBeTruthy();
    expect(screen.getByTestId('add-modal-catalog-in-dev').textContent).toMatch(/в разработке/);
  });

  it('submit с catalog dispatches preset to onLaunchPreImport', () => {
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
    expect(calls).toHaveLength(1);
    expect(calls[0].source).toBe('catalog');
  });
});

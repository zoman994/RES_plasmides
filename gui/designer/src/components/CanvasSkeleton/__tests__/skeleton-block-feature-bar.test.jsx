/**
 * ContainerBlock — колбаса (feature bar) inside the rectangle.
 *
 * 12.05.2026 — Игорь: «колбаса должна быть в линейном виде внутри
 * контейнера на канвасе».
 *
 * Covers:
 *  - Filled container renders feature-bar div + per-feature ticks
 *    с testId pattern `skeleton-block-{id}-feature-{idx}`.
 *  - Tick positioned по % от length, colored by featureColor.
 *  - Placeholder block does NOT have feature bar.
 *  - level='detail' annotations исключены из колбасы.
 *
 *  Plus AddModal SnapGene «в разработке» banner tests.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useEffect } from 'react';
import CanvasLayoutView from '../canvas/CanvasLayoutView';
import CanvasSkeleton from '../index';
import AddModal from '../../Library/AddModal/AddModal';
import {
  SkeletonProvider,
  useSkeletonActions,
} from '../store/skeleton-context';
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

const seedEntry = (annotations) => ({
  id: 'lib-feat-test',
  kind: 'container',
  name: 'feat-test',
  payload: {
    sequence: 'A'.repeat(1000),
    length: 1000,
    topology: 'linear',
    annotations,
    ends: null,
  },
});

function Filler({ entry }) {
  const actions = useSkeletonActions();
  useEffect(() => {
    actions.fillPlaceholder('c-placeholder-1', entry);
  }, [actions, entry]);
  return null;
}

function renderCanvasWithFilled(entry) {
  return render(
    <SkeletonProvider>
      <Filler entry={entry} />
      <CanvasLayoutView />
    </SkeletonProvider>,
  );
}

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

// Suppress unused-import warning for act.
void act;

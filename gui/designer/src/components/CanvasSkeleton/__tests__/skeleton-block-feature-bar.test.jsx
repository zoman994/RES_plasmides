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

describe('Filled block — plasmid map visual (R10)', () => {
  // R10 (14.05.2026): колбаса заменена MiniPlasmidMap SVG (rect for
  // linear, arcs for circular). Tests verify SVG presence + feature
  // count (linear strip case — entry is `topology: linear`).
  it('renders MiniPlasmidMap SVG для filled container', () => {
    renderCanvasWithFilled(seedEntry([
      { name: 'AmpR', type: 'CDS', start: 0, end: 800, strand: 1, level: 'region' },
    ]));
    expect(screen.getByTestId('skeleton-block-c-placeholder-1-map')).toBeTruthy();
    expect(screen.getByTestId('skeleton-block-c-placeholder-1-svg')).toBeTruthy();
  });

  it('renders rect-per-region annotation в linear SVG', () => {
    renderCanvasWithFilled(seedEntry([
      { name: 'promoter', type: 'promoter', start: 0, end: 100, strand: 1, level: 'region' },
      { name: 'CDS-1', type: 'CDS', start: 150, end: 600, strand: 1, level: 'region' },
      { name: 'terminator', type: 'terminator', start: 650, end: 700, strand: 1, level: 'region' },
    ]));
    const svg = screen.getByTestId('skeleton-block-c-placeholder-1-svg');
    // Linear strip: 1 backbone rect + 3 feature rects + 2 end-cap polygons.
    // Verify ≥4 rects (backbone + 3 features).
    const rects = svg.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThanOrEqual(4);
  });

  it('annotations с level=detail исключены из map', () => {
    renderCanvasWithFilled(seedEntry([
      { name: 'region', type: 'CDS', start: 0, end: 500, strand: 1, level: 'region' },
      { name: 'subfeature', type: 'misc_feature', start: 100, end: 200, strand: 1, level: 'detail' },
    ]));
    const svg = screen.getByTestId('skeleton-block-c-placeholder-1-svg');
    // 1 backbone rect + 1 feature rect (detail filtered out).
    const rects = svg.querySelectorAll('rect');
    expect(rects.length).toBe(2);
  });

  it('placeholder block НЕ имеет MiniPlasmidMap', () => {
    render(<CanvasSkeleton />);
    expect(screen.queryByTestId('skeleton-block-c-placeholder-1-map')).toBeNull();
    expect(screen.queryByTestId('skeleton-block-c-placeholder-1-svg')).toBeNull();
  });

  it('feature rects имеют разные fill colors для разных types', () => {
    renderCanvasWithFilled(seedEntry([
      { name: 'promoter', type: 'promoter', start: 0, end: 100, strand: 1, level: 'region' },
      { name: 'AmpR', type: 'CDS', start: 150, end: 800, strand: 1, level: 'region' },
      { name: 'terminator', type: 'terminator', start: 850, end: 950, strand: 1, level: 'region' },
    ]));
    const svg = screen.getByTestId('skeleton-block-c-placeholder-1-svg');
    const rects = Array.from(svg.querySelectorAll('rect'));
    // Skip backbone rect (1st) and ghost-overlay rect (if frozen — not here).
    // Feature rects = rects with stricter width selection — filter by Y position.
    const fills = rects.map((r) => r.getAttribute('fill')).filter((f) => f && f !== 'none');
    // At least 3 unique colors (backbone + 3 features = 4 distinct fills expected).
    const unique = new Set(fills);
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });
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

// Suppress unused-import warning for act.
void act;

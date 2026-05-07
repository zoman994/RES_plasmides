/**
 * PlasmidNode — Sprint M-C.1 K2 component tests.
 *
 * The node card (DEC-MC1-01) renders an embedded PlasmidMiniMap, a
 * truncated title, a length+topology meta line, and up to 4 region
 * badges with a `+N` chip when there are more.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { useStore } from '../../../store';
import PlasmidNode from '../PlasmidNode';

function withProvider(ui) {
  return <ReactFlowProvider>{ui}</ReactFlowProvider>;
}

vi.mock('../../PlasmidMiniMap', () => ({
  default: ({ length, topology }) => (
    <div data-testid="dag-plasmid-mini-map" data-length={length} data-topology={topology}>map</div>
  ),
}));

function makeRegions(count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      id: `r-${i}`,
      type: 'CDS',
      name: `feat-${i + 1}`,
      start: i * 100,
      end: i * 100 + 80,
      level: 'region',
    });
  }
  return out;
}

function seedEntry(id, overrides = {}) {
  useStore.setState((s) => {
    s.libraryEntries = s.libraryEntries || {};
    s.libraryEntries[id] = {
      id,
      kind: 'container',
      name: overrides.name || 'pUC19',
      tags: overrides.tags || [],
      addedAt: '2026-05-07T00:00:00.000Z',
      payload: {
        sequence: 'A'.repeat(overrides.length || 2686),
        length: overrides.length || 2686,
        topology: overrides.topology || 'circular',
        annotations: overrides.annotations || makeRegions(2),
      },
      ext: {},
    };
  });
}

beforeEach(() => {
  useStore.setState((s) => {
    s.libraryEntries = {};
  });
});
afterEach(() => cleanup());

describe('M-C.1 K2 — PlasmidNode', () => {
  it('renders embedded PlasmidMiniMap with length + topology fed from libraryEntries', () => {
    seedEntry('lib-1', { name: 'pUC19', length: 2686, topology: 'circular' });
    render(withProvider(<PlasmidNode id="lib-1" data={{ libraryEntryId: 'lib-1' }} selected={false} />));
    const mini = screen.getByTestId('dag-plasmid-mini-map');
    expect(mini).toBeTruthy();
    expect(mini.dataset.length).toBe('2686');
    expect(mini.dataset.topology).toBe('circular');
  });

  it('shows the entry name as the card title', () => {
    seedEntry('lib-1', { name: 'pET28a' });
    render(withProvider(<PlasmidNode id="lib-1" data={{ libraryEntryId: 'lib-1' }} selected={false} />));
    expect(screen.getByTestId('dag-plasmid-node-title-lib-1').textContent).toContain('pET28a');
  });

  it('shows the meta line with length in kb + topology icon', () => {
    seedEntry('lib-1', { length: 5400, topology: 'linear' });
    render(withProvider(<PlasmidNode id="lib-1" data={{ libraryEntryId: 'lib-1' }} selected={false} />));
    const meta = screen.getByTestId('dag-plasmid-node-meta-lib-1').textContent;
    // Format: «5.4 kb · —» (linear icon —, circular icon ○).
    expect(meta).toMatch(/5\.4\s*kb/);
    expect(meta).toContain('—');
  });

  it('uses circular icon ○ for circular plasmid', () => {
    seedEntry('lib-1', { topology: 'circular' });
    render(withProvider(<PlasmidNode id="lib-1" data={{ libraryEntryId: 'lib-1' }} selected={false} />));
    expect(screen.getByTestId('dag-plasmid-node-meta-lib-1').textContent).toContain('○');
  });

  it('renders up to 4 region badges + a +N chip when there are more', () => {
    seedEntry('lib-1', { annotations: makeRegions(7) });
    render(withProvider(<PlasmidNode id="lib-1" data={{ libraryEntryId: 'lib-1' }} selected={false} />));
    const badges = screen.getAllByTestId(/^dag-plasmid-node-badge-lib-1-/);
    expect(badges.length).toBe(4);
    const chip = screen.getByTestId('dag-plasmid-node-overflow-lib-1');
    expect(chip.textContent).toContain('+3');
  });

  it('omits +N chip when there are exactly 4 regions or fewer', () => {
    seedEntry('lib-1', { annotations: makeRegions(3) });
    render(withProvider(<PlasmidNode id="lib-1" data={{ libraryEntryId: 'lib-1' }} selected={false} />));
    expect(screen.queryByTestId('dag-plasmid-node-overflow-lib-1')).toBeNull();
  });

  it('renders an unknown-id node defensively (does not crash)', () => {
    // libraryEntries empty, but ReactFlow asks the node to render anyway.
    render(withProvider(<PlasmidNode id="ghost" data={{ libraryEntryId: 'ghost' }} selected={false} />));
    // The placeholder name is shown so biolog sees a card and can clean up.
    const titleEl = screen.queryByTestId('dag-plasmid-node-title-ghost');
    expect(titleEl).toBeTruthy();
  });

  it('marks selected=true via dataset for CSS targeting', () => {
    seedEntry('lib-1');
    render(withProvider(<PlasmidNode id="lib-1" data={{ libraryEntryId: 'lib-1' }} selected={true} />));
    const root = screen.getByTestId('dag-plasmid-node-lib-1');
    expect(root.dataset.selected).toBe('true');
  });
});

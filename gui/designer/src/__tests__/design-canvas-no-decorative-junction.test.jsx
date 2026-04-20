/**
 * K12 / V17 (Sprint 1.7) — single-fragment canvases never render a decorative
 * junction block. Linear → nothing. Circular → arc indicator only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import DesignCanvas from '../components/DesignCanvas';
import { useStore } from '../store';

function seed(fragments, junctions, circular = false) {
  useStore.setState({
    activeId: 'asm_v17',
    parts: [],
    assemblies: [{
      id: 'asm_v17', name: 'v17-test',
      fragments, junctions,
      primers: [], customPrimers: [],
      protocolSteps: [], apiWarnings: [],
      calculated: false, circular,
    }],
  });
}

beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });

const withDnd = (el) => <DndProvider backend={HTML5Backend}>{el}</DndProvider>;

const noop = () => {};
const canvasProps = {
  onDrop: noop, onRemove: noop, onToggleAmplification: noop,
  onReorder: noop, onFlip: noop, onSplitSignal: noop, onEditFragment: noop,
  onSwapVariant: noop, onAddCustomPrimer: noop, onJunctionChange: noop,
  onToggleCircular: noop,
};

describe('K12 / V17 — no decorative junction for single fragments', () => {
  it('single linear fragment → no [data-junction] rendered', () => {
    seed(
      [{ id: 'f1', name: 'Solo', length: 500, sequence: 'A'.repeat(500),
         type: 'CDS', strand: 1, needsAmplification: true, topology: 'linear' }],
      [],
      false,
    );
    const { container } = render(withDnd(<DesignCanvas {...canvasProps} pcrSizes={[500]} />));
    expect(container.querySelectorAll('[data-junction]').length).toBe(0);
  });

  it('single linear fragment with stale junction in array → still no junction rendered', () => {
    // Stale leftover junction from a previous split/delete cycle must not leak onto canvas.
    seed(
      [{ id: 'f1', name: 'Solo', length: 500, sequence: 'A'.repeat(500),
         type: 'CDS', strand: 1, needsAmplification: true, topology: 'linear' }],
      [{ id: 'stale_j', type: 'overlap', overlapLength: 30, overlapMode: 'split' }],
      false,
    );
    const { container } = render(withDnd(<DesignCanvas {...canvasProps} pcrSizes={[500]} />));
    expect(container.querySelectorAll('[data-junction]').length).toBe(0);
  });

  it('single circular fragment (per-fragment topology) → no data-junction but arc indicator present', () => {
    seed(
      [{ id: 'f1', name: 'Plasmid', length: 5000, sequence: 'A'.repeat(5000),
         type: 'plasmid', strand: 1, needsAmplification: false, topology: 'circular' }],
      [],
      false,
    );
    const { container } = render(withDnd(<DesignCanvas {...canvasProps} pcrSizes={[5000]} />));
    expect(container.querySelectorAll('[data-junction]').length).toBe(0);
    // Arc indicator mounts (⟳ замыкание text)
    expect(container.textContent).toMatch(/замыкание/);
  });

  it('two fragments → one decorative junction renders (regression guard)', () => {
    seed(
      [
        { id: 'f1', name: 'A', length: 400, sequence: 'A'.repeat(400), type: 'CDS', strand: 1, needsAmplification: true },
        { id: 'f2', name: 'B', length: 600, sequence: 'A'.repeat(600), type: 'CDS', strand: 1, needsAmplification: true },
      ],
      [{ id: 'j1', type: 'overlap', overlapLength: 30, overlapMode: 'split' }],
      false,
    );
    const { container } = render(withDnd(<DesignCanvas {...canvasProps} pcrSizes={[400, 600]} />));
    expect(container.querySelectorAll('[data-junction]').length).toBe(1);
  });
});

/**
 * K7 (Sprint 1.6) — visual grouping of mutagenesis-split fragments on canvas.
 *
 * When a fragment is split via two_fragment/multi_fragment strategy, the N
 * resulting sub-fragments share splitGroupId + parent metadata. DesignCanvas
 * wraps consecutive same-groupId items into .split-group-container with
 * dashed border + tinted backdrop + badge + connector line.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import DesignCanvas from '../components/DesignCanvas';
import { useStore } from '../store';

// Seed the store with an assembly containing the given fragments/junctions.
function seed(fragments, junctions, circular = false) {
  useStore.setState({
    activeId: 'asm_k7',
    parts: [],
    assemblies: [{
      id: 'asm_k7',
      name: 'k7-test',
      fragments,
      junctions,
      primers: [],
      customPrimers: [],
      protocolSteps: [],
      apiWarnings: [],
      calculated: false,
      circular,
    }],
  });
}

beforeEach(() => {
  // Avoid canvas measurements during render in jsdom
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

const withDnd = (el) => <DndProvider backend={HTML5Backend}>{el}</DndProvider>;

const noop = () => {};
const canvasProps = {
  onDrop: noop, onRemove: noop, onToggleAmplification: noop,
  onReorder: noop, onFlip: noop, onSplitSignal: noop, onEditFragment: noop,
  onSwapVariant: noop, onAddCustomPrimer: noop, onJunctionChange: noop,
  onToggleCircular: noop,
};

describe('DesignCanvas — K7 split-group visual rendering', () => {
  it('wraps fragments sharing splitGroupId into .split-group-container with parent badge', () => {
    seed(
      [
        { id: 'f1', name: 'HygroR_1', length: 42, sequence: 'A'.repeat(42),
          type: 'misc_feature', strand: 1, needsAmplification: true,
          splitGroupId: 'sg_1', splitGroupParentName: 'HygroR', splitGroupIndex: 0, splitGroupTotal: 2 },
        { id: 'f2', name: 'HygroR_2', length: 981, sequence: 'A'.repeat(981),
          type: 'misc_feature', strand: 1, needsAmplification: true,
          splitGroupId: 'sg_1', splitGroupParentName: 'HygroR', splitGroupIndex: 1, splitGroupTotal: 2 },
      ],
      [{ id: 'j1', type: 'overlap', overlapLength: 30, containsMutation: true }],
    );
    const { container } = render(withDnd(<DesignCanvas {...canvasProps} pcrSizes={[42, 981]} />));
    const groupEl = container.querySelector('.split-group-container');
    expect(groupEl).not.toBeNull();
    const badge = groupEl.querySelector('.split-group-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('HygroR');
    expect(badge.textContent).toContain('2 частей');
  });

  it('does not wrap a single fragment without splitGroupId (no visual group)', () => {
    seed(
      [{ id: 'f1', name: 'EGFP', length: 720, sequence: 'A'.repeat(720),
         type: 'CDS', strand: 1, needsAmplification: true }],
      [],
    );
    const { container } = render(withDnd(<DesignCanvas {...canvasProps} pcrSizes={[720]} />));
    expect(container.querySelector('.split-group-container')).toBeNull();
  });

  it('two independent splits render as two separate groups', () => {
    seed(
      [
        { id: 'a1', name: 'A_1', length: 100, sequence: 'A'.repeat(100),
          type: 'misc_feature', strand: 1, needsAmplification: true,
          splitGroupId: 'sg_A', splitGroupParentName: 'A', splitGroupIndex: 0, splitGroupTotal: 2 },
        { id: 'a2', name: 'A_2', length: 200, sequence: 'A'.repeat(200),
          type: 'misc_feature', strand: 1, needsAmplification: true,
          splitGroupId: 'sg_A', splitGroupParentName: 'A', splitGroupIndex: 1, splitGroupTotal: 2 },
        { id: 'b1', name: 'B_1', length: 50, sequence: 'A'.repeat(50),
          type: 'misc_feature', strand: 1, needsAmplification: true,
          splitGroupId: 'sg_B', splitGroupParentName: 'B', splitGroupIndex: 0, splitGroupTotal: 2 },
        { id: 'b2', name: 'B_2', length: 150, sequence: 'A'.repeat(150),
          type: 'misc_feature', strand: 1, needsAmplification: true,
          splitGroupId: 'sg_B', splitGroupParentName: 'B', splitGroupIndex: 1, splitGroupTotal: 2 },
      ],
      [
        { id: 'jA',  type: 'overlap', overlapLength: 30 },
        { id: 'jAB', type: 'overlap', overlapLength: 15 },
        { id: 'jB',  type: 'overlap', overlapLength: 30 },
      ],
    );
    const { container } = render(withDnd(<DesignCanvas {...canvasProps} pcrSizes={[100, 200, 50, 150]} />));
    const groups = container.querySelectorAll('.split-group-container');
    expect(groups.length).toBe(2);
  });

  it('split-group of size 1 is NOT wrapped (defensive — single-item groups are meaningless)', () => {
    // Edge case: if someone seeded only one item with splitGroupId, we should render it as regular fragment.
    seed(
      [
        { id: 'solo', name: 'Solo', length: 100, sequence: 'A'.repeat(100),
          type: 'misc_feature', strand: 1, needsAmplification: true,
          splitGroupId: 'sg_Solo', splitGroupParentName: 'Parent', splitGroupIndex: 0, splitGroupTotal: 1 },
      ],
      [],
    );
    const { container } = render(withDnd(<DesignCanvas {...canvasProps} pcrSizes={[100]} />));
    expect(container.querySelector('.split-group-container')).toBeNull();
  });
});

/**
 * annotator-preview-selection.test.jsx — Игорь 14.06.2026:
 * «в аннотаторе выбор и удаление фичи должно быть доступно. как и
 * выбор последовательности.»
 *
 * The embedded Annotator preview mounted SequenceView WITHOUT the
 * controlled selection wiring (caretPos/caretAnchor + onCaretChange/
 * onSelectRange), so range-select did nothing and Del (useSelectionEdit)
 * had no selection to act on — feature/sequence selection + delete were
 * dead. PreviewTab now owns selection state (useSequenceSelection) and a
 * click on a CONFIRMED feature selects its whole range (so Del / E act on
 * it); ghost (predicted) clicks keep the drill-in panel.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { ANNOTATOR_DEFAULTS } from '../../../store/uiSlice.js';

// Mock SequenceView to surface the selection wiring + live caret state.
vi.mock('../../SequenceView', () => ({
  default: ({
    fragments, onAnnotationClick, onSelectRange, onCaretChange, caretPos, caretAnchor,
  }) => {
    const ann = (fragments?.[0]?.annotations) || [];
    return (
      <div
        data-testid="mock-sequence-view"
        data-has-select={typeof onSelectRange === 'function' ? 'true' : 'false'}
        data-has-caret={typeof onCaretChange === 'function' ? 'true' : 'false'}
        data-caret-pos={caretPos == null ? '' : String(caretPos)}
        data-caret-anchor={caretAnchor == null ? '' : String(caretAnchor)}
      >
        {ann.map((a) => (
          <button
            key={a.id || `${a.start}:${a.end}`}
            data-testid={`mock-ann-${a.id || 'noid'}`}
            data-region-predicted={a.predicted ? 'true' : undefined}
            onClick={() => onAnnotationClick?.(a)}
          >{a.name || a.type}</button>
        ))}
      </div>
    );
  },
}));

import PreviewTab from '../PreviewTab.jsx';

const CONFIRMED = [
  { id: 'c1', name: 'AmpR', type: 'CDS', start: 10, end: 100, level: 'region', strand: 1 },
];
const SEQUENCE = 'A'.repeat(2000);

function ghost(id, name = 'σ70') {
  return {
    id, name, type: 'promoter', start: 200, end: 230, strand: 1,
    level: 'region', predicted: true, confidence: 0.85,
  };
}

function setResults(results) {
  useStore.setState((state) => {
    state.annotator = {
      ...ANNOTATOR_DEFAULTS,
      enabledPluginIds: { ...ANNOTATOR_DEFAULTS.enabledPluginIds },
      results,
      acceptedRegionIds: {},
      rejectedRegionIds: {},
      pendingEdits: {},
      running: {},
      open: true,
      scope: { kind: 'full', sequenceId: 'p1' },
      activeTab: 'linear',
      selectedGhostId: null,
    };
  });
}

beforeEach(() => { setResults({}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Annotator PreviewTab — selection + feature delete wiring', () => {
  it('wires controlled selection into SequenceView (onSelectRange + onCaretChange)', () => {
    render(<PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" onAnnotationEdit={vi.fn()} />);
    const sv = screen.getByTestId('mock-sequence-view');
    expect(sv.getAttribute('data-has-select')).toBe('true');
    expect(sv.getAttribute('data-has-caret')).toBe('true');
  });

  it('clicking a confirmed feature selects its whole range (so Del / E can act on it)', () => {
    render(<PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" onAnnotationEdit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('mock-ann-c1'));
    const sv = screen.getByTestId('mock-sequence-view');
    expect(sv.getAttribute('data-caret-anchor')).toBe('10');
    expect(sv.getAttribute('data-caret-pos')).toBe('100');
  });

  it('clicking a confirmed feature still does NOT open the ghost drill-in', () => {
    render(<PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" onAnnotationEdit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('mock-ann-c1'));
    expect(useStore.getState().annotator.selectedGhostId).toBeNull();
    expect(screen.queryByTestId('annotator-ghost-drill-in')).toBeNull();
  });

  it('clicking a ghost still opens the drill-in (range-select is confirmed-only)', () => {
    setResults({ p: { pluginId: 'p', pluginName: 'σ70', regions: [ghost('g1')] } });
    render(<PreviewTab sequence={SEQUENCE} annotations={CONFIRMED} name="pTest" onAnnotationEdit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('mock-ann-g1'));
    expect(useStore.getState().annotator.selectedGhostId).toBe('g1');
  });
});

/**
 * assembly-method-flow-ux.test.jsx — UX slice 3: one method decision for the
 * WHOLE assembly that flows down, with visible exceptions.
 *   • SET_ASSEMBLY_METHOD stores zone.assemblyMethod and reseeds every TENTATIVE
 *     junction to it, keeping manual (decided) overrides.
 *   • new junctions seed with zone.assemblyMethod (finalizer), not the global default.
 *   • enrich marks junctionRight.differsFromAssembly when a junction's method
 *     ≠ the assembly method → the strip glyph shows a "differs" marker.
 *   • AssemblyHeader exposes the assembly-method dropdown.
 *   • the popover offers a reverse gesture "сделать методом сборки".
 * Pure usability (comparing two stored methods); no biology.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { zonesReducer } from '../store/skeleton-state-zones';
import { enrichZonesWithJunctions, pairKeyFor } from '../lib/junction-derive';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';
import AssemblyHeader from '../editor/assembly-mode/AssemblyHeader';
import JunctionPopover from '../canvas/JunctionPopover';

afterEach(cleanup);

const PK12 = pairKeyFor('pc1', 'pc2');
const PK23 = pairKeyFor('pc2', 'pc3');

// ─── reducer: SET_ASSEMBLY_METHOD flows down, keeps manual overrides ────────

describe('UX slice 3 — SET_ASSEMBLY_METHOD', () => {
  const state = () => ({
    zones: [{
      id: 'z1',
      junctions: {
        [PK12]: { method: 'overlap_pcr' }, // tentative
        [PK23]: { method: 'restriction', autoMode: 'manual' }, // decided override
      },
    }],
  });

  it('stores assemblyMethod + reseeds tentative junctions, keeps manual ones', () => {
    const out = zonesReducer(state(), { type: 'SET_ASSEMBLY_METHOD', zoneId: 'z1', method: 'golden_gate' });
    const z = out.zones[0];
    expect(z.assemblyMethod).toBe('golden_gate');
    expect(z.junctions[PK12].method).toBe('golden_gate'); // tentative → flowed down
    expect(z.junctions[PK23].method).toBe('restriction'); // manual → kept
    expect(z.junctions[PK23].autoMode).toBe('manual');
  });

  it('unknown zone / missing method → no-op', () => {
    const s = state();
    expect(zonesReducer(s, { type: 'SET_ASSEMBLY_METHOD', zoneId: 'nope', method: 'gibson' })).toBe(s);
    expect(zonesReducer(s, { type: 'SET_ASSEMBLY_METHOD', zoneId: 'z1' })).toBe(s);
  });
});

// ─── finalizer: a new junction seeds with the assembly method ──────────────

const SRC = {
  id: 'src-u', kind: 'molecule', name: 's',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTT',
  annotations: [], topology: { circular: false },
};
const srcPiece = (id, start, end, order) => ({
  id, kind: 'sourced', name: id, sourceIds: ['src-u'],
  ranges: [{ sourceId: 'src-u', start, end, orientation: 'forward' }],
  acquisitionMethod: 'undefined', zoneId: 'z1', order, createdAt: order + 1, updatedAt: order + 1,
});

describe('UX slice 3 — finalizer seeds new junctions with the assembly method', () => {
  it('a 2-piece zone with assemblyMethod=golden_gate seeds the junction as golden_gate', () => {
    const base = buildInitialState();
    const s = {
      ...base,
      containers: [...base.containers, SRC],
      zones: [{
        id: 'z1', name: 'Z', viewMode: 'sequence', topology: { circular: false },
        bounds: { x: 0, y: 0, width: 600, height: 400 }, assemblyMethod: 'golden_gate',
      }],
      pieces: [srcPiece('pc1', 0, 16, 0), srcPiece('pc2', 16, 32, 1)],
    };
    const out = skeletonReducer(s, { type: 'SET_PIECE_COLOR', pieceId: 'pc1', color: '#123456' });
    expect(out.zones[0].junctions[PK12].method).toBe('golden_gate');
  });
});

// ─── enrich: differsFromAssembly ───────────────────────────────────────────

describe('UX slice 3 — enrichZonesWithJunctions.differsFromAssembly', () => {
  const zones = [{ zoneId: 'pc1', start: 0, end: 16 }, { zoneId: 'pc2', start: 16, end: 32 }];
  it('true when the junction method ≠ the assembly method', () => {
    const out = enrichZonesWithJunctions(zones, { [PK12]: { method: 'golden_gate', autoMode: 'manual' } }, 'overlap_pcr');
    expect(out[0].junctionRight.differsFromAssembly).toBe(true);
  });
  it('false when it matches (or no assembly method given)', () => {
    expect(enrichZonesWithJunctions(zones, { [PK12]: { method: 'overlap_pcr' } }, 'overlap_pcr')[0].junctionRight.differsFromAssembly).toBe(false);
    expect(enrichZonesWithJunctions(zones, { [PK12]: { method: 'golden_gate' } })[0].junctionRight.differsFromAssembly).toBe(false);
  });
});

// ─── glyph: differs marker on the strip ────────────────────────────────────

describe('UX slice 3 — strip glyph shows a "differs from assembly" marker', () => {
  const SEQ = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT';
  function strip(method, assemblyMethod) {
    render(
      <SequenceTab
        sequence={SEQ} annotations={[]} topology="linear" name="x"
        coloredZones={enrichZonesWithJunctions(
          [{ zoneId: 'pc1', start: 0, end: 16, color: '#8b5cf6' }, { zoneId: 'pc2', start: 16, end: 32, color: '#ec4899' }],
          { [PK12]: { method, autoMode: 'manual' } }, assemblyMethod,
        )}
        onZoneClick={() => {}}
      />,
    );
    return screen.getAllByTestId('sequence-view-junction')[0];
  }
  it('marks a divergent junction', () => {
    expect(strip('golden_gate', 'overlap_pcr').getAttribute('data-junction-differs')).toBe('true');
  });
  it('does not mark a matching junction', () => {
    expect(strip('overlap_pcr', 'overlap_pcr').getAttribute('data-junction-differs')).toBe('false');
  });
});

// ─── AssemblyHeader: assembly-method dropdown ──────────────────────────────

describe('UX slice 3 — AssemblyHeader assembly-method dropdown', () => {
  const draft = { name: 'x', topology: { circular: false }, segments: [{}, {}] };
  it('renders the dropdown + fires onAssemblyMethodChange', () => {
    const onAssemblyMethodChange = vi.fn();
    render(
      <AssemblyHeader
        draft={draft} length={48} segmentCount={2} paletteLegend={[]}
        canRealise onRename={() => {}} onToggleTopology={() => {}} onRealise={() => {}}
        assemblyMethod="overlap_pcr" onAssemblyMethodChange={onAssemblyMethodChange}
      />,
    );
    const sel = screen.getByTestId('assembly-method-select');
    expect(sel).toBeTruthy();
    fireEvent.change(sel, { target: { value: 'golden_gate' } });
    expect(onAssemblyMethodChange).toHaveBeenCalledWith('golden_gate');
  });
  it('omits the dropdown when no handler is wired (back-compat)', () => {
    render(
      <AssemblyHeader
        draft={draft} length={48} segmentCount={2} paletteLegend={[]}
        canRealise onRename={() => {}} onToggleTopology={() => {}} onRealise={() => {}}
      />,
    );
    expect(screen.queryByTestId('assembly-method-select')).toBeNull();
  });
});

// ─── popover: reverse gesture "сделать методом сборки" ──────────────────────

describe('UX slice 3 — popover reverse gesture', () => {
  const J = (over) => ({ kind: 'golden_gate', overlapTarget: 'right', overlapLength: 4, status: 'manual', ...over });
  it('calls onMakeAssemblyMethod when present', () => {
    const onMakeAssemblyMethod = vi.fn();
    render(<JunctionPopover junction={J()} position={{ x: 1, y: 1 }} warnings={[]} onPick={() => {}} onSetParams={() => {}} onResetAuto={() => {}} onCancel={() => {}} onMakeAssemblyMethod={onMakeAssemblyMethod} />);
    fireEvent.click(screen.getByTestId('junction-popover-make-assembly'));
    expect(onMakeAssemblyMethod).toHaveBeenCalled();
  });
  it('omits the button when the handler is absent (back-compat)', () => {
    render(<JunctionPopover junction={J()} position={{ x: 1, y: 1 }} warnings={[]} onPick={() => {}} onSetParams={() => {}} onResetAuto={() => {}} onCancel={() => {}} />);
    expect(screen.queryByTestId('junction-popover-make-assembly')).toBeNull();
  });
});

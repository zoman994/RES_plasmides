/**
 * junction-strip-editor-fix.test.jsx — JUNCTION step-2 FIX (clickable strip
 * junction on the LIVE assembly editor surface, not ZoneAssembledView).
 *
 * The step-2 UI was wired to ZoneAssembledView (the canvas zone view), but the
 * biologist assembles in editor/assembly-mode/AssemblyShellBody, whose strip is
 * SequenceTab + coloredZones (SegmentZonesOverlay) — so the junction was never
 * clickable. This covers the FIX:
 *   • enrichZonesWithJunctions — pure: coloredZones[i] gets a junctionRight
 *     {pairKey,method,kind,fromPieceId,toPieceId} on each internal boundary.
 *   • SegmentZonesOverlay renders a clickable junction glyph per junctionRight
 *     (through SequenceTab → SequenceView, the real path), click → onZoneClick
 *     with the junction object (string still = a segment-zone click).
 *   • AssemblyShellBody (live editor via EditorWindowShell): the glyph shows on
 *     the strip; click opens JunctionControl; a method pick writes zone.junctions.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, act, within,
} from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';
import { enrichZonesWithJunctions } from '../lib/junction-derive';
import { pairKeyFor } from '../lib/junction-derive';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

const SEQ = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT';

// ─── enrichZonesWithJunctions (pure) ───────────────────────────────────────

describe('JUNCTION FIX — enrichZonesWithJunctions (pure)', () => {
  const zones = [
    { zoneId: 'pc1', start: 0, end: 16, color: '#111111' },
    { zoneId: 'pc2', start: 16, end: 32, color: '#222222' },
    { zoneId: 'pc3', start: 32, end: 48, color: '#333333' },
  ];

  it('puts a junctionRight on every internal boundary (N−1), not the last zone', () => {
    const out = enrichZonesWithJunctions(zones, {});
    expect(out[0].junctionRight).toBeTruthy();
    expect(out[1].junctionRight).toBeTruthy();
    expect(out[2].junctionRight).toBeUndefined(); // last zone — no right junction
    expect(out[0].junctionRight.pairKey).toBe(pairKeyFor('pc1', 'pc2'));
    expect(out[0].junctionRight.fromPieceId).toBe('pc1');
    expect(out[0].junctionRight.toPieceId).toBe('pc2');
  });

  it('reads the stored method/kind from zone.junctions; defaults to overlap', () => {
    const zoneJunctions = {
      [pairKeyFor('pc1', 'pc2')]: { method: 'golden_gate' },
    };
    const out = enrichZonesWithJunctions(zones, zoneJunctions);
    // pc1↔pc2 carries the stored golden_gate
    expect(out[0].junctionRight.method).toBe('golden_gate');
    expect(out[0].junctionRight.kind).toBe('golden_gate');
    // pc2↔pc3 has no config → defaults (overlap_pcr → overlap kind)
    expect(out[1].junctionRight.method).toBe('overlap_pcr');
    expect(out[1].junctionRight.kind).toBe('overlap');
  });

  it('does not mutate the input zones', () => {
    const out = enrichZonesWithJunctions(zones, {});
    expect(zones[0].junctionRight).toBeUndefined();
    expect(out).not.toBe(zones);
  });

  it('a single zone (no boundary) → no junctions', () => {
    const out = enrichZonesWithJunctions([{ zoneId: 'only', start: 0, end: 10 }], {});
    expect(out[0].junctionRight).toBeUndefined();
  });
});

// ─── SegmentZonesOverlay junction glyph (through SequenceTab — real path) ────

describe('JUNCTION FIX — junction glyph on the SequenceTab strip', () => {
  function enrichedZones(method) {
    return enrichZonesWithJunctions(
      [
        { zoneId: 'pc1', start: 0, end: 16, color: '#8b5cf6', label: 'A' },
        { zoneId: 'pc2', start: 16, end: 32, color: '#ec4899', label: 'B' },
      ],
      method ? { [pairKeyFor('pc1', 'pc2')]: { method } } : {},
    );
  }

  it('renders one clickable junction glyph carrying the method/kind/pair', () => {
    render(
      <SequenceTab
        sequence={SEQ}
        annotations={[]}
        topology="linear"
        name="x"
        coloredZones={enrichedZones('golden_gate')}
        onZoneClick={() => {}}
      />,
    );
    const glyphs = screen.getAllByTestId('sequence-view-junction');
    expect(glyphs.length).toBeGreaterThanOrEqual(1);
    const g = glyphs[0];
    expect(g.getAttribute('data-pair-key')).toBe(pairKeyFor('pc1', 'pc2'));
    expect(g.getAttribute('data-junction-kind')).toBe('golden_gate');
    expect(g.getAttribute('data-method')).toBe('golden_gate');
  });

  it('clicking the glyph calls onZoneClick with the junction object (not a zoneId string)', () => {
    const onZoneClick = vi.fn();
    render(
      <SequenceTab
        sequence={SEQ}
        annotations={[]}
        topology="linear"
        name="x"
        coloredZones={enrichedZones()}
        onZoneClick={onZoneClick}
      />,
    );
    fireEvent.click(screen.getAllByTestId('sequence-view-junction')[0]);
    expect(onZoneClick).toHaveBeenCalledWith(expect.objectContaining({
      pairKey: pairKeyFor('pc1', 'pc2'), fromPieceId: 'pc1', toPieceId: 'pc2',
    }));
  });

  it('the click carries the pointer coords so the popover can anchor near the glyph', () => {
    const onZoneClick = vi.fn();
    render(
      <SequenceTab
        sequence={SEQ}
        annotations={[]}
        topology="linear"
        name="x"
        coloredZones={enrichedZones()}
        onZoneClick={onZoneClick}
      />,
    );
    fireEvent.click(screen.getAllByTestId('sequence-view-junction')[0], { clientX: 123, clientY: 45 });
    expect(onZoneClick).toHaveBeenCalledWith(expect.objectContaining({ clientX: 123, clientY: 45 }));
  });

  it('plain coloredZones (no junctionRight) render no junction glyph (back-compat)', () => {
    render(
      <SequenceTab
        sequence={SEQ}
        annotations={[]}
        topology="linear"
        name="x"
        coloredZones={[{ zoneId: 's1', start: 0, end: 32, color: '#06b6d4' }]}
      />,
    );
    expect(screen.queryAllByTestId('sequence-view-junction')).toHaveLength(0);
  });
});

// ─── AssemblyShellBody — clickable junction on the LIVE editor surface ──────

const C1 = {
  id: 'src1', kind: 'molecule', name: 'pUC',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCC', annotations: [], topology: { circular: false },
};
const C2 = {
  id: 'src2', kind: 'molecule', name: 'pET',
  sequence: 'GGGGTTTTAAAACCCCGGGGTTTT', annotations: [], topology: { circular: false },
};

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

describe('JUNCTION FIX — live AssemblyShellBody strip (via EditorWindowShell)', () => {
  function mount() {
    render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
    act(() => { A.addContainer(C1); });
    act(() => { A.addContainer(C2); });
    act(() => {
      A.zoneDispatch({
        type: 'CREATE_ZONE',
        zone: { name: 'ZED', bounds: { x: 0, y: 0, width: 600, height: 400 } },
      });
    });
    const zid = S.zones[S.zones.length - 1].id;
    const mk = (sid) => {
      act(() => {
        A.zoneDispatch({
          type: 'CREATE_PIECE',
          piece: {
            kind: 'sourced', name: sid, sourceIds: [sid],
            ranges: [{ sourceId: sid, start: 0, end: 24, orientation: 'forward' }],
            origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
          },
        });
      });
      const pid = S.pieces[S.pieces.length - 1].id;
      act(() => { A.zoneDispatch({ type: 'SET_PIECE_ZONE', pieceId: pid, zoneId: zid }); });
      return pid;
    };
    const p1 = mk('src1');
    const p2 = mk('src2');
    act(() => { A.openEditorAssemblyTab(zid); });
    return { zid, p1, p2 };
  }

  it('the editor strip shows a clickable junction glyph', async () => {
    mount();
    expect(screen.getByTestId('assembly-mode-shell')).toBeTruthy();
    const glyph = await screen.findByTestId('sequence-view-junction');
    expect(glyph).toBeTruthy();
  });

  it('clicking the glyph opens JunctionControl for that pair', async () => {
    const { zid, p1, p2 } = mount();
    const glyph = await screen.findByTestId('sequence-view-junction');
    act(() => { fireEvent.click(glyph); });
    expect(S.junctionPicker).toEqual(expect.objectContaining({
      zoneId: zid, pairKey: pairKeyFor(p1, p2),
    }));
    // JunctionControl (evolution of JunctionPopover) mounts on the editor.
    expect(await screen.findByTestId('junction-popover')).toBeTruthy();
  });

  it('picking a method in the control writes zone.junctions[pairKey].method', async () => {
    const { zid, p1, p2 } = mount();
    const glyph = await screen.findByTestId('sequence-view-junction');
    act(() => { fireEvent.click(glyph); });
    const popover = await screen.findByTestId('junction-popover');
    // JC-1 — the internal ромб offers overlap / re_ligation (not closure-only
    // golden_gate); re_ligation → engine method 'restriction'.
    act(() => { fireEvent.click(within(popover).getByTestId('junction-popover-kind-re_ligation')); });
    const zone = S.zones.find((z) => z.id === zid);
    expect(zone.junctions[pairKeyFor(p1, p2)].method).toBe('restriction');
  });
});

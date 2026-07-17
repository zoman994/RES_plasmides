/**
 * range-picker.test.jsx — M-CANVAS-WORKFLOW-UX K5.
 *
 * «+ Плазмида»: shared library source picker → RangePickerModal
 * (mini read-only SequenceView + numeric start/end + features dropdown
 * + RC) → sourced piece with the chosen range (SPEC §3.1.A). Drop of a
 * canvas container also routes through the range picker.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, act, within, fireEvent,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../store/skeleton-context';
import EditorWindowShell from '../editor/EditorWindowShell';
import RangePickerModal from '../editor/assembly-mode/RangePickerModal';
import { bootstrapStore, useStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  // The shared source picker persists Recent/Favorites in localStorage —
  // clear so a prior test's recordRecent doesn't render the same entry
  // twice (once in Недавно, once in Коллекция) breaking getByTestId.
  try { localStorage.clear(); } catch { /* no-op */ }
});

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

const SRC = {
  name: 'pUC19', sequence: 'AAAACCCCGGGGTTTT', circular: true,
  annotations: [{ start: 4, end: 12, label: 'ori' }],
};

function openEmptyZone() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.addContainer({ id: 'cZ', name: 'pUC19', kind: 'molecule', sequence: 'AAAACCCCGGGGTTTT', annotations: [] }); });
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'ZT', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  return zid;
}
const zonePieces = (zid) => S.pieces.filter((p) => p.zoneId === zid);

describe('RangePickerModal — invert (#2 backbone)', () => {
  it('inverting a circular selection confirms the complement as two wrapped ranges', () => {
    let got = null;
    render(<RangePickerModal source={SRC} onConfirm={(p) => { got = p; }} onCancel={() => {}} />);
    // selection [4,12]: end is 0-based; start input is 1-based (5 → store 4)
    act(() => { fireEvent.change(screen.getByTestId('range-picker-end'), { target: { value: '12' } }); });
    act(() => { fireEvent.change(screen.getByTestId('range-picker-start'), { target: { value: '5' } }); });
    act(() => { fireEvent.click(screen.getByTestId('range-picker-invert')); });
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    expect(got.ranges).toEqual([
      { start: 12, end: 16, orientation: 'forward' },
      { start: 0, end: 4, orientation: 'forward' },
    ]);
  });

  // Игорь 22.06: «должно быть кнопкой а не галкой … выбрал-нажал-инвертировалось,
  // и я вижу выделение».
  it('invert is a toggle BUTTON (not a checkbox) reflecting the inverted state', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    act(() => { fireEvent.change(screen.getByTestId('range-picker-end'), { target: { value: '12' } }); });
    act(() => { fireEvent.change(screen.getByTestId('range-picker-start'), { target: { value: '5' } }); });
    const btn = screen.getByTestId('range-picker-invert');
    expect(btn.tagName.toLowerCase()).toBe('button');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    act(() => { fireEvent.click(btn); });
    expect(screen.getByTestId('range-picker-invert').getAttribute('aria-pressed')).toBe('true');
    // The footer reflects the backbone (complement) state so the biolog sees what
    // they're taking (drives SelectionOverlay's complement highlight via `inverted`).
    expect(screen.getByText(/Бэкбон:.*комплемент/)).toBeTruthy();
    act(() => { fireEvent.click(screen.getByTestId('range-picker-invert')); });
    expect(screen.getByTestId('range-picker-invert').getAttribute('aria-pressed')).toBe('false');
  });

  // Игорь 23.06: «при выделении снизу вверх кнопка становится неактивной».
  it('the invert button stays ACTIVE for a backward (anchor>pos) selection', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    act(() => { fireEvent.change(screen.getByTestId('range-picker-end'), { target: { value: '4' } }); });
    act(() => { fireEvent.change(screen.getByTestId('range-picker-start'), { target: { value: '13' } }); }); // store 12 > 4
    expect(screen.getByTestId('range-picker-invert').hasAttribute('disabled')).toBe(false);
  });

  // Игорь 23.06: «при следующем выделении опять выделяешь кусок и опять можешь нажать инвертировать».
  it('changing the selection RESETS the invert toggle (re-select, then invert again)', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    act(() => { fireEvent.change(screen.getByTestId('range-picker-end'), { target: { value: '12' } }); });
    act(() => { fireEvent.change(screen.getByTestId('range-picker-start'), { target: { value: '5' } }); });
    act(() => { fireEvent.click(screen.getByTestId('range-picker-invert')); });
    expect(screen.getByTestId('range-picker-invert').getAttribute('aria-pressed')).toBe('true');
    act(() => { fireEvent.change(screen.getByTestId('range-picker-end'), { target: { value: '10' } }); }); // new selection
    expect(screen.getByTestId('range-picker-invert').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('RangePickerModal — single RE click respects cut count (#2 multi-cut)', () => {
  const reClick = (enzyme, position) => act(() => {
    window.dispatchEvent(new CustomEvent('__v88_re_click__', { detail: { enzyme, position } }));
  });
  // Three EcoRI sites (GAATTC) → a single click is ambiguous (cuts 3×): you
  // get 3 fragments, not a linearized plasmid. (Игорь 21.06: «режется только
  // по 1 сайту, а их там три — игнорирует».)
  const MULTI = {
    name: 'p3cut', circular: true,
    sequence: `GAATTC${'A'.repeat(20)}GAATTC${'A'.repeat(20)}GAATTC${'A'.repeat(20)}`,
    annotations: [],
  };
  // One EcoRI site → a single click linearizes cleanly (1 fragment, whole plasmid).
  const UNIQUE = {
    name: 'p1cut', circular: true,
    sequence: `GAATTC${'A'.repeat(40)}`, annotations: [],
  };

  it('multi-cut enzyme: hides «линеаризовать», offers the gel', () => {
    render(<RangePickerModal source={MULTI} onConfirm={() => {}} onCancel={() => {}} />);
    reClick('EcoRI', 1);
    expect(screen.queryByTestId('range-picker-single-cut')).toBeNull();
    expect(screen.getByTestId('range-picker-open-digest')).toBeTruthy();
  });

  it('multi-cut + «Использовать как фрагмент» opens the gel, does NOT silently confirm', () => {
    const onConfirm = vi.fn();
    render(<RangePickerModal source={MULTI} onConfirm={onConfirm} onCancel={() => {}} />);
    reClick('EcoRI', 1);
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('digest-fragment-picker')).toBeTruthy();
  });

  it('unique cutter: offers «линеаризовать»; confirm linearizes WITH the enzyme', () => {
    let got = null;
    render(<RangePickerModal source={UNIQUE} onConfirm={(p) => { got = p; }} onCancel={() => {}} />);
    reClick('EcoRI', 1);
    expect(screen.getByTestId('range-picker-single-cut')).toBeTruthy();
    expect(screen.queryByTestId('range-picker-open-digest')).toBeNull();
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    expect(got).toMatchObject({ start: 0, end: UNIQUE.sequence.length, acquisitionMethod: 'restriction' });
    expect(got.acquisitionParams).toMatchObject({ enzymes: ['EcoRI'], single: true });
  });

  it('RE-PAIR whose digest yields >2 fragments → «Использовать как фрагмент» opens the gel (not auto-confirm)', () => {
    // Two EcoRI clicks = a pair, but EcoRI cuts 3× → the digest is ambiguous
    // (>2 fragments). Игорь 22.06: confirm must route to the gel, not auto-pick.
    const onConfirm = vi.fn();
    render(<RangePickerModal source={MULTI} onConfirm={onConfirm} onCancel={() => {}} />);
    reClick('EcoRI', 1);
    reClick('EcoRI', 27);
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('digest-fragment-picker')).toBeTruthy();
  });
});

describe('RangePickerModal — Визуал tab (#3)', () => {
  it('switches from sequence to the real plasmid map', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByTestId('range-picker-visual')).toBeNull();
    act(() => { fireEvent.click(screen.getByTestId('range-picker-tab-visual')); });
    expect(screen.getByTestId('range-picker-visual')).toBeTruthy();
    expect(screen.getByTestId('plasmid-map-v2')).toBeTruthy();
  });

  it('clicking a feature on the visual map sets the range to that feature', () => {
    let got = null;
    const SRCF = {
      name: 'pF', circular: true, sequence: 'AAAACCCCGGGGTTTT',
      annotations: [{ id: 'ori', level: 'region', type: 'origin', name: 'ori', start: 4, end: 12, strand: 1 }],
    };
    render(<RangePickerModal source={SRCF} onConfirm={(p) => { got = p; }} onCancel={() => {}} />);
    act(() => { fireEvent.click(screen.getByTestId('range-picker-tab-visual')); });
    act(() => { fireEvent.click(screen.getByTestId('plasmid-v2-feature-0')); });
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    expect(got).toMatchObject({ start: 4, end: 12, acquisitionMethod: 'feature' });
  });

  it('clicking an RE site on the visual map marks the cut (single cutter → linearize offered)', () => {
    // one EcoRI site → clicking it on the map sets firstRESite (a unique cutter),
    // so the «линеаризовать» affordance appears (Игорь 22.06: RE clickable in Визуал).
    const SRCE = { name: 'pE', circular: true, sequence: `AAAAGAATTC${'A'.repeat(40)}`, annotations: [] };
    render(<RangePickerModal source={SRCE} onConfirm={() => {}} onCancel={() => {}} />);
    act(() => { fireEvent.click(screen.getByTestId('range-picker-tab-visual')); });
    act(() => { fireEvent.click(screen.getByTestId('plasmid-v2-re-label-0')); });
    expect(screen.getByTestId('range-picker-single-cut')).toBeTruthy();
  });
});

function seedLib() {
  act(() => {
    useStore.setState((s) => ({
      ...s,
      libraryEntries: {
        'lib-puc': {
          id: 'lib-puc', kind: 'container', name: 'pUC19',
          payload: { sequence: 'AAAACCCCGGGGTTTT', topology: 'circular', annotations: [{ start: 4, end: 12, label: 'ori' }] },
        },
      },
      projects: {},
      currentProjectId: null,
    }));
  });
}

describe('K5 — RangePickerModal', () => {
  it('renders mini viewer + numeric start/end (default 0..len) + RC + features dropdown', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('range-picker-modal')).toBeTruthy();
    expect(screen.getByTestId('range-picker-viewer')).toBeTruthy();
    // V127 — start input 1-based: default position 1 (store 0).
    expect(screen.getByTestId('range-picker-start').value).toBe('1');
    expect(screen.getByTestId('range-picker-end').value).toBe('16');
    expect(screen.getByTestId('range-picker-rc')).toBeTruthy();
    // features dropdown built from annotations
    expect(within(screen.getByTestId('range-picker-feature')).getByText(/ori \(5-12\)/)).toBeTruthy(); // V127 — 1-based label
  });

  it('numeric range + RC → onConfirm({start,end,rc})', () => {
    let got = null;
    render(<RangePickerModal source={SRC} onConfirm={(p) => { got = p; }} onCancel={() => {}} />);
    act(() => {
      // V127 — inputs 1-based: typed start 2 → store 1; end 10 passes through.
      fireEvent.change(screen.getByTestId('range-picker-start'), { target: { value: '2' } });
      fireEvent.change(screen.getByTestId('range-picker-end'), { target: { value: '10' } });
      fireEvent.click(screen.getByTestId('range-picker-rc'));
    });
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    // V88/V89 — confirm payload теперь несёт acquisitionMethod.
    expect(got).toMatchObject({ start: 1, end: 10, rc: true });
    expect(got.acquisitionMethod).toBe('numeric');
  });

  it('a selection WRAPPING the origin (start>end) confirms as two valid ranges (not start>=end)', () => {
    // Игорь 22.06: «когда кусок переходит через 0 — недопустимый диапазон». A
    // circular wrap selection must split into [start..len] + [0..end], never a
    // single start>=end span the piece-invariant rejects.
    let got = null;
    render(<RangePickerModal source={SRC} onConfirm={(p) => { got = p; }} onCancel={() => {}} />);
    act(() => { fireEvent.change(screen.getByTestId('range-picker-end'), { target: { value: '4' } }); });
    act(() => { fireEvent.change(screen.getByTestId('range-picker-start'), { target: { value: '13' } }); }); // 1-based 13 → store 12
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    expect(got.ranges).toEqual([
      { start: 12, end: 16, orientation: 'forward' },
      { start: 0, end: 4, orientation: 'forward' },
    ]);
  });

  it('a wrap selection shows the «через 0» footer, not «ничего не выделено»', () => {
    const { container } = render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    act(() => { fireEvent.change(screen.getByTestId('range-picker-end'), { target: { value: '4' } }); });
    act(() => { fireEvent.change(screen.getByTestId('range-picker-start'), { target: { value: '13' } }); }); // store 12
    expect(container.textContent).toMatch(/через 0/);
    expect(container.textContent).not.toContain('ничего не выделено');
  });

  it('feature dropdown select → start/end snap to that feature', () => {
    let got = null;
    render(<RangePickerModal source={SRC} onConfirm={(p) => { got = p; }} onCancel={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByTestId('range-picker-feature'), { target: { value: '0' } });
    });
    // V127 — feature {4,12} displays 1-based 5..12; store stays 4..12.
    expect(screen.getByTestId('range-picker-start').value).toBe('5');
    expect(screen.getByTestId('range-picker-end').value).toBe('12');
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    expect(got).toMatchObject({ start: 4, end: 12, rc: false });
    expect(got.acquisitionMethod).toBe('feature');
  });

  it('Esc → onCancel', () => {
    let cancelled = false;
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => { cancelled = true; }} />);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(cancelled).toBe(true);
  });
});

describe('K5 — «+ Плазмида» integration', () => {
  it('pick library entry → RangePicker → confirm default → full-length sourced piece', async () => {
    const zid = openEmptyZone();
    seedLib();
    // Игорь 20.05.2026 — empty assembly now shows the inline library
    // picker directly (EmptyAssemblyLibrary). No more «+ Плазмида» step.
    act(() => { fireEvent.click(screen.getByTestId('assembly-source-picker-section-loose-item-lib-puc')); });
    const m = await screen.findByTestId('range-picker-modal');
    await act(async () => {
      fireEvent.click(within(m).getByTestId('range-picker-confirm'));
      await new Promise((r) => { setTimeout(r, 0); });
    });
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1);
    expect(ps[0].kind).toBe('sourced');
    expect(ps[0].ranges[0]).toMatchObject({ start: 0, end: 16 });
  });

  it('chosen sub-range is respected', async () => {
    const zid = openEmptyZone();
    seedLib();
    act(() => { fireEvent.click(screen.getByTestId('assembly-source-picker-section-loose-item-lib-puc')); });
    const m = await screen.findByTestId('range-picker-modal');
    act(() => {
      fireEvent.change(within(m).getByTestId('range-picker-start'), { target: { value: '4' } });
      fireEvent.change(within(m).getByTestId('range-picker-end'), { target: { value: '12' } });
    });
    await act(async () => {
      fireEvent.click(within(m).getByTestId('range-picker-confirm'));
      await new Promise((r) => { setTimeout(r, 0); });
    });
    const ps = zonePieces(zid);
    expect(ps[0].ranges[0]).toMatchObject({ start: 3, end: 12 }); // V127 — typed start 4 (1-based) → store 3
  });

  it('a wrap selection (start>end) creates a valid two-range piece end-to-end (no «недопустимый диапазон»)', async () => {
    const zid = openEmptyZone();
    seedLib();
    act(() => { fireEvent.click(screen.getByTestId('assembly-source-picker-section-loose-item-lib-puc')); });
    const m = await screen.findByTestId('range-picker-modal');
    // lib-puc is circular (len 16). Wrap: store start=12, end=4 → [12,16]+[0,4].
    act(() => { fireEvent.change(within(m).getByTestId('range-picker-end'), { target: { value: '4' } }); });
    act(() => { fireEvent.change(within(m).getByTestId('range-picker-start'), { target: { value: '13' } }); });
    await act(async () => {
      fireEvent.click(within(m).getByTestId('range-picker-confirm'));
      await new Promise((r) => { setTimeout(r, 0); });
    });
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1); // piece created (the invariant did NOT reject it)
    expect(ps[0].ranges).toHaveLength(2);
    expect(ps[0].ranges[0]).toMatchObject({ start: 12, end: 16 });
    expect(ps[0].ranges[1]).toMatchObject({ start: 0, end: 4 });
  });

  it('drop a canvas container onto the viewer → RangePicker → confirm → sourced piece', () => {
    const zid = openEmptyZone();
    const dt = (() => { const st = {}; return { setData: (k, v) => { st[k] = String(v); }, getData: (k) => st[k] || '', effectAllowed: 'copy' }; })();
    dt.setData('application/x-bodge-container-id', 'cZ');
    const wrap = screen.getByTestId('assembly-viewer-wrap');
    act(() => { fireEvent.dragOver(wrap, { dataTransfer: dt }); });
    act(() => { fireEvent.drop(wrap, { dataTransfer: dt }); });
    const m = screen.getByTestId('range-picker-modal');
    act(() => { fireEvent.click(within(m).getByTestId('range-picker-confirm')); });
    const ps = zonePieces(zid);
    expect(ps).toHaveLength(1);
    expect(ps[0].kind).toBe('sourced');
    expect(ps[0].ranges[0]).toMatchObject({ sourceId: 'cZ', start: 0, end: 16 });
  });
});

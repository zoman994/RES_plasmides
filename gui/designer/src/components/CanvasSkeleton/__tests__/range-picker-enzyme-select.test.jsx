/**
 * RS-PICK2 (+ Игорь 22.06 live-фидбек) — «Выбор фрагмента» enzyme controls:
 *   • a SEARCH box that, the moment it's focused (empty query), drops the list of
 *     UNIQUE cutters for THIS sequence («сразу должен выпадать список уникальных
 *     сайтов»); typing finds ANY enzyme by name (even a multi-cutter);
 *   • a SEPARATE «набор (визуализация)» selector — sets are NOT in the search box.
 * An individual enzyme → digest gel; a набор → visualisation (one chip), not a
 * 1078-fragment digest.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  render, screen, fireEvent, cleanup, act,
} from '@testing-library/react';
import RangePickerModal from '../editor/assembly-mode/RangePickerModal';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import { setCustomEnzymeRegistry } from '../../../restriction-db';

// Circular source: BamHI (GGATCC) ONCE → a unique cutter; EcoRI (GAATTC) TWICE.
const SEQ = `GGATCC${'A'.repeat(20)}GAATTC${'T'.repeat(20)}GAATTC${'C'.repeat(10)}`;
const SRC = { name: 'pTest', circular: true, annotations: [], sequence: SEQ };

afterEach(() => { cleanup(); setCustomEnzymeRegistry({}); });

beforeEach(async () => {
  const db = resetDBForTests(`bodge-a1-${Math.random().toString(36).slice(2)}`);
  await db.delete();
  await db.open();
  useStore.setState((s) => { s.customEnzymes.byId = {}; s.customEnzymes.sets = {}; s.customEnzymes._hydrated = false; });
  setCustomEnzymeRegistry({});
});

const open = () => render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
const search = () => screen.getByTestId('range-picker-enzyme-search');
const focusSearch = () => fireEvent.focus(search());
const typeSearch = (q) => fireEvent.change(search(), { target: { value: q } });
const items = () => screen.queryAllByTestId('range-picker-enzyme-suggest-item');
const pick = (pred) => fireEvent.click(items().find(pred));
const setSelect = () => screen.getByTestId('range-picker-visset-select');

describe('RangePickerModal — enzyme search + набор selector', () => {
  it('renders a search box + a SEPARATE набор-visualisation selector (no 461 dropdown)', () => {
    open();
    expect(search()).toBeTruthy();
    expect(setSelect()).toBeTruthy();
    expect(screen.queryByTestId('range-picker-enzyme-select')).toBeNull();
  });

  it('FOCUS (empty query) immediately lists the UNIQUE cutters for THIS sequence', () => {
    open();
    focusSearch();
    const list = items();
    expect(list.length).toBeGreaterThan(0);
    // BamHI cuts once → present; EcoRI cuts twice → absent from the unique list.
    expect(list.some((s) => s.getAttribute('data-enzyme') === 'BamHI')).toBe(true);
    expect(list.some((s) => s.getAttribute('data-enzyme') === 'EcoRI')).toBe(false);
    // No sets in the search suggestions.
    expect(list.every((s) => s.getAttribute('data-kind') === 'enz')).toBe(true);
  });

  it('typing a name finds ANY enzyme (even a multi-cutter), and never a set', () => {
    open();
    typeSearch('EcoRI');
    const list = items();
    expect(list.some((s) => s.getAttribute('data-enzyme') === 'EcoRI')).toBe(true);
    expect(list.every((s) => s.getAttribute('data-kind') === 'enz')).toBe(true);
  });

  it('typing a SET name does NOT surface a set in the search box', () => {
    open();
    typeSearch('Частые');
    // Strengthened (review nit): no enzyme name contains «Частые», so the list is
    // empty — and crucially no set leaks in either.
    expect(items()).toHaveLength(0);
    expect(items().some((s) => s.getAttribute('data-kind') === 'set')).toBe(false);
  });

  it('a typed query with NO match shows a «нет совпадений» row, not a silent void (review nit)', () => {
    open();
    typeSearch('BamHX'); // no enzyme is named this
    expect(screen.getByTestId('range-picker-enzyme-empty').textContent).toMatch(/нет совпадений/);
    expect(items()).toHaveLength(0);
  });

  it('picking an enzyme adds a removable digest chip', () => {
    open();
    typeSearch('BamHI');
    pick((s) => s.getAttribute('data-enzyme') === 'BamHI');
    const chip = screen.getByTestId('range-picker-enzyme-chip');
    expect(chip.getAttribute('data-enzyme')).toBe('BamHI');
    fireEvent.click(chip.querySelector('[data-testid="range-picker-enzyme-chip-remove"]'));
    expect(screen.queryByTestId('range-picker-enzyme-chip')).toBeNull();
  });

  it('dropdown items are CHECKBOXES — tick several without closing, untick removes', () => {
    open();
    typeSearch('BamHI');
    const bam = () => items().find((s) => s.getAttribute('data-enzyme') === 'BamHI');
    expect(bam().getAttribute('data-checked')).toBe('false');
    fireEvent.click(bam());
    // dropdown stays open (query unchanged), box checked, chip added
    expect(screen.getByTestId('range-picker-enzyme-suggest')).toBeTruthy();
    expect(bam().getAttribute('data-checked')).toBe('true');
    expect(screen.getByTestId('range-picker-enzyme-chip').getAttribute('data-enzyme')).toBe('BamHI');
    // untick → removed
    fireEvent.click(bam());
    expect(bam().getAttribute('data-checked')).toBe('false');
    expect(screen.queryByTestId('range-picker-enzyme-chip')).toBeNull();
  });

  it('a picked enzyme → the primary action opens the digest gel', () => {
    open();
    typeSearch('EcoRI');
    pick((s) => s.getAttribute('data-enzyme') === 'EcoRI');
    expect(screen.queryByTestId('digest-fragment-picker')).toBeNull();
    fireEvent.click(screen.getByTestId('range-picker-confirm'));
    expect(screen.getByTestId('digest-fragment-picker')).toBeTruthy();
  });

  it('the набор selector VISUALISES a set (one chip), no digest chips, no gel', () => {
    open();
    fireEvent.change(setSelect(), { target: { value: 'preset:frequent' } });
    expect(screen.getByTestId('range-picker-visset').getAttribute('data-set-id')).toBe('preset:frequent');
    expect(screen.queryAllByTestId('range-picker-enzyme-chip')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('range-picker-confirm'));
    expect(screen.queryByTestId('digest-fragment-picker')).toBeNull(); // no «простыня»
  });

  it('removing the набор chip clears it AND resets the selector', () => {
    open();
    fireEvent.change(setSelect(), { target: { value: 'preset:frequent' } });
    fireEvent.click(screen.getByTestId('range-picker-visset-remove'));
    expect(screen.queryByTestId('range-picker-visset')).toBeNull();
    expect(setSelect().value).toBe('');
  });

  it('a custom enzyme (RS-C1/C2) is searchable by name', async () => {
    await useStore.getState().addCustomEnzyme({ name: 'XyzI', site: 'AAATTT', cut: [3, 3] });
    open();
    typeSearch('XyzI');
    expect(items().some((s) => s.getAttribute('data-enzyme') === 'XyzI')).toBe(true);
  });

  it('uses one store-only custom catalog for search, audit, and unique-cut confirmation', () => {
    const enzyme = {
      id: 'store-only',
      name: 'StoreOnlyI',
      site: 'AACGTC',
      cut: [1, 3],
      end: '5prime',
      overhang: 'AC',
      isCustom: true,
    };
    act(() => {
      useStore.setState((s) => { s.customEnzymes.byId = { 'store-only': enzyme }; });
    });
    // Deliberately keep the module registry stale: the render's Zustand snapshot
    // is the source of truth throughout this confirmation.
    setCustomEnzymeRegistry({});
    let got = null;
    render(<RangePickerModal
      source={{
        name: 'store-only', circular: true, annotations: [], sequence: 'TTTTAACGTCTTTT',
      }}
      onConfirm={(payload) => { got = payload; }}
      onCancel={() => {}}
    />);

    typeSearch('StoreOnlyI');
    pick((item) => item.getAttribute('data-enzyme') === 'StoreOnlyI');
    fireEvent.click(screen.getByTestId('range-picker-confirm'));

    expect(got).toMatchObject({
      acquisitionMethod: 'restriction',
      acquisitionParams: { enzymes: ['StoreOnlyI'], single: true },
    });
    expect(got.acquisitionParams.cutSites[0].occurrence).toMatchObject({
      enzyme: 'StoreOnlyI', topCut: 5, bottomCut: 7,
    });
  });

  // --- review wvv2x0oxz follow-ups ---

  it('FOCUS on a sequence with NO unique cutters shows an empty-state row, not a void', () => {
    render(<RangePickerModal source={{ name: 'pNo', circular: true, annotations: [], sequence: 'A'.repeat(40) }} onConfirm={() => {}} onCancel={() => {}} />);
    fireEvent.focus(screen.getByTestId('range-picker-enzyme-search'));
    expect(screen.getByTestId('range-picker-enzyme-empty')).toBeTruthy();
    expect(items()).toHaveLength(0);
  });

  it('Enter commits a TYPED match, but does nothing on the empty-focus preview', () => {
    open();
    // Empty focus → Enter is a no-op (must not silently digest the first unique cutter).
    focusSearch();
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(screen.queryByTestId('range-picker-enzyme-chip')).toBeNull();
    // Typed query → Enter picks the first match.
    typeSearch('BamHI');
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(screen.getByTestId('range-picker-enzyme-chip').getAttribute('data-enzyme')).toBe('BamHI');
  });

  it('blur hides the suggestion popup', () => {
    open();
    focusSearch();
    expect(screen.getByTestId('range-picker-enzyme-suggest')).toBeTruthy();
    fireEvent.blur(search());
    expect(screen.queryByTestId('range-picker-enzyme-suggest')).toBeNull();
  });

  it('набор and picked enzymes COEXIST — picking does not reset the набор (Игорь 22.06)', () => {
    open();
    // Select a набор, then pick an enzyme from search → BOTH stay.
    fireEvent.change(setSelect(), { target: { value: 'preset:frequent' } });
    typeSearch('BamHI');
    pick((s) => s.getAttribute('data-enzyme') === 'BamHI');
    expect(screen.getByTestId('range-picker-visset').getAttribute('data-set-id')).toBe('preset:frequent');
    expect(screen.getByTestId('range-picker-enzyme-chip').getAttribute('data-enzyme')).toBe('BamHI');
    // The набор selector still reflects the set.
    expect(setSelect().value).toBe('preset:frequent');
  });
});

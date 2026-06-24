/**
 * RC-A2 (Игорь 24.06) — «продолжить теми же рестриктазами». Когда предыдущий
 * фрагмент сборки вырезан рестриктазами, добавление следующего показывает баннер
 * с конкретным предложением: те же режут / совместимые режут / отсутствуют →
 * добавить праймером. Кнопка «Использовать те же» пред-выбирает ферменты в дайджест.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RangePickerModal from '../editor/assembly-mode/RangePickerModal';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import { setCustomEnzymeRegistry } from '../../../restriction-db';

// Sources tailored to known sites: BamHI=GGATCC, BglII=AGATCT (compat BamHI),
// EcoRI=GAATTC, MfeI=CAATTG (compat EcoRI).
const withBamHI = { name: 'pSame', circular: true, annotations: [], sequence: `GGATCC${'A'.repeat(24)}` };
const withBglII = { name: 'pCompat', circular: true, annotations: [], sequence: `AGATCT${'A'.repeat(24)}` };
const noAatt = { name: 'pAbsent', circular: true, annotations: [], sequence: `${'G'.repeat(10)}${'T'.repeat(10)}${'C'.repeat(10)}` };

afterEach(() => { cleanup(); setCustomEnzymeRegistry({}); });
beforeEach(async () => {
  const db = resetDBForTests(`bodge-rca2-${Math.random().toString(36).slice(2)}`);
  await db.delete();
  await db.open();
  useStore.setState((s) => { s.customEnzymes.byId = {}; s.customEnzymes.sets = {}; s.customEnzymes._hydrated = false; });
  setCustomEnzymeRegistry({});
});

const open = (source, priorEnzymes) => render(
  <RangePickerModal source={source} priorEnzymes={priorEnzymes} onConfirm={() => {}} onCancel={() => {}} />,
);
const chips = () => screen.queryAllByTestId('range-picker-enzyme-chip');

describe('RangePickerModal — RC-A2 предложение тех же рестриктаз', () => {
  it('без priorEnzymes баннер не показывается', () => {
    open(withBamHI, []);
    expect(screen.queryByTestId('range-picker-continuity')).toBeNull();
  });

  it('тот же фермент режет следующий → баннер + «Использовать те же» пред-выбирает его', () => {
    open(withBamHI, ['BamHI']);
    const banner = screen.getByTestId('range-picker-continuity');
    expect(banner.textContent).toMatch(/BamHI/);
    expect(chips().some((c) => c.getAttribute('data-enzyme') === 'BamHI')).toBe(false);
    fireEvent.click(screen.getByTestId('range-picker-continuity-use'));
    expect(chips().some((c) => c.getAttribute('data-enzyme') === 'BamHI')).toBe(true);
  });

  it('того же нет, но совместимый режет → «Использовать те же» выбирает совместимый', () => {
    open(withBglII, ['BamHI']);
    const banner = screen.getByTestId('range-picker-continuity');
    expect(banner.textContent).toMatch(/BglII/);
    fireEvent.click(screen.getByTestId('range-picker-continuity-use'));
    expect(chips().some((c) => c.getAttribute('data-enzyme') === 'BglII')).toBe(true);
  });

  it('RC-BIO-1 — направленная пара с отсутствующим вторым концом → предупреждение о направленности', () => {
    // prev [BamHI, EcoRI] directional; withBamHI has BamHI only → second end absent.
    open(withBamHI, ['BamHI', 'EcoRI']);
    const warn = screen.getByTestId('range-picker-continuity-directional');
    expect(warn).toBeTruthy();
    expect(warn.textContent).toMatch(/EcoRI/);
    expect(warn.textContent).toMatch(/ненаправленно|самолигир/i);
  });

  it('ни того, ни совместимого → баннер показывает «добавить праймером», без кнопки use', () => {
    open(noAatt, ['EcoRI']);
    const banner = screen.getByTestId('range-picker-continuity');
    expect(banner.textContent).toMatch(/EcoRI/);
    expect(screen.getByTestId('range-picker-continuity-primer')).toBeTruthy();
    expect(screen.queryByTestId('range-picker-continuity-use')).toBeNull();
  });
});

/**
 * RS-C3 — «Сайты рестрикции» workspace: CRUD for user-defined enzymes + named
 * enzyme sets, persisted through customEnzymesSlice (Dexie v7 + scan registry).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import RestrictionSitesWorkspace from '../RestrictionSitesWorkspace';
import { useStore } from '../../../store';
import { resetDBForTests, listCustomEnzymes, listEnzymeSets } from '../../../db/dexie-schema';
import { setCustomEnzymeRegistry } from '../../../restriction-db';

beforeEach(async () => {
  const db = resetDBForTests(`bodge-c3-${Math.random().toString(36).slice(2)}`);
  await db.delete();
  await db.open();
  useStore.setState((s) => { s.customEnzymes.byId = {}; s.customEnzymes.sets = {}; s.customEnzymes._hydrated = false; });
  setCustomEnzymeRegistry({});
});
afterEach(() => { cleanup(); setCustomEnzymeRegistry({}); });

const fill = (testid, value) => fireEvent.change(screen.getByTestId(testid), { target: { value } });

describe('RestrictionSitesWorkspace', () => {
  it('renders with the built-in catalog', () => {
    render(<RestrictionSitesWorkspace />);
    expect(screen.getByTestId('restriction-sites-workspace')).toBeTruthy();
    expect(screen.getAllByTestId('rs-builtin-enzyme').length).toBeGreaterThan(20);
  });

  it('adds a custom enzyme → appears in the list + persists + scan registry', async () => {
    render(<RestrictionSitesWorkspace />);
    fill('rs-enz-name', 'XyzI');
    fill('rs-enz-site', 'AAATTT');
    fill('rs-enz-cutf', '3');
    fill('rs-enz-cutr', '3');
    fireEvent.click(screen.getByTestId('rs-enz-add'));
    await waitFor(() => {
      const row = screen.getAllByTestId('rs-custom-enzyme').find((r) => r.getAttribute('data-enzyme') === 'XyzI');
      expect(row).toBeTruthy();
    });
    expect((await listCustomEnzymes()).some((e) => e.name === 'XyzI')).toBe(true);
  });

  it('rejects an invalid enzyme (bad site) with an error, no row added', async () => {
    render(<RestrictionSitesWorkspace />);
    fill('rs-enz-name', 'BadI');
    fill('rs-enz-site', 'GAZTTC');
    fill('rs-enz-cutf', '1');
    fill('rs-enz-cutr', '5');
    fireEvent.click(screen.getByTestId('rs-enz-add'));
    await waitFor(() => expect(screen.getByTestId('rs-enz-errors')).toBeTruthy());
    expect(screen.queryAllByTestId('rs-custom-enzyme')).toHaveLength(0);
  });

  it('edits a custom enzyme («зайти и поправить» like a library entry)', async () => {
    const { id } = await useStore.getState().addCustomEnzyme({ name: 'EdI', site: 'GAATTC', cut: [1, 5] });
    render(<RestrictionSitesWorkspace />);
    // enter edit mode — form pre-fills, header switches to «Изменить»
    fireEvent.click(screen.getByTestId('rs-custom-enzyme-edit'));
    expect(screen.getByTestId('rs-enz-form').getAttribute('data-mode')).toBe('edit');
    expect(screen.getByTestId('rs-enz-name').value).toBe('EdI');
    // change the cut → blunt, save
    fill('rs-enz-cutf', '3');
    fill('rs-enz-cutr', '3');
    fireEvent.click(screen.getByTestId('rs-enz-add'));
    await waitFor(() => expect(useStore.getState().customEnzymes.byId[id].end).toBe('blunt'));
    expect((await listCustomEnzymes()).find((e) => e.id === id).overhang).toBeNull();
    // form resets to add mode after the save resolves
    await waitFor(() => expect(screen.getByTestId('rs-enz-form').getAttribute('data-mode')).toBe('add'));
  });

  it('deletes a custom enzyme', async () => {
    await useStore.getState().addCustomEnzyme({ name: 'DelI', site: 'AAATTT', cut: [3, 3] });
    render(<RestrictionSitesWorkspace />);
    fireEvent.click(screen.getByTestId('rs-custom-enzyme-remove'));
    await waitFor(() => expect(screen.queryAllByTestId('rs-custom-enzyme')).toHaveLength(0));
    expect(await listCustomEnzymes()).toHaveLength(0);
  });

  it('shows preset sets + creates a user set', async () => {
    render(<RestrictionSitesWorkspace />);
    const presets = screen.getAllByTestId('rs-set').filter((s) => s.getAttribute('data-origin') === 'preset');
    expect(presets.length).toBeGreaterThanOrEqual(2);
    fill('rs-set-name', 'Мой набор');
    fireEvent.click(screen.getByTestId('rs-set-create'));
    await waitFor(() => {
      expect(screen.getAllByTestId('rs-set').some((s) => s.getAttribute('data-origin') === 'user')).toBe(true);
    });
    expect(await listEnzymeSets()).toHaveLength(1);
  });

  const findSet = (id) => screen.getAllByTestId('rs-set').find((s) => s.getAttribute('data-set-id') === id);

  it('a preset is editable — toggling a member marks it «изменён» + shows reset', async () => {
    render(<RestrictionSitesWorkspace />);
    fireEvent.click(findSet('preset:frequent').querySelector('[data-testid="rs-set-select"]'));
    const toggle = screen.getAllByTestId('rs-set-member-toggle').find((t) => t.getAttribute('data-enzyme') === 'BamHI');
    fireEvent.click(toggle.querySelector('input'));
    await waitFor(() => expect(findSet('preset:frequent').getAttribute('data-edited')).toBe('true'));
    expect(screen.getByTestId('rs-set-reset')).toBeTruthy();
  });

  it('reset restores a preset to its default', async () => {
    render(<RestrictionSitesWorkspace />);
    fireEvent.click(findSet('preset:frequent').querySelector('[data-testid="rs-set-select"]'));
    fireEvent.click(screen.getAllByTestId('rs-set-member-toggle').find((t) => t.getAttribute('data-enzyme') === 'BamHI').querySelector('input'));
    await waitFor(() => screen.getByTestId('rs-set-reset'));
    fireEvent.click(screen.getByTestId('rs-set-reset'));
    await waitFor(() => expect(findSet('preset:frequent').getAttribute('data-edited')).toBe('false'));
  });

  it('member search filters the catalog checkbox list', async () => {
    const { id } = await useStore.getState().addEnzymeSet('S', []);
    render(<RestrictionSitesWorkspace />);
    fireEvent.click(findSet(id).querySelector('[data-testid="rs-set-select"]'));
    const before = screen.getAllByTestId('rs-set-member-toggle').length;
    fireEvent.change(screen.getByTestId('rs-set-member-search'), { target: { value: 'EcoRI' } });
    const after = screen.getAllByTestId('rs-set-member-toggle');
    expect(after.length).toBeLessThan(before);
    expect(after.some((t) => t.getAttribute('data-enzyme') === 'EcoRI')).toBe(true);
  });

  it('«добавить из набора» unions another set\'s enzymes', async () => {
    const { id } = await useStore.getState().addEnzymeSet('Target', []);
    render(<RestrictionSitesWorkspace />);
    fireEvent.click(findSet(id).querySelector('[data-testid="rs-set-select"]'));
    fireEvent.change(screen.getByTestId('rs-set-addfrom'), { target: { value: 'preset:frequent' } });
    await waitFor(() => {
      expect(useStore.getState().customEnzymes.sets[id].enzymes).toContain('EcoRI');
      expect(useStore.getState().customEnzymes.sets[id].enzymes.length).toBeGreaterThanOrEqual(10);
    });
  });

  it('renames a set (rename input commits on blur)', async () => {
    const { id } = await useStore.getState().addEnzymeSet('Old', []);
    render(<RestrictionSitesWorkspace />);
    fireEvent.click(findSet(id).querySelector('[data-testid="rs-set-select"]'));
    const rn = screen.getByTestId('rs-set-rename');
    fireEvent.change(rn, { target: { value: 'Новое имя' } });
    fireEvent.blur(rn);
    await waitFor(() => expect(useStore.getState().customEnzymes.sets[id].name).toBe('Новое имя'));
  });

  it('enzyme row expands to a buffer / temperature / compatibility reference', () => {
    render(<RestrictionSitesWorkspace />);
    fireEvent.change(screen.getByTestId('rs-builtin-search'), { target: { value: 'EcoRI' } });
    const row = screen.getAllByTestId('rs-builtin-enzyme').find((r) => r.getAttribute('data-enzyme') === 'EcoRI');
    fireEvent.click(row.querySelector('div'));
    const detail = screen.getByTestId('rs-enzyme-detail');
    expect(detail.textContent).toMatch(/буфер/i);
    expect(detail.textContent).toMatch(/Совместимы/i);
    // suppliers shown as NAMES, not raw REBASE codes (Игорь 22.06)
    expect(detail.textContent).toMatch(/New England Biolabs/);
    expect(detail.textContent).not.toMatch(/Поставщики: [A-Z] /);
  });

  it('toggles an enzyme into a user set', async () => {
    const { id } = await useStore.getState().addEnzymeSet('Set1', []);
    render(<RestrictionSitesWorkspace />);
    // expand the user set
    const setEl = screen.getAllByTestId('rs-set').find((s) => s.getAttribute('data-set-id') === id);
    fireEvent.click(setEl.querySelector('[data-testid="rs-set-select"]'));
    // toggle EcoRI in
    const toggle = screen.getAllByTestId('rs-set-member-toggle').find((t) => t.getAttribute('data-enzyme') === 'EcoRI');
    fireEvent.click(toggle.querySelector('input'));
    await waitFor(() => expect(useStore.getState().customEnzymes.sets[id].enzymes).toContain('EcoRI'));
  });
});

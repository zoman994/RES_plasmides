/**
 * CommonFeaturesPanel — master-detail (SPEC_COMMON_FEATURES DEC-CF-10).
 * Master list selects a feature; detail mounts a read-only SequenceView over a
 * synthesized single-region fragment (DNA + annotation + AA track for
 * CDS/marker/reporter). Edit/reset/delete live in the detail header. Built-in
 * DB mocked via fetch; overlay from the live store.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import CommonFeaturesPanel from '../index.jsx';
import { useStore } from '../../../../store';
import { invalidateMergedCache } from '../../../../store/commonFeaturesSlice';
import { resetDBForTests } from '../../../../db/dexie-schema';

// 20-codon clean ORF (M + 19×A, no stop) → AA row for a CDS/reporter.
const CDS_DNA = 'ATG' + 'GCT'.repeat(19);
const PROM_DNA = 'TTGACAATTAATCATCGGCTCGTATAATGTGTGGAATTGTGAGCGGATAACAATTTCACA';
const USER_DNA = 'CCCCGGGGAAAATTTTCCCCGGGGAAAATTTTCCCCGGGGAAAATTTTCCCCGGGGAAAA';

const BUILTIN = {
  features: [
    { id: 'cf_cds', name: 'GFP', type: 'CDS', sequence: CDS_DNA, length: CDS_DNA.length },
    { id: 'cf_prom', name: 'lacP', type: 'promoter', sequence: PROM_DNA, length: PROM_DNA.length },
  ],
};

afterEach(cleanup);
beforeEach(async () => {
  const name = `bodgegene-panel2-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(BUILTIN) }));
  invalidateMergedCache();
  useStore.setState((s) => {
    s.commonFeatures.userFeatures = {};
    s.commonFeatures.overrides = {};
    s.commonFeatures._hydrated = false;
  });
});

describe('CommonFeaturesPanel — master', () => {
  it('lists factory features with the factory badge', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-badge-cf_cds')).toBeTruthy());
    expect(screen.getByTestId('common-feature-badge-cf_cds').dataset.origin).toBe('factory');
  });

  it('empty selection shows the detail hint', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    expect(screen.getByTestId('common-features-detail-hint')).toBeTruthy();
  });

  it('search filters the master by name', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    fireEvent.change(screen.getByTestId('common-features-search'), { target: { value: 'lac' } });
    await waitFor(() => expect(screen.queryByTestId('common-feature-row-cf_cds')).toBeNull());
    expect(screen.getByTestId('common-feature-row-cf_prom')).toBeTruthy();
  });
});

describe('CommonFeaturesPanel — detail (master-detail DEC-CF-10)', () => {
  it('clicking a feature mounts a read-only SequenceView with the record fragment', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-row-cf_cds'));
    expect(screen.getByTestId('common-features-detail-name').textContent).toBe('GFP');
    await waitFor(() => expect(screen.getByTestId('sequence-view-root')).toBeTruthy());
  });

  it('CDS feature → AA track present; switching to non-CDS → AA absent', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-row-cf_cds'));
    await waitFor(() => expect(screen.getAllByTestId('sequence-view-aa-row').length).toBeGreaterThanOrEqual(1));
    // Switch selection → fragment changes (name) + no AA for the promoter.
    fireEvent.click(screen.getByTestId('common-feature-row-cf_prom'));
    await waitFor(() => expect(screen.getByTestId('common-features-detail-name').textContent).toBe('lacP'));
    expect(screen.queryAllByTestId('sequence-view-aa-row').length).toBe(0);
  });
});

describe('CommonFeaturesPanel — edit / reset / delete (detail header)', () => {
  it('editing a factory feature writes an override (badge → overridden)', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-row-cf_cds'));
    fireEvent.click(screen.getByTestId('common-feature-edit'));
    fireEvent.change(screen.getByTestId('common-feature-edit-name'), { target: { value: 'GFP*' } });
    fireEvent.click(screen.getByTestId('common-feature-edit-save'));
    await waitFor(() => expect(screen.getByTestId('common-features-detail-badge').dataset.origin).toBe('overridden'));
    expect(useStore.getState().commonFeatures.overrides.cf_cds.name).toBe('GFP*');
  });

  it('reset-to-factory removes the override', async () => {
    await useStore.getState().overrideCommonFeature('cf_cds', { name: 'GFP*' });
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-row-cf_cds'));
    fireEvent.click(screen.getByTestId('common-feature-reset'));
    fireEvent.click(screen.getByTestId('common-feature-confirm-yes'));
    await waitFor(() => expect(useStore.getState().commonFeatures.overrides.cf_cds).toBeUndefined());
  });

  it('deleting a user feature removes it and clears the detail to hint', async () => {
    const r = await useStore.getState().promoteFeature({ name: 'MyFeat', type: 'misc', sequence: USER_DNA });
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId(`common-feature-row-${r.id}`)).toBeTruthy());
    fireEvent.click(screen.getByTestId(`common-feature-row-${r.id}`));
    fireEvent.click(screen.getByTestId('common-feature-delete'));
    fireEvent.click(screen.getByTestId('common-feature-confirm-yes'));
    await waitFor(() => expect(useStore.getState().commonFeatures.userFeatures[r.id]).toBeUndefined());
    expect(screen.getByTestId('common-features-detail-hint')).toBeTruthy();
  });
});

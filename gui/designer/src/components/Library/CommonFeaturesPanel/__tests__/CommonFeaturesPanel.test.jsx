/**
 * CommonFeaturesPanel — master-detail + always-editable detail (DEC-CF-10/12).
 * Master selects a feature; detail = inline name/type header fields + read/edit
 * SequenceView over a synthesized single-region fragment (DNA + annotation + AA
 * for CDS/marker/reporter). Inline name/type edits route factory→override.
 * Lean §9-B textarea editor is gone. Built-in DB mocked via fetch.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import CommonFeaturesPanel from '../index.jsx';
import { useStore } from '../../../../store';
import { invalidateMergedCache, flushCommonFeatureWrites } from '../../../../store/commonFeaturesSlice';
import { resetDBForTests } from '../../../../db/dexie-schema';

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
  await flushCommonFeatureWrites();
  const name = `bodgegene-panel3-${Math.random().toString(36).slice(2)}`;
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
  it('lists factory features with the factory badge; empty selection → hint', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-badge-cf_cds')).toBeTruthy());
    expect(screen.getByTestId('common-feature-badge-cf_cds').dataset.origin).toBe('factory');
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

describe('CommonFeaturesPanel — detail viewer (DEC-CF-10)', () => {
  it('clicking a feature mounts an editable SequenceView with the record', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-row-cf_cds'));
    expect(screen.getByTestId('common-feature-name-input').value).toBe('GFP');
    await waitFor(() => expect(screen.getByTestId('sequence-view-root')).toBeTruthy());
  });

  it('CDS → AA track present; switching to a non-CDS → AA absent', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-row-cf_cds'));
    await waitFor(() => expect(screen.getAllByTestId('sequence-view-aa-row').length).toBeGreaterThanOrEqual(1));
    fireEvent.click(screen.getByTestId('common-feature-row-cf_prom'));
    await waitFor(() => expect(screen.getByTestId('common-feature-name-input').value).toBe('lacP'));
    expect(screen.queryAllByTestId('sequence-view-aa-row').length).toBe(0);
  });

  it('lean §9-B editor is gone (no Edit button, no sequence textarea)', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-row-cf_cds'));
    expect(screen.queryByTestId('common-feature-edit')).toBeNull();
    expect(screen.queryByTestId('common-feature-edit-seq')).toBeNull();
    expect(screen.queryByTestId('common-feature-edit-save')).toBeNull();
  });
});

describe('CommonFeaturesPanel — inline name/type edit (header) + reset/delete', () => {
  it('editing the name input on a factory feature writes an override (badge → overridden)', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-row-cf_cds'));
    fireEvent.change(screen.getByTestId('common-feature-name-input'), { target: { value: 'GFP*' } });
    await waitFor(() => expect(screen.getByTestId('common-features-detail-badge').dataset.origin).toBe('overridden'));
    expect(useStore.getState().commonFeatures.overrides.cf_cds.name).toBe('GFP*');
  });

  it('changing the type select updates the override', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-row-cf_cds'));
    fireEvent.change(screen.getByTestId('common-feature-type-select'), { target: { value: 'marker' } });
    await waitFor(() => expect(useStore.getState().commonFeatures.overrides.cf_cds.type).toBe('marker'));
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

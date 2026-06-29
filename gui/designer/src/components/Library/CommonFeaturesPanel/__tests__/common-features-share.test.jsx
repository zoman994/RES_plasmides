/**
 * FEAT-CF-SHARE — export/import buttons in the CommonFeaturesPanel header.
 * The pure serialize/parse + the slice import action are covered by
 * common-features-io.test.js + the slice's own promoteFeature/override tests;
 * here we assert the UI wiring (export → downloadBlob with the overlay JSON).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const downloadBlob = vi.fn();
vi.mock('../../../../lib/file-system', () => ({ downloadBlob: (...a) => downloadBlob(...a) }));

import CommonFeaturesPanel from '../index.jsx';
import { useStore } from '../../../../store';
import { invalidateMergedCache, flushCommonFeatureWrites } from '../../../../store/commonFeaturesSlice';
import { resetDBForTests } from '../../../../db/dexie-schema';

const BUILTIN = { features: [] };

afterEach(cleanup);
beforeEach(async () => {
  await flushCommonFeatureWrites();
  const db = resetDBForTests(`bodgegene-cfshare-${Math.random().toString(36).slice(2)}`);
  await db.delete();
  await db.open();
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(BUILTIN) }));
  invalidateMergedCache();
  downloadBlob.mockClear();
  useStore.setState((s) => {
    s.commonFeatures.userFeatures = {
      u1: { id: 'u1', kind: 'user', name: 'PglaA-lab', type: 'promoter', sequence: 'ACGTACGTAC' },
    };
    s.commonFeatures.overrides = {};
    s.commonFeatures._hydrated = true;
  });
});

describe('CommonFeaturesPanel — FEAT-CF-SHARE export/import', () => {
  it('renders export + import controls', () => {
    render(<CommonFeaturesPanel />);
    expect(screen.getByTestId('common-features-export')).toBeTruthy();
    expect(screen.getByTestId('common-features-import')).toBeTruthy();
    expect(screen.getByTestId('common-features-import-input')).toBeTruthy();
  });

  it('export downloads a JSON blob carrying the curated overlay', async () => {
    render(<CommonFeaturesPanel />);
    fireEvent.click(screen.getByTestId('common-features-export'));
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = downloadBlob.mock.calls[0];
    expect(name).toMatch(/\.json$/);
    const text = await blob.text();
    expect(text).toContain('PglaA-lab');
    expect(text).toContain('bodgegene-common-features');
  });

  it('importing a valid file adds the feature to the overlay', async () => {
    render(<CommonFeaturesPanel />);
    const doc = JSON.stringify({
      format: 'bodgegene-common-features', version: 1,
      userFeatures: [{ name: 'CBHI-signal', type: 'sig_peptide', sequence: 'ATGCGTTCT' }],
      overrides: [],
    });
    const file = new File([doc], 'set.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('common-features-import-input'), { target: { files: [file] } });
    await waitFor(() => {
      const names = Object.values(useStore.getState().commonFeatures.userFeatures).map((f) => f.name);
      expect(names).toContain('CBHI-signal');
    });
  });
});

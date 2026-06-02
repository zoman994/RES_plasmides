/**
 * CommonFeaturesPanel — in-viewer sequence editing (DEC-CF-12, Пачка 3).
 * SequenceView is stubbed to expose its `editable` flag + `onSequenceEdit`
 * callback (driving the real keyboard in jsdom is brittle), so we can fire
 * insert/delete ops and assert the record's sequence changes — and that a
 * factory feature's first edit creates an override.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Stub the heavy viewer: surface editable + fire insert/delete ops on click.
vi.mock('../../../SequenceView', () => ({
  default: ({ editable, onSequenceEdit }) => (
    <div data-testid="seqview-stub" data-editable={editable ? 'true' : 'false'}>
      <button data-testid="seqview-insert-A0" onClick={() => onSequenceEdit?.({ kind: 'insert', pos: 0, char: 'A' })}>ins</button>
      <button data-testid="seqview-delete-0" onClick={() => onSequenceEdit?.({ kind: 'delete', pos: 0, length: 1 })}>del</button>
    </div>
  ),
}));
vi.mock('../../inspector/tabs/LinearFeatureBar', () => ({ default: () => <div data-testid="lfb-stub" /> }));

import CommonFeaturesPanel from '../index.jsx';
import { useStore } from '../../../../store';
import { invalidateMergedCache, flushCommonFeatureWrites } from '../../../../store/commonFeaturesSlice';
import { resetDBForTests } from '../../../../db/dexie-schema';

const CDS_DNA = 'ATG' + 'GCT'.repeat(19);
const BUILTIN = { features: [{ id: 'cf_cds', name: 'GFP', type: 'CDS', sequence: CDS_DNA, length: CDS_DNA.length }] };

afterEach(cleanup);
beforeEach(async () => {
  await flushCommonFeatureWrites();
  const name = `bodgegene-panel3e-${Math.random().toString(36).slice(2)}`;
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

describe('CommonFeaturesPanel — onSequenceEdit (in-viewer editing)', () => {
  async function selectCds() {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_cds')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-row-cf_cds'));
    await waitFor(() => expect(screen.getByTestId('seqview-stub')).toBeTruthy());
  }

  it('detail SequenceView is editable', async () => {
    await selectCds();
    expect(screen.getByTestId('seqview-stub').dataset.editable).toBe('true');
  });

  it('insert op on a factory feature creates an override with the new sequence', async () => {
    await selectCds();
    fireEvent.click(screen.getByTestId('seqview-insert-A0'));
    await waitFor(() => expect(useStore.getState().commonFeatures.overrides.cf_cds).toBeDefined());
    expect(useStore.getState().commonFeatures.overrides.cf_cds.sequence).toBe('A' + CDS_DNA);
    // badge flips to overridden
    expect(screen.getByTestId('common-features-detail-badge').dataset.origin).toBe('overridden');
  });

  it('delete op shortens the sequence', async () => {
    await selectCds();
    fireEvent.click(screen.getByTestId('seqview-delete-0'));
    await waitFor(() => expect(useStore.getState().commonFeatures.overrides.cf_cds).toBeDefined());
    expect(useStore.getState().commonFeatures.overrides.cf_cds.sequence).toBe(CDS_DNA.slice(1));
  });

  it('CDS edit keeps a protein on the override (consistent with the new DNA)', async () => {
    await selectCds();
    fireEvent.click(screen.getByTestId('seqview-insert-A0'));
    await waitFor(() => expect(useStore.getState().commonFeatures.overrides.cf_cds).toBeDefined());
    const ov = useStore.getState().commonFeatures.overrides.cf_cds;
    expect(typeof ov.protein).toBe('string');
    expect(ov.protein.length).toBeGreaterThanOrEqual(10);
  });
});

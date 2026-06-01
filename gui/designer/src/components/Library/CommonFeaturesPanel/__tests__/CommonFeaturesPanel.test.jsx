/**
 * CommonFeaturesPanel (SPEC_COMMON_FEATURES DEC-CF-06). Lists merged features
 * with origin badges; lean inline edit (override factory / update user),
 * reset-to-factory on overridden rows, delete on user rows, search filter.
 * Built-in DB is mocked via fetch; the overlay comes from the live store.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import CommonFeaturesPanel from '../index.jsx';
import { useStore } from '../../../../store';
import { invalidateMergedCache } from '../../../../store/commonFeaturesSlice';
import { resetDBForTests } from '../../../../db/dexie-schema';

const DNA = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';
const BUILTIN = {
  features: [
    { id: 'cf_a', name: 'AmpR', type: 'marker', sequence: DNA, length: DNA.length },
    { id: 'cf_b', name: 'KanR', type: 'marker', sequence: DNA, length: DNA.length },
  ],
};

afterEach(cleanup);
beforeEach(async () => {
  const name = `bodgegene-panel-${Math.random().toString(36).slice(2)}`;
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

describe('CommonFeaturesPanel', () => {
  it('lists factory features with the factory badge', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-badge-cf_a')).toBeTruthy());
    expect(screen.getByTestId('common-feature-badge-cf_a').dataset.origin).toBe('factory');
    expect(screen.getByTestId('common-feature-badge-cf_b').dataset.origin).toBe('factory');
  });

  it('shows a user feature with the user badge + delete control', async () => {
    const r = await useStore.getState().promoteFeature({ name: 'MyFeat', type: 'misc', sequence: DNA.replace(/A/g, 'T') });
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId(`common-feature-badge-${r.id}`)).toBeTruthy());
    expect(screen.getByTestId(`common-feature-badge-${r.id}`).dataset.origin).toBe('user');
    expect(screen.getByTestId(`common-feature-delete-${r.id}`)).toBeTruthy();
  });

  it('editing a factory feature writes an override (badge → overridden)', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-edit-cf_a')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-edit-cf_a'));
    fireEvent.change(screen.getByTestId('common-feature-edit-name-cf_a'), { target: { value: 'AmpR*' } });
    fireEvent.click(screen.getByTestId('common-feature-edit-save-cf_a'));
    await waitFor(() => expect(screen.getByTestId('common-feature-badge-cf_a').dataset.origin).toBe('overridden'));
    expect(useStore.getState().commonFeatures.overrides.cf_a.name).toBe('AmpR*');
  });

  it('reset-to-factory removes the override', async () => {
    await useStore.getState().overrideCommonFeature('cf_a', { name: 'AmpR*' });
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-reset-cf_a')).toBeTruthy());
    fireEvent.click(screen.getByTestId('common-feature-reset-cf_a'));
    fireEvent.click(screen.getByTestId('common-feature-confirm-yes-cf_a'));
    await waitFor(() => expect(useStore.getState().commonFeatures.overrides.cf_a).toBeUndefined());
  });

  it('deleting a user feature removes it from the store', async () => {
    const r = await useStore.getState().promoteFeature({ name: 'MyFeat', type: 'misc', sequence: DNA.replace(/A/g, 'T') });
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId(`common-feature-delete-${r.id}`)).toBeTruthy());
    fireEvent.click(screen.getByTestId(`common-feature-delete-${r.id}`));
    fireEvent.click(screen.getByTestId(`common-feature-confirm-yes-${r.id}`));
    await waitFor(() => expect(useStore.getState().commonFeatures.userFeatures[r.id]).toBeUndefined());
  });

  it('search filters by name', async () => {
    render(<CommonFeaturesPanel />);
    await waitFor(() => expect(screen.getByTestId('common-feature-row-cf_a')).toBeTruthy());
    fireEvent.change(screen.getByTestId('common-features-search'), { target: { value: 'kan' } });
    await waitFor(() => expect(screen.queryByTestId('common-feature-row-cf_a')).toBeNull());
    expect(screen.getByTestId('common-feature-row-cf_b')).toBeTruthy();
  });
});

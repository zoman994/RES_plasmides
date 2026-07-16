/**
 * LooseZone «📁+» create-folder via inline input (BUGS V191).
 *
 * In the packaged Electron app `window.prompt()` is a no-op (returns null), so
 * the old prompt-based create-folder button did nothing. The button now opens
 * an inline text input; Enter creates the folder (recorded in looseFolders so
 * empty folders persist), Escape/blur cancels.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../../../store';
import { resetDBForTests } from '../../../../db/dexie-schema';
import LooseZone from '../LooseZone';

async function freshDB() {
  const name = `bodgegene-lzcf-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => {
    s.libraryEntries = {};
    s.looseFolders = [];
    s.workspace = { active: 'library', history: [], context: {} };
    s.currentProjectId = null;
  });
});
afterEach(cleanup);

describe('LooseZone — inline create-folder (Electron-safe, no window.prompt)', () => {
  it('clicking «📁+» shows an inline input (no window.prompt)', () => {
    render(<LooseZone />);
    expect(screen.queryByTestId('loose-zone-new-folder-input')).toBeNull();
    fireEvent.click(screen.getByTestId('loose-zone-add-folder-btn'));
    expect(screen.getByTestId('loose-zone-new-folder-input')).toBeTruthy();
  });

  it('typing a name + Enter records the folder in looseFolders', () => {
    render(<LooseZone />);
    fireEvent.click(screen.getByTestId('loose-zone-add-folder-btn'));
    const input = screen.getByTestId('loose-zone-new-folder-input');
    fireEvent.change(input, { target: { value: 'Backbones' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((useStore.getState().looseFolders || [])).toContain('Backbones');
    // input closes after commit
    expect(screen.queryByTestId('loose-zone-new-folder-input')).toBeNull();
  });

  it('Escape cancels without creating a folder', () => {
    render(<LooseZone />);
    fireEvent.click(screen.getByTestId('loose-zone-add-folder-btn'));
    const input = screen.getByTestId('loose-zone-new-folder-input');
    fireEvent.change(input, { target: { value: 'Nope' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((useStore.getState().looseFolders || [])).not.toContain('Nope');
    expect(screen.queryByTestId('loose-zone-new-folder-input')).toBeNull();
  });

  it('a slash/colon in the name is sanitized to a single-segment folder', () => {
    render(<LooseZone />);
    fireEvent.click(screen.getByTestId('loose-zone-add-folder-btn'));
    const input = screen.getByTestId('loose-zone-new-folder-input');
    fireEvent.change(input, { target: { value: 'A/B:C' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((useStore.getState().looseFolders || [])).toContain('A-B-C');
  });
});

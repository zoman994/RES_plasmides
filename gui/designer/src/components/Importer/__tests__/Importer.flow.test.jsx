/**
 * Sprint M-B.1 K2 — Importer skeleton flow integration tests.
 *
 * Verifies: fullscreen mount routing, default mode (advanced) from
 * localStorage, mode toggle persistence, dropzone parsing into the local
 * state hook, and that simple mode collapses the stepper to 1/1.
 *
 * Step 2 Combined view (K5) and Confirm/AutonameModal (K6) are exercised
 * by their own test files in later K-steps.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import { IMPORTER_MODE_STORAGE_KEY } from '../../../store/uiSlice';
import { getItem, removeItem } from '../../../lib/storage';
import Importer from '../index';

// Auto-annotate is heavy and unrelated to K2 routing/skeleton; mock it.
vi.mock('../../../auto-annotate', () => ({
  autoAnnotate: vi.fn(({ annotations = [] }) => annotations),
  enrichWithCommonFeatures: vi.fn(async (_seq, anns) => anns),
}));

async function freshDB() {
  const name = `bodgegene-test-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
  return db;
}

async function reset() {
  await freshDB();
  removeItem(IMPORTER_MODE_STORAGE_KEY);
  useStore.setState((state) => {
    state.canvas.activeFullscreen = 'importer';
    state.canvas.navStack = [{ fullscreen: 'importer', payload: { target: 'project' } }];
    state.importerMode = 'advanced';
    state.toasts = [];
    state.primersById = {};
    state._primersHydrated = true;
  });
}

function fileFromText(name, text) {
  return new File([text], name, { type: 'text/plain' });
}

const FASTA_TEXT = `>my_seq
ATGCATGCATGCATGC
`;

beforeEach(async () => {
  await reset();
  cleanup();
});

describe('M-B.1 K2 — Importer flow', () => {
  it('1) mounts in advanced mode by default with Step 1 visible', () => {
    render(<Importer />);
    const root = screen.getByTestId('importer-fullscreen');
    expect(root.dataset.target).toBe('project');
    expect(root.dataset.mode).toBe('advanced');
    expect(root.dataset.step).toBe('1');
    expect(screen.getByTestId('importer-step1')).toBeTruthy();
    expect(screen.queryByTestId('importer-step2-placeholder')).toBeNull();
  });

  it('2) target=library shows the to-library header copy', () => {
    useStore.setState((state) => {
      state.canvas.navStack = [{ fullscreen: 'importer', payload: { target: 'library' } }];
    });
    render(<Importer />);
    const root = screen.getByTestId('importer-fullscreen');
    expect(root.dataset.target).toBe('library');
  });

  it('3) toggle to simple mode collapses stepper to 1/1 and persists in localStorage', () => {
    render(<Importer />);
    fireEvent.click(screen.getByTestId('importer-mode-simple'));
    const root = screen.getByTestId('importer-fullscreen');
    expect(root.dataset.mode).toBe('simple');
    expect(useStore.getState().importerMode).toBe('simple');
    expect(getItem(IMPORTER_MODE_STORAGE_KEY)).toBe('"simple"');
    const stepper = screen.getByTestId('importer-stepper');
    expect(stepper.textContent).toMatch(/^1\/1/);
  });

  it('4) drop a file into Step1 dropzone parses + appends to parsedItems', async () => {
    render(<Importer />);
    const dz = screen.getByTestId('importer-dropzone');
    const file = fileFromText('thing.fasta', FASTA_TEXT);
    await act(async () => {
      fireEvent.drop(dz, {
        dataTransfer: { files: [file], types: ['Files'] },
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId(`importer-file-row-${file.name}`)).toBeTruthy();
    });
    const next = screen.getByTestId('importer-next');
    expect(next.disabled).toBe(false);
  });

  it('5) Cancel pops the importer fullscreen off the nav stack', () => {
    useStore.setState((state) => {
      state.canvas.navStack = [
        { fullscreen: 'dag', payload: null },
        { fullscreen: 'importer', payload: { target: 'project' } },
      ];
      state.canvas.activeFullscreen = 'importer';
    });
    render(<Importer />);
    fireEvent.click(screen.getByTestId('importer-cancel'));
    expect(useStore.getState().canvas.activeFullscreen).toBe('dag');
  });

  it('6) Next in simple mode surfaces the K3-pending toast (handler ships in K3)', () => {
    useStore.setState((state) => { state.importerMode = 'simple'; });
    render(<Importer />);
    const dz = screen.getByTestId('importer-dropzone');
    const file = fileFromText('thing.fasta', FASTA_TEXT);
    fireEvent.drop(dz, { dataTransfer: { files: [file], types: ['Files'] } });
    // Wait for parse to populate parsedItems (Next stays disabled until then).
    return waitFor(() => {
      expect(screen.getByTestId('importer-next').disabled).toBe(false);
    }).then(() => {
      fireEvent.click(screen.getByTestId('importer-next'));
      expect(useStore.getState().toasts.length).toBe(1);
    });
  });
});

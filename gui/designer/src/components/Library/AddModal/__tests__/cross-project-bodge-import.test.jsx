import 'fake-indexeddb/auto';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup, createEvent, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { useStore } from '../../../../store';
import { getLibraryEntry, resetDBForTests } from '../../../../db/dexie-schema';
import { openBodgeFilePicker } from '../../../../lib/file-system';
import { writeBodge, writeBodgeV2 } from '../../../../lib/bodge-zip';
import { computeResourceHash } from '../../lib/resource-hash';
import AddModal from '../AddModal';
import {
  extractPortableBodgeContainers,
  loadPortableBodgeContainers,
  materializeCrossProjectEntries,
} from '../cross-project-bodge-import';

vi.mock('../../../../lib/file-system', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, openBodgeFilePicker: vi.fn() };
});

const originalBulkAdd = useStore.getState().addLibraryEntriesBulk;

function donorContainers() {
  return [
    {
      id: 'donor-first',
      name: 'Donor first',
      sequence: 'AAAACCCCGGGG',
      topology: 'linear',
      annotations: [],
    },
    {
      id: 'donor-collision',
      name: 'Donor second',
      sequence: 'ACGTACGTACGT',
      topology: 'circular',
      annotations: [
        { id: 'ann-region', level: 'region', name: 'region', start: 0, end: 10, strand: 1 },
        {
          id: 'ann-detail', level: 'detail', name: 'detail', start: 2, end: 8,
          strand: 1, parentId: 'ann-region', regionId: 'ann-region',
        },
        {
          id: 'ann-point', level: 'point', name: 'point', start: 4, end: 5,
          strand: 1, parentId: 'ann-detail', regionId: 'ann-region',
        },
      ],
    },
  ];
}

async function realV2PickerResult() {
  const containers = donorContainers();
  const skeleton = {
    containers,
    zones: [{ id: 'donor-zone', name: 'must not import' }],
    pieces: [{ id: 'donor-piece', containerId: 'donor-first' }],
    operations: [{ id: 'donor-op', kind: 'pcr' }],
    junctions: [{ id: 'donor-junction' }],
    primers: [{ id: 'donor-primer', sequence: 'AAAA' }],
    positions: {},
  };
  const file = await writeBodgeV2({
    projectMeta: { id: 'donor-project', name: 'Donor project' },
    containers,
    zones: skeleton.zones,
    pieces: skeleton.pieces,
    operations: skeleton.operations,
    junctions: skeleton.junctions,
    primers: skeleton.primers,
    libraryEntries: [],
    extensions: {
      bodgegene: { 'skeleton.json': JSON.stringify(skeleton) },
    },
  });
  return {
    file,
    fileName: 'two-containers.bodge',
    lastModified: 1_777_777,
    donorSnapshot: skeleton,
  };
}

async function realV1PickerResult() {
  const file = await writeBodge(
    { id: 'legacy-project', name: 'Legacy donor' },
    {
      libraryEntries: [
        {
          id: 'legacy-container', kind: 'container', name: 'Legacy container',
          payload: { sequence: 'AAAACCCC', length: 8, topology: 'linear', annotations: [] },
        },
        {
          id: 'legacy-primer', kind: 'primer', name: 'Must stay out',
          payload: { sequence: 'AAAA', length: 4 },
        },
      ],
    },
  );
  return { file, fileName: 'legacy.bodge', lastModified: 42 };
}

async function openRealV2Preview(props = {}) {
  const pick = await realV2PickerResult();
  openBodgeFilePicker.mockResolvedValue(pick);
  render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} {...props} />);
  const opener = screen.getByTestId('add-modal-source-cross-project');
  opener.focus();
  fireEvent.click(opener);
  await screen.findByTestId('cross-project-entry-donor-first');
  return pick;
}

async function materializeAnnotations(annotations, topology = 'linear') {
  const model = extractPortableBodgeContainers({
    state: {
      projectMeta: { id: 'annotation-donor' },
      containers: [{
        id: 'annotation-container', name: 'Annotation container',
        sequence: 'ACGTACGTACGT', topology, annotations,
      }],
    },
  });
  return materializeCrossProjectEntries({
    ...model,
    selectedIds: new Set(['annotation-container']),
    target: 'loose',
    sourceFileName: 'annotations.bodge',
    now: () => '2026-08-22T00:00:00.000Z',
  });
}

async function freshDB() {
  const db = resetDBForTests(`bodgegene-cross-project-${Math.random().toString(36).slice(2)}`);
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await freshDB();
  vi.clearAllMocks();
  openBodgeFilePicker.mockReset();
  useStore.setState((state) => {
    state.libraryEntries = {
      'donor-collision': {
        id: 'donor-collision',
        kind: 'container',
        name: 'Existing local row',
        zone: 'loose',
        projectId: null,
        tags: [],
        payload: { sequence: 'TTTT', length: 4, topology: 'linear', annotations: [] },
      },
    };
    state.projects = {
      current: { id: 'current', name: 'Current', containerIds: [] },
      target: { id: 'target', name: 'Target', containerIds: [] },
    };
    state.currentProjectId = 'current';
    state.pinnedProjectIds = ['target'];
    state.toasts = [];
    state.addLibraryEntriesBulk = originalBulkAdd;
  });
});

afterEach(() => {
  cleanup();
  useStore.setState({ addLibraryEntriesBulk: originalBulkAdd });
});

describe('LIB-SRC-2 — cross-project .bodge import', () => {
  it('reads a real v2 Blob, clones only the selected second container, and commits it atomically to the chosen non-current target', async () => {
    const pick = await realV2PickerResult();
    const frozenDonor = structuredClone(pick.donorSnapshot);
    openBodgeFilePicker.mockResolvedValue(pick);

    const bulkSpy = vi.fn((entries) => originalBulkAdd(entries));
    useStore.setState({ addLibraryEntriesBulk: bulkSpy });

    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-target-project:target').querySelector('input'));
    fireEvent.click(screen.getByTestId('add-modal-source-cross-project'));

    expect(await screen.findByTestId('cross-project-entry-donor-first')).toBeTruthy();
    expect(screen.getByTestId('cross-project-entry-donor-collision')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cross-project-select-donor-collision'));
    fireEvent.click(screen.getByTestId('cross-project-import'));

    await waitFor(() => expect(bulkSpy).toHaveBeenCalledTimes(1));
    const [committed] = bulkSpy.mock.calls[0][0];
    expect(bulkSpy.mock.calls[0][0]).toHaveLength(1);
    expect(committed.id).not.toBe('donor-collision');
    expect(committed.name).toBe('Donor second');
    expect(committed.kind).toBe('container');
    expect(committed.zone).toBe('active_bodge');
    expect(committed.projectId).toBe('target');
    expect(committed.origin).toMatchObject({
      kind: 'cross_project_clone',
      donorContainerId: 'donor-collision',
      donorProjectId: 'donor-project',
      sourceFileName: 'two-containers.bodge',
    });
    expect(committed.payload.resourceHash).toBe(await computeResourceHash({
      sequence: 'ACGTACGTACGT', topology: 'circular', ends: undefined,
    }));

    const [region, detail, point] = committed.payload.annotations;
    expect([region.id, detail.id, point.id]).not.toEqual([
      'ann-region', 'ann-detail', 'ann-point',
    ]);
    expect(new Set([region.id, detail.id, point.id]).size).toBe(3);
    expect(detail.parentId).toBe(region.id);
    expect(detail.regionId).toBe(region.id);
    expect(point.parentId).toBe(detail.id);
    expect(point.regionId).toBe(region.id);

    expect(await getLibraryEntry(committed.id)).toMatchObject({
      id: committed.id, projectId: 'target', zone: 'active_bodge',
    });
    expect(Object.values(useStore.getState().libraryEntries).filter(
      (entry) => entry.origin?.kind === 'cross_project_clone',
    )).toHaveLength(1);
    expect(useStore.getState().libraryEntries['donor-collision'].name).toBe('Existing local row');
    expect(useStore.getState().currentProjectId).toBe('current');
    expect(useStore.getState().projects).toEqual({
      current: { id: 'current', name: 'Current', containerIds: [] },
      target: { id: 'target', name: 'Target', containerIds: [] },
    });
    expect(pick.donorSnapshot).toEqual(frozenDonor);
    expect(screen.queryByTestId('cross-project-dialog')).toBeNull();
  });

  it('picker cancel is a no-op and does not close the parent Add window', async () => {
    openBodgeFilePicker.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<AddModal open onClose={onClose} onLaunchPreImport={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-source-cross-project'));
    await waitFor(() => expect(openBodgeFilePicker).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-modal')).toBeTruthy();
    expect(useStore.getState().libraryEntries['donor-collision']).toBeTruthy();
  });

  it('uses v1 container-kind libraryEntries fallback and excludes donor primers', async () => {
    openBodgeFilePicker.mockResolvedValue(await realV1PickerResult());
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-source-cross-project'));
    expect(await screen.findByTestId('cross-project-entry-legacy-container')).toBeTruthy();
    expect(screen.queryByTestId('cross-project-entry-legacy-primer')).toBeNull();
    expect(screen.queryByText('Must stay out')).toBeNull();
  });

  it('fails closed for a real empty v2 file and never calls bulk add', async () => {
    const file = await writeBodgeV2({
      projectMeta: { id: 'empty-project', name: 'Empty donor' },
      containers: [],
      libraryEntries: [],
      extensions: {
        bodgegene: {
          'skeleton.json': JSON.stringify({
            containers: [], zones: [{ id: 'must-stay-out' }], pieces: [], operations: [],
            junctions: [], primers: [], positions: {},
          }),
        },
      },
    });
    const bulkSpy = vi.fn();
    useStore.setState({ addLibraryEntriesBulk: bulkSpy });
    openBodgeFilePicker.mockResolvedValue({ file, fileName: 'empty.bodge', lastModified: 9 });
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-source-cross-project'));
    expect(await screen.findByTestId('cross-project-empty')).toBeTruthy();
    expect(screen.getByTestId('cross-project-import').disabled).toBe(true);
    expect(bulkSpy).not.toHaveBeenCalled();
  });

  it('surfaces read errors without adding or closing the importer', async () => {
    const bulkSpy = vi.fn();
    useStore.setState({ addLibraryEntriesBulk: bulkSpy });
    openBodgeFilePicker.mockResolvedValue({
      file: new Blob(['not a zip']), fileName: 'broken.bodge', lastModified: 10,
    });
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-source-cross-project'));
    expect(await screen.findByTestId('cross-project-error')).toBeTruthy();
    expect(screen.getByTestId('cross-project-dialog')).toBeTruthy();
    expect(bulkSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['a rejected transaction', () => Promise.reject(new Error('disk full'))],
    ['an empty commit receipt', () => Promise.resolve([])],
  ])('keeps the importer open with no success after %s', async (_label, commit) => {
    const bulkSpy = vi.fn(commit);
    useStore.setState({ addLibraryEntriesBulk: bulkSpy });
    await openRealV2Preview();
    fireEvent.click(screen.getByTestId('cross-project-select-donor-first'));
    fireEvent.click(screen.getByTestId('cross-project-import'));
    expect(await screen.findByTestId('cross-project-error')).toBeTruthy();
    expect(screen.getByTestId('cross-project-dialog')).toBeTruthy();
    expect(bulkSpy).toHaveBeenCalledTimes(1);
    expect(useStore.getState().toasts.some(
      (toast) => /добав|import/i.test(String(toast?.message || toast?.text || toast)),
    )).toBe(false);
  });

  it('contains focus/hotkeys and blocks Escape/backdrop close while the one bulk commit is pending', async () => {
    let rejectCommit;
    const pending = new Promise((_resolve, reject) => { rejectCommit = reject; });
    const bulkSpy = vi.fn(() => pending);
    const onClose = vi.fn();
    useStore.setState({ addLibraryEntriesBulk: bulkSpy });
    await openRealV2Preview({ onClose });

    const dialog = screen.getByTestId('cross-project-dialog');
    expect(dialog.getAttribute('data-block-global-hotkeys')).toBe('true');
    expect(document.activeElement).toBe(screen.getByTestId('cross-project-select-donor-first'));
    fireEvent.click(screen.getByTestId('cross-project-select-donor-first'));
    const importButton = screen.getByTestId('cross-project-import');
    importButton.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('cross-project-close'));

    fireEvent.click(importButton);
    await waitFor(() => expect(bulkSpy).toHaveBeenCalledTimes(1));
    expect(importButton.disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('cross-project-backdrop'));
    expect(screen.getByTestId('cross-project-dialog')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(bulkSpy).toHaveBeenCalledTimes(1);

    rejectCommit(new Error('controlled stop'));
    expect(await screen.findByTestId('cross-project-error')).toBeTruthy();
  });

  it('imports a real write/read production snapshot whose topology is {circular:true}', async () => {
    const structured = [{
      id: 'production-circular', name: 'Production circular', sequence: 'ACGTACGT',
      topology: 'circular', annotations: [],
    }];
    const snapshot = {
      containers: [{ ...structured[0], topology: { circular: true } }],
      zones: [], pieces: [], operations: [], junctions: [], primers: [], positions: {},
    };
    const file = await writeBodgeV2({
      projectMeta: { id: 'production-project', name: 'Production donor' },
      containers: structured,
      libraryEntries: [],
      extensions: { bodgegene: { 'skeleton.json': JSON.stringify(snapshot) } },
    });
    const bulkSpy = vi.fn((entries) => originalBulkAdd(entries));
    useStore.setState({ addLibraryEntriesBulk: bulkSpy });
    openBodgeFilePicker.mockResolvedValue({
      file, fileName: 'production-topology.bodge', lastModified: 11,
    });
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-source-cross-project'));
    await screen.findByTestId('cross-project-entry-production-circular');
    fireEvent.click(screen.getByTestId('cross-project-select-production-circular'));
    fireEvent.click(screen.getByTestId('cross-project-import'));
    await waitFor(() => expect(bulkSpy).toHaveBeenCalledTimes(1));
    expect(bulkSpy.mock.calls[0][0][0].payload.topology).toBe('circular');
  });

  it('falls back from empty v2 skeleton/state containers to container-kind libraryEntries', async () => {
    const file = await writeBodgeV2({
      projectMeta: { id: 'fallback-project', name: 'Fallback donor' },
      containers: [],
      libraryEntries: [{
        id: 'fallback-container', kind: 'container', name: 'Fallback container',
        payload: { sequence: 'AAAACCCC', length: 8, topology: 'linear', annotations: [] },
      }],
      extensions: {
        bodgegene: { 'skeleton.json': JSON.stringify({ containers: [], positions: {} }) },
      },
    });
    openBodgeFilePicker.mockResolvedValue({ file, fileName: 'fallback.bodge', lastModified: 12 });
    render(<AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />);
    fireEvent.click(screen.getByTestId('add-modal-source-cross-project'));
    expect(await screen.findByTestId('cross-project-entry-fallback-container')).toBeTruthy();
  });

  it('defaults an external-v2 annotation without serialized level to region', async () => {
    const file = await writeBodgeV2({
      projectMeta: { id: 'external-project', name: 'External donor' },
      containers: [{
        id: 'external-container', name: 'External container', sequence: 'ACGTACGT',
        topology: 'linear',
        annotations: [{ id: 'external-region', name: 'promoter', type: 'promoter', start: 0, end: 4 }],
      }],
      libraryEntries: [],
      extensions: {},
    });
    const model = await loadPortableBodgeContainers({
      file, fileName: 'external-v2.bodge', lastModified: 13,
    });
    const [entry] = await materializeCrossProjectEntries({
      ...model, selectedIds: new Set([model.containers[0].donorId]), target: 'loose',
      now: () => '2026-08-22T00:00:00.000Z',
    });
    expect(entry.payload.annotations).toHaveLength(1);
    expect(entry.payload.annotations[0].level).toBe('region');
  });

  it('derives complete region ancestry before remapping fresh annotation IDs', async () => {
    const [entry] = await materializeAnnotations([
      { id: 'region-a', level: 'region', start: 0, end: 12 },
      { id: 'detail-a', level: 'detail', start: 2, end: 8, parentId: 'region-a' },
      { id: 'point-a', level: 'point', start: 4, end: 5, parentId: 'detail-a' },
    ]);
    const [region, detail, point] = entry.payload.annotations;
    expect(detail.regionId).toBe(region.id);
    expect(point.regionId).toBe(region.id);
  });

  it.each([
    ['empty scalar', [{ id: 'a', level: 'region', start: 2, end: 2 }]],
    ['reversed scalar', [{ id: 'a', level: 'region', start: 8, end: 2 }]],
    ['incoherent dual location', [{
      id: 'a', level: 'region', start: 0, end: 4,
      location: { kind: 'single', segments: [{ start: 1, end: 4 }] },
    }]],
    ['incoherent bare segments', [{
      id: 'a', level: 'region', start: 0, end: 4,
      segments: [{ start: 1, end: 4 }],
    }]],
    ['noncircular origin wrap', [{
      id: 'a', level: 'region', start: 8, end: 10,
      location: { kind: 'join', segments: [{ start: 8, end: 12 }, { start: 0, end: 2 }] },
    }]],
    ['point through detail to wrong region', [
      { id: 'region-a', level: 'region', start: 0, end: 12 },
      { id: 'region-b', level: 'region', start: 0, end: 12 },
      { id: 'detail-a', level: 'detail', start: 2, end: 8, parentId: 'region-a' },
      {
        id: 'point-a', level: 'point', start: 4, end: 5,
        parentId: 'detail-a', regionId: 'region-b',
      },
    ]],
  ])('fails closed for %s', async (_label, annotations) => {
    await expect(materializeAnnotations(annotations)).rejects.toThrow();
  });

  it.each([
    ['wrong IDs', (entries) => entries.map((entry, index) => ({ ...entry, id: `wrong-${index}` }))],
    ['duplicate IDs', (entries) => entries.map(() => entries[0])],
    ['null IDs', (entries) => entries.map((entry) => ({ ...entry, id: null }))],
  ])('keeps the importer open for a same-length receipt with %s', async (_label, receipt) => {
    const bulkSpy = vi.fn(async (entries) => receipt(entries));
    useStore.setState({ addLibraryEntriesBulk: bulkSpy });
    await openRealV2Preview();
    fireEvent.click(screen.getByTestId('cross-project-select-donor-first'));
    fireEvent.click(screen.getByTestId('cross-project-select-donor-collision'));
    fireEvent.click(screen.getByTestId('cross-project-import'));
    expect(await screen.findByTestId('cross-project-error')).toBeTruthy();
    expect(screen.getByTestId('cross-project-dialog')).toBeTruthy();
    expect(bulkSpy).toHaveBeenCalledTimes(1);
  });

  it('in React.StrictMode opens the native picker once and accepts that in-flight result', async () => {
    let resolvePick;
    const pendingPick = new Promise((resolve) => { resolvePick = resolve; });
    openBodgeFilePicker
      .mockImplementationOnce(() => pendingPick)
      .mockImplementationOnce(() => new Promise(() => {}));
    const pick = await realV2PickerResult();
    render(
      <React.StrictMode>
        <AddModal open onClose={() => {}} onLaunchPreImport={() => {}} />
      </React.StrictMode>,
    );
    fireEvent.click(screen.getByTestId('add-modal-source-cross-project'));
    await waitFor(() => expect(openBodgeFilePicker).toHaveBeenCalledTimes(1));
    resolvePick(pick);
    expect(await screen.findByTestId('cross-project-entry-donor-first')).toBeTruthy();
    expect(openBodgeFilePicker).toHaveBeenCalledTimes(1);
  });

  it('traps real keydowns from active inside/outside controls and zero-control commit on the dialog', async () => {
    let rejectCommit;
    const pendingCommit = new Promise((_resolve, reject) => { rejectCommit = reject; });
    useStore.setState({ addLibraryEntriesBulk: vi.fn(() => pendingCommit) });
    await openRealV2Preview();
    const dialog = screen.getByTestId('cross-project-dialog');
    fireEvent.click(screen.getByTestId('cross-project-select-donor-first'));
    const importButton = screen.getByTestId('cross-project-import');
    importButton.focus();
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('cross-project-close'));

    const outside = screen.getByTestId('add-modal-source-file');
    expect(outside.disabled).toBe(false);
    outside.focus();
    expect(document.activeElement).toBe(outside);
    const outsideTab = createEvent.keyDown(outside, { key: 'Tab' });
    fireEvent(outside, outsideTab);
    expect(outsideTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(screen.getByTestId('cross-project-close'));

    outside.focus();
    expect(document.activeElement).toBe(outside);
    const outsideShiftTab = createEvent.keyDown(outside, { key: 'Tab', shiftKey: true });
    fireEvent(outside, outsideShiftTab);
    expect(outsideShiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(importButton);

    fireEvent.click(importButton);
    await waitFor(() => expect(importButton.disabled).toBe(true));
    expect(dialog.querySelectorAll([
      'button:not([disabled])', 'input:not([disabled])', '[tabindex]:not([tabindex="-1"])',
    ].join(',')).length).toBe(0);
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.getByTestId('cross-project-dialog')).toBeTruthy();
    rejectCommit(new Error('controlled stop'));
    expect(await screen.findByTestId('cross-project-error')).toBeTruthy();
  });

  it.each(['close', 'Escape'])('%s restores focus to the cross-project opener', async (action) => {
    await openRealV2Preview();
    if (action === 'close') fireEvent.click(screen.getByTestId('cross-project-close'));
    else fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('cross-project-dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByTestId('add-modal-source-cross-project'));
  });
});

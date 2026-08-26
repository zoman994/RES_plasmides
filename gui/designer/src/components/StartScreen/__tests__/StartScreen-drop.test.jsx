/**
 * MS-K4 — StartScreen drop-file handler.
 *
 * ANN-0I rewrote the import half of this contract. The OLD assumption, encoded
 * in the previous version of this file, was that a drop hands
 * `addLibraryEntriesBulk` an OBJECT (`{ projectId, entries }`) built from the
 * raw file text. That was the defect, not the specification:
 *
 *   * the slice takes an ARRAY and drops any row without an `id`, so nothing
 *     was ever written;
 *   * nothing was awaited and a success toast fired regardless;
 *   * `.dna` was read with `file.text()`, so a binary plasmid became a library
 *     row whose "sequence" was mojibake;
 *   * topology was hardcoded `linear` and annotations were always `[]`.
 *
 * The NEW contract: StartScreen delegates to the canonical ingress, which
 * parses, shapes, awaits a durable commit, and only then reports success.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
vi.mock('../lib/open-bodge', () => ({ openBodgeIntoLibrary: vi.fn(async () => {}) }));
import StartScreen from '../StartScreen';
import { openBodgeIntoLibrary } from '../lib/open-bodge';
import { useStore, bootstrapStore } from '../../../store';

beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  try { useStore.setState({ toasts: [], libraryEntries: {} }); } catch { /* */ }
});

function makeFile(name, content = 'ATGC', type = 'text/plain') {
  return new File([content], name, { type });
}

function originLines(bp) {
  return Array.from({ length: Math.ceil(bp / 60) }, (_, i) =>
    `${String(i * 60 + 1).padStart(9)} ${'acgtacgtac'.repeat(6).match(/.{1,10}/g).join(' ')}`)
    .join('\n');
}

const GB_CIRCULAR = `LOCUS       DROPPED                  600 bp    DNA     circular SYN 02-AUG-2026
DEFINITION  drop fixture
FEATURES             Location/Qualifiers
     CDS             101..400
                     /label="droppedGene"
ORIGIN
${originLines(600)}
//
`;

/** Valid molecule whose second feature points outside the sequence. */
const GB_PARTIAL = `LOCUS       PARTIAL                  600 bp    DNA     linear   SYN 02-AUG-2026
DEFINITION  partial fixture
FEATURES             Location/Qualifiers
     CDS             101..400
                     /label="goodGene"
     CDS             5001..5400
                     /label="badGene"
ORIGIN
${originLines(600)}
//
`;

async function drop(root, files) {
  await act(async () => {
    fireEvent.drop(root, { dataTransfer: { files, types: ['Files'] } });
  });
}

/** The drop handler parses and (by default) auto-annotates, so settle on an
 *  observable outcome rather than a fixed sleep. */
async function settled(check) {
  await waitFor(check, { timeout: 4000 });
}

describe('MS-K4 — StartScreen drag affordance', () => {
  it('drag-over with Files sets data-drag-active=true', () => {
    render(<StartScreen />);
    const root = screen.getByTestId('start-screen-root');
    fireEvent.dragOver(root, { dataTransfer: { types: ['Files'], files: [], dropEffect: '' } });
    expect(root.getAttribute('data-drag-active')).toBe('true');
    expect(screen.getByTestId('ss-drag-overlay')).toBeTruthy();
  });

  it('drag-over without Files is a no-op', () => {
    render(<StartScreen />);
    const root = screen.getByTestId('start-screen-root');
    fireEvent.dragOver(root, { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(root.getAttribute('data-drag-active')).toBe('false');
  });
});

describe('ANN-0I — StartScreen drop uses the canonical ingress', () => {
  it('hands the store an ARRAY of shaped entries, not an object', async () => {
    const addBulk = vi.fn(async (entries) =>
      (Array.isArray(entries) ? entries : []).filter((e) => e && e.id));
    useStore.setState((s) => { s.addLibraryEntriesBulk = addBulk; });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'),
      [makeFile('dropped.gb', GB_CIRCULAR)]);

    await settled(() => expect(addBulk).toHaveBeenCalledTimes(1));
    const arg = addBulk.mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toHaveLength(1);
    expect(typeof arg[0].id).toBe('string');
    expect(arg[0].id.length).toBeGreaterThan(0);
  });

  it('stores the PARSED sequence, not the raw file text', async () => {
    const addBulk = vi.fn(async (e) => e);
    useStore.setState((s) => { s.addLibraryEntriesBulk = addBulk; });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'),
      [makeFile('dropped.gb', GB_CIRCULAR)]);

    await settled(() => expect(addBulk).toHaveBeenCalled());
    const entry = addBulk.mock.calls[0][0][0];
    expect(entry.payload.sequence).toMatch(/^[ACGTN]+$/);
    expect(entry.payload.sequence).not.toMatch(/LOCUS/);
    expect(entry.payload.length).toBe(600);
  });

  it('keeps the topology declared by the file instead of hardcoding linear', async () => {
    const addBulk = vi.fn(async (e) => e);
    useStore.setState((s) => { s.addLibraryEntriesBulk = addBulk; });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'),
      [makeFile('dropped.gb', GB_CIRCULAR)]);

    await settled(() => expect(addBulk).toHaveBeenCalled());
    expect(addBulk.mock.calls[0][0][0].payload.topology).toBe('circular');
  });

  it('carries the parsed annotation with canonical coordinates and an id', async () => {
    const addBulk = vi.fn(async (e) => e);
    useStore.setState((s) => { s.addLibraryEntriesBulk = addBulk; });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'),
      [makeFile('dropped.gb', GB_CIRCULAR)]);

    await settled(() => expect(addBulk).toHaveBeenCalled());
    const anns = addBulk.mock.calls[0][0][0].payload.annotations;
    const gene = anns.find((a) => a.name === 'droppedGene');
    expect(gene).toBeTruthy();
    expect(gene.start).toBe(100);
    expect(gene.end).toBe(400);
    expect(typeof gene.id).toBe('string');
  });

  it('reports success only after a durable commit', async () => {
    useStore.setState((s) => { s.addLibraryEntriesBulk = async () => []; s.toasts = []; });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'),
      [makeFile('dropped.gb', GB_CIRCULAR)]);

    await settled(() => expect((useStore.getState().toasts || []).length).toBeGreaterThan(0));
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => t.kind === 'success' || t.type === 'success')).toBe(false);
  });

  it('surfaces a rejected feature as a visible partial-import warning', async () => {
    useStore.setState((s) => {
      s.addLibraryEntriesBulk = async (e) => e;
      s.toasts = [];
    });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'),
      [makeFile('partial.gb', GB_PARTIAL)]);

    await settled(() => expect((useStore.getState().toasts || []).length).toBeGreaterThan(0));
    const msgs = (useStore.getState().toasts || []).map((t) => t.msg || '').join(' | ');
    expect(msgs).toMatch(/partial\.gb/);
    expect(msgs).toMatch(/badGene/);
  });

  it('never reads a binary .dna as text', async () => {
    const dna = new File([new Uint8Array([0x09, 0, 0, 0, 4, 1, 2, 3, 4])], 'binary.dna');
    const textSpy = vi.spyOn(dna, 'text');
    useStore.setState((s) => { s.addLibraryEntriesBulk = async (e) => e; s.toasts = []; });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'), [dna]);
    await settled(() => expect((useStore.getState().toasts || []).length).toBeGreaterThan(0));
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('a file the parser refuses produces an error, never a silent success', async () => {
    useStore.setState((s) => { s.addLibraryEntriesBulk = async (e) => e; s.toasts = []; });
    render(<StartScreen />);
    // .dna with no backend running → import must fail loudly
    await drop(screen.getByTestId('start-screen-root'),
      [new File([new Uint8Array([0x09, 0, 0, 0, 1, 0])], 'nobackend.dna')]);

    await settled(() => expect((useStore.getState().toasts || []).length).toBeGreaterThan(0));
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => t.kind === 'success' || t.type === 'success')).toBe(false);
    expect(toasts.length).toBeGreaterThan(0);
  });
});

describe('BG-003 — a dropped .bodge delegates to the one Open controller', () => {
  beforeEach(() => { openBodgeIntoLibrary.mockClear(); });

  it('passes the original File as `pick` and never opens a second picker', async () => {
    render(<StartScreen />);
    const file = makeFile('project.bodge', 'PK-zip-bytes');
    await drop(screen.getByTestId('start-screen-root'), [file]);

    await settled(() => expect(openBodgeIntoLibrary).toHaveBeenCalledTimes(1));
    const opts = openBodgeIntoLibrary.mock.calls[0][0];
    // A `pick` is what tells the controller not to open the OS picker: the user
    // already chose this file by dropping it.
    expect(opts.pick.file).toBe(file);
    expect(opts.pick.fileName).toBe('project.bodge');
    expect(opts.pick.lastModified).toBe(file.lastModified);
    // The drop keeps the opened project's own view and stays silent on success.
    expect(opts.navigateToLibrary).toBe(false);
    expect(opts.successToast).toBe(false);
  });

  it('consumes the drop so App\'s window handler cannot add a "coming soon" toast', async () => {
    // App's window listener is explicit: inner targets stop propagation, and
    // it only fires for an UNCAUGHT drop. Without that, a .bodge that opened
    // successfully also told the user the feature was not ready yet.
    const windowDrop = vi.fn();
    window.addEventListener('drop', windowDrop);
    try {
      render(<StartScreen />);
      await drop(screen.getByTestId('start-screen-root'),
        [makeFile('project.bodge', 'PK-zip-bytes')]);

      await settled(() => expect(openBodgeIntoLibrary).toHaveBeenCalledTimes(1));
      expect(windowDrop).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('drop', windowDrop);
    }
  });

  it('does NOT route .bodgeassembly through the full-project controller', async () => {
    // A portable assembly is a different contract (merge into the CURRENT
    // project), not «open this file as the project». BG-003 does not own it.
    useStore.setState((s) => { s.toasts = []; });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'),
      [makeFile('portable.bodgeassembly', 'PK-zip-bytes')]);

    await settled(() => expect((useStore.getState().toasts || []).length).toBeGreaterThan(0));
    expect(openBodgeIntoLibrary).not.toHaveBeenCalled();
    // …and it is still a recognised format, not an "unsupported file" warning.
    const msgs = (useStore.getState().toasts || []).map((t) => t.msg || '').join(' | ');
    expect(msgs).not.toMatch(/Поддерживаются/);
  });

  it('leaves sequence-file drops alone', async () => {
    useStore.setState((s) => { s.addLibraryEntriesBulk = async (e) => e; s.toasts = []; });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'), [makeFile('plain.gb', GB_CIRCULAR)]);

    await settled(() => expect((useStore.getState().toasts || []).length).toBeGreaterThan(0));
    expect(openBodgeIntoLibrary).not.toHaveBeenCalled();
  });
});

describe('MS-K4 — non-sequence drops', () => {
  it('drop unknown extension → warning toast, no import', async () => {
    const addBulk = vi.fn();
    useStore.setState((s) => { s.addLibraryEntriesBulk = addBulk; s.toasts = []; });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'), [makeFile('photo.png')]);

    await settled(() => expect((useStore.getState().toasts || []).length).toBeGreaterThan(0));
    expect(addBulk).not.toHaveBeenCalled();
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => /Поддерживаются/.test(t.msg || ''))).toBe(true);
  });

  it('drop mixed sequence + unknown → imports the sequence, no format warning', async () => {
    useStore.setState((s) => { s.addLibraryEntriesBulk = async (e) => e; s.toasts = []; });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'),
      [makeFile('a.gb', GB_CIRCULAR), makeFile('garbage.exe')]);

    await settled(() => expect((useStore.getState().toasts || []).length).toBeGreaterThan(0));
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => /Поддерживаются/.test(t.msg || ''))).toBe(false);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// ANN-0K Block 4 (surface half) — the drop really calls the backend.
// ═══════════════════════════════════════════════════════════════════════════

describe('ANN-0K — .dna drop uses /api/import, .genbank is accepted', () => {
  afterEach(() => { delete globalThis.fetch; });

  it('POSTs the binary to /api/import and never calls File.text()', async () => {
    const payload = {
      name: 'k', sequence: 'ACGT'.repeat(150), length: 600, topology: 'linear',
      organism: '', description: '', features: [], primers: [], rejected: [],
    };
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));

    const dna = new File([new Uint8Array([0x09, 0, 0, 0, 4, 1, 2, 3, 4])], 'probe.dna');
    const textSpy = vi.spyOn(dna, 'text');
    useStore.setState((s) => { s.addLibraryEntriesBulk = async (e) => e; s.toasts = []; });

    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'), [dna]);
    await settled(() => expect(globalThis.fetch).toHaveBeenCalled());

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(String(url)).toContain('/api/import');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('file')).toBeTruthy();
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('a dropped .genbank is still accepted as a sequence file', async () => {
    const addBulk = vi.fn(async (e) => e);
    useStore.setState((s) => { s.addLibraryEntriesBulk = addBulk; s.toasts = []; });
    render(<StartScreen />);
    await drop(screen.getByTestId('start-screen-root'),
      [makeFile('vector.genbank', GB_CIRCULAR)]);

    await settled(() => expect(addBulk).toHaveBeenCalled());
    const msgs = (useStore.getState().toasts || []).map((t) => t.msg || '').join(' | ');
    expect(msgs).not.toMatch(/Поддерживаются/);
  });
});

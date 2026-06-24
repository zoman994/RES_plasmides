import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '../index';
import { MAX_ALIGN_INPUTS } from '../alignmentSlice';

function reset() {
  useStore.getState().clearAlignment();
}

describe('alignmentSlice', () => {
  beforeEach(reset);
  afterEach(() => { vi.useRealTimers(); });

  it('setAlignInputs auto-selects the first input as reference + seeds ONE read', () => {
    useStore.getState().setAlignInputs([
      { name: 'A', sequence: 'ACGTACGT' },
      { name: 'B', sequence: 'ACGTTCGT' },
      { name: 'C', sequence: 'TTTT' },
    ]);
    const a = useStore.getState().align;
    expect(a.inputs).toHaveLength(3);
    expect(a.refId).toBe(a.inputs[0].id);
    // only ONE read seeded — the 3rd is NOT auto-added (no «странное подсасывание»)
    expect(a.readIds).toEqual([a.inputs[1].id]);
  });

  it('setReference / toggleRead drive an explicit reference + reads selection', () => {
    useStore.getState().setAlignInputs([
      { name: 'A', sequence: 'ACGTACGT' },
      { name: 'B', sequence: 'ACGTTCGT' },
      { name: 'C', sequence: 'TTTTACGT' },
    ]);
    const ids = useStore.getState().align.inputs.map((x) => x.id);
    useStore.getState().setReference(ids[1]); // make B the reference
    expect(useStore.getState().align.refId).toBe(ids[1]);
    expect(useStore.getState().align.readIds).not.toContain(ids[1]);
    useStore.getState().toggleRead(ids[2]); // include C as a read
    expect(useStore.getState().align.readIds).toContain(ids[2]);
    useStore.getState().toggleRead(ids[2]); // remove it again
    expect(useStore.getState().align.readIds).not.toContain(ids[2]);
  });

  it('addTraceInput stores a trace-kind input carrying the chromatogram', () => {
    const chromo = { bases: 'ACGT', qualities: [40], peakLocations: [10], traces: { A: [1], C: [], G: [], T: [] }, sampleCount: 1 };
    useStore.getState().addTraceInput(chromo, { name: 'read.ab1' });
    const inp = useStore.getState().align.inputs[0];
    expect(inp.kind).toBe('trace');
    expect(inp.sequence).toBe('ACGT');
    expect(inp.chromatogram).toBe(chromo);
  });

  it('runAlignment aligns the pair and marks done', () => {
    useStore.getState().setAlignInputs([
      { name: 'A', sequence: 'ACGTACGT' },
      { name: 'B', sequence: 'ACGTACGT' },
    ]);
    useStore.getState().runAlignment();
    const a = useStore.getState().align;
    expect(a.status).toBe('done');
    expect(a.result.identity).toBe(100);
  });

  it('runAlignment uses semiglobal mode when a trace input is in the pair', () => {
    const chromo = { bases: 'ACGTACGT', qualities: [], peakLocations: [], traces: { A: [], C: [], G: [], T: [] }, sampleCount: 0 };
    useStore.getState().setAlignInputs([{ name: 'ref', sequence: 'TTTTACGTACGTTTTT' }]);
    useStore.getState().addTraceInput(chromo, { name: 'read.ab1' });
    useStore.getState().runAlignment();
    const a = useStore.getState().align;
    expect(a.status).toBe('done');
    expect(a.result.mode).toBe('semiglobal');
  });

  it('runAlignment builds a multi-read consensus when ≥2 reads are selected', () => {
    const S = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: S },
      { name: 'r1', sequence: S },
      { name: 'r2', sequence: S },
    ]);
    const ids = useStore.getState().align.inputs.map((x) => x.id);
    useStore.getState().toggleRead(ids[2]); // explicitly add the 2nd read → multi
    useStore.getState().runAlignment();
    const a = useStore.getState().align;
    expect(a.status).toBe('done');
    expect(a.multi).toBeTruthy();
    expect(a.multi.stats.reads).toBe(2);
    expect(a.result).toBeNull(); // multi supersedes the pairwise result
  });

  it('runAlignment errors when fewer than two inputs are selectable', () => {
    useStore.getState().setAlignInputs([{ name: 'only', sequence: 'ACGT' }]);
    useStore.getState().runAlignment();
    expect(useStore.getState().align.status).toBe('error');
  });

  it('clearAlignment resets inputs and result', () => {
    useStore.getState().setAlignInputs([{ name: 'A', sequence: 'ACGT' }, { name: 'B', sequence: 'ACGT' }]);
    useStore.getState().runAlignment();
    useStore.getState().clearAlignment();
    const a = useStore.getState().align;
    expect(a.inputs).toHaveLength(0);
    expect(a.result).toBeNull();
    expect(a.status).toBe('idle');
  });

  it('does not add the same library entry twice (dedup by libraryEntryId)', () => {
    const entry = { name: 'pUC19', sequence: 'ACGTACGTACGT', source: 'library', libraryEntryId: 'lib-1' };
    useStore.getState().addAlignInput(entry);
    useStore.getState().addAlignInput(entry);
    useStore.getState().addAlignInput(entry);
    expect(useStore.getState().align.inputs).toHaveLength(1);
  });

  it('dedups pasted inputs with the same name+sequence', () => {
    useStore.getState().addAlignInput({ name: 'x', sequence: 'ACGTACGT', source: 'paste' });
    useStore.getState().addAlignInput({ name: 'x', sequence: 'ACGTACGT', source: 'paste' });
    expect(useStore.getState().align.inputs).toHaveLength(1);
  });

  it('caps the number of inputs at MAX_ALIGN_INPUTS', () => {
    for (let i = 0; i < 30; i++) {
      useStore.getState().addAlignInput({ name: `s${i}`, sequence: `ACGTACGT${i}` });
    }
    expect(useStore.getState().align.inputs.length).toBe(MAX_ALIGN_INPUTS);
  });

  it('view defaults to plain (black) read bases and toggles via setAlignView', () => {
    expect(useStore.getState().align.view.colorNucleotides).toBe(false);
    useStore.getState().setAlignView({ colorNucleotides: true });
    expect(useStore.getState().align.view.colorNucleotides).toBe(true);
  });

  it('clearAlignment resets the view toggle back to plain', () => {
    useStore.getState().setAlignView({ colorNucleotides: true });
    useStore.getState().clearAlignment();
    expect(useStore.getState().align.view.colorNucleotides).toBe(false);
  });

  it('acceptReadBaseAt edits a TRANSIENT working copy, leaving the source input untouched', () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-9' },
      { name: 'read', sequence: 'ACGAACGT' },
    ]);
    useStore.getState().acceptReadBaseAt(3, 'A'); // ref pos3 'T' → read 'A'
    const wr = useStore.getState().align.workingReference;
    expect(wr).toBeTruthy();
    expect(wr.sequence[3]).toBe('A');
    expect(wr.corrections).toEqual([{ pos: 3, from: 'T', to: 'A' }]);
    // source input is NOT modified
    expect(useStore.getState().align.inputs.find((x) => x.name === 'ref').sequence).toBe('ACGTACGT');
  });

  it('revertWorkingReference discards the working copy', () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-9' },
      { name: 'read', sequence: 'ACGAACGT' },
    ]);
    useStore.getState().acceptReadBaseAt(3, 'A');
    useStore.getState().revertWorkingReference();
    expect(useStore.getState().align.workingReference).toBeNull();
  });

  it('saveCorrectedReference branches a NEW manual-edit entry with provenance; source untouched', async () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        'lib-9': { id: 'lib-9', name: 'pRef', kind: 'container', _pendingDelete: false, addedAt: '2026', payload: { sequence: 'ACGTACGT', topology: 'circular', annotations: [] } },
      };
    });
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-9' },
      { name: 'read', sequence: 'ACGAACGT' },
    ]);
    useStore.getState().acceptReadBaseAt(3, 'A');
    const res = await useStore.getState().saveCorrectedReference('фикс по Сэнгеру');
    expect(res.ok).toBe(true);
    const branch = Object.values(useStore.getState().libraryEntries).find((e) => e.origin?.kind === 'manual_edit');
    expect(branch).toBeTruthy();
    expect(branch.parentEntryId).toBe('lib-9');
    expect(branch.origin.reason).toBe('фикс по Сэнгеру');
    // Provenance shows «было → стало» (Игорь: «замена чего на что?»).
    expect(branch.origin.changes).toContain('поз 4');
    expect(branch.origin.changes).toContain('T → A');
    expect(branch.payload.sequence).toBe('ACGAACGT');
    // SOURCE entry is untouched
    expect(useStore.getState().libraryEntries['lib-9'].payload.sequence).toBe('ACGTACGT');
    // working copy cleared after a successful save
    expect(useStore.getState().align.workingReference).toBeNull();
  });

  it('saveCorrectedReference honours a biolog-chosen version name', async () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        'lib-7': { id: 'lib-7', name: 'pRef', kind: 'container', _pendingDelete: false, addedAt: '2026', payload: { sequence: 'ACGTACGT', topology: 'circular', annotations: [] } },
      };
    });
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-7' },
      { name: 'read', sequence: 'ACGAACGT' },
    ]);
    useStore.getState().acceptReadBaseAt(3, 'A');
    const res = await useStore.getState().saveCorrectedReference('фикс', 'pRef · испр. 1');
    expect(res.ok).toBe(true);
    const branch = Object.values(useStore.getState().libraryEntries).find((e) => e.origin?.kind === 'manual_edit' && e.parentEntryId === 'lib-7');
    expect(branch.name).toBe('pRef · испр. 1');
  });

  it('commitWorkingEdit stores a full in-place edit + logs the op; source untouched', () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-1' },
      { name: 'read', sequence: 'ACGTACGT' },
    ]);
    useStore.getState().commitWorkingEdit('ACGTTTTT', [], { kind: 'replace', start: 4, end: 8, replacement: 'TTTT' });
    const wr = useStore.getState().align.workingReference;
    expect(wr.sequence).toBe('ACGTTTTT');
    expect(wr.corrections[0].kind).toBe('replace');
    expect(useStore.getState().align.inputs.find((x) => x.name === 'ref').sequence).toBe('ACGTACGT');
  });

  it('coalesces a contiguous typing run into ONE correction', () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-1' },
      { name: 'read', sequence: 'ACGTACGT' },
    ]);
    // type «AA» at pos 4, 5 (each keystroke is a separate op)
    useStore.getState().commitWorkingEdit('ACGTAACGT', [], { kind: 'insert', pos: 4, char: 'A' });
    useStore.getState().commitWorkingEdit('ACGTAAACGT', [], { kind: 'insert', pos: 5, char: 'A' });
    const wr = useStore.getState().align.workingReference;
    expect(wr.corrections).toHaveLength(1);
    expect(wr.corrections[0]).toMatchObject({ kind: 'insert', pos: 4, text: 'AA' });
  });

  it('undoAlignEdit steps back one edit; redoAlignEdit re-applies; fresh edit clears redo', () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-u' },
      { name: 'read', sequence: 'ACGTACGT' },
    ]);
    // two distinct (non-coalescing) replace edits
    useStore.getState().commitWorkingEdit('ACGTACGA', [], { kind: 'replace', start: 7, end: 8, from: 'T', replacement: 'A' });
    useStore.getState().commitWorkingEdit('ACGAACGA', [], { kind: 'replace', start: 3, end: 4, from: 'T', replacement: 'A' });
    expect(useStore.getState().align.workingReference.sequence).toBe('ACGAACGA');
    expect(useStore.getState().align.workingReference.corrections).toHaveLength(2);

    useStore.getState().undoAlignEdit();
    expect(useStore.getState().align.workingReference.sequence).toBe('ACGTACGA');
    expect(useStore.getState().align.workingReference.corrections).toHaveLength(1);

    useStore.getState().undoAlignEdit();
    expect(useStore.getState().align.workingReference).toBeNull(); // back to pristine

    useStore.getState().redoAlignEdit();
    expect(useStore.getState().align.workingReference.sequence).toBe('ACGTACGA');
    useStore.getState().redoAlignEdit();
    expect(useStore.getState().align.workingReference.sequence).toBe('ACGAACGA');

    // a fresh edit after undo abandons the redo branch
    useStore.getState().undoAlignEdit(); // → ACGTACGA
    useStore.getState().commitWorkingEdit('ACGTACGG', [], { kind: 'replace', start: 7, end: 8, from: 'A', replacement: 'G' });
    useStore.getState().redoAlignEdit(); // nothing to redo
    expect(useStore.getState().align.workingReference.sequence).toBe('ACGTACGG');
  });

  it('undo also covers accept-base substitutions', () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-u2' },
      { name: 'read', sequence: 'ACGAACGT' },
    ]);
    useStore.getState().acceptReadBaseAt(3, 'A'); // T→A
    expect(useStore.getState().align.workingReference.sequence).toBe('ACGAACGT');
    useStore.getState().undoAlignEdit();
    expect(useStore.getState().align.workingReference).toBeNull();
  });

  it('«Сбросить» clears the undo history', () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-u3' },
      { name: 'read', sequence: 'ACGTACGT' },
    ]);
    useStore.getState().commitWorkingEdit('ACGTACGA', [], { kind: 'replace', start: 7, end: 8, from: 'T', replacement: 'A' });
    useStore.getState().revertWorkingReference();
    expect(useStore.getState().align.workingReference).toBeNull();
    useStore.getState().undoAlignEdit(); // no-op after reset
    expect(useStore.getState().align.workingReference).toBeNull();
  });

  it('saveCorrectedReference summarises op-based edits in the provenance', async () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        'lib-2': { id: 'lib-2', name: 'pRef', kind: 'container', _pendingDelete: false, addedAt: '2026', payload: { sequence: 'ACGTACGT', topology: 'circular', annotations: [] } },
      };
    });
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT', libraryEntryId: 'lib-2' },
      { name: 'read', sequence: 'ACGTACGT' },
    ]);
    useStore.getState().commitWorkingEdit('ACGTTTTT', [], { kind: 'replace', start: 4, end: 8, replacement: 'TTTT' });
    const res = await useStore.getState().saveCorrectedReference('правка по чтению');
    expect(res.ok).toBe(true);
    const branch = Object.values(useStore.getState().libraryEntries).find((e) => e.origin?.kind === 'manual_edit' && e.parentEntryId === 'lib-2');
    expect(branch.origin.changes).toContain('5–8');
    expect(branch.origin.changes).toContain('TTTT');
    expect(branch.payload.sequence).toBe('ACGTTTTT');
  });

  it('saveCorrectedReference refuses a non-library reference', async () => {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: 'ACGTACGT' }, // pasted, no libraryEntryId
      { name: 'read', sequence: 'ACGAACGT' },
    ]);
    useStore.getState().acceptReadBaseAt(3, 'A');
    const res = await useStore.getState().saveCorrectedReference('x');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('no-library-entry');
  });

  // ── PERF: skip re-alignment when the sequence is unchanged ─────────────
  // The alignment depends ONLY on sequence; annotation-only edits (marking an
  // intron) must NOT trigger a full O(n·m) re-align. Observable signal: the
  // result/multi object keeps its reference identity when nothing re-ran (a
  // fresh runAlignment always produces a NEW result object).
  function seedPair(refSeq, readSeq) {
    useStore.getState().setAlignInputs([
      { name: 'ref', sequence: refSeq, libraryEntryId: 'lib-perf' },
      { name: 'read', sequence: readSeq },
    ]);
    useStore.getState().runAlignment();
  }

  it('commitWorkingEdit does NOT re-align on an annotation-only edit (sequence unchanged)', () => {
    const SEQ = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';
    seedPair(SEQ, SEQ);
    const before = useStore.getState().align.result;
    expect(before).toBeTruthy();
    const ann = [{ id: 'i1', level: 'detail', type: 'intron', start: 5, end: 12 }];
    // same sequence, new annotations, descriptor=null (the intron-marking path)
    useStore.getState().commitWorkingEdit(SEQ, ann, null);
    const after = useStore.getState().align;
    expect(after.workingReference.annotations).toEqual(ann); // annotation applied
    expect(after.result).toBe(before); // same object → no re-align
  });

  it('commitWorkingEdit DEBOUNCES the re-align on a real sequence change (typing freeze fix)', () => {
    vi.useFakeTimers();
    const SEQ = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';
    seedPair(SEQ, SEQ);
    const before = useStore.getState().align.result;
    useStore.getState().commitWorkingEdit('ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATT', [], { kind: 'replace', start: 39, end: 40, replacement: 'T' });
    expect(useStore.getState().align.result).toBe(before); // deferred — NOT re-aligned synchronously (no per-keystroke freeze)
    vi.runAllTimers();
    expect(useStore.getState().align.result).not.toBe(before); // re-aligned after the idle window
  });

  it('a burst of edits collapses into a SINGLE trailing re-align', () => {
    vi.useFakeTimers();
    const SEQ = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';
    seedPair(SEQ, SEQ);
    const before = useStore.getState().align.result;
    useStore.getState().commitWorkingEdit(`${SEQ}A`, [], { kind: 'insert', pos: 40, char: 'A' });
    useStore.getState().commitWorkingEdit(`${SEQ}AC`, [], { kind: 'insert', pos: 41, char: 'C' });
    useStore.getState().commitWorkingEdit(`${SEQ}ACG`, [], { kind: 'insert', pos: 42, char: 'G' });
    expect(useStore.getState().align.result).toBe(before); // nothing re-aligned mid-burst
    vi.runAllTimers();
    const after = useStore.getState().align.result;
    expect(after).not.toBe(before); // one re-align fired
    vi.runAllTimers();
    expect(useStore.getState().align.result).toBe(after); // no extra queued timers → truly collapsed
  });

  it('flushAlignment runs a pending re-align synchronously (no timer advance)', () => {
    vi.useFakeTimers();
    const SEQ = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';
    seedPair(SEQ, SEQ);
    const before = useStore.getState().align.result;
    useStore.getState().commitWorkingEdit(`${SEQ}A`, [], { kind: 'insert', pos: 40, char: 'A' });
    expect(useStore.getState().align.result).toBe(before); // pending
    useStore.getState().flushAlignment();
    expect(useStore.getState().align.result).not.toBe(before); // ran now, without advancing timers
  });

  it('clearAlignment cancels a pending re-align (no late fire after teardown)', () => {
    vi.useFakeTimers();
    const SEQ = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';
    seedPair(SEQ, SEQ);
    useStore.getState().commitWorkingEdit(`${SEQ}A`, [], { kind: 'insert', pos: 40, char: 'A' });
    useStore.getState().clearAlignment();
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(useStore.getState().align.inputs).toHaveLength(0); // stayed cleared
    expect(useStore.getState().align.result).toBeNull(); // no late re-align populated result
    expect(useStore.getState().align.status).toBe('idle'); // no spurious 'error' from a late fire
  });

  it('undo/redo of an annotation-only edit does NOT re-align', () => {
    const SEQ = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';
    seedPair(SEQ, SEQ);
    const ann1 = [{ id: 'i1', level: 'detail', type: 'intron', start: 5, end: 12 }];
    const ann2 = [...ann1, { id: 'i2', level: 'detail', type: 'intron', start: 20, end: 27 }];
    useStore.getState().commitWorkingEdit(SEQ, ann1, null);
    const r1 = useStore.getState().align.result;
    useStore.getState().commitWorkingEdit(SEQ, ann2, null);
    expect(useStore.getState().align.result).toBe(r1); // still no re-align
    useStore.getState().undoAlignEdit(); // back to ann1, sequence unchanged
    expect(useStore.getState().align.workingReference.annotations).toEqual(ann1);
    expect(useStore.getState().align.result).toBe(r1); // undo did not re-align
    useStore.getState().redoAlignEdit(); // forward to ann2, sequence unchanged
    expect(useStore.getState().align.workingReference.annotations).toEqual(ann2);
    expect(useStore.getState().align.result).toBe(r1); // redo did not re-align
  });

  it('undo of a sequence edit re-aligns synchronously against the restored sequence (flush-then-run)', () => {
    vi.useFakeTimers();
    const SEQ = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';
    seedPair(SEQ, SEQ);
    useStore.getState().commitWorkingEdit('ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATT', [], { kind: 'replace', start: 39, end: 40, replacement: 'T' });
    vi.runAllTimers(); // realize the edited alignment
    const edited = useStore.getState().align.result;
    expect(edited).toBeTruthy();
    useStore.getState().undoAlignEdit(); // back to the pristine SEQ — flushes any pending, re-aligns synchronously
    expect(useStore.getState().align.workingReference).toBeNull();
    expect(useStore.getState().align.result).not.toBe(edited); // re-aligned against the restored sequence
    vi.runAllTimers();
    expect(useStore.getState().align.result).toBeTruthy(); // no stale trailing run clobbered it
  });

  it('openAlignmentWith loads library entries and switches to the align workspace', () => {
    useStore.getState().openAlignmentWith([
      { id: 'e1', name: 'pUC19', payload: { sequence: 'ACGTACGT' } },
      { id: 'e2', name: 'pET28', payload: { sequence: 'ACGTTCGT' } },
    ]);
    const s = useStore.getState();
    expect(s.workspace.active).toBe('align');
    expect(s.align.inputs).toHaveLength(2);
    expect(s.align.inputs[0].sequence).toBe('ACGTACGT');
    expect(s.align.refId).toBeTruthy();
    expect(s.align.readIds.length).toBeGreaterThan(0);
  });
});

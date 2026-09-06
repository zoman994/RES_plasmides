/**
 * library-current-document.test.js — ANN-INTEGRITY seam BG-026 / BG-028.
 * The one coherent current document: no saved/edited mixing, derived length,
 * and correct annotation-only-vs-version autosave gating.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCurrentDocument,
  isSequenceDivergent,
  hasAnnotationBuffer,
  annotationOnlyAutosaveAllowed,
  documentKey,
} from '../library-current-document';

const savedItem = {
  _libraryEntryId: 'entry-1',
  sequence: 'ACGTACGTAC', // length 10
  annotations: [{ id: 'r1', level: 'region', type: 'CDS', start: 0, end: 6 }],
  topology: 'circular',
  length: 10,
};

describe('buildCurrentDocument — coherent single view', () => {
  it('reflects the SAVED payload when there is no edit buffer', () => {
    const doc = buildCurrentDocument(savedItem, null, 3);
    expect(doc).toMatchObject({
      entryId: 'entry-1',
      sequence: 'ACGTACGTAC',
      topology: 'circular',
      length: 10,
      docEpoch: 3,
      transient: false,
    });
    expect(doc.annotations).toBe(savedItem.annotations);
  });

  it('returns null when there is no item', () => {
    expect(buildCurrentDocument(null, {})).toBeNull();
  });

  it('length is DERIVED from the shown sequence, never the stale saved length', () => {
    // Buffer shortened the sequence to 4 nt, but the saved item.length is still 10.
    const doc = buildCurrentDocument(savedItem, { editedSequence: 'ACGT' }, 1);
    expect(doc.sequence).toBe('ACGT');
    expect(doc.length).toBe(4); // NOT 10
  });

  it('never mixes a saved sequence with edited annotations', () => {
    // Annotation-only edit: sequence stays saved, annotations come from the buffer.
    const editedAnns = [{ id: 'r1', level: 'region', type: 'CDS', start: 0, end: 6, name: 'renamed' }];
    const doc = buildCurrentDocument(savedItem, { editedAnnotations: editedAnns });
    expect(doc.sequence).toBe('ACGTACGTAC');
    expect(doc.annotations).toBe(editedAnns);
    expect(doc.transient).toBe(false); // annotation-only is not a version-requiring divergence
  });

  it('takes edited sequence + topology together and flags transient', () => {
    const doc = buildCurrentDocument(savedItem, {
      editedSequence: 'ACGTACGTACGT',
      editedTopology: 'linear',
    }, 7);
    expect(doc.sequence).toBe('ACGTACGTACGT');
    expect(doc.length).toBe(12);
    expect(doc.topology).toBe('linear');
    expect(doc.transient).toBe(true);
  });
});

describe('sequence-divergence / autosave gating', () => {
  it('isSequenceDivergent is false with no edits or annotation-only edits', () => {
    expect(isSequenceDivergent(savedItem, null)).toBe(false);
    expect(isSequenceDivergent(savedItem, { editedAnnotations: [] })).toBe(false);
  });

  it('isSequenceDivergent is true for an edited sequence or topology', () => {
    expect(isSequenceDivergent(savedItem, { editedSequence: 'AC' })).toBe(true);
    expect(isSequenceDivergent(savedItem, { editedTopology: 'linear' })).toBe(true);
  });

  it('a buffer that equals the saved sequence is NOT divergent (no-op edit)', () => {
    expect(isSequenceDivergent(savedItem, { editedSequence: savedItem.sequence })).toBe(false);
    expect(isSequenceDivergent(savedItem, { editedTopology: 'circular' })).toBe(false);
  });

  it('annotation-only autosave is allowed for a clean saved document', () => {
    expect(annotationOnlyAutosaveAllowed(savedItem, { editedAnnotations: [] })).toBe(true);
  });

  it('annotation-only autosave is REFUSED once the sequence diverges', () => {
    // The annotations belong to the edited sequence — writing them back to the
    // saved payload would mix two different documents.
    expect(annotationOnlyAutosaveAllowed(savedItem, {
      editedSequence: 'ACGT',
      editedAnnotations: [{ id: 'x' }],
    })).toBe(false);
  });

  it('hasAnnotationBuffer detects an edited-annotations buffer', () => {
    expect(hasAnnotationBuffer({ editedAnnotations: [] })).toBe(true);
    expect(hasAnnotationBuffer({})).toBe(false);
    expect(hasAnnotationBuffer(null)).toBe(false);
  });
});

describe('documentKey', () => {
  it('changes with epoch, topology, length and identity', () => {
    const base = buildCurrentDocument(savedItem, null, 1);
    const bumped = buildCurrentDocument(savedItem, null, 2);
    expect(documentKey(base)).not.toBe(documentKey(bumped));
    const shorter = buildCurrentDocument(savedItem, { editedSequence: 'ACGT' }, 1);
    expect(documentKey(base)).not.toBe(documentKey(shorter));
  });
});

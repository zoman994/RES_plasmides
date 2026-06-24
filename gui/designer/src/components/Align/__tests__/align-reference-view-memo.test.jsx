import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

// Capture the props SequenceView receives so we can assert the `fragments`
// array identity is STABLE across a caret/selection change. A fresh array each
// render defeats SequenceView's buildFeatureMap memo → the whole viewer
// re-renders on every pointermove during a selection drag («выделение дерганное»).
let svProps = null;
vi.mock('../../SequenceView', () => ({
  __esModule: true,
  default: React.forwardRef((props, _ref) => { svProps = props; return null; }),
}));
// AlignMiniMap pulls in ResizeObserver/geometry — stub it out, irrelevant here.
vi.mock('../AlignMiniMap', () => ({ __esModule: true, default: () => null }));

import AlignReferenceView from '../AlignReferenceView';
import { alignPairwise } from '../../../lib/alignment/align-pairwise';

const REF = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATACGGATCAGTTGCAC';
const READ = REF.slice(10, 40);
const result = alignPairwise(REF, READ, { mode: 'semiglobal' });
const referenceFragment = { id: 'r1', name: 'ref', sequence: REF, annotations: [], type: 'reference' };

beforeEach(() => { svProps = null; });
afterEach(cleanup);

describe('AlignReferenceView — selection drag does not re-render the whole viewer', () => {
  it('keeps a STABLE fragments array across a caret/selection change (memo survives)', () => {
    render(<AlignReferenceView result={result} referenceFragment={referenceFragment} />);
    const frags1 = svProps.fragments;
    expect(Array.isArray(frags1)).toBe(true);
    expect(frags1[0]).toBe(referenceFragment);

    // Simulate one step of a selection drag (SequenceView would call this per
    // pointermove). It updates the internal caret state → AlignReferenceView
    // re-renders.
    act(() => { svProps.onSelectRange(4, 12, 'dna', 1); });
    expect(svProps.caretAnchor).toBe(4);
    expect(svProps.caretPos).toBe(12); // selection advanced

    // The fragments array must be the SAME reference — otherwise buildFeatureMap
    // rebuilds fullSeq+features and every SequenceLine re-renders each move.
    expect(svProps.fragments).toBe(frags1);

    // A second drag step — still stable.
    act(() => { svProps.onSelectRange(4, 20, 'dna', 1); });
    expect(svProps.caretPos).toBe(20);
    expect(svProps.fragments).toBe(frags1);
  });
});

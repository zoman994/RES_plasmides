/**
 * primer-rc-contract — PRIMER-AUDIT guard (V174). The audit (haiku finders)
 * claimed reverse primers "double-RC and never match". That is a FALSE POSITIVE:
 * the contract is that `bindingSequence` holds the primer's OWN 5'→3' sequence
 * (= reverse-complement of the template region it anneals to, for a reverse
 * primer), and PrimerTrack/scanLibraryForPrimer RC it once to locate the template
 * region. Both producers (local-primer-design.js revBindRC, primer-derive.js
 * makePrimer) store this consistently.
 *
 * This test uses a NON-palindromic binding (so an accidental double-RC would NOT
 * round-trip to the same string and would FAIL to locate) to PIN the contract and
 * catch any future "fix" that stores the template-facing form instead.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PrimerTrack from '../tracks/PrimerTrack';
import { scanLibraryForPrimer } from '../../../lib/primer-binding-search';
import { reverseComplement } from '../../../sequence-utils';

afterEach(cleanup);

// Non-palindromic template region the reverse primer anneals to (12 nt).
const TEMPLATE_REGION = 'AAACGTGGATCA';
const REV_BINDING = reverseComplement(TEMPLATE_REGION); // 'TGATCCACGTTT' — primer's own 5'→3'
const FULL = 'GGGG' + TEMPLATE_REGION + 'GGGG'; // region at index 4

describe('reverse-primer RC contract (V174 guard)', () => {
  it('bindingSequence is NON-palindromic (test is meaningful)', () => {
    expect(REV_BINDING).not.toBe(TEMPLATE_REGION);
  });

  it('PrimerTrack locates a reverse primer whose bindingSequence is RC(template region)', () => {
    const p = { name: 'rev', direction: 'reverse', bindingSequence: REV_BINDING };
    render(
      <PrimerTrack
        fullSeq={FULL}
        lineStart={0}
        lineLen={FULL.length}
        labelChars={8}
        primerStyle="filled"
        charPx={7.2}
        primers={[p]}
      />,
    );
    // If reverse search double-RC'd (the audit's false claim), the arrow would be
    // absent (no hit). Its presence proves the contract holds.
    const arrow = screen.getByTestId('sequence-view-primer');
    expect(arrow.getAttribute('data-primer-direction')).toBe('reverse');
  });

  it('scanLibraryForPrimer finds the reverse binding on the - strand', () => {
    const hits = scanLibraryForPrimer(
      { bindingSequence: REV_BINDING },
      [{ id: 'e', name: 'mol', sequence: FULL, topology: { circular: false } }],
      { minLen: 6 },
    );
    const rev = hits.find((h) => h.strand === '-');
    expect(rev).toBeTruthy();
    expect(rev.start).toBe(4); // template region sits at index 4
  });
});

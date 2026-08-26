/**
 * PrimerSelectionActions — PRIMER-LIVE-1 roots 2, 3 and 5 (component level).
 *
 * Two questions live next to a selection, and neither may become a wizard:
 *
 *   1. «do I already have this oligo?» — answered from real stock only, and
 *      re-answered every time the selection moves;
 *   2. «these two landings — what would they amplify?» — answered with a
 *      compact preview and exactly ONE action.
 *
 * A blocked pair says why it is blocked instead of offering a button that
 * would produce biology that cannot happen.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PrimerSelectionActions from '../PrimerSelectionActions';
import { PRIMER_SCOPE_GLOBAL, PRIMER_SCOPE_PROJECT } from '../../../lib/primer-identity';

afterEach(cleanup);

//        0         1         2         3
//        0123456789012345678901234567890123456789
const TPL = 'GGGGAAAACCTTTTGGGGAACCCCTTTTGGAATTCCGGAA';

const FWD = 'AAAACCTT'; // TPL[4..12)
const REV = 'TTCCAAAA'; // rc(TPL[24..32))

const stock = (over) => ({
  id: over.id,
  name: over.name || over.id,
  scope: PRIMER_SCOPE_GLOBAL,
  status: 'received',
  tail: '',
  ...over,
});

function renderActions(props = {}) {
  return render(
    <PrimerSelectionActions
      template={TPL}
      topology="circular"
      entryId="e1"
      documentHash="h1"
      selection={null}
      occurrences={[]}
      primersById={{}}
      labRecords={[]}
      {...props}
    />,
  );
}

describe('lab matches follow the selection', () => {
  it('offers an exact received oligo for reuse', () => {
    const onReuse = vi.fn();
    renderActions({
      selection: { start: 4, end: 12 },
      labRecords: [stock({ id: 'g1', name: 'M13-fwd', sequence: FWD, bindingSequence: FWD })],
      onReuseLabPrimer: onReuse,
    });
    expect(screen.getByTestId('primer-lab-exact-g1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('primer-lab-reuse-g1'));
    expect(onReuse).toHaveBeenCalledTimes(1);
    expect(onReuse.mock.calls[0][0].id).toBe('g1');
  });

  it('does not offer a project record as something that exists in the lab', () => {
    renderActions({
      selection: { start: 4, end: 12 },
      labRecords: [stock({
        id: 'p1', scope: PRIMER_SCOPE_PROJECT, sequence: FWD, bindingSequence: FWD,
      })],
    });
    expect(screen.queryByTestId('primer-lab-exact-p1')).toBeNull();
    expect(screen.queryByTestId('primer-lab-substitution-p1')).toBeNull();
  });

  it('shows a same-length mismatching oligo as advisory, below exact', () => {
    renderActions({
      selection: { start: 4, end: 12 },
      labRecords: [
        stock({ id: 'sub', sequence: 'AAAACCTA', bindingSequence: 'AAAACCTA' }),
        stock({ id: 'ex', sequence: FWD, bindingSequence: FWD }),
      ],
    });
    const root = screen.getByTestId('primer-selection-actions');
    const exact = screen.getByTestId('primer-lab-exact-ex');
    const sub = screen.getByTestId('primer-lab-substitution-sub');
    expect(root.contains(exact)).toBe(true);
    // Document order: the confirmed answer is above the advisory one.
    expect(exact.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('re-answers when the selection moves', () => {
    const { rerender } = renderActions({
      selection: { start: 4, end: 12 },
      labRecords: [stock({ id: 'g1', sequence: FWD, bindingSequence: FWD })],
    });
    expect(screen.getByTestId('primer-lab-exact-g1')).toBeTruthy();
    rerender(
      <PrimerSelectionActions
        template={TPL}
        topology="circular"
        entryId="e1"
        documentHash="h1"
        selection={{ start: 0, end: 8 }}
        occurrences={[]}
        primersById={{}}
        labRecords={[stock({ id: 'g1', sequence: FWD, bindingSequence: FWD })]}
      />,
    );
    expect(screen.queryByTestId('primer-lab-exact-g1')).toBeNull();
  });
});

describe('a tube that fits the site but is a different oligo', () => {
  it('is shown as sameBinding, never as «you already have this»', () => {
    renderActions({
      selection: { start: 4, end: 12 },
      labRecords: [stock({
        id: 'tailed', name: 'RE-tailed', sequence: `GAATTC${FWD}`,
        bindingSequence: FWD, tail: 'GAATTC',
      })],
    });
    expect(screen.queryByTestId('primer-lab-exact-tailed')).toBeNull();
    const chip = screen.getByTestId('primer-lab-same-binding-tailed');
    expect(chip.textContent).toMatch(/подходит к участку|fits this site/i);
    expect(chip.textContent).toMatch(/хвост|tail/i);
  });

  it('names a modification difference specifically', () => {
    renderActions({
      selection: { start: 4, end: 12 },
      labRecords: [stock({
        id: 'phos', name: 'phos', sequence: FWD, bindingSequence: FWD,
        modifications: ['5-phos'],
      })],
    });
    const chip = screen.getByTestId('primer-lab-same-binding-phos');
    expect(chip.textContent).toMatch(/модификац|modification/i);
  });

  it('does not offer one-click reuse for a different oligo', () => {
    const onReuse = vi.fn();
    renderActions({
      selection: { start: 4, end: 12 },
      labRecords: [stock({
        id: 'tailed', sequence: `GAATTC${FWD}`, bindingSequence: FWD, tail: 'GAATTC',
      })],
      onReuseLabPrimer: onReuse,
    });
    expect(screen.queryByTestId('primer-lab-reuse-tailed')).toBeNull();
  });
});

describe('warnings about the oligo under the selection', () => {
  it('warns about a low-Tm stretch without preventing anything', () => {
    // 8 A/T bases: a real oligo, and a poor one. The panel says so.
    renderActions({ selection: { start: 4, end: 12 } });
    const w = screen.getByTestId('primer-selection-warnings');
    expect(w.textContent).toMatch(/Tm/i);
    // Nothing here is a veto: no blocking element is rendered.
    expect(screen.queryByTestId('pcr-product-blocked')).toBeNull();
  });

  it('flags a self-complementary stretch that would fold on itself', () => {
    const hairpinTpl = `${'CCCCCCCC'}${'GAATTCGAATTC'}${'AAAAAAAA'}`;
    render(
      <PrimerSelectionActions
        template={hairpinTpl}
        topology="linear"
        selection={{ start: 8, end: 20 }}
        occurrences={[]}
        primersById={{}}
        labRecords={[]}
      />,
    );
    expect(screen.getByTestId('primer-selection-warnings').textContent.length)
      .toBeGreaterThan(0);
  });
});

describe('two landings — one action', () => {
  const primersById = {
    f: { id: 'f', name: 'fwd', sequence: FWD, bindingSequence: FWD, tail: '', direction: 'forward' },
    r: { id: 'r', name: 'rev', sequence: REV, bindingSequence: REV, tail: '', direction: 'reverse' },
  };
  const pair = [
    { key: 'f#1', primerId: 'f', start: 4, end: 12, strand: 1, evidence: 'source' },
    { key: 'r#1', primerId: 'r', start: 24, end: 32, strand: -1, evidence: 'source' },
  ];

  it('previews the product and exposes exactly one create action', () => {
    renderActions({ occurrences: pair, primersById });
    const preview = screen.getByTestId('pcr-product-preview');
    expect(preview.textContent).toMatch(/28/);
    expect(screen.getAllByTestId('pcr-product-create')).toHaveLength(1);
    expect(screen.queryByTestId('pcr-product-blocked')).toBeNull();
  });

  it('hands the resolved product to the single action', () => {
    const onCreate = vi.fn();
    renderActions({ occurrences: pair, primersById, onCreatePcrProduct: onCreate });
    fireEvent.click(screen.getByTestId('pcr-product-create'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    const arg = onCreate.mock.calls[0][0];
    expect(arg.product.sequence).toBe('AAAACCTTTTGGGGAACCCCTTTTGGAA');
    expect(arg.product.forward.key).toBe('f#1');
    expect(arg.product.reverse.key).toBe('r#1');
  });

  it('states the blocking reason instead of offering an impossible action', () => {
    renderActions({
      primersById: { ...primersById, r2: { ...primersById.f, id: 'r2' } },
      occurrences: [
        pair[0],
        { key: 'r2#1', primerId: 'r2', start: 24, end: 32, strand: 1, evidence: 'source' },
      ],
    });
    expect(screen.queryByTestId('pcr-product-create')).toBeNull();
    expect(screen.getByTestId('pcr-product-blocked')).toBeTruthy();
  });

  it('shows a warning but keeps the action when a base was deliberately changed', () => {
    renderActions({
      primersById: {
        ...primersById,
        f: { ...primersById.f, sequence: 'AATACCTT', bindingSequence: 'AATACCTT' },
      },
      occurrences: pair,
    });
    expect(screen.getByTestId('pcr-product-create')).toBeTruthy();
    expect(screen.getByTestId('pcr-product-warnings').textContent.length).toBeGreaterThan(0);
  });

  it('says nothing at all when fewer than two landings are chosen', () => {
    renderActions({ occurrences: [pair[0]], primersById });
    expect(screen.queryByTestId('pcr-product-preview')).toBeNull();
    expect(screen.queryByTestId('pcr-product-blocked')).toBeNull();
  });
});

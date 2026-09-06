import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import PrimerFromSelectionModal from '../popups/PrimerFromSelectionModal';

afterEach(cleanup);

describe('primer editor full-oligo landing preview', () => {
  it('lays a complementary 5-prime binding edit onto the template without false I highlights', () => {
    const core = 'ACGTCAGTACGATCGA';
    const extension = 'GATTACA';
    const left = 'AAAGGG';
    const template = `${left}${extension}${core}TTTTTT`;
    const coreStart = left.length + extension.length;
    const binding = `${extension}${core}`;

    render(
      <PrimerFromSelectionModal
        draft={{
          primerId: 'preview-primer',
          name: 'preview-primer',
          direction: 'forward',
          start: coreStart,
          end: coreStart + core.length,
          tail: '',
          binding,
          sequence: binding,
          bindingModel: 'aligned-v1',
        }}
        anchorSites={[{
          id: 'preview-site',
          target: { entryId: 'entry', resourceHash: 'hash', topology: 'linear' },
          location: {
            kind: 'single',
            segments: [{ start: coreStart, end: coreStart + core.length }],
          },
          strand: 1,
          annealedSequence: core,
          tail: '',
        }]}
        template={template}
        topology="linear"
        entryId="entry"
        documentHash="hash"
        onCreate={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByTestId('primer-modal-binding-difference')).toBeNull();
    const templatePreview = screen.getByTestId('primer-binding-template-preview');
    const primer = within(templatePreview).getByTestId('sequence-view-primer');
    expect(primer.dataset.primerSpan)
      .toBe(`${left.length}-${coreStart + core.length}`);
    expect(primer.dataset.primerOligoStatus).toBe('ok');
    expect(primer.querySelectorAll('[data-primer-alignment-op="I"]')).toHaveLength(0);
  });
});

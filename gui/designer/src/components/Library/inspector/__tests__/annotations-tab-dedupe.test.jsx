/**
 * annotations-tab-dedupe.test.jsx — «Убрать дубли» bar (Игорь 17.06.2026).
 * When the entry has overlapping near-identical annotations (a generic feature
 * covered ~identically by a higher-priority one, e.g. bla(M) marker under the
 * AmpR CDS), the Annotations tab offers a one-click removal from the DATA.
 * Annotator is mocked — we only test the dedupe affordance + wiring here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../../../Annotator', () => ({ default: () => <div data-testid="annotator-stub" /> }));

import AnnotationsTab from '../tabs/AnnotationsTab';

afterEach(cleanup);

describe('AnnotationsTab — «Убрать дубли»', () => {
  it('shows the dedupe bar + button when duplicateCount > 0 and fires the handler', () => {
    const onRemoveDuplicates = vi.fn();
    render(
      <AnnotationsTab annotations={[]} sequence="ACGT" active={false}
        duplicateCount={2} onRemoveDuplicates={onRemoveDuplicates} />,
    );
    expect(screen.getByTestId('annotations-dedupe-bar')).toBeTruthy();
    fireEvent.click(screen.getByTestId('annotations-dedupe-btn'));
    expect(onRemoveDuplicates).toHaveBeenCalledTimes(1);
  });

  it('no bar when there are no duplicates', () => {
    render(
      <AnnotationsTab annotations={[]} sequence="ACGT" active={false}
        duplicateCount={0} onRemoveDuplicates={vi.fn()} />,
    );
    expect(screen.queryByTestId('annotations-dedupe-bar')).toBeNull();
  });

  it('no bar in a read-only zone even when duplicates exist', () => {
    render(
      <AnnotationsTab annotations={[]} sequence="ACGT" active={false} isReadOnlyZone
        duplicateCount={3} onRemoveDuplicates={vi.fn()} />,
    );
    expect(screen.queryByTestId('annotations-dedupe-bar')).toBeNull();
  });
});

/**
 * SequenceTab — regression: origin control NO LONGER lives here.
 *
 * History: was in MetaColumn → moved to SequenceTab v0.7.x → moved BACK to
 * MetaColumn 04.05.2026 evening (биолог: «эту панель на право, под
 * топологию»). Origin behaviour now lives in `meta-column.test.jsx`. This
 * file stays as a regression guard so a future refactor that resurrects
 * the in-tab control fails fast.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { forwardRef } from 'react';
import SequenceTab from '../tabs/SequenceTab';

vi.mock('../../../SequenceView', () => ({
  default: forwardRef(function MockSequenceView(_props, _ref) {
    return <div data-testid="mock-sequence-view" />;
  }),
}));
vi.mock('../../../SequenceView/SettingsPopover', () => ({
  default: () => null,
  SEQUENCE_VIEW_DEFAULTS: {},
}));

afterEach(cleanup);

const SEQUENCE = 'ATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGC';
const ANNOTATIONS = [
  { id: 'r1', type: 'CDS', name: 'AmpR', start: 5, end: 40, level: 'region' },
];

describe('SequenceTab — origin control absent (moved to MetaColumn)', () => {
  it('1) circular topology — origin testids are NOT present', () => {
    render(
      <SequenceTab
        sequence={SEQUENCE}
        annotations={ANNOTATIONS}
        topology="circular"
        name="pUC19"
        fileKey="pUC19.gb"
        onUpdateEdits={() => {}}
      />,
    );
    expect(screen.queryByTestId('importer-sequence-origin')).toBeNull();
    expect(screen.queryByTestId('importer-sequence-origin-input')).toBeNull();
    expect(screen.queryByTestId('importer-sequence-origin-apply')).toBeNull();
  });

  it('2) linear topology — origin testids are also absent', () => {
    render(
      <SequenceTab
        sequence={SEQUENCE}
        annotations={ANNOTATIONS}
        topology="linear"
        name="frag"
        fileKey="frag.fasta"
        onUpdateEdits={() => {}}
      />,
    );
    expect(screen.queryByTestId('importer-sequence-origin')).toBeNull();
  });
});

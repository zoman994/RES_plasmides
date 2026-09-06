import { readFileSync } from 'node:fs';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';

import { alignPrimerBinding } from '../../../lib/primer-binding-alignment';
import PrimerInspectorPanel from '../PrimerInspectorPanel';

afterEach(cleanup);

const TARGET = 'ACGTACGTACGTACGT';
const BINDING = 'ACGTTCGTACGTACGT';
const TAIL = 'GAATTC';
const alignment = alignPrimerBinding(BINDING, TARGET);
const primer = {
  id: 'inspector-primer',
  name: 'origin mismatch',
  direction: 'forward',
  tail: TAIL,
  bindingSequence: BINDING,
  sequence: `${TAIL}${BINDING}`,
};
const occurrence = {
  key: 'inspector-primer#site-1',
  primerId: primer.id,
  segments: [{ start: 90, end: 100 }, { start: 0, end: 6 }],
  strand: 1,
  wrapsOrigin: true,
  tail: TAIL,
  // The reference landing deliberately differs from the physical oligo.
  annealedSequence: TARGET,
  alignment,
};

describe('P16 primer inspector', () => {
  it('shows the physical 5′→3′ oligo, landing, origin coordinates, X/I/D summary and 3′ anchor', () => {
    const onEdit = vi.fn();
    const { container } = render(
      <PrimerInspectorPanel
        selection={{ key: occurrence.key, hit: primer }}
        occurrence={occurrence}
        primer={primer}
        onEdit={onEdit}
      />,
    );

    const panel = screen.getByTestId('primer-inspector');
    expect(panel.dataset.primerDirection).toBe('forward');
    expect(container.querySelector('.primer-inspector__sequence').textContent)
      .toBe(`${TAIL}${BINDING}`);
    expect(panel.textContent).toContain(BINDING);
    expect(panel.textContent).toContain(TARGET);
    expect(panel.textContent).toMatch(/91\s*→\s*6/);
    expect(panel.textContent).toMatch(/X|замен|substitution/i);
    expect(screen.getByTestId('primer-modal-tm-anchor').textContent).toMatch(/3.?/);
    expect(screen.queryByRole('button', { name: /сохран|save/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /редакт|edit/i }));
    expect(onEdit).toHaveBeenCalledWith(primer);
  });

  it('reserves a sticky 312 px inspector dock only at a 920 px viewer container', () => {
    const css = readFileSync('./src/components/SequenceView/PrimerInspectorPanel.css', 'utf8');
    expect(css).toMatch(/\.sequence-view-shell\s*\{[^}]*overflow:\s*clip/s);
    expect(css).toMatch(/\.primer-inspector-slot\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(/\.primer-inspector-slot\s*\{[^}]*position:\s*sticky/s);
    expect(css).toMatch(/\.primer-inspector-slot\s*\{[^}]*top:\s*0/s);
    expect(css).toMatch(/\.primer-inspector-slot\s*\{[^}]*align-self:\s*flex-start/s);
    expect(css).toMatch(/\.primer-inspector\s*\{[^}]*max-height:\s*100dvh/s);
    expect(css).toMatch(/@container\s*\(min-width:\s*920px\)/);
    expect(css).toMatch(/\.primer-inspector-slot\s*\{[^}]*display:\s*block/s);
    expect(css).toMatch(/flex:\s*0\s+0\s+312px/);
  });

  it('uses the live projected tail/binding split while keeping the saved physical oligo', () => {
    const anchor = 'GCGCGCATATAT';
    const polyA = 'AAAAAAAA';
    const legacyPrimer = {
      ...primer,
      tail: '',
      bindingSequence: `${polyA}${anchor}`,
      sequence: `${polyA}${anchor}`,
    };
    const liveOccurrence = {
      ...occurrence,
      tail: polyA,
      annealedSequence: anchor,
      alignment: alignPrimerBinding(anchor, anchor),
    };
    const { container } = render(
      <PrimerInspectorPanel
        selection={{ key: liveOccurrence.key, hit: legacyPrimer }}
        occurrence={liveOccurrence}
        primer={legacyPrimer}
      />,
    );

    expect(container.querySelector('.primer-inspector__sequence').textContent)
      .toBe(`${polyA}${anchor}`);
    expect(container.querySelector('.primer-inspector__sequence mark').textContent).toBe(polyA);
    expect(screen.getByText(/5.?.*8/i)).toBeTruthy();
    expect(screen.getByText(/GC\s*50%/i)).toBeTruthy();
  });

  it.each(['conflict', 'unsupported'])(
    'shows %s as an unresolved landing with unknown Tm and 3′ anchor',
    (oligoStatus) => {
      render(
        <PrimerInspectorPanel
          selection={{ key: occurrence.key, hit: primer }}
          occurrence={{ ...occurrence, oligoStatus, tail: null, alignment: null }}
          primer={primer}
        />,
      );

      const panel = screen.getByTestId('primer-inspector');
      expect(panel.textContent).toMatch(/не подтвержд|unresolved|conflict|unsupported/i);
      expect(panel.textContent).toMatch(/Tm\s*—/i);
      expect(panel.textContent).toMatch(/3.?.*—/i);
      expect(screen.queryByTestId('primer-modal-tm-anchor')).toBeNull();
    },
  );

  it('takes direction from the clicked occurrence before the saved record', () => {
    render(
      <PrimerInspectorPanel
        selection={{ key: occurrence.key, hit: { ...primer, direction: 'forward' } }}
        occurrence={{ ...occurrence, strand: -1 }}
        primer={{ ...primer, direction: 'forward' }}
      />,
    );
    expect(screen.getByTestId('primer-inspector').dataset.primerDirection).toBe('reverse');
  });

  it('does not report a falsely exact GC percentage for an IUPAC binding', () => {
    const ambiguous = { ...primer, tail: '', sequence: 'GGNN', bindingSequence: 'GGNN' };
    render(
      <PrimerInspectorPanel
        selection={{ key: occurrence.key, hit: ambiguous }}
        occurrence={{
          ...occurrence,
          tail: '',
          annealedSequence: 'GGNN',
          alignment: { query: 'GGNN', target: 'GGNN', runs: [] },
        }}
        primer={ambiguous}
      />,
    );
    expect(screen.getByText(/GC\s*—/i)).toBeTruthy();
    expect(screen.queryByText(/GC\s*100%/i)).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  cleanup, fireEvent, render, screen,
} from '@testing-library/react';

import PrimerTrack from '../tracks/PrimerTrack';

afterEach(cleanup);

const SEQUENCE = `ATGCAAAGGGCCCTAACGTT${'A'.repeat(30)}`;

describe('P9 primer keyboard focus', () => {
  it('keeps button semantics while focusing only one truthful primer perimeter', () => {
    const onPrimerClick = vi.fn();
    render(<PrimerTrack
      primers={[{
        id: 'focus-primer',
        name: 'focus-primer',
        bindingModel: 'aligned-v1',
        tail: 'GGGG',
        bindingSequence: 'ATGCAAAGTGCCCTAACGTT',
        sequence: 'GGGGATGCAAAGTGCCCTAACGTT',
        direction: 'forward',
        sites: [{
          id: 'focus-site',
          target: { entryId: 'focus-entry', resourceHash: 'focus-doc', topology: 'linear' },
          location: { kind: 'single', segments: [{ start: 0, end: 20 }] },
          strand: 1,
          annealedSequence: 'ATGCAAAGGGCCCTAACGTT',
          tail: 'GGGG',
        }],
      }]}
      fullSeq={SEQUENCE}
      lineStart={0}
      lineLen={SEQUENCE.length}
      charPx={7.2}
      labelChars={8}
      primerStyle="outline"
      onPrimerClick={onPrimerClick}
      entryId="focus-entry"
      documentHash="focus-doc"
      topology="linear"
    />);

    const group = screen.getByTestId('sequence-view-primer');
    expect(group.getAttribute('role')).toBe('button');
    expect(group.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(group, { key: 'Enter' });
    fireEvent.keyDown(group, { key: ' ' });
    expect(onPrimerClick).toHaveBeenCalledTimes(2);

    const css = readFileSync('./src/index.css', 'utf8');
    const groupRule = css.match(
      /\[data-primer-interactive="true"\]:focus\s*\{([^}]*)\}/,
    );
    expect(groupRule).not.toBeNull();
    expect(groupRule[1]).toMatch(/outline\s*:\s*none/);

    const perimeterRule = css.match(
      /\[data-primer-interactive="true"\]:focus-visible\s+\[data-primer-focus-perimeter="true"\]\s*\{([^}]*)\}/,
    );
    expect(perimeterRule).not.toBeNull();
    expect(perimeterRule[1]).toMatch(/stroke\s*:\s*var\(--accent-500\)/);
    expect(perimeterRule[1]).toMatch(/stroke-width\s*:\s*1px/);

    const focusedShapes = group.querySelectorAll('[data-primer-focus-perimeter="true"]');
    expect(focusedShapes).toHaveLength(1);
    expect(focusedShapes[0]).toBe(screen.getByTestId('sequence-view-primer-envelope'));
    expect(group.querySelector('[data-primer-step-source="tail"]')
      .hasAttribute('data-primer-focus-perimeter')).toBe(false);
  });

  it('gives a stepped no-tail mismatch one truthful focus perimeter', () => {
    render(<PrimerTrack
      primers={[{
        id: 'no-tail-focus-primer',
        name: 'no-tail-focus-primer',
        bindingModel: 'aligned-v1',
        tail: '',
        bindingSequence: 'ATGCAAAGTGCCCTAACGTT',
        sequence: 'ATGCAAAGTGCCCTAACGTT',
        direction: 'forward',
        sites: [{
          id: 'no-tail-focus-site',
          target: { entryId: 'focus-entry', resourceHash: 'focus-doc', topology: 'linear' },
          location: { kind: 'single', segments: [{ start: 0, end: 20 }] },
          strand: 1,
          annealedSequence: 'ATGCAAAGGGCCCTAACGTT',
          tail: '',
        }],
      }]}
      fullSeq={SEQUENCE}
      lineStart={0}
      lineLen={SEQUENCE.length}
      charPx={7.2}
      labelChars={8}
      primerStyle="outline"
      onPrimerClick={() => {}}
      entryId="focus-entry"
      documentHash="focus-doc"
      topology="linear"
    />);

    const group = screen.getByTestId('sequence-view-primer');
    const perimeters = group.querySelectorAll('[data-primer-focus-perimeter="true"]');
    expect(perimeters).toHaveLength(1);
    const envelope = screen.getByTestId('sequence-view-primer-envelope');
    expect(perimeters[0]).toBe(envelope);
    expect(envelope.tagName.toLowerCase()).toBe('path');
    expect(envelope.getAttribute('stroke-width')).toBe('1');
    expect(envelope.dataset.primerEnvelopeOccupiedRuns).toBe('M:0-8,X:8-9,M:9-20');
    expect([...group.querySelectorAll(
      '[data-testid="sequence-view-primer-run"], [data-testid="sequence-view-primer-arrowhead"], [data-testid="sequence-view-primer-step-connector"]',
    )].every((node) => !node.hasAttribute('data-primer-focus-perimeter'))).toBe(true);
  });
});

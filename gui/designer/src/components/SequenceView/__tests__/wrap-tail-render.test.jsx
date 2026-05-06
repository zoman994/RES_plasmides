/**
 * wrap-tail-render — Sprint M-X.3 K2 integration coverage.
 *
 * Mounts SequenceView with circular vs linear topology and checks
 * that:
 *  - circular long plasmid renders 2 leading-wrap + main + 2 trailing-wrap
 *    lines (data-wraptail-kind on each <div>)
 *  - linear plasmid renders only main lines, NO wrap-tail
 *  - circular short plasmid (< 3 main lines) renders only main + no
 *    wrap-tail (degenerate auto-disable)
 *  - wrap-tail wrapper carries opacity 0.5 + pointer-events: none
 *    so caret/click never lands on context lines
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceView from '../index';
import { useStore } from '../../../store';

const cds80 = 'ATGAAACATGCAGTGGCAATGGCATTGGCATTGGCAATGCATGCATTGGCATTGGCAATGCATGCATTGGCATTGGCAA';
const longSeq = cds80.repeat(60); // 4800 bp — easily > 5 main lines at cpl=80

const longFragment = {
  id: 'frag-circular-long',
  name: 'circular-long',
  type: 'plasmid',
  sequence: longSeq,
  strand: 1,
  annotations: [],
};

const linearFragment = {
  id: 'frag-linear',
  name: 'linear',
  type: 'misc_feature',
  sequence: longSeq,
  strand: 1,
  annotations: [],
};

const shortFragment = {
  id: 'frag-circular-short',
  name: 'circular-short',
  type: 'plasmid',
  sequence: 'ATGC'.repeat(20), // 80 bp = 1 main line
  strand: 1,
  annotations: [],
};

beforeEach(() => {
  // Force charsPerLine via a settings tweak so the test is deterministic
  // regardless of measureCharPx noise in happy-dom.
  useStore.setState({
    sequenceView: {
      ...useStore.getState().sequenceView,
      sequenceWrap: 80,
    },
  });
});

afterEach(() => { cleanup(); });

describe('M-X.3 K2 — wrap-tail rendering', () => {
  it('circular long plasmid renders leading-wrap + main + trailing-wrap lines', () => {
    render(<SequenceView fragments={[longFragment]} circular />);
    const lines = screen.getAllByTestId('sequence-view-line');
    const kinds = lines.map((el) => el.getAttribute('data-wraptail-kind'));
    expect(kinds.filter((k) => k === 'leading-wrap').length).toBeGreaterThan(0);
    expect(kinds.filter((k) => k === 'trailing-wrap').length).toBeGreaterThan(0);
    expect(kinds.filter((k) => k === 'main').length).toBeGreaterThan(0);
  });

  it('linear plasmid renders only main lines (no wrap-tail)', () => {
    render(<SequenceView fragments={[linearFragment]} circular={false} />);
    const lines = screen.getAllByTestId('sequence-view-line');
    const kinds = lines.map((el) => el.getAttribute('data-wraptail-kind'));
    expect(kinds.every((k) => k === 'main')).toBe(true);
    expect(kinds.filter((k) => k === 'leading-wrap')).toHaveLength(0);
    expect(kinds.filter((k) => k === 'trailing-wrap')).toHaveLength(0);
  });

  it('circular degenerate plasmid (< 3 main lines) renders only main', () => {
    render(<SequenceView fragments={[shortFragment]} circular />);
    const lines = screen.getAllByTestId('sequence-view-line');
    const kinds = lines.map((el) => el.getAttribute('data-wraptail-kind'));
    expect(kinds.every((k) => k === 'main')).toBe(true);
  });

  it('wrap-tail wrappers carry opacity 0.5 + pointer-events:none', () => {
    render(<SequenceView fragments={[longFragment]} circular />);
    const lines = screen.getAllByTestId('sequence-view-line');
    const wrapTailLines = lines.filter(
      (el) => el.getAttribute('data-wraptail-kind') !== 'main',
    );
    expect(wrapTailLines.length).toBeGreaterThan(0);
    for (const el of wrapTailLines) {
      const style = el.getAttribute('style') || '';
      expect(style).toContain('opacity');
      expect(style).toContain('0.5');
      expect(style).toContain('pointer-events');
      expect(style).toContain('none');
    }
  });
});

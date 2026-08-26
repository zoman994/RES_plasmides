/**
 * primer-site-overlay.test.jsx — ANN-0L.
 *
 * The shared map overlay. Both maps mount it, so what it draws is what the user
 * sees on the circular and the linear view alike.
 *
 * The distinction under test: how MANY glyphs a record produces, and whether a
 * glyph is a fact from the file or a match this app computed. Collapsing those
 * two is how a guess ends up looking like data.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PrimerSiteOverlay from '../PrimerSiteOverlay';
import { buildRenderContext } from '../../lib/primer-site-projection';

afterEach(cleanup);

const TEMPLATE = 'ACGT'.repeat(20); // 80 nt, deliberately repetitive

// ANN-0M root C - a site names the molecule and the version of it.
const HASH = 'sha256:doc-v1';
const site = (over = {}) => ({
  id: 's1',
  target: { entryId: 'E1', resourceHash: HASH, topology: 'circular' },
  location: { kind: 'single', segments: [{ start: 10, end: 22 }] },
  strand: 1,
  annealedSequence: 'ACGTACGTACGT',
  tail: null,
  sourceVisibility: 'shown',
  ...over,
});

// `topology` is part of the contract now: an origin-crossing site is only
// drawable on a molecule that has an origin to cross.
// ANN-0M root D - the host builds ONE context and hands it over whole.
const ctx = (topology = 'circular') => buildRenderContext({
  entryId: 'E1', sequence: TEMPLATE, topology, documentHash: HASH,
});

const linear = (primers, topology = 'circular') => render(
  <svg>
    <PrimerSiteOverlay
      primers={primers}
      context={ctx(topology)}
      toX={(bp) => bp * 2}
      y={0}
      height={6}
    />
  </svg>,
);

describe('PrimerSiteOverlay — one occurrence, one glyph', () => {
  it('draws a declared site once on a repetitive template', () => {
    linear([{ id: 'p1', sequence: null, sites: [site()] }]);
    expect(screen.getAllByTestId('primer-site')).toHaveLength(1);
    expect(screen.getAllByTestId('primer-site-segment')).toHaveLength(1);
  });

  it('draws a two-site primer twice', () => {
    linear([{
      id: 'p1',
      sites: [
        site({ id: 'a' }),
        site({ id: 'b', location: { kind: 'single', segments: [{ start: 40, end: 52 }] } }),
      ],
    }]);
    const glyphs = screen.getAllByTestId('primer-site');
    expect(glyphs).toHaveLength(2);
    expect(new Set(glyphs.map((g) => g.getAttribute('data-primer-site-key'))).size).toBe(2);
  });

  it('draws an origin-crossing site as two segments under ONE key', () => {
    linear([{
      id: 'p1',
      sites: [site({ location: { kind: 'join', segments: [{ start: 74, end: 80 }, { start: 0, end: 6 }] } })],
    }]);
    // one logical binding …
    const glyphs = screen.getAllByTestId('primer-site');
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].getAttribute('data-primer-wraps')).toBe('true');
    // … drawn in two pieces
    expect(screen.getAllByTestId('primer-site-segment')).toHaveLength(2);
  });

  it('renders a hidden source site muted rather than dropping it', () => {
    linear([{ id: 'p1', sites: [site({ sourceVisibility: 'hidden' })] }]);
    const glyph = screen.getByTestId('primer-site');
    expect(glyph.getAttribute('data-primer-visibility')).toBe('hidden');
    expect(Number(glyph.getAttribute('opacity'))).toBeLessThan(1);
  });

  it('draws nothing for a primer with no site and no sequence, and does not crash', () => {
    const { container } = linear([{ id: 'p1', sequence: null, sites: [] }]);
    expect(screen.queryByTestId('primer-site')).toBeNull();
    expect(container).toBeTruthy();
  });
});

describe('PrimerSiteOverlay — source vs computed', () => {
  it('marks a computed fallback hit as such', () => {
    linear([{ id: 'p1', sequence: 'ACGTACGTACGT', sites: [] }]);
    const glyphs = screen.getAllByTestId('primer-site');
    expect(glyphs.length).toBeGreaterThan(0);
    expect(glyphs.every((g) => g.getAttribute('data-primer-evidence') === 'computed')).toBe(true);
  });

  it('marks a declared site as source', () => {
    linear([{ id: 'p1', sequence: 'ACGTACGTACGT', sites: [site()] }]);
    expect(screen.getByTestId('primer-site').getAttribute('data-primer-evidence')).toBe('source');
  });
});

describe('PrimerSiteOverlay — the 5-prime tail', () => {
  it('draws a proven tail outside the genomic span, before a forward site', () => {
    linear([{
      id: 'p1', tail: 'GGGGG', bindingSequence: 'ACGTACGTACGT',
      sequence: 'GGGGGACGTACGTACGT', sites: [site()],
    }]);
    const tail = screen.getByTestId('primer-site-tail');
    const seg = screen.getByTestId('primer-site-segment');
    const tailX = Number(tail.getAttribute('x'));
    const segX = Number(seg.getAttribute('x'));
    // strictly to the left of the binding, i.e. it does not lengthen the span
    expect(tailX + Number(tail.getAttribute('width'))).toBeLessThanOrEqual(segX);
    expect(segX).toBe(20); // start 10 × 2 — the genomic coordinate is untouched
  });

  it('draws it after the span for a reverse site', () => {
    linear([{
      id: 'p1', tail: 'GGGGG', bindingSequence: 'ACGTACGTACGT',
      sequence: 'GGGGGACGTACGTACGT', sites: [site({ strand: -1 })],
    }]);
    const tail = screen.getByTestId('primer-site-tail');
    expect(Number(tail.getAttribute('x'))).toBe(44); // end 22 × 2
  });

  it('draws no tail when the tail is unknown', () => {
    linear([{
      id: 'p1', tail: null, bindingSequence: 'ACGTACGTACGT', sequence: null,
      sites: [site()],
    }]);
    expect(screen.queryByTestId('primer-site-tail')).toBeNull();
  });
});

describe('PrimerSiteOverlay — circular host', () => {
  it('asks the host for each segment path and keeps the wrap under one key', () => {
    const seen = [];
    render(
      <svg>
        <PrimerSiteOverlay
          primers={[{
            id: 'p1',
            sites: [site({ location: { kind: 'join', segments: [{ start: 74, end: 80 }, { start: 0, end: 6 }] } })],
          }]}
          context={ctx('circular')}
          segmentPath={(seg) => { seen.push(seg); return `M0 0 L${seg.start} ${seg.end}`; }}
        />
      </svg>,
    );
    expect(seen).toEqual([{ start: 74, end: 80 }, { start: 0, end: 6 }]);
    expect(screen.getAllByTestId('primer-site')).toHaveLength(1);
    expect(screen.getAllByTestId('primer-site-segment')).toHaveLength(2);
  });
});

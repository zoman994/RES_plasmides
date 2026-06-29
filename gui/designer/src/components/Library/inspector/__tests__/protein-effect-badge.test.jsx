/**
 * ProteinEffectBadge (UX-6 UI) — shows the protein-level verdict of a pending
 * sequence edit across the CDS features. Silent ✓ / missense / truncation /
 * frameshift ⚠ — the molbiol «what did my edit do to the protein» at a glance.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ProteinEffectBadge from '../ProteinEffectBadge';

afterEach(cleanup);

// CDS ATG GCC GCC TAA (M A A *), 0..12 forward.
const ORIG = 'ATGGCCGCCTAA';
const CDS = [{ id: 'g1', level: 'region', type: 'CDS', name: 'glaA', start: 0, end: 12, strand: 1 }];

describe('ProteinEffectBadge', () => {
  it('renders nothing when there is no edit', () => {
    const { container } = render(<ProteinEffectBadge originalSequence={ORIG} editedSequence={ORIG} annotations={CDS} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the edit is null / undefined', () => {
    const { container } = render(<ProteinEffectBadge originalSequence={ORIG} editedSequence={null} annotations={CDS} />);
    expect(container.firstChild).toBeNull();
  });

  it('frameshift edit → loud frameshift verdict', () => {
    render(<ProteinEffectBadge originalSequence={ORIG} editedSequence="ATGGACCGCCTAA" annotations={CDS} />);
    const b = screen.getByTestId('protein-effect-badge');
    expect(b.dataset.effect).toBe('frameshift');
    expect(b.textContent).toMatch(/рамки/);
  });

  it('synonymous edit → silent verdict', () => {
    render(<ProteinEffectBadge originalSequence={ORIG} editedSequence="ATGGCAGCCTAA" annotations={CDS} />);
    expect(screen.getByTestId('protein-effect-badge').dataset.effect).toBe('silent');
  });

  it('missense edit → missense verdict', () => {
    render(<ProteinEffectBadge originalSequence={ORIG} editedSequence="ATGGACGCCTAA" annotations={CDS} />);
    expect(screen.getByTestId('protein-effect-badge').dataset.effect).toBe('missense');
  });

  it('picks the MOST SEVERE effect across multiple CDS', () => {
    // two CDS; edit is silent in the first (synonymous) but our edited seq
    // introduces a frameshift overall → the severe one wins.
    const two = [
      { id: 'g1', level: 'region', type: 'CDS', name: 'a', start: 0, end: 12, strand: 1 },
      { id: 'g2', level: 'region', type: 'gene', name: 'b', start: 0, end: 13, strand: 1 },
    ];
    render(<ProteinEffectBadge originalSequence={ORIG} editedSequence="ATGGACCGCCTAA" annotations={two} />);
    expect(screen.getByTestId('protein-effect-badge').dataset.effect).toBe('frameshift');
  });

  it('renders nothing when no CDS/gene feature exists (edit on non-coding)', () => {
    const noCds = [{ id: 'p1', level: 'region', type: 'promoter', name: 'P', start: 0, end: 12, strand: 1 }];
    const { container } = render(<ProteinEffectBadge originalSequence={ORIG} editedSequence="ATGGACGCCTAA" annotations={noCds} />);
    expect(container.firstChild).toBeNull();
  });
});

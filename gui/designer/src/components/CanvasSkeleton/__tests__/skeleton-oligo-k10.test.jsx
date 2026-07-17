/**
 * skeleton-oligo-k10.test.jsx — container-kind-registry + OligonucleotideBlock.
 *
 * Sprint M-CANVAS-OPS K10 (12.05.2026 — DEC-OPS-09).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  KIND_REGISTRY,
  getKindRegistry,
  isOligonucleotideKind,
  isMoleculeKind,
  detectKindFromLibraryEntry,
} from '../canvas/container-kind-registry';
import ContainerBlock from '../canvas/ContainerBlock';
import OligonucleotideBlock from '../canvas/OligonucleotideBlock';
import { useStore, bootstrapStore } from '../../../store';

afterEach(() => {
  cleanup();
  try { useStore.setState({ libraryEntries: {} }); } catch { /* */ }
});
beforeEach(() => {
  try { bootstrapStore(); } catch { /* */ }
});

const OLIGO = {
  id: 'oligo-1',
  name: 'M13-fwd-rev',
  kind: 'oligonucleotide',
  payload: {
    sequences: [
      { name: 'fwd', sequence: 'GTAAAACGACGGCCAG', Tm: 56.2, GC: 60.0 },
      { name: 'rev', sequence: 'CAGGAAACAGCTATGAC', Tm: 55.0, GC: 47.0 },
    ],
    purpose: 'pcr_primer',
    concentration_uM: 100,
    stock_volume_ul: 50,
  },
};

const MOL = {
  id: 'mol-1',
  name: 'pUC19',
  kind: 'molecule',
  sequence: 'ATGCATGC',
  topology: { circular: true },
};

describe('K10 — container-kind-registry', () => {
  it('KIND_REGISTRY exposes molecule + oligonucleotide + placeholder', () => {
    expect(KIND_REGISTRY.molecule).toBeTruthy();
    expect(KIND_REGISTRY.oligonucleotide).toBeTruthy();
    expect(KIND_REGISTRY.placeholder).toBeTruthy();
    expect(KIND_REGISTRY.oligonucleotide.icon).toBe('🧬');
    expect(KIND_REGISTRY.oligonucleotide.canBePCRInput).toBe(true);
    expect(KIND_REGISTRY.molecule.canBePCRTemplate).toBe(true);
  });

  it('getKindRegistry falls back to molecule for unknown', () => {
    const r = getKindRegistry('what-the-hell');
    expect(r).toBe(KIND_REGISTRY.molecule);
  });

  it('isOligonucleotideKind / isMoleculeKind discriminators', () => {
    expect(isOligonucleotideKind(OLIGO)).toBe(true);
    expect(isOligonucleotideKind(MOL)).toBe(false);
    expect(isMoleculeKind(MOL)).toBe(true);
    expect(isMoleculeKind(OLIGO)).toBe(false);
    expect(isMoleculeKind({})).toBe(true); // undefined kind falls back to molecule
  });

  it('detectKindFromLibraryEntry: explicit kind wins', () => {
    expect(detectKindFromLibraryEntry({ kind: 'oligonucleotide' })).toBe('oligonucleotide');
  });

  it('detectKindFromLibraryEntry: payload.sequences[] triggers oligo', () => {
    const entry = { kind: undefined, payload: { sequences: [{ name: 'fwd', sequence: 'AAA' }] } };
    expect(detectKindFromLibraryEntry(entry)).toBe('oligonucleotide');
  });

  it('detectKindFromLibraryEntry: payload.purpose=pcr_primer triggers oligo', () => {
    expect(detectKindFromLibraryEntry({ payload: { purpose: 'pcr_primer' } })).toBe('oligonucleotide');
    expect(detectKindFromLibraryEntry({ payload: { purpose: 'kld_primer' } })).toBe('oligonucleotide');
  });

  it('detectKindFromLibraryEntry: regular DNA → molecule', () => {
    expect(detectKindFromLibraryEntry({ payload: { sequence: 'ATGC' } })).toBe('molecule');
  });
});

describe('K10 — OligonucleotideBlock rendering', () => {
  it('renders name + two sequence lanes + Tm/GC pills', () => {
    render(<OligonucleotideBlock container={OLIGO} />);
    const block = screen.getByTestId(`skeleton-block-${OLIGO.id}`);
    expect(block.getAttribute('data-kind')).toBe('oligonucleotide');
    expect(screen.getByTestId(`skeleton-block-${OLIGO.id}-name`).textContent).toBe('M13-fwd-rev');
    expect(screen.getByTestId(`skeleton-block-${OLIGO.id}-lane-0`)).toBeTruthy();
    expect(screen.getByTestId(`skeleton-block-${OLIGO.id}-lane-1`)).toBeTruthy();
    expect(screen.getByTestId(`skeleton-block-${OLIGO.id}-tm-0`).textContent).toMatch(/Tm 56/);
    expect(screen.getByTestId(`skeleton-block-${OLIGO.id}-gc-1`).textContent).toMatch(/GC 47/);
  });

  it('purpose label shows from payload', () => {
    render(<OligonucleotideBlock container={OLIGO} />);
    expect(screen.getByTestId(`skeleton-block-${OLIGO.id}-purpose`).textContent).toBe('pcr_primer');
  });
});

describe('K10 — ContainerBlock dispatch on kind', () => {
  it('oligonucleotide container → renders OligonucleotideBlock variant', () => {
    render(<ContainerBlock container={OLIGO} />);
    const block = screen.getByTestId(`skeleton-block-${OLIGO.id}`);
    expect(block.getAttribute('data-kind')).toBe('oligonucleotide');
  });

  it('molecule container → renders FilledBlock variant (linear/circular)', () => {
    render(<ContainerBlock container={MOL} />);
    const block = screen.getByTestId(`skeleton-block-${MOL.id}`);
    expect(block.getAttribute('data-kind')).toBe('circular');
  });
});

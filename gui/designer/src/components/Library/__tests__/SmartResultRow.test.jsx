/**
 * SmartResultRow — one universal-search result row (P2):
 * [thumb][title +<mark>][reason chip][honest metrics · coloured by strength][N locations].
 * Presentational — driven by a resultRowViewModel.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { setLang } from '../../../i18n';
import SmartResultRow from '../SmartResultRow';

afterEach(() => {
  setLang('ru');
  cleanup();
});

const nameVM = {
  id: 'e1', title: 'pBG-104', nameHighlights: [{ start: 0, end: 3 }],
  reason: null, reasonLabel: null, metrics: null, metricsText: '', strengthPct: null, locationCount: 0, topology: 'circular',
};
const tagVM = { ...nameVM, id: 'e2', title: 'pUC19', nameHighlights: [], reason: 'tag', reasonLabel: 'тег' };
const seqVM = {
  ...nameVM, id: 'e3', title: 'insert', nameHighlights: [],
  metrics: { identity: 0.9, length: 20, exactMatches: 18, mismatches: 2 },
  metricsText: '90% идентичность · 18/20 точных · 2 несовп.', strengthPct: 0.9, locationCount: 3, topology: 'linear',
};

describe('SmartResultRow', () => {
  it('renders title with a highlight mark', () => {
    render(<SmartResultRow vm={nameVM} />);
    const row = screen.getByTestId('smart-result-e1');
    expect(row.textContent).toMatch(/pBG-104/);
    expect(row.querySelector('mark').textContent).toBe('pBG');
  });

  it('shows a reason chip for a non-name match', () => {
    render(<SmartResultRow vm={tagVM} />);
    expect(screen.getByTestId('smart-result-e2-reason').textContent).toBe('тег');
  });

  it('shows honest metrics text and a location count for a sequence hit', () => {
    render(<SmartResultRow vm={seqVM} />);
    const row = screen.getByTestId('smart-result-e3');
    expect(row.textContent).toMatch(/90% идентичность/);
    expect(screen.getByTestId('smart-result-e3-locations').textContent).toMatch(/3/);
  });

  it('has no reason chip / metrics for a plain name match', () => {
    render(<SmartResultRow vm={nameVM} />);
    expect(screen.queryByTestId('smart-result-e1-reason')).toBeNull();
    expect(screen.queryByTestId('smart-result-e1-locations')).toBeNull();
  });

  it('click invokes onPick with id + vm', () => {
    const onPick = vi.fn();
    render(<SmartResultRow vm={seqVM} onPick={onPick} />);
    fireEvent.click(screen.getByTestId('smart-result-e3'));
    expect(onPick).toHaveBeenCalledWith('e3', seqVM);
  });

  it('renders the enzyme explanation line for a re: hit', () => {
    const enzVM = {
      ...nameVM, id: 'e5', title: 'has-EcoRI', nameHighlights: [],
      reason: 'enzyme', reasonLabel: 'фермент',
      enzymeExplain: 'EcoRI · GAATTC · 5′-выступ AATT',
      locationCount: 3,
    };
    render(<SmartResultRow vm={enzVM} />);
    expect(screen.getByTestId('smart-result-e5-enzyme-explain').textContent).toMatch(/EcoRI · GAATTC/);
    expect(screen.getByTestId('smart-result-e5-reason').textContent).toBe('фермент');
    expect(screen.getByTestId('smart-result-e5-locations').textContent).toMatch(/3/);
  });

  it('renders the protein explanation line for an aa: hit', () => {
    const protVM = {
      ...nameVM, id: 'e4', title: 'HisFusion', nameHighlights: [],
      reason: 'protein', reasonLabel: 'белок',
      metrics: { identity: 1, length: 6 },
      metricsText: '100% совпадение белка · 6 aa',
      proteinExplain: 'glaA · обратная цепь · 117–146 aa · рамка 1 · 3 экзона · интрон исключён',
      strengthPct: 1, locationCount: 1,
    };
    render(<SmartResultRow vm={protVM} />);
    expect(screen.getByTestId('smart-result-e4-protein-explain').textContent).toMatch(/обратная цепь · 117–146 aa/);
    expect(screen.getByTestId('smart-result-e4-reason').textContent).toBe('белок');
    expect(screen.getByTestId('smart-result-e4').textContent).toMatch(/совпадение белка/);
  });

  it('renders a KIND-specific icon so a project/primer/enzyme never reads as a molecule (§10.4)', () => {
    setLang('en');
    const kinds = ['entry', 'project', 'primer', 'enzyme'];
    const titles = ['Molecule', 'Project', 'Primer', 'Enzyme'];
    const glyphs = kinds.map((refKind) => {
      cleanup();
      render(<SmartResultRow vm={{ ...nameVM, refKind }} />);
      const iconSpan = screen.getByTestId('smart-result-e1-kind-icon');
      expect(iconSpan.getAttribute('title')).toBe(titles[kinds.indexOf(refKind)]);
      return iconSpan.querySelector('svg')?.innerHTML;
    });
    glyphs.forEach((g) => expect(g).toBeTruthy());
    expect(new Set(glyphs).size).toBe(4); // four kinds → four distinct glyphs
  });

  it('a project result draws the folder glyph, not the molecule dna glyph', () => {
    render(<SmartResultRow vm={{ ...nameVM, refKind: 'project' }} />);
    const d = screen.getByTestId('smart-result-e1-kind-icon').querySelector('path')?.getAttribute('d') || '';
    expect(d).toMatch(/^M4 7\.5/); // the folder glyph
  });

  it('a lost/unknown refKind falls back to the dna glyph (never crashes)', () => {
    render(<SmartResultRow vm={{ ...nameVM, refKind: null }} />);
    const svg = screen.getByTestId('smart-result-e1-kind-icon').querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('localizes topology and the location count in English', () => {
    setLang('en');
    render(<SmartResultRow vm={{ ...seqVM, refKind: null, topology: 'linear' }} />);
    expect(screen.getByTestId('smart-result-e3-kind-icon').getAttribute('title')).toBe('linear');
    expect(screen.getByTestId('smart-result-e3-locations').textContent).toBe('3 locations ▸');
  });
});

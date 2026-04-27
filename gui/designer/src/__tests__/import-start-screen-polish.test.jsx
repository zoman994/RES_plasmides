/**
 * ImportStartScreen-Polish — closes V42 (replace-link), V8 (warnings
 * collapsible inside FileSummaryCard), V36 (file picker in empty mode),
 * dup title/ИМЯ field, and empty «Действия» dropdown.
 *
 * Coverage:
 *   - InlineEditableTitle: click → edit, Enter → commit, Esc → cancel,
 *     blur → commit.
 *   - ActionsBar Polish §6: divider + ⋯ + replace/download/delete entries;
 *     legacy Restriction/Мутагенез/Разобрать removed.
 *   - FileSummaryCard categorization helpers (isResistanceMarker,
 *     categorizeAnnotations) + collapsible warnings (V8).
 *   - InputZone V36 file picker present in empty mode.
 *   - F5 toggle: handleFileImport({ autoAnnotate: false }) returns parser
 *     features unchanged.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ActionsBar from '../components/ImportStartScreen/ActionsBar';
import InputZone from '../components/ImportStartScreen/InputZone';
import { InlineEditableTitle } from '../components/ImportStartScreen/index';
import FileSummaryCard, {
  isResistanceMarker,
  categorizeAnnotations,
} from '../components/ImportStartScreen/FileSummaryCard';
import { handleFileImport } from '../file-import';

// ────────────── §1 InlineEditableTitle ──────────────

describe('InlineEditableTitle (Polish §1)', () => {
  it('default state shows text + ✎ pen icon (hidden until hover)', () => {
    const { getByTestId, queryByTestId } = render(
      <InlineEditableTitle value="pUC19" onCommit={vi.fn()} />
    );
    expect(getByTestId('title-display').textContent).toMatch(/pUC19/);
    expect(getByTestId('title-display').textContent).toMatch(/✎/);
    expect(queryByTestId('title-input')).toBeNull();
  });

  it('click activates input, Enter commits trimmed value via onCommit', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <InlineEditableTitle value="pUC19" onCommit={onCommit} />
    );
    fireEvent.click(getByTestId('title-display'));
    const input = getByTestId('title-input');
    fireEvent.change(input, { target: { value: 'pUC19_renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('pUC19_renamed');
  });

  it('Esc cancels — onCommit not called, value reverted', () => {
    const onCommit = vi.fn();
    const { getByTestId, rerender } = render(
      <InlineEditableTitle value="pUC19" onCommit={onCommit} />
    );
    fireEvent.click(getByTestId('title-display'));
    fireEvent.change(getByTestId('title-input'), { target: { value: 'something_else' } });
    fireEvent.keyDown(getByTestId('title-input'), { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    // Re-rendered display still reads the original value.
    rerender(<InlineEditableTitle value="pUC19" onCommit={onCommit} />);
    expect(getByTestId('title-display').textContent).toMatch(/pUC19/);
  });

  it('blur commits like Enter', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <InlineEditableTitle value="pUC19" onCommit={onCommit} />
    );
    fireEvent.click(getByTestId('title-display'));
    const input = getByTestId('title-input');
    fireEvent.change(input, { target: { value: 'pUC19_blur' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('pUC19_blur');
  });
});

// ────────────── §6 ActionsBar dropdown ──────────────

describe('ActionsBar single-mode Polish §6 — divider + ⋯ + new dropdown items', () => {
  it('renders divider between destinations and Аннотировать', () => {
    const { getByTestId } = render(
      <ActionsBar mode="single" onAction={vi.fn()} count={1} hasParsedItem exportEnabled />
    );
    expect(getByTestId('action-canvas')).toBeTruthy();
    expect(getByTestId('action-library')).toBeTruthy();
    expect(getByTestId('actions-divider')).toBeTruthy();
    expect(getByTestId('action-annotate')).toBeTruthy();
  });

  it('⋯ button opens dropdown with replace / download / delete entries', () => {
    const { getByTestId, queryByTestId } = render(
      <ActionsBar mode="single" onAction={vi.fn()} count={1} hasParsedItem exportEnabled />
    );
    expect(queryByTestId('actions-secondary-popup')).toBeNull();
    fireEvent.click(getByTestId('action-secondary-toggle'));
    expect(getByTestId('actions-secondary-popup')).toBeTruthy();
    expect(getByTestId('action-replace').textContent).toMatch(/Заменить файл/);
    expect(getByTestId('action-download-gb').textContent).toMatch(/Скачать как \.gb/);
    expect(getByTestId('action-delete').textContent).toMatch(/Удалить из сессии/);
  });

  it('Replace dropdown entry fires onAction("replace")', () => {
    const onAction = vi.fn();
    const { getByTestId } = render(
      <ActionsBar mode="single" onAction={onAction} count={1} hasParsedItem exportEnabled />
    );
    fireEvent.click(getByTestId('action-secondary-toggle'));
    fireEvent.click(getByTestId('action-replace'));
    expect(onAction).toHaveBeenCalledWith('replace');
  });

  it('Удалить из сессии fires onAction("delete") (parent confirms)', () => {
    const onAction = vi.fn();
    const { getByTestId } = render(
      <ActionsBar mode="single" onAction={onAction} count={1} hasParsedItem exportEnabled />
    );
    fireEvent.click(getByTestId('action-secondary-toggle'));
    fireEvent.click(getByTestId('action-delete'));
    expect(onAction).toHaveBeenCalledWith('delete');
  });

  it('legacy Restriction/Мутагенез/Разобрать entries are gone', () => {
    const { getByTestId, container } = render(
      <ActionsBar mode="single" onAction={vi.fn()} count={1} hasParsedItem exportEnabled />
    );
    fireEvent.click(getByTestId('action-secondary-toggle'));
    expect(container.textContent).not.toMatch(/Restriction|Мутагенез|Разобрать/);
  });

  it('exportEnabled=false disables download-gb with «скоро» tooltip', () => {
    const { getByTestId } = render(
      <ActionsBar mode="single" onAction={vi.fn()} count={1} hasParsedItem exportEnabled={false} />
    );
    fireEvent.click(getByTestId('action-secondary-toggle'));
    const dlBtn = getByTestId('action-download-gb');
    expect(dlBtn.disabled).toBe(true);
    expect(dlBtn.getAttribute('title')).toMatch(/скоро/);
  });
});

// ────────────── §4 FileSummaryCard categorization ──────────────

describe('isResistanceMarker (Polish §4a)', () => {
  it('AmpR / NeoR / KanR are resistance markers', () => {
    expect(isResistanceMarker({ type: 'CDS', name: 'AmpR' })).toBe(true);
    expect(isResistanceMarker({ type: 'CDS', name: 'NeoR/KanR' })).toBe(true);
    expect(isResistanceMarker({ type: 'CDS', name: 'PuroR' })).toBe(true);
    expect(isResistanceMarker({ type: 'gene', name: 'HygR' })).toBe(true);
  });

  it('detects bla / β-lactamase by keyword', () => {
    expect(isResistanceMarker({ type: 'CDS', name: 'bla' })).toBe(true);
    expect(isResistanceMarker({ type: 'CDS', name: 'β-lactamase' })).toBe(true);
    expect(isResistanceMarker({ type: 'CDS', name: 'beta-lactamase' })).toBe(false);
  });

  it('rejects Cas9 / dCas9 / mCherry / unrelated CDS names', () => {
    expect(isResistanceMarker({ type: 'CDS', name: 'dCas9' })).toBe(false);
    expect(isResistanceMarker({ type: 'CDS', name: 'mCherry' })).toBe(false);
    expect(isResistanceMarker({ type: 'CDS', name: 'lacZα' })).toBe(false);
  });

  it('rejects non-CDS types even with matching name', () => {
    expect(isResistanceMarker({ type: 'misc_feature', name: 'AmpR' })).toBe(false);
    expect(isResistanceMarker(null)).toBe(false);
    expect(isResistanceMarker({})).toBe(false);
  });
});

describe('categorizeAnnotations (Polish §4a)', () => {
  it('partitions regions into selection/promoters/origins/tags + leaves remaining', () => {
    const regions = [
      { id: '1', type: 'CDS', name: 'AmpR', start: 0, end: 800 },
      { id: '2', type: 'promoter', name: 'lac', start: 0, end: 100 },
      { id: '3', type: 'rep_origin', name: 'pUC ori', start: 0, end: 600 },
      { id: '4', type: 'CDS', name: 'EGFP', start: 0, end: 700 },     // tag by name
      { id: '5', type: 'CDS', name: 'lacZα', start: 0, end: 360 },    // remaining CDS
      { id: '6', type: 'CDS', name: 'dCas9', start: 0, end: 4000 },   // remaining CDS
    ];
    const cats = categorizeAnnotations(regions);
    expect(cats.selection.map((r) => r.name)).toEqual(['AmpR']);
    expect(cats.promoters.map((r) => r.name)).toEqual(['lac']);
    expect(cats.origins.map((r) => r.name)).toEqual(['pUC ori']);
    expect(cats.tags.map((r) => r.name)).toEqual(['EGFP']);
    expect(cats.usedIds).toEqual(new Set(['1', '2', '3', '4']));
  });

  it('hides empty categories from FileSummaryCard render', () => {
    const onlyResist = [
      { id: '1', type: 'CDS', name: 'AmpR', start: 0, end: 800, level: 'region' },
    ];
    const { queryByTestId } = render(
      <FileSummaryCard parsedItem={{ annotations: onlyResist, sequence: 'A'.repeat(1000), topology: 'circular' }} />
    );
    expect(queryByTestId('cat-selection')).toBeTruthy();
    expect(queryByTestId('cat-promoters')).toBeNull();
    expect(queryByTestId('cat-origins')).toBeNull();
    expect(queryByTestId('cat-tags')).toBeNull();
  });

  it('CDS-list excludes regions already in categories + shows overflow line', () => {
    const many = [
      { id: 'r0', type: 'CDS', name: 'AmpR', start: 0, end: 800, level: 'region' },
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `c${i}`, type: 'CDS', name: `cdsX${i}`, start: i * 100, end: i * 100 + 50, level: 'region',
      })),
    ];
    const { getByTestId } = render(
      <FileSummaryCard parsedItem={{ annotations: many, sequence: 'A'.repeat(2000), topology: 'circular' }} />
    );
    const cdsBlock = getByTestId('file-summary-cds-list');
    // 7 remaining CDS (AmpR is in Селекция); only 5 shown in body, +overflow row.
    expect(cdsBlock.textContent).not.toMatch(/AmpR/);
    expect(getByTestId('cds-overflow').textContent).toMatch(/…ещё 2 CDS/);
  });
});

// ────────────── (d) Warnings collapsible (V8) ──────────────

describe('FileSummaryCard collapsible warnings (V8)', () => {
  it('default state collapsed; click toggles expansion', () => {
    const { getByTestId, queryByTestId } = render(
      <FileSummaryCard parsedItem={{
        annotations: [{ id: '1', type: 'CDS', name: 'AmpR', start: 0, end: 800, level: 'region' }],
        sequence: 'A'.repeat(1000),
        topology: 'circular',
        warnings: ['no ATG', 'no stop'],
      }} />
    );
    expect(queryByTestId('warnings-list')).toBeNull();
    fireEvent.click(getByTestId('warnings-toggle'));
    expect(getByTestId('warnings-list').textContent).toMatch(/no ATG/);
    fireEvent.click(getByTestId('warnings-toggle'));
    expect(queryByTestId('warnings-list')).toBeNull();
  });
});

// ────────────── §3 / V36 InputZone empty mode file picker ──────────────

// ────────────── §7 / F5 handleFileImport autoAnnotate gate ──────────────

const TINY_GB = `LOCUS       seq                    240 bp ds-DNA     linear   SYN 01-JAN-2026
FEATURES             Location/Qualifiers
     CDS             1..120
                     /label="featureA"
     CDS             130..200
                     /label="featureB"
     misc_feature    210..240
                     /label="featureC"
ORIGIN
        1 atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc
       61 atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc
      121 atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc
      181 atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc
//
`;

function makeFile(content, name = 'tiny.gb') {
  // jsdom File ctor is fine; sequenceUtils relies on .text() which the polyfill provides.
  return new File([content], name, { type: 'text/plain' });
}

describe('handleFileImport F5 autoAnnotate gate', () => {
  it('autoAnnotate: false → parsed features pass through unchanged (no enrichment)', async () => {
    const f = makeFile(TINY_GB);
    const result = await handleFileImport(f, { autoAnnotate: false });
    // Only region-level annotations from parser features (3) + maybe details
    // from auto-annotate; with the gate OFF, nothing is added.
    expect(result.annotations.length).toBe(3);
    const names = result.annotations.map((a) => a.name).sort();
    expect(names).toEqual(['featureA', 'featureB', 'featureC']);
  });

  it('autoAnnotate: true (default) → enrichment runs (count >= parsed features)', async () => {
    const f = makeFile(TINY_GB);
    const result = await handleFileImport(f);
    // Enrichment may add details / common-features; never removes parser features.
    expect(result.annotations.length).toBeGreaterThanOrEqual(3);
  });
});

describe('InputZone empty mode V36 file picker', () => {
  it('renders a hidden <input type=file> + clickable dropzone', () => {
    const onFiles = vi.fn();
    const { getByTestId } = render(
      <InputZone mode="empty" onFiles={onFiles} onPasteText={vi.fn()} />
    );
    const picker = getByTestId('input-zone-file-picker');
    expect(picker.tagName).toBe('INPUT');
    expect(picker.type).toBe('file');
    expect(picker.multiple).toBe(true);
    expect(getByTestId('input-zone-clickable')).toBeTruthy();
  });

  it('selecting a file via picker invokes onFiles', () => {
    const onFiles = vi.fn();
    const { getByTestId } = render(
      <InputZone mode="empty" onFiles={onFiles} onPasteText={vi.fn()} />
    );
    const file = new File(['LOCUS x'], 'pUC19.gb', { type: 'text/plain' });
    fireEvent.change(getByTestId('input-zone-file-picker'), { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0][0].name).toBe('pUC19.gb');
  });
});

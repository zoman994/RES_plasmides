/**
 * pre-import-modal.test.jsx — Sprint M-X.3 K1 coverage.
 *
 * Modal that sits between an Importer entry-point (paste / drop /
 * catalog click) and the Inspector. Captures name + topology + tags
 * + folder + annotate-now toggle, and (in K2) an existing-annotations
 * keep/discard radio. K1 covers the paste path only — single envelope
 * with `kind: 'paste'`, `hasAnnotations: false`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PreImportModal from '../PreImportModal';

afterEach(cleanup);

const PASTE_ENVELOPE = {
  kind: 'paste',
  parsedItem: {
    name: 'pasted',
    sequence: 'ATGC'.repeat(80),
    length: 320,
    topology: 'linear',
    annotations: [],
    _fileName: 'paste-1.txt',
    _source: 'paste',
  },
  suggestedName: 'pasted',
  defaultTopology: 'linear',
  hasAnnotations: false,
  source: 'paste',
};

describe('PreImportModal — K1 paste path', () => {
  it('renders nothing when pendingImport is null', () => {
    const { container } = render(
      <PreImportModal pendingImport={null} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with name input pre-filled and topology defaulted', () => {
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByTestId('pre-import-modal')).toBeTruthy();
    const nameInput = screen.getByTestId('pre-import-name');
    expect(nameInput.value).toBe('pasted');
    // Topology buttons reflect default 'linear'
    const linearBtn = screen.getByTestId('pre-import-topology-linear');
    expect(linearBtn.getAttribute('data-active')).toBe('true');
  });

  it('Enter in name input submits with current form values', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={onConfirm} onCancel={() => {}} />
    );
    const nameInput = screen.getByTestId('pre-import-name');
    fireEvent.change(nameInput, { target: { value: 'pTest' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const meta = onConfirm.mock.calls[0][0];
    expect(meta.name).toBe('pTest');
    expect(meta.topology).toBe('linear');
    expect(meta.annotateNow).toBe(true);
  });

  it('topology toggle switches active button and is reflected in submit meta', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={onConfirm} onCancel={() => {}} />
    );
    fireEvent.click(screen.getByTestId('pre-import-topology-circular'));
    expect(screen.getByTestId('pre-import-topology-circular').getAttribute('data-active')).toBe('true');
    fireEvent.click(screen.getByTestId('pre-import-submit'));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ topology: 'circular' }));
  });

  it('annotate-now checkbox flips the annotateNow flag in submit meta', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={onConfirm} onCancel={() => {}} />
    );
    const cb = screen.getByTestId('pre-import-annotate-now');
    expect(cb.checked).toBe(true); // default ON
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
    fireEvent.click(screen.getByTestId('pre-import-submit'));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ annotateNow: false }));
  });

  it('Cancel button calls onCancel; submit not fired', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={onConfirm} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByTestId('pre-import-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Escape key calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={() => {}} onCancel={onCancel} />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does NOT show existing-annotations radio when hasAnnotations=false (K1 paste)', () => {
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.queryByTestId('pre-import-existing-anns')).toBeNull();
  });

  it('submit sends keepExistingAnnotations=true by default (no-op when hasAnnotations=false)', () => {
    const onConfirm = vi.fn();
    render(
      <PreImportModal pendingImport={PASTE_ENVELOPE} onConfirm={onConfirm} onCancel={() => {}} />
    );
    fireEvent.click(screen.getByTestId('pre-import-submit'));
    const meta = onConfirm.mock.calls[0][0];
    // K1 default: keep existing (only relevant when hasAnnotations=true,
    // but we still emit the flag so K2's commit path stays consistent).
    expect(meta.keepExistingAnnotations).toBe(true);
  });
});

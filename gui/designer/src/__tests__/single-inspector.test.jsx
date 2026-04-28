/**
 * Sprint IS-Final K1 — SingleInspector extracted from ImportStartScreen.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import SingleInspector from '../components/ImportStartScreen/SingleInspector';

const baseItem = {
  name: 'pUC19',
  sequence: 'A'.repeat(2686),
  length: 2686,
  topology: 'circular',
  annotations: [
    { id: 'r1', start: 100, end: 460, level: 'region', type: 'CDS', name: 'lacZα' },
  ],
};

const baseProps = {
  parsedItem: baseItem,
  topology: 'circular',
  onTopologyChange: vi.fn(),
  originOffset: 1,
  onOriginOffsetChange: vi.fn(),
  onApplyOrigin: vi.fn(),
  originHints: '',
  name: 'pUC19',
  onNameChange: vi.fn(),
  sanitizeReport: null,
  lastActionStatus: null,
  addedItems: [],
  onAction: vi.fn(),
  onCloseSession: vi.fn(),
  exportEnabled: true,
  hasParsedItem: true,
};

describe('SingleInspector', () => {
  it('renders title + mini-map + FileSummaryCard categories when parsedItem is valid', () => {
    const { getByTestId } = render(<SingleInspector {...baseProps} />);
    expect(getByTestId('single-title-row')).toBeTruthy();
    expect(getByTestId('file-summary-card')).toBeTruthy();
  });

  it('returns null when parsedItem is missing', () => {
    const { container } = render(<SingleInspector {...baseProps} parsedItem={null} hasParsedItem={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('onAction propagates from ActionsBar (canvas / library / replace)', () => {
    const onAction = vi.fn();
    const { getByTestId } = render(<SingleInspector {...baseProps} onAction={onAction} />);
    fireEvent.click(getByTestId('action-canvas'));
    expect(onAction).toHaveBeenCalledWith('canvas');
    fireEvent.click(getByTestId('action-library'));
    expect(onAction).toHaveBeenCalledWith('library');
  });

  // Игорь 28.04.2026 — _source/_annotatedInSession determines visibility of
  // the «В библиотеку» button.
  it('catalog item (NOT yet annotated) hides «В библиотеку» button', () => {
    const { queryByTestId } = render(
      <SingleInspector {...baseProps} parsedItem={{ ...baseItem, _source: 'catalog' }} />
    );
    expect(queryByTestId('action-library')).toBeNull();
  });

  it('catalog item AFTER annotate (_annotatedInSession) shows «В библиотеку» again', () => {
    const { getByTestId } = render(
      <SingleInspector
        {...baseProps}
        parsedItem={{ ...baseItem, _source: 'catalog', _annotatedInSession: true }}
      />
    );
    expect(getByTestId('action-library')).toBeTruthy();
  });

  it('catalog item with topology flipped from circular → linear shows «В библиотеку»', () => {
    const { getByTestId } = render(
      <SingleInspector
        {...baseProps}
        parsedItem={{ ...baseItem, _source: 'catalog' }}
        topology="linear"
      />
    );
    expect(getByTestId('action-library')).toBeTruthy();
  });

  it('paste-text item shows «В библиотеку» button (not in library yet)', () => {
    const { getByTestId } = render(
      <SingleInspector {...baseProps} parsedItem={{ ...baseItem, _source: 'paste' }} />
    );
    expect(getByTestId('action-library')).toBeTruthy();
  });

  it('file-import item shows «В библиотеку» button', () => {
    const { getByTestId } = render(
      <SingleInspector {...baseProps} parsedItem={{ ...baseItem, _source: 'file' }} />
    );
    expect(getByTestId('action-library')).toBeTruthy();
  });
});

/**
 * multi-import-view-preview.test.jsx — M-X.6 K12.3 (TD-LIB-K4-VIEW-PREVIEW).
 * Tests the eye-icon button that toggles a 180×180 PlasmidMiniMap
 * inline below the row.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import MultiImportView from '../MultiImportView';

vi.mock('../../../../file-import', () => ({
  parseFile: vi.fn(async (file) => ({
    name: file.name.replace(/\.\w+$/, ''),
    sequence: 'ATGC'.repeat(50),
    length: 200,
    topology: 'circular',
    annotations: [{ id: 'cds-1', start: 10, end: 50, type: 'CDS', name: 'demo' }],
    description: 'Demo plasmid description',
  })),
}));

vi.mock('../../../PlasmidMiniMap', () => ({
  default: ({ name, size }) => (
    <div data-testid={`mini-map-${name}`} data-size={size}>map</div>
  ),
}));

afterEach(cleanup);

function makeFile(name) {
  const blob = new Blob(['ATGC'], { type: 'text/plain' });
  return new File([blob], name, { type: 'text/plain' });
}

describe('MultiImportView — K12.3 view preview', () => {
  it('eye button toggles inline PlasmidMiniMap', async () => {
    const files = [makeFile('demo.gb')];
    render(<MultiImportView files={files} onCancel={() => {}} onComplete={() => {}} />);
    // Wait for parse to settle.
    await waitFor(() => {
      expect(screen.queryByTestId('multi-import-row-demo.gb')).toBeTruthy();
    });
    // Initially closed.
    expect(screen.queryByTestId('multi-import-row-preview-pane-demo.gb')).toBeNull();
    const btn = screen.getByTestId('multi-import-row-preview-demo.gb');
    fireEvent.click(btn);
    // Pane appears.
    await waitFor(() => {
      expect(screen.queryByTestId('multi-import-row-preview-pane-demo.gb')).toBeTruthy();
    });
    expect(screen.queryByTestId('mini-map-demo')).toBeTruthy();
    // Click again → close.
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.queryByTestId('multi-import-row-preview-pane-demo.gb')).toBeNull();
    });
  });
});

/**
 * K10 — ExportProjectModal UI (lib filters tested separately in
 * bodge-export-profiles.test.js).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportProjectModal from '../ExportProjectModal';

const STATE = {
  projectMeta: { id: 'p01', name: 'pks4 study' },
  containers: [{ id: 'c01', name: 'pET', sequence: 'A'.repeat(5000) }],
  zones: [
    { id: 'zn01', name: 'pks4-ko' },
    { id: 'zn02', name: 'pks4-rescue' },
  ],
  primers: [{ id: 'pp01', sequence: 'ATGC' }],
  libraryEntries: [{ id: 'le01' }],
  notebookEntries: [],
  attachmentsManifest: {},
};

describe('K10 — ExportProjectModal', () => {
  it('renders profile select with all 5 options', () => {
    render(<ExportProjectModal state={STATE} zones={STATE.zones} onExport={vi.fn()} onCancel={vi.fn()} />);
    const select = screen.getByTestId('export-profile-select');
    const options = Array.from(select.options).map(o => o.value);
    expect(options.sort()).toEqual(['containers-bundle', 'custom', 'full', 'public-supp', 'single-assembly']);
  });

  it('shows summary counts (containers / assemblies / primers / library)', () => {
    render(<ExportProjectModal state={STATE} zones={STATE.zones} onExport={vi.fn()} onCancel={vi.fn()} />);
    const summary = screen.getByTestId('export-summary');
    expect(summary.textContent).toMatch(/1 containers/);
    expect(summary.textContent).toMatch(/2 assemblies/);
    expect(summary.textContent).toMatch(/1 primers/);
    expect(summary.textContent).toMatch(/1 library entries/);
  });

  it('reveals assembly select when single-assembly profile chosen', () => {
    render(<ExportProjectModal state={STATE} zones={STATE.zones} onExport={vi.fn()} onCancel={vi.fn()} />);
    const select = screen.getByTestId('export-profile-select');
    fireEvent.change(select, { target: { value: 'single-assembly' } });
    expect(screen.getByTestId('export-assembly-select')).toBeTruthy();
  });

  it('reveals checkbox matrix when custom profile chosen', () => {
    render(<ExportProjectModal state={STATE} zones={STATE.zones} onExport={vi.fn()} onCancel={vi.fn()} />);
    const select = screen.getByTestId('export-profile-select');
    fireEvent.change(select, { target: { value: 'custom' } });
    expect(screen.getByTestId('export-custom-checkboxes')).toBeTruthy();
    expect(screen.getByTestId('export-section-containers')).toBeTruthy();
    expect(screen.getByTestId('export-strip-telemetry')).toBeTruthy();
  });

  it('calls onExport with chosen profile name', () => {
    const onExport = vi.fn();
    render(<ExportProjectModal state={STATE} zones={STATE.zones} onExport={onExport} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId('export-confirm'));
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ profileName: 'full' }));
  });

  it('calls onExport with singleAssemblyZoneId when single-assembly selected', () => {
    const onExport = vi.fn();
    render(<ExportProjectModal state={STATE} zones={STATE.zones} onExport={onExport} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByTestId('export-profile-select'), { target: { value: 'single-assembly' } });
    fireEvent.change(screen.getByTestId('export-assembly-select'), { target: { value: 'zn02' } });
    fireEvent.click(screen.getByTestId('export-confirm'));
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({
      profileName: 'single-assembly',
      singleAssemblyZoneId: 'zn02',
    }));
  });

  it('calls onExport with customSections when custom selected', () => {
    const onExport = vi.fn();
    render(<ExportProjectModal state={STATE} zones={STATE.zones} onExport={onExport} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByTestId('export-profile-select'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByTestId('export-section-notebookAttachments')); // uncheck
    fireEvent.click(screen.getByTestId('export-strip-telemetry'));
    fireEvent.click(screen.getByTestId('export-confirm'));
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({
      profileName: 'custom',
      customSections: expect.objectContaining({
        notebookAttachments: false,
        containers: true,
        stripTelemetry: true,
      }),
    }));
  });

  it('Cancel button calls onCancel', () => {
    const onCancel = vi.fn();
    render(<ExportProjectModal state={STATE} zones={STATE.zones} onExport={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('export-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('Esc key calls onCancel', () => {
    const onCancel = vi.fn();
    render(<ExportProjectModal state={STATE} zones={STATE.zones} onExport={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});

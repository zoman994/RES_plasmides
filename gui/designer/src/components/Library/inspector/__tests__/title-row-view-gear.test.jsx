import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LibraryInspectorTitleRow from '../LibraryInspectorTitleRow';

afterEach(cleanup);

const base = {
  item: { name: 'pPICZ_CBHI' },
  length: 5486,
  topology: 'circular',
  regionCount: 0,
  onRenameItem: () => {},
  seqSettingsOpen: false,
};

describe('LibraryInspectorTitleRow — ⚙ «Вид» всегда в шапке (фаза 3)', () => {
  it('на вкладке Sequence — gear активен и кликается', () => {
    const toggle = vi.fn();
    render(<LibraryInspectorTitleRow {...base} activeTab="sequence" onToggleSeqSettings={toggle} />);
    const gear = screen.getByTestId('importer-sequence-view-settings-trigger');
    expect(gear.getAttribute('data-gear-active')).toBe('true');
    fireEvent.click(gear);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('на вкладке Overview — gear ВИДЕН, но disabled (клик не открывает)', () => {
    const toggle = vi.fn();
    render(<LibraryInspectorTitleRow {...base} activeTab="overview" onToggleSeqSettings={toggle} />);
    const gear = screen.getByTestId('importer-sequence-view-settings-trigger');
    expect(gear).toBeTruthy();
    expect(gear.getAttribute('data-gear-active')).toBe('false');
    expect(gear.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(gear);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('на вкладке Annotations — gear виден (не прыгает между вкладками)', () => {
    render(<LibraryInspectorTitleRow {...base} activeTab="annotations" onToggleSeqSettings={() => {}} />);
    expect(screen.getByTestId('importer-sequence-view-settings-trigger')).toBeTruthy();
  });
});

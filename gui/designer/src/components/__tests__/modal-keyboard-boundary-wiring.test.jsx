import 'fake-indexeddb/auto';
import React from 'react';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  act, cleanup, render, screen,
} from '@testing-library/react';
import { bootstrapStore, useStore } from '../../store';
import PromptModal from '../PromptModal';
import SettingsModal from '../SettingsModal';
import ProjectInfoModal from '../ProjectInfoModal';
import HotkeyCheatsheet from '../HotkeyCheatsheet';
import RangePickerModal from '../CanvasSkeleton/editor/assembly-mode/RangePickerModal';
import MutationModal from '../CanvasSkeleton/editor/assembly-mode/MutationModal';
import CircularizeModal from '../CanvasSkeleton/editor/assembly-mode/CircularizeModal';
import OpGroupPicker from '../CanvasSkeleton/editor/assembly-mode/OpGroupPicker';
import AAMutationDialog from '../CanvasSkeleton/editor/assembly-mode/AAMutationDialog';
import DigestFragmentPicker from '../CanvasSkeleton/editor/assembly-mode/DigestFragmentPicker';

const SOURCE = {
  name: 'modal source',
  sequence: `GAATTC${'A'.repeat(20)}GAATTC${'A'.repeat(20)}GAATTC${'A'.repeat(20)}`,
  circular: true,
  annotations: [],
};

function expectBoundary(testId) {
  const root = screen.getByTestId(testId);
  expect(root.getAttribute('data-modal-open')).toBe('');
  expect(root.getAttribute('data-block-global-hotkeys')).toBe('true');
}

beforeEach(() => {
  bootstrapStore();
  useStore.setState((state) => {
    state.prompt = null;
    state.projects = {};
    state.currentProjectId = null;
    state.modals = { settings: false, projectInfo: false };
  });
});

afterEach(() => {
  cleanup();
  useStore.setState((state) => {
    state.prompt = null;
    state.projects = {};
    state.currentProjectId = null;
    state.modals = { settings: false, projectInfo: false };
  });
});

describe('ASM-6A modal boundary wiring', () => {
  it('marks every in-scope assembly modal root', () => {
    render(<RangePickerModal source={SOURCE} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expectBoundary('range-picker-modal');
    cleanup();

    render(<MutationModal sourceName="x" sequence="ACGT" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expectBoundary('mutation-modal');
    cleanup();

    render(<CircularizeModal draft={{ segments: [{ id: 's1' }] }} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expectBoundary('circularize-modal');
    cleanup();

    render(<OpGroupPicker pieceIds={['p1', 'p2']} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expectBoundary('op-group-picker-modal');
    cleanup();

    render(
      <AAMutationDialog
        selection={{ aa: 'A', codon: 'GCT', aaIndex: 0 }}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expectBoundary('aa-mutation-dialog');
    cleanup();

    render(
      <DigestFragmentPicker
        source={SOURCE}
        enzymes={['EcoRI']}
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expectBoundary('digest-fragment-picker');
  });

  it('marks every in-scope app-level modal root', () => {
    useStore.setState((state) => {
      state.prompt = { title: 'Rename', defaultValue: '', multiline: false };
    });
    render(<PromptModal />);
    expectBoundary('prompt-modal');
    cleanup();

    render(<SettingsModal />);
    expectBoundary('settings-modal-backdrop');
    cleanup();

    useStore.setState((state) => {
      state.projects = {
        'modal-project': {
          id: 'modal-project', name: 'Modal project', description: '', tags: [],
        },
      };
      state.currentProjectId = 'modal-project';
      state.modals.projectInfo = true;
    });
    render(<ProjectInfoModal />);
    expectBoundary('project-info-modal-backdrop');
    cleanup();

    render(<HotkeyCheatsheet open onClose={vi.fn()} />);
    expectBoundary('hotkey-cheatsheet-backdrop');
  });

  it('Escape closes only the nested digest picker and leaves RangePicker open', () => {
    const cancelRange = vi.fn();
    render(<RangePickerModal source={SOURCE} onConfirm={vi.fn()} onCancel={cancelRange} />);
    act(() => {
      window.dispatchEvent(new CustomEvent('__v88_re_click__', {
        detail: { enzyme: 'EcoRI', position: 1 },
      }));
    });
    act(() => { screen.getByTestId('range-picker-confirm').click(); });
    expect(screen.getByTestId('digest-fragment-picker')).toBeTruthy();

    act(() => {
      screen.getByTestId('digest-fragment-picker').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    expect(screen.queryByTestId('digest-fragment-picker')).toBeNull();
    expect(screen.getByTestId('range-picker-modal')).toBeTruthy();
    expect(cancelRange).not.toHaveBeenCalled();
  });
});

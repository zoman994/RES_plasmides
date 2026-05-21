/**
 * V86 — copy-fix empty state. SegmentList footer hint обещал кнопку
 * «+ Плазмида», которой нет (после AE-K2 toolbar в empty-режиме
 * показывает только Undo/Redo, а + Плазмида = библиотечный список
 * в EmptyAssemblyLibrary, не кнопка). Текст приведён в соответствие.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions,
} from '../../../store/skeleton-context';
import EditorWindowShell from '../../EditorWindowShell';
import { bootstrapStore } from '../../../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
function H() { A = useSkeletonActions(); return null; }

function openEmptyAssembly() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => { A.createAssemblyDraft({ id: 'asm-v86', name: 'V86' }); });
  act(() => { A.openEditorAssemblyTab('asm-v86'); });
}

describe('V86 — SegmentList empty hint copy', () => {
  it('mentions «+ Плазмида — выбор из списка выше» (not as a button)', () => {
    openEmptyAssembly();
    // SegmentList renders below the editor; empty assembly => hint visible.
    const hintCandidates = screen.queryAllByText(/Сегментов нет/);
    expect(hintCandidates.length).toBeGreaterThan(0);
    const text = hintCandidates[0].textContent;
    expect(text).toMatch(/Плазмида.*выбор из списка выше/);
  });

  it('lists + Обвес / + Синтез / + Gap as bottom buttons', () => {
    openEmptyAssembly();
    const text = screen.getAllByText(/Сегментов нет/)[0].textContent;
    expect(text).toMatch(/кнопки:.*\+ Обвес.*\+ Синтез.*\+ Gap/);
  });

  it('does NOT promise + Плазмида as a button anymore', () => {
    openEmptyAssembly();
    const text = screen.getAllByText(/Сегментов нет/)[0].textContent;
    // The old wording «кнопки внизу: + Плазмида / + Обвес …» promised
    // a button that doesn't exist. New copy must not list + Плазмида
    // inside the «кнопки:» segment.
    const buttonsSegment = text.match(/кнопки:[^.]*\./);
    expect(buttonsSegment).toBeTruthy();
    expect(buttonsSegment[0]).not.toMatch(/\+\s*Плазмида/);
  });
});

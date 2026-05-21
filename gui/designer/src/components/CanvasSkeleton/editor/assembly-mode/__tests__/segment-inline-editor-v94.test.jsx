/**
 * V93 + V94 — SegmentList rows получают inline-editor (chevron expand)
 * взамен отдельной правой колонки SegmentDetailPanel. Поглощает V93:
 * цветовая легенда из «Палитры» убрана, цвет меняется кликом по
 * color-swatch в строке.
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach,
} from 'vitest';
import {
  render, screen, cleanup, act, fireEvent, within,
} from '@testing-library/react';
import {
  SkeletonProvider, useSkeletonActions, useSkeletonState,
} from '../../../store/skeleton-context';
import EditorWindowShell from '../../EditorWindowShell';
import { bootstrapStore } from '../../../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

let A = null;
let S = null;
function H() { A = useSkeletonActions(); S = useSkeletonState(); return null; }

function openAssemblyWithSegment() {
  render(<SkeletonProvider><H /><EditorWindowShell /></SkeletonProvider>);
  act(() => {
    A.zoneDispatch({
      type: 'CREATE_ZONE',
      zone: { name: 'V94z', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
  });
  const zid = S.zones[S.zones.length - 1].id;
  act(() => { A.openEditorAssemblyTab(zid); });
  act(() => { A.insertManualSegment(zid, { gapKind: 'unknown', length: 12 }, undefined); });
  return zid;
}

describe('V93+V94 — segment inline editor + Палитра без color legend', () => {
  it('каждая строка имеет expand-chevron', () => {
    openAssemblyWithSegment();
    const row = screen.getAllByTestId('assembly-segment-row')[0];
    const segId = row.getAttribute('data-segment-id');
    expect(within(row).getByTestId(`segment-row-expand-${segId}`)).toBeTruthy();
  });

  it('chevron клик раскрывает inline-editor (range / RC / color / label / delete)', () => {
    openAssemblyWithSegment();
    const row = screen.getAllByTestId('assembly-segment-row')[0];
    const segId = row.getAttribute('data-segment-id');
    act(() => { fireEvent.click(screen.getByTestId(`segment-row-expand-${segId}`)); });
    const editor = screen.getByTestId(`segment-row-inline-editor-${segId}`);
    expect(within(editor).getByTestId(`segment-inline-rc-${segId}`)).toBeTruthy();
    expect(within(editor).getByTestId(`segment-inline-label-${segId}`)).toBeTruthy();
    expect(within(editor).getByTestId(`segment-inline-color-${segId}`)).toBeTruthy();
    expect(within(editor).getByTestId(`segment-inline-apply-${segId}`)).toBeTruthy();
  });

  it('повторный клик chevron сворачивает inline-editor', () => {
    openAssemblyWithSegment();
    const row = screen.getAllByTestId('assembly-segment-row')[0];
    const segId = row.getAttribute('data-segment-id');
    act(() => { fireEvent.click(screen.getByTestId(`segment-row-expand-${segId}`)); });
    expect(screen.getByTestId(`segment-row-inline-editor-${segId}`)).toBeTruthy();
    act(() => { fireEvent.click(screen.getByTestId(`segment-row-expand-${segId}`)); });
    expect(screen.queryByTestId(`segment-row-inline-editor-${segId}`)).toBeNull();
  });

  it('inline editor → label change → Apply применяет', () => {
    openAssemblyWithSegment();
    const row = screen.getAllByTestId('assembly-segment-row')[0];
    const segId = row.getAttribute('data-segment-id');
    act(() => { fireEvent.click(screen.getByTestId(`segment-row-expand-${segId}`)); });
    const labelInput = screen.getByTestId(`segment-inline-label-${segId}`);
    act(() => { fireEvent.change(labelInput, { target: { value: 'my-label' } }); });
    act(() => { fireEvent.click(screen.getByTestId(`segment-inline-apply-${segId}`)); });
    const draft = (S.assemblyDrafts || []).find((d) => d.segments?.some((s) => s.id === segId));
    const zoneSeg = S.pieces.find((p) => p.id === segId);
    // Zone-mode сегмент в pieces (поле `name`); legacy — в assemblyDrafts
    // (поле `label`). Адаптер `updateSegment({label})` пишет в `name`
    // для zone-pieces — DRY с piece-model.
    const seg = zoneSeg || (draft && draft.segments.find((s) => s.id === segId));
    expect(seg.name || seg.label).toBe('my-label');
  });

  it('SegmentDetailPanel НЕ рендерится как боковая колонка', () => {
    openAssemblyWithSegment();
    // Click row → раньше открывал SegmentDetailPanel. Теперь inline.
    act(() => { fireEvent.click(screen.getAllByTestId('assembly-segment-row')[0]); });
    expect(screen.queryByTestId('segment-detail-panel')).toBeNull();
  });

  it('AssemblyHeader «Палитра» больше не показывает color legend', () => {
    openAssemblyWithSegment();
    const paletteBtn = screen.getByTestId('assembly-palette-legend-toggle');
    act(() => { fireEvent.click(paletteBtn); });
    // V93 — color legend dropdown снят. Управление цветом — через
    // swatch в строке «Источник».
    expect(screen.queryByTestId('assembly-palette-legend')).toBeNull();
  });
});

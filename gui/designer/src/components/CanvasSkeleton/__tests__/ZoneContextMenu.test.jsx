/**
 * ZoneContextMenu.test.jsx — T4 K4. Right-click popover: 7 actions
 * dispatch + close; destructive confirm on delete; Esc / click-outside.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ZoneContextMenu from '../canvas/ZoneContextMenu';
import { useStore } from '../../../store';

afterEach(cleanup);

const state = {
  zones: [
    { id: 'zn-1', name: 'A', collapsed: false, bounds: { x: 0, y: 0, width: 300, height: 200 } },
    { id: 'zn-2', name: 'B', collapsed: false, bounds: { x: 0, y: 0, width: 300, height: 200 } },
  ],
  containers: [{ id: 'c1', zoneId: null }],
  pieces: [], operations: [],
};

function setup(over = {}) {
  const dispatch = vi.fn();
  const onClose = vi.fn();
  render(
    <ZoneContextMenu
      zoneId="zn-1" x={50} y={60}
      state={state} dispatch={dispatch} onClose={onClose} {...over}
    />,
  );
  return { dispatch, onClose };
}

describe('T4 K4 ZoneContextMenu', () => {
  it('renders the action items', () => {
    setup();
    expect(screen.getByTestId('zone-menu')).toBeTruthy();
    expect(screen.getByText('Свернуть')).toBeTruthy();
    expect(screen.getByText('Удалить зону')).toBeTruthy();
    expect(screen.getByText('Объединить с...')).toBeTruthy();
    expect(screen.getByText('Подогнать под узлы')).toBeTruthy();
    expect(screen.getByText('Обернуть бесхозные узлы')).toBeTruthy();
  });

  it('Открыть сборку → OPEN_EDITOR_ASSEMBLY_TAB + onClose', () => {
    const { dispatch, onClose } = setup();
    fireEvent.click(screen.getByTestId('zone-menu-open-assembly'));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OPEN_EDITOR_ASSEMBLY_TAB', draftId: 'zn-1' }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('collapse → SET_ZONE_COLLAPSED + onClose', () => {
    const { dispatch, onClose } = setup();
    fireEvent.click(screen.getByText('Свернуть'));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_ZONE_COLLAPSED', zoneId: 'zn-1', collapsed: true }));
    expect(onClose).toHaveBeenCalled();
  });

  it('delete cancelled → no dispatch', () => {
    const orig = window.confirm;
    window.confirm = vi.fn(() => false);
    const { dispatch } = setup();
    fireEvent.click(screen.getByText('Удалить зону'));
    expect(dispatch).not.toHaveBeenCalled();
    window.confirm = orig;
  });

  it('delete confirmed → REMOVE_ZONE', () => {
    const orig = window.confirm;
    window.confirm = vi.fn(() => true);
    const { dispatch } = setup();
    fireEvent.click(screen.getByText('Удалить зону'));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'REMOVE_ZONE', zoneId: 'zn-1' }));
    window.confirm = orig;
  });

  it('fitToNodes → RECOMPUTE_ZONE_BOUNDS; wrapLoose → WRAP_LOOSE_NODES_IN_ZONE', () => {
    const { dispatch } = setup();
    fireEvent.click(screen.getByText('Подогнать под узлы'));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'RECOMPUTE_ZONE_BOUNDS', zoneId: 'zn-1' }));
    fireEvent.click(screen.getByText('Обернуть бесхозные узлы'));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'WRAP_LOOSE_NODES_IN_ZONE' }));
  });

  it('merge submenu → choosing another zone dispatches MERGE_ZONES', () => {
    const { dispatch } = setup();
    fireEvent.click(screen.getByText('Объединить с...'));
    fireEvent.click(screen.getByTestId('zone-merge-target-zn-2'));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'MERGE_ZONES', zoneIds: ['zn-1', 'zn-2'],
    }));
  });

  it('rename → UPDATE_ZONE_NAME via in-app prompt', async () => {
    // Electron-safe prompt: stub the store's requestPrompt to resolve a name.
    useStore.setState((s) => { s.requestPrompt = async () => 'Renamed'; });
    const { dispatch } = setup();
    fireEvent.click(screen.getByText('Переименовать'));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'UPDATE_ZONE_NAME', zoneId: 'zn-1', name: 'Renamed' })));
  });

  it('Esc calls onClose', () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('click-outside calls onClose', () => {
    const { onClose } = setup();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});

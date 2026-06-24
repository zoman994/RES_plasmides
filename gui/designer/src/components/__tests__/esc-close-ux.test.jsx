/**
 * esc-close-ux.test.jsx — ui-interactions convention A: a modal MUST close on
 * Escape (not only backdrop-click / an explicit button). The UX audit found
 * several modals with backdrop-close but no Esc handler; this covers the fix
 * for the ones mountable in isolation.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, cleanup, fireEvent } from '@testing-library/react';
import OpRhombusTemplatePicker from '../CanvasSkeleton/canvas/OpRhombusTemplatePicker';
import CategoryPickerModal from '../Library/onboarding/CategoryPickerModal';
import { bootstrapStore } from '../../store';

afterEach(cleanup);
const esc = () => fireEvent.keyDown(window, { key: 'Escape' });

describe('UX convention A — modals close on Escape', () => {
  it('OpRhombusTemplatePicker: Esc → onCancel', () => {
    const onCancel = vi.fn();
    render(
      <OpRhombusTemplatePicker
        op={{ id: 'o1' }}
        position={{ x: 10, y: 10 }}
        containers={[]}
        onPick={() => {}}
        onCancel={onCancel}
      />,
    );
    esc();
    expect(onCancel).toHaveBeenCalled();
  });

  it('CategoryPickerModal: Esc → onClose', () => {
    try { bootstrapStore(); } catch { /* idempotent */ }
    const onClose = vi.fn();
    render(<CategoryPickerModal open onClose={onClose} onComplete={() => {}} />);
    esc();
    expect(onClose).toHaveBeenCalled();
  });
});

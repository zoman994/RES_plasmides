/**
 * annotation-point-create-b3.test.jsx — audit B3. The documented 3rd annotation
 * level (POINT: start/stop codon, restriction site, mutation, variation) could be
 * imported + rendered but NOT authored — every create path hardcoded
 * level='region'. The SequenceView create/edit popups now offer point types and
 * derive the level from the chosen type.
 */
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent,
} from '@testing-library/react';
import CreateAnnotationPopup from '../CreateAnnotationPopup';
import EditAnnotationModal from '../EditAnnotationModal';
import { levelForType } from '../../../../lib/annotation-edit.js';

afterEach(cleanup);

describe('levelForType (B3)', () => {
  it('maps point / detail / region types', () => {
    expect(levelForType('start_codon')).toBe('point');
    expect(levelForType('restriction_site')).toBe('point');
    expect(levelForType('mutation')).toBe('point');
    expect(levelForType('RBS')).toBe('detail');
    expect(levelForType('CDS')).toBe('region');
    expect(levelForType('something_unknown')).toBe('region');
  });
});

describe('CreateAnnotationPopup — point authoring (B3)', () => {
  it('creating a restriction_site carries level:point in the payload', () => {
    const onCreate = vi.fn();
    render(
      <CreateAnnotationPopup
        position={{ x: 0, y: 0 }}
        selectionStart={10}
        selectionEnd={16}
        seqLength={100}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );
    fireEvent.change(screen.getByTestId('sequence-view-create-annotation-type'), { target: { value: 'restriction_site' } });
    fireEvent.click(screen.getByTestId('sequence-view-create-annotation-submit'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0]).toMatchObject({ type: 'restriction_site', level: 'point' });
  });

  it('a region type still creates level:region', () => {
    const onCreate = vi.fn();
    render(
      <CreateAnnotationPopup
        position={{ x: 0, y: 0 }}
        selectionStart={0}
        selectionEnd={30}
        seqLength={100}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );
    fireEvent.click(screen.getByTestId('sequence-view-create-annotation-submit'));
    expect(onCreate.mock.calls[0][0]).toMatchObject({ type: 'CDS', level: 'region' });
  });
});

describe('EditAnnotationModal — point conversion (B3)', () => {
  it('changing the type to a point type patches level:point', () => {
    const onApply = vi.fn();
    render(
      <EditAnnotationModal
        annotation={{ id: 'a1', name: 'x', type: 'CDS', start: 0, end: 30, strand: 1 }}
        seqLength={100}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    );
    fireEvent.change(screen.getByTestId('sequence-view-edit-annotation-type'), { target: { value: 'mutation' } });
    fireEvent.click(screen.getByTestId('sequence-view-edit-annotation-submit'));
    expect(onApply.mock.calls[0][0].patch).toMatchObject({ type: 'mutation', level: 'point' });
  });
});

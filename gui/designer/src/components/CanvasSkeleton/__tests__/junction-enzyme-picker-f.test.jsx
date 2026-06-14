/**
 * junction-enzyme-picker-f.test.jsx — audit finding F (per-junction enzyme). An
 * internal ромб that offers RE-лигирование (or a container junction offering
 * Golden Gate) must let the biolog pick the enzyme — otherwise the chosen
 * chemistry can't be realised. The picker rides JunctionPopover and threads
 * through JunctionControl → SET_BOUNDARY_OVERLAP (enzyme is a config field).
 */
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent,
} from '@testing-library/react';
import JunctionPopover from '../canvas/JunctionPopover';
import JunctionControl from '../canvas/JunctionControl';

afterEach(cleanup);

describe('JunctionPopover — enzyme picker (F)', () => {
  it('golden_gate junction shows a Type IIS enzyme picker', () => {
    render(<JunctionPopover junction={{ kind: 'golden_gate', status: 'manual' }} position={{ x: 0, y: 0 }} onSetParams={vi.fn()} />);
    expect(screen.getByTestId('junction-popover-enzyme')).toBeTruthy();
  });

  it('re_ligation junction shows a restriction-enzyme picker', () => {
    render(<JunctionPopover junction={{ kind: 're_ligation', status: 'manual' }} position={{ x: 0, y: 0 }} onSetParams={vi.fn()} />);
    expect(screen.getByTestId('junction-popover-enzyme')).toBeTruthy();
  });

  it('overlap junction shows NO enzyme picker', () => {
    render(<JunctionPopover junction={{ kind: 'overlap', status: 'manual' }} position={{ x: 0, y: 0 }} onSetParams={vi.fn()} />);
    expect(screen.queryByTestId('junction-popover-enzyme')).toBeNull();
  });

  it('changing the enzyme calls onSetParams({enzyme})', () => {
    const onSetParams = vi.fn();
    render(<JunctionPopover junction={{ kind: 'golden_gate', enzyme: 'BsaI', status: 'manual' }} position={{ x: 0, y: 0 }} onSetParams={onSetParams} />);
    fireEvent.change(screen.getByTestId('junction-popover-enzyme'), { target: { value: 'BsmBI' } });
    expect(onSetParams).toHaveBeenCalledWith({ enzyme: 'BsmBI' });
  });
});

describe('JunctionControl — enzyme threads to the config (F)', () => {
  it('maps config.enzyme into the picker value', () => {
    render(<JunctionControl pairKey="L__R" config={{ method: 'restriction', enzyme: 'BamHI', autoMode: 'manual' }} position={{ x: 0, y: 0 }} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('junction-popover-enzyme').value).toBe('BamHI');
  });

  it('picking an enzyme dispatches onChange({enzyme})', () => {
    const onChange = vi.fn();
    render(<JunctionControl pairKey="L__R" config={{ method: 'restriction', enzyme: 'BamHI', autoMode: 'manual' }} position={{ x: 0, y: 0 }} onChange={onChange} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('junction-popover-enzyme'), { target: { value: 'HindIII' } });
    expect(onChange).toHaveBeenCalledWith({ enzyme: 'HindIII' });
  });

  it('switching the method to RE seeds a default enzyme', () => {
    const onChange = vi.fn();
    render(<JunctionControl pairKey="L__R" config={{ method: 'overlap_pcr', autoMode: 'auto' }} position={{ x: 0, y: 0 }} onChange={onChange} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('junction-popover-kind-re_ligation'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ method: 'restriction', enzyme: 'EcoRI' }));
  });
});

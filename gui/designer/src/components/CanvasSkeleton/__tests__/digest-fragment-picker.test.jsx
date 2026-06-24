/**
 * DigestFragmentPicker — the digest «gel»: lists every band and picks one.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  render, screen, cleanup, act, fireEvent,
} from '@testing-library/react';
import DigestFragmentPicker from '../editor/assembly-mode/DigestFragmentPicker';

afterEach(cleanup);

const SEQ3 = `${'GAATTC'}${'AAAAAAAAAA'}`.repeat(3); // 48 bp, 3 EcoRI sites

describe('DigestFragmentPicker', () => {
  it('lists every band and picks the selected one', () => {
    let picked = null;
    render(
      <DigestFragmentPicker
        source={{ sequence: SEQ3, circular: true, name: 'x' }}
        enzymes={['EcoRI']}
        onPick={(f) => { picked = f; }}
        onCancel={() => {}}
      />,
    );
    expect(screen.getAllByTestId(/^digest-fragment-row-/).length).toBe(3);
    act(() => { fireEvent.click(screen.getByTestId('digest-fragment-row-1')); });
    act(() => { fireEvent.click(screen.getByTestId('digest-confirm')); });
    expect(picked).toBeTruthy();
    expect(picked.index).toBe(1);
    expect(picked.length).toBe(16);
  });

  it('shows the bands ON the map and clicking a band selects it (synced with the list)', () => {
    let picked = null;
    render(
      <DigestFragmentPicker
        source={{ sequence: SEQ3, circular: true, name: 'x' }}
        enzymes={['EcoRI']}
        onPick={(f) => { picked = f; }}
        onCancel={() => {}}
      />,
    );
    // a selectable arc per fragment is drawn on the real map
    expect(screen.getByTestId('plasmid-v2-band-0')).toBeTruthy();
    expect(screen.getByTestId('plasmid-v2-band-2')).toBeTruthy();
    // picking a band on the map drives the same selection the list does
    act(() => { fireEvent.click(screen.getByTestId('plasmid-v2-band-1')); });
    act(() => { fireEvent.click(screen.getByTestId('digest-confirm')); });
    expect(picked.index).toBe(1);
  });

  it('clicking an RE site label selects the band starting at that cut', () => {
    let picked = null;
    render(
      <DigestFragmentPicker
        source={{ sequence: SEQ3, circular: true, name: 'x' }}
        enzymes={['EcoRI']}
        onPick={(f) => { picked = f; }}
        onCancel={() => {}}
      />,
    );
    // EcoRI recognition sites at 0/16/32 → cuts at 1/17/33; label-1 = site @16 →
    // nearest band start is 17.
    act(() => { fireEvent.click(screen.getByTestId('plasmid-v2-re-label-1')); });
    act(() => { fireEvent.click(screen.getByTestId('digest-confirm')); });
    expect(picked).toBeTruthy();
    expect(picked.start).toBe(17);
  });
});

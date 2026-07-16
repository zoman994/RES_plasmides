/**
 * V195 — «при инверсии обжирает липкие концы» (Игорь 07.07). Pressing «Инвертировать»
 * used to (a) suppress the modal's sticky-end readout entirely (the invertActive status
 * branch printed only «Бэкбон: N bp …») and (b) compute reInfo without originWrap so the
 * backbone's ends were mirror-swapped. This locks BOTH: the labels survive invert AND
 * flip to the wrapped-backbone assignment (HIGH cut on the physical LEFT).
 *
 * The V193 fix only touched the POST-confirm store→canvas path; this is the pre-confirm
 * modal preview, on the exact surface the biolog is looking at when they press the button.
 */
import {
  describe, it, expect, afterEach,
} from 'vitest';
import {
  render, screen, cleanup, act, fireEvent,
} from '@testing-library/react';
import RangePickerModal from '../RangePickerModal';
import { segmentOverhangs } from '../../../lib/segment-overhangs';
import { RE_ENZYMES } from '../../../../../restriction-db';

afterEach(cleanup);

// Circular plasmid with EcoRI (GAATTC recog@4 → top cut 5) and BamHI (GGATCC recog@18 → top cut 19).
const RING = {
  name: 'pRing',
  sequence: `${'AAAA'}${'GAATTC'}${'TTTTTTTT'}${'GGATCC'}${'GGGG'}`, // len 28
  circular: true,
  annotations: [],
};
const AP = { enzymes: ['EcoRI', 'BamHI'], cutSites: [{ position: 5 }, { position: 19 }] };
const ohFor = (originWrap) => segmentOverhangs(
  { acquisitionMethod: 'restriction', acquisitionParams: AP, originWrap }, RE_ENZYMES,
);

function pickPair() {
  act(() => { window.dispatchEvent(new CustomEvent('__v88_re_click__', { detail: { enzyme: 'EcoRI', position: 5 } })); });
  act(() => { window.dispatchEvent(new CustomEvent('__v88_re_click__', { detail: { enzyme: 'BamHI', position: 19 } })); });
}

describe('V195 — invert keeps the backbone sticky-end labels (correctly swapped)', () => {
  it('before invert the excised insert shows EcoRI (low cut) on the left', () => {
    const { container } = render(<RangePickerModal source={RING} onConfirm={() => {}} onCancel={() => {}} />);
    pickPair();
    const insert = ohFor(false);
    expect(insert.left.enzyme).toBe('EcoRI'); // low cut on the left for the insert
    expect(container.textContent).toContain(`липкие концы: ${insert.left.label} | ${insert.right.label}`);
  });

  it('pressing «Инвертировать» keeps the labels AND flips them to the backbone (BamHI/high on the left)', () => {
    const { container } = render(<RangePickerModal source={RING} onConfirm={() => {}} onCancel={() => {}} />);
    pickPair();
    act(() => { fireEvent.click(screen.getByTestId('range-picker-invert')); });

    const backbone = ohFor(true);
    expect(backbone.left.enzyme).toBe('BamHI'); // origin-wrap: HIGH cut is the physical LEFT end
    expect(backbone.right.enzyme).toBe('EcoRI');

    const text = container.textContent;
    expect(text).toContain('липкие концы:'); // NOT dropped on invert (was the bug)
    expect(text).toContain(`липкие концы: ${backbone.left.label} | ${backbone.right.label}`);
    // and it is NOT the mirror-swapped insert order
    const insert = ohFor(false);
    expect(text).not.toContain(`липкие концы: ${insert.left.label} | ${insert.right.label}`);
  });
});

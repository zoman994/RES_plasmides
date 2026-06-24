/**
 * RS-INVERT wiring guard (Игорь 22.06): the assembly picker's «Инвертировать
 * (бэкбон)» button passes `inverted` → SequenceTab → SequenceView → SelectionOverlay.
 * This broke because SequenceView's `inverted` came from a HOOK (the right-click
 * invert), shadowing the prop — the button did nothing. Now the prop OVERRIDES the
 * hook (effInverted). When inverted: the hand-picked piece is SHADED (data-inverted)
 * and the COMPLEMENT becomes the selection band.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';

afterEach(cleanup);

const SEQ = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT'; // 32 bp, one line

const bands = () => screen.queryAllByTestId('sequence-view-selection');
const shaded = () => bands().filter((n) => n.getAttribute('data-inverted') === 'true');
const selected = () => bands().filter((n) => !n.getAttribute('data-inverted'));

describe('SequenceTab — inverted selection wiring (RS-INVERT)', () => {
  it('inverted=true → the hand-picked piece is SHADED and the complement is selected', () => {
    render(
      <SequenceTab sequence={SEQ} annotations={[]} topology="circular" name="x"
        caretAnchor={8} caretPos={16} inverted />,
    );
    expect(shaded().length).toBeGreaterThan(0);   // [8,16] shaded (excluded)
    expect(selected().length).toBeGreaterThan(0); // complement = the selection
  });

  it('no inverted prop → a normal selection band, nothing shaded', () => {
    render(
      <SequenceTab sequence={SEQ} annotations={[]} topology="circular" name="x"
        caretAnchor={8} caretPos={16} />,
    );
    expect(shaded().length).toBe(0);
    expect(selected().length).toBeGreaterThan(0);
  });
});

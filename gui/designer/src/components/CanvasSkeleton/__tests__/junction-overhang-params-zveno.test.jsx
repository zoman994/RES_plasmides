/**
 * junction-overhang-params-zveno.test.jsx — Звено (фикс, без спеки).
 *
 * Overhang/length params are an OVERLAP-PCR/Gibson concept. RE-ligation,
 * Golden Gate, KLD, sticky/blunt must NOT show the target L/R/both + length/Tm
 * controls, and the ends-preview must not leak a STALE overlapLength (left over
 * from a previous overlap pick) into the enzyme-overhang display.
 *   • JunctionPopover: overlap-params section ONLY for kind 'overlap'.
 *   • inferEndRequirements: enzyme kinds (re_ligation/golden_gate/sticky_end)
 *     → FIXED overhang(4), не length; overlap → overhang(length ?? 30);
 *     kld/blunt/ligation → blunt; overlapTarget narrowing only for overlap.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import JunctionPopover from '../canvas/JunctionPopover';
import { inferEndRequirements } from '../canvas/junction-styles';

afterEach(cleanup);

function J(over = {}) {
  return {
    kind: 'overlap', overlapTarget: 'right', overlapLength: 30, overlapTm: null, status: 'auto', ...over,
  };
}
function renderPopover(over) {
  return render(
    <JunctionPopover
      junction={J(over)}
      position={{ x: 100, y: 100 }}
      warnings={[]}
      onPick={() => {}}
      onSetParams={() => {}}
      onResetAuto={() => {}}
      onCancel={() => {}}
    />,
  );
}

// ─── inferEndRequirements — stale overlapLength must NOT leak ───────────────

describe('Звено — inferEndRequirements (enzyme overhang is fixed, not stale length)', () => {
  it('re_ligation with a stale length=50 → both ends fixed overhang(4)', () => {
    const er = inferEndRequirements('re_ligation', 'right', 50);
    expect(er.fromEnd).toMatchObject({ type: 'overhang', length: 4 });
    expect(er.toEnd).toMatchObject({ type: 'overhang', length: 4 });
  });

  it('golden_gate with a stale length=50 → both ends fixed overhang(4)', () => {
    const er = inferEndRequirements('golden_gate', 'right', 50);
    expect(er.fromEnd).toMatchObject({ type: 'overhang', length: 4 });
    expect(er.toEnd).toMatchObject({ type: 'overhang', length: 4 });
  });

  it('overlap DOES honour the length (overhang flows from the homology arm)', () => {
    const er = inferEndRequirements('overlap', 'right', 50);
    expect(er.fromEnd).toMatchObject({ type: 'overhang', length: 50 });
    expect(er.toEnd).toMatchObject({ type: 'overhang', length: 50 });
  });

  it('kld → blunt both ends', () => {
    const er = inferEndRequirements('kld', 'right', 50);
    expect(er.fromEnd.type).toBe('blunt');
    expect(er.toEnd.type).toBe('blunt');
  });

  it('overlapTarget=left narrows ONLY overlap; enzyme kinds stay symmetric', () => {
    // overlap + left → the opposite end is unconstrained (any)
    const ov = inferEndRequirements('overlap', 'left', 30);
    expect(ov.toEnd.type).toBe('any');
    // re_ligation + a stale 'left' must NOT drop toEnd to any — both ends carry
    // the enzyme overhang symmetrically.
    const re = inferEndRequirements('re_ligation', 'left', 50);
    expect(re.fromEnd).toMatchObject({ type: 'overhang', length: 4 });
    expect(re.toEnd).toMatchObject({ type: 'overhang', length: 4 });
  });
});

// ─── JunctionPopover — overlap-params section only for overlap ──────────────

describe('Звено — JunctionPopover hides overlap-params for non-overlap kinds', () => {
  it('overlap → overlap-params present', () => {
    renderPopover({ kind: 'overlap' });
    expect(screen.getByTestId('junction-popover-overlap-params')).toBeTruthy();
  });

  it.each(['re_ligation', 'golden_gate', 'kld'])('%s → overlap-params absent', (kind) => {
    renderPopover({ kind });
    expect(screen.queryByTestId('junction-popover-overlap-params')).toBeNull();
  });
});

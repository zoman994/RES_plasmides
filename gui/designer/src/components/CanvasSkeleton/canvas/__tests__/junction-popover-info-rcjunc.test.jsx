/**
 * RC-JUNC (Игорь 25.06) — the «Метод сборки на стыке» panel must be informative and
 * method-specific: show the REAL enzyme sticky end (not a generic «overhang 4 nt»),
 * a one-line chemistry note per method, and offer blunt ligation + Golden Gate as
 * internal-junction methods (mixed-method assemblies).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import JunctionPopover from '../JunctionPopover';
import { INTERNAL_METHODS, junctionKindForMethod } from '../../lib/junction-derive';

afterEach(cleanup);

const noop = () => {};
const open = (junction, extra = {}) => render(
  <JunctionPopover junction={junction} position={{ x: 0, y: 0 }} onPick={noop} onSetParams={noop} onResetAuto={noop} onCancel={noop} {...extra} />,
);

describe('JunctionPopover — RC-JUNC method-aware info', () => {
  it('RE лигирование показывает РЕАЛЬНЫЙ липкий конец фермента (EcoRI → 5′ AATT)', () => {
    open({ kind: 're_ligation', enzyme: 'EcoRI', status: 'manual' });
    expect(screen.getByTestId('junction-end-from').textContent).toBe('5′ AATT');
    expect(screen.getByTestId('junction-end-to').textContent).toBe('5′ AATT');
    // NOT the old generic placeholder
    expect(screen.getByTestId('junction-end-from').textContent).not.toMatch(/4 nt/);
  });

  it('RE лигирование: BamHI → 5′ GATC', () => {
    open({ kind: 're_ligation', enzyme: 'BamHI', status: 'manual' });
    expect(screen.getByTestId('junction-end-from').textContent).toBe('5′ GATC');
  });

  it('строка-пояснение по химии для выбранного метода', () => {
    open({ kind: 're_ligation', enzyme: 'EcoRI', status: 'manual' });
    const g = screen.getByTestId('junction-popover-guidance');
    expect(g.textContent).toMatch(/дефосфорил|липк|направленн/i);
  });

  it('тупое лигирование: концы тупые + предупреждение про ненаправленность', () => {
    open({ kind: 'ligation', status: 'manual' });
    expect(screen.getByTestId('junction-end-from').textContent).toBe('тупой');
    expect(screen.getByTestId('junction-popover-guidance').textContent).toMatch(/ненаправленн|дефосфорил/i);
  });

  it('overlap показывает «гомологичное плечо», а не «overhang»', () => {
    open({ kind: 'overlap', overlapTarget: 'both', overlapLength: 30, status: 'manual' });
    expect(screen.getByTestId('junction-end-from').textContent).toMatch(/гомологичное плечо 30 bp/);
  });

  it('Blunt ligation + Golden Gate доступны как методы внутреннего стыка', () => {
    // allowedKinds derived from INTERNAL_METHODS (what JunctionControl passes).
    const kinds = INTERNAL_METHODS.map(junctionKindForMethod);
    expect(kinds).toContain('ligation');     // blunt
    expect(kinds).toContain('golden_gate');
    expect(kinds).toContain('re_ligation');
    expect(kinds).toContain('overlap');
    // and the popover renders those tiles when allowedKinds is the internal set
    open({ kind: 're_ligation', enzyme: 'EcoRI', status: 'auto' }, { allowedKinds: kinds });
    expect(screen.getByTestId('junction-popover-kind-ligation')).toBeTruthy();
    expect(screen.getByTestId('junction-popover-kind-golden_gate')).toBeTruthy();
  });
});

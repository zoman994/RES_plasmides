/**
 * RC-B1 (Игорь 24.06) — динамическая рамка считывания. Пользователь может
 * зафиксировать рамку (+1/+2/+3) на сиквенсе, минуя авто-выбор по CDS. Механизм:
 * форсим единственную forward-рамку через существующий hybrid-путь AATrack
 * (framesMode='all' → opacity 1, visibleFrames = только выбранная рамка). Контрол
 * живёт в SettingsPopover, состояние — в uiSlice.sequenceView.overrideFrame.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AATrack from '../tracks/AATrack';
import SettingsPopover from '../SettingsPopover';
import { useStore } from '../../../store';

afterEach(cleanup);

describe('AATrack — RC-B1 механизм форсированной рамки', () => {
  // No annotations / ORFs at all — the override must translate raw DNA anyway.
  const SEQ = 'ATGGCTGCTGCTAAACCCGGGTTT';

  it('hybrid + all + одна forward-рамка → ровно эта рамка, без CDS', () => {
    render(
      <AATrack
        fullSeq={SEQ}
        lineStart={0}
        lineLen={SEQ.length}
        labelChars={8}
        strategy="hybrid"
        framesMode="all"
        orfRanges={[]}
        dominantCDS={null}
        regions={[]}
        strandFilter="forward"
        visibleFrames={{ '+1': false, '+2': true, '+3': false, '-1': false, '-2': false, '-3': false }}
      />,
    );
    const rows = screen.getAllByTestId('sequence-view-aa-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].dataset.aaLabel).toBe('+2');
    // full opacity — это «жёсткая» рамка, не приглушённая авто-подсказка
    const chars = screen.getAllByTestId('sequence-view-aa-char');
    expect(chars.length).toBeGreaterThan(0);
    expect(chars.every((c) => c.getAttribute('data-aa-opacity') === '1')).toBe(true);
  });
});

describe('SettingsPopover — RC-B1 контрол «рамка считывания»', () => {
  beforeEach(() => { useStore.getState().resetSequenceViewSettings(); });

  it('по умолчанию overrideFrame=null (авто)', () => {
    expect(useStore.getState().sequenceView.overrideFrame).toBe(null);
  });

  it('выбор +2 ставит overrideFrame=1, «авто» — обратно null', () => {
    render(<SettingsPopover open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('sequence-view-setting-override-frame-1'));
    expect(useStore.getState().sequenceView.overrideFrame).toBe(1);
    fireEvent.click(screen.getByTestId('sequence-view-setting-override-frame-auto'));
    expect(useStore.getState().sequenceView.overrideFrame).toBe(null);
  });

  it('выбор +1 и +3 ставят 0 и 2 соответственно', () => {
    render(<SettingsPopover open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('sequence-view-setting-override-frame-0'));
    expect(useStore.getState().sequenceView.overrideFrame).toBe(0);
    fireEvent.click(screen.getByTestId('sequence-view-setting-override-frame-2'));
    expect(useStore.getState().sequenceView.overrideFrame).toBe(2);
  });
});

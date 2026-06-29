/**
 * Ф4.1 (Игорь 27.06 «где переворот фрагмента?») — orientFragments назначает каждому
 * фрагменту ориентацию (forward / reverse-complement) так, чтобы соседние липкие
 * концы КОМПЛЕМЕНТАРНО стыковались. Единый источник истины: один и тот же flip
 * кормит rc-рендер карточки (Ф4.2), точное сцепление концов (Ф4.3) и гейт замыкания
 * (Ф4.4) — поэтому «зелёный замок» и «продукт собирается» больше не разойдутся.
 *
 * Жадно: seg0 — якорь (forward); каждый следующий — выбрать forward/rc так, чтобы его
 * левый конец стыковался с правым концом предыдущего (junctionInterlock). Для кольца —
 * проверить, что последний правый стыкуется с первым левым (closes).
 */
import { describe, it, expect } from 'vitest';
import { orientFragments } from '../lib/segment-overhangs';
import { RE_ENZYMES } from '../../../restriction-db';

// два разных конца: low-pos enzyme → left, high-pos → right (segmentOverhangs).
const reSeg = (eLeft, eRight) => ({
  acquisitionMethod: 'restriction',
  acquisitionParams: { enzymes: [eLeft, eRight], cutSites: [{ position: 0 }, { position: 10 }] },
});
// один фермент, один разрез → оба конца этого фермента.
const reSingleSeg = (enz) => ({
  acquisitionMethod: 'restriction',
  acquisitionParams: { single: true, enzymes: [enz], cutSites: [{ position: 5 }] },
});

describe('orientFragments — назначение ориентаций (Ф4.1)', () => {
  it('два {SmaI,ApaI}: второй переворачивается, чтобы GGCC смотрел в GGCC', () => {
    const r = orientFragments([reSeg('SmaI', 'ApaI'), reSeg('SmaI', 'ApaI')], RE_ENZYMES, { circular: false });
    expect(r.orientations[0].reversed).toBe(false);
    expect(r.orientations[1].reversed).toBe(true);
    expect(r.chainMates).toBe(true);
  });

  it('те же два — кольцевая сборка ЗАМЫКАЕТСЯ (тупой↔тупой замыкающий шов)', () => {
    const r = orientFragments([reSeg('SmaI', 'ApaI'), reSeg('SmaI', 'ApaI')], RE_ENZYMES, { circular: true });
    expect(r.closes).toBe(true);
    const closure = r.junctions.find((j) => j.closure);
    expect(closure).toBeTruthy();
    expect(closure.mates).toBe(true);
  });

  it('палиндромные EcoRI/EcoRI: оба forward (уже стыкуются без переворота)', () => {
    const r = orientFragments([reSingleSeg('EcoRI'), reSingleSeg('EcoRI')], RE_ENZYMES, { circular: false });
    expect(r.orientations.every((o) => o.reversed === false)).toBe(true);
    expect(r.chainMates).toBe(true);
  });

  it('реально несовместимые (EcoRI-концы ↔ SalI-концы): ни одна ориентация не стыкует', () => {
    const r = orientFragments([reSingleSeg('EcoRI'), reSingleSeg('SalI')], RE_ENZYMES, { circular: false });
    expect(r.chainMates).toBe(false);
    const j = r.junctions.find((x) => !x.closure);
    expect(j.mates).toBe(false);
  });

  it('один кольцевой RE-фрагмент: само-замыкание стыкуется', () => {
    const r = orientFragments([reSingleSeg('EcoRI')], RE_ENZYMES, { circular: true });
    expect(r.closes).toBe(true);
  });

  it('не-RE фрагмент: без падения, reversed=false, без внутренних стыков', () => {
    const r = orientFragments([{ kind: 'synthesis', sequence: 'ACGTACGT' }], RE_ENZYMES, { circular: false });
    expect(r.orientations[0].reversed).toBe(false);
    expect(Array.isArray(r.junctions)).toBe(true);
  });

  it('пустой вход — пустой результат', () => {
    const r = orientFragments([], RE_ENZYMES, { circular: true });
    expect(r.orientations).toEqual([]);
    expect(r.closes).toBe(false);
  });
});

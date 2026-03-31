# BodgeGene — Полный анализ комбинаций блоков на canvas

## Типы блоков (4 штуки)

| Тип | needsAmplification | subFragments | Как попадает на canvas |
|-----|--------------------|--------------|----------------------|
| **R** — Regular | `true` | `null` | Drag из палитры |
| **N** — No-PCR | `false` | `null` | Toggle "без ПЦР" на Regular, или импорт рестрикционного фрагмента |
| **M** — Merged | `false` | `[sub1, sub2, ...]` | Ctrl+Click → Склеить |
| **P** — Product | `false` | `[sub1, sub2, ...]` | Результат completeAssembly из другой вкладки |

M и P технически одинаковы (оба имеют subFragments) — разница только в origin.

## Типы junction (4 штуки)

| Junction | Overlap tail | Кто несёт overlap |
|----------|-------------|-------------------|
| **overlap** (split) | 50/50 | Оба фрагмента, по ~15bp каждый |
| **overlap** (left_only) | 100% на левом | Левый фрагмент rev праймер |
| **overlap** (right_only) | 100% на правом | Правый фрагмент fwd праймер |
| **golden_gate** | recognition+spacer+overhang | Оба |
| **kld** | нет tail | Back-to-back |
| **re_ligation** | нет tail | Рестрикция |

## Топология

| Топология | Junctions | Особенность |
|-----------|-----------|-------------|
| **Linear** | N-1 junctions | Первый fwd без tail, последний rev без tail |
| **Circular** | N junctions | Все с tail, включая wrap-around |

---

## ВСЕ ПОПАРНЫЕ КОМБИНАЦИИ (4×4 = 16)

### Обозначения:
- ✅ = текущий код корректен
- ⚠ = баг или неполная обработка
- ⛔ = не работает

---

### 1. R + R (Regular + Regular)
```
[AmpR ПЦР] ─overlap─ [EGFP ПЦР]
```
**Сейчас:** Оба получают fwd+rev с overlap tails. ✅
**Праймеры:** 4 (fwd_AmpR, rev_AmpR с tail, fwd_EGFP с tail, rev_EGFP)

### 2. R + N (Regular + No-PCR)
```
[AmpR ПЦР] ─overlap─ [Vector без ПЦР]
```
**Сейчас:** AmpR получает оба праймера. Vector пропущен (`needsAmplification === false`). ⚠
**Баг:** AmpR rev tail = half overlap (split mode) = 15bp. Но Vector не получает fwd tail (пропущен). Итого overlap = только 15bp вместо 30bp.
**Правильно:** AmpR rev tail должен нести ПОЛНЫЙ overlap (30bp), потому что Vector не PCR'd.
**Fix:** Если right neighbor No-PCR → автоматически переключить effective mode на `left_only` для этого junction.

### 3. N + R (No-PCR + Regular)
```
[Vector без ПЦР] ─overlap─ [EGFP ПЦР]
```
**Сейчас:** EGFP получает fwd с half tail. Vector пропущен. ⚠
**Баг:** Overlap = 15bp вместо 30bp. Зеркало случая #2.
**Fix:** Если left neighbor No-PCR → effective mode `right_only`.

### 4. N + N (No-PCR + No-PCR) — СКРИНШОТ
```
[3'GA_flank без ПЦР] ─overlap─ [Сборка 3 без ПЦР]
```
**Сейчас:** Оба пропущены → 0 праймеров. ⚠
**Правильно:** Это биологически невозможно для overlap сборки — оба фрагмента уже есть, но overlap нельзя добавить без ПЦР. Нужен WARNING:
```
⚠ Стык N: оба фрагмента "без ПЦР" — невозможно добавить overlap.
   Переключите хотя бы один на ПЦР, или используйте RE-лигирование.
```
**Но**: если junction = `re_ligation` — это нормально (фрагменты лигируются без ПЦР). Тогда warning не нужен.

### 5. R + M (Regular + Merged)
```
[AmpR ПЦР] ─overlap─ [EGFP+GA merged]
```
**Сейчас:** Merged разворачивается → [AmpR, EGFP, GA]. AmpR получает праймеры. EGFP и GA получают праймеры (expansion → needsAmplification: true). ✅
**Праймеры:** 6 (2 per fragment). Internal: rev_EGFP, fwd_GA. External: fwd_AmpR, rev_AmpR, fwd_EGFP, rev_GA.

Wait — проверяю junction mapping:
```
fragments = [AmpR, Merged(EGFP+GA)]
junctions = [j0]

expansion:
expanded = [AmpR, EGFP, GA]
expandedJuncs = [j0, j_internal_EGFP_GA]
```

Проблема! j0 стоит ПОСЛЕ AmpR (между AmpR и Merged). Но при expansion:
- AmpR → push
- Merged: EGFP → push; j_internal → push; GA → push
- fi < junctions.length (0 < 1) → push j0

expandedJuncs = [j_internal, j0]
expanded = [AmpR, EGFP, GA]

Маппинг: AmpR ─j_internal─ EGFP ─j0─ GA

⛔ **НЕПРАВИЛЬНО!** j_internal — это junction ВНУТРИ merged (между EGFP и GA). А j0 — junction между AmpR и Merged. После expansion порядок перепутан!

**Правильный порядок:** AmpR ─j0─ EGFP ─j_internal─ GA

### КОРНЕВОЙ БАГ В EXPANSION!

Проблема в порядке push junction. Текущий код:

```js
for (let fi = 0; fi < fragments.length; fi++) {
  const frag = fragments[fi];
  if (frag.subFragments?.length > 0) {
    for (let si = 0; si < frag.subFragments.length; si++) {
      expanded.push(sub);
      if (si < frag.subFragments.length - 1) {
        expandedJunctions.push(j_internal);  // ← СНАЧАЛА internal
      }
    }
  } else {
    expanded.push(frag);
  }
  if (fi < junctions.length) {
    expandedJunctions.push(junctions[fi]);  // ← ПОТОМ original
  }
}
```

Для [AmpR, Merged(EGFP+GA)] с junctions[0]:
```
fi=0: AmpR → expanded=[AmpR]
      fi < 1 → push junctions[0] → expandedJuncs=[j0]  ← ОК, j0 ПОСЛЕ AmpR

fi=1: Merged(EGFP+GA)
      si=0: EGFP → expanded=[AmpR, EGFP]
      si=0 < 1: push j_internal → expandedJuncs=[j0, j_internal]
      si=1: GA → expanded=[AmpR, EGFP, GA]
      fi < 1? NO (fi=1, junctions.length=1) → don't push

expandedJuncs = [j0, j_internal]
```

Маппинг: AmpR ─j0─ EGFP ─j_internal─ GA ✅

На самом деле правильно! Я ошибся в ручном трейсе выше. Перепроверяю:

fi=0 → AmpR (regular, no subFragments) → expanded.push(AmpR)
fi=0 < junctions.length(=1) → expandedJunctions.push(junctions[0]) = j0
fi=1 → Merged(EGFP+GA)
  si=0: expanded.push(EGFP)
  si=0 < 1: expandedJunctions.push(j_internal)
  si=1: expanded.push(GA)
  fi=1 < junctions.length(=1)? NO

expanded = [AmpR, EGFP, GA]
expandedJuncs = [j0, j_internal]

AmpR ─j0─ EGFP ─j_internal─ GA ✅ Правильно!

### 6. M + R (Merged + Regular)
```
[AmpR+EGFP merged] ─overlap─ [GA ПЦР]
```
expansion:
fi=0: Merged(AmpR+EGFP)
  si=0: AmpR → expanded=[AmpR]
  si=0 < 1: expandedJuncs.push(j_internal)
  si=1: EGFP → expanded=[AmpR, EGFP]
  fi=0 < 1: expandedJuncs.push(j0)
fi=1: GA → expanded=[AmpR, EGFP, GA]
  fi=1 < 1? NO

expanded = [AmpR, EGFP, GA]
expandedJuncs = [j_internal, j0]

AmpR ─j_internal─ EGFP ─j0─ GA ✅

### 7. M + M (Merged + Merged)
```
[AmpR+EGFP merged] ─overlap─ [GA+T7 merged]
```
expansion:
fi=0: Merged(AmpR+EGFP)
  AmpR, j_internal1, EGFP
  push junctions[0] = j0
fi=1: Merged(GA+T7)
  GA, j_internal2, T7
  fi=1 < 1? NO

expanded = [AmpR, EGFP, GA, T7]
expandedJuncs = [j_internal1, j0, j_internal2]

AmpR ─j_internal1─ EGFP ─j0─ GA ─j_internal2─ T7 ✅

8 праймеров, 4 internal (rev_AmpR, fwd_EGFP, rev_GA, fwd_T7), 4 external. ✅

### 8. R + P (Regular + Product) — аналог R + M ✅
### 9. P + R — аналог M + R ✅
### 10. M + P — аналог M + M ✅
### 11. P + P — аналог M + M ✅
### 12. N + M (No-PCR + Merged)
```
[Vector без ПЦР] ─overlap─ [AmpR+EGFP merged]
```
expansion:
fi=0: Vector (no subFragments) → expanded=[Vector]
  push j0 → expandedJuncs=[j0]
fi=1: Merged(AmpR+EGFP)
  AmpR, j_internal, EGFP
  fi=1 < 1? NO

expanded = [Vector, AmpR, EGFP]
expandedJuncs = [j0, j_internal]

Vector ─j0─ AmpR ─j_internal─ EGFP

Vector: needsAmplification=false → ПРОПУЩЕН (текущий код) ⚠
AmpR: needsAmplification=true (from expansion) → fwd tail from j0 and Vector → но split mode → half overlap!
**Баг:** AmpR fwd tail = 15bp (split mode). Vector не получает rev tail. Overlap = 15bp.
**Fix:** Detect that Vector is No-PCR → effective mode `right_only` → AmpR fwd tail = 30bp.

### 13. M + N — зеркало #12 ⚠
### 14. N + P — аналог N + M ⚠
### 15. P + N — аналог M + N ⚠
### 16. N + N — случай #4 ⚠

---

## СВОДКА БАГОВ

| Комбинация | Баг | Серьёзность |
|-----------|-----|-------------|
| R+R | нет | ✅ |
| R+N | half overlap (15bp вместо 30bp) | ⚠ medium |
| N+R | half overlap | ⚠ medium |
| N+N | 0 праймеров, нет warning | ⚠ high |
| R+M | нет | ✅ |
| M+R | нет | ✅ |
| M+M | нет | ✅ |
| N+M | half overlap на boundary | ⚠ medium |
| M+N | half overlap на boundary | ⚠ medium |
| N+N | 0 праймеров | ⚠ high |

**Все баги сводятся к ОДНОЙ проблеме:** когда один из соседей No-PCR, split mode даёт half overlap.

---

## FIX: Adaptive overlap mode

### В `designPrimersLocal`, при вычислении tail:

```js
// Forward primer: tail from LEFT junction
if (leftJ && prevFrag?.sequence) {
  // If left neighbor won't be PCR'd → this primer carries FULL overlap
  const leftNoPCR = prevFrag.needsAmplification === false && prevFrag._mergedName === null;
  const effectiveJ = (leftNoPCR && (leftJ.overlapMode || 'split') === 'split')
    ? { ...leftJ, overlapMode: 'right_only' }
    : leftJ;
  fwdTail = overlapTail(effectiveJ, prevFrag.sequence, seq, 'right');
}

// Reverse primer: tail from RIGHT junction
if (rightJ && nextFrag?.sequence) {
  // If right neighbor won't be PCR'd → this primer carries FULL overlap
  const rightNoPCR = nextFrag.needsAmplification === false && nextFrag._mergedName === null;
  const effectiveJ = (rightNoPCR && (rightJ.overlapMode || 'split') === 'split')
    ? { ...rightJ, overlapMode: 'left_only' }
    : rightJ;
  revTail = overlapTail(effectiveJ, seq, nextFrag.sequence, 'left');
}
```

**Ключевое:** `prevFrag._mergedName === null` — проверяем что No-PCR это РЕАЛЬНО No-PCR фрагмент, а не sub-fragment из expansion (у тех `needsAmplification: true`).

### Warning для N+N:

```js
// After the main loop, check for N+N adjacency
for (let i = 0; i < n - 1; i++) {
  const left = expanded[i];
  const right = expanded[i + 1];
  const junc = juncs[i];
  if (left.needsAmplification === false && left._mergedName === null &&
      right.needsAmplification === false && right._mergedName === null &&
      (junc?.type || 'overlap') === 'overlap') {
    warnings.push(
      `⛔ ${left.name} → ${right.name}: оба фрагмента "без ПЦР" — overlap невозможен. ` +
      `Переключите хотя бы один на ПЦР, или используйте RE-лигирование.`
    );
  }
}
```

Для circular добавить проверку wrap-around (last→first).

---

## ИТОГО: что менять

### Файл: `local-primer-design.js`

1. **НЕ пропускать** `needsAmplification === false` в основном цикле — дизайнить праймеры для ВСЕХ
2. **Adaptive overlap mode:** если сосед No-PCR → этот фрагмент несёт ПОЛНЫЙ overlap
3. **Warning N+N:** если оба соседа No-PCR с overlap junction → error
4. Добавить поле `needsAmplification` в каждый primer для UI

### Файл: `PrimerPanel.jsx`

5. Для праймеров с `needsAmplification === false` → пометка "фрагмент без ПЦР"
6. Для `isInternal` → пометка "внутренний OV-PCR"

### Файл: `fragmentSlice.js`

7. Drag reorder: `adjustedTo = from < to ? to - 1 : to`

### Файл: `store/index.js`

8. `onRehydrateStorage`: `useStore.setState()` вместо прямой мутации
9. PartsPalette guard на `initialized`

---

## Тесты — ВСЕ комбинации

```js
describe('designPrimersLocal — all block combinations', () => {
  const R = (name, seq) => ({ name, sequence: seq, needsAmplification: true });
  const N = (name, seq) => ({ name, sequence: seq, needsAmplification: false });
  const M = (name, seq, subs) => ({
    name, sequence: seq, needsAmplification: false,
    subFragments: subs, assemblyMethod: 'overlap_pcr',
  });
  const J = { type: 'overlap', overlapMode: 'split', overlapLength: 30, tmTarget: 62, calcMode: 'length' };
  
  const seqA = 'ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG'; // 48bp
  const seqB = 'CGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATG'; // 48bp
  const seqC = 'TTTAAAGGGCCCAAATTTGGGCCCAAATTTGGGCCCAAATTTGGGCCCA'; // 48bp
  
  it('R+R: both get primers with half overlap', () => {
    const { primers } = designPrimersLocal([R('A', seqA), R('B', seqB)], [J], false);
    expect(primers).toHaveLength(4);
    expect(primers[1].tailSequence.length).toBe(15); // rev_A: half overlap
    expect(primers[2].tailSequence.length).toBe(15); // fwd_B: half overlap
  });
  
  it('R+N: Regular carries FULL overlap, No-PCR still gets primers', () => {
    const { primers } = designPrimersLocal([R('A', seqA), N('B', seqB)], [J], false);
    expect(primers).toHaveLength(4); // ALL fragments get primers
    expect(primers[1].tailSequence.length).toBe(30); // rev_A: FULL overlap (adaptive)
    expect(primers[2].needsAmplification).toBe(false); // fwd_B marked as no-PCR
  });
  
  it('N+R: Regular carries FULL overlap', () => {
    const { primers } = designPrimersLocal([N('A', seqA), R('B', seqB)], [J], false);
    expect(primers).toHaveLength(4);
    expect(primers[2].tailSequence.length).toBe(30); // fwd_B: FULL overlap
    expect(primers[0].needsAmplification).toBe(false); // fwd_A: no-PCR
  });
  
  it('N+N: warns about impossible overlap', () => {
    const { primers, warnings } = designPrimersLocal([N('A', seqA), N('B', seqB)], [J], false);
    expect(primers).toHaveLength(4); // still designs primers
    expect(warnings.some(w => w.includes('оба') && w.includes('без ПЦР'))).toBe(true);
  });
  
  it('R+M: expands merged, correct junction order', () => {
    const merged = M('B+C', seqB + seqC, [
      { name: 'B', type: 'CDS', length: 48, pct: 50 },
      { name: 'C', type: 'CDS', length: 48, pct: 50 },
    ]);
    const { primers } = designPrimersLocal([R('A', seqA), merged], [J], false);
    expect(primers).toHaveLength(6); // A(2) + B(2) + C(2)
    expect(primers[0].fragmentName).toBe('A');
    expect(primers[2].fragmentName).toBe('B');
    expect(primers[4].fragmentName).toBe('C');
    // B's fwd is internal, C's rev is external
    expect(primers[2].isInternal).toBe(true);  // fwd_B
    expect(primers[5].isInternal).toBe(false); // rev_C
  });
  
  it('M+M: both expanded, correct junction order', () => {
    const m1 = M('A+B', seqA + seqB, [
      { name: 'A', type: 'CDS', length: 48, pct: 50 },
      { name: 'B', type: 'CDS', length: 48, pct: 50 },
    ]);
    const m2 = M('C+D', seqC + seqA, [
      { name: 'C', type: 'CDS', length: 48, pct: 50 },
      { name: 'D', type: 'CDS', length: 48, pct: 50 },
    ]);
    const { primers } = designPrimersLocal([m1, m2], [J], false);
    expect(primers).toHaveLength(8);
    // External primers: fwd_A, rev_B, fwd_C, rev_D
    expect(primers[0].isInternal).toBe(false); // fwd_A
    expect(primers[3].isInternal).toBe(false); // rev_B (outward)
    expect(primers[4].isInternal).toBe(false); // fwd_C (outward)
    expect(primers[7].isInternal).toBe(false); // rev_D
  });
  
  it('N+M: No-PCR neighbor → merged first sub gets FULL overlap', () => {
    const merged = M('B+C', seqB + seqC, [
      { name: 'B', type: 'CDS', length: 48, pct: 50 },
      { name: 'C', type: 'CDS', length: 48, pct: 50 },
    ]);
    const { primers } = designPrimersLocal([N('Vec', seqA), merged], [J], false);
    // Vec(2) + B(2) + C(2) = 6
    expect(primers).toHaveLength(6);
    // B's fwd tail should be FULL overlap (adaptive: Vec is No-PCR)
    const fwdB = primers.find(p => p.fragmentName === 'B' && p.direction === 'forward');
    expect(fwdB.tailSequence.length).toBe(30); // FULL, not 15
  });
  
  it('circular: first and last get wrap-around tails', () => {
    const { primers } = designPrimersLocal(
      [R('A', seqA), R('B', seqB), R('C', seqC)],
      [J, J, J], // 3 junctions for circular
      true
    );
    expect(primers).toHaveLength(6);
    // First fwd (A) should have tail from last fragment (C)
    expect(primers[0].tailSequence.length).toBeGreaterThan(0);
    // Last rev (C) should have tail from first fragment (A)
    expect(primers[5].tailSequence.length).toBeGreaterThan(0);
  });
});
```

---

## Визуализация: как выглядит каждый случай

### R + R (стандарт):
```
→ P001 58° ◀─15bp─▶ ◀─15bp─▶ → P003 59°
┌────────┐ ◀─30bp overlap─▶ ┌────────┐
│ AmpR   │───────────────────│ EGFP   │
│ 199bp  │                   │ 196bp  │
└────────┘                   └────────┘
59° P002 ←                   58° P004 ←
```

### R + N:
```
→ P001 58°                   → P003 59° (без ПЦР)
┌────────┐ ◀──30bp full──▶  ┌────────┐
│ AmpR   │───────────────────│ Vector │ без ПЦР
│ 199bp  │  full overlap     │ 4.2kb  │
└────────┘  на rev AmpR      └────────┘
59° P002 ←──────────30bp     58° P004 ← (без ПЦР)
```

### N + N:
```
┌────────┐                   ┌────────┐
│ Flank  │ без ПЦР ⚠───────│ Сборка │ без ПЦР
│ 872bp  │                   │ 9.1kb  │
└────────┘                   └────────┘
⛔ Оба без ПЦР — overlap невозможен!
```

# SPRINT_1_6_MUTAGENESIS_V2_1.md — Мутагенез UX v2.1

**Статус:** ⚠️ ✅ РЕАЛИЗОВАНО 21.04.2026 (partial visual acceptance, see Sprint 1.7)
**Автор спеки:** Claude Chat, 21.04.2026
**Приоритет:** HIGH — блокирует публикацию (K2 из Sprint 1.5 не прошёл визуальную приёмку)
**Оценка времени:** 6–8 часов, 4 коммита
**Ветка:** `feature/racetrack-canvas` (продолжение после Sprint 1.5)
**Предыдущий этап:** Sprint 1.5 — K1 (V14) + K3 (V13) + K4 (V11) приняты. K2 (V12 mode switcher) технически закоммичен (`c394c64`), но визуальная приёмка выявила три проблемы архитектурного уровня и концептуальный сдвиг. Все четыре закрываются в этом Sprint'е.

---

## Контекст: что выявила визуальная приёмка K2

Тестовый сценарий: Gibson assembly из 2 фрагментов (EGFP 196 bp + HygroR 1023 bp), single substitution в HygroR. Линейная топология → V14 корректно уводит в two_fragment split. Результат split: HygroR_1 (42 bp) + HygroR_2 (981 bp). На этом визуальная приёмка нашла:

**Проблема 1 (концептуальная):** В режиме «Правка» tab «Белок» показывает подсказку «Клик по аминокислоте → мутагенез», хотя `openMutMenu` early-return'ит. Больше того — **сама идея правки белка биологически некорректна**: пользователь не знает, какой кодон записать за выбранную AA, и bookkeeping на уровне белка невозможен. Белок в Правке должен быть **только для просмотра**.

**Проблема 2:** Split-фрагменты на canvas (HygroR_1 и HygroR_2) никак визуально не связаны — выглядят как два независимых куска. Пользователь теряет контекст «это один HygroR, просто разрезанный».

**Проблема 3:** Аннотации HygroR_2 не обрезаны биологически корректно. `Signal peptide 1..51` появляется в HygroR_2 с `templateStart=42`, хотя signal peptide по определению N-концевой — его остаток в середине белка бессмысленен.

**Проблема 4:** После применения мутаций нет никакого визуального следа, где именно они были внесены. Закрыл FragmentEditor → открыл снова → видишь «есть какие-то мутации где-то». Diff с родителем есть в `sequence-diff.js`, но в FragmentEditor не используется.

---

## Стратегия: правка поверх K2, не откат

Решение после анализа кода: **правим поверх `c394c64`**, не откатываемся. Причины:
1. K2 концептуально правильный в части mode switcher и убранного tab «Мутагенез» — сохраняется.
2. Integration с `handleSaveFragment` через identity-guard работает и корректно тестируется.
3. Четыре фикса (K5–K8) независимы друг от друга, каждый — самостоятельный коммит с тестами.
4. Откат стоил бы переписать 4 зелёных теста и через день вернуть те же решения.

---

## Задачи

### K5 — Белок read-only в режиме Правка
**Файлы:** `components/FragmentEditor.jsx`
**Тесты:** обновление `fragment-editor-mode-switcher.test.jsx` + 2 новых
**Оценка:** 1 час

### K6 — Правильная обрезка аннотаций при split (биология)
**Файлы:** `hooks/useFragmentHandlers.js`, новый `lib/split-annotations.js`, новый тест `split-annotations.test.js`
**Оценка:** 2 часа

### K7 — Split-группа: визуальная связь фрагментов на canvas
**Файлы:** `mutagenesis.js`, `hooks/useFragmentHandlers.js`, `components/DesignCanvas.jsx`, возможно `components/PartBlock.jsx`
**Тесты:** компонентный тест рендера группы
**Оценка:** 3–4 часа (основное время спринта)

### K8 — Цветовая подсветка мутаций в FragmentEditor
**Файлы:** `components/FragmentEditor.jsx`
**Тесты:** визуальная проверка + 2 unit-теста на вычисление `mutatedPositions`
**Оценка:** 1–1.5 часа

**Порядок выполнения:** K5 → K6 → K8 → K7. K7 идёт последним, потому что это наибольшее изменение UI и требует визуальной приёмки в конце. K8 перед K7, чтобы пользователь при приёмке K7 сразу видел подсвеченные мутации.

---

## K5 — Белок read-only в режиме Правка

### Концепция

Сейчас tab «Белок» реагирует на клик в обоих режимах (код early-return'ит в Правке, но визуально кнопка выглядит кликабельной, а подсказка говорит «Клик → мутагенез»). Надо сделать:

- В режиме **Правка** tab «Белок» показывает перевод **в read-only состоянии**. Клик по AA визуально не реагирует (cursor: default, без hover-эффекта). Вверху таба — подсказка: «Белок только для просмотра в этом режиме. Чтобы внести мутацию — переключитесь в режим Мутагенез.» + кнопка «→ Мутагенез» (вызывает `switchMode('mutagenesis')`).
- В режиме **Мутагенез** tab «Белок» работает как сейчас — клик по AA открывает popup.
- Семантика радио меняется так: **«Правка» = bookkeeping только ДНК**. **«Мутагенез» = эксперимент, может редактировать ДНК или AA**. Radio как был, подписи не меняются, меняется только поведение tab «Белок».

### Изменения в коде

**`components/FragmentEditor.jsx`:**

1. Найти блок рендера tab='regions' (или как он назван — проверить по `{tab === 'regions' && ...}` или подобному). Это tab «Белок» / «Разметка».

2. В начале этого блока добавить информационную полосу:

```jsx
{tab === 'regions' && mode === 'edit' && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-2 flex items-center justify-between text-xs text-blue-800">
    <span>
      👁 Режим просмотра. Правка белка невозможна — нужен кодон, а не только AA.
      Для мутагенеза переключите режим выше.
    </span>
    <button
      onClick={() => switchMode('mutagenesis')}
      className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition shrink-0 ml-2"
    >
      → Мутагенез
    </button>
  </div>
)}
```

3. В AA-рендере найти `<span>` с `onClick={(e) => openMutMenu(e, aaIdx, aa, codon)}`. Обернуть onClick и визуальные эффекты в условие по `mode`:

```jsx
<span
  onClick={mode === 'mutagenesis' ? (e) => openMutMenu(e, aaIdx, aa, codon) : undefined}
  style={{
    cursor: mode === 'mutagenesis' ? 'pointer' : 'default',
    // ... остальные стили
  }}
  className={mode === 'mutagenesis' ? 'hover:bg-purple-100 transition' : ''}
  // ...
>
  {aa}
</span>
```

4. `openMutMenu` оставить с early-return по `mode === 'edit'` как есть — defence-in-depth.

5. В нижней подсказке «Клик по аминокислоте → мутагенез» под sequence-рамкой сделать условный рендер: показывать только при `mode === 'mutagenesis'`.

### Тесты

**Обновить:** `fragment-editor-mode-switcher.test.jsx`, тест #3 (mode=mutagenesis → purple button):
- Добавить assertion, что в tab='regions' + mode='edit' видна полоса "Режим просмотра".
- Добавить assertion, что в tab='regions' + mode='mutagenesis' полоса не видна, но есть подсказка снизу.

**Добавить:**

```jsx
it('protein tab in edit mode: clicking AA does nothing, no popup opens', () => {
  // Рендер, переключение на tab='regions', mode='edit' (default)
  // Клик по span с AA
  // Проверка: getMutMenuState() returns null / popup нет в DOM
});

it('→ Мутагенез button in protein/edit switches mode without confirm', () => {
  // mutations=[] (нет что терять)
  // Клик по кнопке → Мутагенез
  // Проверка: mode='mutagenesis', window.confirm НЕ был вызван (mocked)
});
```

### Проверка

```bash
cd gui/designer && npx vitest run fragment-editor
cd gui/designer && npx vitest run && npx vite build
```

### Визуальная проверка (Игорь)

- Открыть FragmentEditor на HygroR.
- Mode=Правка, tab=Белок: видна синяя полоса «Режим просмотра», кликаю по AA — ничего не происходит (cursor=default, нет hover).
- Нажать «→ Мутагенез» — mode переключается, полоса исчезает, AA становятся кликабельными.
- Переключить mode обратно на Правку — окей, подтверждение если были мутации, полоса возвращается.

### Коммит

```
feat(fragment-editor): protein tab is read-only in edit mode (K5, Sprint 1.6)

Bookkeeping-edit of protein makes no biological sense — you can't
choose a codon from an amino acid alone. In edit mode, the protein tab
now shows a "view-only" banner with a direct switch to mutagenesis mode.
AA clicks are no-op in edit mode at both handler and UI levels.

Part of fixing K2 visual acceptance from Sprint 1.5.
```

---

## K6 — Правильная обрезка аннотаций при split

### Концепция

Текущая логика в `handleSaveFragment` (строки ~285-300):

```js
annotations: (original.annotations || [])
  .filter(a => a.end > sf.templateStart && a.start < sf.templateEnd)
  .map(a => ({
    ...a,
    start: Math.max(0, a.start - sf.templateStart),
    end: Math.min(sf.length, a.end - sf.templateStart),
    trimmed: a.start < sf.templateStart || a.end > sf.templateEnd,
  })),
```

Эта логика **филологически корректна** (координаты правильно пересчитываются), но **биологически некорректна**: signal peptide, start codon, stop codon, restriction sites при пересечении границы split'а становятся бессмысленными кусочками.

### Таблица правил

| Тип аннотации | Полностью внутри фрагмента | Пересекает границу split |
|---|---|---|
| `CDS`, `gene` | Перенести с пересчётом координат | Урезать, `trimmed: true`, **переименовать**: `(5' trimmed)` если `a.start < sf.templateStart`, `(3' trimmed)` если `a.end > sf.templateEnd` |
| `signal_peptide`, `transit_peptide`, `propeptide` | Перенести **только если** `a.start === 0` И `sf.templateStart === 0` | Иначе **выкинуть** — N-концевые по определению |
| `start_codon` | Перенести, если `a.start === 0` в новом фрагменте | Иначе выкинуть |
| `stop_codon` | Перенести, если `a.end === sf.length` в новом фрагменте | Иначе выкинуть |
| `linker`, `domain`, `tag`, `catalytic`, `binding`, `active_site`, `cleavage_site` | Перенести | Урезать + `trimmed: true` (имя не меняем) |
| `restriction_site`, `primer_bind` (короткие point-like) | Перенести | **Выкинуть** — половина сайта не работает |
| `mutation`, `variation` (point) | Перенести | Выкинуть |
| `intron`, `exon` | Перенести | Урезать + `trimmed: true` |
| `rep_origin`, `marker`, `misc_feature`, `enhancer`, `promoter`, `terminator`, и всё прочее | Перенести | Урезать + `trimmed: true` |

### Изменения в коде

1. **Новый файл `gui/designer/src/lib/split-annotations.js`:**

```js
/**
 * Biologically correct annotation trimming when a fragment is split.
 *
 * Stage 1.6 / K6.
 *
 * Context: when mutagenesis strategy splits a fragment into N sub-fragments,
 * annotations must be re-assigned to sub-fragments with biology-aware rules,
 * not just coordinate math. Some features (signal peptide, start/stop codon,
 * restriction sites) become nonsense when trimmed — they should be dropped.
 */

/** Types that must be fully contained AND at the correct position to survive. */
const N_TERMINAL_ONLY = new Set(['signal_peptide', 'transit_peptide', 'propeptide']);

/** Types that are functionally point markers — drop on partial overlap. */
const DROP_ON_TRIM = new Set([
  'restriction_site',
  'primer_bind',
  'mutation',
  'variation',
  'modified_base',
]);

/**
 * Assign original annotations to a sub-fragment with biological awareness.
 *
 * @param {Array}  parentAnns  — original fragment's annotations (parent coordinates)
 * @param {Object} sf          — sub-fragment: { templateStart, templateEnd, length }
 * @returns {Array} annotations for the sub-fragment, with local coordinates
 */
export function trimAnnotationsForSubFragment(parentAnns, sf) {
  const result = [];
  const subStart = sf.templateStart;
  const subEnd = sf.templateEnd;
  const subLen = sf.length;

  for (const a of parentAnns || []) {
    // No overlap at all
    if (a.end <= subStart || a.start >= subEnd) continue;

    const fullyInside = a.start >= subStart && a.end <= subEnd;
    const type = a.type || 'misc_feature';

    // Point-like types: drop on any partial overlap
    if (DROP_ON_TRIM.has(type)) {
      if (fullyInside) {
        result.push({ ...a, start: a.start - subStart, end: a.end - subStart });
      }
      continue;
    }

    // Start codon: only if it still starts the sub-fragment
    if (type === 'start_codon') {
      if (fullyInside && a.start === subStart) {
        result.push({ ...a, start: 0, end: a.end - subStart });
      }
      continue;
    }

    // Stop codon: only if it still ends the sub-fragment
    if (type === 'stop_codon') {
      if (fullyInside && a.end === subEnd) {
        result.push({ ...a, start: a.start - subStart, end: subLen });
      }
      continue;
    }

    // N-terminal features: only if fully inside AND start of sub-fragment is 0 of the parent
    if (N_TERMINAL_ONLY.has(type)) {
      if (fullyInside && subStart === 0 && a.start === 0) {
        result.push({ ...a, start: 0, end: a.end });
      }
      continue;
    }

    // Everything else: trim with flag + rename for CDS/gene on edge trim
    const trimmed5 = a.start < subStart;
    const trimmed3 = a.end > subEnd;
    const clipped = {
      ...a,
      start: Math.max(0, a.start - subStart),
      end: Math.min(subLen, a.end - subStart),
      trimmed: trimmed5 || trimmed3,
    };

    // Rename CDS/gene so user knows this isn't the full CDS anymore
    if ((type === 'CDS' || type === 'gene') && clipped.trimmed && a.name) {
      const suffix = trimmed5 && trimmed3 ? " (trimmed)"
                   : trimmed5 ? " (5' trimmed)"
                   : " (3' trimmed)";
      if (!a.name.includes('trimmed')) {
        clipped.name = a.name + suffix;
      }
    }

    result.push(clipped);
  }

  return result;
}
```

2. **В `useFragmentHandlers.js`:**

В начало файла:
```js
import { trimAnnotationsForSubFragment } from '../lib/split-annotations';
```

Внутри `handleSaveFragment`, найти блок `const newFragments = result.fragments.map((sf, i) => ({...}))` и заменить ручную обрезку аннотаций на вызов helper'а:

БЫЛО:
```js
      annotations: (original.annotations || [])
        .filter(a => a.end > sf.templateStart && a.start < sf.templateEnd)
        .map(a => ({
          ...a,
          start: Math.max(0, a.start - sf.templateStart),
          end: Math.min(sf.length, a.end - sf.templateStart),
          trimmed: a.start < sf.templateStart || a.end > sf.templateEnd,
        })),
```

СТАЛО:
```js
      annotations: trimAnnotationsForSubFragment(original.annotations || [], sf),
```

### Тесты

**Новый файл `gui/designer/src/__tests__/split-annotations.test.js`:**

Покрыть каждую ячейку таблицы. Ожидаемый объём ~15–20 тестов.

```js
import { describe, it, expect } from 'vitest';
import { trimAnnotationsForSubFragment } from '../lib/split-annotations';

describe('trimAnnotationsForSubFragment — biological correctness', () => {

  // Setup: исходный HygroR 1023 bp, signal peptide 0..93, CDS 0..1023
  //        split at 42: HygroR_1 (0..42), HygroR_2 (42..1023)

  const hygroR_anns = [
    { name: 'HygroR', type: 'CDS',            start: 0,   end: 1023, level: 'region' },
    { name: 'Signal peptide', type: 'signal_peptide', start: 0, end: 93, level: 'detail' },
    { name: 'Linker',   type: 'linker',       start: 340, end: 387, level: 'detail' },
    { name: 'NdeI',     type: 'restriction_site', start: 450, end: 456, level: 'point' },
  ];

  const sub1 = { templateStart: 0,  templateEnd: 42,   length: 42  };   // HygroR_1
  const sub2 = { templateStart: 42, templateEnd: 1023, length: 981 };   // HygroR_2

  it('CDS fully covering both subs is trimmed in both, renamed', () => {
    const a1 = trimAnnotationsForSubFragment(hygroR_anns, sub1);
    const a2 = trimAnnotationsForSubFragment(hygroR_anns, sub2);
    const cds1 = a1.find(a => a.type === 'CDS');
    const cds2 = a2.find(a => a.type === 'CDS');
    expect(cds1.trimmed).toBe(true);
    expect(cds1.name).toContain("3' trimmed");
    expect(cds2.trimmed).toBe(true);
    expect(cds2.name).toContain("5' trimmed");
  });

  it('Signal peptide spans split: SURVIVES in sub1 (starts at 0 of parent + subStart=0)', () => {
    // sub1 contains positions 0..42, signal_peptide 0..93 is NOT fully inside
    // → drop (partial overlap of N-terminal feature)
    const a1 = trimAnnotationsForSubFragment(hygroR_anns, sub1);
    expect(a1.find(a => a.type === 'signal_peptide')).toBeUndefined();
  });

  it('Signal peptide DOES NOT survive in sub2 (N-terminal, sub2 not at parent start)', () => {
    const a2 = trimAnnotationsForSubFragment(hygroR_anns, sub2);
    expect(a2.find(a => a.type === 'signal_peptide')).toBeUndefined();
  });

  it('Signal peptide survives if fully inside a sub-fragment that starts at parent 0', () => {
    const split_at_150 = { templateStart: 0, templateEnd: 150, length: 150 };
    const a = trimAnnotationsForSubFragment(hygroR_anns, split_at_150);
    const sp = a.find(x => x.type === 'signal_peptide');
    expect(sp).toBeDefined();
    expect(sp.start).toBe(0);
    expect(sp.end).toBe(93);
  });

  it('Linker fully inside sub2 is preserved with re-based coordinates, NOT trimmed', () => {
    const a2 = trimAnnotationsForSubFragment(hygroR_anns, sub2);
    const lnk = a2.find(a => a.type === 'linker');
    expect(lnk).toBeDefined();
    expect(lnk.trimmed).toBe(false);
    expect(lnk.start).toBe(340 - 42);  // 298
    expect(lnk.end).toBe(387 - 42);    // 345
  });

  it('Restriction site fully inside sub2 is preserved', () => {
    const a2 = trimAnnotationsForSubFragment(hygroR_anns, sub2);
    const rs = a2.find(a => a.type === 'restriction_site');
    expect(rs).toBeDefined();
    expect(rs.start).toBe(450 - 42);
  });

  it('Restriction site that spans a split boundary is DROPPED', () => {
    const split_mid_RE = { templateStart: 0, templateEnd: 453, length: 453 };
    const a = trimAnnotationsForSubFragment(hygroR_anns, split_mid_RE);
    expect(a.find(x => x.type === 'restriction_site')).toBeUndefined();
  });

  it('Start codon at parent pos 0: survives in sub starting at 0, dropped in sub not starting at 0', () => {
    const annsWithStart = [{ name: 'ATG', type: 'start_codon', start: 0, end: 3, level: 'point' }];
    const head = { templateStart: 0, templateEnd: 100, length: 100 };
    const tail = { templateStart: 100, templateEnd: 500, length: 400 };
    const aH = trimAnnotationsForSubFragment(annsWithStart, head);
    const aT = trimAnnotationsForSubFragment(annsWithStart, tail);
    expect(aH.find(a => a.type === 'start_codon')).toBeDefined();
    expect(aT.find(a => a.type === 'start_codon')).toBeUndefined();
  });

  it('Stop codon at parent end: survives in sub ending there, dropped elsewhere', () => {
    const annsWithStop = [{ name: 'TAA', type: 'stop_codon', start: 1020, end: 1023, level: 'point' }];
    const head = { templateStart: 0, templateEnd: 500, length: 500 };
    const tail = { templateStart: 500, templateEnd: 1023, length: 523 };
    const aH = trimAnnotationsForSubFragment(annsWithStop, head);
    const aT = trimAnnotationsForSubFragment(annsWithStop, tail);
    expect(aH.find(a => a.type === 'stop_codon')).toBeUndefined();
    expect(aT.find(a => a.type === 'stop_codon')).toBeDefined();
  });

  it('Annotation completely outside the sub-fragment is not included', () => {
    const annsFar = [{ name: 'Far', type: 'misc_feature', start: 500, end: 600 }];
    const sub = { templateStart: 0, templateEnd: 100, length: 100 };
    expect(trimAnnotationsForSubFragment(annsFar, sub)).toHaveLength(0);
  });

  it('Empty parent annotations → empty result', () => {
    expect(trimAnnotationsForSubFragment([], { templateStart: 0, templateEnd: 100, length: 100 }))
      .toHaveLength(0);
  });

  it('Primer bind that spans a boundary is dropped', () => {
    const anns = [{ name: 'seq_fwd', type: 'primer_bind', start: 40, end: 60, level: 'point' }];
    const sub = { templateStart: 0, templateEnd: 50, length: 50 };
    expect(trimAnnotationsForSubFragment(anns, sub).find(a => a.type === 'primer_bind')).toBeUndefined();
  });

  it('Mutation point inside sub is preserved', () => {
    const anns = [{ name: 'A100A', type: 'mutation', start: 300, end: 303, level: 'point' }];
    const sub = { templateStart: 100, templateEnd: 500, length: 400 };
    const a = trimAnnotationsForSubFragment(anns, sub);
    expect(a[0].start).toBe(200);
    expect(a[0].end).toBe(203);
  });

  it('Gene spanning boundary renamed with trimmed suffix', () => {
    const anns = [{ name: 'HygroR', type: 'gene', start: 0, end: 1023 }];
    const sub1 = { templateStart: 0, templateEnd: 42, length: 42 };
    const a = trimAnnotationsForSubFragment(anns, sub1);
    expect(a[0].name).toBe("HygroR (3' trimmed)");
    expect(a[0].trimmed).toBe(true);
  });

  it('Does not double-append " trimmed" when called multiple times', () => {
    const anns = [{ name: "HygroR (5' trimmed)", type: 'CDS', start: 0, end: 500, trimmed: true }];
    const sub = { templateStart: 100, templateEnd: 300, length: 200 };
    const a = trimAnnotationsForSubFragment(anns, sub);
    expect(a[0].name).not.toContain("trimmed trimmed");
  });
});
```

### Обновить существующие тесты

Проверить `handle-save-fragment.test.js` — если там были assertions на точные аннотации в split-результате, обновить под новую семантику. Сигнальный пептид должен пропасть в HygroR_2, CDS должен быть переименован.

### Проверка

```bash
cd gui/designer && npx vitest run split-annotations
cd gui/designer && npx vitest run && npx vite build
```

### Коммит

```
feat(split): biologically correct annotation trimming on mutagenesis split (K6, Sprint 1.6)

New lib/split-annotations.js with trimAnnotationsForSubFragment helper:
 - N-terminal features (signal/transit/propeptide) dropped unless fully inside a sub
   that starts at parent position 0
 - start/stop codon only survive at the correct edge of the correct sub
 - point-like (restriction_site, primer_bind, mutation, variation) dropped on trim
 - CDS/gene renamed with (5' trimmed) / (3' trimmed) / (trimmed) suffix on partial overlap
 - everything else (linker, domain, misc_feature, marker...) trimmed with flag

useFragmentHandlers.handleSaveFragment delegates to the helper instead of
inline map+filter, which was coordinate-correct but biology-blind.

+15 unit tests in split-annotations.test.js.
Part of fixing K2 visual acceptance from Sprint 1.5.
```

---

## K7 — Split-группа: визуальная связь на canvas

### Концепция

Split-фрагменты (HygroR_1 + HygroR_2 из одного HygroR) сейчас выглядят как независимые блоки. Пользователь теряет контекст. Нужна визуальная группировка.

Данных не хватает: нет общего `splitGroupId`, связывающего новые фрагменты.

По запросу пользователя («пунктирная рамка + общая подложка + badge сверху + соединительная линия — посмотрим в реализации, что-то уберём»): делаем **все четыре визуальных эффекта** разом, чтобы выбрать при финальной приёмке. Это подход «multi-option for visual review».

### Изменения в данных

1. **`mutagenesis.js::makeFragmentStrategy`** — добавить общий `splitGroupId` в каждый fragment:

В начало функции:
```js
const splitGroupId = `sg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
```

Внутри цикла построения fragments:
```js
fragments.push({
  // ... existing fields
  splitGroupId,
  splitGroupParentName: /* имя исходного фрагмента — но оно доступно только в caller */,
});
```

Проблема: parentName не доступен в `makeFragmentStrategy`. Решение: пробросить через options, либо ставить в caller'е.

**Выбранное решение:** ставить в caller'е (`useFragmentHandlers.handleSaveFragment`), потому что там есть `original.name`:

2. **`useFragmentHandlers.handleSaveFragment`** — при построении `newFragments`:

```js
const splitGroupId = `sg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const newFragments = result.fragments.map((sf, i) => ({
  id: `mf${Date.now()}_${i}_${Math.random().toString(36).slice(2, 4)}`,
  name: `${original.name}_${i + 1}`,
  // ... existing fields
  splitGroupId,
  splitGroupParentName: original.name,
  splitGroupIndex: i,
  splitGroupTotal: result.fragments.length,
  annotations: trimAnnotationsForSubFragment(original.annotations || [], sf),
}));
```

3. Тоже самое в `handleMutagenesis` (для Wizard-пути). Но там есть нюанс — Wizard может строить split на template, которого в `fragments` ещё не было. Значит splitGroupId ставим **только** когда `result.strategy !== 'kld'`. KLD — single fragment, группа не нужна.

### Изменения в рендере — DesignCanvas.jsx

Сейчас DesignCanvas рендерит фрагменты + junctions в одну строку. Нужно визуально сгруппировать фрагменты с одинаковым `splitGroupId` в контейнер.

План:
1. Перед рендером строки фрагментов — сгруппировать: соседние фрагменты с одинаковым `splitGroupId` идут в группу.
2. Для каждой группы (размер >= 2) — обернуть во внешний контейнер с пунктирной рамкой + тонированной подложкой + badge сверху.
3. Junction между соседними членами группы — визуально «внутренний» (тоньше, другой стиль).

### Подход к реализации

Я сейчас не буду писать точный код (слишком сильно зависит от текущей структуры DesignCanvas — Claude Code увидит на месте). Вот требования:

**Группировка:**

```js
function groupBySplit(fragments) {
  // Returns: [{ splitGroupId: null, items: [frag] } | { splitGroupId: 'sg_...', items: [f1, f2, ...] }]
  const groups = [];
  let currentGroup = null;
  for (const frag of fragments) {
    const gid = frag.splitGroupId;
    if (gid && currentGroup?.splitGroupId === gid) {
      currentGroup.items.push(frag);
    } else {
      currentGroup = { splitGroupId: gid || null, items: [frag] };
      groups.push(currentGroup);
    }
  }
  return groups;
}
```

**Рендер группы (при `group.items.length >= 2`):**

```jsx
<div className="split-group-container relative"
  style={{
    padding: '8px 6px 6px 6px',
    marginTop: '18px',  // место под badge
    border: '2px dashed #a855f7',   // фиолетовый пунктир (вариант «пунктирная рамка»)
    borderRadius: '12px',
    backgroundColor: 'rgba(168, 85, 247, 0.04)',  // лёгкая тонированная подложка (вариант 2)
    display: 'flex',
    gap: '6px',
  }}>
  {/* Badge сверху (вариант 3) */}
  <div style={{
    position: 'absolute',
    top: '-12px',
    left: '12px',
    backgroundColor: '#a855f7',
    color: 'white',
    fontSize: '10px',
    fontWeight: '500',
    padding: '2px 8px',
    borderRadius: '10px',
  }}>
    🧬 {group.items[0].splitGroupParentName} (split: {group.items.length} частей)
  </div>
  {/* Соединительная линия — через ::before pseudo на середине контейнера (вариант 4) */}
  {/* — реализовать через absolute-позиционированный div с толщиной 1px, полупрозрачный */}

  {/* Сами фрагменты + внутренние junctions */}
  {group.items.map((frag, i) => (
    <React.Fragment key={frag.id}>
      <PartBlock fragment={frag} {...props} />
      {i < group.items.length - 1 && (
        <JunctionBlock /* internal — более тонкий стиль */ />
      )}
    </React.Fragment>
  ))}
</div>
```

**Важные тонкости:**

- Split-group контейнер **не** заменяет существующий junction-рендер. Junctions внутри группы — это настоящие mutagenesis overlap-junctions, они должны рендериться как обычно (с tm, типом). Но визуально они могут быть «компактными» — CSS transform: scale(0.9) или другое.
- Снаружи группы — обычные junctions идут как обычно (слева до группы, справа после). То есть группа — это один «виртуальный блок» с точки зрения цепи сборки.
- Соединительная линия (вариант 4) реализуется через `::before` pseudo-element контейнера: полупрозрачная горизонтальная линия через всю ширину, позади контента. `pointer-events: none` чтобы не мешала кликам.

### Тесты

**Компонентный (новый `split-group-rendering.test.jsx`):**

```jsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import DesignCanvas from '../components/DesignCanvas';
import { useStore } from '../store';

// Seed helper
function seed(fragments, junctions) {
  useStore.setState({
    activeId: 'asm_test',
    assemblies: [{
      id: 'asm_test',
      name: 'test',
      fragments,
      junctions,
      primers: [],
      apiWarnings: [],
      calculated: false,
    }],
  });
}

describe('DesignCanvas — split-group visual rendering (K7)', () => {
  const withDnd = (el) => <DndProvider backend={HTML5Backend}>{el}</DndProvider>;

  it('renders group container with dashed border when fragments share splitGroupId', () => {
    seed(
      [
        { id: 'f1', name: 'HygroR_1', length: 42, sequence: 'A'.repeat(42),
          splitGroupId: 'sg_1', splitGroupParentName: 'HygroR', splitGroupIndex: 0, splitGroupTotal: 2 },
        { id: 'f2', name: 'HygroR_2', length: 981, sequence: 'A'.repeat(981),
          splitGroupId: 'sg_1', splitGroupParentName: 'HygroR', splitGroupIndex: 1, splitGroupTotal: 2 },
      ],
      [{ id: 'j1', type: 'overlap', overlapLength: 30, containsMutation: true }],
    );
    const { container } = render(withDnd(<DesignCanvas onDrop={()=>{}} pcrSizes={[42, 981]} />));
    const groupEl = container.querySelector('.split-group-container');
    expect(groupEl).toBeTruthy();
    expect(groupEl.textContent).toContain('HygroR');
    expect(groupEl.textContent).toContain('2 частей');
  });

  it('does not wrap single fragment without splitGroupId', () => {
    seed(
      [{ id: 'f1', name: 'EGFP', length: 720, sequence: 'A'.repeat(720) }],
      [],
    );
    const { container } = render(withDnd(<DesignCanvas onDrop={()=>{}} pcrSizes={[720]} />));
    expect(container.querySelector('.split-group-container')).toBeNull();
  });

  it('two independent splits render as two separate groups', () => {
    seed(
      [
        { id: 'a1', name: 'A_1', length: 100, sequence: 'A'.repeat(100), splitGroupId: 'sg_A', splitGroupParentName: 'A', splitGroupIndex: 0, splitGroupTotal: 2 },
        { id: 'a2', name: 'A_2', length: 200, sequence: 'A'.repeat(200), splitGroupId: 'sg_A', splitGroupParentName: 'A', splitGroupIndex: 1, splitGroupTotal: 2 },
        { id: 'b1', name: 'B_1', length: 50,  sequence: 'A'.repeat(50),  splitGroupId: 'sg_B', splitGroupParentName: 'B', splitGroupIndex: 0, splitGroupTotal: 2 },
        { id: 'b2', name: 'B_2', length: 150, sequence: 'A'.repeat(150), splitGroupId: 'sg_B', splitGroupParentName: 'B', splitGroupIndex: 1, splitGroupTotal: 2 },
      ],
      [
        { id: 'jA', type: 'overlap', overlapLength: 30 },
        { id: 'jAB', type: 'overlap', overlapLength: 15 },
        { id: 'jB', type: 'overlap', overlapLength: 30 },
      ],
    );
    const { container } = render(withDnd(<DesignCanvas onDrop={()=>{}} pcrSizes={[100,200,50,150]} />));
    const groups = container.querySelectorAll('.split-group-container');
    expect(groups.length).toBe(2);
  });
});
```

### Проверка

```bash
cd gui/designer && npx vitest run split-group
cd gui/designer && npx vitest run && npx vite build
```

### Визуальная проверка (Игорь)

- Та же схема что в приёмке K2: Gibson 2 фрагмента, HygroR → substitution → split.
- На canvas видна группа: EGFP снаружи, справа группа «HygroR (split: 2 частей)» с пунктирной фиолетовой рамкой + подложкой + badge сверху + тонкой соединительной линией.
- Между EGFP и группой — обычная overlap-junction.
- Внутри группы между HygroR_1 и HygroR_2 — mutation junction с пометкой.

**Решение по визуалу:** после приёмки K7 Игорь скажет, какие из 4 эффектов оставить (пунктир / подложка / badge / линия). Реализация — одно изменение в CSS.

### Коммит

```
feat(canvas): visual grouping for mutagenesis-split fragments (K7, Sprint 1.6)

When a fragment is split via two_fragment/multi_fragment mutagenesis,
the N resulting fragments now share splitGroupId + parent metadata
and render inside a visually grouped container with:
 - dashed purple outline
 - tinted backdrop
 - top-left badge "🧬 <parent> (split: N частей)"
 - faint horizontal connector line

All four visual hints are on by default; final design decision after
visual acceptance — any combination can be pared down via CSS.

Internal junctions (within a split group) still render as full overlap
junctions carrying the mutation; external junctions (between group and
neighbors) unchanged.

Data change: mutagenesis.js-driven split now stamps splitGroupId,
splitGroupParentName, splitGroupIndex, splitGroupTotal on each
resulting fragment. KLD path unaffected (single fragment in place).

+3 component tests in split-group-rendering.test.jsx.
Part of fixing K2 visual acceptance from Sprint 1.5.
```

---

## K8 — Цветовая подсветка мутаций в FragmentEditor

### Концепция

Пользователь после мутагенеза, закрыв и снова открыв FragmentEditor, не видит, где были внесены замены. В репо уже есть `sequence-diff.js::sequenceDiff` + `annotateAAChanges` — используется в `PlasmidVersionTree`. Встраиваем в FragmentEditor:

- При монтировании — если у фрагмента есть `partId` и среди parts есть запись с этим id и с `parentId` (т.е. это вариант), вычисляем diff с родителем.
- Формируем `mutatedNtPositions: Set<number>` — позиции изменённых нуклеотидов.
- В DNA-рендере: позиции из set'а подсвечиваются красным фоном (substitution), жёлтым (silent на белковом уровне).
- В protein-рендере: кодоны, содержащие мутации, подсвечиваются тем же цветом по правилу silent/nonsilent.

Если нет родителя — fallback на `fragment.mutations` (список, который уже есть) — подсвечиваем позиции из него.

### Изменения в FragmentEditor.jsx

1. В начало компонента (после `useState`):

```js
import { sequenceDiff } from '../sequence-diff';
import { useStore } from '../store';

// ...inside FragmentEditor:
const parts = useStore(s => s.parts);

const mutationHighlight = useMemo(() => {
  // Returns: Map<ntPosition, 'silent' | 'nonsilent'>
  const map = new Map();

  // Primary source: diff with parent part
  const parent = fragment.parentId
    ? parts.find(p => p.id === fragment.parentId)
    : null;

  if (parent?.sequence && fragment.sequence) {
    const cdsRegions = (fragment.annotations || [])
      .filter(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene'))
      .map(a => ({ start: a.start, end: a.end }));
    const diff = sequenceDiff(parent.sequence, fragment.sequence, cdsRegions);
    for (const sub of diff.substitutions) {
      const kind = sub.aaChange?.silent === false ? 'nonsilent'
                 : sub.aaChange?.silent === true ? 'silent'
                 : 'nonsilent';
      map.set(sub.pos, kind);
    }
    return map;
  }

  // Fallback: use fragment.mutations if no parent
  for (const m of fragment.mutations || []) {
    const pos = m.codonStart ?? m.position ?? 0;
    const len = m.type === 'insertion' ? (m.insertSequence?.length || 0)
              : m.type === 'deletion' ? (m.deletedBp || 1)
              : 3;
    for (let i = pos; i < pos + len; i++) map.set(i, 'nonsilent');
  }
  return map;
}, [fragment.parentId, fragment.sequence, parts, fragment.mutations, fragment.annotations]);
```

2. В DNA-рендере (где рендерится `seq`, char by char) — найти `<span>` с нуклеотидом, добавить:

```jsx
const highlight = mutationHighlight.get(pos);
// ...
<span
  style={{
    // existing styles
    backgroundColor: highlight === 'nonsilent' ? 'rgba(239,68,68,0.25)'
                    : highlight === 'silent' ? 'rgba(234,179,8,0.25)'
                    : undefined,
    borderBottom: highlight ? `2px solid ${highlight === 'nonsilent' ? '#ef4444' : '#eab308'}` : undefined,
  }}
  title={highlight ? `Мутация: ${highlight === 'silent' ? 'silent (same AA)' : 'non-silent'}` : undefined}
>
  {nt}
</span>
```

3. В protein-рендере — аналогично для кодона: если любой из трёх ntPos кодона есть в `mutationHighlight` — подсветить AA тем цветом.

### Тесты

**Unit-тесты** для хелпера `computeMutationHighlights` (если выделить его в отдельную функцию):

```js
// В components/FragmentEditor.jsx экспортировать helper
export function computeMutationHighlights(fragment, parent) {
  // ... логика
}

// Test file: fragment-editor-highlights.test.js
import { computeMutationHighlights } from '../components/FragmentEditor';

describe('mutation highlights', () => {
  it('no parent, no mutations → empty map', () => {
    expect(computeMutationHighlights({ sequence: 'ATG' }, null).size).toBe(0);
  });

  it('single nonsilent substitution A→C in first codon', () => {
    const parent = { sequence: 'ATGGCCTAA' };  // M-A-*
    const fragment = { sequence: 'ATGGCGTAA',  // M-A-* (same AA, silent)
      annotations: [{ level: 'region', type: 'CDS', start: 0, end: 9 }] };
    const m = computeMutationHighlights(fragment, parent);
    expect(m.size).toBe(1);
    expect(m.get(5)).toBe('silent');  // position 5 changed C→G, both → A
  });

  it('nonsilent substitution marked correctly', () => {
    const parent = { sequence: 'ATGGCCTAA' };    // M-A-*
    const fragment = { sequence: 'ATGACCTAA',    // M-T-* (A→T, nonsilent)
      annotations: [{ level: 'region', type: 'CDS', start: 0, end: 9 }] };
    const m = computeMutationHighlights(fragment, parent);
    expect(m.get(3)).toBe('nonsilent');
  });

  it('fallback to fragment.mutations when no parent', () => {
    const fragment = {
      sequence: 'ATGGCGTAA',
      mutations: [{ type: 'substitution', codonStart: 3 }]
    };
    const m = computeMutationHighlights(fragment, null);
    expect(m.get(3)).toBe('nonsilent');
    expect(m.get(4)).toBe('nonsilent');
    expect(m.get(5)).toBe('nonsilent');
  });
});
```

### Проверка

```bash
cd gui/designer && npx vitest run fragment-editor-highlights
cd gui/designer && npx vitest run && npx vite build
```

### Визуальная проверка

- Открыть FragmentEditor на мутировавшем фрагменте (`HygroR_2`).
- DNA-view: три нуклеотида (место мутации) подсвечены красным/жёлтым.
- Белок-view (в mode=Мутагенез, поскольку mode=Правка read-only): AA в позиции мутации подсвечена тем же цветом.
- Tooltip при hover на подсвеченный нуклеотид: «Мутация: silent/nonsilent».

### Коммит

```
feat(fragment-editor): highlight mutations relative to parent (K8, Sprint 1.6)

FragmentEditor now computes mutation positions via sequenceDiff against
the parent part (fragment.parentId → parts store) and highlights:
 - nonsilent (AA-level change) → red background + underline
 - silent (same AA) → yellow background + underline

Fallback for fragments without parent: use fragment.mutations list
(annotated as nonsilent conservatively).

In DNA view: per-nucleotide. In protein view: any codon containing a
mutated nt is highlighted.

+4 unit tests in fragment-editor-highlights.test.js.
Part of fixing K2 visual acceptance from Sprint 1.5.
```

---

## После всех 4 коммитов — финализация Sprint 1.6

### Обновить BUGS.md

Переместить в FIXED:
- **V12** (mode switcher — был в Sprint 1.5, но визуально не прошёл → финально закрыт в Sprint 1.6)
- Новая запись **K5-K8** — «Мутагенез UX v2.1: white-only белок в Правке, биологически корректная обрезка аннотаций, визуальная split-группа, подсветка мутаций».

### Обновить PROJECT_STATE.md

```markdown
### Сессия 21.04.2026 — Sprint 1.6: Мутагенез UX v2.1

После визуальной приёмки Sprint 1.5 K2 (mode switcher) были найдены 4 проблемы
архитектурного уровня. Все закрыты в 4 коммитах Sprint 1.6:

- **K5** (хэш): белок в режиме Правка — read-only с подсказкой и кнопкой
  переключения. Клик по AA не работает на UI и handler уровнях.
- **K6** (хэш): новый `lib/split-annotations.js` с
  `trimAnnotationsForSubFragment` — биологически корректная обрезка аннотаций
  при split. Signal peptide не переживает трим, RE-сайты дропаются на границе,
  CDS переименовываются с суффиксом (5' trimmed) / (3' trimmed).
- **K7** (хэш): split-группа на canvas. `splitGroupId` + метаданные ставятся
  на новые фрагменты. DesignCanvas рендерит группу в контейнере с пунктирной
  рамкой + подложкой + badge + соединительной линией. Финальный визуал —
  после приёмки.
- **K8** (хэш): FragmentEditor подсвечивает мутации относительно parent-part
  через sequenceDiff. Red/yellow по silent/nonsilent.

Тесты: 663 → X (+22..25). Build: clean на всех четырёх.

V12 окончательно закрыт. K2 из Sprint 1.5 остаётся как базовая интеграция
(mode state, identity-guard в handleSaveFragment), на неё наложены K5–K8.
```

### Обновить DECISIONS.md

```markdown
[2026-04-21] **Bookkeeping-edit белка невозможен — архитектурное решение.**
Режим Правка работает только с ДНК. Белок в режиме Правка показывается
read-only с переключателем на Мутагенез. Причина: при правке белка нет
кодона, bookkeeping не имеет смысла (нельзя «исправить запись» на уровне
AA без соответствующей ДНК). Меняет семантику mode switcher из Sprint 1.5:
Правка = только ДНК, Мутагенез = ДНК + AA.

[2026-04-21] **Биологически корректная обрезка аннотаций при split —
`lib/split-annotations.js`.** Три класса правил: point-like (RE, primer_bind,
variation) → drop on trim; N-terminal (signal peptide и родственные) → drop
на partial overlap, survive только при fully-inside + sub начинается с 0
parent'а; всё прочее → trim + flag + rename для CDS/gene. Заменяет прежнюю
coordinate-only логику в `handleSaveFragment`.

[2026-04-21] **Split-группа как явная сущность данных — `splitGroupId` +
метаданные.** При разрезании фрагмента mutagenesis-стратегией новые
фрагменты несут `splitGroupId`, `splitGroupParentName`, `splitGroupIndex`,
`splitGroupTotal`. DesignCanvas группирует соседние фрагменты с одинаковым
`splitGroupId` в визуальный контейнер. KLD путь группу не создаёт (single
fragment in place).
```

### Переместить спеку

```bash
git mv docs/SPRINT_1_6_MUTAGENESIS_V2_1.md docs/archive/
# + пометить в первой строке: `**Статус:** ✅ РЕАЛИЗОВАНО 21.04.2026`
```

### Обновить CURRENT_TASK.md

Очистить до заглушки:

```markdown
# CURRENT_TASK.md

Нет активной задачи.

Следующая: `docs/CLEANUP_DEAD_CODE.md` (чистка мёртвого кода + V11 уже закрыт
в Sprint 1.5, спека будет обновлена перед запуском).
```

---

## Чеклист для Claude Code

**Перед началом:**
- [ ] Sprint 1.5 финализирован: V11/V12/V13/V14 в BUGS FIXED? (V12 может быть снова в OPEN после приёмки — если да, не страшно)
- [ ] На ветке `feature/racetrack-canvas`, baseline 663 тестов
- [ ] Прочитать CLAUDE.md, BUGS.md, эту спеку, `docs/SPRINT_1_5_MUTAGENESIS_V2.md` (для контекста K2)

**K5 — Белок read-only в Правке:**
- [ ] Баннер «Режим просмотра» в tab='regions' + mode='edit'
- [ ] Кнопка «→ Мутагенез» в баннере (вызывает switchMode('mutagenesis') без confirm если mutations=[])
- [ ] `onClick` на AA-span только при `mode === 'mutagenesis'`
- [ ] `cursor: default` на AA-span в Правке
- [ ] Подсказка «Клик → мутагенез» только в Мутагенез
- [ ] 2 новых теста, 1 обновлённый
- [ ] `npx vitest run && npx vite build` — зелено
- [ ] Commit K5

**K6 — Обрезка аннотаций:**
- [ ] Новый файл `lib/split-annotations.js` с `trimAnnotationsForSubFragment`
- [ ] Вызов из `handleSaveFragment` заменяет inline-логику
- [ ] Новый файл `__tests__/split-annotations.test.js` с 15+ тестами
- [ ] Обновить `handle-save-fragment.test.js` если он фиксировал старую семантику
- [ ] `npx vitest run && npx vite build` — зелено
- [ ] Commit K6

**K8 — Подсветка мутаций:**
- [ ] Экспорт helper'а `computeMutationHighlights` из FragmentEditor
- [ ] `useMemo(mutationHighlight, [parent, sequence, mutations, annotations])`
- [ ] Рендер подсветки в DNA view (per-nt)
- [ ] Рендер подсветки в protein view (per-codon)
- [ ] Tooltip «Мутация: silent/nonsilent»
- [ ] Новый файл `__tests__/fragment-editor-highlights.test.js` с 4 тестами
- [ ] `npx vitest run && npx vite build` — зелено
- [ ] Commit K8

**K7 — Split-группа (визуал):**
- [ ] `splitGroupId` + `splitGroupParentName` + `splitGroupIndex` + `splitGroupTotal` проставляются в `handleSaveFragment` для two/multi-fragment
- [ ] Группировочная функция `groupBySplit` в DesignCanvas
- [ ] Рендер контейнера split-группы с 4 визуальными эффектами (dashed border / tinted backdrop / badge / connector line)
- [ ] Junction между внутренними членами группы — свой стиль (можно оставить как есть, если не мешает)
- [ ] Новый файл `__tests__/split-group-rendering.test.jsx` с 3 тестами
- [ ] `npx vitest run && npx vite build` — зелено
- [ ] Commit K7

**Остановка на визуальную приёмку.** После K7 — `STOP`. Не закрывать Sprint 1.6 до визуальной приёмки Игорем. Не обновлять PROJECT_STATE/DECISIONS/BUGS до подтверждения.

**После визуальной приёмки:**
- [ ] Убрать или оставить каждый из 4 визуальных эффектов K7 по решению Игоря
- [ ] Финализация (BUGS FIXED, PROJECT_STATE журнал, DECISIONS, архив спеки)
- [ ] Очистка CURRENT_TASK.md до заглушки

---

## Риски

**R1: K7 breakage.** Split-group рендер может сломать существующие assembly-scenarios. Митигация: группа активируется только при `splitGroupId` presence — старые assemblies без этого поля рендерятся как раньше.

**R2: K6 ломает существующие fragments в store.** Legacy-плазмиды в localStorage могут иметь аннотации с `trimmed: true` без правильных суффиксов в именах. Митигация: helper делает idempotent check (`!a.name.includes('trimmed')` guard перед append'ом), а legacy-аннотации не перестраиваются при открытии — только при следующем split'е.

**R3: K8 ложно-положительные мутации.** Если у фрагмента `parentId` указывает на part, который был независимо отредактирован (не через мутагенез), diff покажет все отличия как «мутации». Митигация: в v1.0 принимаем — parent-tree обычно детерминистичен (parentId ставится только при создании варианта). В v1.1 добавить поле `fragment.diffBasis` с конкретным hash или timestamp.

**R4: Тесты K7 падают в jsdom из-за отсутствия getBoundingClientRect.** Митигация: мокать на уровне теста, или проверять только classList / textContent, избегая геометрии.

---

## Открытые вопросы (к Chat если сомнение)

1. **Нужен ли splitGroupId для KLD-пути?** Сейчас спека говорит — нет, KLD остаётся single fragment in place. Но если пользователь сделает серию KLD-ов на одном фрагменте, parentId-цепочка длинная. Пока не делаем, решается когда появится use-case.

2. **Что если Wizard вернёт split на template, которого нет на canvas?** `handleMutagenesis` (не `handleSaveFragment`) — отдельная ветка. Там Code сейчас ставит `id` и `isMutagenesis`, но не splitGroupId. Если Wizard-юзкейс даёт split — стоит добавить splitGroupId туда тоже. В `mutagenesis.js::computeMutagenesisStrategy` лучше: возвращать `splitGroupId: null` для KLD и готовый `sg_...` для multi. Caller просто копирует в каждый фрагмент.

3. **Mutagenesis junction внутри split-группы — свой стиль?** Сейчас Code оставит как есть. Если визуально конфликтует с группой — поправим после приёмки.

---

**Конец спеки.**

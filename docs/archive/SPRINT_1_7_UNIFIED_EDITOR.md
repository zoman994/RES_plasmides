# SPRINT_1_7_UNIFIED_EDITOR.md — Unified Editor + Virtual Full Sequence + Topology

**Статус:** ✅ РЕАЛИЗОВАНО 22.04.2026 (коммиты `1cffe1b`, `853535f`, `b2e21ed`, `2c6d735`; визуальная приёмка пройдена по 4 блокам на HygroR — PASS)
**Автор спеки:** Claude Chat, 21.04.2026
**Приоритет:** HIGH — закрывает остатки Sprint 1.6 (V15/V16/V17) + устраняет tabs-артефакт из Sprint 1.5 K2
**Оценка времени:** 7–9 часов, 4 коммита
**Ветка:** `feature/racetrack-canvas` (продолжение после Sprint 1.6 `chore(sprint-1.6): close`)
**Предыдущий этап:** Sprint 1.6 — K5 (read-only белок), K6 (split-annotations), K7 (split-группа), K8 (mutation highlights) формально закрыты. Визуальная приёмка выявила три бага (V15/V16/V17) + архитектурный запрос на Unified Editor → этот спринт.

---

## Контекст: что принесла визуальная приёмка Sprint 1.6

Тестовый сценарий тот же, что и в 1.6: Gibson из EGFP + HygroR, single substitution в HygroR → two_fragment split на HygroR_1 (42 bp, templateStart=0) + HygroR_2 (981 bp, templateStart=42). После реализации K5–K8 приняли четыре технических фичи, нашли три новых бага и одно концептуальное замечание:

**V15 — подсветка `isMutated` работает не так, как выглядит.** В белковой вкладке (`FragmentEditor.jsx`, ~строка 760) мутации AA-позиции проверяются через `mutations.some(m => m.label?.includes(String(pos)))` — подстрочное сравнение. Для HygroR с мутациями вроде `G26A, R135A, G77C, C403G` любая AA-позиция, номер которой встречается в label любой мутации, подсвечивается жёлтым: `pos=26` ловится внутри любого label, содержащего «26»; `pos=3` ловится в «135», «403», «26» и так далее. Биологически ложные срабатывания видны сразу — на белке 500+ AA подсвечивается половина.

**V16 — подсветка мутаций в split sub-фрагменте показывает весь ген как мутации.** `computeMutationHighlights` из K8 делает `sequenceDiff(parent.sequence, fragment.sequence, cdsRegions)` — «в лоб», без учёта `fragment.templateStart`. Для HygroR_2 (`templateStart=42`, parent HygroR 1023 bp) child.sequence начинается на 42-й позиции родителя, а diff сравнивает нулевую позицию child'а с нулевой позицией parent'а. Все ~981 позиций оказываются «отличающимися», подсветка теряет смысл.

**V17 — одинокий линейный фрагмент рендерит decorative overlap-junction справа.** После split + удаления sub-fragment_2 (оставили только HygroR_1 на canvas) справа от единственного фрагмента остаётся 30-bp overlap-junction, которому не с чем соединяться. Визуальный шум, для пользователя выглядит как «что-то ломается».

**Концептуальное замечание — tabs в FragmentEditor лишние.** Tabs «Последовательность» / «Белок» появились в Sprint 1.5 K2 как контейнер для mode switcher radio-блока. После K5 (белок read-only в Правке) tab «Белок» превратился в «просмотр с подсказкой». Правильная информационная модель: **sequence — primary view**, аннотации/мутации/белок-summary — панели *под* ней или *сбоку*. Mode (Правка / Мутагенез) остаётся как ортогональная ось — он меняет семантику клика, а не разделение контента.

---

## Стратегия: одна страница вместо двух вкладок, виртуальный взгляд на split-группу, явная топология

**K9** — hotfix V15 и V16 как минимальные точечные правки. Оба — regression'ы Sprint 1.6, закрываем в одном коммите до рефакторинга K10. Это даёт визуальную корректность подсветки мутаций **до** того, как мы начнём перестраивать layout.

**K10** — Unified Editor. Убираем tabs, оставляем mode switcher. Layout:

```
┌──────────────────────────────────────────────────────────┐
│ [mode: Правка | Мутагенез]                               │
│ fragment name + length + mutation labels   [× close]     │
├──────────────────────────────────────────────────────────┤
│ Sequence (DNA + AA под каждым кодоном для CDS)           │
│ [clickable nt в обоих mode'ах, clickable AA в Мутагенезе]│
├──────────────────────────────────────────────────────────┤
│ footer: длина / frame / GC / ATG / stop / [копировать]   │
├──────────────────────────────────────────────────────────┤
│ Annotations panel (collapsible по умолчанию открыта)     │
│  - table of regions + details + points                   │
│  - Auto-annotate button                                  │
├──────────────────────────────────────────────────────────┤
│ Mutations panel (collapsible, показывается при mutations)│
│  - список применённых мутаций + [X] для undo             │
├──────────────────────────────────────────────────────────┤
│ [Save routed by mode]                                    │
└──────────────────────────────────────────────────────────┘
```

Save handlers (`handleSaveEdit` / `handleSaveMutagenesis` / `handleSaveAsVariant`) не меняются — это контракт со store. V15 попутно закрывается при переписывании protein rendering, потому что в Unified layout подсветка считается через единый `mutationHighlight` Map (из K8 + K9 fix) — legacy substring-проверка уходит полностью.

**K11** — virtual full mutant sequence для split-группы. Когда пользователь открывает один sub-фрагмент (например HygroR_2) в Unified Editor, сверху появляется toggle «Этот фрагмент (981 bp) / Полный ген (1023 bp)». В full-view рендерится полная mutant sequence parent'а (с мутациями), текущий sub-фрагмент выделен, навигация ← prev / next → между другими sub'ами группы. Это решает реальный биологический запрос: split — технический артефакт сборки, ген один.

**K12** — fragment topology toggle. Новое поле `fragment.topology: 'linear' | 'circular'` (опциональное, fallback на assembly-level). UI: toggle в PartBlock context menu + в Unified Editor header. V17 попутно закрывается: при n=1 и fragment-linear (или assembly-linear) junctions-массив принудительно пуст, decorative junction не рендерится.

---

## Задачи

### K9 — Hotfix V15 (isMutated) + V16 (templateStart в highlights)
**Файлы:** `components/FragmentEditor.jsx` (2 места), новые unit-тесты
**Оценка:** 1–1.5 часа
**Делаем первой итерацией** — чтобы потом при визуальной приёмке K10 не путаться, что именно сломано.

### K10 — Unified Editor (убрать tabs)
**Файлы:** `components/FragmentEditor.jsx` (структурный рефакторинг), возможно `components/AnnotationEditor.jsx` (адаптация под встраивание)
**Тесты:** обновление existing integration-тестов + 3–4 новых на unified layout
**Оценка:** 3.5–4.5 часа (крупнейший блок спринта)

### K11 — Virtual full mutant sequence для split-группы
**Файлы:** `hooks/useFragmentHandlers.js` (проброс `mutantSequence` на sub-фрагменты), `components/FragmentEditor.jsx` (toggle + full-view renderer + split-group navigation), `mutagenesis.js` (экспорт вспомогательных helpers при необходимости)
**Тесты:** unit на проброс метаданных + integration на toggle
**Оценка:** 2–2.5 часа

### K12 — Fragment topology toggle + V17 fix
**Файлы:** `components/FragmentEditor.jsx` (header toggle), `components/PartBlock.jsx` или `components/DesignCanvas.jsx` (context menu item), `hooks/useFragmentHandlers.js` (setter) или новый store action, `components/DesignCanvas.jsx` (junctions rendering guard при n=1 linear)
**Тесты:** integration на toggle + regression на V17
**Оценка:** 1–1.5 часа

**Порядок выполнения:** K9 → K10 → K11 → K12. K9 даёт корректную базу подсветки. K10 переписывает layout, попутно заменяя rendering из K9 на единый. K11 надстраивается над K10 (full-view — отдельный renderer, но toggle живёт в том же header'е что и mode switcher из K10). K12 — последним, потому что topology toggle в header'е K10 становится третьим элементом (mode + topology + close), и его удобнее клеить поверх уже зафиксированного layout'а.

---

## K9 — Hotfix V15 + V16

### Контекст

Два регрессиона из Sprint 1.6, оба в `FragmentEditor.jsx`. Оба закрываются минимальным кодом (≤10 строк), оба — коренные причины заявлены в BUGS.md и подтверждены чтением кода.

### V15 — substring-проверка в protein view

**Текущий код (~строка 760, блок `tab === 'regions'` → protein rendering):**

```jsx
const isMutated = mutations.some(m => m.label?.includes(String(pos)));
```

Здесь `pos = i + 1` — 1-based AA-индекс. `m.label` — строка типа `"G26A"`, `"ins125+3п.н."`, `"Δ10-12 (ATG)"`, `"T135A (A4..)"`. Любая AA-позиция, цифровая подпись которой встречается как подстрока в любом label, срабатывает ложно.

**Правильный подход.** У mutations из FragmentEditor есть численные поля, уже проставляемые при создании:

- AA substitution (`inlineSubstitution`): `{ codonStart: aaPosition * 3, label: "G26A" }` — `codonStart` это 0-based nt-индекс.
- AA deletion (`inlineDeletion`): `{ label: "Δ10-12" }` — численного поля нет, но `deletedBp` есть.
- nt substitution: `{ codonStart: pos, position: pos, label: ... }` — оба поля 0-based nt.
- nt deletion: `{ codonStart: pos, position: pos, deletedBp, label }`.
- nt insertion: `{ codonStart: pos, position: pos, label }`.

Итого все mutations, кроме AA-deletion, несут `codonStart` или `position` — 0-based nt-индекс. Для AA-deletion из `inlineDeletion` проставим `codonStart` явно (см. ниже), чтобы закрыть случай и не полагаться на label.

**Fix.** Ввести helper в FragmentEditor (не вытаскиваем в общий модуль — локальная утилита для рендеринга):

```js
/**
 * K9 — check whether mutation `m` hits the AA at 1-based position `aaPos`.
 * Always numeric — never label-based.
 */
function mutationHitsAA(m, aaPos) {
  const nt = m.codonStart ?? m.position;
  if (nt == null) return false;
  // 1-based AA position covers nt [aaPos*3 - 3, aaPos*3)
  const aaStart = (aaPos - 1) * 3;
  const aaEnd = aaPos * 3;
  // Insertion / deletion: extend length
  const span = m.type === 'insertion' || m.type === 'nt_insertion'
    ? (m.insertSequence?.length || 3)
    : m.type === 'deletion' || m.type === 'nt_deletion'
    ? (m.deletedBp || 3)
    : 3;
  return nt < aaEnd && nt + span > aaStart;
}
```

И заменить:

```jsx
const isMutated = mutations.some(m => mutationHitsAA(m, pos));
```

**Параллельно (небольшой сопутствующий фикс, в область V15).** `inlineDeletion` в `mutagenesis.js` не возвращает `codonStart`. Добавить его в возвращаемый объект:

```js
// mutagenesis.js :: inlineDeletion
return {
  sequence: sequence.slice(0, start) + sequence.slice(start + delLen),
  codonStart: start,   // ← ДОБАВИТЬ
  position: start,     // ← ДОБАВИТЬ (для единообразия с nt-мутациями)
  label: count === 1 ? `Δ${fromAA}${aaPosition + 1}` : `Δ${aaPosition + 1}-${aaPosition + count}`,
  deletedBp: delLen,
};
```

Это backward-совместимо: поля добавляются, существующая логика не ломается.

### V16 — templateStart в computeMutationHighlights

**Текущий код (`computeMutationHighlights`, строки ~37-62):**

```js
if (parent?.sequence) {
  const cdsRegions = (fragment.annotations || [])
    .filter(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene'))
    .map(a => ({ start: a.start, end: a.end }));
  const diff = sequenceDiff(parent.sequence, fragment.sequence, cdsRegions);
  for (const sub of diff.substitutions) {
    const kind = sub.aaChange?.silent === true ? 'silent' : 'nonsilent';
    map.set(sub.pos, kind);
  }
  return map;
}
```

`parent.sequence` длиной 1023, `fragment.sequence` длиной 981 (sub-fragment с `templateStart=42`). `sequenceDiff` пробегает до `Math.min(1023, 981) = 981` позиций и сравнивает `parent[0]` с `fragment[0]`, хотя `fragment[0]` по биологии равен `parent[42]`.

**Fix.**

```js
if (parent?.sequence) {
  const offset = fragment.templateStart || 0;
  const parentSlice = parent.sequence.slice(offset, offset + fragment.sequence.length);

  // cdsRegions переопределяются в локальной системе координат sub-фрагмента
  // (fragment.annotations уже в локальной системе после K6 trimAnnotationsForSubFragment).
  const cdsRegions = (fragment.annotations || [])
    .filter(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene'))
    .map(a => ({ start: a.start, end: a.end }));

  const diff = sequenceDiff(parentSlice, fragment.sequence, cdsRegions);
  for (const sub of diff.substitutions) {
    const kind = sub.aaChange?.silent === true ? 'silent' : 'nonsilent';
    map.set(sub.pos, kind);
  }
  return map;
}
```

Важно: `parentSlice` может быть короче `fragment.sequence` (если `templateEnd > parent.length` — редкий случай, но возможный при некорректных данных). `sequenceDiff` уже обрабатывает разные длины через `Math.min`, так что код устойчив.

Для non-split фрагментов (`templateStart == null`) поведение не меняется — `offset = 0`, `parentSlice === parent.sequence.slice(0, fragment.sequence.length)`.

### Тесты

**Обновить существующий `fragment-editor-highlights.test.js` (из K8):**

Добавить тест-кейс с `templateStart`:

```js
it('K9/V16: honors templateStart when diffing against parent', () => {
  const parent = { sequence: 'A'.repeat(42) + 'ATGGCCTAA' };  // 51 bp, sub начинается с 42
  const fragment = {
    sequence: 'ATGACCTAA',          // M-T-* (A→T at sub-position 3)
    templateStart: 42,
    annotations: [{ level: 'region', type: 'CDS', start: 0, end: 9 }],
  };
  const m = computeMutationHighlights(fragment, parent);
  expect(m.size).toBe(1);
  expect(m.get(3)).toBe('nonsilent');  // 3 в локальной системе sub-fragment
});

it('K9/V16: templateStart=0 (regular fragment) matches old behavior', () => {
  const parent = { sequence: 'ATGGCCTAA' };
  const fragment = {
    sequence: 'ATGACCTAA',
    templateStart: 0,
    annotations: [{ level: 'region', type: 'CDS', start: 0, end: 9 }],
  };
  const m = computeMutationHighlights(fragment, parent);
  expect(m.get(3)).toBe('nonsilent');
});
```

**Новый файл `__tests__/fragment-editor-ismutated.test.js`:** на `mutationHitsAA` helper (экспорт из FragmentEditor):

```js
import { mutationHitsAA } from '../components/FragmentEditor';

describe('K9/V15 — mutationHitsAA numeric comparison', () => {
  it('AA substitution at codonStart=75 hits AA pos 26 (not pos 3 or 7)', () => {
    const m = { type: 'substitution', codonStart: 75, label: 'G26A' };
    expect(mutationHitsAA(m, 26)).toBe(true);
    expect(mutationHitsAA(m, 25)).toBe(false);
    expect(mutationHitsAA(m, 27)).toBe(false);
    expect(mutationHitsAA(m, 3)).toBe(false);   // substring '26' was the bug
    expect(mutationHitsAA(m, 7)).toBe(false);
  });

  it('G26A does NOT hit AA 135 or 403 (the V15 false-positive set)', () => {
    const m = { type: 'substitution', codonStart: 75, label: 'G26A' };
    expect(mutationHitsAA(m, 135)).toBe(false);
    expect(mutationHitsAA(m, 403)).toBe(false);
  });

  it('nt substitution at position 100 hits AA 34 (codon 34 = nt 99..102)', () => {
    const m = { type: 'nt_substitution', codonStart: 100, position: 100, label: 'A101T' };
    expect(mutationHitsAA(m, 34)).toBe(true);
  });

  it('deletion of 6 bp starting at nt 300 hits AA 101 and 102', () => {
    const m = { type: 'nt_deletion', codonStart: 300, deletedBp: 6, label: 'Δ301-306' };
    expect(mutationHitsAA(m, 101)).toBe(true);
    expect(mutationHitsAA(m, 102)).toBe(true);
    expect(mutationHitsAA(m, 103)).toBe(false);
  });

  it('insertion with insertSequence of 9 bp at nt 30 hits AA 11, 12, 13', () => {
    const m = { type: 'nt_insertion', codonStart: 30, insertSequence: 'ATGATGATG', label: 'ins31+9п.н.' };
    expect(mutationHitsAA(m, 11)).toBe(true);
    expect(mutationHitsAA(m, 12)).toBe(true);
    expect(mutationHitsAA(m, 13)).toBe(true);
  });

  it('mutation with null/undefined codonStart and position returns false', () => {
    expect(mutationHitsAA({ label: 'G26A' }, 26)).toBe(false);
  });
});
```

### Проверка

```bash
cd gui/designer && npx vitest run fragment-editor-ismutated
cd gui/designer && npx vitest run fragment-editor-highlights
cd gui/designer && npx vitest run && npx vite build
```

### Визуальная проверка (Игорь)

- Открыть HygroR_2 (sub-фрагмент из split-группы) в FragmentEditor, tab «Белок».
- Ожидание: жёлтым подсвечивается **только** AA-позиции, совпадающие по числу с номерами реально применённых мутаций. Для фрагмента без мутаций — ничего не подсвечено.
- Открыть тот же HygroR_2 без явно заданных mutations (они в `variant` part через `partId`, если K8 работает) — ожидание: красная/жёлтая подсветка в точности в месте реальных substitution'ов (1–2 кодона), не всё подряд.

### Коммит

```
fix(fragment-editor): V15 substring-bug + V16 templateStart in highlights (K9, Sprint 1.7)

V15 — isMutated in protein view was using m.label?.includes(String(pos)),
which false-positives for any AA whose numeric label happens to be a
substring of another mutation's label (pos=26 matches "G26A", "R135A",
"C403G", etc). Fixed by introducing mutationHitsAA(m, aaPos) helper that
compares numeric codonStart/position against AA-range, never label.

V16 — computeMutationHighlights was diffing parent.sequence against
fragment.sequence without honoring fragment.templateStart, so split
sub-fragments with templateStart > 0 showed the entire gene as mutated.
Fixed by slicing parent.sequence[templateStart : templateStart+length]
before passing to sequenceDiff.

Supporting tweak: inlineDeletion in mutagenesis.js now returns codonStart
and position (was only deletedBp + label), so AA-deletions behave uniformly
with nt-deletions under mutationHitsAA.

+6 unit tests in fragment-editor-ismutated.test.js,
+2 unit tests in fragment-editor-highlights.test.js.
```

---

## K10 — Unified Editor (убрать tabs)

### Концепция

Tabs «Последовательность» / «Белок» уходят. Остаётся одна вертикальная колонка:

1. **Header** — mode switcher (Правка / Мутагенез), fragment name + length + mutation badges, close button.
2. **Sequence view** — DNA grid с AA под каждым codon'ом (для CDS) или plain DNA (для non-CDS). Nucleotide-клики работают в обоих режимах (в Правке — bookkeeping DNA edit, в Мутагенезе — через strategy engine). AA-клики работают только в Мутагенезе (из K5).
3. **Sequence footer** — длина / frame / GC / ATG / stop / copy (сейчас это `<div className="flex justify-between items-center mb-3">`).
4. **Annotations panel** — collapsible block, открыт по умолчанию. Содержит `<AnnotationEditor />` + Auto-annotate button + кнопку Add.
5. **Mutations panel** — collapsible, показывается когда `mutations.length > 0`. Список применённых мутаций + [×] для undo каждой.
6. **Protein summary** — collapsible block (только для CDS), свёрнут по умолчанию. Содержит то, что было внутри tab «Белок»: полный перевод как отдельный grid с highlight'ами domains/details, **БЕЗ кликабельности** (клики идут из основной sequence view через codon-level AA). Это вспомогательный «обзор белка» — по запросу пользователя.
7. **Save row** — как сейчас (`handleSaveEdit` / `handleSaveMutagenesis` / `handleSaveAsVariant`).

Никакой логики мутагенеза не меняется: все handlers (`applyMut`, `applyDel`, `applyMultiMut`, `commitCodonEdit`, `applyDnaSub`, `applyDnaDel`, `applyDnaInsert`, `handleSaveEdit`, `handleSaveMutagenesis`, `handleSaveAsVariant`) остаются как есть. Меняется только layout.

### Важные решения

**R1: Куда девать `editMode` (`'view' | 'edit'`) для non-CDS?**
Сейчас `editMode` переключает между view (clickable nt) и edit (textarea). В Unified Editor сохраняем кнопку `[✏️ Редактировать]` / `[👁 Просмотр]` в footer sequence (где сейчас). Textarea рендерится прямо на месте sequence view при `editMode === 'edit'`. Для CDS textarea не нужна — есть inline codon editing через `editingCodon`.

**R2: Кликабельность AA в Правке (K5 результат).**
Сейчас в K5 tab «Белок» в edit mode read-only с баннером «Режим просмотра». В Unified Editor протеиновая строка (AA под кодонами) видна всегда. В режиме Правка AA-клики по-прежнему no-op:
- onClick только при `mode === 'mutagenesis'`
- `cursor: default` в Правке
- `openMutMenu` сохраняет early-return по `mode === 'edit'` (defence-in-depth)

Вместо баннера (который привязан к tab'у которого больше нет) — неявная подсказка в footer sequence: текущая строка «Нуклеотид → мутация ДНК · Аминокислота → замена АК · Shift → диапазон» показывается только в mode='mutagenesis'. В Правке подсказка меняется на «Клик по нуклеотиду — правка ДНК. Для мутагенеза переключите режим выше».

**R3: Protein summary — что именно там.**
Смотрим на текущий блок `tab === 'regions'` → protein view. Там:
- Полный protein как рендер AA по 50 в строке, с подсветкой domains/details и mutation highlights.
- Secondary: `AnnotationEditor` для discrete annotations.
- Legacy domain add form.

В Unified Editor:
- Protein rendering (AA по 50 в строке с details highlight) → **Protein summary panel** (collapsible, свёрнут).
- `AnnotationEditor` → **Annotations panel** (collapsible, открыт).
- Legacy domain add form → внутрь AnnotationEditor panel.

Читабельность: AA под каждым кодоном в основной sequence view — это уже полный белок, просто разрезанный по 10 кодонов на строку. Protein summary — это «тот же белок, но 50 AA на строку, компактнее». Зачем оба? Ответ: grid 10 кодонов на строку растянут на 100+ строк для генов 1 kb — основная работа идёт там. Protein summary даёт 50 AA на строку — 1 kb CDS помещается в 7 строк, удобно для обзора domains.

**R4: `modification` и `handleSaveAsVariant` button.**
Сейчас `handleSaveAsVariant` кнопка (`🔀 Как вариант`) показывается в Save row только при `seqChanged && onSaveAsVariant`. В Unified Editor оставляем ту же логику, только теперь кнопка видна всегда (не только в tab=edit + mode=mutagenesis как сейчас через условия).

**R5: `addForm` legacy domain add.**
Не трогаем. Форма открывается из AnnotationEditor через prop / callback. В Unified Editor `<AnnotationEditor />` принимает те же props + может принять `onRequestAddForm` если нужно.

### Изменения в коде

#### Шаг 1: Удалить `tab` state и tab-navigation

Удалить:
- `const [tab, setTab] = useState('edit');`
- JSX-блок с tab buttons (`<div className="flex gap-0 rounded-lg overflow-hidden border mb-3">...</div>`)
- Все `{tab === 'edit' && ...}` и `{tab === 'regions' && ...}` conditionals — раскрываем содержимое.

#### Шаг 2: Sequence view — раскрыть содержимое `tab === 'edit'` блока

Раскрываем `<>...</>` под mode switcher'ом и seqChanged/mutagenesis хинтами. Hint'ы оставляем как есть:

```jsx
{seqChanged && mode === 'edit' && (
  <div className="text-[9px] text-amber-600 bg-amber-50 rounded px-2 py-1 mb-2">
    ⚠ Последовательность изменена. При сохранении праймеры будут сброшены.
  </div>
)}
{mode === 'mutagenesis' && mutations.length === 0 && (
  <div className="text-[9px] text-purple-500 bg-purple-50 rounded px-2 py-1 mb-2">
    🧬 Кликните по кодону (ДНК) или аминокислоте (АК) для мутагенеза.
  </div>
)}
```

Quick actions (строка `{QUICK_ACTIONS.filter(...).map(...)}`) остаются как есть, disabled в mode='mutagenesis'.

CDS nucleotide view (строки ~450-495) — как есть.
Non-CDS view modes (editMode=view | edit) — как есть.
Footer row (длина / frame / GC / buttons) — как есть.

#### Шаг 3: Annotations panel — сделать collapsible

Создать collapsible wrapper (можно обычный `<details open>` или `useState` toggle):

```jsx
const [panelsOpen, setPanelsOpen] = useState({
  annotations: true,
  mutations: true,
  protein: false,
});

function Panel({ id, title, badge, children }) {
  const isOpen = panelsOpen[id];
  return (
    <div className="border rounded-lg mb-3">
      <button
        onClick={() => setPanelsOpen(p => ({ ...p, [id]: !p[id] }))}
        className="w-full px-3 py-2 text-xs font-semibold text-left flex items-center justify-between hover:bg-gray-50"
      >
        <span>{isOpen ? '▾' : '▸'} {title}</span>
        {badge && <span className="text-[9px] text-gray-400">{badge}</span>}
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
```

Использование:

```jsx
<Panel id="annotations" title="Аннотации" badge={`${annotations.length}`}>
  {/* bulk-actions, AnnotationEditor, legacy add form */}
  <div className="flex items-center justify-end mb-2">
    <button onClick={() => setAnnotations(autoAnnotate({ ...fragment, sequence: seq, annotations: annotations.filter(a => a.level === 'region' && !a.auto) }))}
      className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">🔍 Авто</button>
  </div>
  <AnnotationEditor annotations={annotations} seqLength={seq.length} onChange={setAnnotations} compact />
  {addForm && ( /* legacy domain add form — копируем как есть */ )}
</Panel>

{mutations.length > 0 && (
  <Panel id="mutations" title="Мутации" badge={`${mutations.length}`}>
    <div className="space-y-1">
      {mutations.map((m, mi) => (
        <div key={mi} className="flex items-center justify-between text-[10px] bg-purple-50 text-purple-700 rounded px-2 py-1">
          <span className="font-mono">{m.label}</span>
          <button
            onClick={() => setMutations(prev => prev.filter((_, i) => i !== mi))}
            className="text-purple-400 hover:text-purple-600 text-xs ml-2"
            title="Убрать мутацию из списка">✕</button>
        </div>
      ))}
    </div>
    <div className="text-[9px] text-gray-400 mt-2">
      Кнопка ✕ убирает мутацию только из списка — последовательность не откатывается.
      Для отката используйте Cancel этого диалога.
    </div>
  </Panel>
)}

{isCDS && (
  <Panel id="protein" title="Белок (обзор)" badge={`${totalAA} а.о.`}>
    {/* Вычисление getColor / details / protein rendering — копия текущего tab='regions' */}
    {/* ВАЖНО: убрать clickable-обвязку AA. В обзоре — read-only в обоих mode'ах. */}
    {/* Mutation highlights — применяются через mutationHighlight (K8+K9) */}
    {/* Legacy domain add form — не дублируем, он один раз в Annotations panel */}
  </Panel>
)}
```

**Критичное:** в protein summary **нет** onClick на AA (в обоих режимах read-only). Клики для мутагенеза AA идут из основной sequence view (там AA под каждым кодоном, уже clickable при mode='mutagenesis'). Это устраняет двойственность: был клик в tab=regions на AA в 50-wide view **и** клик в tab=edit на AA в 10-codon view — одно и то же действие в двух местах. Оставляем только второе.

#### Шаг 4: Non-CDS case

Для non-CDS:
- Sequence view остаётся (edit-mode: textarea; view-mode: clickable nt).
- Annotations panel — сохраняется (AnnotationEditor работает для всех fragment types).
- Mutations panel — сохраняется.
- Protein panel — скрыта (`isCDS === false`).

#### Шаг 5: Mutation highlights — единая точка применения

Убеждаемся что `mutationHighlight` Map применяется:
- В sequence view (DNA) — уже применён в K8+K9.
- В protein summary — применён per-codon через current protein view renderer.

Условие `{ tab === 'regions' && mode === 'mutagenesis' && <hint>...</hint> }` больше не применимо — hint сейчас идёт в footer sequence view, управляемый только `mode`.

#### Шаг 6: Визуальная чистка

Модалка сейчас `w-[680px]`. В Unified layout контента больше по вертикали — проверить что `max-h-[85vh] overflow-y-auto` удерживает. При необходимости увеличить width до `w-[780px]` или добавить horizontal-split (annotations справа от sequence). По умолчанию остаёмся с одной колонкой 680 — это базовое UX-решение, horizontal-split — отложенная оптимизация для v1.1.

### Тесты

**Обновить existing tests:**

- `fragment-editor-mode-switcher.test.jsx` (из Sprint 1.5 K2) — удалить assertions про `tab` buttons, оставить assertions про mode switcher. Проверки `getByRole('radio', { name: /Правка/ })` продолжают работать.
- `fragment-editor-read-only.test.jsx` (из Sprint 1.6 K5) — баннер «Режим просмотра» больше не в tab'е «Белок», а либо в footer sequence, либо убран совсем. Обновить assertions.
- `fragment-editor-highlights.test.js` (из Sprint 1.6 K8, обновлён в K9) — рендер-тесты могут предполагать tab='regions' для protein. Адаптировать: открыть Protein panel через `click(/Белок/)` и затем проверить подсветку.
- `handle-save-fragment.test.js` — не должно измениться (save-пути не тронуты). Прогнать как sanity-check.

**Новые тесты (`__tests__/fragment-editor-unified.test.jsx`):**

```jsx
describe('FragmentEditor — Unified layout (K10)', () => {
  it('does NOT render tab buttons (Последовательность / Белок)', () => {
    // render FragmentEditor
    // expect queryByRole('button', { name: /Последовательность/ }) to be null
    // expect queryByRole('button', { name: /Белок/ }) to be null
  });

  it('renders mode switcher (Правка / Мутагенез) in both CDS and non-CDS', () => {
    // render CDS fragment → assert radio roles present
    // render non-CDS fragment → same
  });

  it('annotations panel is open by default, collapses on click', () => {
    // render → assert AnnotationEditor visible
    // click "Аннотации" header → assert hidden
    // click again → visible
  });

  it('mutations panel only appears when mutations.length > 0', () => {
    // render fragment with mutations=[] → assert no "Мутации" panel
    // apply mutation via AA click → assert "Мутации" panel appears, badge "1"
  });

  it('protein panel only renders for CDS fragments', () => {
    // render CDS → "Белок (обзор)" panel visible (collapsed)
    // render non-CDS → no protein panel
  });

  it('protein panel AAs are read-only in both modes (no onClick)', () => {
    // render CDS, open protein panel, mode='mutagenesis'
    // click on AA in protein panel → mutTarget remains null
    // (primary AA clicks work in sequence view codon-grid — tested separately)
  });

  it('save button routes to handleSaveEdit in mode=edit and handleSaveMutagenesis in mode=mutagenesis', () => {
    // existing assertions from Sprint 1.5 K2 test — just re-run to ensure no regression
  });
});
```

### Визуальная проверка

- Открыть HygroR, сравнить с K5 baseline: нет tabs, сверху mode switcher, ниже — sequence view, ниже — collapsible panels.
- Переключить mode на Мутагенез: подсказка внизу sequence поменялась, AA-клики работают.
- Открыть «Белок (обзор)» — полный перевод виден, клики не работают (cursor default).
- Apply substitution → в sequence view подсветка, в protein обзоре подсветка того же AA, Mutations panel открылся.
- Save — сохраняет корректно в обоих режимах.

### Коммит

```
refactor(fragment-editor): Unified Editor layout — remove tabs (K10, Sprint 1.7)

Remove the "Последовательность / Белок" tab split that Sprint 1.5 K2
introduced as a radio-container. After K5 made protein read-only in
edit mode, the tab reduced to a collapsed view; the right structure is
sequence-as-primary with collapsible annotation / mutation / protein
panels beneath it.

Layout:
  [mode switcher] — header
  sequence view (DNA + AA under codons for CDS) — primary
  footer (length / frame / GC / copy / edit-mode toggle)
  [▾ Annotations]  (open by default)
  [▾ Mutations]    (open when mutations > 0)
  [▸ Protein]      (CDS only, collapsed by default)
  [save row]

AA clicks in protein panel are read-only in BOTH modes. AA-level
mutagenesis is driven from the sequence view codon grid (already
clickable in mutagenesis mode from K5). Sequence view in edit mode
remains editable for DNA bookkeeping.

handleSaveEdit, handleSaveMutagenesis, handleSaveAsVariant — unchanged.
switchMode, openMutMenu, applyMut, applyDnaSub et al. — unchanged.

+7 new integration tests in fragment-editor-unified.test.jsx,
update 4 existing tests for the new layout.
```

---

## K11 — Virtual full mutant sequence для split-группы

### Концепция

Когда пользователь открывает один sub-фрагмент split-группы (HygroR_2, 981 bp, templateStart=42) в Unified Editor, он видит только свой кусок. Биологически это один ген, просто разрезанный технически ради PCR. Хочется видеть весь ген с мутациями + область текущего sub-фрагмента.

В `makeFragmentStrategy` (`mutagenesis.js`) уже вычисляется `mutantSequence` — полная mutant DNA parent'а. Она возвращается в `result.mutantSequence`, но не пробрасывается в sub-фрагменты.

### Данные

Ввести поля в объект sub-фрагмента (при split'е):

```js
{
  ...existing fields (splitGroupId, templateStart, templateEnd, annotations...),
  splitGroupFullSequence: result.mutantSequence,    // полная мутант-последовательность родителя
  splitGroupFullLength: result.mutantSequence.length,
  // templateStart + fragment.sequence.length уже дают область этого sub в full-view
}
```

`splitGroupFullSequence` дублируется в каждом sub-фрагменте одной группы. Это избыточность на уровне данных (для HygroR 1023 bp × 2 sub-фрагмента = 2046 bp), но простая — альтернатива хранить full sequence отдельной entity на splitGroup-уровне потребует нового store slice.

**Альтернатива (отложенная).** Хранить `splitGroupFullSequence` только на первом sub-фрагменте (`splitGroupIndex === 0`), остальные находят его через поиск по `splitGroupId`. Это чище, но требует прокидывания массива `fragments` в FragmentEditor для поиска — усложняет API. Делаем простой вариант с дублированием.

### Изменения в коде

#### Шаг 1: `hooks/useFragmentHandlers.js`

В `handleSaveFragment` (ветка `two_fragment / multi_fragment`), при построении `newFragments`:

```js
const splitGroupId = `sg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const splitGroupFullSequence = result.mutantSequence;

const newFragments = result.fragments.map((sf, i) => ({
  id: `mf${Date.now()}_${i}_${Math.random().toString(36).slice(2, 4)}`,
  name: `${original.name}_${i + 1}`,
  sequence: sf.sequence,
  length: sf.length,
  type: sf.type || original.type,
  strand: sf.strand || 1,
  needsAmplification: true,
  sourceType: sf.sourceType || 'template_pcr',
  templateStart: sf.templateStart,
  templateEnd: sf.templateEnd,
  partId: i === 0 ? variantId : undefined,
  isMutagenesis: true,
  splitGroupId,
  splitGroupParentName: original.name,
  splitGroupIndex: i,
  splitGroupTotal: result.fragments.length,
  splitGroupFullSequence,                                      // K11 — ДОБАВИТЬ
  splitGroupFullLength: splitGroupFullSequence.length,         // K11 — ДОБАВИТЬ
  splitGroupFullParentMutations: (updated.mutations || []),    // K11 — список всех мутаций группы, для подсветки в full view
  annotations: trimAnnotationsForSubFragment(original.annotations, sf),
}));
```

В `handleMutagenesis` (Wizard path) — аналогично, если `isSplit === true`:

```js
const baseFragments = result.fragments.map((f, i) => ({
  ...f,
  id: `mf${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
  isMutagenesis: true,
  ...(splitGroupId && {
    splitGroupId,
    splitGroupParentName: parentName,
    splitGroupIndex: i,
    splitGroupTotal: result.fragments.length,
    splitGroupFullSequence: result.mutantSequence,
    splitGroupFullLength: result.mutantSequence.length,
    splitGroupFullParentMutations: result.mutations || [],
  }),
}));
```

#### Шаг 2: `components/FragmentEditor.jsx` — header toggle

В header (рядом с mode switcher) добавить toggle, видимый только при `fragment.splitGroupFullSequence`:

```jsx
const [sequenceView, setSequenceView] = useState('sub'); // 'sub' | 'full'
const hasFullView = !!fragment.splitGroupFullSequence;

{hasFullView && (
  <div className="flex items-center gap-2 text-[10px] mb-2">
    <span className="text-gray-500">Вид:</span>
    <div className="flex rounded-lg overflow-hidden border">
      <button onClick={() => setSequenceView('sub')}
        className={`px-2 py-0.5 ${sequenceView === 'sub' ? 'bg-purple-600 text-white' : 'hover:bg-gray-50'}`}>
        Фрагмент ({fragment.length} п.н.)
      </button>
      <button onClick={() => setSequenceView('full')}
        className={`px-2 py-0.5 ${sequenceView === 'full' ? 'bg-purple-600 text-white' : 'hover:bg-gray-50'}`}>
        Полный ген ({fragment.splitGroupFullLength} п.н.)
      </button>
    </div>
    {sequenceView === 'full' && (
      <span className="text-[9px] text-purple-500 ml-auto">
        Просмотр всей split-группы · {fragment.splitGroupParentName}
      </span>
    )}
  </div>
)}
```

#### Шаг 3: `components/FragmentEditor.jsx` — rendering в `sequenceView === 'full'`

Full-view — **read-only**. Редактировать мутации можно только в sub-view (рабочий кусок для PCR). Это важно: изменения в full-view не имеют смысла — это "виртуальное" представление, в нём нет собственного save-path.

В full-view:
- Рендерится `splitGroupFullSequence` (вместо `seq`).
- Координаты current sub-фрагмента: `[fragment.templateStart, fragment.templateStart + fragment.length)`.
- Визуально: вся sequence в grey-tone, область current sub подсвечена (background + border).
- Mutations подсвечиваются через `splitGroupFullParentMutations` (map по `codonStart`/`position` → highlight, K9 fix уже даёт правильную логику).
- Clicking отключён (`cursor: default`, `onClick: undefined`, `openDnaMutMenu`/`openMutMenu` не вызываются).
- Баннер сверху: «Это виртуальный вид всей split-группы. Редактирование доступно только в режиме отдельного фрагмента.»
- Навигация между sub'ами: добавить в header нав-строку `← HygroR_1 (42 bp) · HygroR_2 (981 bp) ·` но без callback'а в v1.0 — кнопки disabled с tooltip «Переключитесь через canvas или список фрагментов». В v1.1 пробросим setter для открытия другого sub.

Реализация: вынести CDS nucleotide view в отдельный component или в local function с параметрами `(sequenceToRender, clickHandlers, highlightMap, highlightRegion)`. Вызывать дважды:

```jsx
{sequenceView === 'sub' && renderSequence({
  sequence: seq,
  highlightMap: mutationHighlight,
  highlightRegion: null,
  onNtClick: mode === 'mutagenesis' ? openDnaMutMenu : openDnaMutMenu,  // in edit mode still opens popup for bookkeeping
  onAaClick: mode === 'mutagenesis' ? openMutMenu : undefined,
  readonly: false,
})}

{sequenceView === 'full' && renderSequence({
  sequence: fragment.splitGroupFullSequence,
  highlightMap: computeFullViewHighlights(fragment),
  highlightRegion: { start: fragment.templateStart, end: fragment.templateStart + fragment.length },
  onNtClick: null,
  onAaClick: null,
  readonly: true,
})}
```

`computeFullViewHighlights(fragment)` — новый helper: пробегает по `fragment.splitGroupFullParentMutations`, возвращает `Map<ntPos, 'silent' | 'nonsilent'>` относительно `splitGroupFullSequence`. Логика аналогична `computeMutationHighlights` из K9, но позиции берутся напрямую из mutations (не через diff):

```js
function computeFullViewHighlights(fragment) {
  const map = new Map();
  const muts = fragment.splitGroupFullParentMutations || [];
  for (const m of muts) {
    const pos = m.codonStart ?? m.position ?? m.dnaPosition ?? 0;
    const len = m.type === 'insertion' || m.type === 'nt_insertion'
      ? (m.insertSequence?.length || 3)
      : m.type === 'deletion' || m.type === 'nt_deletion'
      ? (m.deletedBp || 3)
      : 3;
    // Silent/nonsilent classification — optional enhancement. Conservative: 'nonsilent'.
    for (let i = pos; i < pos + len; i++) map.set(i, 'nonsilent');
  }
  return map;
}
```

#### Шаг 4: Disabled editing в full-view

Edit-mode button (`✏️ Редакт. кодоны` / `🧬 Мутагенез`) должен быть disabled при `sequenceView === 'full'`. Footer sequence (длина / frame / GC) — показывать метрики full sequence, не sub. Mode switcher — **остаётся активным** (можно переключать mode в full-view, но клики не работают — так пользователь понимает, что режим применится при возврате в sub-view).

Annotations panel в full-view должен показывать аннотации **parent'а** (не sub-фрагмента). Но parent annotations в sub не хранятся — они обрезаны через `trimAnnotationsForSubFragment`. Варианты:

- **A (в scope K11):** в full-view annotations panel показывает pop-up «В полном обзоре аннотации недоступны. Откройте parent-part из библиотеки для просмотра.» — простое, безопасное.
- **B (отложено до v1.1):** при split'е сохранять `splitGroupFullAnnotations: original.annotations` в sub — данные есть, но не применяем пока нет clear UX. Сейчас pack'ить эти 2–5 KB на каждый sub — excessive.

Идём вариантом A.

### Тесты

**Новый файл `__tests__/split-group-fullview.test.js`:**

```js
describe('K11 — split-group full view data propagation', () => {
  it('handleSaveFragment splits → each sub carries splitGroupFullSequence', async () => {
    // Seed parent HygroR 1023 bp with one substitution at nt 300
    // Call handleSaveFragment (via hook wrapper in test)
    // Assert: newFragments[0].splitGroupFullSequence.length === 1023
    //         newFragments[1].splitGroupFullSequence === newFragments[0].splitGroupFullSequence
    //         newFragments[0].splitGroupFullParentMutations.length === 1
  });

  it('handleMutagenesis (Wizard path) with two_fragment → same propagation', async () => {
    // Seed via handleMutagenesis with two_fragment strategy result
    // Same assertions
  });

  it('KLD path does NOT add splitGroupFullSequence (single fragment)', async () => {
    // handleSaveFragment with KLD-compatible mutation (circular + standalone)
    // Assert: result fragment has no splitGroupFullSequence
  });
});
```

**Integration-тесты `__tests__/fragment-editor-fullview.test.jsx`:**

```jsx
it('renders full-view toggle ONLY when splitGroupFullSequence is present', () => {
  // Fragment without splitGroupFullSequence → no toggle
  // Fragment with it → toggle visible, defaults to sub-view
});

it('switching to full-view renders splitGroupFullSequence instead of fragment.sequence', () => {
  // Click Полный ген button
  // Assert: text content includes characters at position >= fragment.templateStart + fragment.length
});

it('full-view highlights current sub-fragment region', () => {
  // Check that the span at position fragment.templateStart has the highlight-region class
});

it('full-view AA and nt clicks are no-op (read-only)', () => {
  // mode=mutagenesis, click AA in full view → mutTarget stays null
});

it('edit-mode toggle is disabled in full-view', () => {
  // Check disabled attribute on ✏️ button
});
```

### Визуальная проверка

- Открыть HygroR_2 → видна toggle «Фрагмент 981 п.н. / Полный ген 1023 п.н.».
- Кликнуть «Полный ген» → sequence перерисовалась, 1023 bp, область 42..1023 выделена цветом/рамкой.
- Substitution подсвечена красным в реальной позиции (напр. nt 300 в full view, а не 258 как в sub view).
- Попытка клика по nt — nothing happens, cursor default.
- Баннер «Виртуальный вид, редактирование в sub-режиме».
- Переключение mode при full-view — ничего не меняется визуально (правильно — full view read-only).
- Возврат на «Фрагмент» → обратно sub sequence + clickable.

### Коммит

```
feat(fragment-editor): virtual full mutant sequence for split group (K11, Sprint 1.7)

When a fragment is split by two_fragment/multi_fragment mutagenesis,
each sub-fragment now carries the full mutant sequence of the original
gene (splitGroupFullSequence), its length, and the list of all
mutations of the split group.

Unified Editor adds a header toggle:
  Фрагмент (N bp) | Полный ген (M bp)

In full view:
  - renders the full mutant sequence, read-only
  - highlights the current sub-fragment's region
  - highlights all mutations of the split group
  - disables nt/AA clicks and edit-mode toggle
  - mode switcher remains active (applies when returning to sub view)
  - annotations panel shows a notice (full annotations deferred to v1.1)

Data propagation in useFragmentHandlers:
  - handleSaveFragment: splitGroupFullSequence = result.mutantSequence
  - handleMutagenesis (Wizard): same for two/multi_fragment
  - KLD path unaffected (single fragment, no group)

+3 unit tests in split-group-fullview.test.js,
+5 integration tests in fragment-editor-fullview.test.jsx.
```

---

## K12 — Fragment topology toggle + V17 fix

### Концепция

У каждого фрагмента может быть своя топология — отдельная от assembly-level `circular` флага. Примеры:
- Full plasmid в библиотеке → `topology: 'circular'`, поставлен как backbone в linear assembly → `fragment.topology: 'circular'` остаётся, assembly `circular: false`.
- Single-fragment assembly из одного linear gene — `assembly.circular: false`, fragment.topology не задана (fallback на assembly).
- Single circular fragment (пустой backbone для мутагенеза) — `fragment.topology: 'circular'`, assembly.circular тоже true (для cohesion).

Текущее поведение:
- `active.circular` — assembly-level boolean, прокидывается как `circular` в `DesignCanvas`.
- Fragment может иметь `topology: 'circular' | 'linear'` (см. `completeAssembly` в `useFragmentHandlers.js` — ставит его у merged product), но никто это поле не читает для рендера junctions.

V17 — частный случай: при n=1 linear assembly должны быть 0 junctions. Сейчас, по-видимому, junctions массив не принудительно очищается в каких-то путях (возможно merge-unfold cycle или легаси state). Надо явный guard в DesignCanvas rendering + механизм нормализации.

### Изменения

#### Шаг 1: Поле `topology` на уровне fragment

**Новое поле** (не обязательное): `fragment.topology: 'linear' | 'circular' | undefined`.

Значение разрешается через helper:

```js
// components/utils/fragment-topology.js (новый файл)
export function getFragmentTopology(fragment, assemblyCircular) {
  if (fragment.topology === 'circular' || fragment.topology === 'linear') {
    return fragment.topology;
  }
  return assemblyCircular ? 'circular' : 'linear';
}
```

#### Шаг 2: UI в Unified Editor header

Под mode switcher + full-view toggle добавить topology toggle:

```jsx
const [topology, setTopology] = useState(fragment.topology || (assemblyCircular ? 'circular' : 'linear'));

<div className="flex items-center gap-2 text-[10px] mb-2">
  <span className="text-gray-500">Топология:</span>
  <div className="flex rounded-lg overflow-hidden border">
    <button onClick={() => setTopology('linear')}
      className={`px-2 py-0.5 ${topology === 'linear' ? 'bg-gray-700 text-white' : 'hover:bg-gray-50'}`}>
      📏 Линейная
    </button>
    <button onClick={() => setTopology('circular')}
      className={`px-2 py-0.5 ${topology === 'circular' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
      ⭕ Кольцевая
    </button>
  </div>
</div>
```

`topology` сохраняется в `handleSaveEdit` / `handleSaveMutagenesis`:

```js
onSave({ ...fragment, sequence: seq, ..., topology });
```

`FragmentEditor` принимает новый prop `assemblyCircular` (чтобы знать fallback). Пробрасываем из App.jsx / DesignCanvas.

#### Шаг 3: UI в PartBlock context menu

В existing context menu PartBlock (если есть — иначе добавить отдельный item):

```jsx
{ icon: fragment.topology === 'circular' ? '📏' : '⭕',
  label: fragment.topology === 'circular' ? 'Сделать линейной' : 'Сделать кольцевой',
  onClick: () => onToggleFragmentTopology(index) },
```

`onToggleFragmentTopology` — новый callback, проходит от App.jsx вниз. Реализация в `useFragmentHandlers` (или прямым action store):

```js
const toggleFragmentTopology = (index) => {
  pushUndo();
  updateActive({
    fragments: fragments.map((f, i) =>
      i === index
        ? { ...f, topology: f.topology === 'circular' ? 'linear' : 'circular' }
        : f
    ),
  });
};
```

#### Шаг 4: V17 — очистка decorative junction

В `DesignCanvas.jsx`:

**A (core fix).** После любой операции, нормализовать junctions-массив под фактическую длину fragments:

```js
// components/utils/normalize-junctions.js (новый helper)
/**
 * Normalize junctions array length to match fragments:
 *   - linear: max(0, fragments.length - 1)
 *   - circular: fragments.length (self-closure at [last])
 *   - topology honors per-fragment OR assembly-level (in that order)
 */
export function expectedJunctionCount(fragments, assemblyCircular) {
  const n = fragments.length;
  if (n === 0) return 0;
  // Mixed: if ANY fragment says 'linear' and n === 1, treat whole as linear
  const first = fragments[0];
  const effectiveTopology = getFragmentTopology(first, assemblyCircular);
  const isCircular = n === 1 ? effectiveTopology === 'circular' : assemblyCircular;
  return isCircular ? n : Math.max(0, n - 1);
}
```

Применяем в Delete handler (уже есть похожая логика), Merge handler, Unfold handler, `buildPlainJunctions` — везде где `juncCount = isCirc ? ... : Math.max(0, n-1)` заменяем на `expectedJunctionCount(fragments, assemblyCircular)`.

**B (rendering guard).** В DesignCanvas rendering блок `renderJunction`:

```jsx
const renderJunction = (i, frag) => {
  const n = fragments.length;
  if (n === 1) {
    // Single fragment: junction рендерится только для self-closure (circular)
    const topology = getFragmentTopology(frag, circular);
    if (topology !== 'circular') return null;
  }
  // Existing logic
  return (
    i < junctions.length && (i < n - 1 || circular) && (
      <div className="flex flex-col items-center shrink-0" ...>
        <JunctionBlock ... />
        <JunctionDNA ... />
      </div>
    )
  );
};
```

**C (store normalization).** Добавить в `updateActive` (или в specific actions) invariant: `juntions.length === expectedJunctionCount(fragments, active.circular)`. Если нет — trim.

Это предотвращает V17 на уровне данных. Но пока что не делаем automatic trim в updateActive (риск неожиданных side-effects на existing tests); вместо этого — проверяем вручную в каждой операции. Добавить задачу в BUGS как v1.1 cleanup.

### Что НЕ делаем в K12

- Single-fragment circular self-closure через real junction — отложено до v1.1. Сейчас при n=1 and fragment.topology='circular': circular-arc indicator внизу canvas показывается (как сейчас при `circular && n > 1`, расширяем условие до `circular && n >= 1`), но самого junction-блока нет. Это визуально корректно: одно кольцо, замыкание через гибкий «⟳» arc-indicator, без fake overlap-геометрии.
- Наследование topology при clone/merge — при merge производный product получает topology согласно `circular`-флагу assembly (уже так). При split через mutagenesis — все sub-фрагменты получают `topology: 'linear'` (split гарантированно разрывает кольцо на линейки). Добавить явно в `handleSaveFragment` → `newFragments`: `topology: 'linear'`.

### Тесты

**Новый файл `__tests__/fragment-topology.test.js`:**

```js
import { getFragmentTopology, expectedJunctionCount } from '../components/utils/fragment-topology';

describe('K12 — fragment topology', () => {
  it('fragment.topology wins over assembly.circular', () => {
    expect(getFragmentTopology({ topology: 'circular' }, false)).toBe('circular');
    expect(getFragmentTopology({ topology: 'linear' }, true)).toBe('linear');
  });

  it('fallback to assembly.circular when fragment.topology absent', () => {
    expect(getFragmentTopology({}, true)).toBe('circular');
    expect(getFragmentTopology({}, false)).toBe('linear');
  });

  it('expectedJunctionCount: linear single fragment → 0', () => {
    expect(expectedJunctionCount([{ topology: 'linear', length: 100 }], false)).toBe(0);
  });

  it('expectedJunctionCount: circular single fragment → 0 (v1.0 does not render self-closure junction)', () => {
    // v1.0 simplification: even circular single — no real junction block. Arc indicator only.
    expect(expectedJunctionCount([{ topology: 'circular', length: 100 }], true)).toBe(0);
  });

  it('expectedJunctionCount: linear 3 fragments → 2', () => {
    expect(expectedJunctionCount([{}, {}, {}], false)).toBe(2);
  });

  it('expectedJunctionCount: circular 3 fragments → 3', () => {
    expect(expectedJunctionCount([{}, {}, {}], true)).toBe(3);
  });
});
```

**Integration-тест `__tests__/design-canvas-no-decorative-junction.test.jsx`:**

```jsx
it('V17: single linear fragment does NOT render decorative junction', () => {
  seed([{ id: 'f1', name: 'Solo', length: 500, sequence: 'A'.repeat(500), topology: 'linear' }], []);
  const { container } = render(<DesignCanvas onDrop={()=>{}} pcrSizes={[500]} />);
  expect(container.querySelectorAll('[data-junction]').length).toBe(0);  // assume JunctionBlock has data-junction attr
});

it('V17: single linear fragment still does NOT render junction even if junctions array is non-empty (stale state)', () => {
  seed(
    [{ id: 'f1', name: 'Solo', length: 500, sequence: 'A'.repeat(500), topology: 'linear' }],
    [{ id: 'stale_j', type: 'overlap', overlapLength: 30 }]  // legacy leftover
  );
  const { container } = render(<DesignCanvas onDrop={()=>{}} pcrSizes={[500]} />);
  expect(container.querySelectorAll('[data-junction]').length).toBe(0);
});

it('topology toggle in Unified Editor persists through save', () => {
  // Render FragmentEditor on linear fragment
  // Click "Кольцевая"
  // Click Save
  // Assert onSave was called with { ..., topology: 'circular' }
});
```

### Визуальная проверка

- Создать single linear fragment → канвас, без V17 decorative junction справа.
- Открыть в Unified Editor → topology toggle показывает «Линейная», переключить на «Кольцевая» → Save → fragment на канвасе показывает circular arc indicator.
- Сделать split → sub-фрагменты получили `topology: 'linear'`, даже если parent был circular.

### Коммит

```
feat(fragment): topology toggle per fragment + V17 decorative junction fix (K12, Sprint 1.7)

New optional field fragment.topology ('linear' | 'circular') — per-fragment
topology, overrides assembly.circular fallback.

UI:
  - Unified Editor header — toggle 📏 Линейная / ⭕ Кольцевая
  - PartBlock context menu — toggle item

V17 fix: DesignCanvas.renderJunction returns null for single-fragment
canvases regardless of junctions array length. New helper
expectedJunctionCount(fragments, assemblyCircular) centralizes the
canonical logic for delete/merge/unfold/buildPlainJunctions flows.

Data propagation:
  - handleSaveEdit / handleSaveMutagenesis write topology from editor
  - handleSaveFragment split path: all sub-fragments get topology='linear'
    (split unavoidably linearizes the group; user can promote any sub
    back to circular manually if biology supports it)

What we explicitly do NOT ship in v1.0:
  - Single-fragment circular self-closure as a real junction block
    (shown as arc indicator only, no fake overlap geometry)
  - Automatic full annotation propagation to full-view in K11
    (annotations panel shows a notice)

+6 unit tests in fragment-topology.test.js,
+3 integration tests in design-canvas-no-decorative-junction.test.jsx.
```

---

## Финализация Sprint 1.7

После зелёной приёмки K9 → K10 → K11 → K12 и визуальной проверки:

### Обновить BUGS.md

- V15 → FIXED (21.04.2026 Sprint 1.7 K9)
- V16 → FIXED (21.04.2026 Sprint 1.7 K9)
- V17 → FIXED (21.04.2026 Sprint 1.7 K12)
- Добавить new FIXED entry «K9–K12: Unified Editor, virtual full sequence, fragment topology»

### Обновить PROJECT_STATE.md

```markdown
### Сессия 21–22.04.2026 — Sprint 1.7 «Unified Editor + Virtual Full Sequence + Topology»

Закрытие остатков Sprint 1.6 + архитектурный рефакторинг FragmentEditor.

- **K9** (хэш): V15 substring-bug закрыт через `mutationHitsAA(m, aaPos)` helper — численное сравнение по `codonStart`/`position` вместо `label.includes(String(pos))`. V16 закрыт через учёт `fragment.templateStart` в `computeMutationHighlights` (`parent.sequence.slice(templateStart, templateStart+length)` перед `sequenceDiff`). Сопутствующий фикс: `inlineDeletion` теперь возвращает `codonStart`+`position`.
- **K10** (хэш): Unified Editor layout. Tabs Последовательность/Белок удалены. Новый layout: header (mode switcher) → sequence view → footer → collapsible panels (Annotations / Mutations / Protein). Protein panel read-only в обоих режимах; AA-мутагенез идёт только из основной sequence view через codon grid. Save handlers неизменны.
- **K11** (хэш): виртуальный обзор полной split-группы. Sub-фрагменты получают `splitGroupFullSequence`, `splitGroupFullLength`, `splitGroupFullParentMutations`. Toggle в header «Фрагмент N bp / Полный ген M bp». Full-view read-only, подсвечивает область текущего sub + все мутации группы. Annotations panel в full-view показывает notice (полная пропаганда аннотаций — v1.1).
- **K12** (хэш): fragment topology. Новое поле `fragment.topology`, toggle в Unified Editor header + PartBlock context menu. V17 закрыт через `expectedJunctionCount` helper и guard в `DesignCanvas.renderJunction` для n=1.

Тесты: 700 → X (+~25). Build: clean на всех четырёх коммитах. Визуальная приёмка: без открытых багов.
```

### Обновить DECISIONS.md

```markdown
[2026-04-22] **Unified Editor вместо tabs — основной принцип layout'а.** Sequence — primary view, annotations/mutations/protein-summary — collapsible panels под sequence. Tabs Последовательность/Белок из Sprint 1.5 K2 удалены как артефакт mode-switcher контейнера. AA-мутагенез осуществляется **только** через codon grid в основной sequence view; protein panel — read-only обзор в обоих режимах. Это устраняет двойственность AA-click, которая существовала между 10-codon и 50-aa renderer'ами.

[2026-04-22] **Mutation-position сравнение — только численное, никогда через label.** Helper `mutationHitsAA(m, aaPos)` использует `codonStart`/`position` и `span` (по type). Label — строковое имя для UI, не источник истины для позиции. Любой код, проверяющий «мутирована ли эта позиция», должен ходить через numeric сравнение. V15 substring-bug был классической label-based regression'ой.

[2026-04-22] **Split-group полная мутант-последовательность дублируется в каждом sub-фрагменте.** `splitGroupFullSequence` + `splitGroupFullLength` + `splitGroupFullParentMutations` на каждом sub. Избыточность ~KB на group, но простая модель — не требует нового store slice для split-group entity. В v1.1 можно вынести в отдельный slice когда appear'ет second use case (subcloning, где parent гена делится между несколькими assemblies).

[2026-04-22] **Fragment.templateStart в computeMutationHighlights — контракт.** Для любого диффа parent vs fragment в K8-style подсветке: сначала slice parent по `[templateStart, templateStart + fragment.sequence.length)`, только потом передавать в `sequenceDiff`. Без этого split sub-фрагменты показывают всё как мутации. Правило применимо везде, где fragment.sequence — часть более длинной parent.sequence (split, subcloning, excision).

[2026-04-22] **Fragment.topology как явное поле, fallback на assembly.circular.** Раньше topology определялась исключительно на assembly-уровне (`active.circular`), фрагменты не имели собственной топологии. Помощнее: single plasmid backbone в linear assembly должен рендериться как кольцо; split sub-фрагменты циркулярного parent'а — как линейные. Helper `getFragmentTopology(fragment, assemblyCircular)` — каноническое разрешение. `expectedJunctionCount(fragments, assemblyCircular)` — каноническое число стыков, учитывает topology для n=1 special case.

[2026-04-22] **`expectedJunctionCount` — централизованный invariant, не все paths охвачены.** Merge/Delete/Unfold/`buildPlainJunctions` переведены на helper. Автоматический trim в `updateActive` НЕ сделан (риск side-effects на existing tests). Если при v1.1 появятся новые пути создания junctions — проходим через code review + добавляем вызов helper'а. TODO в BUGS для systematic audit.

[2026-04-22] **Mutation application в full view — conservative nonsilent.** `computeFullViewHighlights` в K11 не различает silent/nonsilent (в отличие от K9 diff-based подсветки), потому что данные — raw mutation list без aaChange info. Все мутации помечаются как nonsilent. В v1.1 можно обогатить через повторный `sequenceDiff(parent.sequence, splitGroupFullSequence, cds)`, но сейчас избыточно — `splitGroupFullSequence` сам по себе уже содержит эту информацию, просто её нужно вытащить.
```

### Переместить спеку в архив

```
git mv docs/SPRINT_1_7_UNIFIED_EDITOR.md docs/archive/
# + в первой строке: **Статус:** ✅ РЕАЛИЗОВАНО 22.04.2026
```

### Обновить CURRENT_TASK.md до заглушки

```markdown
# CURRENT_TASK.md

Нет активной задачи.

После Sprint 1.7 следующие кандидаты (по убыванию приоритета):
- V1/V2/V6 — UX на circular map (Sprint 2)
- V7 — InsertionClock (Sprint 2)
- V8/V9/V10 — UX долг (Sprint 3)
- Docker Compose + README для публикации

Спеку — Chat пишет отдельно.
```

---

## Чеклист для Claude Code

**Перед началом:**
- [ ] Sprint 1.6 формально закрыт, V15/V16/V17 в BUGS OPEN, все 700 тестов зелёные, baseline коммит `chore(sprint-1.6): close`.
- [ ] Прочитать CLAUDE.md, BUGS.md, эту спеку.
- [ ] Прочитать `docs/archive/SPRINT_1_6_MUTAGENESIS_V2_1.md` целиком (для контекста K7/K8, которые K11 расширяет).
- [ ] Прочитать `gui/designer/src/components/FragmentEditor.jsx` целиком (рефакторинг в K10 затрагивает весь файл).
- [ ] Прочитать `gui/designer/src/hooks/useFragmentHandlers.js` (handleSaveFragment + handleMutagenesis — K11 добавляет поля).
- [ ] Прочитать `gui/designer/src/mutagenesis.js` — в частности `makeFragmentStrategy` (возвращает `mutantSequence`, который K11 пробрасывает).

**K9 — Hotfix:**
- [ ] `mutationHitsAA(m, aaPos)` helper в `FragmentEditor.jsx`, exported
- [ ] Заменить `mutations.some(m => m.label?.includes(String(pos)))` на `mutations.some(m => mutationHitsAA(m, pos))` в protein view (~строка 760)
- [ ] `computeMutationHighlights` учитывает `fragment.templateStart`
- [ ] `inlineDeletion` возвращает `codonStart` + `position`
- [ ] +6 unit тестов в `fragment-editor-ismutated.test.js`
- [ ] +2 unit теста в `fragment-editor-highlights.test.js`
- [ ] `npx vitest run && npx vite build` — зелено
- [ ] Commit K9

**K10 — Unified Editor:**
- [ ] Удалить `tab` state и tab-navigation в `FragmentEditor.jsx`
- [ ] Раскрыть `tab === 'edit'` блок как основной sequence view
- [ ] Ввести `<Panel>` helper компонент (collapsible)
- [ ] Annotations Panel (открыт по умолчанию): AnnotationEditor + Auto-annotate + legacy add form
- [ ] Mutations Panel (condition mutations.length > 0): список + [×] для undo одной мутации из списка
- [ ] Protein Panel (CDS only, collapsed): полный protein render, read-only в обоих modes
- [ ] Hints в sequence footer: mode-specific (Правка vs Мутагенез)
- [ ] Обновить `fragment-editor-mode-switcher.test.jsx` (убрать tab assertions)
- [ ] Обновить `fragment-editor-read-only.test.jsx` (баннер → footer hint)
- [ ] Обновить `fragment-editor-highlights.test.jsx` (открыть protein panel перед assertion'ом)
- [ ] +7 integration-тестов в `fragment-editor-unified.test.jsx`
- [ ] `npx vitest run && npx vite build` — зелено
- [ ] Commit K10

**K11 — Virtual full sequence:**
- [ ] `handleSaveFragment` (split branch) добавляет `splitGroupFullSequence`, `splitGroupFullLength`, `splitGroupFullParentMutations`
- [ ] `handleMutagenesis` (split branch) — то же самое
- [ ] Header toggle в Unified Editor: `Фрагмент / Полный ген` (только если `fragment.splitGroupFullSequence`)
- [ ] Вынести CDS nucleotide view в reusable local function с params `(sequence, highlightMap, highlightRegion, readonly, onNtClick, onAaClick)`
- [ ] `computeFullViewHighlights(fragment)` helper
- [ ] Full-view: read-only, highlight current sub region, disabled edit-mode button, баннер «Виртуальный вид», annotations panel — notice
- [ ] +3 unit теста в `split-group-fullview.test.js`
- [ ] +5 integration-тестов в `fragment-editor-fullview.test.jsx`
- [ ] `npx vitest run && npx vite build` — зелено
- [ ] Commit K11

**K12 — Fragment topology + V17:**
- [ ] Новый файл `components/utils/fragment-topology.js` с `getFragmentTopology` + `expectedJunctionCount`
- [ ] Topology toggle в Unified Editor header (под mode switcher)
- [ ] `handleSaveEdit`/`handleSaveMutagenesis` — сохраняют topology в fragment
- [ ] Context menu item в PartBlock (toggle topology) + callback `onToggleFragmentTopology`
- [ ] Action `toggleFragmentTopology` в `useFragmentHandlers`
- [ ] Replace junction-count calc в Delete/Merge/Unfold/`buildPlainJunctions` на `expectedJunctionCount(fragments, circular)`
- [ ] Guard в `DesignCanvas.renderJunction`: при n=1 linear → null
- [ ] Split-пути (handleSaveFragment / handleMutagenesis) проставляют `topology: 'linear'` на всех sub-фрагментах
- [ ] +6 unit-тестов в `fragment-topology.test.js`
- [ ] +3 integration-теста в `design-canvas-no-decorative-junction.test.jsx`
- [ ] `npx vitest run && npx vite build` — зелено
- [ ] Commit K12

**Остановка на визуальную приёмку.** После K12 — `STOP`. Не финализировать (BUGS FIXED, PROJECT_STATE, DECISIONS, архив) до подтверждения Игорем.

**После визуальной приёмки:**
- [ ] V15/V16/V17 в FIXED с датой 22.04.2026 и коммит-хэшами
- [ ] Запись в PROJECT_STATE журнал сессии
- [ ] Архитектурные решения в DECISIONS
- [ ] `git mv docs/SPRINT_1_7_UNIFIED_EDITOR.md docs/archive/` + пометка РЕАЛИЗОВАНО
- [ ] CURRENT_TASK.md → заглушка

---

## Риски

**R1: K10 breaks existing tests.** Удаление tabs может сломать 10+ существующих тестов, которые тестируют tab-specific рендер. Митигация: ожидаем это, выделяем время на обновление тестов как часть K10 scope (не как отдельную задачу).

**R2: K10 protein panel дублирует rendering sequence view.** Protein в обзоре — это те же AA, просто 50 в строке. UX-риск: пользователь путается, где «главный» белок. Митигация: явные title'ы panels («Белок (обзор)»), и codon grid в sequence view — это канонический белок с AA под кодонами, protein panel — вспомогательный.

**R3: K11 data size blowup.** Для split-группы с 10 sub-фрагментами из 10 kb parent'а каждый sub везёт 10 kb dup → 100 kb в store. Для типичного use case (1 kb gene × 2 sub = 2 kb) — ОК. Если всплывут use cases с большими генами → переносим в отдельный slice (см. архитектурное решение 3).

**R4: K12 topology toggle ломает Racetrack/Map rendering.** Racetrack и Map требуют circular assembly. Если fragment.topology=circular при assembly.circular=false и в canvas фрагмент single — Map view может стать доступным. Митигация: в v1.0 Map/Racetrack видимость всё равно управляется `assembly.circular`, fragment-level topology — косметическая. V1.1 — рассмотреть расширение.

**R5: Store нормализация junctions не полная.** `expectedJunctionCount` применяется в 4 операциях, но теоретически может быть пятая — не покрыта. Митигация: добавить invariant-warning в dev mode (`console.warn` если `junctions.length !== expectedJunctionCount(...)` в любой момент). TODO для systematic audit — в BUGS как v1.1.

**R6: K11 full-view performance.** `splitGroupFullSequence` может быть 10 kb+. Рендер 10 kb × char grid может лагать. Митигация: full-view использует тот же renderer что sub-view (10 codon на строку, ~330 строк для 10 kb) — performance идентичный. Если проблемы — виртуальный скролл в v1.1.

---

## Открытые вопросы (к Chat при сомнении)

1. **Mode switcher в full-view: remain active или disable?** Текущая спека говорит «active, но клики не работают» — это заставляет пользователя думать, зачем он активен. Альтернатива — disable с tooltip «Переключается в режиме отдельного фрагмента». По умолчанию remain active — пользователь может подготовить mode для возврата в sub-view. Если неинтуитивно по результатам приёмки → переключим на disable.

2. **K10 protein panel клики — действительно хардкод read-only?** Альтернатива: клики работают как в codon grid (в Мутагенезе open popup, в Правке no-op). Отказ: это возвращает двойственность (два места для AA-click на одну операцию) — именно её и убираем в K10. Read-only в обоих modes — строго.

3. **K11 при split без parent'а в parts.** Теоретически `handleSaveFragment` всегда создаёт variant в parts (см. `findRoot`), но edge case — если `rootPart` не найден (бывший split фрагмента без root-part), `variantId` сбрасывается в `original.partId` и variant не создаётся. В этом случае `splitGroupFullSequence` всё равно пробрасывается на sub-фрагменты (источник — `result.mutantSequence` в памяти во время split), просто восстановить full-view позже из store не получится (sub-фрагмент несёт копию, но если перезагрузить страницу — данные есть в store через persist). Приемлемо. Если всплывёт — тест.

4. **K12: `topology: 'linear'` на split-фрагментах — принудительно?** Что делать, если split'ится circular фрагмент, и пользователь хочет вручную переключить один sub обратно в circular (бред биологически, но теоретически возможно)? Разрешаем — topology toggle работает на любом фрагменте. Split ставит linear как safe default; дальше это решение пользователя.

---

**Конец спеки.**

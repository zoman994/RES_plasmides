# Sprint M-X.3 — Wrap-tail rendering for circular plasmids in SequenceView

**Статус:** ✅ РЕАЛИЗОВАНО 06.05.2026 (см. `RELEASES.md` блок v0.7.3). Финал отличается от исходной спеки: trailing wrap-tail в round-10 свёрнут INLINE в wrap-bridge line (биолог: «новой строки быть не должно») вместо отдельных trailing rows. Plus 11 polish rounds после K6 visual acceptance.
**Тип:** B (visual extension существующего viewer + опциональный prerequisite K0 декомпозиция AnnotationTrack)
**База:** v0.7.2 (M-X.2 closed 06.05.2026, ветка `feature/sequence-view-feature-strip` HEAD `253420a`)
**Закрывает:** TD-WRAPTAIL-RENDERING (TECH_DEBT.md). Опционально закрывает TD-ANNOTATIONTRACK-DECOMPOSE-V2 если K0 берётся в скоуп.
**Не закрывает:** TD-CIRCULAR-SELECTION (data-model + selection math через origin — отдельный sprint, по плану M-X.4 либо позже). M-X.3 — только render layer.
**Размер:** ~5–8 KB патча (без K0). С K0 декомпозицией +~3-4 KB рефакторинга AnnotationTrack.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Сейчас | Прогноз без K0 | Прогноз с K0 | Зона |
|------|--------|----------------|--------------|------|
| `components/SequenceView/index.jsx` | ~36 KB (после M-X.2) | +~1.5 KB (props wrap-tail) | то же | safe |
| `components/SequenceView/lib/grid.js` | 4.0 KB | +~1.5 KB | то же | safe |
| `components/SequenceView/SequenceLine.jsx` | ~8 KB | +~1 KB (`isWrapTail`) | то же | safe |
| `components/SequenceView/tracks/AnnotationTrack.jsx` | **41.6 KB** (hard violation) | +1.5 KB → **43 KB** (углубляет hard) | -20 KB → ~22 KB (в зелёной) | **K0 обязателен если правим** |
| `components/SequenceView/overlays/CaretOverlay.jsx` | 2.8 KB | +0.5 KB (фильтр data-wraptail="main") | то же | safe |
| **новый** `components/SequenceView/overlays/OriginMarkerOverlay.jsx` | — | ~2 KB | то же | safe |
| **новый** `components/SequenceView/lib/wrap-tail.js` | — | ~3 KB pure helpers | то же | safe |

**Решение по K0:** AnnotationTrack 41.6 KB — hard violation от M-X.2-fix, K4 deferred Code'ом. M-X.3 трогает render path фичей в wrap-tail контексте (приглушенный stroke + opacity, на тех же координатах что и main). **Если избежать правки AnnotationTrack** — K0 откладывается. Стратегия: wrap-tail lines рендерят свой собственный SequenceLine с тем же AnnotationTrack как для main, но через wrap-tail-specific feature filtering на уровне `<SequenceLine>` props (передаём только те фичи что попадают в wrap-tail диапазон, плюс flag `dim={true}` для opacity). Это позволит **НЕ трогать AnnotationTrack.jsx вообще**, и K0 остаётся отдельным TD до M-X.4 либо специального polish sprint'а.

---

## 1. Контекст и постановка задачи

### Что биолог делает сейчас и где ломается

Cloning workflow на стыке через origin:
1. Биолог проектирует праймер, который сидит на `circular pUC19` от `2480..2520` (40 nt спан перед origin) с overlap-tail на `2580..18` (38 nt спан **через origin**).
2. Открывает Sequence tab — видит линейный layout `0..2686`. Скроллит к концу.
3. Tail-конец 2580..2686 видит. **Контекст начала 1..18 — НЕ виден** на той же странице.
4. Чтобы свериться с initial nucleotides — скроллит вверх, теряет позицию хвоста.
5. Workaround: открывает PlasmidMap (circular view), мысленно копирует nucleotides, возвращается. Каждый context switch = risk of nucleotide miscount.

Industry baseline: SnapGene/Benchling делают **wrap-aware selection** (selection через origin собирается в один range), но **не визуальную непрерывность ленты**. Биолог BodgeGene попросил именно непрерывность — это уникальная фича на фоне SnapGene.

### Цель

При circular topology вывести SequenceView в режим «лента с хвостами»:
- **Leading wrap-tail:** N последних строк plasmid'а отрендерены ПЕРЕД первой реальной строкой (приглушены → визуально «контекст конца перед origin»).
- **Главная лента:** строки 0..seqLength как сейчас.
- **Trailing wrap-tail:** N первых строк plasmid'а отрендерены ПОСЛЕ последней реальной строки (приглушены → «контекст начала после конца»).
- **Origin marker:** горизонтальная линия с подписью «origin / 1» на стыке между leading wrap-tail и главной лентой; такой же между концом главной ленты и trailing wrap-tail.
- **Edge case коротких плазмид** (plasmid umещается в viewport + 3 lines reserve): wrap-tail отключается, остаётся только origin marker. Биолог уже видит весь plasmid, дублирующие строки только мешают.
- **Linear topology:** ничего не меняется. Wrap-tail рендерится только когда `circular === true`.

### Что НЕ входит в этот sprint

- **Selection через origin.** Click/drag по wrap-tail line не двигает caret (cursor stays in main band). Это TD-CIRCULAR-SELECTION в M-X.4 либо позже.
- **Caret keyboard через origin.** Стрелки в `caretPos === 0` Left → `seqLength - 1`? **НЕТ** — каретка остаётся в [0, seqLength). Это та же тема TD-CIRCULAR-SELECTION.
- **Annotation create через wrap-tail.** H-key на wrap-tail line → no-op либо CreateAnnotationPopup открывается на эквивалентной позиции в main? **NO-OP** для упрощения. Биолог открывает popup только в main band.
- **AnnotationTrack декомпозиция** (TD-ANNOTATIONTRACK-DECOMPOSE-V2). Откладывается. M-X.3 trick: feature filtering на уровне SequenceLine, AnnotationTrack не трогаем.

---

## 2. Архитектура

### 2.1. Data flow

```
SequenceView index.jsx
  ├─ lines = linesFromSeq(fullSeq, cpl)  // как сейчас, main только
  ├─ wrapTailConfig = computeWrapTailConfig({  // новый pure helper
  │      circular, seqLength, cpl, viewportHeight, lineHeight
  │   })
  │   → { enabled: bool, leadingLines: number, trailingLines: number,
  │        leadingStart: number  // negative offset, e.g. -160
  │      }
  ├─ allLines = circular && wrapTailConfig.enabled
  │     ? [...leadingWrapTailLines, ...lines, ...trailingWrapTailLines]
  │     : lines
  └─ map allLines → <SequenceLine kind="leading-wrap" | "main" | "trailing-wrap" />
```

### 2.2. Wrap-tail line shape

```js
// New shape returned by buildWrapTailLines:
{
  start: 4840,        // ABSOLUTE position in plasmid (positive 0-based)
  seq: 'GTAC...',     // slice of fullSeq
  kind: 'leading-wrap' | 'trailing-wrap',
  displayStart: 4840 // for leading: real 0-based; trailing: same as main first lines
}
```

### 2.3. SequenceLine props extension

Добавить `kind` proп. Compute `dim = kind !== 'main'`. При dim:
- Wrapper opacity 0.5
- Numbers font-style italic
- Strands inherit opacity through wrapper (не трогаем StrandsTrack)
- Caret/selection overlays игнорируют through `data-wraptail-kind` фильтрацию

### 2.4. Origin marker

Новый overlay компонент `OriginMarkerOverlay.jsx`. Position computed from line offsets (через `useLayoutEffect` пробником `[data-line-start="0"]` и `[data-line-start="${seqLength - cpl}"]` plus `[data-wraptail-kind="leading-wrap"]:last-child` и `[data-wraptail-kind="trailing-wrap"]:first-child`).

Render: horizontal line `border-top: 1px dashed var(--accent-500)` через всю ширину линий, с inline label «origin / 1» на правой стороне. Two markers when wrap-tail enabled (вверху между leading и main, внизу между main и trailing); один marker (через позицию 0) когда wrap-tail disabled — рендерится в начале первой main line.

### 2.5. Annotation rendering на wrap-tail lines

Подход «feature filtering at SequenceLine level»:
- Для каждой wrap-tail line вычисляем какие из `features` попадают в её диапазон `[start, start+cpl)`.
- Передаём отфильтрованный массив в SequenceLine как обычно.
- AnnotationTrack рендерит rect'ы как для main line. Wrapper opacity делает приглушение.

Annotations spanning origin (start > end) **не появляются на wrap-tail** в этом sprint — нужен TD-CIRCULAR-SELECTION fix data-model. Но annotations целиком в [0, seqLength) которые попадают в leading wrap-tail (ближе к концу) либо trailing wrap-tail (ближе к началу) — рендерятся.

### 2.6. Edge case auto-disable

```js
function shouldEnableWrapTail({ circular, seqLength, cpl, viewportHeight, lineHeight }) {
  if (!circular) return false;
  if (!Number.isFinite(seqLength) || seqLength === 0) return false;
  const totalMainLines = Math.ceil(seqLength / cpl);
  const minWrapTailLines = 2;
  const reserveLines = 3;  // запас сверху для plain origin marker
  // Если plasmid + reserveLines умещается в viewport — wrap-tail не нужен.
  const mainHeight = totalMainLines * lineHeight;
  if (mainHeight + reserveLines * lineHeight < viewportHeight) return false;
  // Очень короткий plasmid (< minWrapTailLines * cpl) — отключаем (нет смысла дублировать).
  if (totalMainLines < minWrapTailLines + 1) return false;
  return true;
}
```

Origin marker рендерится **всегда** при `circular === true` (даже если wrap-tail disabled).

### 2.7. Number of wrap-tail lines

```js
const DEFAULT_WRAP_TAIL_LINES = 2;
function pickWrapTailLines({ totalMainLines }) {
  if (totalMainLines >= 5) return 2;
  if (totalMainLines >= 3) return 1;
  return 0;  // дегейтит auto-disable
}
```

2 строки = достаточный контекст для primer 30-40 nt при cpl=80; не загромождает viewport. Может стать settings-tunable в будущем (DisplaySettings extension), но в M-X.3 — фиксированный default.

---

## 3. Decomposition

### K1 — `wrap-tail.js` pure helpers + tests

**Цель:** написать pure functions для wrap-tail math. TDD-first.

**Новые файлы:**
- `gui/designer/src/components/SequenceView/lib/wrap-tail.js`
  - `shouldEnableWrapTail({ circular, seqLength, cpl, viewportHeight, lineHeight })` → bool
  - `pickWrapTailLines({ totalMainLines })` → number (0/1/2)
  - `buildWrapTailLines({ fullSeq, cpl, leadingCount, trailingCount })` → `{ leading: [], trailing: [] }` — массивы `{ start, seq, kind }`
  - `filterAnnotationsForLine(annotations, lineStart, lineEnd)` → массив отфильтрованных features (используется в feature-map либо inline в SequenceLine; pure)
- `gui/designer/src/components/SequenceView/lib/__tests__/wrap-tail.test.js`
  - shouldEnableWrapTail: linear → false; circular short (1500 bp / cpl=80 / viewport=800px / lineHeight=18) → false; circular long (5000 bp) → true
  - pickWrapTailLines: 60 lines → 2; 4 lines → 1; 2 lines → 0
  - buildWrapTailLines: на 5000 bp / cpl=80 / leading=2 / trailing=2 → leading [{start:4840,...}, {start:4920,...}], trailing [{start:0,...}, {start:80,...}]
  - filterAnnotationsForLine: feature span 100..200, line start=80..160 → попадает; line start=200..280 → не попадает; line start=160..240 → попадает (overlap)

**Тесты pre-impl, реализация — затем.**

**Acceptance:** ~6-7 unit tests, все green.

### K2 — Wire wrap-tail lines into SequenceView render

**Цель:** SequenceView теперь рендерит leading + main + trailing strips; SequenceLine получает `kind` prop; основные tests остаются зелёными благодаря фильтрации `data-wraptail-kind="main"`.

**Изменённые файлы:**
- `components/SequenceView/index.jsx`:
  - Импорт `shouldEnableWrapTail`, `pickWrapTailLines`, `buildWrapTailLines` из `lib/wrap-tail.js`.
  - В useMemo: `wrapTailLines = useMemo(() => circular ? buildWrapTailLines({...}) : { leading: [], trailing: [] }, [circular, fullSeq, cpl, lines.length])`.
  - В `linesJsx`: `[...leading.map(line => <SequenceLine kind="leading-wrap" ... />), ...lines.map(line => <SequenceLine kind="main" ... />), ...trailing.map(line => <SequenceLine kind="trailing-wrap" ... />)]`.
- `components/SequenceView/SequenceLine.jsx`:
  - Принимает `kind` prop (default `'main'`).
  - Wrapper `<div>` получает `data-wraptail-kind={kind}` и `style={{opacity: kind === 'main' ? 1 : 0.5}}`.
  - При kind !== 'main' — `pointerEvents: 'none'` на wrapper (selection/click/caret-update не работают через wrap-tail; это в скоупе TD-CIRCULAR-SELECTION).
  - Numbers получают `font-style: italic` при `kind !== 'main'`.

**Тесты:**
- `wrap-tail-render.test.jsx::circular plasmid 5000bp renders 2 leading + main + 2 trailing lines`
- `wrap-tail-render.test.jsx::linear plasmid renders only main lines (no wrap-tail)`
- `wrap-tail-render.test.jsx::circular short plasmid (300bp / 4 lines) renders only main + origin marker (no wrap-tail)`

**Acceptance:** существующие SequenceView tests все зелёные (фильтр `[data-wraptail-kind="main"]` не нужен в большинстве — добавим только в новых, существующие просто видят больше lines когда circular). Если break — добавляем `data-wraptail-kind="main"` на existing assertions.

### K3 — OriginMarkerOverlay

**Цель:** новый overlay рисует horizontal line с подписью «origin / 1» на стыке wrap-tail ↔ main.

**Новые файлы:**
- `components/SequenceView/overlays/OriginMarkerOverlay.jsx`:
  - Props: `containerRef`, `circular`, `wrapTailEnabled`, `lineHeight`, `charPx`, `cpl`.
  - useLayoutEffect: ищет `[data-wraptail-kind="leading-wrap"]:last-child` и `[data-wraptail-kind="main"]:first-child`. Если оба есть → marker между ними. Если только main:first-child → marker на верхнем крае main:first-child.
  - Аналогично для нижней границы main ↔ trailing.
  - Render: 2 (либо 1) `<div>` absolute-positioned с `border-top: 1px dashed var(--accent-500)` + inline label «origin / 1» в правом конце.

**Изменённые файлы:**
- `components/SequenceView/index.jsx`: mount `<OriginMarkerOverlay>` под `<CaretOverlay>` (z-index lower so caret overlays origin line при наведении на позицию 0).

**Тесты:**
- `origin-marker.test.jsx::circular plasmid renders 2 origin markers (top + bottom of main band)`
- `origin-marker.test.jsx::linear plasmid renders 0 origin markers`
- `origin-marker.test.jsx::circular short plasmid (no wrap-tail) renders 1 origin marker (above main:first-child)`

**Acceptance:** marker визуально на стыке, label «origin / 1» читается; не блокирует click/drag (pointer-events: none).

### K4 — CaretOverlay + selectionOverlay фильтрация по data-wraptail-kind="main"

**Цель:** caret рисуется только в main band; click/drag в wrap-tail зону игнорируется.

**Изменённые файлы:**
- `components/SequenceView/overlays/CaretOverlay.jsx`:
  - В querySelector: `[data-testid="sequence-view-line"][data-wraptail-kind="main"]` (либо без атрибута для linear). Если атрибут есть и `!== "main"` — line skip'ed.
- `components/SequenceView/hooks/useSelectionState.js` (если он делает coord-from-pointer):
  - Pointer-down/move на element с `data-wraptail-kind` !== `"main"` → ignored (return false из coord-from-pointer).

**Тесты:**
- `caret-overlay.test.jsx::caret only renders against main lines (wrap-tail lines ignored)`
- `selection-state.test.jsx::pointer down on wrap-tail line does not start drag`

**Acceptance:** существующее keyboard navigation остаётся как было (caret только в main); mouse click на wrap-tail line — no-op.

### K5 — Edge cases + final wiring

**Цель:** auto-disable для коротких plasmid'ов (proven in K1 unit test) корректно подключён к runtime; viewport height измеряется через ResizeObserver на containerRef.

**Изменённые файлы:**
- `components/SequenceView/index.jsx`:
  - Добавить `viewportHeight` state, обновлять через ResizeObserver на `containerRef`.
  - `wrapTailEnabled = shouldEnableWrapTail({ circular, seqLength, cpl, viewportHeight, lineHeight: ~18 })`. lineHeight либо measured (через probe), либо константа (text 12px + padding ~6px).
  - Если `wrapTailEnabled === false` — wrap-tail lines не рендерятся, OriginMarker всё ещё да (через позицию 0 в main).

**Тесты:**
- `wrap-tail-edge.test.jsx::large viewport (1200px) on small plasmid (1000bp) → wrap-tail disabled`
- `wrap-tail-edge.test.jsx::small viewport (400px) on small plasmid (1000bp) → wrap-tail enabled (контекст всё ещё нужен)`

**Acceptance:** при resize окна wrap-tail динамически появляется/исчезает; никаких re-mount'ов SequenceLine'ов main band.

### K6 — Visual acceptance + integration test

**Цель:** проверить что фичи в wrap-tail рендерятся приглушенно (opacity 0.5 наследуется), labels читаемы; нет regressions в feature-strip / Annotator preview.

**Тесты:**
- `wrap-tail-integration.test.jsx::pUC19 fixture: AmpR feature spans 1626..2486 (main band only) → not duplicated to wrap-tail`
- `wrap-tail-integration.test.jsx::pUC19 fixture: lacZα feature 146..469 → renders in main band only AND in trailing wrap-tail (because trailing covers 0..160)`
- `wrap-tail-integration.test.jsx::pUC19 fixture: short feature at end 2680..2686 → renders in main band AND in leading wrap-tail (4840..4926? — на 2686 bp circular)`

**Visual acceptance критерии (биолог проходит вручную):**

| # | Сценарий | Ожидание |
|---|----------|----------|
| 1 | Open pUC19 (2686 bp, circular) → Sequence tab | Wrap-tail enabled (2686 bp >> 800px viewport). 2 leading lines (last 160 nt of pUC19) + main 0..2686 + 2 trailing lines (first 160 nt). Origin marker между leading/main и main/trailing с label «origin / 1» |
| 2 | Open pUC19 (2686 bp) на ОЧЕНЬ большом мониторе (viewport 1200+ px) | Wrap-tail disabled (plasmid + reserve умещается). Только origin marker наверху main:first-child |
| 3 | Open linear fragment (1000 bp linear) | Никаких wrap-tail lines, никакого origin marker. Точно как до M-X.3 |
| 4 | Click на wrap-tail line | NO-OP. Caret не двигается, selection не стартует. Cursor on main band не сбит |
| 5 | Annotation в leading wrap-tail (e.g. lacZα если попадает) | Rect рендерится приглушенно (opacity 0.5). Label читается (italic + dim color). Click игнорится |
| 6 | Резайз окна с большого на маленькое | Wrap-tail динамически появляется. Никакого scroll-jump (caret position сохраняется) |

**Acceptance:** все 6 сценариев PASS на pUC19 + pET-28b fixtures. Если ANY FAIL → mini-spec для fix.

---

## 4. Decomposition summary

| K | Что | Effort | Тесты | Risk |
|---|-----|--------|-------|------|
| K1 | wrap-tail.js pure helpers + tests | 1.5h | ~7 unit tests | низкий |
| K2 | Wire wrap-tail lines into render | 2h | ~3 render tests | средний — много existing SequenceLine selectors могут потребовать `[data-wraptail-kind="main"]` |
| K3 | OriginMarkerOverlay | 1.5h | ~3 tests | низкий |
| K4 | Caret + selection фильтрация | 1h | ~2 tests | средний — useSelectionState coord-from-pointer paths |
| K5 | Edge cases + ResizeObserver wiring | 1h | ~2 tests | низкий |
| K6 | Visual acceptance + integration | 1h | ~3 fixture tests + 6 visual scenarios | высокий — fixture-зависимые |
| **Total** | | **~8h** | **~20 unit + 6 visual** | средний overall |

---

## 5. Reuse — что переиспользуем

- `linesFromSeq` (lib/grid.js) — main lines как сейчас.
- `SequenceLine` — добавляем `kind` prop, остальное без изменений.
- `AnnotationTrack`, `StrandsTrack`, `RulerTrack`, `PrimerTrack`, `RestrictionTrack`, `AATrack` — НЕ ТРОГАЕМ. Track filtering на уровне SequenceLine props → annotation/primer/RE arrays переданы pre-filtered для wrap-tail диапазонов (helper `filterAnnotationsForLine`).
- `CaretOverlay`, `useSelectionState` — добавляем фильтр по `data-wraptail-kind="main"`. Минимум.
- `applyAnnotationEdit`, `useSelectionEdit` (Del/H/E/drag) — все остаются main-band only через event-target check (pointer-events: none на wrap-tail wrapper уже это даёт).

---

## 6. Open decisions (решены автором спеки, могут быть пересмотрены)

- **Wrap-tail count = 2.** Зашит как DEFAULT_WRAP_TAIL_LINES. Если биолог захочет регулировать в Settings — отдельный future TD.
- **Opacity = 0.5.** Bound через wrapper. Если visually слишком/не достаточно приглушенно — tunable через CSS variable `--wraptail-opacity` в M-X.3 K6 review.
- **Origin marker styling:** dashed accent-500 + inline label. Совпадает со стилем других accent overlay'ев (drag preview rect, caret).
- **No keyboard cycle.** Стрелки в caretPos=0 Left → caret stays at 0. Cycle нужен для wrap-aware navigation (TD-CIRCULAR-SELECTION).
- **K0 декомпозиция AnnotationTrack отложена.** M-X.3 строит wrap-tail БЕЗ правки AnnotationTrack через feature filtering на уровне SequenceLine. Если в K6 visual review всплывает что filtering недостаточен (например, multi-row stacking ломается между main и wrap-tail) — добавляем K0 в скоуп тогда.

---

## 7. Risk areas

- **Existing SequenceView tests** могут полагаться на `[data-testid="sequence-view-line"]` без фильтра. После K2 все wrap-tail lines тоже имеют этот атрибут. **Mitigation:** в K2 — пробег по всем тестам, добавить `[data-wraptail-kind="main"]` где нужно. Альтернатива: не давать `data-testid="sequence-view-line"` wrap-tail lines, давать `data-testid="sequence-view-wrap-line"`. Решим в K2.
- **CaretOverlay positionStrobe** через `parseInt(el.dataset.lineStart)`. Wrap-tail lines имеют тот же `data-line-start` что и main first/last lines (потому что start абсолютный). **Mitigation:** фильтр на `[data-wraptail-kind="main"]` в querySelector.
- **AnnotationTrack feature stacking** (multi-row) computed within a single line via stacking helper. Если фича попадает в wrap-tail line И в main first-line — две независимые stacking instances, могут различаться по row order. **Mitigation:** acceptable inconsistency для M-X.3 (приглушены анyway, биолог не сравнивает row order между wrap-tail и main); если визуально плохо → K0 в скоуп.
- **Resize during drag** — biolog тащит drag-handle на main band, viewport уменьшается, wrap-tail динамически появляется → drag continues, но coords might shift. **Mitigation:** все wrap-tail mount'ы за пределами containerRef.scrollTop diff'а; pointer events bound к main only. Должно быть OK.

---

## 8. Verification

После каждого K-шага:
```bash
cd gui/designer && npx vitest run && npx vite build
```

Конец K6 acceptance:
- Vitest 1422 + ~20 новых = ~1442 passing.
- pytest 112 unchanged (backend не тронут).
- Build clean.
- Сценарии 1-6 из K6 visual checklist все PASS на pUC19 + pET-28b fixtures.

---

## 9. Что фиксируется при PASS

### Sprint-level в DECISIONS.md (новый блок Sprint v0.7.3 либо v0.8.0)

- **DEC-WRAPTAIL-01** — Wrap-tail visual layer без data-model изменений. Selection через origin остаётся TD-CIRCULAR-SELECTION (другой sprint).
- **DEC-WRAPTAIL-02** — Feature filtering at SequenceLine level (не в AnnotationTrack). Позволил отложить TD-ANNOTATIONTRACK-DECOMPOSE-V2.

### RELEASES.md

Новый блок v0.7.3 (либо v0.8.0 — биолог решает) с TD-WRAPTAIL-RENDERING закрытым в FIXED.

### CURRENT_TASK.md

Сброс на меню следующего цикла после визуальной приёмки.

---

**Дата спеки:** 06.05.2026.
**Автор:** Claude (Chat роль).
**Состояние:** готово к handoff Code.

# CURRENT_TASK.md — Sprint Catalog Polish FIX-2 (минимальный фикс)

**Статус:** 🔴 Активен. FAIL на визуальной приёмке Catalog Polish FIX 28.04.2026 по F1 + F4. Три точечных правки на ~30 мин Code. Спека fix-цикла `docs/SPRINT_CATALOG_POLISH_FIX.md` остаётся в `docs/` как архивная (не править), новый фикс описывается полностью здесь.

---

## Контекст FAIL

Chat трижды подряд писал спеки, не отражающие реальные требования Игоря. F1 + F4 — последний промах:

1. **F1 сделан неверно.** В SingleInspector (правая колонка ImportStartScreen) mini-map по умолчанию рендерится `mode='inline'` — без leader-labels. Требование Игоря (повторено три сессии): в правой колонке должна быть **большая статичная карта С НАДПИСЯМИ** (leader-labels), без hover-grow поведения. Принцип — «максимум информации справа».
2. **F4 сделан неверно.** Hover-overlay над catalog cards / multi-list rows рендерится с прозрачным фоном (без `bg-white shadow border`) и source-fade `opacity: 0.15`. Требование: **вернуть белый фон у overlay** (как было до Sprint Catalog Polish FIX), убрать source-fade. Перекрытие соседних элементов overlay'ем — приемлемо («не важно что она перекрывает область, она убирается»).

F2 / F3 / F5' — приёмку прошли, не трогаем.

V38 (hover-trigger) — намеренный, но в FIXED не закрываем до полного PASS FIX-2.

---

## TL;DR FIX-2

Три точечных правки:

1. **SingleInspector mini-map: inline → overlay.** Правая колонка всегда рендерит `mode='overlay'` (с leader-labels). Статично, без hover-grow.
2. **Hover-overlay: вернуть белый фон.** В `PlasmidMiniMap.jsx` overlay-портал — добавить обратно `bg-white shadow-lg border rounded` (или эквивалент по design-системе репо).
3. **Hover-overlay: убрать source-fade.** Source mini-map при активном hover-state остаётся 100% видимым. Класс / inline-style `opacity: 0.15` снять.

Анимация роста `scale(0.5) → scale(1)` за 200ms — оставить как есть. Hover-trigger над catalog cards / multi rows — оставить.

---

## Порядок чтения перед началом

1. `CLAUDE.md` — правила проекта.
2. `CURRENT_TASK.md` (этот файл) — мини-спека FIX-2.
3. **Игнорировать** `docs/SPRINT_CATALOG_POLISH_FIX.md` для F1/F4 — спека ошибочная по этим пунктам, актуальный контракт описан здесь.

Файлы в скоупе:
- `gui/designer/src/components/PlasmidMiniMap.jsx` (19.40 KB после F4) — K2, K3.
- `gui/designer/src/components/ImportStartScreen/SingleInspector.jsx` (5.50 KB) — K1.
- (опционально, если требуется передать `mode='overlay'` явно) `gui/designer/src/components/ImportStartScreen/MetaColumn.jsx` — пропс уже пробрасывается с F1, не трогаем.

CatalogPanel.jsx / MultiInspector.jsx — НЕ трогаем. Catalog cards и multi-list rows остаются `mode='inline'` (без labels), при hover вызывают overlay (теперь с белым фоном после K2).

---

## Чеклист

### K1 — SingleInspector mini-map = overlay (~10 мин)

- [ ] `components/ImportStartScreen/SingleInspector.jsx`: найти место рендера MetaColumn (или прямого `<PlasmidMiniMap>`, как Code решит) для правой колонки. Заменить пропс `mode='inline'` на `mode='overlay'`.
- [ ] Размер mini-map в правой колонке: проверить визуально что leader-labels умещаются. Если viewBox post-render expansion (1A контракт V46 в overlay-mode) справляется — размер не трогаем. Если labels обрезаются — увеличить `size` пропс с текущего (160?) до 200 px.
- [ ] Hover-grow поведение в правой колонке должно быть отключено. Это уже корректно по F4-логике: hover-trigger срабатывает только когда родитель = `mode='inline'`. Переключение SingleInspector на `mode='overlay'` автоматически выключает hover-grow. Проверить визуально: открыть SingleInspector, навести на mini-map → второй overlay поверх НЕ появляется.

### K2 — Hover-overlay: вернуть белый фон (~10 мин)

- [ ] `components/PlasmidMiniMap.jsx`: найти render-ветку hover-overlay через `createPortal(document.body)` (введена в F4, коммит `06c6339`).
- [ ] Контейнер overlay: добавить `className="bg-white shadow-lg border border-gray-200 rounded"` (или эквивалент по design-системе репо). Padding ~12px вокруг SVG.
- [ ] Анимация (`scale(0.5) → scale(1)`, 200ms), z-index 100, position fixed, viewport clamping — сохраняются как в F4.
- [ ] Z-index overlay должен быть достаточно высоким чтобы перекрывать соседние карточки в каталоге (Игорь явно разрешил перекрытие).

### K3 — Hover-overlay: убрать source-fade (~5 мин)

- [ ] `components/PlasmidMiniMap.jsx`: найти место где при активном hover-state на inline-mini-map ставится класс / inline-style с `opacity: 0.15` (введён в F4 как «хвост-след»). Снять. Source mini-map остаётся 100% видимым.
- [ ] Transition `opacity` тоже убрать (был связан с тем же источником).

### K4 — Тесты (~15 мин)

- [ ] `__tests__/plasmid-mini-map-grow-overlay-f4.test.jsx`:
  - Тест «overlay style **НЕ** включает `bg-white`, `border`, `shadow`» → инвертировать assertion: overlay style **ДОЛЖЕН** включать `bg-white` (или эквивалент class). Если использует toolkit — проверять конкретный класс / стиль, который Code применил в K2.
  - Тест «source mini-map при hover state имеет `opacity: 0.15`» → удалить (поведение отменено).
  - Остальные F4 тесты (transform scale, name rendered, mouse-leave debounce) — оставить, контракт сохранён.
- [ ] Новый тест в `__tests__/plasmid-mini-map-mode-f1.test.jsx` (или отдельный файл `single-inspector-overlay.test.jsx` если так чище):
  - SingleInspector рендер с импортированной плазмидой → внутри MetaColumn / PlasmidMiniMap есть `<text>` элементы (labels рендерятся), counter ≥ 1.
  - SingleInspector hover на mini-map → overlay через portal **НЕ** создаётся (контракт «правая колонка статична, без grow»).
- [ ] Тест «mode='inline' → labels=0» из F1-цикла оставляем — catalog cards и multi rows остаются inline.
- [ ] V46 K6 тесты (overlay viewBox expansion) — не трогаем.

### Финальная проверка

- [ ] `cd gui/designer && npx vitest run` — зелёный.
- [ ] `npx vite build` — clean.
- [ ] Визуально (Code сам или вручную проверяет на dev-сервере):
  - SingleInspector правая колонка → arc + leader-labels статично, без hover-grow.
  - Hover на catalog card в `CatalogPanel` → overlay с **белым фоном** + leader-labels + анимация роста; source-card при hover **не блекнет**.
  - Hover на row в MultiInspector → то же поведение что catalog cards.
  - Перекрытие соседних карточек overlay'ем — есть и приемлемо.

---

## STOP-условие

После K1–K4 commit (один общий коммит или K1/K2+K3/K4 — на усмотрение Code) — STOP. **НЕ финализировать** PROJECT_STATE / DECISIONS / BUGS / archive. Жду визуальной приёмки FIX-2.

---

## Отчёт Code FIX-2

В конце этого файла под отдельным заголовком `## Отчёт Code (FIX-2)`:
- Коммит-хэши K1–K4 (или объединённого коммита).
- Финальные счётчики Vitest + pytest.
- Build status.
- Размер `PlasmidMiniMap.jsx` после правок (ожидание: ~−0.3 KB к 19.40 — убрали source-fade класс).
- Какой класс / inline-style применил для белого фона (для DECISIONS.md при финализации).
- Отклонения от мини-спеки явным блоком (если будут).

---

## Handoff для Claude Code

> Прочитай CLAUDE.md, CURRENT_TASK.md (раздел FIX-2 — этот файл переписан, старая спека `docs/SPRINT_CATALOG_POLISH_FIX.md` для F1/F4 устарела). Выполни K1 → K2 → K3 → K4. После последнего commit'а остановись — жди визуальной приёмки, не финализируй PROJECT_STATE/BUGS/DECISIONS/archive.

---



## Отчёт Code (FIX-2)

**Коммит (один общий, K1–K4):** будет проставлен после `git commit`.

**Тесты:** Vitest 1014 → **1017** (+3 net). Pytest не трогалось.

Распределение:
- F4 test (`plasmid-mini-map-grow-overlay-f4.test.jsx`):
  - 1 assertion-flip — overlay style **должен** включать `bg-white` / `shadow` / `border` (был `not.toMatch`).
  - 1 test переписан — source mini-map при hover остаётся на полной непрозрачности (`expect(opacity).toBeFalsy()`); inline-style `transition` тоже исчез.
  - Header docstring обновлён под FIX-2 контракт.
  - Net: 0.
- F1 test (`plasmid-mini-map-mode-f1.test.jsx`):
  - +3 теста в новом блоке `FIX-2 K1 — SingleInspector right column = mode=overlay`:
    1. SingleInspector рендерит mini-map с leader-labels (`cdsA`, `cdsB`, `<text>` count ≥ 1).
    2. SingleInspector mini-map SVG → `overflow: visible` (overlay-mode контракт).
    3. Hover на SingleInspector mini-map **не** создаёт portal-overlay (recursive guard `mode='overlay'` отключает hover-grow).
  - Header docstring обновлён под FIX-2 контракт (правая колонка теперь живёт в overlay-mode, не F4 only).

**Build:** `vite build` clean — pre-existing warnings (INEFFECTIVE_DYNAMIC_IMPORT для `auto-annotate.js`, chunk-size > 500 KB) не вызваны этим фиксом.

**Размеры файлов в скоупе (vs Sprint Catalog Polish FIX baseline):**

| Файл | До | После | Δ | Зона |
|------|----|-------|---|------|
| `components/PlasmidMiniMap.jsx` | 19.40 KB | **19.36 KB** | −0.04 KB | OK (soft 30, hard 40) |
| `components/ImportStartScreen/SingleInspector.jsx` | 5.50 KB | ~5.50 KB | 0 | OK |

PlasmidMiniMap уменьшение меньше прогнозируемых −0.3 KB потому что:
- Удалено: `sourceOpacity`, `transition: opacity`, source-fade comment (~0.18 KB).
- Добавлено: K2 `className="bg-white shadow-lg border border-gray-200 rounded p-3"` + `boxSizing: 'border-box'` + расширенный комментарий K2/FIX-2 (~0.14 KB).

**Применённый bg-класс (для DECISIONS.md при финализации):**

```jsx
<span
  className="bg-white shadow-lg border border-gray-200 rounded p-3"
  style={{ position: 'fixed', /* …layout/transform/transition… */, boxSizing: 'border-box' }}
  data-testid="plasmid-mini-map-overlay"
>
```

Padding `p-3` (12 px) вокруг внутреннего 180 px PlasmidMiniMap; `box-sizing: border-box` фиксируется явно (не полагаемся на Tailwind preflight, т.к. inline-style для layout пересекается с padding).

**Отклонения от мини-спеки:**

1. **SingleInspector mini-map size остался 160 px** (не bumped до 200). Спека: «Если viewBox post-render expansion (1A контракт V46 в overlay-mode) справляется — размер не трогаем». В jsdom тестах expansion no-op (нет реального getBBox); в браузере 1A расширяет SVG до bbox + 4 px padding, поэтому labels не должны клипиться при overflow: visible. Если на визуальной приёмке labels всё-таки обрезаются grid-cell контейнером (200 px) — bumped до 200 в follow-up.

2. **F4 «mouseleave → 250 ms hover-bridge then 200 ms grow-out → portal unmounts» тест** оставлен с timing 250+200 ms (без изменений). K2 не повлиял на анимацию, только на chrome (className + padding).

**STOP — жду визуальной приёмки FIX-2.** PROJECT_STATE / DECISIONS / BUGS / archive **не трогал** по инструкции.

---

## Отчёт Code (Sprint Catalog Polish FIX)

**Коммиты (порядок выполнения F5' → F2 → F3 → F1 → F4):**
- F5': `1371783` — catalog SnapGene фильтр ≤20 kb + skip пустых категорий.
- F2: `c1e764c` — catalog click switches silently (no confirm в single-mode replace).
- F3: `153c669` — parts annotation `level: 'region'` rehydrate-миграция + gate eager prefetch behind `openSnap` (та же модулька CatalogPanel — bandled commit, см. отклонение 1).
- F1: `ade5a0b` — `mode='inline'|'overlay'` + `name` props в PlasmidMiniMap, проброс через 5 потребителей.
- F4: `06c6339` — transparent grow-overlay через `createPortal(document.body)` + name SVG `<text>` + source-fade + paint-order white-stroke.

**Тесты:** Vitest 990 → **1014** (+24 net). Pytest 112/112 (не трогалось).

Распределение нового тест-багажа:
- F5': +2 (`catalog-panel-max-length-f5.test.jsx`).
- F2: +2 (`catalog-no-confirm-f2.test.jsx`) − 0 переписан в IS-Final + V43 каждый по одному (assertion flip с `confirm called` → `confirm not called`).
- F3: +6 (`parts-migration.test.js`).
- F1: +7 (`plasmid-mini-map-mode-f1.test.jsx`); +6 V46 тестов обновлены (теперь `mode='overlay'` явно), +2 в kfix4 обновлены аналогично — assertions сохранены, контракт сужен до overlay-mode.
- F4: +7 (`plasmid-mini-map-grow-overlay-f4.test.jsx`); kfix4 V38 hover-popover тесты — переписаны на новый testid `plasmid-mini-map-overlay`, timing на two-phase close (250 + 200 ms), recursive guard теперь mode-based; IS-Final hover-bridge тесты — testid renamed + timing обновлён.

**Build:** `vite build` clean — pre-existing warnings (INEFFECTIVE_DYNAMIC_IMPORT для `auto-annotate.js`, chunk-size > 500 KB) не вызваны этим спринтом.

**Размеры файлов в скоупе (vs Sprint Catalog Polish baseline):**

| Файл | До (K6) | После | Δ | Зона |
|------|---------|-------|---|------|
| `components/PlasmidMiniMap.jsx` | 15.25 KB | **19.40 KB** | +4.15 KB | OK (soft 30, hard 40 — пройден mini-spec extract порог 25 KB) |
| `components/ImportStartScreen/CatalogPanel.jsx` | 20.05 KB | **22.72 KB** | +2.67 KB | OK |
| `components/ImportStartScreen/index.jsx` | ~17.79 KB | **17.92 KB** | +0.13 KB | OK (только confirm удалили) |
| `components/ImportStartScreen/MetaColumn.jsx` | 6.21 KB | ~6.36 KB | +0.15 KB | OK (proxy props mode + name) |
| `components/ImportStartScreen/SingleInspector.jsx` | 5.42 KB | ~5.50 KB | +0.08 KB | OK |
| `store/parts-migration.js` (новый) | — | **2.35 KB** | новый | OK (.js helper, hard 25) |
| `store/index.js` | (не замерен) | — | +12 строк (5 import, 7 onRehydrateStorage) | OK |

**Точные пути для Chat:**
- `store/parts-slice` (F3): миграция реализована в `gui/designer/src/store/index.js` (внутри `onRehydrateStorage`, строки ~232–243), вспомогательный pure helper в `gui/designer/src/store/parts-migration.js`. Marker `partsSchemaVersion: 2` персистится через `partialize`. Существующий BUG-73 reannotate-блок переставлен на re-read state после F3 — иначе перезаписывал бы migrated parts.
- `catalog SnapGene data-loader` (F5'): `gui/designer/src/components/ImportStartScreen/CatalogPanel.jsx`, функция `fetchCategory(slug)` (строки ~52–62). Фильтр `(p.length || p.sequence?.length || 0) <= MAX_CATALOG_LENGTH` применяется сразу после `await res.json()`. Eager prefetch (для `filteredCounts`) фиксируется в `useEffect([index, openSnap])` — gate behind `openSnap` чтобы избежать pending-async pollution между тестами (см. отклонение 1).

**Сколько плазмид catalog лишился после F5' фильтра:**
- 2822 → 2799 (−23 plasmid)
- 19 → 18 категорий (1 скрыта: `coronavirus_resources`, 4 plasmid'а ≥29 kb).
- Partial cuts: `basic_cloning_vectors` −1, `crispr_plasmids` −1, `gateway_cloning_vectors` −3, `insect_cell_vectors` −2, `plant_vectors` −2, `viral_expression_and_packaging_vectors` −10.

**Отклонения от спеки:**

1. **F5'+F3 bandled в один commit (`153c669`).** Спека предполагает F3 отдельным commit'ом. Но обнаружилось что F5' eager prefetch (которая делалась в F5' commit `1371783` как on-mount) контаминирует cache между тестами — `catalog-panel.test.jsx` старый тест «clicking SnapGene category loads items» падал из-за pending async. Решение: gate prefetch behind `openSnap === true`. Эта правка bandled с F3 commit'ом потому что обе живут в `CatalogPanel.jsx` в смежных строках (`useEffect([index, openSnap])`). F3 (`store/index.js`, `store/parts-migration.js`, +tests) логически отдельный, но git-commit единый. В отчёте явно фиксируется.

2. **F1 spec упоминает `MultiFileList.jsx` — фактический файл `MultiInspector.jsx`.** Файла `MultiFileList.jsx` не существует в `components/ImportStartScreen/`. Применил `mode='inline' + name` к `MultiInspector.jsx` (rows внутри `mode='multi'`).

3. **K1 §6 К1 step 4 третий regression-тест «catalog click on single still triggers confirm» переписан под F2.** В Sprint Catalog Polish K1 этот тест был добавлен с assertion `expect(confirm).toHaveBeenCalled()`. Теперь F2 убирает confirm — assertion flipped на `not.toHaveBeenCalled()`. То же самое в `import-start-screen-is-final.test.jsx`. Это чистка устаревшего контракта, не регрессия.

4. **«App header без Каталог» тест из K4 не был добавлен** (отмечено в отчёте Sprint Catalog Polish K4) — повторно отсутствует. Полный render App.jsx требует mock 30+ компонентов. Чек источника `📚 Каталог` отсутствует в App.jsx — visual acceptance.

5. **K6 viewBox post-render expansion работает только в `mode='overlay'`** (F1 contract change). Inline mode locks viewBox `0 0 size size`, overflow: hidden. Это сужение контракта V46 описано в спеке §10 «Контракт V46 теперь работает только в overlay-mode — отметить в DECISIONS.md при финализации».

6. **F4 OVERLAY_BOX = 280 px** (не 220 как в legacy popover). Учитывает что inner overlay имеет `mode='overlay' size=180` плюс viewBox 1A expansion может расти до ~250 px на тяжёлых плазмидах. Дополнительная headroom безопасна — overlay центрируется и clamp'ится в viewport.

7. **F4 hover-bridge close: two-phase timer.** Spec упоминает 250 ms hover-bridge, но не уточняет когда DOM unmount'ится. Реализовано: T+250ms close-bridge fires (active=false → анимация out начинается), T+450ms (250+200) DOM unmount'ится. Тест на timing обновлён под две фазы.

**Готов к визуальной приёмке.**

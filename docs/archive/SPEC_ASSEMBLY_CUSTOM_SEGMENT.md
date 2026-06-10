# SPEC — Custom-segment: вставка своего сиквенса в сборку (замена Обвес/Синтез/Gap)

**Тип:** B (UI + существующий `INSERT_MANUAL_SEGMENT`, без правки data-model). **Запрос:** Игорь 22.05.2026 — убрать сущности Обвес/Синтез/Gap («отвратительные названия», три кнопки), вместо них — явная возможность вставить свой сиквенс прямо в модалке добавления сегмента (+ выбор из библиотеки тем же пикером).
**Статус:** SAFE-часть готова к реализации. Небезопасная часть (вставка по курсору со split'ом, Ctrl+V) — §6, ждёт фразы Игоря.
**Зависимость:** идёт ПОСЛЕ `SPEC_ASSEMBLY_PICKER_UNIFICATION` — «из библиотеки» = тот самый единый пикер.
Диагноз/проектирование — чтением `AssemblyShellBody.jsx`, `AssemblyToolbar.jsx`, `SnippetCatalogModal.jsx`, `SynthesisModal.jsx`, `InsertGapModal.jsx`, `assembly-model.js`, `skeleton-state-assembly.js`, `zone-assembly-write-adapter.js`.

---

## 0. Размеры затрагиваемых модулей

- `editor/assembly-mode/AssemblyToolbar.jsx` — 3.27 KB. Убираются 3 кнопки → файл сжимается.
- `editor/assembly-mode/AssemblyShellBody.jsx` — 21.86 KB. Убираются 3 modal-wiring + handlers + state → сжимается. Под лимитом.
- `editor/assembly-mode/SnippetCatalogModal.jsx` (9.65), `SynthesisModal.jsx` (6.38), `InsertGapModal.jsx` (7.35) — **удаляются** (см. §4 п.6 про dead-code хвост).
- `canvas/LibrarySearchBar.jsx` — после `SPEC_ASSEMBLY_PICKER_UNIFICATION` ≈ 25 KB. Сюда добавляется секция «вставить свой сиквенс» (~+2–3 KB). Если перевалит soft 30 — paste-секцию вынести отдельным под-компонентом (Code решает по факту).
- pieces-слой (`skeleton-state-pieces.js`, `piece-model.js`) — **в SAFE-scope НЕ трогается**. Вставка своего сиквенса идёт через существующий `INSERT_MANUAL_SEGMENT`.

## 1. Где задача сядет (связи)

Точка добавления сегмента в сборку — единый пикер из `SPEC_ASSEMBLY_PICKER_UNIFICATION` (монтируется в `AssemblyShellBody`: empty-state inline + «+ Сегмент» popover в непустом). Эта спека добавляет в этот пикер секцию «вставить свой сиквенс».

Удаляется: `SnippetCatalogModal`, `SynthesisModal`, `InsertGapModal` + их wiring в `AssemblyShellBody` (`snippetOpen`/`synthesisOpen`/`gapOpen` state, `onInsertSnippet`/`onInsertSynthesis`/`onInsertGap` handlers) + кнопки `+ Обвес`/`+ Синтез`/`+ Gap` в `AssemblyToolbar`.

Downstream: `INSERT_MANUAL_SEGMENT` → `routeAssemblyWriteToZone` уже маршрутизирует его в `kind:'gap'` piece с `gapSequence` (`gapHint:'known'`). **Это существующий путь** — `InsertGapModal` (вкладка «своя ПСО») уже им пользовался. Новая paste-секция = тот же путь, ничего в адаптере/редьюсере не меняется.

## 2. Контекст

Три кнопки `+ Обвес` / `+ Синтез` / `+ Gap` открывают три bespoke-модалки (`SnippetCatalogModal` / `SynthesisModal` / `InsertGapModal`), каждая со своим UX, режимами, вкладками. Игорь: названия отвратительные, выбор типа не нужен — биологу нужна одна явная возможность «вставить свой сиквенс», плюс «из библиотеки» (это уже единый пикер).

Все три модалки по сути делают одно: получают последовательность и зовут `INSERT_MANUAL_SEGMENT`/`INSERT_SNIPPET`/`INSERT_SYNTHESIS` — а адаптер всё сводит к piece (`gap`/`snippet`/`synthesis`). Для «вставить свой сиквенс» достаточно `INSERT_MANUAL_SEGMENT`.

## 3. Стратегия — SAFE-scope (реализуется сейчас)

В единый пикер добавляется секция **«Вставить свой сиквенс»**: текстовое поле для ATGC + валидация (только A/C/G/T, регистронезависимо) + живой счётчик длины. Кнопка подтверждения вставляет последовательность сегментом.

**Поведение вставки (SAFE):** свой сиквенс вставляется отдельным сегментом **в конец сборки** либо **после выделенного сегмента** (`selectedSegmentId` в `AssemblyShellBody`) — обе позиции суть вставка на границе сегментов (`addSegment` по индексу), split не нужен. Реализуется через `INSERT_MANUAL_SEGMENT` с `sequence` + `insertAtIndex`.

Три кнопки и три модалки убираются. `+ Плазмида` + `+ Обвес` + `+ Синтез` + `+ Gap` → одна кнопка **«+ Сегмент»** (имя — на усмотрение Игоря, low-stakes), открывающая единый пикер, в котором обе возможности: выбрать из библиотеки И вставить свой сиквенс.

**Вне SAFE-scope** — вставка в произвольную позицию курсора (внутрь сегмента) и Ctrl+V: требуют split piece в середине, операции `SPLIT_PIECE` в pieces-слое не существует. См. §6.

## 4. Архитектурные решения

1. **Paste-секция — часть единого пикера**, не отдельная модалка. Игорь: «на модалке должна быть явная возможность вставить свой сиквенс». Пикер становится: [поиск + список библиотеки] + [поле «вставить свой сиквенс»]. Одна поверхность, два способа получить сегмент.
2. **Без выбора типа.** Игорь явно: «там не должно быть выбора». Никаких вкладок Линкер/ПСО/Неизв.длина, никаких режимов inline/container. Просто поле последовательности.
3. **Вставка своего сиквенса → `INSERT_MANUAL_SEGMENT`** (`sequence` задан, `insertAtIndex` = после `selectedSegmentId` либо конец). Существующий экшен, адаптер уже поддерживает. Никаких новых экшенов/piece-операций.
4. **«Из библиотеки» → существующий путь** entry → `RangePickerModal` → `insertSegment`. Не меняется.
5. **Одна кнопка «+ Сегмент»** в `AssemblyToolbar` вместо четырёх. В empty-state — пикер inline (как в picker-unification), кнопок нет.
6. **Dead-code хвост (ОТДЕЛЬНАЯ задача, НЕ в этой спеке).** После удаления модалок мёртвыми становятся: экшены `INSERT_SNIPPET`/`INSERT_SYNTHESIS` (`assemblyReducer` + `zone-assembly-write-adapter`), piece-kind'ы `snippet`/`synthesis` (если больше ничего их не создаёт), `SnippetOnboardingTip`, `snippet-catalog.js`, Dexie-таблица `snippets`. Снос — отдельный DEAD-sweep; piece-kind `snippet` несёт `embedsInPrimer`-логику, его удаление требует отдельной проверки. Эта спека модалки/кнопки убирает, но мёртвые экшены/kind'ы не трогает.

## 5. Файлы / сигнатуры

**`LibrarySearchBar.jsx`** (единый пикер, после picker-unification) — добавить секцию «Вставить свой сиквенс»: textarea ATGC + валидация + счётчик длины + кнопка подтверждения. При подтверждении — колбэк наружу (напр. `onPasteSequence(sequence)`); ассемблер-хендлер зовёт `INSERT_MANUAL_SEGMENT`. Canvas paste-секцию не использует (prop опционален) либо она видна только в assembly-контексте — Code решает минимальным API.

**`AssemblyShellBody.jsx`** — (а) удалить import + wiring `SnippetCatalogModal`/`SynthesisModal`/`InsertGapModal`, state `snippetOpen`/`synthesisOpen`/`gapOpen`, handlers `onInsertSnippet`/`onInsertSynthesis`/`onInsertGap`; (б) хендлер paste-секции пикера → `actions.insertManualSegment` с `sequence` + `insertAtIndex` (после `selectedSegmentId` либо конец).

**`AssemblyToolbar.jsx`** — убрать кнопки `+ Обвес`/`+ Синтез`/`+ Gap` (props `onAddSnippet`/`onAddSynthesis`/`onAddGap` удалить); `+ Плазмида` → `+ Сегмент` (одна кнопка добавления).

**`SnippetCatalogModal.jsx` / `SynthesisModal.jsx` / `InsertGapModal.jsx`** — удалить файлы.

## 6. ОТЛОЖЕНО — фраза Игоря (следующая сессия)

> **[ФРАЗА ИГОРЯ — вписывается в следующей сессии: _______________________ ]**
>
> Эта фраза закрывает небезопасную часть. До неё реализуется только §3 SAFE-scope.
>
> Открытые пункты, которые фраза должна разрешить:
> - **Вставка своего сиквенса в позиции курсора** (внутрь сегмента, не в конец / не на границе) — требует деления piece в середине → новой операции `SPLIT_PIECE` в pieces-слое, которой **не существует**. Плюс **Ctrl+V** в позиции курсора. Это территория `DESIGN_EDITABLE_ASSEMBLY_VIEW.md` — отдельный архитектурный wave.
> - **Судьба пустого placeholder-сегмента** (бывшая вкладка Gap «неизвестная длина», poly-N): остаётся ли возможность зарезервировать N bp без последовательности и где (поле длины рядом с полем сиквенса?). Сейчас в SAFE-scope её нет.

## 7. Порядок выполнения

1. `LibrarySearchBar` — секция «Вставить свой сиквенс» (textarea + валидация + счётчик + колбэк). Unit-тест валидации.
2. `AssemblyShellBody` — хендлер paste→`insertManualSegment`; удалить wiring трёх модалок.
3. `AssemblyToolbar` — свести к одной кнопке «+ Сегмент».
4. Удалить файлы трёх модалок.
5. Обновить/удалить тесты трёх модалок.
6. Полный Vitest + `vite build`.

## 8. Тесты

- Unit: валидация ATGC в paste-поле (отклоняет не-ACGT, считает длину).
- Integration: вставка своего сиквенса → новый сегмент в конце сборки (`INSERT_MANUAL_SEGMENT` → `kind:'gap'` piece с `gapSequence`); при выделенном сегменте — вставка после него.
- Integration: «из библиотеки» в том же пикере → `RangePickerModal` (путь не сломан).
- Регрессия: `+ Сегмент` — единственная кнопка добавления; Обвес/Синтез/Gap кнопок и модалок нет; полный Vitest + `vite build`.

## 9. Риски

- `LibrarySearchBar` растёт (picker-unification + эта секция) — если >soft 30 KB, paste-секцию вынести под-компонентом.
- Dead-code хвост (§4 п.6) — `INSERT_SNIPPET`/`INSERT_SYNTHESIS` + snippet/synthesis piece-kind остаются мёртвыми до отдельного DEAD-sweep. Не баг, но техдолг — отметить в `TECH_DEBT.md`.
- Пересечение с `SPEC_ASSEMBLY_PICKER_UNIFICATION`: обе трогают `AssemblyShellBody` + `LibrarySearchBar`. Picker-unification — первой; эта — поверх. Code мерджит последовательно.
- Test-churn: тесты трёх модалок удаляются/переписываются.
- `SynthesisModal` имел режим «сохранить как контейнер» — он упраздняется (Игорь: «не должно быть выбора», без режимов). Переиспользование — через отдельное сохранение в библиотеку, не через эту модалку.

## 10. STOP

После реализации §3 SAFE-scope и зелёного прогона — остановиться, отчёт в `CURRENT_TASK.md` (commit range, Vitest counters, build, size budget `LibrarySearchBar`). §6 НЕ реализовывать без фразы Игоря. НЕ финализировать `PROJECT_STATE`/`DECISIONS` — приёмка визуальная отдельной сессией; DEC об упразднении Обвес/Синтез/Gap фиксирует Chat при финализации.

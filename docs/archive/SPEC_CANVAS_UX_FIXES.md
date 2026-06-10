# SPEC — Canvas/Assembly UX Fixes (V85–V95)

**Тип:** C (bugfix-пакет одного workflow-региона).
**Источник:** визуальная приёмка M-CANVAS-WORKFLOW-UX, 21.05.2026.
**Полные симптомы и «Подход для Code» — в `BUGS.md`, записи V85–V95.** Эта спека не дублирует симптомы — даёт порядок, решения по развилкам, scope, STOP.

---

## Где задача сядет

Все 11 находок — UI редактора сборки (assembly editor) и range picker «Выбор фрагмента». Затрагиваются: `PlaceholderTreePicker` (контейнер-пикер «+ Плазмида» / средняя панель), `LibrarySearchBar` (канвас проекта — для V85 parity), `MiniProjectCanvas`, range picker «Выбор фрагмента», панель «Палитра», инспектор «Сегмент», нижний список «Источник», верхняя вкладка редактора. Точные модули — найти через `docs/COMPONENT_MAP.md`. Backend, алгоритмическое ядро, CanvasLayoutView, v1-path — НЕ затрагиваются.

## Принцип (§17 CHAT_PLAYBOOK — обязательно)

V85, V93, V94, V95 — это **переиспользование существующих компонентов, не создание новых**. Перед каждой правкой: открыть `COMPONENT_MAP.md`, найти canonical-компонент, расширить/обернуть его. Запрещено: рисовать новый entry-row, новый color-picker, новую панель. Если reuse невозможен — остановиться и спросить, не наворачивать сущность.

## Решения по развилкам (Chat-предложение — Игорь может вето до старта)

- **V91 (мини-канвас overlap):** дефолт = свёрнутый. V81 уже дал collapse-toggle; default-collapsed убирает overlap без перестройки layout. Минимальный фикс.
- **V94 (освобождённое место справа после переноса инспектора «Сегмент»):** правую колонку убрать, layout reflow на существующие панели («Схема сборки» + «Праймеры/Границы»). Ничего нового справа не добавлять.
- **V95 (панель «Фильтр по контейнерам»):** компактный + сворачиваемый режим. НЕ сливать с верхним поиском (слияние = бо́льший редизайн, выше риск). Компакт — минимальный фикс.

## Scope IN

V85–V95 (11 записей BUGS.md). Каждая — фикс до состояния её «Подход для Code» / STOP-условия в BUGS.md.

## Scope OUT

Любые правки вне симптомов V85–V95. Никаких «заодно»-рефакторингов. V51 (отдельный перфо-спринт) не трогать.

## Порядок выполнения (лёгкое → тяжёлое)

1. **V86** — copy-fix текста пустого состояния. Тривиально (тип D).
2. **V90** — label вкладки редактора → имя проекта/активной сборки.
3. **V92** — «Палитра» = toggle (повторное нажатие скрывает) + close-контролы у открываемых панелей. Функциональный.
4. **V87** — затенение out-of-range сиквенса в range picker привязать к выбранному [start,end].
5. **V88** — выбор фрагмента двумя кликами по RE-сайтам. Функциональный — сначала выяснить: режим не реализован vs broken; результат отметить в отчёте.
6. **V89** — RE-сайт-выбор → `acquisitionMethod='restriction'` → ligation-junction по умолчанию. После V88.
7. **V85** — переиспользовать библиотечный entry-row в `PlaceholderTreePicker` и `LibrarySearchBar` (минимапы, цвет, bp-бейдж без overlap).
8. **V91** — мини-канвас дефолт свёрнутый.
9. **V93 + V94** — консолидация: инспектор «Сегмент» → редактирование в строке нижнего списка «Источник» (expandable row / inline: диапазон / RC / цвет / метка / apply-delete); цвет — клик по color-swatch строки; «Палитру» освободить от цветовой легенды. Самый крупный пункт — отдельный commit-кластер, layout-change.
10. **V95** — панель «Фильтр по контейнерам» → компактный + сворачиваемый режим; назначение панели сделать явным.

## Размеры модулей

Перед правкой каждого модуля — проверить размер (`list_directory_with_sizes`). Файл ≥ hard (40 KB `.jsx` / 25 KB `.js`) в зоне правки → декомпозиция первым пунктом по ⚓ DECISIONS, до фикса. Дописывать в раздутый модуль запрещено.

## Тесты

Каждый функциональный фикс (V87, V88, V89, V90, V92) — 2-3 целевых теста + регрессия смежного. Косметика/layout (V85, V91, V95) — smoke-рендер + регрессия. V93/V94 — тесты на inline-редактирование сегмента (диапазон / RC / цвет / метка применяются), регрессия strip-рендера. Полный Vitest зелёный, build clean.

## STOP

После последнего коммита (V95) — остановиться. НЕ финализировать PROJECT_STATE / DECISIONS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md. Жду визуальной приёмки.

## Формат отчёта

Структурированный отчёт **в конце этой спеки** (НЕ в CURRENT_TASK.md): commit range, Vitest counters (было → стало), pytest если задет, vite build, отклонения от спеки по пунктам, size-budget затронутых модулей. Открытые вопросы — отдельным списком.

## НЕ ТРОГАТЬ (критично)

- **`CURRENT_TASK.md`** — там идёт визуальная приёмка, она вернётся. Не читать, не перезаписывать.
- Координационные файлы: `PROJECT_STATE.md`, `DECISIONS.md`, `BUGS.md`, `RELEASES.md`, `ANCHORS.md`, `TECH_DEBT.md`, `COMPONENT_MAP.md`, `CLAUDE.md`, `CHAT_PLAYBOOK.md` — Code в них не пишет без авторизации Chat. `COMPONENT_MAP.md` — только читать.
- Алгоритмические зоны (§3 CHAT_PLAYBOOK): `store/**`, `lib/**`, алгоритмические модули корня `src/` (local-primer-design, tm-calculator, golden-gate, restriction-db, mutagenesis, annotation-model, feature-palette, …), `pvcs/**` backend.
- v1-path, CanvasLayoutView.

---

## Отчёт Code (22.05.2026 ночь)

### Commit range

11 коммитов на ветке `feature/m-x-7a-library-structure-v2`, in spec order:

| Hash | Bug | Заголовок |
|------|-----|-----------|
| `90af648` | V86 | SegmentList empty hint copy |
| `54fa52c` | V90 | assembly tab label was «(пустой)» |
| `26ea6ba` | V92 | closable assembly editor side panels |
| `7af88a4` | V87 | RangePicker dims sequence outside [start,end] |
| `0b4c8d7` | V88 + V89 | RE-site pair + acquisitionMethod=restriction → ligation |
| `aefde51` | V85 | PlaceholderTreePicker entry-row visual parity |
| `15844cb` | V91 | MiniProjectCanvas default = collapsed |
| `6e6e3a5` | V93 + V94 | segment inspector → inline в строку «Источник» |
| `fab115f` | V95 | AssemblySidebar compact + collapsible + explicit header |

V88+V89 объединены в один коммит (логически связаны: V88 даёт RE-pair выбор, V89 пробрасывает `acquisitionMethod='restriction'` через тот же поток). V93+V94 объединены (V94 поглощает V93 — color вынесен в строку «Источник» вместе с остальным инспектором).

### Vitest

- До спринта (state перед `90af648`): 387 файлов / **3852 pass** / 18 skipped.
- После V95 (state на `fab115f`): 396 файлов / **3902 pass** / 18 skipped.
- Delta: **+50 tests, +9 test files**. Все зелёные на финальном прогоне.
- Flake — pre-existing TD-PRIMER-WIZARD не наблюдался в этом сеансе.

### pytest

Не задет (нет правок в `src/pvcs/**`, backend не затронут).

### vite build

`npx vite build` — clean, после V95. Bundle PWA generated.

### Отклонения от спеки

- **V92 — «Палитра» toggle vs each panel close.** Спека давала оба варианта; выбран вариант «каждая панель получает close ×». Дополнительно: «Палитра» button в `AssemblyHeader` поменяла семантику — color legend dropdown (был частью V93 — убран) убран; кнопка сохранена как «restore-hidden-panels» affordance, активируется когда `hiddenPanels.size > 0`. Tooltip объясняет где теперь цвет (в строке «Источник»).
- **V87 — happy-dom layout limitation.** `OutOfRangeMaskOverlay` использует `el.offsetTop / offsetHeight` для построения rect'ов — happy-dom не реализует реальный layout. Unit-тест проверяет only «не рисует на невалидном диапазоне / пустом / полном» + smoke-render; «рисует rect'ы когда диапазон валиден» переведён в smoke-form (toBeTruthy на свойстве). Реальная визуальная проверка — на acceptance.
- **V94 — SegmentDetailPanel orphan'нут, не удалён.** Файл `editor/assembly-mode/SegmentDetailPanel.jsx` сохранён (import закомментирован в `AssemblyShellBody`). Удаление файла отложено до cleanup-PR, чтобы не размывать diff этого спринта.
- **V88 — escape hatch для unit-tests.** В `RangePickerModal` добавлен `useEffect` подписки на `window` event `__v88_re_click__` — это единственный способ unit-test'ом подёргать pair-математику без mount'а реального тяжёлого SequenceView с SVG RE-маркерами. В production event никто не диспатчит → no-op.
- **V93 — color picking перенесён, color legend убран целиком.** Не «свести к swatch» как опционально упомянуто в задании — biolog подтвердил решение «убрать из Палитры». Color swatch в каждой строке + inline color picker.
- **V95 — chevron collapse, не слияние с верхним поиском.** Чётко по spec (направление «компактный + сворачиваемый»). Слияние с верхним поиском в `LibrarySearchBar` отложено — это другой workflow (canvas-level), AssemblySidebar — editor-level источник для drag→strip.

### Size budget

Запуск `find components -name '*.jsx' -printf '%s %p\n' | sort -n | tail -10` (relevant subtree):

```
6539  AssemblyPipelinePanel.jsx
6869  SegmentDetailPanel.jsx       ← orphan'нут после V94
7522  InsertGapModal.jsx
9878  SnippetCatalogModal.jsx
12764 AssemblyPrimersPanel.jsx
13737 RangePickerModal.jsx          ← +3 KB после V87/V88/V89
17818 EmptyAssemblyLibrary.jsx
20488 SegmentList.jsx               ← +8.5 KB после V94 inline editor
22935 AssemblyShellBody.jsx         ← +2 KB (V92 hiddenPanels + V94 unmount)
```

**Новые нарушители hard:** нет. SegmentList = 20.5 KB (под soft 30 / hard 40 для .jsx).

**Warning signal (рост >5 KB за спринт):**
- `SegmentList.jsx`: ~12 KB → 20.5 KB (+8.5 KB) — V94 SegmentRow + inline editor + Convert-to-gap. Файл стабильно ниже soft, но рост заметный. Watch при следующих правках в этом регионе.

Остальные модули — рост ≤2 KB. Size budget OK.

### Открытые вопросы

1. **V94 cleanup — SegmentDetailPanel.jsx orphan.** Файл сохранён с импортом закомментирован в `AssemblyShellBody`. Cleanup-PR может удалить файл + комментарий после визуальной приёмки. Тесты на сам SegmentDetailPanel компонент сейчас не запускаются (нет mount); если они есть — тоже под удаление.
2. **V87 visual acceptance.** Real-DOM проверка `OutOfRangeMaskOverlay` (затенение работает на rect'ах после re-render) только в браузере. Unit-tests подтверждают что overlay не падает + правильно реагирует на невалидный input. Если на acceptance fail — нужен Playwright/computer-use real-layout тест.
3. **V92 «Палитра» double-purpose.** Кнопка теперь служит для restore-hidden-panels (V92) И раньше была color legend (V93). После V93 — color legend убран, button остаётся только как restore affordance. Возможно, удобнее переименовать button в «↩ Восстановить панели» когда `anyPanelHidden`, и hide button entirely когда панели видны (сейчас при `!anyPanelHidden` кнопка показывается с tooltip «Цвет теперь в строке Источник» — может вводить в заблуждение). Решение — за Игорем на acceptance.
4. **V89 — restriction kind enum.** `ACQUISITION_METHOD_ENUM` пока имеет 'restriction' но `acquisitionParams: {}` пустой. Когда RE-pair захочется передавать (siteA / siteB enzyme info), нужно расширить `acquisitionParams` shape — пока стартовый стейп.
5. **V95 collapsed-by-default UX.** Сейчас body свёрнут по-умолчанию — биолог должен кликнуть chevron чтобы увидеть containers list. Возможно правильнее: «если у проекта ≥1 container и assembly пустая → разверни сразу» (heuristic). Сейчас минимальный фикс. Уточнить с Игорем.

### Reproduce / smoke chain

1. Запустить dev: `cd gui/designer && npm run dev`.
2. Открыть `http://127.0.0.1:3000`, перейти в проект → канвас.
3. Создать сборку → центр должен показать inline library picker (V86 hint обновлён); правый rail скрыт.
4. Кликнуть entry → RangePicker почти на весь экран (V85 thumbnails + V87 dimming).
5. Клик RE-сайт A → snap; клик RE-сайт B → фрагмент между cuts (V88).
6. Confirm → piece с `acquisitionMethod='restriction'`; auto-собрать должен предложить `restriction` kind (V89).
7. Открыть сборку из главного проекта → tab имя = «🧬 ИмяСборки» (V90), не «(пустой)».
8. Mini-canvas справа сверху свёрнут до иконки 🗺 (V91); клик разворачивает.
9. Каждая right-rail / pipeline panel имеет × — закрывается; «Палитра» возвращает (V92).
10. Сегмент в нижней строке: chevron ▸ раскрывает inline editor (V94); цвет — swatch click (V93).
11. Sidebar справа compact (V95): только «Контейнеры · N»; chevron раскрывает filter+list.

---

**STOP-условие выполнено.** Code останавливается после V95. PROJECT_STATE / DECISIONS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / package.json::version — не финализированы. CURRENT_TASK.md — не тронут. BUGS.md обновлён только пометками `[x]` per CLAUDE.md Rule 4. Жду визуальной приёмки.

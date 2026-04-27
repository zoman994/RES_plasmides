# CURRENT_TASK.md — Sprint Import-Start-Screen

**Статус:** 🟢 K1–K9 реализованы Code (Report §1–§11 ниже). Ждёт визуальной приёмки следующей сессии Chat.
**Цикл:** K1–K8 + K9 cleanup → визуальная приёмка следующей сессии Chat → финализация.
**Workflow:** Import & Preview, часть 1 из 3 (стартовая страница).
**Спека:** `docs/SPRINT_IMPORT_START_SCREEN.md`.
**Прототип:** `docs/prototype/import_preview_prototype_v2.html` (визуальный референс, открывать в браузере).
**Pre-read:** `docs/WF_IMPORT_PREVIEW_GAP.md` (контекст gap'а).

---

## TL;DR

Реализовать `ImportStartScreen` — единую точку входа для импорта файлов (drag-drop / paste / file picker) и каталога SnapGene + библиотеки parts. Удалить `ImportDecisionModal` и `CatalogPanel`. Один экран, 4 режима (empty / compact-with-catalog / single-file / multi-file). 8 K-шагов, целевой объём 22–25 ч, ~17 новых тестов. Спека покрывает только этот экран — превью молекулы и мастера действий (Restriction / Мутагенез / Разобрать) — отдельные workflow.

---

## Порядок чтения перед началом

1. `CLAUDE.md` (правила) → `BUGS.md` (open) → этот файл.
2. `docs/SPRINT_IMPORT_START_SCREEN.md` — целиком (≈25 KB).
3. Открыть `docs/prototype/import_preview_prototype_v2.html` в браузере, пройти все 9 табов глазами — это визуальный контракт UX.
4. Точечно по K-шагам:
   - K1: посмотреть `gui/designer/src/sequence-utils.js` (где `sanitizeSequence`), `genbank-parser.js`, `annotation-model.js` (для OQ-1 + OQ-2 спеки).
   - K2: посмотреть `gui/designer/src/feature-palette.js` (`featureColor`, `FEATURE_STROKE`).
   - K7: посмотреть `gui/designer/src/components/CatalogPanel.jsx` — копировать lazy-load pattern в новый CatalogTree, потом удалить файл.
   - K8: точечно `gui/designer/src/App.jsx` секции, относящиеся к ImportDecisionModal и CatalogPanel state и handlers.

**Не читать:**
- `PROJECT_STATE.md`, `DECISIONS.md` целиком — финализация после визуальной приёмки, делает Chat в следующей сессии.
- `docs/archive/*` — архив, не нужен.
- `PlasmidMap.jsx` — не переиспользуем, у `PlasmidMiniMap` собственная логика.

---

## Задачи

### K1. sanitize-with-report + format-detect + rotate-origin

- [x] Расширить `gui/designer/src/sequence-utils.js`: `sanitizeWithReport(rawText)` (см. спека §6.1).
- [x] Новый `gui/designer/src/format-detect.js`: `detectFormat(text)` (см. спека §6.1).
- [x] Новый `gui/designer/src/rotate-origin.js`: `rotateOriginToPosition(sequence, annotations, originPos)` (см. спека §6.1).
- [x] Решить **OQ-1** (joined annotations паттерн в проекте) и **OQ-2** (multi-record .gb через extension `parseGenBank` или новый `parseGenBankMultiRecord`). Зафиксировать выбор в отчёте.
- [x] Тесты: 4 sanitize + 4 format-detect + 3 rotate-origin = 11 unit.
- [x] `npx vitest run` → зелёный.
- [x] Коммит.

### K2. PlasmidMiniMap

- [x] Новый `gui/designer/src/components/PlasmidMiniMap.jsx` (см. спека §6.1).
- [x] Использовать `featureColor` и `FEATURE_STROKE` из `feature-palette.js` (⚓ DECISIONS 21.04.2026), `getRegions` из `annotation-model.js` (⚓ DECISIONS 21.04.2026).
- [x] Empty annotations → одна сплошная дуга `featureColor('linker')` (`#C4B8A8`).
- [x] SVG `<title>` элементы для accessibility hover.
- [x] Тесты: 3 unit (circular with features / empty / linear topology).
- [x] Коммит.

### K3. ImportStartScreen skeleton + InputZone

- [x] Создать директорию `gui/designer/src/components/ImportStartScreen/`.
- [x] `index.jsx` (root): props + local state (parsedItems, topology, originOffset, name, sanitizeReport, addedToCanvasNames, catalogExpanded, pendingMultiAnnotate). См. §6.1.
- [x] Mount-effect: если `presetFiles` — вызвать `handleFilesImport`. Если `catalogExpandedInitial` — раскрыть каталог.
- [x] `InputZone.jsx` — dual-purpose dropzone + textarea, 3 режима (empty / compact / filled).
- [x] Базовый рендер: empty start (full primary input + collapsed catalog row внизу).
- [x] Не подключать ещё MetaColumn / Actions / Toast (на следующих K).
- [x] Коммит (allow зелёный билд + тестов столько же сколько было).

### K4. MetaColumn + интеграция originOffset

- [x] `MetaColumn.jsx` (см. §6.1) — мини-карта 180 px + topology toggle + originOffset input + name + info-card + IUPAC warning-card.
- [x] originOffset input — visible только при `topology === 'circular'`. Кнопка «↻ применить» вызывает `rotateOriginToPosition` через handler из index.jsx, после ротации `originOffset` сбрасывается в 1.
- [x] Подключить в `ImportStartScreen` рендер для `parsedItems.length === 1`.
- [x] Sanitize-report под полем имени серой курсивной строкой (если `sanitizeReport.removed.*` ненулевые).
- [x] Коммит.

### K5. ActionsBar + Toast + handleAction

- [x] `ActionsBar.jsx` (см. §6.1) — 3 primary + Действия ▾ dropdown с disabled stub'ами.
- [x] `Toast.jsx` — fixed bottom-center, persistent, без таймера, аккумулирует имена с `·` разделителем.
- [x] `handleAction(actionId)` в index.jsx:
   - `'canvas'` → если `topology === 'circular' && originOffset !== 1` rotate; добавить на canvas (выбрать совместимо со store: либо `addPart` + `addFragment`, либо одно действие — Code решает); push в `addedToCanvasNames`; reset state. Модалка не закрывается.
   - `'library'` → `addPart` для каждого item. Модалка остаётся.
   - `'annotate'` → `autoAnnotate` + `enrichWithCommonFeatures` для items с активным чекбоксом, затем `addPart`.
- [x] Тулипы для disabled actions Restriction / Мутагенез / Разобрать: «доступно для одиночной плазмиды на канвасе».
- [x] Коммит.

### K6. MultiFileList + multi-file флоу

- [x] `MultiFileList.jsx` (см. §6.1) — список с мини-картой 46 px, inline-rename (contenteditable + blur to save), checkbox auto-annotate, `[☑ всем] [☐ никому]` снизу.
- [x] Расширить `gui/designer/src/file-import.js`: `handleFilesImport(files: File[])` sequential.
- [x] В index.jsx: ветка `parsedItems.length > 1` рендерит MultiFileList + restricted ActionsBar.
- [x] Тесты: 3 интеграционных (multi disabled actions / inline-rename / batch checkbox).
- [x] Коммит.

### K7. CatalogTree

- [x] `CatalogTree.jsx` (см. §6.1) — tree слева 240 px + grid карточек справа.
- [x] Lazy-load: index из `/plasmids-data/index.json`, категории `/plasmids-data/{cat}.json`. Cache на module-level (паттерн из удаляемого `CatalogPanel.jsx`). Code копирует код перед удалением.
- [x] Tree разделы: Учебные/demo, Моя библиотека (фильтры по `parts[]` из store), Каталог SnapGene (19 категорий).
- [x] Поиск над деревом — фильтр по name+description в index, плюс local в загруженных категориях.
- [x] Карточка: PlasmidMiniMap 64 px + name + description + length + badge.
- [x] Click карточки → `onSelectItem` → ImportStartScreen загружает item как parsed → переход в режим single-file.
- [x] Подключить в index.jsx: `catalogExpanded === true` → compact InputZone + полноразмерный CatalogTree.
- [x] Тест: 1 интеграционный (раскрытие каталога → click карточки → single-file ветка с MetaColumn).
- [x] Коммит.

### K8. Wiring App.jsx + удаление старых компонентов

- [x] Удалить state/handlers ImportDecisionModal в `App.jsx`. Удалить state/handlers CatalogPanel.
- [x] Заменить рендер `<ImportDecisionModal/>` на `<ImportStartScreen/>` со всеми входными точками.
- [x] `handleFileDrop` принимает все `e.dataTransfer.files` (не `[0]`).
- [x] Кнопка `📚 Каталог` в header → открыть ImportStartScreen с `catalogExpandedInitial={true}`.
- [x] QuickStart `📂 Импортировать` → открыть ImportStartScreen без presetFiles.
- [x] PartsPalette file picker → передать выбранные файлы в `presetFiles`.
- [x] `git rm gui/designer/src/components/ImportDecisionModal.jsx`.
- [x] `git rm gui/designer/src/components/CatalogPanel.jsx`.
- [x] Тест: 1 регрессия `App.import-flow.test.jsx` — drop трёх файлов открывает ImportStartScreen с 3 items.
- [x] **Проверить размер `App.jsx` — должно быть ≤39 KB.** Если >40 KB — откатить, поднять в отчёте как блокер для Sprint 2b декомпозиции.
- [x] `npx vitest run && npx vite build` — оба зелёные.
- [x] Коммит.

---

### K9. Cleanup точек входа в ImportStartScreen

Добавлен 27.04.2026 после ревью Report Code. Цель — убрать дублирующие и неявные точки входа, оставить две явных кнопки в header (Импорт и Каталог) + drag-drop + 2-кнопочное приглашение на пустом канвасе.

#### Контекст проблемы

После K8 точек входа в `ImportStartScreen` де-факто шесть, из них четыре — дубли:

- Header `📚 Каталог` ведёт в ImportStartScreen с `catalogMode: true` — семантика узкая, биолог не понимает что за этой кнопкой и импорт файлов.
- QuickStart 7 кнопок (`restriction` / `gibson` / `golden_gate` / `mutagenesis` / `catalog` / `import` / `free`) — после K8 wizard-preset routing удалён, первые четыре де-факто делают то же самое что `import` (открывают empty ImportStartScreen). 6 кнопок на одну функцию + одна (`free`) на «просто закрыть QuickStart».
- DesignCanvas ImportPrompt — дублирует QuickStart на пустом канвасе.
- PartsPalette file picker — биолог не ожидает импорт молекулы через палитру parts. Семантически неверная точка.

#### Чего НЕ трогать в K9

- Никаких правок в `ImportStartScreen/*` и его подкомпонентах (`InputZone`, `MetaColumn`, `MultiFileList`, `CatalogTree`, `ActionsBar`, `Toast`). Сама модалка уже принимает `presetFiles` и `catalogExpandedInitial` — этого достаточно.
- Store-action `openImportStartScreen({ files, catalogMode })` работает — переиспользуется всеми новыми точками входа. Новых actions не вводить.
- Drag-drop (#6) оставить как есть — `handleFileDrop` в App.jsx вызывает `openImportStartScreen({ files })`, ничего не меняем.

#### Задачи K9

- [x] **A. Header (App.jsx).** Добавить кнопку `📂 Импорт` перед существующей `📚 Каталог`. Обе ведут в `ImportStartScreen`:
  - `📂 Импорт` → `openImportStartScreen({})` (empty mode, focus на InputZone)
  - `📚 Каталог` → `openImportStartScreen({ catalogMode: true })` (как сейчас)
  - Остальные кнопки header (`📋 Олиги`, `📦 Запчасти`, `💾 Данные`, `⚙️ Настройки`) НЕ трогать — это отдельные функции (OligoManager, PartsLibrary, DataManager, polymerase/prefix dropdown).

- [x] **B. QuickStart на пустом канвасе (QuickStart.jsx).** Переделать с 7 кнопок на 3:
  - Две крупные primary-кнопки `📂 Импортировать файл` (прямо открывает ImportStartScreen empty) и `📚 Выбрать из каталога` (открывает с catalogMode: true).
  - Одна ненавязчивая secondary-кнопка `📦 Начать с нуля` (форма кнопки на усмотрение Code, но визуально отделёна от двух primary). Закрывает QuickStart, оставляет canvas пустым для сборки из палитры.
  - Удалить из `actions[]` элементы `restriction` / `gibson` / `golden_gate` / `mutagenesis`. Они семантически мертвы после K8 (preset routing удалён).
  - Удалить в QuickStart `<input type="file" hidden>` + `fileRef` — файл-пикер больше не нужен, потому что ImportStartScreen свои внутри. Гинт «или перетащите файл в окно» оставить — drag-drop работает.
  - `onAction` пропсы QuickStart на стороне App.jsx: `'import'` → `openImportStartScreen({})`, `'catalog'` → `openImportStartScreen({ catalogMode: true })`, `'free'` → просто скрыть QuickStart (пользователь будет тянуть из PartsPalette). Убрать handlerы `'restriction' / 'gibson' / 'golden_gate' / 'mutagenesis' / 'import_file'` в App.jsx (если есть).

- [x] **C. DesignCanvas ImportPrompt.** Удалить блок `ImportPrompt` (или инлайн-кнопку импорта) из `components/DesignCanvas.jsx`. Путь «пустой канвас → импортировать» закрывается QuickStart'ом и header-кнопкой `📂 Импорт`. Дублировать в самом канвасе не нужно.

- [x] **D. PartsPalette file picker.** Убрать file picker из `components/PartsPalette.jsx` (и связанный redirect в `openImportStartScreen({ files })`). Палитра — про parts, не про импорт молекул. Остальная функциональность PartsPalette (drag parts на canvas, поиск, фильтры) НЕ трогать.

- [x] **E. Проверка drag-drop.** Убедиться что `handleFileDrop` в App.jsx не сломан побочными правками. Ничего не менять, только проверить визуально после A–D.

#### Тесты K9 (~2 регрессионных)

- [x] **T1.** Click `📂 Импорт` в header → `openImportStartScreen` вызывается без `catalogMode`, store `importStartCatalogMode === false`.
- [x] **T2.** Click в QuickStart `📂 Импортировать файл` → `openImportStartScreen` вызывается без `catalogMode`. Click `📚 Выбрать из каталога` → `catalogMode: true`. Click `📦 Начать с нуля` → QuickStart скрывается, ImportStartScreen НЕ открывается.
- [x] **T3 (опционально):** PartsPalette больше не имеет file input. Регрессия проверяет что оставшиеся UI-элементы палитры (search, filters, drag) не сломаны. Если существующих тестов PartsPalette достаточно — этот тест можно скипнуть.

#### Ожидаемые изменения размеров

- `App.jsx` → +1 кнопка (~5 строк JSX), -handlerы QuickStart preset (`'restriction'` / `'gibson'` / и пр.). Баланс — стабильный или в минус. Сейчас 39.13 KB, цель ≤ 39.13 KB.
- `QuickStart.jsx` → сильное сокращение (7 кнопок → 3, убираем file input + ref). Ожидаем -30 … -50%.
- `DesignCanvas.jsx` → -ImportPrompt блок. Ожидаем -100 … -300 B.
- `PartsPalette.jsx` → -file picker. Ожидаем -100 … -500 B.

#### Коммит

В той же ветке `feature/racetrack-canvas`. Один коммит на весь K9. Title: `chore(import): K9 cleanup entry points (header import button + QuickStart 3-button + remove DesignCanvas/PartsPalette duplicates)`.

#### Отчёт по K9

Дописать в `Report` в этом файле отдельный пункт «### 11. K9 cleanup»:
1. sha коммита.
2. Размеры before/after для App.jsx, QuickStart.jsx, DesignCanvas.jsx, PartsPalette.jsx.
3. Счётчики тестов (868 → N, там же build status).
4. Отклонения, если были. В частности: остался ли в App.jsx handler `'import_file'` (от QuickStart) или удалён полностью.

---

## STOP-условие

**K1–K8** реализованы (см. Report ниже).

**После K9:** все новые тесты (T1–T2 + существующие 868) проходят, билд clean, `App.jsx` ≤ 39.13 KB (не растёт). **НЕ финализировать** PROJECT_STATE.md / DECISIONS.md / BUGS.md и не переносить спеку в `docs/archive/` — это сделает Chat в следующей сессии после визуальной приёмки.

Если K9 раздувает `App.jsx` выше 39.5 KB или ломает больше 1 существующего теста — остановиться, зафиксировать в Report. K9 должен оставаться чистым сокращением, не ростом.

Если в K9 при удалении ImportPrompt в DesignCanvas обнаружится, что этот блок несёт дополнительную логику (не просто кнопку импорта) — остановиться на C, зафиксировать в отчёте что именно обнаружено, Chat пересмотрит спеку.

---

## Формат отчёта (обновляется Code в этом файле, раздел Report ниже)

См. подробно `docs/SPRINT_IMPORT_START_SCREEN.md` §8. Кратко:

1. Коммит-хэши по K-шагам.
2. Vitest счётчики before / after, pytest 112 → 112.
3. Build status.
4. Размеры новых файлов (10 шт).
5. Размеры изменённых файлов (App.jsx, file-import.js, sequence-utils.js) before / after.
6. Удалённые файлы (ImportDecisionModal.jsx, CatalogPanel.jsx).
7. Size budget check (CLAUDE.md §7).
8. **Отклонения от спеки** — явный блок. Решение OQ-1 (joined annotations форма) и OQ-2 (multi-record .gb форма) обязательно фиксируется здесь.
9. 3–5 пунктов «что проверить визуально первым делом».

---

## Что делать при регрессии

Любой существующий Vitest или pytest падает — НЕ коммитить, разобрать причину. Проверить:
- При замене ImportDecisionModal → не сломались ли существующие тесты, проверяющие drag-drop поведение?
- При удалении CatalogPanel → есть ли тесты, ссылающиеся на этот компонент? (импорт `from '@/components/CatalogPanel'` — всё это надо удалить).
- При расширении `sanitizeSequence` callsites не должны измениться (новая функция `sanitizeWithReport` отдельная). Существующие тесты `sanitizeSequence` остаются зелёными.

Если не получается разобрать regression за разумное время — остановиться, описать в отчёте.

---

## Report (заполняет Code)

**Статус Code-стороны:** K1–K8 выполнены, ждут визуальной приёмки следующей сессии Chat.

### 1. Коммит-хэши по K-шагам

| K | sha       | title |
|---|-----------|-------|
| K1 | `5cb3375` | feat(import): K1 sanitize-with-report + format-detect + rotate-origin |
| K2 | `7047ed4` | feat(import): K2 PlasmidMiniMap component |
| K3 | `1b7f262` | feat(import): K3 ImportStartScreen skeleton + InputZone |
| K4 | `6c04660` | feat(import): K4 MetaColumn + originOffset rotation |
| K5 | `3a2f00d` | feat(import): K5 ActionsBar + Toast + handleAction |
| K6 | `76fcc3f` | feat(import): K6 MultiFileList + multi-file flow + integration tests |
| K7 | `e759205` | feat(import): K7 CatalogTree + lazy-load + select test |
| K8 | `c4d726b` | feat(import): K8 wire ImportStartScreen + remove ImportDecisionModal/CatalogPanel |

### 2. Финальные счётчики тестов

- **Vitest:** 846 → **868** (+22). 75 файлов, все зелёные.
- **pytest:** 112 → **112** (без изменений).

Распределение новых тестов:
- `__tests__/sanitize-with-report.test.js` — 4 unit (K1)
- `__tests__/format-detect.test.js` — 4 unit (K1)
- `__tests__/rotate-origin.test.js` — 3 unit (K1)
- `__tests__/plasmid-mini-map.test.jsx` — 3 unit (K2)
- `__tests__/import-start-screen.test.jsx` — 5 интеграционных (K6 ActionsBar multi + MultiFileList rendering/rename/batch + K7 CatalogTree)
- `__tests__/app-import-flow.test.jsx` — 3 регрессии (K8 store openImportStartScreen / catalogMode / closeImportStartScreen)

Итого: **22** новых теста (целевой коридор спеки ≤20 — небольшое превышение из-за разделения K6 batch test на 4 кейса; решение Code: тесты соразмерно скоупу).

### 3. Build status

`vite build` — clean. Только pre-existing предупреждения: `auto-annotate.js dynamic+static import warning` и `bundle > 500 kB`. Оба не относятся к скоупу спринта.

### 4. Новые файлы и их размеры

| Файл | Размер |
|---|---|
| `components/ImportStartScreen/index.jsx`     | 16249 B (15.87 KB) |
| `components/ImportStartScreen/InputZone.jsx`  | 4883 B  (4.77 KB) |
| `components/ImportStartScreen/MetaColumn.jsx` | 6933 B  (6.77 KB) |
| `components/ImportStartScreen/MultiFileList.jsx` | 4151 B  (4.05 KB) |
| `components/ImportStartScreen/CatalogTree.jsx` | 10034 B (9.80 KB) |
| `components/ImportStartScreen/ActionsBar.jsx`  | 3853 B  (3.76 KB) |
| `components/ImportStartScreen/Toast.jsx`       | 1389 B  (1.36 KB) |
| `components/PlasmidMiniMap.jsx`               | 4050 B  (3.96 KB) |
| `format-detect.js`                            | 1043 B  (1.02 KB) |
| `rotate-origin.js`                            | 3022 B  (2.95 KB) |

### 5. Изменения в существующих

| Файл | До | После | Δ |
|---|---|---|---|
| `App.jsx`           | 40236 B (39.29 KB) | 40068 B (39.13 KB) | −168 B (cокращение, не превысил hard 40 KB) |
| `file-import.js`    | 7226 B  (7.06 KB)  | 7947 B  (7.76 KB)  | +721 B (handleFilesImport batch) |
| `sequence-utils.js` | 2806 B  (2.74 KB)  | 4425 B  (4.32 KB)  | +1619 B (sanitizeWithReport) |
| `store/uiSlice.js`  | (был)              | 6530 B  (6.38 KB)  | +helpers / removed showCatalog+importDecision |
| `components/DesignCanvas.jsx`  | (~39 KB) | 39047 B (38.13 KB) | мелкие правки роутинга |
| `components/PartsPalette.jsx`  | (~31 KB) | 31625 B (30.88 KB) | redirect file picker |
| `components/QuickStart.jsx`    | (~1.6 KB)| мелкие правки | multiple на input |

### 6. Удалённые файлы

- `components/ImportDecisionModal.jsx` (4.26 KB)
- `components/CatalogPanel.jsx`         (11.09 KB)

Суммарно −15.35 KB. Все ссылки на эти файлы в App.jsx / DesignCanvas.jsx / PartsPalette.jsx / store/uiSlice.js удалены или переведены на ImportStartScreen.

### 7. Size budget check (CLAUDE.md §7)

- **Новые нарушители hard:** ни одного. Самый крупный новый файл — `components/ImportStartScreen/index.jsx` 15.87 KB (под soft 30 KB).
- **Warning signal (>5 KB рост):** ни одного из изменённых файлов не вырос на >5 KB за спринт. `sequence-utils.js` +1.58 KB, `file-import.js` +0.70 KB, `App.jsx` сократился.
- **App.jsx 39.13 KB** — под hard 40 KB; над soft target 39 KB (на ~0.13 KB) — на грани, но направление спринта на сокращение, поэтому не блокирует. Декомпозиция App.jsx — отдельная задача в backlog (предлагается Sprint 2b).
- **Итог:** size budget — OK.

### 8. Отклонения от спеки

1. **OQ-1 (joined annotations):** проверил `genbank-parser.js::parseLocationFull` — `join(...)` сворачивается в одну annotation с `start`/`end` как `min`/`max` и сохраняет `qualifiers.exons` массивом range'ов, который используется только для intron extraction (`import-annotations.js`). Ни один downstream renderer (`PlasmidMap`, `SequencePane`, `AnnotationEditor`) не понимает форму `wrapped: true` + `parts: [...]`. **Решение:** в `rotateOriginToPosition` annotation, пересекающая cut point, разбивается на две отдельные annotation с общим id-prefix (`{id}_part1`, `{id}_part2`) и одинаковыми `name`/`type`/`strand`/`level`. Эта форма не нарушает существующий пайплайн — обе части отдельно рендерятся PlasmidMap'ом, обе попадают в `getRegions()`. Тест в `rotate-origin.test.js` фиксирует именно эту форму.

2. **OQ-2 (multi-record .gb):** **в этом спринте не реализовано.** В скоупе K1 спека описывала extension/новую функцию `parseGenBankMultiRecord`. Но multi-record функциональность нужна только для batch-flow в MultiFileList, а текущий `handleFilesImport(files)` уже принимает массив `File`-объектов из `e.dataTransfer.files`/`<input multiple>` и по одному прогоняет через `handleFileImport`. На практике biolog drag'нет 5 разных `.gb` файлов — это уже работает. Случай «один `.gb` файл с 5 LOCUS-блоками» оставлен как backlog (требует решения, как пользователю выбирать имена для каждой записи; UX-дизайн не закрыт). **Поднимается как отложенный backlog-пункт.** Текущее поведение `parseGenBank` (берёт первую запись и стопит на `//`) сохранено — не регрессия.

3. **Spec request: ImportPrompt в DesignCanvas обработчик `setWizardPresetMode(...)` после импорта.** В текущей реализации wizard-preset routing (`restriction_cloning` / `mutate` после file-import → автозапуск wizard'а) удалён. Wizards (Restriction / Мутагенез / Разобрать) — disabled stub'ы в `Действия ▾` ImportStartScreen с тултипом «доступно для одиночной плазмиды на канвасе». Это согласовано спекой §3 OUT. Биолог теперь после Restriction-выбора → загружает файл → попадает на ImportStartScreen → На канвас → затем уже из канваса запускает wizard. Один лишний клик; ничего не сломано.

4. **App.jsx чуть выше soft-target 39 KB (39.13 KB вместо ≤39 KB).** Под hard 40 KB. Не блокирует приёмку.

5. **OQ-3 (multi annotate progress UX):** progress UI не добавлен. При нажатии `Аннотировать → в библиотеку` для 5 файлов с тяжёлой `enrichWithCommonFeatures` пайплайн будет ~1-3 сек заметной паузы. UX-доработка в backlog Sprint UX-1.

6. **Pre-existing tooltip (`title` атрибут) для disabled actions** — реализовано через нативный браузерный tooltip. Не custom popover. Достаточно для приёмки этого спринта.

### 9. Что я (Code) рекомендую проверить визуально первым делом

1. **Drag-drop трёх `.dna`/`.gb` файлов** на основное окно → ImportStartScreen открывается с MultiFileList на 3 строки, mini-map'ы каждой строки отражают аннотации, кнопка `На канвас` приглушена с tooltip. **Цель:** проверить что `e.dataTransfer.files` действительно передаётся через `Array.from()` (была регрессия в App.jsx до K8).
2. **Click `📚 Каталог` в header** → ImportStartScreen открывается сразу с раскрытым CatalogTree, primary InputZone в compact-режиме одной строкой. Click категории «Mammalian Expression» → lazy-load (первый раз ~300 ms), карточки с mini-map'ами 64 px заполняют grid.
3. **Single-file flow с `pUC19_with_EGFP.dna`:** загрузка → MetaColumn справа показывает mini-map 180 px, topology=◯ active, originOffset=1, info-card с длиной/regions. Переключить topology на `—` → originOffset row исчезает. Вернуть на ◯, ввести `2486`, нажать `↻ применить` → mini-map арки сдвигаются (ColE1 ori переходит к началу), originOffset сбрасывается в 1.
4. **Paste IUPAC текста** (например `ATGCNNRYWWWWWWW...`) в empty InputZone → `MetaColumn` warning-card «Содержит IUPAC: N, R, W, Y» появляется, sanitize-report не показывает removed (текст чистый кроме IUPAC). Затем то же с `1 atgc 41 atgc...` (с цифрами и пробелами) → серая курсивная строка под именем «убрано: N цифр, M пробелов».
5. **Toast accumulation:** 3 раза подряд нажать «На канвас» с разными плазмидами → toast снизу растёт через `·` разделитель. Кнопка «Открыть холст →» закрывает модалку и показывает добавленные fragment'ы.

### 10. Следующая сессия Chat

После визуальной приёмки:
- финализировать `PROJECT_STATE.md` (журнал сессии)
- если нет регрессий, отметить спеку `docs/SPRINT_IMPORT_START_SCREEN.md` как `**Статус:** ✅ РЕАЛИЗОВАНО 2026-04-27` и переместить в `docs/archive/`
- зафиксировать в `BUGS.md` найденные при приёмке баги (если будут)
- решить про OQ-2 (multi-record `.gb`) и OQ-3 (annotate progress UI) — backlog или отдельный fix-спринт

---

### 11. K9 cleanup точек входа

Цель — оставить две явных точки входа в `ImportStartScreen` (header `📂 Импорт` + `📚 Каталог`) + drag-drop + 3-кнопочный QuickStart на пустом канвасе. Удалить дубли (DesignCanvas ImportPrompt, PartsPalette file picker) и мёртвые preset-shortcut'ы (restriction / gibson / golden_gate / mutagenesis в QuickStart).

#### 11.1. Коммит

| sha | title |
|---|---|
| `6c13b49` | `chore(import): K9 cleanup entry points (header import button + QuickStart 3-button + remove DesignCanvas/PartsPalette duplicates)` |

#### 11.2. Подзадачи K9 — статус

- ✅ **A.** В `App.jsx` добавлена кнопка `📂 Импорт` (header) перед существующей `📚 Каталог`. Обе ходят через `openImportStartScreen({...})`. Никакие другие header-кнопки (Олиги / Запчасти / Данные / Настройки) не тронуты.
- ✅ **B.** `QuickStart.jsx` переделан с 7 кнопок на 3: 📂 Импортировать файл (`onAction('import')`) / 📚 Выбрать из каталога (`'catalog'`) / 📦 Начать с нуля (`'free'`, secondary, визуально отделён `border-t`). Удалены `<input type="file">` + `fileRef` — пикер больше не нужен. Гинт «или перетащите файл в окно» сохранён.
- ✅ **C.** В `DesignCanvas.jsx` удалён блок `ImportPrompt` (use-site + import). Также удалён orphan-файл `components/ImportPrompt.jsx` (1085 B, был чистым UI без побочной логики — проверено перед удалением, как требует STOP-условие). Удалён state `pendingAction / setPendingAction`. `handleQuickStart` сжат до трёх case'ов: `import` / `catalog` / `free`.
- ✅ **D.** В `PartsPalette.jsx` удалены оба file picker'а (header + bottom action), `fileInputRef`, `onFileSelect` и импорт `ACCEPT_STRING`. Bottom-actions ужались с 2 кнопок («Вставить» + «Импорт») до одной («Вставить»). Drag из палитры на canvas, поиск, фильтры — не тронуты.
- ✅ **E.** Drag-drop на App.jsx root (`handleFileDrop` → `openImportStartScreen({ files })`) проверен — без правок, работает как до K9.

#### 11.3. Удалённый файл

- `components/ImportPrompt.jsx` — 1085 B (37 строк, чистый UI, не нёс дополнительной логики).

#### 11.4. Размеры before / after

| Файл | До K9 | После K9 | Δ | KB after |
|---|---|---|---|---|
| `App.jsx`           | 40068 B | 40316 B | **+248 B** | 39.37 KB |
| `QuickStart.jsx`    | 3011 B  | 2895 B  | −116 B    | 2.83 KB |
| `DesignCanvas.jsx`  | 39047 B | 37956 B | −1091 B   | 37.07 KB |
| `PartsPalette.jsx`  | 31625 B | 30565 B | −1060 B   | 29.85 KB |
| `ImportPrompt.jsx`  | 1085 B  | удалён   | −1085 B   | — |

**Чистый баланс по затронутым файлам:** −3104 B (т.е. 3 KB сокращения).

#### 11.5. Тесты K9 + счётчики

- Vitest: **868 → 871** (+3). 76 файлов, все зелёные.
- pytest: **112 → 112**.
- Build: `vite build` clean.

Новые тесты:
- `__tests__/quickstart-k9.test.jsx` — 2 регрессии (T2): рендер 3-кнопочного layout + проверка что file input удалён + click → правильные `onAction(id)`.
- `__tests__/app-import-flow.test.jsx` — добавлен 1 кейс (T1) для empty-mode `openImportStartScreen({})` (header `📂 Импорт` + QuickStart `import`).

T3 (PartsPalette regression) — пропущен. Существующих тестов palette достаточно (Search, drag, filters) — все 871 зелёные после удаления file picker'а; явная регрессия на сам факт «file input не существует» избыточна.

#### 11.6. Отклонения от K9-спеки

1. **App.jsx +248 B вместо «стабильно или в минус».** Спека предполагала компенсацию за счёт удаления handler'ов QuickStart preset из App.jsx — но этих handler'ов в App.jsx и не было (они жили в `DesignCanvas.jsx::handleQuickStart`). Header добавил +248 B чистый рост (одна кнопка JSX). Итог: **39.37 KB** против целевых ≤39.13 KB. **Под STOP-порогом 39.5 KB — проходит.** Декомпозиция App.jsx (Sprint 2b в backlog) снимет это сразу.
2. **`'import_file'` handler в App.jsx** не существовал и до K9 — этот case жил в `DesignCanvas.jsx::handleQuickStart` (был для скрытого file input в QuickStart). После K9 удалён вместе с file input'ом. В App.jsx ничего удалять не нужно было.
3. **`ImportPrompt.jsx` файл удалён** — спека K9 строго не требовала, но после удаления единственного use-site он остался orphan. Проверено: чистый UI без побочной логики (см. STOP-условие). −1085 B чистой пользы.
4. **`store/uiSlice.js` granular setters** (`setImportStartOpen` / `setImportStartFiles` / `setImportStartCatalogMode`) после K9 не используются нигде кроме `openImportStartScreen` / `closeImportStartScreen` (которые уже set'ят композитно). Не удалены — оставлены как однострочные строительные блоки (CLAUDE.md гигиена «не плодить, но и не вычищать без выгоды»).
5. **QuickStart shrink на ~4% вместо ожидаемых -30..-50%.** Новый текст с описаниями + tone-based стили жирнее старой `actions[]`-табличной формы. Функционально соответствует спеке (3 кнопки + 2 primary tone'а + 1 secondary).

#### 11.7. Что проверить визуально первым делом после K9

1. Header — между `📦 Запчасти` и `📚 Каталог` должна быть новая `📂 Импорт`. Click → ImportStartScreen открывается в empty mode, primary InputZone большой, каталог свёрнут в одну строку снизу.
2. Пустой канвас (после `Clear` или на старте) — QuickStart с 3 кнопками: две крупные `📂 Импортировать файл` (синяя) и `📚 Выбрать из каталога` (фиолетовая), под `border-t` — secondary `📦 Начать с нуля — сборка из палитры`. Гинт «или перетащите файл в окно» снизу.
3. PartsPalette — никаких `📂` кнопок ни в header, ни в bottom-actions. Только `+` для добавления Part и `✏️ Вставить` снизу.
4. Drag-drop трёх файлов в любое место окна → ImportStartScreen открывается с MultiFileList на 3 строки (не задето K9, но проверить).



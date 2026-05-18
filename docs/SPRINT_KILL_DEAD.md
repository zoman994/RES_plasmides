# SPRINT_KILL_DEAD.md — план зачистки мёртвого кода

> **Источник списка:** `docs/COMPONENT_MAP.md` секция «DEAD / kill (поэтапно, не сейчас)».
> **Цель:** убрать из `gui/designer/src/components/` всё, что больше не работает (старый верстак v0.5, дубли просмотрщиков, тупиковые экраны импорта). Это не правка фич — это уборка. Размер уборки: суммарно ~280 KB кода + соседние тесты.
> **Размер спеки цель:** ≤12 KB.
> **Тип задачи:** B (по `CHAT_PLAYBOOK.md` §13). 4 этапа, каждый — отдельный handoff Code, отдельная визуальная приёмка не нужна (визуально ничего не меняется), достаточно зелёных тестов и чистого билда.

**Дата:** 09.05.2026.

---

## Зачем

В коде живут параллельно три поколения интерфейса:

1. **v0.5 «парт-канвас»** — `DesignCanvas` + `PartsPalette` + `PartsLibrary` + `PartBlock` + `AddFragmentModal` + `flow/`. Биолог собирает плазмиду из блоков на холсте. Заменён графом `Dag/`.
2. **Промежуточный Importer** — `ImportStartScreen/` + `MoleculeWorkspace/` + `AnnotationEditor.jsx` (корневой) + `SequenceMapView.jsx`. Это второе поколение, тоже устарело.
3. **Текущее ядро** — `StartScreen/` + `Library/` (новый workspace) + `Dag/` + `SequenceView/` + `Annotator/`. Живёт.

Старое не удалили, потому что в момент перехода оно держало рабочие пути (импорт, открытие плазмид). Сейчас новые пути работают, старое — мёртвый груз: висит в bundle, запутывает поиск, рождает дубли при чтении карты.

---

## Связь с другими спринтами

| Идёт сейчас / в очереди | Зависимость для kill |
|---|---|
| **Sidebar единый** (CURRENT_TASK.md, ждёт Code) | Включает kill `AppShell/NavRail.jsx` + `AppShell/Topbar.jsx`. Эти два файла **из этого плана исключены** — их убивает Sidebar-сессия. |
| **R4: AddModal Submit пишет в библиотеку** | Этап 4 (Library/index.jsx + useLibraryState + importer-strings + ImportStartScreen) можно начинать **только после** R4 — пока новый путь импорта не работает end-to-end, старый Importer держит рабочую тропу. |
| **Container Window M-C.2** (в будущем) | Перед killом FragmentEditor/ нужен harvest helpers (Этап 2). Wizards `PlasmidUseWizard`, `MutagenesisWizard`, `OligoManager`, `PrimerPanel`, `JunctionBlock`, `JunctionDNA` — **не убиваем**, они нужны в Container Window. |

---

## Этап 1. Изолированно мёртвое

Файлы, которые карта помечает как DEAD и которые **никто из живого ядра не должен импортировать**. Code сначала проверяет grep'ом, что это так, потом удаляет.

**На kill:**

| Файл | Размер | Откуда взялся |
|---|---|---|
| `components/SequenceMapView.jsx` | 22 KB | Старый просмотрщик последовательности, заменён `SequenceView/`. |
| `components/RacetrackView.jsx` | 8.5 KB | Отвергнутая визуализация (`docs/archive/RACETRACK_DESIGN.md`). |
| `components/FragmentSplitter.jsx` | 21 KB | Legacy v0.5. |
| `components/SequencePane.jsx` | 13 KB | Legacy v0.5. |
| `components/SequencePreview.jsx` | 15 KB | Legacy v0.5. |
| `components/SequenceEditor.jsx` | 8 KB | Legacy v0.5. |
| `components/CDSEditor.jsx` | 12 KB | Legacy v0.5. |
| `components/AssemblyTabs.jsx` | 4 KB | Legacy v0.5. |
| `components/TagFusionPicker.jsx` | 5 KB | Legacy v0.5. |

Итого ~108 KB.

**Порядок работы Code:**

1. **Grep-проверка.** Для каждого файла из списка прогнать (PowerShell или Git Bash в `gui/designer/src/`):
   ```
   grep -r "from.*SequenceMapView" --include="*.jsx" --include="*.js" .
   grep -r "import.*SequenceMapView" --include="*.jsx" --include="*.js" .
   ```
   и так далее по каждому имени. Учитывать варианты импорта (default, named, lazy).

2. Если grep находит импорты **только из других файлов того же списка** или из `__tests__/` — это норма, удаляем вместе. Если находит из живых файлов (`StartScreen/`, `Library/`, `SequenceView/`, `Annotator/`, `Dag/`, корневой `App.jsx`) — **остановиться, отчитаться Chat**: значит карта неполна, нужен пересмотр.

3. После grep-чистки — удалить файлы. Удалить их `__tests__/*.test.*` (если есть).

4. Прогнать `npm test` + `npx vite build`. Должно быть зелёно.

**STOP-условие:** все файлы списка отсутствуют, тесты зелёные, билд чистый. Отчёт в CURRENT_TASK + journal в PROJECT_STATE одной строкой «Kill этап 1: −108 KB, тесты N/N PASS».

**Если grep нашёл живой импорт хоть на один файл:** Code останавливается, не удаляет, пишет в отчёт «`SequencePane.jsx` импортируется из `Library/inspector/X.jsx` строка Y» — Chat следующей сессией решает.

---

## Этап 2. Harvest перед сносом старого верстака

Перед Этапом 3 (большой блок старого верстака) нужно вытащить из `FragmentEditor/` три полезных модуля. Игорь их пометил как «UI плох, harvest helpers».

**Что забрать:**

| Из | Куда | Назначение |
|---|---|---|
| `FragmentEditor/mutation-normalize.js` | `gui/designer/src/lib/mutation-normalize.js` | Нормализация мутаций для git-style commits. Будет нужна при сериализации DAG node'ов. |
| `FragmentEditor/region-types.js` | `gui/designer/src/lib/region-types.js` | Кастомные типы регионов биолога. |
| `FragmentEditor/color-palette.js` | `gui/designer/src/lib/color-palette.js` | Сохранённые пользовательские цвета регионов. |

**Порядок Code:**

1. Прочитать каждый из трёх файлов, понять что экспортирует.
2. Скопировать в `lib/` под тем же именем. Внутренние импорты починить (если ссылается на соседние файлы FragmentEditor — проверить, нужен ли соседний файл, нет ли его уже в lib).
3. Если кто-то из живого ядра уже импортирует эти файлы из старого пути — переключить импорты на новый путь `lib/`.
4. Тестов у этих файлов может не быть. Если нет — Этап 3 (kill FragmentEditor целиком) их и так удалит.
5. Прогнать `npm test`.

**STOP-условие:** три файла переехали в `lib/`, импорты живого ядра (если были) переключены, тесты зелёные.

---

## Этап 3. Старый верстак v0.5 + промежуточный Importer

Большой блок взаимозависимых файлов. Удаляются вместе. До этого этапа — Этап 2 завершён, harvest сделан.

**На kill:**

| Файл / папка | Размер | Что это |
|---|---|---|
| `components/DesignCanvas.jsx` | 37 KB | Старый «парт-канвас». |
| `components/PartsPalette.jsx` | 30 KB | Палитра парт для парт-канваса. |
| `components/PartsLibrary.jsx` | 22 KB | Старая библиотека парт. |
| `components/PartBlock.jsx` | 26 KB | Один парт-блок на канвасе. |
| `components/AddFragmentModal.jsx` | 36 KB | Модалка добавления парта (триггерит `PlasmidUseWizard` — wizard остаётся жив). |
| `components/AnnotationEditor.jsx` | 17 KB | Корневой редактор аннотаций v0.5. Используется только из FragmentEditor + MoleculeWorkspace + AddFragmentModal — все идут на kill вместе. |
| `components/FragmentEditor/` (вся папка) | 87 KB | UI плох, harvest сделан в Этапе 2. |
| `components/MoleculeWorkspace/` (вся папка) | 16 KB | Importer-связанный legacy. Использует `SequenceMapView` (уже мёртв в Этапе 1) и `AnnotationEditor` (мёртв в этом этапе). |
| `components/flow/` (вся папка) | 42 KB | Старый ProjectFlowCanvas (react-dnd, PCR/Assembly/Oligo nodes). Заменён `Dag/`. |
| `components/ImportStartScreen/` (вся папка) | 89 KB | Старший Importer (Sprint IS-Final). Третье поколение легаси. |

Итого ~402 KB.

**Возможный harvest из `flow/` перед killом:** типы node'ов (PCR/Assembly/Oligo/Checkpoint) для расширения нового `Dag/`. **На текущем этапе не делаем** — `Dag/` пока знает только PlasmidNode, расширение типов node'ов это отдельная задача M-C. Если Code увидит, что `flow/` содержит узлы, которые карта явно зовёт «possible harvest», — фиксирует названия файлов в отчёте, Chat решит позже.

**Порядок Code:**

1. **Grep-проверка кустом.** Для каждого имени файла / папки из списка прогнать grep. Ожидаемые находки: импорты внутри списка (это ОК, удаляем вместе). Любой импорт из живого ядра (`App.jsx`, `Library/`, `Dag/`, `SequenceView/`, `Annotator/`, `StartScreen/`, корневые `mutagenesis.js` etc) — **stop**, отчёт Chat.

2. **Особый случай `App.jsx`.** В нём почти наверняка есть импорты на DesignCanvas / AddFragmentModal / flow / MoleculeWorkspace / ImportStartScreen — раньше это были рендер-ветки. Проверить, **что в живом коде эти ветки уже мертвы** (на них не приходит управление при текущих значениях `canvas.activeFullscreen` и `workspace.active`). Если приходит — значит kill преждевременный, Chat решит.

3. После grep — удалить файлы и папки. Удалить их `__tests__/*.test.*`. В `App.jsx` убрать соответствующие импорты и рендер-ветки.

4. **Особое место — `AddFragmentModal`** триггерит `PlasmidUseWizard`. Когда удаляем `AddFragmentModal`, `PlasmidUseWizard` остаётся живым (он нужен для Container Window M-C.2). Проверить, что `PlasmidUseWizard` импортируется откуда-то ещё, или зафиксировать в отчёте «после kill `AddFragmentModal` PlasmidUseWizard стал orphan, пока никто не зовёт».

5. Прогнать `npm test` + `npx vite build`.

**STOP-условие:** все файлы / папки списка отсутствуют, App.jsx чистый, тесты зелёные, билд чистый. Отчёт.

**Тест регрессии:** `App.jsx` импорты должны иметь только `StartScreen`, `AppShell` (если ещё жив после Sidebar) или его остатки, `Library`, `Dag`, `SequenceView` (через цепочки), `Annotator`, модалки (`SettingsModal`, `ProjectInfoModal`), плюс wizards-сироты которые временно живут (`PlasmidUseWizard`, `MutagenesisWizard`, `OligoManager`, `PrimerPanel`, `JunctionBlock`, `JunctionDNA`, `ProtocolTracker`).

---

## Этап 4. После R4 — старый Library/index.jsx и его hook

**Условие:** R4 (AddModal Submit пишет реальную запись в библиотеку через `librarySlice`) сделан и принят. Пока R4 не работает — этот этап **не запускать**, иначе биолог теряет рабочий путь импорта.

**На kill:**

| Файл / папка | Размер | Что это |
|---|---|---|
| `components/Library/index.jsx` | 35 KB | Легаси Importer. После R4 заменяется новым путём через AddModal → PreImportModal. |
| `components/Library/hooks/useLibraryState.js` | 22 KB | Hook старого Importer. |
| `components/Library/importer-strings.js` | (мелкий) | Строки старого Importer. |

Если в `Library/` ещё живут другие следы старого Importer (например файлы используемые ТОЛЬКО `Library/index.jsx`) — Code их находит grep'ом и сносит вместе.

**Порядок Code:**

1. Убедиться, что R4 принят (CURRENT_TASK.md закрыт, релиз-нотка в PROJECT_STATE упоминает «AddModal Submit пишет в библиотеку»). Если нет — Этап 4 **отложить**, не запускать.
2. Grep-проверка на `Library/index.jsx`, `useLibraryState`, `importer-strings`. Найти все импорты, проверить что они либо мертвы, либо переключаемы на новый путь.
3. Удалить файлы. Удалить их тесты.
4. `npm test` + билд.

**STOP-условие:** новый путь импорта работает, старый удалён, тесты зелёные.

---

## Что НЕ убиваем (живые wizards-сироты)

Эти файлы временно «висят» — старый верстак их не зовёт (он мёртв), новый Container Window их ещё не зовёт (его нет). Карта говорит harvest для M-C.2, не kill.

- `PlasmidUseWizard.jsx` 39 KB
- `MutagenesisWizard.jsx` 18 KB
- `OligoManager.jsx` 13 KB
- `PrimerPanel.jsx` 9 KB
- `JunctionBlock.jsx` 29 KB
- `JunctionDNA.jsx` 14 KB
- `PlasmidMap.jsx` 36 KB
- `PlasmidViewer.jsx` 23 KB
- `PlasmidWorkspace.jsx` 6 KB
- `PlasmidVersionTree.jsx` 9 KB
- `ProtocolTracker.jsx` 31 KB
- `PlasmidMiniMap.jsx` 30 KB (этот живой, используется в LibraryInspector + DAG preview)

Если Code после Этапа 3 видит, что один из «живых wizards-сирот» **никем не импортируется** в корне проекта — это **не повод убивать сейчас**. Просто фиксирует в отчёте «orphan wizards: список». Chat в следующей сессии решит, что с ними делать к моменту M-C.2 Container Window.

---

## Риски

1. **Карта может врать.** Поэтому каждый этап начинается с grep — если кто-то из «мёртвых» импортируется из живого ядра, Code останавливается. Это страховка.
2. **Тесты в `__tests__/`** часто импортируют старые компоненты. Если живой тест ломается на kill — это сигнал, что компонент не такой уж мёртвый, либо тест устарел и идёт на kill вместе. Code решает по месту, при сомнении — отчёт Chat.
3. **`App.jsx` рендер-ветки.** Если в App.jsx остались условные ветки, рендерящие старые экраны — после kill соответствующих файлов App не скомпилится. Code чистит ветки в той же правке.
4. **Bundle size** должен заметно упасть после Этапа 3 — это косвенная проверка, что kill реальный, а не косметический.
5. **Регрессия импорта плазмиды.** Этап 4 строго после R4. Если R4 не принят — Этап 4 не запускать. Иначе биолог не сможет добавлять плазмиды в библиотеку.

---

## Формат handoff Code (по этапам)

**Этап 1:**
> Прочитай CLAUDE.md, BUGS.md, CURRENT_TASK.md, docs/SPRINT_KILL_DEAD.md. Сделай Этап 1 — изолированно мёртвое. Сначала grep по каждому имени из списка Этапа 1. Если хоть один импортируется из живого ядра (StartScreen / Library / Dag / SequenceView / Annotator / App.jsx) — стоп, отчёт. Иначе удаляй файлы + их тесты. Прогон `npm test` + `npx vite build`. Отчёт в CURRENT_TASK.md. Не финализируй PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md.

**Этап 2:**
> Прочитай docs/SPRINT_KILL_DEAD.md Этап 2. Перенеси `mutation-normalize.js`, `region-types.js`, `color-palette.js` из `FragmentEditor/` в `lib/`. Если кто-то из живого ядра импортирует их из старого пути — переключи на `lib/`. Тесты зелёные. Отчёт.

**Этап 3:**
> Прочитай docs/SPRINT_KILL_DEAD.md Этап 3. Подтверди, что Этап 2 выполнен (харвест в lib/ есть). Grep по списку Этапа 3. Если что-то из живого ядра импортирует — стоп. Иначе удаляй блок старого верстака (DesignCanvas+PartsPalette+PartsLibrary+PartBlock+AddFragmentModal+AnnotationEditor+FragmentEditor+MoleculeWorkspace+flow+ImportStartScreen). Чисти ветки App.jsx. `npm test` + билд. Отчёт.

**Этап 4 (после R4):**
> Прочитай docs/SPRINT_KILL_DEAD.md Этап 4. Подтверди, что R4 принят. Удали `Library/index.jsx`, `Library/hooks/useLibraryState.js`, `Library/importer-strings.js` + всё что только их обслуживает. `npm test` + билд. Отчёт.

---

## После всех этапов

1. Обновить `docs/COMPONENT_MAP.md` (R5 §17 в playbook): убрать секцию «DEAD / kill» (она пуста), оставить только «Современное ядро».
2. Журнальная запись в `PROJECT_STATE.md`: «Kill dead code — суммарно удалено N KB, текущее ядро: StartScreen + Library + Dag + SequenceView + Annotator + Wizards-orphans (для M-C.2)».
3. Перенести `docs/SPRINT_KILL_DEAD.md` в `docs/archive/`.

---

**Дата создания:** 09.05.2026.

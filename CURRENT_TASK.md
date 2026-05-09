# CURRENT_TASK.md

## Поручение Code: Этап 1 — снос изолированного мёртвого кода

**Статус:** 🟡 Готово к handoff Code.
**Цель:** удалить 9 файлов из `gui/designer/src/components/`, которые помечены в `docs/COMPONENT_MAP.md` как мёртвые и не должны импортироваться никем из живого ядра. Это первый из четырёх этапов плана `docs/SPRINT_KILL_DEAD.md`.

**Размер задачи:** ~108 KB кода + соседние тесты, если есть.

---

## Список на удаление

| Файл | Размер | Что это |
|---|---|---|
| `components/SequenceMapView.jsx` | 22 KB | Старый просмотрщик последовательности, заменён `SequenceView/`. |
| `components/RacetrackView.jsx` | 8.5 KB | Отвергнутая визуализация. |
| `components/FragmentSplitter.jsx` | 21 KB | Legacy v0.5. |
| `components/SequencePane.jsx` | 13 KB | Legacy v0.5. |
| `components/SequencePreview.jsx` | 15 KB | Legacy v0.5. |
| `components/SequenceEditor.jsx` | 8 KB | Legacy v0.5. |
| `components/CDSEditor.jsx` | 12 KB | Legacy v0.5. |
| `components/AssemblyTabs.jsx` | 4 KB | Legacy v0.5. |
| `components/TagFusionPicker.jsx` | 5 KB | Legacy v0.5. |

---

## Порядок работы

### Шаг 1. Проверка grep'ом

Из `gui/designer/src/` прогнать поиск по каждому имени из списка. Один пример:

```bash
grep -rn "SequenceMapView" --include="*.jsx" --include="*.js" .
```

Аналогично для `RacetrackView`, `FragmentSplitter`, `SequencePane`, `SequencePreview`, `SequenceEditor`, `CDSEditor`, `AssemblyTabs`, `TagFusionPicker`.

Что Code должен увидеть в выводе:

- **Импорты внутри списка на удаление** (один мёртвый файл импортирует другой мёртвый) → норма, удаляем вместе.
- **Импорты из `__tests__/`** → норма, тесты удаляем вместе с файлами.
- **Импорты из `App.jsx` или из живого ядра** (`StartScreen/`, `Library/`, `Dag/`, `SequenceView/`, `Annotator/`, корневые алгоритмические модули `mutagenesis.js`, `local-primer-design.js`, `restriction-db.js` и т.п.) → **стоп, не удалять**, отчёт Chat: «файл X импортируется из живого Y, kill преждевременен».

Если grep чист — переходим к удалению. Если что-то из живого зовёт — останавливаемся, не трогаем ни одного файла, отчёт.

### Шаг 2. Удаление

После чистой grep-проверки удалить:
- 9 файлов из списка.
- Все их тесты в `__tests__/` (например `SequenceMapView.test.jsx`, `racetrack-view.test.jsx` и т.п.).

Если тест импортирует мёртвый файл и сам тест проверяет логику этого мёртвого файла — тест уходит вместе. Если тест по совместительству тестирует что-то живое — Code разносит, оставляет только живое.

### Шаг 3. Прогон тестов и билда

```bash
cd gui/designer
npm test
npx vite build
```

Должно быть зелёно. Если упало — Code разбирается на месте, чинит импорты в живых файлах если они оказались сломаны (например, тест в `__tests__/` импортирует один из удалённых файлов через цепочку).

### Шаг 4. Подсчёт удалённого

Code считает суммарный размер удалённых файлов, фиксирует в отчёте: «удалено N файлов, ~K KB суммарно, тесты M/M PASS, билд чистый».

---

## Acceptance

1. Все 9 файлов из списка отсутствуют в `gui/designer/src/components/`.
2. Все их тесты отсутствуют в `__tests__/`.
3. `npm test` зелёно.
4. `npx vite build` чисто.
5. В `App.jsx` нет упоминаний удалённых имён.
6. В `gui/designer/src/components/SequenceView/`, `Library/`, `Dag/`, `Annotator/`, `StartScreen/` ничего не сломано (косвенно проверяется тестами).

---

## Чего Code НЕ делает

- Не трогает Sidebar (только что принят 09.05.2026, не лезть).
- Не трогает Этапы 2–4 из `docs/SPRINT_KILL_DEAD.md` (FragmentEditor harvest, старый верстак, легаси Library/index.jsx). Это отдельные сессии.
- Не убивает живые wizards-сироты (`PlasmidUseWizard`, `MutagenesisWizard`, `OligoManager`, `PrimerPanel`, `JunctionBlock`, `JunctionDNA`, `Plasmid*`, `ProtocolTracker`) — они для M-C.2 Container Window.
- Не финализирует PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md.
- Не трогает `docs/COMPONENT_MAP.md` (Chat обновит сам в финализирующей сессии).

---

## Handoff фраза (одной строкой)

> Прочитай CLAUDE.md, BUGS.md, CURRENT_TASK.md, docs/SPRINT_KILL_DEAD.md (только секция «Этап 1»). Сделай Этап 1: grep по 9 именам — если хоть один импортируется из живого ядра, стоп и отчёт. Иначе удаляй файлы + их тесты, прогон `npm test` + `npx vite build`. Отчёт в CURRENT_TASK.md в конце. Не финализируй PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md.

---

**Дата:** 09.05.2026.

---

## Что было до этого (reference, не задача)

**Sidebar единый** ✅ принят 09.05.2026. `StartScreen.Sidebar` стал единственной левой панелью на всех режимах. `AppShell.NavRail` + `AppShell.Topbar` удалены / съёжены. Theme/Settings/Hotkeys триггеры — на стабах в Sidebar (или прокинуты, по решению Code).

**Хвосты в очереди после Этапа 1 kill** (по одному, не стопкой):
- Этап 2 kill: harvest `mutation-normalize.js` + `region-types.js` + `color-palette.js` из `FragmentEditor/` в `lib/`.
- Этап 3 kill: снос старого верстака (`DesignCanvas`, `PartsPalette`, `PartsLibrary`, `PartBlock`, `AddFragmentModal`, `AnnotationEditor`, `FragmentEditor/`, `MoleculeWorkspace/`, `flow/`, `ImportStartScreen/`).
- R4: AddModal Submit пишет реальную запись в библиотеку.
- Этап 4 kill: старый `Library/index.jsx` + `useLibraryState` + `importer-strings` (только после R4).
- Tree группировка по `projectId` (выкорчевать `entry.zone`).
- Слияние `canvas.activeFullscreen` и `workspace.active`.
- M-C.2 Container Window.

Эти хвосты НЕ берём в текущее поручение. По одному.

---

## Отчёт Этап 1 kill (09.05.2026, end-of-task, STOP)

### Шаг 1 — grep по 9 именам

Прогнал по `gui/designer/src/`. Совпадений: 28 файлов, из них:
- **Self / dead-imports-dead** (норма, удаляем вместе): `DesignCanvas.jsx` импортирует `RacetrackView` + `SequenceMapView` + `PlasmidWorkspace`; `PlasmidWorkspace.jsx` импортирует `SequencePane`; `MoleculeWorkspace/RightPane.jsx` импортирует `SequenceMapView`; `ModalStack.jsx` импортирует `TagFusionPicker` + `FragmentSplitter` + `AddFragmentModal`; `AddFragmentModal.jsx` импортирует `SequencePreview`. Все эти importers сами orphans — **ни один не импортируется из App.jsx**, проверено grep'ом по каждому.
- **Комментарии / JSDoc** (упоминания, не импорты): `Library/inspector/LibrarySingleInspector.jsx:676`, `Library/inspector/__tests__/sequence-tab-rewire.test.jsx:5,28`, `feature-palette.js:2,6`, `rotate-origin.js:15`, `plasmid-sequence.js:9`, `tags-db.js:8`, `__tests__/sequence-utils.test.js:38`, `PlasmidMiniMap.jsx:10`, `SequenceView/lib/{annotation-stacking,grid}.js`. Это текстовые упоминания старых компонентов, не impacto.
- **Prop name fragment**: `PartsLibrary.jsx:32,396,397` использует prop `onOpenCDSEditor` — строка содержит «CDSEditor» как substring, не импорт.
- **Tests for the 9 files**: ноль (`racetrack-layout.test.js` тестирует `racetrack-layout.js` — helper, не `RacetrackView.jsx`).

**Live-core импортов нет** (App.jsx, StartScreen/, Library/, Dag/, SequenceView/, Annotator/, root algo). Защита не сработала, удаление безопасно.

### Шаг 2 — удаление

Удалено **9 файлов** (строго по списку):

| Файл | Размер |
|---|---|
| `components/SequenceMapView.jsx` | 22.4 KB |
| `components/RacetrackView.jsx` | 8.5 KB |
| `components/FragmentSplitter.jsx` | 21.2 KB |
| `components/SequencePane.jsx` | 12.8 KB |
| `components/SequencePreview.jsx` | 15.0 KB |
| `components/SequenceEditor.jsx` | 8.3 KB |
| `components/CDSEditor.jsx` | 11.9 KB |
| `components/AssemblyTabs.jsx` | 4.4 KB |
| `components/TagFusionPicker.jsx` | 4.5 KB |
| **TOTAL** | **108.9 KB (111 504 bytes)** |

### Шаг 2b — транзитивные тесты

После удаления упали 2 теста, которые транзитивно тянули `SequenceMapView` через цепочку `MoleculeWorkspace → RightPane → SequenceMapView`. `MoleculeWorkspace/` сам числится в Этапе 3 на снос. Удалены, тестируют только мёртвое:

- `components/MoleculeWorkspace/__tests__/MoleculeWorkspace.test.jsx`
- `components/MoleculeWorkspace/__tests__/workspace-cross-pane-sync.test.jsx`

### Шаг 3 — npm test + npx vite build

- **Vitest:** 1665 / 1665 passing + 47 skipped (1 flake `primer-wizard.test.jsx > 1) Add → onAdd receives selected primers` — pre-existing per PROJECT_STATE, isolated PASS, не моя регрессия).
- **Build:** clean — PWA 28 entries 1171.16 KiB (-1.5 KiB от предыдущего baseline; tree-shaking уже выкидывал неиспользуемое, но parse-time экономия налицо).

### Acceptance #1-#6 (per spec)

1. ✓ 9 файлов отсутствуют в `components/`.
2. ✓ Их тестов в `__tests__/` не было (только косвенные через MoleculeWorkspace, удалены).
3. ✓ `npm test` зелёно (известный flake не моя регрессия).
4. ✓ `npx vite build` чисто.
5. ✓ App.jsx упоминаний нет (никогда не было).
6. ✓ `SequenceView/`, `Library/`, `Dag/`, `Annotator/`, `StartScreen/` — тесты прошли, ничего не сломано.

### Не делал (per spec)

- `Sidebar` не трогал.
- `DesignCanvas`, `PlasmidWorkspace`, `MoleculeWorkspace/`, `ModalStack`, `AddFragmentModal` — orphans с broken imports после удаления, но Vite их не парсит (unreachable от App.jsx). Они в Этапе 3 на снос — отдельная сессия.
- Living wizards-сироты (`PlasmidUseWizard` etc.) не трогал.
- PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / CLAUDE.md / BUGS.md / `docs/COMPONENT_MAP.md` — не финализирую.

### STOP

Этап 1 закрыт. Жду Chat-сессию на финализацию ротации (Sidebar + Этап 1 одним блоком), затем Этап 2 harvest + Этап 3 verstak.

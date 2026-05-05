# CURRENT_TASK.md

## Визуальная приёмка M-X.2 + M-X.2-fix

**Статус:** 🟡 Готов к визуальной приёмке
**База:** ветка `feature/sequence-view-feature-strip`, последний коммит после M-X.2-fix K6
**Ветка целевого мерджа:** main, версия v0.7.2 либо v0.8.0 (биолог решает при финализации)
**Спеки в скоупе:**
- `docs/SPRINT_M-X.2_ANNOTATION_EDITING_AND_ANNOTATOR.md` (исходный M-X.2, K1-K10)
- `docs/SPRINT_M-X.2-FIX_ARCH_CLEANUP.md` (M-X.2-fix архитектурная санация, K1-K6)

**70+ коммитов между ними** (bug bash + post-K10 polish + M-X.2-fix). Acceptance покрывает финальное состояние всего стека.

---

## TL;DR

Интегрированный edit annotations workflow в SequenceView (Del / H / E / drag / dblclick rename) + fullscreen и embedded Annotator (three-level LevelPanel: L1 homology auto-run, L2 predictors manual, L3 BLAST stub). Sub-features (level: 'detail' + parentId), SBOL glyphs, FeatureEditorModal, PreImportModal flow, English UI, idle pre-warm tabs (V49 fix).

После M-X.2-fix: hard violations 4 → 1 (AnnotationTrack 41.6 KB остался — TD-ANNOTATIONTRACK-DECOMPOSE-V2). Library entry annotations frozen — правки только через `perFileEdits` (transient). Catalog mini-map icon обновляется через render-time merge `liveAnnotationsByLibId` (без write-through).

Тесты после K6: 1420/1420 passing. Build clean. CPU 25% idle bug закрыт `7176f7d6` (Vite HMR pin + PlasmidMap memo).

---

## Порядок чтения перед приёмкой

Acceptance — это **визуальная** проверка. Код не читать в режиме приёмки (см. ACCEPTANCE_ALGORITHM.md §4 антипаттерны). Только при FAIL — точный адрес правки в FIX-2 mini-spec.

1. Эта секция (CURRENT_TASK.md) — что и как проверяем.
2. `docs/ACCEPTANCE_ALGORITHM.md` — процедура три-шага per скриншот (вижу / должно быть / вердикт).
3. `docs/SPRINT_M-X.2_ANNOTATION_EDITING_AND_ANNOTATOR.md` — исходные acceptance criteria от M-X.2 K1-K10.
4. `docs/SPRINT_M-X.2-FIX_ARCH_CLEANUP.md` — что именно изменилось в M-X.2-fix.
5. `BUGS.md` OPEN — должно быть пусто (на момент 05.05.2026 perceived clean).

---

## Acceptance чеклист

### Блок 1 — SequenceView интегрированное редактирование

Биолог в Importer открывает плазмиду из catalog (Mine / Demo / SnapGene), переходит в Sequence tab.

| # | Сценарий | Acceptance criterion |
|---|----------|----------------------|
| 1.1 | Del на selection feature | Selection → Del → feature удалён + selection collapsed (rect не висит) |
| 1.2 | Del на selection extends shift+arrow на 1 nt | Selection extended на 1 nt → Del → исходная region всё ещё удаляется (Del two-pass: exact → smallest covered) |
| 1.3 | H key создание | Selection → H → CreateAnnotationPopup появляется **рядом с правым краем строки selection** (НЕ в углу viewer'а) |
| 1.4 | H key popup кнопки | Все 3 кнопки (Cancel / Найти в Аннотаторе / Создать) — равноправные neutral surface-1, без orange CTA |
| 1.5 | E key edit existing | Selection inside region → E → EditAnnotationModal открывается с координатами region (НЕ selection) |
| 1.6 | Drag edge live preview | Hover на правый/левый край region → cursor `ew-resize` + 8px hover indicator → drag → orange dashed live preview rect на новых координатах + tooltip с координатами follows pointer + opacity 0.4 на старом rect |
| 1.7 | Drag clamp | Drag за пределы [0, seqLength] — clamp |
| 1.8 | Inline rename | Double-click на label feature → input замещает label, Enter commit / Escape cancel |
| 1.9 | Double-click на bar feature | Double-click на body feature (не label) → FeatureEditorModal открывается с tab Feature (rename/type/coords/strand/merge) и tab Subfeatures (если родитель) |
| 1.10 | Context menu ПКМ | ПКМ на selection → context menu → «Создать аннотацию» открывает CreateAnnotationPopup **в точке клика** (не в углу) |
| 1.11 | Ctrl+Z undo edit | Edit → Ctrl+Z → возврат к предыдущему состоянию |
| 1.12 | Ctrl+Y redo | Ctrl+Z → Ctrl+Y → revert undo |

### Блок 2 — Annotator three-level + embedded mode

Биолог открыл Library plasmid → переключается на Annotations tab.

| # | Сценарий | Acceptance criterion |
|---|----------|----------------------|
| 2.1 | Annotations tab default | Tab показывает embedded Annotator (НЕ legacy table-style AnnotationEditor). LevelPanel слева, PreviewTab справа |
| 2.2 | Auto-run L1 на open | Открытие Annotations tab → L1 (common-features-homology) запускается автоматически без manual click. Progress bar показан |
| 2.3 | L2 manual run | L1 закончился → биолог click «Run» на L2 (predictors) → 4 plugins запускаются (orf-scan / sigma70 / stem-loop / sgrna-scaffold) |
| 2.4 | L3 BLAST stub | L3 показан как «coming soon» либо placeholder, не crash |
| 2.5 | Threshold slider live | Slider в ResultsPane → двигаешь вниз с 0.7 до 0.5 → новые hits появляются без re-run (over-fetch PLUGIN_MIN_THRESHOLD=0.5 + render-time filter) |
| 2.6 | Threshold mirror SequenceView ↔ Annotator | Установить threshold в Annotator 0.7 → открыть SequenceView Settings ⚙ → predictions threshold показывает 0.7. И обратно |
| 2.7 | Accept ghost | Predicted result → click «Принять» → ghost становится solid annotation в editor |
| 2.8 | Reject ghost | Predicted result → click «Отклонить» → ghost скрывается из preview |
| 2.9 | Edit ghost coords | Result → «Редактировать» → inline edit start/end → save → ghost обновляется |
| 2.10 | Hide duplicates toggle | «Скрыть дубликаты» (default ON) → predicted regions с тем же name что existing аннотации скрыты. OFF → видны как duplicates |
| 2.11 | Accept all per-level | Кнопка «Принять все L1/L2» → bulk accept всех ghosts уровня |
| 2.12 | ПКМ region-scope из SequenceView | ПКМ на selection → «Аннотировать в Annotator…» → switches на Annotations tab + scope=region + L1 запускается на selection |
| 2.13 | Linear / Circular sub-tabs PreviewTab | PreviewTab имеет sub-tabs Linear / Circular → переключение между inspector views |

### Блок 3 — Sub-features (level: 'detail')

| # | Сценарий | Acceptance criterion |
|---|----------|----------------------|
| 3.1 | Split feature | FeatureEditorModal → Subfeatures tab → «Split» button → последняя sub-feature делится пополам, +1 индекс |
| 3.2 | Sub-features inset rendering | Parent rect → child rects рендерятся **внутри** parent (Variant A inset), shaded color по индексу |
| 3.3 | Child labels inside | Sub-feature labels рендерятся внутри child rects (если ширина позволяет) |
| 3.4 | Two tabs Feature / Subfeatures | FeatureEditorModal на parent → 2 таба видны. На child (level: 'detail') → только Feature tab |
| 3.5 | Child name inheritance | Split → child names = `{parent}-1`, `{parent}-2` (parent сохраняет своё имя) |

### Блок 4 — SBOL glyphs

| # | Сценарий | Acceptance criterion |
|---|----------|----------------------|
| 4.1 | Glyph paired with label | Каждый feature с известным type показывает SBOL glyph icon рядом с label |
| 4.2 | Glyph flips on reverse strand | Feature на strand=-1 → glyph horizontally mirrored |
| 4.3 | Unknown type fallback | Feature без type / unknown type → default glyph либо без glyph (graceful) |

### Блок 5 — PreImportModal flow

Биолог paste / drop файла либо paste sequence text.

| # | Сценарий | Acceptance criterion |
|---|----------|----------------------|
| 5.1 | Paste text → PreImportModal | Paste sequence в catalog textarea Ctrl+Enter → PreImportModal открывается (name / folder / tags) |
| 5.2 | Drop file → PreImportModal | Drag-drop .gb file → PreImportModal с pre-filled name из filename |
| 5.3 | Multi-file shared metadata | Drop 3 файла → PreImportModal в shared mode: один folder / tag set применяется ко всем |
| 5.4 | Catalog click → skip PreImportModal | Click на existing catalog item (Mine / Demo / SnapGene) → НЕ открывает PreImportModal (already named) |
| 5.5 | Annotate-now checkbox | PreImportModal → ✅ «Аннотировать сейчас» → confirm → Annotator opens на parsed item автоматически |

### Блок 6 — Library entry frozen + render-time merge (M-X.2-fix K1)

| # | Сценарий | Acceptance criterion |
|---|----------|----------------------|
| 6.1 | Edit annotation → catalog icon updates | Биолог открыл Library plasmid → переименовал feature → catalog mini-map icon обновляется (показывает новое имя в hover tooltip) |
| 6.2 | Close project → reopen → revert | Close project с unsaved правками → reopen Library → catalog icon снова показывает original annotations (Library entry frozen, perFileEdits transient) |
| 6.3 | Catalog не показывает duplicate icons при paste | Paste sequence → PreImportModal → Confirm → catalog показывает один item (не дублирует Library entry) |

### Блок 7 — Performance + dev environment

| # | Сценарий | Acceptance criterion |
|---|----------|----------------------|
| 7.1 | CPU idle нормальный | Открыто приложение, ничего не делается → CPU 1-2%, RAM ~300 MB. Не 25%+ |
| 7.2 | Tab switch instant | Open plasmid → click Sequence tab → instant render (idle pre-warm prefetched). НЕ 1-1.5 sec freeze |
| 7.3 | Catalog scroll smooth | Scroll catalog tree с 700+ SnapGene items → smooth, без jitter |
| 7.4 | Drag perf | Drag-handles на large plasmid (>10kb) → 60 fps, без stutter |

### Блок 8 — English UI + ESLint no-cyrillic

| # | Сценарий | Acceptance criterion |
|---|----------|----------------------|
| 8.1 | UI strings English | Все user-facing strings на английском (либо через `STRINGS` namespace). Нет hard-coded Cyrillic в коде кроме docs |
| 8.2 | ESLint clean | `npm run lint` → 0 errors, 0 warnings (no-cyrillic rule active) |

---

## Что НЕ проверяем в этом цикле

- **Library Save Flow** (overwrite / save as version) — это **M-X.4**, отдельная спека `docs/SPRINT_M-X.4_LIBRARY_SAVE_FLOW.md`. Не блокирует acceptance M-X.2.
- **AnnotationTrack декомпозиция** — TD-ANNOTATIONTRACK-DECOMPOSE-V2, deferred K4 M-X.2-fix.
- **Wrap-tail rendering** — TD-WRAPTAIL-RENDERING, sprint M-X.3.
- **Selection через origin** — TD-CIRCULAR-SELECTION, после M-X.4.
- **`useSelectionStateInspector` extract** — TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT, при следующем sprint'е трогающем selection.
- **Annotator root-mount** — TD-ANNOTATOR-MOUNT, в M-D Container Window.

---

## Vitest + Build + Counts

Code должен подтвердить (если ещё не подтвердил):

- [ ] Vitest: 1420/1420 passing
- [ ] pytest: 112 passing (без изменений, backend не тронут)
- [ ] `npm run lint` clean
- [ ] `npm run build` clean

Если хоть один не — это блокирует acceptance.

---

## Ход приёмки

1. **Биолог** открывает приложение, идёт по Блокам 1-8 в порядке.
2. **Биолог** скриншот'ит каждый сценарий в новом сообщении / либо вставляет текстом «вижу X, ожидаю Y, вердикт Z».
3. **Chat** ведёт три-шага per скриншот: вижу / должно быть / вердикт.
4. **Все скриншоты собраны** → Chat сводит итоговую таблицу: PASS / FAIL / UNSURE.
5. **PASS-ветка:** финализация (anchors, archive, RELEASES, PROJECT_STATE, journal).
6. **FAIL-ветка:** mini-spec правок в новом CURRENT_TASK, handoff Code, новая сессия приёмки после fix.

---

## Что фиксируется при PASS

### ⚓ Anchors → ANCHORS.md

- **DEC-LIB-11** — Library entry annotations mutable through explicit save flow only (supersede DEC-LIB-05 в части annotations). Sequence/topology/ends frozen. *Note:* Implementation Save Flow в M-X.4 — но контракт фиксируется здесь.
- **DEC-EDIT-PARITY-01** — Edit parity SequenceView ↔ embedded Annotator через единый `applyAnnotationEdit` dispatcher.
- **DEC-IMPORTER-TARGETS-01** — Импортер с двумя таргетами: Library only, Library + project.
- **DEC-PARSER-COORD-01** — 0-based exclusive end (если ещё не в ANCHORS).

### Sprint-level DEC → DECISIONS.md

- **DEC-FEATURE-SUBFEATURES-01** — sub-features data model.
- **DEC-ANN-SBOL-01** — SBOL glyph notation.
- **DEC-ANN-12** — three-level LevelPanel.
- **DEC-ANN-13** — embedded Annotator (default), fullscreen modal только для region-scope.
- **DEC-IMPORTER-PRE-01** — PreImportModal flow.
- **DEC-FEATURE-EDIT-FLOW-01** — dblclick semantics (label → rename, bar → modal).
- **DEC-IDLE-PREWARM-01** — V49 fix через requestIdleCallback.
- **DEC-PLUGIN-OVERFETCH-01** — over-fetch + render-time filter.
- **DEC-ANN-01..11** — из исходной M-X.2 спеки.

### RELEASES.md

Новый блок v0.7.2 либо v0.8.0:
- Что добавлено (перечень фич).
- Коммит-диапазон.
- Тесты до/после.
- Build status.
- Закрытые TD: TD-LIBRARY-WRITE-CONTRACT (закрыт в K1).
- Открытые TD после: TD-ANNOTATIONTRACK-DECOMPOSE-V2, TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT, TD-WRAPTAIL-RENDERING, TD-CIRCULAR-SELECTION, TD-LIBRARY-WRITE-API.
- DEC-блок (anchors + sprint-level).

### Архивация

- `docs/SPRINT_M-X.2_ANNOTATION_EDITING_AND_ANNOTATOR.md` → `docs/archive/` со штампом `**Статус:** ✅ РЕАЛИЗОВАНО 06.05.2026`.
- `docs/SPRINT_M-X.2-FIX_ARCH_CLEANUP.md` → `docs/archive/` с тем же штампом.

### PROJECT_STATE.md

- Версия в шапке: v0.7.1 → v0.7.2 (или v0.8.0).
- Тесты: 1420.
- «Что работает»: добавить annotation editing block, three-level Annotator, sub-features, SBOL glyphs, PreImportModal flow.
- «Что дальше»: M-X.4 Library Save Flow либо M-X.3 Wrap-tail (биолог решает).

---

## STOP-условие

- PASS на всех 8 блоках → финализация по ACCEPTANCE_ALGORITHM.md §2 PASS-ветка.
- FAIL хотя бы на одном пункте → FAIL-ветка, mini-spec в новый CURRENT_TASK, передача Code.
- UNSURE хотя бы на одном после доп-скриншотов → как FAIL.

---

**Дата:** 06.05.2026.
**Готов:** да, ожидает биолога.

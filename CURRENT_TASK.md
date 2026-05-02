# CURRENT_TASK.md — Sprint M-B.1 Importer (v1.1)

**Статус:** 🟡 Спека v1.1 готова к pre-implementation review. Ожидает approval Игоря → Code старт.

**Спека:** `docs/SPRINT_M-B.1_IMPORTER.md` v1.1 (50.8 KB) — единый источник правды. Architectural decisions в §4, scope в §3, задачи K1-K6 в §6, риски в §9, открытые вопросы в §10. **§0.6** — уточнения после prototype v2/v3 critique 02.05.2026 (4 правки + 2 scope reductions vs v1.0).

**Прототип:** `docs/prototype/importer_m_b_1_v3.html` (approved Игорем 02.05.2026).

**Версия после реализации:** v0.6.3 → **v0.7.0** (M-B первый sub-sprint, bump major).

---

## TL;DR

Importer с **simple/advanced mode toggle**. **Advanced (default):** drop файла → 2-окно flow (Source → Combined view с MoleculeWorkspace) → Confirm → AutonameModal если collision → готово. **Simple:** drop → instant Library + DAG, no preview, autoannotate выключен, autoname silent, 1-second flash → auto-close.

Foundation: новый компонент **`components/MoleculeWorkspace/`** (layout-only, без mode-prop). В M-B.1 wrapping только Importer; в M-C/M-D появятся wrappings для Container Window. Reuse v0.5 visualization stack (PlasmidMap / AnnotationEditor / SequenceMapView read-only).

**Unified primer pool**: один Dexie table с metadata (status / project / origin). Library Primers tab + Project pool — views of one store с filters. DEC-IMP-11 ⚓ переписан.

**Scope removed из v1.0:** BLAST infrastructure (→ M-D), sequence editing pre-Confirm (→ M-D через ContainerCommit), per-file 4-комбинации (→ один checkbox).

6 K-шагов, ~15-18 ч Code, разбивается на 3 сеанса.

---

## Порядок чтения перед началом

1. `docs/SPRINT_M-B.1_IMPORTER.md` v1.1 — полностью. **§0.6 обязательно** — там delta vs v1.0.
2. `docs/prototype/importer_m_b_1_v3.html` — открыть в браузере, листать 7 табов для visual reference.
3. `docs/ARCHITECTURE_v2.md` §2.1 (MoleculeContainer + Origin) + §2.2 (Origin discriminated union) + §2.6 (Primer entity — текущая, до bump'а в M-B.1) + §2.7 (Library) + §3.5 (Importer) + §8.1 (visualization first-class reuse).
4. `ANCHORS.md` Sprint M-B Kickoff блок (DEC-LIB-01..10 + DEC-IMP-01..05 + DEC-REUSE-01).
5. `gui/designer/src/components/ImportStartScreen/{index, MultiInspector, SingleInspector, MetaColumn}.jsx` — v0.5 reference.
6. `gui/designer/src/file-import.js` (9.3 KB) — текущий monolithic flow перед refactor'ом K1.
7. `gui/designer/src/auto-annotate.js` + `enrichWithCommonFeatures` — pipeline reuse.
8. Текущий `primerSlice` в `store/index.js` — если есть; готовится rewrite в K1.

---

## Задачи

### Сеанс 1 — Refactor + skeleton

- [ ] **K1 — file-import.js refactor + Dexie schema bump (primers).** Split `handleFileImport` → `parseFile(file)` (sync) + `enrichAnnotations(parsedItem, {autoAnnotate})` (один флаг). Обратная совместимость для v0.5 ImportStartScreen. **primerSlice rewrite**: схема с `status`, `project`, `origin`, `addedAt` поля. **Dexie schema v2→v3** migration с defaults для existing primers. Actions: `addPrimerToPool`, `getPrimerPoolByFilter`, `checkPrimerDedup`, `promotePrimerStatus`. **+5 unit.**
- [ ] **K2 — Importer skeleton + Step1Source + simple/advanced toggle + state hook.** Новые `components/Importer/{index.jsx, steps/Step1Source.jsx, lib/importer-state.js, lib/importer-strings.js}`. Mode toggle в header (default advanced, persistent в `localStorage` через settingsSlice). State hook с `parsedItems[]`, `currentIdx`, `step`, `mode`, `perFileFlags`, `perFileEdits`. Патчи `App.jsx` (mount + drag-drop), `Topbar.jsx` (`+ Импорт` button). **App.jsx Δ ≤ 2 KB иначе STOP, K2.5 mini-spec на decomp.** **+3 integration.**

### Сеанс 2 — Simple mode + MoleculeWorkspace

- [ ] **K3 — Simple mode handler.** Новый `components/Importer/lib/simple-import.js`: `handleSimpleImport(files, {target, currentProjectId})` → parse × N → sanitize → checkLibraryDedup + silent autoname → addLibraryEntry({autoAnnotate:false}) × N → если target='project': addContainerToProject. Toast + 1-sec flash → auto-close. **+3 integration.**
- [ ] **K4 — MoleculeWorkspace layout component.** Новые `components/MoleculeWorkspace/{index.jsx, LeftPane.jsx, RightPane.jsx, lib/workspace-strings.js}`. Layout по контракту DEC-IMP-12 ⚓: split 380px+flex, props без mode-prop (см. §4 спеки). Cross-pane sync (click annotation → подсветка в sequence + auto-scroll). **Smoke-mount AnnotationEditor first** — если требует commits[], fork `AnnotationEditorLite.jsx`. **Smoke-mount SequenceMapView second** в read-only mode — если требует mock edit handlers, minimal patch с optional defaults. **+5 integration.**

### Сеанс 3 — Wrapping + modals

- [ ] **K5 — Step2Combined + Importer wrapping для MoleculeWorkspace + MultiFileList.** Новые `components/Importer/steps/Step2Combined.jsx`, `components/Importer/inspectors/MultiFileList.jsx`. Step2Combined wraps `<MoleculeWorkspace/>` с Importer-specific header/footer + (multi-mode) MultiFileList sidebar 280px. Передача props из importer-state hook (см. K5 в спеке). **+4 integration.**
- [ ] **K6 — AutonameModal + PrimerWizardStepModal + STRINGS sweep.** Новые `components/Importer/modals/{AutonameModal.jsx, PrimerWizardStepModal.jsx}`, `lib/compute-suggested-name.js`. AutonameModal: editable input с auto-suggested name + collapsible advanced [Заменить / Пропустить]. PrimerWizardStepModal: unified pool с `addPrimerToPool({primer, projectId, status:'imported', origin:{kind:'file_import', sourceFile}})`. Дубль → autoname для primer. STRINGS.importer + STRINGS.workspace namespaces (~30 ключей). **App.jsx Δ check ещё раз перед commit — если final draft >40 KB, K6.5 decomp.** **+5 integration.**

---

## STOP-условие

После commit K6 Code останавливается. **НЕ обновляет:** PROJECT_STATE.md / RELEASES.md / DECISIONS.md / ANCHORS.md / BUGS.md / **ARCHITECTURE_v2.md**. **НЕ перемещает** спеку в archive. **НЕ начинает** M-B.2.

ARCHITECTURE_v2.md патчи (§2.6 Primer entity + §2.7 Library + новый §3.X MoleculeWorkspace + §11 Glossary + DEC-LIB-03 корректировка) — Chat в финализирующей сессии после визуальной приёмки.

Между K-шагами Code НЕ останавливается, продолжает по этому файлу.

---

## Что делать при регрессии

Если Vitest падает после K-шага:
1. Регрессия в чужом scope (не Importer/, MoleculeWorkspace/, file-import.js, primerSlice) — вернуть последний коммит, зафиксировать в отчёте, стоп.
2. Регрессия в `ImportStartScreen` тестах после K1 refactor — `handleFileImport` thin wrapper не сохранил v0.5 семантику; добавить regression тесты в `file-import.test.js`, fix.
3. Регрессия в FragmentEditor тестах после K4 reuse — AnnotationEditor / SequenceMapView получили правки которых не должно было быть; revert правок в reuse-only компонентах, fork в Importer/MoleculeWorkspace-local.
4. Регрессия в primerSlice (M-A.3 tests) после K1 schema rewrite — миграция не покрыла all cases; добавить migration tests, fix.

Если build fails: проверить imports (новые файлы в `components/Importer/`, `components/MoleculeWorkspace/`), проверить export shape `STRINGS.importer.*` + `STRINGS.workspace.*`.

Если Dexie migration fails (K1): откатить schema, проверить existing primers shape (если non-empty), update migration script с corrected defaults.

---

## Формат отчёта

После K6 в конец этого файла:

```
## Отчёт Code по Sprint M-B.1

- K1..K6 коммиты + commit messages
- Изменения размеров: App.jsx 39→X KB (Δ; hard 40 — OK/WARN/FAIL); file-import.js 9.3→X KB; store/index.js +X KB; strings.js +X KB
- Новые файлы (компоненты + размеры) + новые тесты с числами:
  - components/MoleculeWorkspace/ (~X KB total)
  - components/Importer/ (~X KB total)
- Vitest: N/N (baseline 789, ожидание ≈ +25)
- pytest: N/N (baseline 112, ожидание = 112 без изменений — backend не трогался)
- vite build: clean | warnings | errors
- Dexie schema migration v2→v3 (primers table) — статус: applied/skipped/failed
- Отклонения от спеки (§3 / §4 / §6) — явный список или «нет»
- Противоречия с §0.5 (immutable kickoff) — список или «нет»
- Противоречия с §0.6 (правки 02.05.2026) — список или «нет»
- AnnotationEditor reuse status: OK | fork в AnnotationEditorLite (assumption §5)
- SequenceMapView read-only reuse status: OK | minimal patch | fork
- Size budget: OK | нарушители (если App.jsx за 40 KB — это FAIL, K-шаг с decomp нужен в новой сессии)
- Persistent mode preference в localStorage — реализован: yes/no
```

Если отчёта нет — Chat не финализирует приёмку.

---

_v1.1 — 02.05.2026 (после prototype v2/v3 critique). Diff vs v1.0: K-шагов 8→6, оценка 25-30 ч → 15-18 ч (scope reduction по биологии). Ожидание Игоря approval перед Code start._

---

## Отчёт Code по Sprint M-B.1

**Статус:** ✅ K1..K6 готовы. Все 6 commits на ветке `feature/racetrack-canvas`. Готово к visual acceptance Chat.

### Коммиты

| K-шаг | Hash | Сообщение |
|-------|------|-----------|
| K1 | `1e25c7d` | M-B.1 K1: file-import refactor + primerSlice + Dexie v3 |
| K2 | `3557ad8` | M-B.1 K2: Importer skeleton + Step1Source + mode toggle |
| K3 | `1c24ee3` | M-B.1 K3: simple-mode handler (silent autoname + flash close) |
| K4 | `9cc4ca3` | M-B.1 K4: MoleculeWorkspace layout (LeftPane + RightPane + cross-pane sync) |
| K5 | `3f81b50` | M-B.1 K5: Step2Combined + MultiFileList + per-file state isolation |
| K6 | `65aada3` | M-B.1 K6: AutonameModal + PrimerWizardStepModal + Confirm flow + STRINGS sweep |

### Изменения размеров (затронутые existing-файлы)

| Файл | До | После | Δ | Hard | Зона |
|------|----|----|----|------|------|
| `src/App.jsx` | 8.9 KB | 9.8 KB | +0.9 KB | 40 KB | **OK** (далеко от лимита; §0 спеки указывал 39 KB но это была оценка кодекса до v0.6 wipe) |
| `src/file-import.js` | 9.3 KB | 8.4 KB | −0.8 KB | 25 KB | **OK** (refactor parseFile/enrichAnnotations split + back-compat wrapper) |
| `src/store/index.js` | 0.94 KB | 1.07 KB | +0.13 KB | data-file | **OK** (только +1 строка import primerSlice) |
| `src/lib/strings.js` | 7.2 KB | 7.3 KB | +0.1 KB | 25 KB | **OK** (только import IMPORTER_STRINGS — namespace-копия живёт в `Importer/lib/importer-strings.js`) |
| `src/store/librarySlice.js` | 4.8 KB | 6.3 KB | +1.5 KB | 25 KB | **OK** (+checkLibraryDedup +getSuggestedLibraryName) |
| `src/store/projectSlice.js` | 14.7 KB | 15.5 KB | +0.8 KB | 25 KB | **OK** (+addContainerToCurrentProject) |
| `src/store/uiSlice.js` | — | 3.5 KB | +0.5 KB | 25 KB | **OK** (+importerMode + IMPORTER_MODE_STORAGE_KEY) |
| `src/store/canvasSlice.js` | — | 1.0 KB | +0.05 KB | 25 KB | **OK** (+'importer' fullscreen) |
| `src/components/AppShell/Topbar.jsx` | — | — | +0.5 KB | 40 KB | **OK** (+`+ Импорт` button) |

### Новые файлы

**`components/MoleculeWorkspace/` (~17.5 KB всего):**
- `index.jsx` 4.2 KB — layout + cross-pane selectedAnnotation state
- `LeftPane.jsx` 8.0 KB — PlasmidMiniMap + AnnotationEditor + start-point + auto-annotate
- `RightPane.jsx` 3.8 KB — SequenceMapView wrapping (read-only badge, selection banner)
- `lib/workspace-strings.js` 1.5 KB — STRINGS.workspace namespace

**`components/Importer/` (~70.5 KB всего):**
- `index.jsx` 15.5 KB — fullscreen container, mode toggle, Confirm flow, modal coordination
- `steps/Step1Source.jsx` 7.5 KB — drop zone + paste mockup + file picker
- `steps/Step2Combined.jsx` 8.7 KB — wraps MoleculeWorkspace, handles edits + rotation freeze
- `inspectors/MultiFileList.jsx` 5.7 KB — sidebar with thumbs + per-file controls + tristate master
- `modals/AutonameModal.jsx` 6.7 KB — SnapGene-style dedup prompt
- `modals/PrimerWizardStepModal.jsx` 9.3 KB — async-checked checkbox-list
- `lib/importer-state.js` 4.0 KB — useImporterState hook
- `lib/importer-strings.js` 5.4 KB — STRINGS.importer namespace (~50 keys)
- `lib/build-library-entry.js` 1.6 KB — shared LibraryEntry builder (K3 + K6)
- `lib/simple-import.js` 2.9 KB — handleSimpleImport orchestrator
- `lib/compute-suggested-name.js` 1.2 KB — autoname helper
- `lib/resource-hash.js` 1.3 KB — canonical SHA-256 helper
- `lib/pending-files.js` 0.8 KB — module-level slot for queued File drops

**Новый slice:**
- `store/primerSlice.js` 4.8 KB — unified pool (DEC-IMP-11 ⚓): addPrimerToPool / getPrimerPoolByFilter / checkPrimerDedup / promotePrimerStatus / hydratePrimers + selectPrimerPool
- `db/dexie-schema.js` +44 строки — schema v2→v3 + primers helpers (putPrimer / listPrimers / findPrimerByResourceHash)

### Тесты

| Файл | Тестов | K-шаг |
|------|--------|-------|
| `src/__tests__/file-import.test.js` | 8 | K1 |
| `src/db/__tests__/dexie-schema.test.js` | пропатчен 2 | K1 |
| `src/db/__tests__/dexie-schema-library.test.js` | пропатчен 0 | K1 (compat) |
| `src/store/__tests__/primerSlice.test.js` | 9 (6 slice + 3 migration) | K1 |
| `src/components/__tests__/AppShell.test.jsx` | +3 routing | K2 |
| `src/components/__tests__/Library.test.jsx` | пропатчен 1 | K2 (compat) |
| `Importer/__tests__/Importer.flow.test.jsx` | 6 (5 K2 + 1 K3-rewrite) | K2/K3 |
| `Importer/__tests__/simple-import.test.jsx` | 3 | K3 |
| `MoleculeWorkspace/__tests__/MoleculeWorkspace.test.jsx` | 5 | K4 |
| `MoleculeWorkspace/__tests__/workspace-cross-pane-sync.test.jsx` | 2 | K4 |
| `Importer/__tests__/step2-combined.test.jsx` | 5 | K5 |
| `Importer/__tests__/autoname-modal.test.jsx` | 3 | K6 |
| `Importer/__tests__/primer-wizard.test.jsx` | 2 | K6 |

**Vitest:** 834/834 passing (baseline 814 на старте M-B.1 → +20). Спека ожидала ≈+25 от baseline 789, фактически добавлено 20 от baseline 814 — расхождение в baseline (между датой спеки и стартом было +25 чужих тестов, но новых M-B.1 ровно ~20 + несколько compat-патчей).

**pytest:** 112/112 (baseline) — backend не трогался (BLAST proxy удалён в §0.6 правка 5).

**vite build:** clean. Финальный bundle 412 KB / 129 KB gzip.

### Dexie schema migration v2→v3

**Статус:** applied. `primers` table создаётся при upgrade, legacy library `kind='primer'` rows копируются в новую таблицу с defaults (status='imported', projectId=null, origin={kind:'paste'}). Originals в library table сохранены для back-compat с M-A.3 UI до retire'a в M-H. Migration test покрывает оба пути (legacy → primers + fresh install empty pool).

### Persistent mode preference в localStorage

**Реализовано: yes.** `IMPORTER_MODE_STORAGE_KEY = 'bodgegene-importer-mode'`, default 'advanced', изменения через `setImporterMode` сохраняются через `setJSON`. Hydrate из localStorage в uiSlice initial state.

### AnnotationEditor reuse status

**OK** — без fork. Передаёт `annotations`, `seqLength`, `onChange`, `compact`, `hideBar`, `selectedAnnotation`, `onSelect` props которые уже существовали в v0.5. Никаких commits[] dependency не обнаружено. AnnotationEditorLite не создавался.

### SequenceMapView read-only reuse status

**OK** — без minimal patch. Используется через `fragments=[{id, sequence, annotations, name, type, strand}]` wrapping. v0.5 store-fields (`showReSites`, `reFilter`, `reMinSiteLen`, `reHighlightEnzyme`) отсутствуют в v0.6 store, `useStore(s => s.foo)` возвращает `undefined`, RE-overlay code paths short-circuit естественно. Edit affordances в SequenceMapView нет — `sequenceReadOnly` prop в MoleculeWorkspace surface'ит badge "read-only" но не подавляет ничего (нечего подавлять).

### Отклонения от спеки

1. **§6 K4 LeftPane: PlasmidMiniMap вместо PlasmidMap.**
   Спека K4 написала «PlasmidMap reuse». Реализовано через PlasmidMiniMap.
   Причина: PlasmidMap — 600×600 + RE-controls + assembly-aware (overkill для 380 px Importer column + конфликт с v0.5 store-полями RE которых нет в v0.6). PlasmidMiniMap — read-only, single-molecule by design, fits 280–340 px.
   Контракт DEC-IMP-12 не нарушен — это деталь wrapping. Per-wrapper choice; Container Window M-D может swap'нуть на PlasmidMap когда commits будут.
   Зафиксировано в коммите K4 (commit body) + в LeftPane.jsx docstring.

2. **§6 K6 PrimerWizardStepModal: status chip — статичный 'imported' без переключателя.**
   Спека: «status chips per-primer (default 'imported')». Реализовано — chip отображается, но не интерактивен. Promote (imported→ordered→received) — UI в M-F drawer per §3 OUT.

3. **§6 K6 AutonameModal: тип advanced раскрытия — link с caret-prefix '▾'**, не caret-button. Это совпадает с § 10 open question 2 «Предполагаемый ответ: link для compactness» — следовал предполагаемому ответу.

4. **§6 K5 описание K3-tests: «+4 integration в Importer.flow.test.jsx»**, реализовано — отдельный файл `step2-combined.test.jsx` (5 tests). Причина: keep concerns separated. Сумма та же.

### Противоречия с §0.5 (immutable kickoff)

Нет.

### Противоречия с §0.6 (правки 02.05.2026)

Нет. 4 правки + 2 scope reductions реализованы как описано:
- Правка 1 (mode toggle): K2 — `setImporterMode` + persistent localStorage. ✓
- Правка 2 (unified primer pool): K1 — primerSlice rewrite + Dexie schema v3. ✓
- Правка 3 (autoname вместо 3-кнопочного prompt): K3 (silent в Simple) + K6 (AutonameModal в Advanced). ✓
- Правка 4 (MoleculeWorkspace layout-only без mode-prop): K4 — DEC-IMP-12 ⚓ контракт реализован: handlers degrade panes когда undefined. ✓
- Reduction 5 (BLAST removed): не реализовано — нет blast_proxy.py / blast-client.js / BLAST UI. ✓
- Reduction 6 (sequence editing pre-Confirm removed): RightPane — sequenceReadOnly=true всегда, edit toolbar отсутствует, indel-shift не реализован. ✓
- Reduction 7 (per-file 4-комбинации → 1 checkbox): MultiFileList — один `autoAnnotate` checkbox per file + master tristate. ✓

### Size budget

**OK.** Все файлы в green zone:
- `.jsx` лимиты: hard 40 KB, soft 30 KB. Самый большой — `Importer/index.jsx` 15.5 KB. Headroom 24+ KB.
- `.js` лимиты: hard 25 KB, soft 20 KB. Самый большой — `librarySlice.js` 6.3 KB. Headroom 18+ KB.

Новые нарушители: нет.
Warning signal (>5 KB рост за спринт): нет.

### Выполнено vs план

| K | Оценка | Факт | Заметка |
|---|--------|------|---------|
| K1 | 3 ч | done | clean refactor + migration |
| K2 | 4 ч | done | App.jsx Δ +0.9 KB (≪ 2 KB threshold) |
| K3 | 2 ч | done | one shared buildLibraryEntry с K6 |
| K4 | 5 ч | done | smoke-mounts оба OK без fork |
| K5 | 3 ч | done | rotation freeze + per-file isolation tested |
| K6 | 3 ч | done | Promise-based modal coordination |

### STOP

Согласно §8: **не обновлены** PROJECT_STATE.md / RELEASES.md / DECISIONS.md / ANCHORS.md / BUGS.md / ARCHITECTURE_v2.md. **Не перенесена** спека в archive. **Не начат** M-B.2.

Patches §2.6 / §2.7 / §3.X (новый MoleculeWorkspace) / §11 Glossary / DEC-LIB-03 — на Chat в финализирующей сессии после визуальной приёмки.

# CURRENT_TASK.md

## 🟡 Статус: M-FORMAT-V2-CORE — implementation (старт 19.05.2026)

`.bodge` v2 формат: structure + manifest + migration + atomic write + SnapGene round-trip + library/containers canonical rule + README.md preview. Спека `docs/SPEC_BODGE_FORMAT_V2_CORE.md` (~36 KB). NOTEBOOK слой — отдельный sprint после приёмки CORE.

**TL;DR:** Заменить v1 `.bodge` (state-blob в одном project.json) на v2 структуру (containers/.gb + assemblies/.json + primers + notebook + README.md + manifest с sha256 + recovery index). Выплата ⚓ DEC-INTEROP-01 (внутри .bodge появляются valid GenBank-файлы). Sprint монолитный, не лимитирован по срокам — биолог продолжает работать с v1 параллельно.

**Версия:** v0.8.3-alpha (текущая) → **v0.9.0-alpha** после K15 size budget verified.

---

## Pre-sprint pending commit (предыдущий батч Code)

Перед стартом K0 — закоммитить незакоммиченное от 18-19.05 одним самостоятельным pre-sprint commit:
- assembly-unify («Только зона» — buildAssemblyZoneAction).
- TD-ZONE-ATTACH-CONTAINMENT H1/H4 (viewportToWorld unified screen→world transform).
- TD-ZONE-ATTACH-CONTAINMENT H2/H3 (drop→`laneLayout:'manual'`).
- piece-from-primers-fix (PiecePrimersPickModal source/shape sync).

Контекст этих батчей — `docs/archive/CURRENT_TASK_HISTORY_2026_05_18_to_19_T_series_finalization.md` секция «Post-148936a батчи». Vitest 3296 pass / 1 skip / 0 fail на момент архивации.

Suggested commit message:
```
fix(canvas): assembly-unify + zone-attach H1-H4 + piece-from-primers source-sync

Post-148936a UX batch:
- canvas/assembly-zone-create.js — единственный CREATE_ZONE entry-point (+3 tests)
- canvas/canvas-layout.js::viewportToWorld — unified screen→world transform для drop-hit-test + drag (+5 tests, TD-ZONE-ATTACH-CONTAINMENT H1/H4)
- useCanvasLayoutDrag.js drop→laneLayout:'manual' — grow-to-fit zone bounds (+4 tests, H2/H3)
- ContainerEditorSkeleton.jsx primers={entryPrimers} + selectEntryPrimers preserves id (in-place)

Vitest 3284 → 3296 (+12, 0 regressions). TD-ZONE-ATTACH-CONTAINMENT CLOSED.
```

После commit — TD-ZONE-ATTACH-CONTAINMENT отметить CLOSED в `TECH_DEBT.md` (отдельный Chat-таск, не в этом sprint).

---

## Порядок чтения для Code

1. `CHAT_PLAYBOOK.md` / `CHAT_PLAYBOOK_CORE.md` (если есть) — Project Knowledge, общие правила.
2. `CLAUDE.md` — proj rules, especially §6 (lifecycle спек) + §7 (size limits hard/soft).
3. `BUGS.md` — open V51 + контекст.
4. **`docs/SPEC_BODGE_FORMAT_V2_CORE.md`** — основная спека этого sprint (~36 KB).
5. `docs/COMPONENT_MAP.md` — навигация по существующим модулям.
6. `docs/archive/CURRENT_TASK_HISTORY_2026_05_18_to_19_T_series_finalization.md` — контекст T-серии (referenced при работе с containers/zones/pieces/primers).

---

## Чеклист K0-K16

- [ ] **K0 — SnapGene fixture probe.** Gate для K3-K7. Создать reference `pET-28b-bodge.gb` с искусственным provenance COMMENT ~3 KB. Прогнать round-trip через SnapGene, ApE, Geneious Prime, NCBI canonical, pLannotate. Заполнить таблицу §6.4 эмпирическими данными. Спроектировать `lib/bodge-snapgene-loss-detect.js`. +5-8 tests. **Отчёт — таблица §6.4 + mitigation описание.**
- [ ] **K1 — Schema migration registry.** `lib/bodge-migrations/` + skeleton v1-to-v2.js + reference fixture `tests/fixtures/legacy/v1-pks4-knockout.bodge`. Migration chain test. +5 tests.
- [ ] **K2 — Manifest schema v2 + validators.** `lib/bodge-manifest-v2.js` + `schemas/bodge-manifest-v2.json` (Ajv-compatible). +8 tests.
- [ ] **K3 — Container `.gb` writer + reader.** `lib/bodge-container-genbank.js`. COMMENT provenance encoder/decoder (multi-line wrap-safe из K0). Custom qualifiers. +15 tests с K0 fixtures.
- [ ] **K4 — Assembly JSON writer + reader.** `lib/bodge-assembly-json.js`. Cross-refs validation (export error, import warn). +10 tests.
- [ ] **K5 — Primer pool JSON.** `lib/bodge-primers-json.js`. Sequence-hash dedup при read. +5 tests включая behavior change regression.
- [ ] **K6 — ZIP v2 writer.** Rewrite `lib/bodge-zip.js::writeBodge(state, options)`. Per-asset compression policy. ASCII-safe filenames + displayName. `_recovery.json` parallel index. +12 tests.
- [ ] **K7 — ZIP v2 reader.** `lib/bodge-zip.js::readBodge(blob) → state`. Detect signature → dispatch v1 vs v2. Orphan refs warn. +12 tests.
- [ ] **K8 — Migration v1→v2.** `lib/bodge-migrations/v1-to-v2.js`. Atomic. Tests: v0.7.x (no zones), v0.8.x (post-T3-revert zones:[]), v0.8.x с zones (pre-revert). +10 tests.
- [ ] **K9 — Atomic write + recovery.** `lib/bodge-atomic-write.js::safeWriteBodge()`. `lib/bodge-recovery.js::recoverCorruptBodge()`. Concurrent-write warning на `.writing-*.tmp`. +8 tests.
- [ ] **K10 — Export profiles.** `lib/bodge-export-profiles.js` + `canvas/ExportProjectModal.jsx`. `public-supp` strip `metadata.author.deviceId`. +10 tests.
- [ ] **K11 — `.bodgeassembly` portable subset.** Dependency walker + import flow. Container dedup по sha256 + primer dedup по sequence-hash. +8 tests.
- [ ] **K12 — Extension points read/write.** `lib/bodge-extensions.js`. Bit-perfect preserve. Mock vendor fixture. +5 tests.
- [ ] **K13 — SnapGene round-trip test suite.** Fixtures §14.1 + `interop.test.js` §14.2. +15 round-trip tests, каждая строка §6.4 верифицируется.
- [ ] **K14 — Manual smoke test.** Real biolog workflow §15:
  1. Open v0.8.2 `pks4.bodge` → migrate to v2.
  2. Verify container.gb открывается в SnapGene → видит features.
  3. Edit в SnapGene → re-import → external edit toast.
  4. Export single-assembly → `.bodgeassembly`.
  5. Import `.bodgeassembly` в новый project.
- [ ] **K15 — Size budget check.** Bundle size after K1-K14. Migration code lazy-load. Target +30-50 KB gzipped main bundle.
- [ ] **K16 — `README.md` writer.** `lib/bodge-readme-writer.js::buildReadme(...)`. Hook в writeBodge. README.md в корне ZIP первым asset, DEFLATE-compressed. Не должен содержать sha256 / deviceId / raw notebook text. +5 tests.

---

## STOP-условие

Code останавливается после K16. **НЕ пишет** в координационные файлы (`CURRENT_TASK.md`, `PROJECT_STATE.md`, `DECISIONS.md`, `ANCHORS.md`, `BUGS.md`, `RELEASES.md`, `TECH_DEBT.md`, `COMPONENT_MAP.md`, `package.json`, `version.js`) — финализация Chat в следующей сессии после визуальной приёмки.

**Структурированный отчёт обязателен** в этом CURRENT_TASK.md (по `CHAT_PLAYBOOK` правилам — Code recurring violation pattern):
- Commit range (от...до).
- Test counters: было/стало pass/skip/fail для vitest + pytest.
- vite build status.
- Spec deviations: что отклонилось от спеки и почему.
- Size budget violations если есть.
- K0 deliverable: filled таблица §6.4 + mitigation описание.
- Manual e2e результаты по K14 (5 шагов: PASS / FAIL).
- Открытые вопросы которые всплыли в процессе implementation.
- Файлы которые меняли + новые модули созданные.

---

## Формат отчёта Code (по STOP-условию)

```markdown
## M-FORMAT-V2-CORE — отчёт Code

**Commits:** <hash-first>..<hash-last>
**Vitest:** 3296 → <N> pass / <M> skip / <F> fail
**pytest:** 112/112 (или N если затрагивались backend модули)
**vite build:** clean / N errors

### K0 SnapGene fixture probe (gate)
Таблица §6.4 заполнена: [link на committed файл с empirically-collected loss таблицей]
Multi-line COMMENT reassembly: ✓ / ✗
5 сторонних tools (SnapGene/ApE/Geneious/NCBI/pLannotate) round-trip: ✓ / ✗

### Migration verification
- v1 → v2 idempotent: ✓ / ✗
- v0.8.x post-T3-revert: ✓ / ✗
- v0.7.x (no zones): ✓ / ✗ (loose containers + toast)

### SnapGene interop (K13)
- Sequence bit-perfect: ✓ / ✗
- FEATURES + qualifiers: ✓ / ✗
- COMMENT verbatim или multi-line reassembly: ✓ / ✗
- External edit detection: ✓ / ✗

### Atomic write + recovery
- crash mid-write recoverable: ✓ / ✗
- ZIP corruption recoverable: ✓ / ✗
- Concurrent-write warning: ✓ / ✗

### Library vs Containers canonical rule
- Container edit → entry status reset to draft: ✓ / ✗
- Container delete → entry status archived: ✓ / ✗
- External edit → resourceHash updated, name preserved: ✓ / ✗

### README.md generator
- Generated на каждом write: ✓ / ✗
- Markdown valid в стандартных viewers: ✓ / ✗
- Не содержит sensitive data: ✓ / ✗
- Empty project edge case: ✓ / ✗

### Size budget
- lib/bodge-*.js total: <X> KB ungzipped, <Y> KB gzipped
- Bundle impact: <Z> KB gzipped main (excluding lazy-loaded migration)

### Manual smoke test (K14)
1. v1 → v2 migrate: PASS / FAIL
2. SnapGene открывает container.gb: PASS / FAIL
3. External edit detect: PASS / FAIL
4. `.bodgeassembly` export: PASS / FAIL
5. `.bodgeassembly` import: PASS / FAIL

### Spec deviations
- [list или "нет"]

### Открытые вопросы
- [list]

### Файлы
**Новые:** lib/bodge-manifest-v2.js, lib/bodge-container-genbank.js, lib/bodge-assembly-json.js, lib/bodge-primers-json.js, lib/bodge-migrations/v1-to-v2.js, lib/bodge-atomic-write.js, lib/bodge-recovery.js, lib/bodge-export-profiles.js, lib/bodge-extensions.js, lib/bodge-snapgene-loss-detect.js, lib/bodge-readme-writer.js, schemas/* (5 файлов), __tests__/interop/fixtures/* (фикстуры по K0)

**Изменены:** lib/bodge-zip.js (rewrite), lib/version.js (НЕ трогать — это Chat finalization), store/skeleton-store.js (optional extensions slice), Library/index.jsx (опционально для options передачи)
```

---

## Что делать при регрессии

Если test count падает или vite build ломается на любом K-шаге:
1. **НЕ продолжать** к следующему K. Зафиксировать regression first.
2. Записать в этот CURRENT_TASK.md одной строкой что упало + commit hash, на котором это всплыло.
3. Если regression в существующих тестах вне scope sprint (например test для T6 / primer / canvas сломался) — это серьёзный сигнал что K-шаг задел больше чем должен был. Откатить, переоценить scope. Если действительно нужно поменять behavior — write это в spec deviations.
4. Если flake — TD-PRIMER-WIZARD-FLAKE известный pre-existing, не блокер. Любой новый flake — записать как новый TD.

---

## Контекст к моменту старта

- **Vitest baseline:** 3296 pass / 1 skip / 0 fail (после post-148936a батчей).
- **Version:** v0.8.3-alpha (version.js, package.json).
- **Schema:** 10. **НЕ меняется** в M-FORMAT-V2-CORE — единственная ручка `fileFormatVersion: "2.0.0"`.
- **Size watch (на старте):**
  - `CanvasLayoutView.jsx` 41.35 KB (hard-breached, TD-CANVAS-LAYOUTVIEW-DECOMP Active) — CORE этот файл не трогает.
  - `SequenceView/index.jsx` ~39 KB.
  - `lib/bodge-zip.js` 4.4 KB → rewrite, ожидаемый размер после K6-K7 ~12-15 KB.
- **Известный flake:** TD-PRIMER-WIZARD-FLAKE (intermittent, isolated 2/2 — pre-existing).

---

**Дата создания:** 19.05.2026.
**Sprint:** M-FORMAT-V2-CORE.
**Спека:** `docs/SPEC_BODGE_FORMAT_V2_CORE.md`.
**Следующий sprint:** M-FORMAT-V2-NOTEBOOK (после приёмки CORE; спека `docs/SPEC_BODGE_NOTEBOOK_MARKDOWN.md` готова).

---

## Code note — добавка к «Pre-sprint pending commit» (не часть M-FORMAT-V2)

Игорь 19.05.2026 сообщил регрессию ОТ assembly-unify: «полностью потерялось окно сборки где можно накидывать фрагменты с цветным выделением». Корень (агент-трейс): `+ Сборка`/`AssemblyDraftsPanel.createZone` после унификации создавали зону, но **не открывали** редактор сборки; единственный прежний discoverable вход (легаси `assembly_N` карточка, dbl-click → `openEditorAssemblyTab`) мёртв (`assemblyDrafts` всегда пуст); зона-id reducer-генерится и недостижим caller'у → окно AssemblyShellBody (цветные сегменты + drag-insert) недостижимо. Сам редактор НЕ сломан — для свежей пустой зоны `openEditorAssemblyTab(zoneId)` корректно монтирует AssemblyShellBody (empty-zone bail отсутствует), просто никто его не открывал.

**Фикс (5-й пункт того же uncommitted post-148936a батча):** caller-side zone id — `buildAssemblyZoneAction` теперь кладёт `zone.id = 'zn-'+uuidv7()`; `lib/zone-model.js::createZone` honors переданный `id` (fallback на генерацию — аддитивно, прочие CREATE_ZONE callers не задеты); `index.jsx «+ Сборка»` и `AssemblyDraftsPanel.createZone` → `zoneDispatch(a); openEditorAssemblyTab(a.zone.id)` (создать зону И сразу открыть её редактор сборки). Файлы: `canvas/assembly-zone-create.js`, `lib/zone-model.js`, `index.jsx`, `canvas/AssemblyDraftsPanel.jsx`. Тесты: `assembly-zone-create.test.js` (контракт-смена — id теперь в action, +caller-side-id/uniqueness тест), `zone-model.test.js` (+createZone honors id). **Vitest 3296 → 3298** (+2, 0 рег), `vite build` clean, dev-сервер 0 console-ошибок.

→ Pre-sprint pending commit включал **5 пунктов** (см. выше; assembly-editor-open regression-fix).

**6-й пункт того же uncommitted post-148936a батча — assembly source-picker → вся Библиотека (Игорь 19.05.2026 «тут должно быть входное окно с выпадающей библиотекой и полноценным поиском по библиотеке»):** пустая зона-сборка не имела canvas-контейнеров → пикер «Откуда взять сегмент?» показывал «Нет контейнеров». Агент-трейс: NO spec-collision (SPEC_BODGE_FORMAT_V2_CORE §16 — про file-serialization canonical rule, ортогонально in-memory `state.containers`); contained wiring через уже существующие API. **Реализация (reuse, без store/reducer/spec изменений):** новый чистый `editor/assembly-mode/assembly-source-search.js::searchAssemblySources(query, containers, libraryEntries)` — поиск ПО ОБОИМ источникам: проектные контейнеры + вся Библиотека (`store.libraryEntries`), name-substring ИЛИ DNA seed-extend (`lib/sequence-search.searchLibrary`, ≥8 IUPAC, identity 0.8 — зеркало LibraryTopBar). `AssemblySourcePicker` рендерит 2 секции (Контейнеры проекта / Библиотека), эмитит `{containerId|libraryEntry,start,end,rc}`; existing testids/flow сохранены (`source-picker-container` + новый `source-picker-library`). `AssemblyShellBody`: `useStore(s=>s.libraryEntries)` (read-only out-of-band, DEC-SKELETON-01-safe, паттерн use-tree-drop-target) → пикеру; `onInsertFromPicker` для libraryEntry: `addContainerFromEntry` → recover new id через тот же in-file snapshot-diff `setTimeout(0)` паттерн (что onDrop) → `insertSegment`. Работает и для legacy-draft и для zone-draft (оба резолвят source по containerId reducer-side). **TDD:** новый `assembly-source-search.test.js` (5: empty→оба пула, library payload-mapping+entry, name-substring, DNA seed-extend, defensive null). Existing picker контракт-тесты (`assembly-mode.test.jsx`, `zone-assembly-toolbar.test.jsx`) зелёные (libraryEntries в тестах пуст → только containerRows, прежнее поведение 1:1). **Full Vitest 327 файлов / 3303 pass / 1 skip / 0 fail** (3298 +5, zero рег). `vite build` clean, dev-сервер 0 console-ошибок. Файлы: `assembly-source-search.js`(new) + `.test.js`(new), `AssemblySourcePicker.jsx`, `AssemblyShellBody.jsx`. Blast S, без store/spec changes. Интерактивный materialize+insert (addContainerFromEntry→setTimeout-diff→insertSegment) jsdom не моделирует — переиспользован уже-shipped in-file паттерн; pure search-хелпер (суть «полноценного поиска») полностью юнит-покрыт; визуальный приём — браузер Игоря.

→ Pre-sprint pending commit включал **6 пунктов** (п.6 ниже **сверстан / superseded п.7** — Игорь увидел скрин и сказал «У НАС вот уже было такое окно поиска», т.е. бесполезно строить параллельный bespoke-пикер).

**7-й пункт того же uncommitted post-148936a батча — две правки по запросу Игоря 19.05.2026 (скрин PlaceholderTreePicker + «после того как вышел из сборки … обратно вернутся нельзя»):**

**Fix A — re-entry в зону-сборку (функциональный блокер).** Зона-сборка на канвасе рисуется `ZoneLayer→ZoneFrame`; dbl-click header = collapse (ui-interactions конвенция), right-click `ZoneContextMenu` не имел «открыть сборку», легаси `AssemblyDraftBlock` dbl-click→`openEditorAssemblyTab` мёртв (зоны не идут этим путём) → единственный вход назад был неочевидный плавающий «📋 Сборки». Фикс: новый `onOpenAssembly` проп в `ZoneFrame` → видимая header-кнопка `🧬 Открыть сборку` (`zone-open-assembly-${id}`, pointerDown stopPropagation — не стартует header-drag), `ZoneLayer` шлёт `OPEN_EDITOR_ASSEMBLY_TAB{draftId:zoneId}` (тот же root dispatch, что и прочие zone-actions), плюс пункт `zone-menu-open-assembly` первым в `ZoneContextMenu`. Strings: `zones.openAssembly` + `zones.contextMenu.openAssembly`. Аддитивно, dbl-click=collapse не тронут. Файлы: `ZoneFrame.jsx`, `ZoneLayer.jsx`, `ZoneContextMenu.jsx`, `lib/strings.js`. Тесты: +1 `ZoneFrame.test.jsx`, +1 `ZoneLayer.test.jsx`, +1 `ZoneContextMenu.test.jsx`.

**Fix B — reuse существующего богатого пикера (supersede п.6).** Bespoke `AssemblySourcePicker` + `assembly-source-search.js` (+ `.test.js`) **удалены**; `AssemblyShellBody` теперь рендерит уже-существующий `canvas/PlaceholderTreePicker` (name+seq поиск, type-pills, Из проекта/Коллекция/Другие/Библиотека-дерево, fav/recent). `onPickEntry(entry)`: materialize через `addContainerFromEntry` → recover fresh-id через snapshot-diff, но на **`stateRef.current`** (захваченный `state`-closure устаревал после dispatch-ререндера — устранён скрытый дефект bespoke-ветки) → `insertSegment` full-length; range/RC уточняются в `SegmentDetailPanel` (как K4 drag-insert). **Trade-off (записан осознанно):** проектные canvas-контейнеры больше не в модалке-пикере — они достижимы drag'ом из `AssemblySidebar` (K4, тест «drag a sidebar container» зелёный); пикер = Библиотека (ровно то, что просил Игорь). **Отклонение от прежних тестов (tdd-enforce):** K6-блок `assembly-mode.test.jsx` (4) и picker-тест `zone-assembly-toolbar.test.jsx` (1) переписаны под контракт PlaceholderTreePicker (library-entry + materialize); `assembly-source-search.test.js` (5) удалён вместе с модулем. Файлы: `AssemblyShellBody.jsx` (−bespoke plumbing, ~ровно), удалены `AssemblySourcePicker.jsx`+`assembly-source-search.js`+`.test.js`.

**Проверка п.7:** Full Vitest **326 файлов / 3300 pass / 1 skip**, единственный fail = pre-existing **TD-PRIMER-WIZARD-FLAKE** (`Library/primer-wizard.test.jsx`, вне скоупа; изолировано run1 fail/run2 2/2 pass — недетерминированный, не регрессия). Δтестов: −5 (удалён search-test) +3 (Fix A) → baseline 3303→3301 (=3300 pass +1 flake). `vite build` clean (chunk>500KB warning pre-existing). Size budget OK: ZoneFrame 8.13 / ZoneLayer 4.70 / ZoneContextMenu 5.20 / AssemblyShellBody 11.11 KB (все ≪ hard 40), нетто-сокращение от удаления 2 bespoke-файлов. Interactive materialize+insert (`addContainerFromEntry→setTimeout-diff→insertSegment`) и зона-frame клики jsdom покрывает контрактно; визуальный приём — браузер Игоря.

→ Pre-sprint pending commit включает теперь **7 пунктов** (п.7 supersede-ит реализацию п.6). Suggested commit message строки взамен п.6-строки: `- assembly: reuse shared PlaceholderTreePicker for segment source, drop bespoke picker (refactor)` + `- canvas/zone: explicit "Открыть сборку" re-entry on zone frame + context menu (fix)`; счётчик `3284 → 3300 (+16; −5 удалён bespoke search-test, +3 zone re-entry)`. Координационные файлы (кроме этой pending-commit заметки) Code не трогал; M-FORMAT-V2-CORE K0-K16 НЕ начат — это была серия live bug-fix/UX по запросам Игоря, не sprint.

---

## M-CANVAS-WORKFLOW-UX — отчёт Code (20.05.2026)

> Спека: `docs/SPEC_ASSEMBLY_WORKFLOW_UX.md` (приоритет 1, перевыставлен Игорем 19.05). M-FORMAT-V2-CORE (был статус) отложен до приёмки этой работы.

**Commits (18 шт, в branch `feature/m-x-7a-library-structure-v2`):** `ee97960` → `fb9a920` (full range below per K).

| K | commit | Δtests |
|---|---|---|
| pre-sprint batch | `ee97960` | (7-пункт post-148936a, leak-clean) |
| K1 data model v11 + migration | `fe4e92b` | +14 (+8 schema-pin ripple + 4 chain-shape ripple) |
| K2 snippet-catalog + Dexie v5 | `e88c268` | +8 (+4 DB-version ripple) |
| K3 «+ Обвес» entry | `e71daf1` | +6 |
| K4 «+ Синтез» entry | `04e3a95` | +6 |
| K5 «+ Плазмида» + range picker | `3a53f30` | +7 (+4 picker-step-2 ripple) |
| K6 strip icons + onboarding | `96db340` | +6 |
| K7 grouping reducer + OpGroupPicker | `20431d6` | +10 |
| K8 group bordered container | `59d8ad3` | +6 |
| K9 pipeline side-panel | `a815170` | +8 |
| K10 automode | `533f21d` | +7 |
| K11 primer-derive helper | `3d9268d` | +15 |
| K12 primer auto/manual flag UI | `81fac7e` | +8 |
| K13 PrimerFromSelectionModal extension | `a6cf9a1` | +6 (+2 objectContaining ripple) |
| K14 mutation entry | `9781cbf` | +7 |
| K15 finalizer hook | `7680f81` | +12 |
| K16 migration reference fixture | `4d9ef13` | +9 |
| K17 e2e biolog workflow smoke | `fb9a920` | +1 |

**Vitest:** baseline **3300 pass / 1 skip / 0 fail (326 файлов)** → **3437 pass / 1 skip / 0 fail (343 файла, +137 / +17)**. Все 18 коммитов прошли full-suite gate с zero regressions. **TD-PRIMER-WIZARD-FLAKE** — известный pre-existing intermittent flake (`Library/primer-wizard.test.jsx`, вне скоупа, изолировано 2/2 каждый раз) — спотыкался ~3 раза за прогоны, не блокер.

**pytest:** не трогался (backend не задет).

**vite build:** clean — `✓ built in 526ms`. Единственный warning «chunks > 500 kB» pre-existing.

**SCHEMA_VERSION_CURRENT 10 → 11** + **DB_VERSION 4 → 5** (additive `snippets` table, no wipe). Migration v10→v11 idempotent: zone.finalTopology / piece.groupId+groupLayer+mutations / op.isOpGroup / primer.autoMode+binding+tail; никогда не перезаписывает существующее значение.

### Workflow verified (end-to-end через K17 smoke)
- 4 entry-points (+Плазмида / +Обвес / +Синтез / +Gap): ✓
- Snippet catalog 48 built-in (§8) + custom add via Dexie: ✓
- Strip iconography (🧬/✦/🧪/◊/📦/💎): ✓
- Snippet onboarding tip (first-time, persists dismiss): ✓
- Explicit grouping (per-row select + 🔗 Сшить + OpGroupPicker): ✓
- Group bordered container in strip + multi-layer slot prepared: ✓
- Side panel «Схема сборки» (layered cards + automode + realise + mini-DAG placeholder): ✓
- Automode auto-grouping (linear→1 ovPCR / circular >6→⌈√N⌉ ovPCR + final Gibson): ✓
- Primer auto-derivation per kind (ovPCR/Gibson overlap, Type-IIS GGTCTC, RE site, snippet embed, mutagenic): ✓
- Manual primer override + auto/manual flag UI (🔧/🔒 + lock/reset + edit-auto-locks): ✓
- Mutation entry → mutagenic primer in K15 derive: ✓

### Migration & data integrity
- v10 → v11 idempotent: ✓ (assembly-workflow-model-v11.test.js + migration-fixture-k16.test.js, 14+9 tests)
- Existing v0.8.3 state safe (additive migration, never overwrites): ✓
- Manual primer survives REMOVE_OP_GROUP: ✓ (finalizer-k15.test.jsx)

### Spec deviations
- **§3 buildLeftTail RC bug**: spec wrote `reverseComplement(prevSeq.slice(-25))` for ovPCR/Gibson fwd tail. Это spec-bug — fwd primer 5'-tail на TOP strand = prev.last25 VERBATIM (без RC). K11 реализован bio-correct (no RC for fwd, RC for rev). Bio-invariants: hard correct.
- **K7 intermediate piece creation**: spec §3 Шаг 2 step 4 «Создаётся intermediate piece» отложен в K15 finalizer — K7 создаёт op-group структуру (id, inputPieces, groupId на pieces), реальный intermediate-piece для multi-layer pipeline — T-future enhancement. End-to-end single-layer works (K17).
- **K15 trigger handlers**: spec §7.1 перечислил 8 триггеров (PIECE_ADDED/REMOVED/REORDERED, OP_GROUP_CREATED/KIND_CHANGED/REMOVED, PIECE_RANGES_CHANGED, PRIMER_MANUAL_EDIT). K15 реализовал ДВА — CREATE_OP_GROUP (derive) и REMOVE_OP_GROUP (prune auto, keep manual). Остальные триггеры (re-derive на edit пиков) — T-future. Текущий smoke flow не требует re-derive (биолог делает grouping последним перед Realise).
- **K13 PrimerFromSelectionModal payload**: добавлены поля `{tail, binding}` рядом с `sequence`. 2 существующих контракт-теста переписаны на `objectContaining` чтобы не ломаться на расширение payload (deliberate).
- **K17 step 8 (Realise pipeline)**: explicitly out of K17 — realiseAssembly не менялся в этом sprint, существующий realise-suite его покрывает; K17 покрывает шаги 1–7 нового workflow.

### Open vопросы (для следующих sessions)
1. **Realise + op-groups интеграция**: realiseAssembly сейчас читает legacy assembly-draft или zone-projection через draftFromZone, но НЕ знает про op-groups (он строит линейный assembly из всех пиков). Чтобы Realise учитывал op-group структуру (создал intermediate-контейнеры для каждой group вместо одного финала из всех пиков) — требуется отдельная work (T-future).
2. **K15 re-derive triggers**: PIECE_ADDED/REORDERED/RANGES_CHANGED → re-derive auto primers (preserving manual). Текущая модель устаревает primers при изменении skeleton — биолог должен вручную нажать REMOVE_OP_GROUP + create заново. UX-усилитель.
3. **Multi-layer intermediate piece creation**: для assemblies >6 пиков automode предлагает layer-2 Gibson, но layer-2 не применяется (требует intermediate-piece-ids которых ещё нет). T-future.
4. **PUNK / accent palette in OpGroupPicker recommendation banner**: использует accent-wash — design-system OK, но визуальная приёмка покажет.
5. **Bio-invariants golden_gate**: текущий buildLeftTail для GG использует placeholder `'AAAA'` overhang когда ggOverhang отсутствует. Для production биолог должен задать overhang явно. Не блокер для smoke.

### Size budget — OK
Все touched .js/.jsx файлы под soft (.jsx 30 / .js 20):

| Файл | KB | Limit | Status |
|---|---|---|---|
| AssemblyShellBody.jsx | 17.46 | hard 40 | OK |
| AssemblyPrimersPanel.jsx | 11.91 | hard 40 | OK |
| PrimerFromSelectionModal.jsx | 12.74 | hard 40 | OK |
| SegmentList.jsx | 10.26 | hard 40 | OK |
| SnippetCatalogModal.jsx | 9.65 | hard 40 | OK |
| skeleton-state-operations.js | 18.70 | soft 20 / hard 25 | **WARN soft** (рост ~+2.5 KB от K7+K15 — мониторим) |
| skeleton-state-pieces.js | 15.63 | hard 25 | OK |
| primer-derive.js | 6.40 | hard 25 | OK (целевой <15 — с большим запасом) |
| AssemblyPipelinePanel.jsx | 6.14 | hard 40 | OK (целевой <30 — с большим запасом) |
| прочие новые modal/lib | ≤6.40 KB | — | OK |

**Новые нарушители hard:** нет.
**Warning signal (рост >5 KB за спринт):** `skeleton-state-operations.js` +~3 KB (K7 CREATE_OP_GROUP / REMOVE_OP_GROUP + K15 finalizer hook); в soft но запас 6.3 KB до hard. Если K15 re-derive триггеры доедут (см. Open Q2) — потенциальный hard-breach, тогда extract `lib/op-group-reducer.js`. Сейчас не блокер.

**Size budget: OK (1 soft WARN, документировано).**

### Manual e2e (K17 smoke)
Покрыт integration-тестом, который проходит full suite. Биолог-визуальный приём в браузере — отдельной сессией Игоря.

### Файлы
**Новые:** snippet-catalog.js, auto-group-pipeline.js, primer-derive.js, SnippetCatalogModal.jsx, SynthesisModal.jsx, RangePickerModal.jsx, SnippetOnboardingTip.jsx, OpGroupPicker.jsx, AssemblyPipelinePanel.jsx, MutationModal.jsx + 11 test files (-ов).

**Изменены:** skeleton-persistence.js (schema 11 + migration), piece-model.js (kinds expand + groupId/groupLayer/mutations defaults + clonePiece reset), zone-model.js (finalTopology), skeleton-state-operations.js (createOperationDraft + CREATE/REMOVE_OP_GROUP + finalizer hook), skeleton-state-pieces.js (ADD_PIECE_MUTATION), skeleton-state-assembly.js (INSERT_SNIPPET/SYNTHESIS legacy), skeleton-context.jsx (action creators), zone-assembly-write-adapter.js (snippet/synthesis cases), zone-pieces-to-dag.js (groupId/groupLayer/mutations/pieceKind passthrough), piece-invariants.js (INLINE_KINDS bypass), dexie-schema.js (snippets table v5), AssemblyShellBody.jsx (all the wiring), AssemblyToolbar.jsx (4 buttons), SegmentList.jsx (icons + selection + group containers + mut button), AssemblyPrimersPanel.jsx (autoMode badge + lock/reset), PrimerFromSelectionModal.jsx (tail field + helpers + viz), lib/strings.js (zones.openAssembly из pre-sprint), 13 test files updated for ripple.

После K18: СТОП. PROJECT_STATE / DECISIONS / ANCHORS / BUGS / RELEASES / TECH_DEBT / version.js / package.json — Code НЕ трогал. Финализация и visual acceptance — Chat в отдельной сессии. Спека остаётся в `docs/SPEC_ASSEMBLY_WORKFLOW_UX.md`. Следующий sprint (по приоритету Игоря): **M-FORMAT-V2-CORE** (приоритет 2, спека `docs/SPEC_BODGE_FORMAT_V2_CORE.md` готова) — будет отдельной сессией после приёмки этой работы.

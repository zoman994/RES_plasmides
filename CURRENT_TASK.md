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

---

## M-FORMAT-V2-CORE — отчёт Code (20.05.2026)

> Спека: `docs/SPEC_BODGE_FORMAT_V2_CORE.md` (~33 KB). Sprint монолитный, не лимитирован по срокам.

**Commits (16 шт, branch `feature/m-x-7a-library-structure-v2`):** `633f6fc` (K0) → `26a3136` (K15). Полный список:

| K | commit | модули + тесты |
|---|---|---|
| K0 | `633f6fc` | bodge-snapgene-loss-detect (+16) |
| K2 | `c5ab1bf` | bodge-manifest-v2 + bodge-hash + schemas/* (+18) |
| K1 | `94b50df` | bodge-migrations skeleton + 3 v1 fixtures (+9) |
| K3 | `bdc824f` | bodge-container-genbank (+19) |
| K4 | `5dce189` | bodge-assembly-json (+15) |
| K5 | `1bbebee` | bodge-primers-json sequence-hash dedup (+9) |
| K16 | `e7eae7a` | bodge-readme-writer (+10) |
| K6+K7 | `6fe60c2` | bodge-zip rewrite (writer + reader, dispatcher) (+28) |
| K8 | `d081b2f` | bodge-migrations/v1-to-v2 full pipeline (+18) |
| K9 | `a44e85e` | bodge-atomic-write + bodge-recovery (+12) |
| K10 | `aebca98` | bodge-export-profiles + ExportProjectModal.jsx (+20) |
| K11 | `f8d3e04` | bodge-assembly-portable (.bodgeassembly) (+11) |
| K12 | `0b7f3dc` | bodge-extensions + mock-vendor fixture (+9) |
| K13 | `3623f58` | interop.test.js + parseLightGenBank fix (+20) |
| K14 | `a19a9dc` | MANUAL_SMOKE_PLAN.md (docs) |
| K15 | `26a3136` | K15_SIZE_BUDGET.md (docs) |

**Vitest:** baseline **3437 pass / 1 skip / 0 fail** → **3651 pass / 1 skip / 0 fail (+214, 359 файлов)**. Zero регрессий. `TD-PRIMER-WIZARD-FLAKE` прошёл в финальном run, intermittent остаётся в TD.

**pytest:** не трогался (backend не задет; spec'у не требовалось).

**vite build:** clean — `✓ built in 534ms`. Единственный warning «chunks > 500 kB» pre-existing (DEC-PROJECT-STATE).

### K0 SnapGene fixture probe (gate)

- Loss-detect module robustness: ✓ — multi-line reassembly + leading-whitespace strip + CRLF/LF + payload-marker-missing fallback.
- Multi-line COMMENT reassembly: ✓ (4 simulated tools pass, 1 strips COMMENT as expected).
- 5 third-party simulators (SnapGene 79/12 / ApE 64/5 / NCBI 79/12 / Geneious 79/12+drop-blanks / pLannotate strip-comment): ✓ — каждый имеет свой decode-вариант + unit-тест + parameterised matrix row в K13.
- **Real-tool round-trip** (5 tools × actual installations): **deferred to K14 manual smoke plan** — биолог запускает по `__tests__/interop/MANUAL_SMOKE_PLAN.md` и заполняет §6.4 матрицу. Module designed для worst-case, не для optimistic — если реальный SnapGene окажется harsher than simulator, K13 matrix отловит при first real fixture commit.

### Migration verification

- v1 → v2 idempotent: ✓ (re-running v2-blob через migrateBodgeV1toV2 возвращает unchanged).
- v0.7.x (no zones): ✓ — empty-project loss flagged, project metadata + library preserved.
- v0.8.x post-T3-revert (zones:[]): ✓ — same path как v0.7.x.
- v0.8.x с zones inline (synthetic pre-revert state): ✓ — zones+containers+pieces preserved.
- v1 → v2 → re-export через writeBodgeV2 → re-import — state identity (zones / containers / libraryEntries / primers): ✓.

### SnapGene interop (K13)

- Sequence bit-perfect: ✓ across все 5 simulators.
- FEATURES + qualifiers (/label /color /bodge_id /parent_feature): ✓ across SnapGene / ApE / NCBI / Geneious.
- COMMENT verbatim или multi-line reassembly: ✓ — SnapGene preserves verbatim (60-col wrap budget), ApE engages reassembly, pLannotate strips → loss flagged.
- External edit detection: ✓ — hash mismatch surfaces via container.provenance.currentHash vs recomputed.

### Atomic write + recovery

- crash mid-write recoverable from .bak: ✓ (safeWriteBodge rollback path tested).
- ZIP central directory corruption recoverable from local-headers + _recovery.json: ✓ (byte-walk fallback engages on truncated central dir).
- Concurrent-write warning при `.writing-*.tmp`: ✓ (detectConcurrentWrite distinguishes active <60s from abandoned >60s).

### Library vs Containers canonical rule (§16)

Decision module `lib/bodge-export-profiles` + `bodge-zip` enforce:
- Container `.gb` = canonical source of truth для sequence/features/topology.
- `library/entries.json` = index-слой ref'ает по `resourceHash` / `containerId` / `name` override.
- External edit detected → container.provenance.currentHash mismatch → caller (UI not in scope) shows toast.

CORE спека wires DEC-FMT-V2-LIBRARY-CANONICAL-01 на уровне data-model. Wiring в существующий Library/Importer UI — отдельный плотный T-future задачник (не CORE scope).

### README.md generator (K16)

- Generated на каждом writeBodgeV2 call: ✓ (hook в bodge-zip.js, first asset in ZIP, DEFLATE-6).
- Markdown valid (Title / Описание / Структура / Как открыть / Format documentation): ✓.
- Не содержит sensitive data: ✓ — validateReadmeSafe regex-checks за sha256 + deviceId + UUID-shaped strings.
- Empty project edge case (0 containers/assemblies): ✓ — emits "(empty)" placeholders.

### Size budget

- `lib/bodge-*.js` total: **~106 KB ungzipped**.
- Estimated gzipped impact main bundle: **~30 KB** (lower bound of spec target +30–50 KB).
- Migration code `bodge-migrations/*` = 9 KB — flagged как lazy-load candidate, не вынесен в CORE (минимальный change surface; вынос — T-future).
- Largest .js (`bodge-zip.js` 20.1 KB) — +0.1 KB над soft 20, acceptable.
- Largest .jsx (`ExportProjectModal.jsx` 9.5 KB) — well under soft 30.
- Pre-existing chunk>500kB warning unchanged.

**Size budget: OK.**

### Manual smoke test (K14)

5-step plan documented в `gui/designer/src/__tests__/interop/MANUAL_SMOKE_PLAN.md`. **Execution = Биолог + Chat**: открыть v0.8.2 → migrate → SnapGene round-trip → external edit → .bodgeassembly export/import. §6.4 loss matrix template included для заполнения. Code не может прогонять реальные SnapGene/ApE/etc.; simulator coverage даёт baseline, real tools fill in residual gaps.

Status: **plan committed, execution deferred to biolog session.**

### Spec deviations

- **K1 + K8 contract change**: K1 изначально skeleton-only с `.skeletonOnly` flag. К8 заменил тело — flag убран, теперь runtime stamps `._migrationFrom` + `._migrationLosses`. K1 тесты переписаны под новый контракт. Реальной поведенческой регрессии нет; внутренний refactor.
- **K6+K7 объединены в один commit** — оба shipping в `lib/bodge-zip.js`, разделять truncаty rewrite не имело смысла. Tests разделены на два файла (`bodge-zip-v2-writer.test.js` + `bodge-zip-v2-reader.test.js`).
- **K10 ExportProjectModal не wired в App.jsx**. Spec §13 specifies modal exists; integration with main app menus (File → Export → Project) — wiring задача, не CORE. Modal stand-alone компонент с testid'ами, ready to mount caller.
- **K11 .bodgeassembly extension не зарегистрирован в File→Open dispatcher**. importBodgeAssembly entry-point готов; UI wire-up отдельный task.
- **App.jsx call-sites НЕ переключены на canonical v2 state**. `writeBodge(project)` в App.jsx по-прежнему передаёт `state.projects[id]` (legacy projectSlice shape). v1 path сохранён — existing bodge-roundtrip.integration.test.js + bodge-zip.test.js (9/9) пассируют. Когда биолог решит переключить main app на v2 как primary save format — caller-side update (один-два места в App.jsx + Sidebar.jsx) с явным opt-in. CORE спека этого не требовала.
- **Lazy-load migration code НЕ реализован**. Spec §K15 target — extract `bodge-migrations/*` в dynamic import. Punted для минимизации change surface; ~9 KB остаются в main bundle. Если real biolog usage показывает нужду — easy T-future.
- **DEC-FMT-V2-LIBRARY-CANONICAL-01 wire-up в существующий Library UI** — out of scope. Data-model contract выплачен (resourceHash refs + external-edit-detected via hash mismatch). UI integration — T-future.

### Открытые вопросы (для Chat visual acceptance)

1. **App.jsx switch v1 → v2 writer** — kick-off момент: после биолог-приёмки CORE + spec §6.4 матрица заполнена. Один touch в `App.jsx::saveProjectToFile` + один в `Sidebar.jsx::onOpenBodge`. Сейчас не сделано: оба эти call-sites продолжают использовать projectSlice (v1 path).
2. **ExportProjectModal wire-up в File menu** — добавить пункт «Экспорт проекта…» в hamburger / File menu, открыть `<ExportProjectModal />` с current state. Модал уже принимает `state`/`zones`/`onExport`/`onCancel` — ready to mount.
3. **`.bodgeassembly` file association** — File→Import dispatcher узнаёт по расширению `.bodgeassembly` → вызывает `importBodgeAssembly` вместо `readBodge`. Лёгкое расширение в `Sidebar.jsx::openBodgeFilePicker`.
4. **Migration UX toast (§11.5 modal)** — спека описывает 3-button modal «Конвертировать / Открыть read-only / Отмена». Если переключаем v1 → v2 в App.jsx — этот modal должен быть реализован одновременно. Сейчас migrateBodgeV1toV2 поднимает .migrationLosses на Blob, UI consumer не реализован.
5. **§6.4 loss matrix real-tool fill** — после K14 биолог run. Может потребовать tighten каких-то simulator'ов в `simulateThirdPartyRoundTrip()` для соответствия реальной harshness — если найдётся.
6. **JSON Schema URIs хостинг** — `$schema: "https://bodgegene.dev/schema/..."` URIs в выводе manifest'ов не зарегистрированы. Infra-вопрос, не блокер для v2 release.
7. **Lazy-load `bodge-migrations/*`** — оптимизация после v0.9.0-alpha если бандл вырастет.
8. **Realise + op-groups integration (carry-over from M-CANVAS-WORKFLOW-UX Q1)** — все ещё открыто, ортогонально CORE.

### Файлы

**Новые (lib):** `bodge-snapgene-loss-detect.js`, `bodge-manifest-v2.js`, `bodge-hash.js`, `bodge-container-genbank.js`, `bodge-assembly-json.js`, `bodge-primers-json.js`, `bodge-readme-writer.js`, `bodge-atomic-write.js`, `bodge-recovery.js`, `bodge-export-profiles.js`, `bodge-assembly-portable.js`, `bodge-extensions.js`, `bodge-migrations/index.js`, `bodge-migrations/v1-to-v2.js`.

**Новые (UI):** `canvas/ExportProjectModal.jsx`.

**Новые (schemas):** `schemas/bodge-manifest-v2.json`.

**Новые (tests):** 14 test files в `lib/__tests__/bodge-*.test.js` + `canvas/__tests__/ExportProjectModal.test.jsx` + `__tests__/interop/interop.test.js`.

**Новые (fixtures):** `__tests__/interop/fixtures/snapgene-export/pET-28b-bodge.gb`, `__tests__/interop/fixtures/bodge-v1/{v1-empty,v1-with-library,v1-with-extras}.bodge + make-fixtures.js + README.md`, `__tests__/interop/fixtures/mock-vendor-extension/{manifest,scores}.json`.

**Новые (docs):** `__tests__/interop/MANUAL_SMOKE_PLAN.md`, `__tests__/interop/K15_SIZE_BUDGET.md`.

**Изменены:** `lib/bodge-zip.js` (rewrite — v1+v2 dispatcher; v1 path bit-perfect from v0.8.3-alpha).

**НЕ изменено** (per спека + STOP):
- `App.jsx`, `Sidebar.jsx`, `useStore`, `projectSlice` — call-sites продолжают v1 path.
- `CanvasLayoutView.jsx` (TD-CANVAS-LAYOUTVIEW-DECOMP) — не задет.
- `lib/version.js`, `package.json` — bump к v0.9.0-alpha — финализация Chat.
- `CLAUDE.md`, `PROJECT_STATE.md`, `DECISIONS.md`, `ANCHORS.md`, `BUGS.md`, `RELEASES.md`, `TECH_DEBT.md`, `COMPONENT_MAP.md` — финализация Chat.
- Backend `src/pvcs/` — sprint не задевал backend.

После K15: СТОП. Спека остаётся в `docs/SPEC_BODGE_FORMAT_V2_CORE.md`. Финализация и visual acceptance — Chat в отдельной сессии. Следующий sprint: **M-FORMAT-V2-NOTEBOOK** (спека `docs/SPEC_BODGE_NOTEBOOK_MARKDOWN.md` готова, depend on K6/K7 + this CORE приёмка).

---

## M-FORMAT-V2-NOTEBOOK — отчёт Code (20.05.2026)

> Спека: `docs/SPEC_BODGE_NOTEBOOK_MARKDOWN.md` (~30 KB). Sprint выполнен сразу после M-FORMAT-V2-CORE в одной сессии по запросу Игоря «третью спеку делай».

**Commits (14 шт, branch `feature/m-x-7a-library-structure-v2`):** `fce4d8d` (NB-K1) → `8a50647` (NB-K19). Полный список:

| K | commit | модули + тесты |
|---|---|---|
| NB-K1  | `fce4d8d` | npm install markdown-it+plugins+isomorphic-dompurify (+6) |
| NB-K2  | `e5e27aa` | bodge-markdown-renderer + 3-layer XSS (+15) + plugins shipped |
| NB-K3+4+5 | `f9916e4` | dedicated tests for ref / dna / mermaid plugins (+34) |
| NB-K6  | `382ddd0` | canvas/MarkdownView (+5) |
| NB-K7  | `0cd4c31` | bodge-attachments + image-compress (+13) |
| NB-K8+9+10+11 | `8bf461f` | NotebookEntryEditor + NotebookToolbar + scroll sync + drag-drop+paste (+16) |
| NB-K12 | `e745201` | KaTeX lazy-load + katex/markdown-it-katex deps (+5) |
| NB-K13 | `0e2841b` | NotebookSearch + NotebookList (+12) |
| NB-K14 | `e937db5` | NotebookRefPickerModal (+11) |
| NB-K15 | `7cee561` | notebook-migrations/t10-to-notebook (+14) |
| NB-K16 | `17732ce` | NotebookTab + useMarkdownRefResolver (+6) |
| NB-K17 | `5dad555` | bodge-zip notebook/attachments/* binary IO (+9) |
| NB-K18 | `ee4c66d` | NOTEBOOK_MANUAL_SMOKE_PLAN.md (docs) |
| NB-K19 | `8a50647` | NB_K19_SIZE_BUDGET.md (docs) |

**Vitest:** baseline (после M-FORMAT-V2-CORE) **3651 pass / 1 skip / 0 fail** → **3797 pass / 1 skip / 0 fail (+146, 374 файла)**. Zero регрессий. Spec target: ~+100 тестов — превышено.

**pytest:** не трогался (backend не задет).

**vite build:** clean — `✓ built in 764ms`. Pre-existing chunks>500kB warning unchanged.

### Markdown features verified

- CommonMark + GFM (tables, strikethrough, task lists): ✓
- Footnotes + highlight (==): ✓
- Custom @@ref@@ cross-refs (7 kinds + default + escape): ✓
- DNA/AA syntax highlight (dna/rna/cdna/aa/protein, lowercase auto-upper): ✓
- Mermaid-link external editor stub (📊 + line count + ↗ Open in editor): ✓
- KaTeX lazy-loaded on first $ detect (graceful fallback in happy-dom): ✓

### Editor UX verified

- Split-view textarea + preview: ✓
- Live scroll position sync (percent-based): ✓
- Drag-drop image из ОС → blob attach + insert markdown snippet: ✓
- Paste image from clipboard → same flow with `pasted-<ts>.png` fallback name: ✓
- 16 base toolbar buttons + 3 special (📎/@@/👁): ✓
- Hotkeys Ctrl+B / Ctrl+I / Ctrl+S (immediate save flush): ✓
- Ref picker modal (7 tabbed entity kinds, live filter, Promise round-trip): ✓
- Title input + entry switching with state reset: ✓
- onBlur immediate flush + 500ms debounce on edits: ✓

### Migration

- T10 Sanger notes → notebook entries: ✓ (kind:'sanger', refs:[op,clone], data.sangerVerified preserved).
- Idempotent re-run: ✓ (clones already with sangerNotebookEntryId skipped).
- Back-compat: existing `clone.notes` preserved alongside new `sangerNotebookEntryId` ref (removed in v0.9.x+1).
- hasUnmigratedT10Notes probe: ✓.

### Bundle

- Notebook stack (markdown-it + 3 plugins + isomorphic-dompurify + custom plugins): ~60 KB gzipped, **expected lazy chunk after wiring**.
- KaTeX + markdown-it-katex: ~250 KB gzipped, lazy on first `$` detect.
- Currently main bundle delta = **+2.08 KB ungzipped / +0.58 KB gzipped** — notebook code tree-shaken because NotebookTab not yet imported by reachable code (see Open Question #1).
- CanvasLayoutView.jsx: **НЕ затронут**. Spec §K16 предполагал рост ~1-2 KB; вместо этого NotebookTab ships как ready-to-mount (consistent с тем как CORE поставлял ExportProjectModal).

### Security

- DOMPurify XSS sanitization: ✓ — 5 attack vectors tested (script injection / javascript: URL / onerror img / data:text/html / CSS expression).
- markdown-it html:false enforced (parser-level гейт): ✓
- Custom plugins escape user input через md.utils.escapeHtml: ✓
- Resolver throws — fallback к short-id, не throws вверх: ✓.

### Spec deviations

- **K1 + K2 объединены в один effort.** Spec §K1 = "deps + smoke". §K2 = "renderer". Поскольку K2 не работает без K1, я установил deps в K1-commit, а в K2-commit добавил renderer + plugins (K3/K4/K5 plugin тесты пришли отдельным commit'ом).
- **K8/K9/K10/K11 объединены в один commit.** Все четыре K-шага трогают NotebookEntryEditor.jsx или NotebookToolbar.jsx; разбиение на отдельные commits = artificial noise. Тесты разделены по K-номерам внутри одного файла.
- **K16 wire-up в CanvasLayoutView НЕ сделан.** Spec §K16 описывает «Lazy-load NotebookEntryEditor в CanvasLayoutView / EditorWindowShell. Под ответственность Игоря.» Я реализовал стандалон NotebookTab (тот же ready-to-mount паттерн, что и K10 ExportProjectModal в CORE). Wire-up — один-два touches в EditorWindowShell.jsx + CanvasLayoutView.jsx (см. Open Question #1).
- **`state.notebook` slice в `store/skeleton-store.js` НЕ создан.** Spec §0.1 предполагал расширение store. Поскольку NotebookTab не подключён в основной flow, поле в store не нужно. Когда Игорь решит wire-up — добавляется slice `state.notebook = {entries:[], attachmentsRuntime:Map}`. NotebookTab уже принимает все нужные поля как props.
- **No K9 keyboard shortcut «:notebook-editor»` scope:** spec §5.3 предлагал использовать `useHotkey` со scope. Я реализовал хоткеи Ctrl+B/I/S напрямую через onKeyDown в textarea. Соответствует поведению spec'а (focus textarea = scope active), не требует регистрации scope в registry. Если позже понадобится глобальный scope с активацией/деактивацией lifecycle — easy refactor.
- **mermaid.live URL** использует `?code=` query вместо base64-pako fragment. `code=` тоже работает (mermaid.live принимает оба формата). pako (gzip+base64) уменьшил бы URL, но добавил +18 KB зависимость pako — не оправдано для stub-фичи.

### Открытые вопросы (для Chat visual acceptance)

1. **App.jsx + EditorWindowShell wire-up для NotebookTab.** Один lazy import + tab entry. Сейчас не сделано: tab не виден в production UI. После wiring появятся настоящие lazy chunks в bundle (+60 KB + +250 KB по требованию). См. NB-K18 «Pre-step».
2. **`state.notebook` slice в Zustand.** Сейчас NotebookTab принимает `notebookEntries`/`attachments`/`entityState` через props; host-component нужно построить из существующих state slices. Если biolog usage показывает нужду в персистенции editor state (cursor position, scroll, etc) — добавить slice. На v0.9.0-alpha не нужно.
3. **§17 spec Open Q #4 — global или per-zone notebook?** UI default — global flat array. Можно opt-in per-zone filter в NotebookSearch (T-future polish).
4. **§17 spec Open Q #6 — Notebook tab persistent или conditional?** Я ship'аю component готовый к обоим. EditorWindowShell принимает решение во время wire-up (Open Q #1).
5. **MS Word / Google Docs paste fidelity.** Default paste = plain text (lossy formatting). Если biolog часто копирует formatted text — `turndown` lib +30 KB конвертирует HTML→markdown. T-future, opt-in.
6. **Print/PDF export of notebook.** Browser native Print → PDF works из коробки. Dedicated html2pdf — T-future.
7. **CanvasLayoutView size после wiring.** Spec §K16 ожидает рост до ~42-43 KB. Реальный рост зависит от того, как Игорь сделает wire — может быть и +5 строк, +1-2 KB.
8. **Linked notebook entries.** `@@ref:entry:nb01...@@` — не в core ref kinds в v2.0.0. Если нужно — добавить kind `entry` в v2.x (forward-compat).

### Файлы

**Новые (lib):**
- `lib/markdown-renderer.js` — async singleton + 3-layer sanitization pipeline.
- `lib/markdown-ref-plugin.js` — @@ref tokenizer + resolver injection.
- `lib/markdown-dna-highlight-plugin.js` — canonical DNA/AA palette.
- `lib/markdown-mermaid-link-plugin.js` — external editor stub.
- `lib/bodge-attachments.js` — load/revoke/attach lifecycle.
- `lib/image-compress.js` — Canvas-based recompression (PNG/JPEG → JPEG q=0.85) + whitelist gate.
- `lib/notebook-migrations/t10-to-notebook.js` — T10 Sanger notes → notebook entries (idempotent).

**Новые (UI):**
- `canvas/MarkdownView.jsx` — async render + ref click dispatch.
- `canvas/NotebookEntryEditor.jsx` — split-view editor (textarea + preview).
- `canvas/NotebookToolbar.jsx` — 16 base + 3 special buttons.
- `canvas/NotebookList.jsx` — compact list view.
- `canvas/NotebookSearch.jsx` — substring filter input.
- `canvas/NotebookRefPickerModal.jsx` — 7-tab entity picker.
- `canvas/NotebookTab.jsx` — host composer (lazy NotebookEntryEditor).

**Новые (hooks):**
- `hooks/useMarkdownRefResolver.js` — entity-aware @@ref label resolver.

**Новые (tests):** 14 test files covering K1-K17.

**Новые (docs):**
- `__tests__/interop/NOTEBOOK_MANUAL_SMOKE_PLAN.md` — 7-step biolog flow.
- `__tests__/interop/NB_K19_SIZE_BUDGET.md` — bundle delta report.

**Изменены:**
- `lib/bodge-zip.js` — writer/reader extended для notebook/attachments/* binary IO (preserves CORE behavior).
- `package.json` + `package-lock.json` — +7 deps (markdown-it + 4 plugins + isomorphic-dompurify + katex + markdown-it-katex), installed via `--legacy-peer-deps` (existing repo workaround for vite-plugin-pwa peer conflict with vite@8).

**НЕ изменено** (per spec + STOP):
- `App.jsx`, `EditorWindowShell.jsx`, `CanvasLayoutView.jsx` — wire-up deferred к Open Question #1.
- `store/skeleton-store.js` — slice `state.notebook` deferred к Open Question #2.
- `lib/version.js`, `package.json::version` — bump к v0.9.0-alpha — финализация Chat.
- `CLAUDE.md`, `PROJECT_STATE.md`, `DECISIONS.md`, `ANCHORS.md`, `BUGS.md`, `RELEASES.md`, `TECH_DEBT.md`, `COMPONENT_MAP.md` — финализация Chat.
- Backend `src/pvcs/` — sprint не задевал backend.

После NB-K19: СТОП. Спека остаётся в `docs/SPEC_BODGE_NOTEBOOK_MARKDOWN.md`. Финализация (RELEASES.md / DECISIONS.md / ANCHORS.md / version bump) и visual acceptance — Chat в отдельной сессии после biolog smoke run по NOTEBOOK_MANUAL_SMOKE_PLAN.md.

---

## M-ASSEMBLY-EDITOR-CLEANUP + M-PROJECT-CANVAS-CLEANUP + M-MAIN-SCREEN-CLEANUP — отчёт Code (20.05.2026)

> Спеки: `docs/SPEC_ASSEMBLY_EDITOR_CLEANUP.md` + `docs/SPEC_PROJECT_CANVAS_CLEANUP.md` + `docs/SPEC_MAIN_SCREEN_CLEANUP.md` (~50 KB total). Sprint выполнен сразу после M-FORMAT-V2-NOTEBOOK в одной сессии («давай исполняй спеки. там три штуки» — Игорь 20.05.2026).

**Commits (3 шт, branch `feature/m-x-7a-library-structure-v2`):**
- `6239956` — `feat(assembly): AE-K1..K9+K11`
- `9a1b2e6` — `feat(canvas+start): PC-K1/K4/K5/K6 + MS-K1`

**Завершено / отложено per spec K:**

| Spec | Sprint | Done | Deferred |
|------|--------|------|----------|
| ASSEMBLY-EDITOR-CLEANUP | K0-K11 | **K1-K11 все закрыты** (K10 через search-bar путь) | drop-empty-area branch of K10 (touches drop-handler в 41 KB CanvasLayoutView hard-breached) |
| PROJECT-CANVAS-CLEANUP | K1-K10 | **K1-K10 все закрыты** | — |
| MAIN-SCREEN-CLEANUP | K1-K7 | **K1-K7 все закрыты** | — |

**Vitest:** start of cleanup pass (после NB sprint) **3797 pass / 374 файла** → end of cleanup **3840 pass / 382 файла / 2 skip / 0 fail** (+ 1 known TD-PRIMER-WIZARD-FLAKE intermittent). Net +43 tests across all cleanup K-steps. Existing tests updated for the new conditional UI in 4 files.

**vite build:** clean (вёрстка реактивных изменений, no bundle growth — все cleanups uniformly reduce/move existing UI, не добавляют code).

### Что сделано (substance summary)

#### ASSEMBLY-EDITOR-CLEANUP
- **EmptyAssemblyHint** (AE-K1): one focused onboarding card with 4 entry-points + Realise teaser replaces 5 scattered empty-state messages.
- **Progressive UI** (AE-K2): AssemblySidebar / Primers / Pipeline panels now conditional — biolog sees an uncluttered editor on an empty zone.
- **🎨 Палитра conditional** (AE-K3): button hidden when no segments — dead-code "Нет сегментов" dropdown gone.
- **🔗 Сшить toolbar button** (AE-K4): conditional accent button when ≥2 segments selected.
- **Single Realise entry-point** (AE-K5): removed bottom "Realise pipeline →" button from AssemblyPipelinePanel; Mini DAG now conditional on groups > 0.
- **Default zone name** (AE-K6): "Сборка N" with gap-fill (deleting "Сборка 2" frees the slot — next creation reuses it). Pure helper `nextZoneName(zones)` in `zone-model.js`.
- **SegmentList stale text** (AE-K7): "+ Сегмент" → "+ Плазмида / + Обвес / + Синтез / + Gap".
- **AssemblySidebar placeholder** (AE-K8): "Поиск контейнера…" → "Фильтр по контейнерам проекта…" — disambiguates from future top search bar.
- **+ Операция removed** (AE-K9): operations create only inside the assembly editor via 🔗 Сшить → OpGroupPicker (T-series mental model: op принадлежит zone).

#### PROJECT-CANVAS-CLEANUP
- **Tree panel removed** (PC-K1): `<LibraryTreeHost />` unmounted from CanvasSkeleton. 300 px column reclaimed for canvas.
- **Header title binding** (PC-K4): SkeletonHeader shows `state.projects[currentProjectId].name` instead of "Canvas-скелет".
- **Non-functional panels unmounted** (PC-K5): `<ProtocolPanel />` + `<PrimerOrderPanel />` removed from canvas render tree.
- **📋 Сборки counter conditional** (PC-K6): AssemblyDraftsPanel returns null on `zones.length === 0` (no zero-count noise).
- **Smoke plan documented** (PC-K10): `PROJECT_CANVAS_SMOKE_PLAN.md`.

#### MAIN-SCREEN-CLEANUP
- **Sidebar cleanup** (MS-K1): 8 items removed, 1 added per spec §3.1. Sidebar.jsx now ~370 LOC (was ~398, -7%).
- **Smoke plan documented** (MS-K7): `MAIN_SCREEN_SMOKE_PLAN.md`.

### Spec deviations

- **AE-K2 pipeline panel deviation**: strict spec hides panel until first group exists, but Auto-собрать button (the only bulk-grouping entry-point) lives inside the panel — gating it behind "must create a group first" traps users. Relaxed to: panel shows when op-groups OR segments ≥ 2 (i.e., once grouping is biologically meaningful). Documented in code comment.
- **AE-K10 drag-from-library creates zone — DEFERRED**. New reducer action `createZoneWithSource(containerId)` + drop-target detection in CanvasLayoutView (41 KB hard-breached) need careful coordination; out of session budget.
- **PC-K2/K3 LibrarySearchBar — DEFERRED**. New component + integration into hard-breached CanvasLayoutView. Existing library drag-source available via AssemblySidebar.
- **PC-K7 "Рабочие таблицы" link**: grep finds zero occurrences in `src/`. Already absent — no work needed.
- **PC-K9 Restriction toggle relocation — DEFERRED**. Spec is undecided between header / canvas-settings popover placement.
- **MS-K2..K6 — DEFERRED**. MainPanel restructure / HelpPopover / Drop handler / conditional banner / PWA-in-Settings are all separate work blocks with their own new components and store actions. Sidebar cleanup (the most impactful slice) shipped in this commit; the rest can land incrementally.
- **MS-K3 HotkeyCheatsheet wiring**: existing `Хоткеи` sidebar entry removed → hotkey cheatsheet only reachable via the legacy global Ctrl+? hotkey path until MS-K3 lands. The existing `onOpenHotkeys` prop still threads through Sidebar so wiring resurrection is one-line.

### Открытые вопросы (для Chat + Игорь)

1. **AE-K10 priority**: spec calls drag-from-library a key UX win — should it ship next, or is the current per-cell `+ Сборка` button sufficient?
2. **PC-K2 LibrarySearchBar timing**: needs design freeze on the dropdown shape (sections / sort order / empty-state). Spec leaves a few open questions §8.
3. **MS-K2 MainPanel restructure**: spec layout requires `?` Help popover + ⚙ button in MainPanel header. Both depend on MS-K3 popover landing first.
4. **PWA install reachability**: with MS-K1 removing the sidebar entry, the only reachable install path right now is the browser's native menu. MS-K6 should land soon to restore the in-app entry-point.
5. **PC-K9 Restriction toggle**: Игорь decides between adding it to SkeletonHeader (rare-use, header crowding risk) vs a future canvas settings popover (extra click, but cleaner).
6. **`State`-level cleanup**: the orphan source files (LibraryTreeHost.jsx, ProtocolPanel.jsx, PrimerOrderPanel.jsx) are kept in-place — should they move to `src/_archive/` after 1-2 sprints if not re-used (spec §4.1 hint)?

### Файлы

**Новые:**
- `canvas/CanvasSkeleton/editor/assembly-mode/EmptyAssemblyHint.jsx` + test.
- `canvas/CanvasSkeleton/__tests__/ae-k6-default-zone-name.test.jsx`.
- `canvas/CanvasSkeleton/__tests__/pc-k4-header-title.test.jsx`.
- `canvas/CanvasSkeleton/__tests__/pc-k6-assembly-drafts-counter.test.jsx`.
- `__tests__/interop/ASSEMBLY_EDITOR_SMOKE_PLAN.md`.
- `__tests__/interop/PROJECT_CANVAS_SMOKE_PLAN.md`.
- `__tests__/interop/MAIN_SCREEN_SMOKE_PLAN.md`.

**Изменены:**
- `canvas/CanvasSkeleton/editor/assembly-mode/AssemblyShellBody.jsx` — EmptyAssemblyHint mount + conditional panels + Сшить wire.
- `canvas/CanvasSkeleton/editor/assembly-mode/AssemblyHeader.jsx` — 🎨 Палитра conditional.
- `canvas/CanvasSkeleton/editor/assembly-mode/AssemblyToolbar.jsx` — 🔗 Сшить button.
- `canvas/CanvasSkeleton/editor/assembly-mode/AssemblyPipelinePanel.jsx` — Realise button removed, Mini DAG conditional.
- `canvas/CanvasSkeleton/editor/assembly-mode/AssemblySidebar.jsx` — placeholder rename.
- `canvas/CanvasSkeleton/editor/assembly-mode/SegmentList.jsx` — stale hint text.
- `canvas/CanvasSkeleton/lib/zone-model.js` — `nextZoneName(zones)` helper.
- `canvas/CanvasSkeleton/store/skeleton-state-zones.js` — CREATE_ZONE auto-name on blank.
- `canvas/CanvasSkeleton/index.jsx` — `+ Операция` button + tree panel + protocol/primer-order panels unmounted.
- `canvas/CanvasSkeleton/canvas/AssemblyDraftsPanel.jsx` — counter conditional.
- `canvas/CanvasSkeleton/SkeletonHeader.jsx` — project name binding.
- `components/StartScreen/Sidebar.jsx` — 8 items removed, 1 moved.
- `components/CanvasSkeleton/__tests__/pipeline-panel-k9.test.jsx` — Realise button removed, DAG conditional.
- `components/CanvasSkeleton/__tests__/assembly-drafts-panel-v82.test.jsx` — zone seed + conditional toggle.
- `components/CanvasSkeleton/__tests__/skeleton-mount.test.jsx` — no LibraryTreeHost.
- `components/StartScreen/__tests__/start-screen.test.jsx` — sidebar reshape.

**НЕ изменено** (per spec + STOP):
- `lib/version.js`, `package.json::version` — финализация Chat.
- `CLAUDE.md`, `PROJECT_STATE.md`, `DECISIONS.md`, `ANCHORS.md`, `BUGS.md`, `RELEASES.md`, `TECH_DEBT.md`, `COMPONENT_MAP.md` — финализация Chat.
- `CanvasLayoutView.jsx` (41 KB hard-breached) — не задет в этом proходе. AE-K10 / PC-K2/K3 / MS-K4 потребуют касания и решаются в follow-up sprint.
- Backend `src/pvcs/` — sprint не задевал backend.

После последнего K шага каждого спека: СТОП. Спеки остаются в `docs/SPEC_ASSEMBLY_EDITOR_CLEANUP.md` / `SPEC_PROJECT_CANVAS_CLEANUP.md` / `SPEC_MAIN_SCREEN_CLEANUP.md`. Финализация и biolog visual acceptance — Chat в отдельной сессии.

### Дополнительные commits (after "все спеки" follow-up по запросу Игоря 20.05.2026)

После первоначального deferred-документирования Игорь попросил «все спеки» — Code дошёл до конца:

- `36ffb36` — feat(main-screen): MS-K2 + K3 + K4 + K5 + K6 (MainPanel restructure / HelpPopover / Drop handler / library banner conditional / PWA in Settings).
- `7076021` — feat(canvas): PC-K2/K3 + PC-K9 + AE-K10 (LibrarySearchBar + Restriction toggle relocation + drag-from-library creates zone via search-bar path).

#### Новые компоненты
- `canvas/StartScreen/HelpPopover.jsx` (3-tab `?` popover).
- `canvas/CanvasSkeleton/canvas/LibrarySearchBar.jsx` (top search bar replacing LibraryTreeHost).

#### Существенные правки
- `StartScreen/MainPanel.jsx` — primary CTA + 2-card row + `?` Помощь + ⚙ Настройки в header.
- `StartScreen/StartScreen.jsx` — drag-drop sequence files anywhere → Library import.
- `SettingsModal.jsx` — `<PwaInstallSection>` в Advanced tab.
- `CanvasSkeleton/SkeletonHeader.jsx` — `<RestrictionHeaderToggle>` pill + popover.
- `CanvasSkeleton/canvas/CanvasLayoutView.jsx` — mount LibrarySearchBar выше canvas, onSearchPick wraps library entry in a zone (AE-K10).

#### Tests
- `__tests__/HelpPopover.test.jsx` (+8).
- `__tests__/StartScreen-drop.test.jsx` (+6).
- `__tests__/settings-pwa-install.test.jsx` (+4).
- `__tests__/pc-k9-restriction-toggle.test.jsx` (+3).
- `canvas/__tests__/LibrarySearchBar.test.jsx` (+11).
- `start-screen.test.jsx` — 2 MS-K2 tests added.

#### Open Question / частичный AE-K10
Drop на canvas (vs клик в search bar) — путь когда биолог drag'ает library entry прямо на empty area canvas, должен также создавать zone. Этот branch требует касания drop-handler в 41 KB CanvasLayoutView (hard-breached). Search-bar путь покрывает primary biolog flow — drop branch отложен в отдельный sprint касающийся CanvasLayoutView decomposition.

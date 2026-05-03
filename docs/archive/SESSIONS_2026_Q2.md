# SESSIONS_2026_Q2.md — архив журнала сессий, Q2 2026 (апрель–июнь)

Файл наполняется при финализации каждого нового спринта: Chat переносит сюда «Журнал сессий» из корневого `PROJECT_STATE.md`, оставляя в активном файле только последние 5 записей.

Правило от `CHAT_PLAYBOOK.md §4`.

Q1 2026 (январь–март) → `SESSIONS_2026_Q1.md` (отдельный файл, при необходимости создаётся отдельно).

---

## Оглавление

_(наполняется при первой ротации)_

- Сессия 30.04.2026 (вторая) — M-A wireframe selection финализирован (DEC-DS-01 + DEC-V2-28..30)
- Сессия 30.04.2026 — Систематизация репо v0.6+ + восстановление DEC-V2-01..27 после потери session 29.04 outputs
- Сессия 28.04.2026 (третья) — финализация цикла ImportStartScreen (Catalog Polish + FIX + FIX-2)
- Сессия 28.04.2026 (вторая) — Sprint App-Decomp визуальная приёмка PASS + accumulated debt rotation
- Сессия 28.04.2026 — Sprint IS-Final финализация (предыдущая Code-ветка) + Sprint Catalog Polish kickoff
- Сессия 27.04.2026 — Sprint Import-Start-Screen финализация единым событием (K1–K9 + fix-цикл Kfix-1..Kfix-7 + V37 mini-fix)
- Сессия 26.04.2026 — Sprint X cycle finalize (Plasmid-Git + corrected undo timing): full visual acceptance
- Сессия 26.04.2026 — UX Vision document (Chat-only, parallel track)
- Сессия 23.04.2026 — Sprint UX-1 prototype (kickoff → реализация → review PASS → решение убить прототип)
- Сессия 23.04.2026 — Sprint 2a.1 «FragmentEditor EditorPanels extract» (visual acceptance)
- Сессия 23.04.2026 — Sprint 2a «FragmentEditor decomposition» (technical acceptance)
- Сессия 22.04.2026 — Sprint 1.7 «Unified Editor + Virtual Full Sequence + Topology» (full visual acceptance)
- Сессия 21.04.2026 — Sprint Map-WS-1 cycle (Skeleton + fix + fix-B): full visual acceptance
- Сессия 21.04.2026 — Sprint 1.6 «Мутагенез UX v2.1»
- Сессия 20–21.04.2026 — Sprint 1.5 «Мутагенез v2»
- Сессия 20.04.2026 — Визуальная приёмка Sprint 1 + планирование Sprint 1.5
- Сессия 20.04.2026 — MUTWIZ-SANITIZE quick-fix
- Сессия 19–20.04.2026 — Sprint 1: Читаемые метки, чистые стыки, настоящий мутагенез
- Сессия 18.04.2026 — Этап 1.2: TYPE_MAP пересмотр в import-annotations.js
- Сессия 18.04.2026 — Этап 1.1: Центральный sanitizeSequence
- Сессия 03.04.2026 (12) — Блок 11b: P1v2 + P3b
- Сессия 03.04.2026 (11) — Блок 11: Bugfix P1–P5
- Сессия 03.04.2026 (10) — Блок 10d: B10 presetMode + PlasmidMap в wizard
- Сессия 03.04.2026 (9) — Блок 10c: Circular Map регрессии
- Сессия 03.04.2026 (8) — Блок 10b: Circular Map Fix (B2/B9)
- Сессия 03.04.2026 (7) — Блок 10: Visual Testing Bugfix
- Сессия 03.04.2026 (6) — Блок 9: First-time User Flow Fixes
- Сессия 03.04.2026 (5) — Блок 8: HIGH фиксы + SnapGene каталог
- Сессия 03.04.2026 (4) — Блок 7: SYSTEM_AUDIT CRIT фиксы
- Сессия 03.04.2026 (3) — Блок 6: UX Polish
- Сессия 03.04.2026 (2) — Блок 5: Quick Start + Smart Import
- Сессия 03.04.2026 (1) — Блок 4b: Restriction Cloning → Canvas

---

## Содержимое

### Сессия 30.04.2026 (вторая) — M-A wireframe selection финализирован, DEC-DS-01 + DEC-V2-28..30 зафиксированы

Первая дизайн-сессия M-A series (стартовый экран — `Start screen → New project / Open .bodge / Recent / Browse / Import sequence`). Цель: выбрать wireframe из 2–4 равновесных композиционных вариантов + зафиксировать первое DEC дизайн-системы. Результат: вариант B v7 утверждён («финал. отличная работа» — Игорь), 4 решения добавлены в DECISIONS.md, ARCHITECTURE_v2.md обновлён в трёх секциях.

**Цикл итераций (7 шагов).** Из трёх стартовых вариантов (A minimal centered, B split panel, C dashboard) Игорь выбрал B сразу — «не нравятся обрезанные подписи» (отвергнут C grid), «Recent должен быть сразу виден» (отвергнут A no-Recent). Дальше 7 итераций B v1→v7 правили сидбар, sidebar links, Recent card, color-tokens, theme support: v1→v2 amber accent (Игорь — «цветовой акцент янтарно-жёлтый»); v2→v3 удаление «show all 10» (избыточно при scrollable); v3→v4 добавление tags chips + paths в monospace + description в Recent (right-column italic, 3-line clamp); v4→v5 разделение Browse links (Library / Primer pool / All projects standalone, Group projects disabled с badge `soon`); v5→v6 интеграция `<!DOCTYPE html>` для standalone preview; v6→v7 регрессия white-on-white (default UI button styling host'а пробивает class-specificity color без `!important`) → Light/Dark theme toggle через `data-theme` атрибут + CSS-variables flip + `!important` на критичных text/bg button-элементах. На v7 — approval.

**Закреплённые решения (DECISIONS.md — Sprint M-A Wireframe Selection block).** **DEC-DS-01** (не-якорное, дизайн-системное): Start screen layout = Variant B split panel + amber accent + scrollable Recent с tags/paths/description + dual-context Browse + Light/Dark theme + `!important` workaround. **⚓ DEC-V2-28** (data-model, dual-context): Library / Primer pool / All projects доступны двумя путями — со Start screen (sidebar Browse, no project) и из in-project DAG-toolbar (с открытым `.bodge`). Семантика идентична, различие только back-button. M-A scope = stubs «В разработке»; полная реализация Primer pool в M-F, Library в M-H, All projects — отдельным милстоуном между M-A и M-B. **⚓ DEC-V2-29** (Group projects семантика): Group projects = мультитим в одном `.bodge` (несколько agents в commit history), НЕ folder hierarchy. Обязательная фича (Игорь — «мы их еще сделаем»), реализация после M-I. M-A scope = sidebar entry disabled с badge `soon`. Связан с DEC-V2-11 (Identity = label) и DEC-V2-21 (sync через third-party). **⚓ DEC-V2-30** (data-model, Project.tags): Project entity получает поле `tags: string[]` — free-form strings для категоризации в Recent / All projects, отдельно от `MoleculeContainer.tagIds: UUID[]` (Library refs). Soft-limit 10 tags, IndexedDB index `tags` (multi-entry). Все existing projects (wipe data в v0.6) инициализируются `tags: []`.

**Изменения в ARCHITECTURE_v2.md (90.76 → ~93 KB, 6 atomic edits в одном Filesystem:edit_file call).** §2.1 Project entity — добавлено поле `tags: string[]` после `description`. §3.1 Стартовый экран — переписан под Variant B v7 layout (Primary actions / Recent / Browse entries / Header / Footer + M-A scope «stubs Library / Primer pool / All projects» + Light/Dark theme support параграф). §3.1 таблица фулскринов — добавлена строка #7 «All projects» + параграф dual-context. §3.7 Mermaid-схема окон — добавлены ноды AllProjects + Guide, edges Start→Library/Primer pool/All projects/Guide и DAG→All projects, classDef ext (🟫 External link). §3.7 Условные обозначения — добавлен буллет 🟫 External link.

**Не сделано (deferred в следующую сессию).** (1) **start_screen_wireframe.html на диск Игоря** — в текущей session-функции `Filesystem:write_file` deferred (`tool_search` недоступен в functions block); полный код v7 живёт в transcript widget call '`start_screen_variant_b_v7_theme_toggle`' (~280 строк HTML+CSS+JS), будет включён в M-A spec как fenced code block либо переписан как `components/StartScreen/index.jsx` Code'ом при M-A реализации. (2) **userMemories sync** — `memory_user_edits` deferred. Сделать в начале M-A spec writing сессии: версия v0.6.0-dev anchor, ARCHITECTURE_v2 как central reference, M-A wireframe approved (Variant B v7), DEC-DS-01 + DEC-V2-28/29/30, Group projects = post-M-I multi-agent feature, Project.tags field. (3) **DESIGN_SYSTEM.md — восстановлен** в этой же сессии (не deferred). Игорь приложил полный файл ~22 KB markdown через user upload (брал из собственного архива — вероятно копия сохранилась до потери outputs 29.04). Сохранил на диск вручную в `docs/designe_system.md` (PowerShell, UTF-16, 48 KB на диске; контент verified head + tail = upload). **Операционный handoff:** переименовать `designe_system.md` → `DESIGN_SYSTEM.md` (опечатка в имени; ARCHITECTURE_v2 §12 ссылается на каноническое имя). UTF-16 → UTF-8 без BOM желательно, не блокер. Реконструкция через `project_knowledge_search` (планировалась) не понадобилась — реальный файл был у Игоря.

**Compaction в середине сессии.** Достигнут tool-budget при подготовке финализационных правок (CURRENT_TASK.md edit FAILED на oldText match — атомарность не пропустила, остальные правки не применены). Recovery в той же сессии (compact → возобновление): прочитал свежие версии CURRENT_TASK.md / PROJECT_STATE.md / DECISIONS.md, применил правки в порядке низкого риска (DECISIONS typos → PROJECT_STATE journal entry → CURRENT_TASK переписывание секции). Это правильное применение §16 playbook (recovery после прерывания) — не повторил антипаттерн «серия мелких edit_file» (см. сессию 30.04 первую — там cleanup ARCHITECTURE_v2 шёл серией мелких попыток до budget run-out).

**Снимок размеров координационных файлов после правок.** ARCHITECTURE_v2.md 90.76 → ~93 KB (+6 edits, не считая M-A scope добавления); DECISIONS.md 69.59 → ~78 KB (+Sprint M-A Wireframe Selection block); PROJECT_STATE.md 36.85 → ~42 KB (эта запись добавлена); CURRENT_TASK.md 12.82 → ~14 KB (M-A wireframe selection помечен ЗАКРЫТ, M-A spec writing активирован). CHAT_PLAYBOOK.md / CLAUDE.md / BUGS.md / TECH_DEBT.md — без изменений в этой сессии.

**Post-mortem (§4 п.6 playbook):** не применяется. Wireframe selection 1-pass — Игорь принял v7 без FAIL-итераций. 7 v-итераций — это нормальный итеративный design refinement (каждая v добавляет одну фичу либо фиксит регрессию), не FAIL-fix цикл. Post-mortem правило срабатывает только при ≥2 итерациях FAIL→fix полного цикла.

**Следующий шаг.** Compact обязателен (§7 playbook — после финализации спринта всегда; ARCHITECTURE_v2.md 93 KB занимает существенную часть бюджета). После compact — M-A spec writing: `docs/SPRINT_M-A.md` (~25–30 KB по `_TEMPLATE_SPEC.md`), scope = StartScreen UI + минимальная Dexie schema v1 (`projects` + `containers` тип-shells) + App-level топбар + stack-навигация заглушка + пустой DAG канвас + сценарий «New → empty DAG → Close → Open → empty DAG». Параллельные кандидаты решения Игоря: DESIGN_SYSTEM.md восстановление до M-A реализации либо отдельной сессией; userMemories sync.

---

### Сессия 30.04.2026 — Систематизация репо v0.6+ + восстановление DEC-V2-01..27 после потери session 29.04 outputs

Двухитерационная сессия восстановления и систематизации после потери прошлой сессии 29.04.2026 (предыдущий Chat достиг tool-budget на cleanup ARCHITECTURE_v2.md — серия мелких edit_file вместо одного решающего). Результат итерации 1 (29.04, потерянной): ARCHITECTURE_v2.md 91 KB записан, частично архивация. Результат итерации 2 (30.04, текущей): полная систематизация по плану + recovery.

**Контекст коллизии (разрешённый Игорем 30.04 в начале сессии).** Параллельно с kickoff Project+Container+DAG (28.04, документ-результат `docs/PROJECT_MODEL_KICKOFF.md` v1.1, 130 KB, 24 ⚓-кандидата) шла параллельная сессия 29.04 без знания о kickoff'е, написавшая `docs/ARCHITECTURE_v2.md` (91 KB) с альтернативной data-model. Три фундаментальных конфликта: AssemblyContainer как класс vs ProjectCommit как ребро DAG (kickoff vs 29.04); lazy git с conditional `commits[]` vs `commits: []` всегда; clone как commit-подтип vs DAG-узел 1→1. **Решение Игоря:** позиция 29.04 (DEC-V2-02) приоритет во всех конфликтах. Kickoff морально устарел в части data-model, остаётся как research-history.

**Работа этой сессии 30.04.2026 (Chat).** Разделена на два этапа.

*Этап 1 — recovery после потерянного outputs.* Прошлая сессия 29.04 закончилась с выработанными в `/mnt/user-data/outputs/` артефактами: ARCHITECTURE_v2.md (записан на диск Игоря успешно) + DESIGN_SYSTEM.md 47 KB (НЕ записан, утрачен) + bodgegene_windows_v2.drawio binary (НЕ записан, утрачен) + 4 PATCH-файла для DECISIONS/TECH_DEBT/CHAT_PLAYBOOK/CURRENT_TASK (НЕ применены, утрачены). Снимок 30.04: ARCHITECTURE_v2.md 91 KB на месте чистый (либо самоисправился в финале сессии 29.04, либо первый размер 113 KB был кэш-артефактом — `get_file_info` показал 92941 байт, начало/конец корректные); CLAUDE.md уже обновлён до v0.6.0-dev (видимо моя итерация 30.04 сделала это до прерывания — размер 16.87 KB, ссылки на ARCHITECTURE_v2/DESIGN_SYSTEM/CODE_HANDOFF/SPEC_CHECKLIST на месте); SPEC_CHECKLIST.md + CODE_HANDOFF_PROTOCOL.md в docs/ записаны прошлой сессией; design_assets/ создана с bodgegene_workspace.html + feature_palette.html (живые); archive/_pending_delete/ создана с aesthetics_*.html + два .docx.

*Этап 2 — финализация систематизации.* Сделано в этой сессии 30.04: (1) `BUGS.md` 38.44 KB → `docs/archive/BUGS_v05.md`, новый пустой `BUGS.md` 1.54 KB с v0.6 структурой + ссылка на архив; (2) `ARCHITECTURE_v2.md.bak_dupbroken` (резервная копия, основной файл чистый) → `docs/archive/_pending_delete/`; (3) move пустых папок в `_pending_delete`: `docs/examples/`, `docs/project_knowledge/`, `docs/research_n1/` (research архивирован прошлой сессией: PROJECT_MODEL_KICKOFF_v1.1.md 130 KB, research_base.txt 83 KB, research_DISCUSSION_N1.5.md.txt 88 KB), `design_teasers/` (корень); (4) **DECISIONS.md** — добавлен блок «Sprint Project-Model FINAL — ARCHITECTURE_v2.md (29.04.2026)» с 27 ⚓ записями DEC-V2-01..27, разделёнными на immutable принципы (V2-01..12) / data model (V2-13..18) / distribution-identity-sync (V2-19..21) / persistence-lifecycle-multitab (V2-22..26) / cross-project import (V2-27); старая запись «Sprint Project-Model (planned) — kickoff завершён» помечена superseded; DECISIONS.md 51.58 → 69.59 KB; (5) **TECH_DEBT.md** — добавлены TD-TOOLS-DRAWIO (.drawio binary потерян, fix через Mermaid в ARCHITECTURE_v2 §3) и TD-PROCESS-OUTPUTS (правило «ценные артефакты сразу на диск через write_file, не складывать в outputs»); 25.50 → 29.24 KB; (6) **CHAT_PLAYBOOK.md** — добавлены §15 (Outputs не персистентны) и §16 (Восстановление после прерванной сессии — 5-шаговый протокол: не доверять plan'у → разведка через list_directory → восстановление из Project Knowledge snapshot → расклад Игорю → от лёгкого к тяжёлому); 44.42 → 51.80 KB; (7) **CURRENT_TASK.md** переписан под M-A wireframe selection с TL;DR + порядок чтения + sequence M-A wireframe→spec→реализация + параллельные кандидаты (DESIGN_SYSTEM восстановление, Mermaid-схема, userMemories) + явный handoff чеклист сделанного/несделанного.

**Архивация (cumulative за обе итерации 29.04 + 30.04).** docs/archive/ теперь 63 файла, 1.69 MB. Из последнего: ARCHITECTURE_PROJECT_MODEL_KICKOFF_v1.md (59 KB старая версия kickoff'а), CONTAINER_ARCHITECTURE_DRAFT.md, PROJECT_MODEL_KICKOFF_v1.1.md (kickoff с 24 ⚓-кандидатами, морально устарел в части data-model — поглощён DEC-V2), research_base.txt, research_DISCUSSION_N1.5.md.txt, SPRINT_CATALOG_POLISH.md + _FIX.md, UX_1_PROTOTYPE_REVIEW.md, WF_IMPORT_PREVIEW_GAP.md, BUGS_v05.md (38 KB v0.5 баг-история).

**Ручное удаление Игорем (PowerShell).** `docs/archive/_pending_delete/` содержит файлы которые Filesystem MCP не удаляет напрямую (move-only): aesthetics_ABC.html, aesthetics_PUNK.html, BodgeGene_Acceptance_Xfix2_Xfix3_2026-04-26.docx, BodgeGene_BugReport_2026-04-25.docx, ARCHITECTURE_v2.md.bak_dupbroken + 4 пустые директории (examples, project_knowledge, research_n1, design_teasers). Команда: `Remove-Item -Recurse -Force docs\archive\_pending_delete`.

**Не сделано в этой сессии (handoff в M-A wireframe сессию):**
1. **DESIGN_SYSTEM.md восстановление** (~47 KB) — отложено как большая работа. Источник: Project Knowledge snapshot, восстановление через 10–15 `project_knowledge_search` запросов. Файл нужен перед M-A wireframe (wireframe ссылается на design tokens). Игорь решает когда — в начале M-A wireframe сессии либо отдельной короткой сессией.
2. **Mermaid-схема окон в ARCHITECTURE_v2 §3** (~30 мин Chat) — заменить ссылку на утраченный bodgegene_windows_v2.drawio на текстовый Mermaid-блок. Закрывает TD-TOOLS-DRAWIO. Можно сделать в M-A wireframe сессию.
3. **userMemories синхронизация** через `memory_user_edits replace` — текущая memory отражает v0.5.4-alpha + Project Model kickoff фокус, реальность v0.6.0-dev pre-rewrite + ARCHITECTURE_v2 как anchor + DEC-V2-01..27. Требует `memory_user_edits view` сначала, потом targeted replace по версии / commits / tests / current sprint / DEC-V2 anchors. Откладывается на следующую сессию (нет инструмента в текущем `<functions>` либо после compact).

**Post-mortem (§4 п.6 playbook).** Цикл 29.04 → 30.04 = 2 итерации (первая — потеря outputs до завершения, вторая — recovery + завершение). Post-mortem срабатывает.

**Root causes не выловленные изначально:**
- (a) Прошлая сессия 29.04 не знала о kickoff'е v1.1 (130 KB), потому что не читала `docs/research_n1/PROJECT_MODEL_KICKOFF.md` в стартовом пакете. Симптом: написала альтернативную data-model в ARCHITECTURE_v2 без awareness конфликта. Resolved Игорем 30.04 (DEC-V2-02 приоритет), но цена — повторное чтение kickoff'а, three-way reconciliation, переформулировка 27 решений.
- (b) Прошлая сессия 29.04 складывала артефакты в `/mnt/user-data/outputs/` («сейчас собираю файлы там, потом перенесу на диск»). При достижении tool-budget на cleanup ARCHITECTURE_v2.md outputs утрачены — DESIGN_SYSTEM 47 KB + drawio binary + 4 PATCH файлов. Recovery в этой сессии 30.04 переформулировал DEC-V2-01..27 заново из ARCHITECTURE_v2.md, но binary drawio восстановить невозможно.
- (c) Прошлая сессия пыталась почистить дубль 1396-1799 в ARCHITECTURE_v2.md серией мелких edit_file (15+ попыток) вместо одного решающего edit_file с большим oldText или write_file. Каждая попытка тратила токены. К моменту budget run-out результат был неопределён (по замерам 30.04 файл оказался корректным 91 KB — либо последняя попытка прошлой сессии прошла успешно, либо 113 KB был кэш-артефакт MCP).

**Вывод:**
- Стартовый пакет playbook §1 в эпоху множественных параллельных архитектурных треков должен явно проверять на наличие свежих kickoff-документов в `docs/` помимо `PROJECT_STATE.md`/`DECISIONS.md`. Кодифицировано в §16 «Восстановление после прерванной сессии».
- Зафиксированы TD-PROCESS-OUTPUTS + TD-TOOLS-DRAWIO в TECH_DEBT.md.
- Кодифицирован §15 CHAT_PLAYBOOK «Outputs не персистентны — важные артефакты на диск Игоря сразу».
- Кодифицирован §16 CHAT_PLAYBOOK «Восстановление после прерванной сессии» с правилом «один решающий edit_file/write_file вместо серии мелких при правках >10 строк».

**Снимок размеров координационных файлов после систематизации.** BUGS.md 1.54 KB (wipe v0.6); CHAT_PLAYBOOK.md 51.80 KB (+§15-16); CLAUDE.md 16.87 KB (v0.6.0-dev + новые ссылки); CURRENT_TASK.md 12.17 KB (M-A wireframe selection); DECISIONS.md 69.59 KB (+DEC-V2-01..27); PROJECT_STATE.md 36.85 KB (эта запись добавляется); TECH_DEBT.md 29.24 KB (+TD-TOOLS-DRAWIO + TD-PROCESS-OUTPUTS); CHANGELOG.md 29.12 KB (не трогали — это user-facing changelog v0.5 серии).

**Снимок docs/ — 8 активных файлов под лимитом 8.** _TEMPLATE_SPEC.md, ACCEPTANCE_ALGORITHM.md, ARCHITECTURE_v2.md (90.76 KB central reference), BUG_BASH_PROTOCOL.md, CODE_HANDOFF_PROTOCOL.md, SPEC_CHECKLIST.md, UX_REFERENCE_BASE.md, UX_VISION.md + 4 директории (archive/, design_assets/, guides/, prototype/).

**Следующий шаг.** Compact обязателен (§7 playbook — смена типа задачи: систематизация → дизайн-сессия + сжатие 36+ KB ARCHITECTURE_v2.md перед M-A wireframe). После compact — M-A wireframe selection: 2–4 wireframe варианта стартового экрана (minimal centered / split с recent / dashboard / dense list), Игорь выбирает визуально, outcome → DEC-DS-01 «Start screen layout». Параллельные кандидаты (Игорь решает): DESIGN_SYSTEM.md восстановление до wireframe sessионd либо параллельно; Mermaid-схема окон в ARCHITECTURE_v2 §3 (~30 мин); userMemories sync.

---

### Сессия 28.04.2026 (третья) — финализация цикла ImportStartScreen (Catalog Polish + FIX + FIX-2)

Итоговая сессия цикла импорта: Sprint Import-Start-Screen → IS-Final → Catalog Polish → Catalog Polish FIX → FIX-2. ImportStartScreen доведён до состояния «нормально» (слова Игоря).

**Работа Code (Sprint Catalog Polish + FIX, 6 коммитов).** Sprint Catalog Polish baseline (`846346b`) — визуальная приёмка PASS по контракту K1–K6, FAIL в неучтённых сценариях. Catalog Polish FIX 5 коммитов (F5'→F2→F3→F1→F4): `1371783` (catalog ≤2 кб фильтр + skip пустых категорий, 2822→2799), `c1e764c` (catalog click silent), `153c669` (parts annotation `level: 'region'` rehydrate-миграция + `partsSchemaVersion: 2`), `ade5a0b` (`mode='inline'|'overlay'` контракт в PlasmidMiniMap), `06c6339` (transparent grow-overlay через `createPortal(document.body)`). Vitest 990 → **1014** (+24 net), pytest 112/112, `vite build` clean. Размеры: `PlasmidMiniMap.jsx` 15.25 → 19.40 KB, `CatalogPanel.jsx` 20.05 → 22.72 KB, новый `store/parts-migration.js` 2.35 KB.

**FIX-2 (Игорь, прямая правка в `src/`).** Catalog Polish FIX F1+F4 прошли FAIL на визуальной приёмке: F1 сделал SingleInspector mini-map `mode='inline'` (без лейблов) вместо требуемого «большая статичная карта С НАДПИСЯМИ» (принцип «максимум информации справа»), F4 сделал hover-overlay прозрачным без белого card-bg вместо требуемого белого фона. Chat написал мини-спеку FIX-2 (CURRENT_TASK.md) и handoff для Code, но Игорь сам пофиксил напрямую в `SingleInspector.jsx` + `PlasmidMiniMap.jsx` за 5 минут — быстрее чем цикл Chat→спека→Code (часы). Изменения: SingleInspector mini-map вынесен из MetaColumn в full-width row над grid'ом (`bg-amber-50/40 border rounded p-3 w-fit mx-auto`), `mode="overlay"` + новый opt-out prop `disableHoverOverlay`; PlasmidMiniMap overlay-portal — `bg-white shadow-lg border border-gray-200 rounded p-3`, убран source-fade `opacity: 0.15`, убран редундантный `<text>` с именем плазмиды под аркой (имя живёт в title-row); inline-mode tooltip исправлен (`px-2 py-1 leading-[1.4]` фон покрывает текст — закрывает V39); в SingleInspector кнопка `Заменить` переименована в `↻ замена файла` с ослабленной visual hierarchy + title-row использует `InlineEditableTitle` (закрывает V42). Тесты/билд после FIX-2 не верифицировались (Игорь принял по визуалу) — следующая Code-сессия проверит регрессии F4-тестов (ожидаемый fail: assertion «overlay НЕ включает bg-white» — теперь включает; assertion «source opacity 0.15» — source остался 100%).

**Закрытые баги (11):** V43 (`На канвас` always-append) / V44 (catalog items overflow) / V45 (merge import+catalog buttons) / V46 (smart leader-labels — основной результат цикла) / V47 (topology apply button overflow) / V48 (open canvas closes modal) / V42 (replace-btn misleading) / V38 (mini-map hover-trigger) / V39 (tooltip bg clipped) / V35 (multi batch toggle, obsolete — MultiFileList удалён) / V36 (file picker, obsolete — InputZone empty mode удалён). Детали в `BUGS.md` блоке FIXED 28.04.2026.

**Остаются OPEN в зоне импорта:** V40 (`Аннотировать` открывает auto-annotate вместо manual editor) и V41 (annotate duplicate session log). Оба заблокированы на Sprint Annotation-Commits (якорь DECISIONS.md 27.04.2026 «first-class commits» — прямым wiring'ом не решаются, требуют reducers и replay-pass).

**Архивация по §4 playbook — частичная.** Сделано: BUGS.md · 11 багов из OPEN → FIXED блок 28.04.2026; CURRENT_TASK.md → заглушка. **Не сделано** (TODO следующей сессией): спеки `docs/SPRINT_CATALOG_POLISH.md` и `docs/SPRINT_CATALOG_POLISH_FIX.md` → `docs/archive/` со штампом «✅ РЕАЛИЗОВАНО 28.04.2026 (F1/F4 переписаны в FIX-2)»; DECISIONS.md — запись о PlasmidMiniMap двухрежимности (не якорная, mini-map — фича, не фундамент; контракт живёт в jsdoc PlasmidMiniMap.jsx); TECH_DEBT.md проверка (App.jsx вероятно по-прежнему 30.56 KB после App-Decomp; Catalog Polish K3 убрал из App.jsx `📚 Каталог` кнопку + handlers — возможно хедрум вырос). Отложено из-за объёма работ этой сессии + последует разговор о смягчении правил playbook'а.

**Post-mortem (§4 п.6 playbook).** Цикл Catalog Polish → FIX → FIX-2 — 3 итерации (≥2 FAIL→fix), post-mortem срабатывает. **Root causes не выловленные в спеке:** (a) F1 в спеке SPRINT_CATALOG_POLISH_FIX.md был сформулирован без явного уточнения «лейблы в правой колонке по умолчанию — да/нет?» — Chat додумал inline-default вместо overlay-default; (b) F4 фон overlay-контейнера был явно помечен «прозрачный» в спеке — Chat противоречил тому что Игорь говорил 3 сессии подряд о белом фоне; (c) source-fade `opacity: 0.15` был Chat-изобретён как «хвост-след» — Игорь этого не просил. **Вывод:** UX-правки уровня «фон оверлея / labels дефолт / source-fade» через цикл Chat→спека→Code дают оверхед в часы вместо минут напрямую. Два кандидата на изменение playbook'а переносятся в следующую сессию («смягчение правил»): §6 (Chat может править `src/` напрямую для мелких UX-изменений); §2 (ловер bound на размер спеки и «выявить 2-3 явных UX-вопроса» как обязательный этап).

**Следующий шаг.** Разговор о смягчении правил playbook'а (§2 / §6 в первую очередь, §1 / §4 во вторую). После разговора — compact и переход к следующему спринту. Кандидаты: Sprint Annotation-Commits (блокирует V40+V41), Sprint Library-Canvas Model (F2–F4 backlog).

---

### Сессия 28.04.2026 (вторая) — Sprint App-Decomp визуальная приёмка PASS + accumulated debt rotation

Рефактор ModalStack + useAppEffects extract из App.jsx, закрывающий TD-SIZE-APP. Спека `docs/SPRINT_APP_DECOMP.md` (~22 KB), реализация Code в два коммита: `301db04` (K1 ModalStack.jsx 7.91 KB) + `b155e03` (K2 useAppEffects.js 4.35 KB). 978/978 Vitest (без новых тестов, refactor-only), pytest 112/112, `vite build` clean.

**Архитектурный итог.** App.jsx с 40.39 KB (hard-зона после IS-Final) → **30.56 KB** (−9.83 KB, soft с люфтом ~9.5 KB до hard 40 KB). Новые модули: `components/ModalStack.jsx` 7.91 KB (14 modals JSX-блок, 24 selectors взяты через `useStore.getState()` напрямую, 7 props вместо ожидавшихся в спеке 12–15) + `hooks/useAppEffects.js` 4.35 KB (side-effects extract). **K2 выполнен** хотя спека разрешала skip при K1 <32 KB — даёт ~10 KB headroom для будущих спринтов.

**Отклонение от спеки — одно, принято без оговорок:** ModalStack props 7 вместо прогнозированных 12–15 — Code применил устоявшийся в проекте паттерн (примеры — PartsPalette, DesignCanvas): UI/modal-компоненты читают store actions/setters через `useStore.getState()` напрямую, props-контракт сохраняет только composite handlers (handler из useFragmentHandlers + локальных state-переменных App). Кодифицировано как ⚓ в DECISIONS.md (секция «Sprint App-Decomp»).

**Визуальная приёмка — PASS-with-caveat (8/9 PASS + 1 stale-checklist).**
- Положительные: FragmentEditor (dbl-click PartBlock), ImportStartScreen (header `📂 Импорт` / `📚 Каталог`), PlasmidViewer (dbl-click на part-row в PartsPalette — альтернативный entry-point взамен устаревшего в чеклисте), OligoManager (header `🧬 Олиги` из Сборки с праймерами), Undo/Redo (Ctrl+D → Ctrl+Z → Ctrl+Y → Ctrl+Z, точное восстановление), Ctrl+5 (Construct↔Project Flow), Ctrl+1/2/3/4 (4 view modes все переключаются), console clean (ошибки SARS-CoV-2 region duplicate-keys — pre-existing baseline, не от App-Decomp).
- Стале пункт (PASS-with-caveat): MutagenesisWizard в чеклисте был «right-click PartBlock → `🔄 Мутагенез`», но после Sprint X mutagenesis-flow унифицирован через mode switcher внутри FragmentEditor — этот entry-point больше не существует. Selectors `mutagenesisTarget` / `showMutagenesis` / `mutagenesisInitialPlasmid` Code корректно перенёс в ModalStack, FragmentEditor mode switcher работает — ModalStack-render не сломан. Stale-пункт в чеклисте — backlog для поправки modal-entry-points в playbook'е под актуальные entry-points (не блокер рефактор-приёмки).

**Ротация по §4 playbook + accumulated debt из прошлой сессии:**
1. CLAUDE.md версия → v0.5.4-alpha (~284 коммита), Sprint App-Decomp помечен закрытым.
2. PROJECT_STATE.md header + журнал: эта запись выведена на верх; перенесены 6 сессий старше 2 спринтов (Sprint X cycle 26.04 + UX Vision 26.04 + UX-1 prototype 23.04 + Sprint 2a.1 23.04 + Sprint 2a 23.04 + Sprint 1.7 22.04) в `docs/archive/SESSIONS_2026_Q2.md`.
3. TECH_DEBT.md — **TD-SIZE-APP → DONE** (App.jsx 40.39 → 30.56 KB, коммиты `301db04` + `b155e03`). Snapshot снят 28.04.2026.
4. DECISIONS.md — новая ⚓ запись (секция Sprint App-Decomp): паттерн «UI/modal-компоненты читают store actions/setters через `useStore.getState()` напрямую, через props идут только composite handlers». DECISIONS.md сверка: все имеющиеся записи помечены ⚓ (фундаментальные), ничего не переносится в `DECISIONS_2026_Q2.md`.
5. `docs/SPRINT_APP_DECOMP.md` → `docs/archive/` со штампом «✅ РЕАЛИЗОВАНО 28.04.2026». `docs/SPRINT_UX_1_PROTOTYPE.md` → `docs/archive/` со штампом «✅ REVIEW PASS 23.04.2026 — палитра принята, прототип удалён» (carry-over из IS-Final ротации).
6. CURRENT_TASK.md → заглушка «спринт закрыт, следующая задача не определена» (с кандидатами).
7. **userMemories** выровнены через `memory_user_edits` (версия / коммиты / тесты / текущий спринт / pattern App-Decomp).

**Post-mortem (§4 п.6 playbook):** не применяется — App-Decomp 1-pass (визуальная приёмка с первого захода, 0 итераций FAIL→fix). Правило срабатывает только при ≥2 итерациях.

**Следующий шаг.** Кандидаты равных весов (решает Игорь): (1) **Sprint Catalog Polish** — V43–V48 багфикс-пакет без size-gate (рекомендация Chat — самый быстрый путь, спека уже подготовлена IS-Final сессией); (2) **Sprint Annotation-Commits** — блокирует V40, data-model + reducers + V40 wiring, спека 25–30 KB; (3) **Sprint Library-Canvas Model** (F2–F4) — требует kickoff-Q&A. **Рекомендация compact** перед следующим спринтом (§7 playbook — после финализации спринта всегда).

---

### Сессия 28.04.2026 — Sprint IS-Final финализация (предыдущая Code-ветка) + Sprint Catalog Polish kickoff

Финализация Sprint IS-Final ImportStartScreen redesign единым событием по итогам визуальной приёмки прошлой Chat-сессии. Работа Code была сделана в одну ветку, два коммита: `5748521` (K0–K4: CatalogPanel + SingleInspector + MultiInspector + orchestrator simplification) + `a34674e` (K5–K9: hover-bridge debounce + smart leader-labels + FileSummaryCard unification + ActionsBar refactor + cleanup InputZone/MultiFileList). **937 → 978 Vitest** (+50 IS-Final, −9 retired = +41 net). pytest 112/112. `vite build` clean.

**Архитектурный сдвиг.** ImportStartScreen disclosure-pattern (empty↔catalog) заменён на постоянный двухколоночный layout: левая колонка — `CatalogPanel` (search + 3 collapsible groups + drop-zone footer 120 px), правая — Inspector switch (`EmptyInspector` / `SingleInspector` / `MultiInspector`). Cross-category search по всем 19 категориям с prefetchAllCategories + length-pattern parser (`>5000`, `<2kb`, `2k-3k`). Удалены legacy `InputZone.jsx` и `MultiFileList.jsx`. Папка `ImportStartScreen/`: 76.68 KB суммарно (10 файлов; самый большой — CatalogPanel.jsx 18.67 KB).

**Размеры (snapshot 28.04.2026):** `App.jsx` 39.37 → **40.39 KB** (+1.02 KB, **прорыв hard 40 KB** на 0.39 KB — первый факт выхода .jsx за hard с момента введения лимитов 22.04.2026); `CatalogPanel.jsx` (новый) 18.67 KB; `SingleInspector.jsx` 5.39 KB; `MultiInspector.jsx` 8.58 KB; `index.jsx` (orchestrator) 17.79 KB; `PlasmidMiniMap.jsx` 10.13 KB (стабилен).

**Визуальная приёмка прошлой Chat-сессии — PASS** с 5 follow-up багами:
- **V43** (P1) — `На канвас` зовёт native `window.confirm` вместо append (regression базового use-case «сборка нескольких копий fragment'а»).
- **V44** (P2) — items в catalog tree рендерятся ниже всех остальных категорий + drop-zone footer (невидимы на viewport).
- **V45** (P2) — merge кнопок Импорт + Каталог (3→2 в QuickStart, 2→1 в header).
- **V46** (P3) — smart leader-labels (статичный mini-map labels=0, hover overlay overflow за viewBox).
- **V47** (P3) — `↻ применить` overflow на 41 px в Topology-блоке SingleInspector.

**Ротация по §4 playbook — частичная.** Сделано: спека `docs/SPRINT_IS_FINAL.md` → `docs/archive/` со штампом «✅ РЕАЛИЗОВАНО 28.04.2026»; CLAUDE.md версия обновлена до v0.5.4-alpha; CURRENT_TASK.md переключён на Sprint Catalog Polish; BUGS.md +5 записей V43–V47 в нужные приоритетные секции; TECH_DEBT.md обновлён (App.jsx hard-zone fact, A11Y category buttons, прорыв hard 40 KB факт). **Не сделано** (явно из-за лимита контекста + объёма работы этой сессии): перенос журнальных записей старше 2 спринтов (Sprint 2a, 2a.1, 1.7, UX-1 prototype 22–23.04.2026) в `docs/archive/SESSIONS_2026_Q2.md`; ревизия DECISIONS.md ⚓-маркеров; перенос спеки `docs/SPRINT_UX_1_PROTOTYPE.md` в archive (после review-PASS 23.04.2026 оставалась в docs/ до серии UX-1 full). Эти три пункта — отдельной сессией перед финализацией Sprint Catalog Polish или вместе с ней.

**Post-mortem (§4 п.6 playbook):** не применяется — IS-Final 1-pass (визуальная приёмка с первого захода, 0 итераций FAIL→fix). Правило срабатывает только при ≥2 итерациях.

**Следующий шаг.** Sprint Catalog Polish — спека `docs/SPRINT_CATALOG_POLISH.md` подготовлена этой Chat-сессией, V43 (P1) первоприоритетный, дальше V44/V45 (P2), V46/V47 (P3). Code запускается с handoff-фразы из CURRENT_TASK.md. **Ключевая развилка K1:** App.jsx ≥ hard 40 KB. K1 = V45 удаляет код (header `Каталог` button + QuickStart кнопка `Выбрать из каталога` + handlers) — gate проверяет размер после правки; если остался ≥40 KB → Code останавливается, mini-spec ModalStack extract отдельно (часть Sprint 2b). Полная декомпозиция App.jsx — Sprint 2b, не в этом спринте.

---

### Сессия 27.04.2026 — Sprint Import-Start-Screen финализация единым событием (K1–K9 + fix-цикл Kfix-1..Kfix-7 + V37 mini-fix)

Цикл из базового спринта + fix-цикла + мини-фикса финализирован единым журнальным событием после визуальной приёмки 27.04.2026 на ветке `feature/racetrack-canvas` (HEAD `2268f90` после Kfix-7, V37 mini-fix коммит `d6149c4` поверх; не пушено). Реализация импорт & preview часть 1 из 3 — стартовый экран импорта с disclosure-pattern empty↔catalog, single-file/multi-file modes, SessionSummary + FileSummaryCard, PlasmidMiniMap с instant tooltip + leader-labels.

**Sprint Import-Start-Screen K1–K9 (базовый).** 846 → 871 Vitest (+25). Спека `docs/SPRINT_IMPORT_START_SCREEN.md` реализована введением `components/ImportStartScreen/` (изначально 6 файлов: index/InputZone/CatalogTree/MultiFileList/MetaColumn/ActionsBar + Toast), entry points из header-кнопок `Импорт` / `Каталог`, drag-drop и Ctrl+V входы. Приёмка базового спринта выявила 16 F-критериев отклонений от спеки / UX-проблем — fix-цикл.

**Fix-цикл Kfix-1..Kfix-7.** 871 → 907 Vitest (+36). Шесть коммитов: Kfix-1 `6335c52` (extractItemName helper приоритет internal→file.name→part_N + backend filename pass-through в `gui/api/server.py`); Kfix-2 `e2afb4e` (`addFragmentDirect` вынесён из `addFragment` — ImportStartScreen `На канвас` обходит PlasmidUseWizard hijack, legacy `addFragment` сохранён длъ palette/library/contextMenu); Kfix-3 `f672dc8` (collapse multi-mode дубля «Аннотировать → в библиотеку» + single-file persistent MetaColumn с lastActionStatus); Kfix-4 `6b46db4` (PlasmidMiniMap viewBox padding `r=(size-stroke-2)/2` + custom React tooltip + leader-labels для size===180 + click-overlay для малых карт); Kfix-5 `08106c1` (`SessionSummary.jsx` + `FileSummaryCard.jsx`, `addedToCanvasNames→addedItems`, `Toast.jsx` удалён); Kfix-6 `565efcf` (disclosure pattern empty↔catalog внутри одной модалки); Kfix-7 `2268f90` (mop-up: progress wiring + `Действия ▾` flip вверх + удаление legacy `+ Добавить фрагмент` из DesignCanvas + `✏️ Вставить` из PartsPalette). 16/16 F-критериев PASS, build clean.

**V37 mini-fix (в ходе приёмки, коммит `d6149c4`).** PlasmidMiniMap после Kfix-4 рисовала кастомный React-tooltip instant + параллельно браузер показывал native SVG `<title>` через ~700 мс — визуально два tooltip'а одновременно. Fix во всех 4 рендер-ветках PlasmidMiniMap (circular-arc / linear-rect / empty-circular / empty-linear): `<g><title>{name}</title>…</g>` → `<g role="img" aria-label={name}>…</g>`. Native tooltip не появляется (browsers рендерят его только для дочернего `<title>`, не для `aria-label`); a11y сохранена через AccName. Тесты: assertion'ы в `plasmid-mini-map.test.jsx` + `plasmid-mini-map-kfix4.test.jsx` с `svg title` на `svg g[aria-label]` (количество тестов не изменилось, 907 Vitest). build clean.

**Приёмка 27.04.2026.** Визуальная приёмка fix-цикла через Chrome MCP на запущенном dev-сервере + ручные проверки Игоря. **16/16 F-критериев PASS:** F-A canvas hijack убран / F-B снят вместе с hijack / F-C toast не оптимистичен / F-D «Открыть холст →» корректен / F-E дубль в multi-mode убран / F-F batch progress / F-G `+ Добавить` удалён / F-H disclosure empty↔catalog оба направления / F-I MetaColumn persistent в single-file / F-J mini-map выводится целым во всех размерах / F-K instant tooltip / F-L leader-labels на 180 px / F-M `SessionSummary` + `FileSummaryCard` слева / F-N `Действия ▾` вверх / F-O имя файла без tmpXXX (косвенно через batch-list) / F-P palette `Вставить` удалён. 7 отклонений Code от спеки («корень F-A в `fragmentSlice.addFragment`, не в App.jsx useEffect» / двухслойный fix F-O / `addedToCanvasNames → addedItems` с удалением Toast.jsx / radius-shrink вместо SVG-extension для leader-labels / modal-style overlay вместо popover для малых mini-map / FileSummaryCard warnings sub-секция render `null` пока pipeline не отдаёт / `setModalMode` в PartsPalette оставлен для tab-navigation) — все accept'нуты. **V37 после mini-fix `d6149c4` проверен визуально** — дубль tooltip убран, остался один кастомный.

**Новые находки (→ BUGS.md/OPEN):**
- **V35** (Низкий, UX) — multi-mode batch toggle: две отдельные кнопки `☑ всем` / `☐ никому` в MultiFileList нужно заменить на один трёхсостоянный master-checkbox.
- **V36** (Низкий, UX-gap) — в ImportStartScreen empty mode InputZone нет native file picker (только drag-drop + Ctrl+V); решение — dropzone как `<label>` для скрытого `<input type="file" multiple>`.
- **V37** (Средний, ✅ FIXED в `d6149c4`) — PlasmidMiniMap дубль tooltip native + custom; `<title>` заменён на `aria-label`.
- **V38** (Низкий, UX) — overlay 180 px над карточками каталога/MultiFileList лучше открывать по hover, не по click; меняет отклонение #5 на accept-with-rework.
- **V39** (Низкий, cosmetic) — после V37 fix обнаружено: фон кастомного tooltip меньше высоты текста (видна белая полоса фона страницы сквозь текст); CSS-fix `padding`/`line-height`/`getBBox`. Пакетно с V38.

**Минор-наблюдение (не завожу в BUGS.md):** state-persistence внутри ImportStartScreen между close/open (catalogExpanded, query в CatalogTree) — противоречит базовой спеке §4 решение 2 («чистый старт при повторном открытии»). Относится к базовому K1–K9, не к fix-циклу. Решение Игоря — заводить ли отдельным пунктом.

**Размеры (snapshot 27.04.2026):** `App.jsx` 39.37 KB (стабилен, критически близко к hard 40 KB), `DesignCanvas.jsx` 36.77 KB (− 0.30 KB после Kfix-7 удаления «+ Добавить фрагмент»), `PartsPalette.jsx` 29.75 KB (− 0.10 KB), `PlasmidMiniMap.jsx` **3.96 → 10.13 KB** (+6.17 KB — custom tooltip + leader-labels + click-overlay + V37 aria-label refactor; выше 5 KB «warning signal» по CLAUDE.md §7, но в soft-зоне 30 KB для .jsx). `components/ImportStartScreen/`: index.jsx 18.79 KB (15.87 → +2.92), новые SessionSummary.jsx 2.71 KB + FileSummaryCard.jsx 4.63 KB; удалён Toast.jsx. Все модули в зелёной/софт-зоне.

**Ротация по §4 playbook выполнена:** спека `SPRINT_IMPORT_START_SCREEN.md` → `docs/archive/` со штампом «✅ РЕАЛИЗОВАНО 27.04.2026». Блок FIXED Sprint X cycle (старше 2 спринтов) из BUGS.md → BUGS_HISTORY.md — в корневом остался только V37 FIXED как свежезакрытый. 2 новых ⚓ в DECISIONS.md (`addFragment` vs `addFragmentDirect` разделение / `extractItemName` приоритет + backend filename pass-through). TECH_DEBT.md обновлён (PlasmidMiniMap warning signal +6.17 KB; App.jsx стабилен). CURRENT_TASK.md → заглушка.

**Post-mortem (§4 п.6 playbook):** цикл 1-pass (16/16 PASS с первой визуальной приёмки fix-цикла), правило «≥2 итерации FAIL→fix» не срабатывает. Вынести отдельным выводом: бис «prototype-first с hover/edge-states выловил бы V37 (double tooltip), V35 (два кнопка-checkbox), V39 (tooltip bg)» — фиксация не обязательна, но информирует будущие UX-спринты — prototype должен покрывать hover-поведение, не только static screenshots.

**Следующий шаг.** Кандидаты: (1) **V38 + V39 mini-fix-2** — пакетный по PlasmidMiniMap.jsx, ~15 мин Code, без спеки (по образцу V37 mini-fix `d6149c4`); (2) **V33 quick-fix** — блокировка «Создать сборку» при pending mutations, biology-safety; (3) **Sprint UX-1 preflight K0** по `UX_1_PROTOTYPE_REVIEW.md` §4.1 (V31 + global tokens на `:root` + cleanup прототипа); (4) **Sprint X+1** — panel истории мутаций в UI; (5) **Sprint 2b** App+DesignCanvas decomposition (App.jsx 39.37 KB впритык, DesignCanvas.jsx 36.77 KB в софт-зоне). Рекомендация Chat: V38 + V39 mini-fix-2 (пакетный по PlasmidMiniMap), затем V33. Решение — Игорь.

**Sprint X Plasmid-Git статус на момент этой записи:** реализован Code (K1–K6, коммиты `bb868f1`..`bc20620`, 822/822 Vitest, +48 от baseline 774), визуальная приёмка **не проведена** — отдельная будущая сессия. На ветке `feature/racetrack-canvas` изменения Plasmid-Git уже в дереве (baseline 822 для прототипа это подтверждает). Когда Игорь запускает приёмку Plasmid-Git — отдельный compact, Chat той сессии восстанавливает отчёт Code через `git log CURRENT_TASK.md` (отчёт был перезаписан при переходе на UX-1 prototype).

**Post-mortem (§4 п.6, цикл prototype-first = 1 итерация, PASS с первого раза):** не применяется (пункт только при ≥2 итерациях FAIL→fix). Валидация prototype-first pattern как process-decision — первое практическое применение успешное: спека 41 KB → реализация 4 коммита ~6 ч Code → review PASS с минимальными находками за одну сессию. Паттерн закрепляется для крупных UX-спринтов.

---

### Сессия 26.04.2026 — Sprint X cycle finalize (Plasmid-Git + corrected undo timing): full visual acceptance

Цикл из четырёх спринтов (Sprint X / X-fix / X-fix-2 / X-fix-3) финализирован единым событием после визуальной приёмки 26.04.2026 на EGFP (196 bp). Автоматизированная Cowork-сессия (Claude in Chrome) провела 5 сценариев, все PASS:

- **K-fix2-1** — 3 мутации (V2A/K4A/E6A) → Apply → Ctrl+Z вернул GC% 67.9%→65.8% (baseline), Mutations panel очищен → Ctrl+Y восстановил GC% и мутации.
- **K-fix2-2** — editor открыт после Apply / Ctrl+Z / Ctrl+Y / «Сохранить как запчасть».
- **K-fix2-3** — footer без «🔀 Как вариант», есть «Создать сборку (3)» / «Сохранить как запчасть» / «Отмена».
- **SC-4 (single mutation)** — V2A → Apply → Ctrl+Z → GC% 66.3%→65.8%.
- **SC-5 (race-test)** — apply → Ctrl+Z (0мс) → Ctrl+Y (100мс) → Ctrl+Z (200мс) → все откаты корректные, redo stack intact.

**Архитектурный итог.** Один из крупнейших сдвигов проекта со времён Zustand-миграции (28.03.2026). `fragment.mutations[]` заменён на Plasmid-Git: `baseSnapshot` + `commits[]` + `HEAD` + replay (3 новых ⚓ в DECISIONS.md). V22/V24/V27 закрыты архитектурно (не латками).

**Sprint X-fix-3 — pre-existing баг debounced `pushUndo` (commit `4292506`).** Snapshot снимался внутри setTimeout-callback через 300мс после вызова. На одиночных user-actions (паузы >300мс) баг не проявлялся. Sprint X-fix-2 ввёл `applyMutationsBatch` — первый сценарий, где pushUndo + set + setTimeout-fire упаковались в окно <300мс. Fix: module-level `_pendingSnapshot = null`, первый pushUndo в окне захватывает snapshot синхронно до set(); очистка в `undo()` / `redo()` закрывает race «apply → Ctrl+Z <300мс → новый apply».

**Тесты:** 774 → **846 Vitest** (+72 за весь цикл: +70 Sprint X / X-fix / X-fix-2 + 2 Sprint X-fix-3). pytest 112/112. `vite build` clean. **Размеры:** `lib/plasmid-git-reducers.js` новый 5.02 KB; `store/index.js` 10.70 → 12.06 KB (+1.36 KB; hard 25 — далеко); `FragmentEditor/index.jsx` 39.55 → 39.32 KB.

**Новые находки по ходу приёмки (→ BUGS.md/OPEN):** **V32** (Низкий) — «Legacy-мутации: revert недоступен» warning до Apply misleading; **V33** (Средний) — «Создать сборку (N)» активна с pending мутациями (biology-critical UX-trap).

**Ротация по §4 playbook выполнена:** спеки `SPRINT_X_PLASMID_GIT.md` и `SPRINT_X_FIX.md` → `docs/archive/`. 3 новых ⚓ в DECISIONS.md (Plasmid-Git data model / pushUndo synchronous capture / тесты side-effect функций). TECH_DEBT.md обновлён. CURRENT_TASK.md → заглушка.

**Post-mortem (§4 п.6, цикл 4 итерации FAIL-fix):** Root causes:
1. Sprint X спека не предусмотрела batch-apply контракт для mutagenesis-workflow.
2. Sprint X-fix-2 тест K-fix2-1 «pushUndo called exactly once for batch» spy-ил вызов, не результат. pushUndo timing баг остался не выявленным до visual acceptance. Слепое пятно тестового подхода для любой side-effect функции с отложенным эффектом.
3. Sprint X-fix-3 spec попала в правильный слой (`pushUndo`, не reducers).

**Выводы:** добавить в `_TEMPLATE_SPEC.md` §5 Предположения / п. «Тесты» обязательный чек-пункт про debounce/setTimeout/microtask/async — тест spy-ом на вызове недостаточен, проверяем конечный observable state. Для workflow rewire в §3 спеки явный блок «Entry-points в новую модель». 4 итерации — высокая цена; для будущих крупных архитектурных спринтов kickoff-интервью расширить по workflow integration.

---

### Сессия 26.04.2026 — UX Vision document (Chat-only, parallel track)

No-code сессия поверх pending Sprint X-fix-2. Игорь попросил «полностью переработать с нуля интерфейс». Первый шаг (анализ 5 ПО — SnapGene / Benchling / Geneious / ApE / pLannotate) был сделан в предыдущей сессии и живёт в `docs/UX_REFERENCE_BASE.md`. На этой сессии выбран вариант (a) для шага 2 — Vision-документ без layout, только ставки и принципы.

**Новый файл:** `docs/UX_VISION.md` (~21 KB). 9 секций: §1 Позиционирование / §2 Universal baselines (8 паттернов) / §3 Ставки (7) / §4 Отказы (5) / §5 Сквозные принципы (10) / §6 Что НЕ в документе / §7 Per-workflow цикл / §8 Порядок workflow'ов / §9 Правила обновления Vision.

**Обновлены:** `CURRENT_TASK.md` (заголовок + сохранёна мини-спека X-fix-2), `CLAUDE.md` (ссылка на UX_VISION.md в §«Справочные (docs/)»), журнал. **Sprint X-fix-2 финализация отложена** — это операция Code на финализации спринта.

_Закрыто 26.04.2026: цикл Sprint X / X-fix / X-fix-2 / X-fix-3 финализирован единым событием после визуальной приёмки на EGFP. См. запись «Сессия 26.04.2026 — Sprint X cycle finalize» выше._

---

### Сессия 23.04.2026 — Sprint UX-1 prototype (kickoff → реализация → review PASS → решение убить прототип)

Практическое испытание **prototype-first pattern** (⚓ DECISIONS 23.04.2026). Прототип на 3 поверхностях перед полной UX-1 спекой: Canvas Blocks view / PlasmidViewer / AnnotationEditor, изолированный React-экран `?ux=prototype`, fixture с 16 аннотациями покрывающими 15 семейств `feature-palette.js` V2.

**Три этапа:** kickoff + спека (`docs/SPRINT_UX_1_PROTOTYPE.md` 41.47 KB); реализация Code (ветка `feature/racetrack-canvas`, K1–K4 коммиты `f2c3f36`/`0d680d2`/`4d99663`/`d08a109`, Vitest 822 → 829, все 9 замороженных модулей не тронуты); review (PASS по всем 8 критериям на 4 скриншотах; палитра V2 + paper `#F8F5EE` + `FEATURE_STROKE` `#3A2F1F` сработали на всех трёх классах UI).

**Решение Игоря по итогам review: прототип удаляется, палитра остаётся.** Ветка `feature/racetrack-canvas` не мёрджится — ровно запланированное поведение prototype-first pattern. Написан `docs/UX_1_PROTOTYPE_REVIEW.md` (19 KB) — основа для серии Sprint UX-1 full.

**Воспроизведённые pre-existing баги** (остаются в OPEN без правок): V31 PlasmidMap rescale/resize; V30 tiny-labels-outside circular map; V9 short-annotation-labels; V10 SBOL glyph paleness.

**Пост-мортем (§4 п.6, цикл prototype-first = 1 итерация, PASS с первого раза):** не применяется. Валидация prototype-first pattern как process-decision — первое практическое применение успешное.

---

### Сессия 23.04.2026 — Sprint 2a.1 «FragmentEditor EditorPanels extract» (visual acceptance)

Мини-спринт поверх Sprint 2a: дотянуть `FragmentEditor/index.jsx` с 46 KB до ниже hard-лимита 40 KB. Спека жила в CURRENT_TASK.md, один коммит Code.

**Коммит `8699bf5`:** `refactor(FragmentEditor): extract EditorPanels`. Новый файл `EditorPanels.jsx` — **9.4 KB**, pure-props, 0 state. `index.jsx` — **46 → 35.6 KB**. **Vitest 738/738**, build clean.

**Новые находки по ходу приёмки (BUGS.md/OPEN на тот момент):** **V27** — кнопка ✕ в Mutations panel не откатывает sequence (pre-existing с Sprint 1.7 K10) _(закрыт Sprint X cycle 26.04.2026 архитектурно)_; **V22** — indel в sub-фрагменте даёт ложный красный хвост _(закрыт Sprint X cycle)_; **V23** — `ORTHOGONAL_OVERHANGS_4` содержит 6 палиндромов + 5 RC-пар (остаётся OPEN); **V24** — single-circular self-closure не генерирует primers _(закрыт Sprint X-fix K5)_.

**Решение по V22 / V24 / V27** — не fixing латками. Следующий архитектурный этап — Sprint X «Plasmid-Git». _(Состоялся 26.04.2026.)_

---

### Сессия 23.04.2026 — Sprint 2a «FragmentEditor decomposition» (technical acceptance)

Чистый рефакторинг. `components/FragmentEditor.jsx` (72 KB, 1353 строки) разобран в папку `components/FragmentEditor/` на 8 файлов.

**Коммиты K1–K7:** `923d1c1` (highlights) / `e2c9fad` (color-palette + region-types) / `eae6f54` (FullViewGrid) / `42160cb` (AAMutationPopup) / `f932cad` (DnaMutationPopup) / `bb64baa` (SequenceGrid) / `29b98f2` (финал из index.jsx, удалён старый файл).

**Итог:** index.jsx 46 KB (над hard 40 KB), 7 модулей вынесены. **Sprint 2a спека математику декомпозиции просчитала неверно** (OUT-прогноз ≤22 KB для index.jsx был ошибочным). Порожден Sprint 2a.1 (хвост). **Vitest 738/738**, build clean. Спека → `docs/archive/`.

---

### Сессия 22.04.2026 — Sprint 1.7 «Unified Editor + Virtual Full Sequence + Topology» (full visual acceptance)

Визуальная приёмка 4 блоков на HygroR (1023 bp) + мутагенез. Все четыре блока Sprint 1.7 приняты.

- **Блок 1 — K10 Unified Editor (PASS).** Tabs удалены, mode switcher + sequence primary + 3 collapsible panel.
- **Блок 2 — K9 V15/V16 (PASS).** На HygroR_2/HygroR_5 подсвечены только реальные позиции мутаций, deletion mapping корректно.
- **Блок 3 — K11 Virtual Full Sequence (PASS).** Toggle «Фрагмент / Полный ген», read-only sequence, highlightRegion, мутации в координатах parent.
- **Блок 4 — K12 Topology + V17 (PASS).** `fragment.topology` персистится, toggle 📏/⭕ в header Editor, single-linear без decorative junction (V17 fix), single-circular self-closure.

**Коммиты:** K9 `1cffe1b`, K10 `853535f`, K11 `b2e21ed`, K12 `2c6d735`. **Тесты: 700 → 738 Vitest** (+38) + 112 pytest. Build clean.

**Новые находки** (BUGS.md/OPEN): V18 (full-view DNA и Protein overview разорваны), V19 (кнопка «Редакт. кодоны» редизайн), V20 (микро-PCR 30–60 bp), V21 (single-circular arc-indicator).

**Самое важное:** Игорь попросил не упарываться по тестам (+38 Vitest на 4 коммита — избыточный темп). Фиксировано как ⚓ в DECISIONS.md: тесты соразмерны коду.

Спека `SPRINT_1_7_UNIFIED_EDITOR.md` → `docs/archive/`.

---

### Сессия 21.04.2026 — Sprint Map-WS-1 cycle (Skeleton + fix + fix-B): full visual acceptance

Три последовательных подспринта по Map Workstream 1 (plasmid view с synced cursor) закрыты визуальной приёмкой 21.04.2026 на «Сборка 7» (pDHG25-family, 6107 bp, circular, whole-plasmid import через Plasmid Use Wizard → «use whole»). После двух циклов FAIL→fix это первая PASS-приёмка критериев D1 (back-sync map↔sequence), D3 (responsive full-width pane) и LABEL-читаемости warm-dark-brown поверх pastel palette.

**История трёх подспринтов:**

- **Map-WS-1 Skeleton (commits `e59c44e`, `4507ebe`, `92aab93`, `ea1427a`)** — новый `PlasmidWorkspace` vertical split (PlasmidMap + SequencePane read-only) с resizable splitter (persist `plasmid-workspace-bottom-h` в localStorage), `selectedRegionId` state как синхронизированный cursor, `buildPlasmidSequence(fragments)` helper. DesignCanvas Map view branch заменён на `<PlasmidWorkspace>`. 738 → 756 Vitest. Приёмка 24.04 на «Сборка 5» — FAIL D1/D2/D3.
- **Map-WS-1-fix K1–K3 (commits `cab6ea5`, `994ed79`, `a7cbbee`)** — новая `feature-palette.js` (15 семейств + misc, `FEATURE_STROKE = '#3A2F1F'`, `featureColor(type, name?)` с CDS→refine-by-name и GenBank-aliases), controlled `selectedRegionId`/`onSelectRegion` props в PlasmidMap, `id`/`ftype` в `rawSubs`, highlight-branch с drop-shadow, `data-testid="sub-arc-<id>"`; `SequencePane` перешёл на `featureColor` + `min-w-full` на content-div; PlasmidWorkspace перестроил mapping idx→regionId через `regionsByFragment` + `onMapFragmentFallback`. 756 → 768 Vitest. Приёмка 21.04 на «Сборка 7» — D2 PASS (палитра работает), D1/D3 FAIL + новая находка LABEL-читаемости на pastel.
- **Map-WS-1-fix-B K4.1–K4.5 (commits `27cc518`, `53247ac`, `b9f59f8`, `e14994c`, `5ac282a`)** — `getRegions` backfill deterministic id (закрывает D1 root cause: catalog-импорт без id ломал forward и back sync одновременно); defensive guard `region.id != null` в SequencePane; PlasmidWorkspace переведён на общий `getRegions`; warm-dark-brown labels в 3 точках PlasmidMap (sub-arc textPath, direction arrow, feature arc textPath), `textShadow` убран; responsive `charsPerLine` 60–120 (snap 10) через ResizeObserver. 768 → **774 Vitest** (+6).

**Итого:** 738 → **774 Vitest** (+36 за все три подспринта), pytest 112, `vite build` clean (pre-existing warnings INEFFECTIVE_DYNAMIC_IMPORT auto-annotate.js + chunk >500 KB оставлены). Size budget OK: PlasmidMap 34→35 KB, SequencePane 11.8→12.8 KB, PlasmidWorkspace 5.5→6.3 KB, annotation-model 2.5→2.8 KB, новый feature-palette.js 3.6 KB — все далеко от hard 40/25 KB (⚓ 22.04.2026).

**3 архитектурных решения** в DECISIONS.md (⚓): (1) `getRegions` read-path id contract; (2) `feature-palette.js` как данный контракт цветов region-семейств + single `FEATURE_STROKE`; (3) responsive `charsPerLine` clamp [60,120] snap 10 как GenBank-habit-compat.

**4 UX-находки вне скоупа** (BUGS.md/OPEN/Низкие для Sprint UX-1): **V28** SequencePane region-backgrounds выглядят декоративными (нужен cursor: pointer + hover-state); **V29** PlasmidMap hover-scale захватывает всю группу арок вместо hovered (pre-existing, не регрессия); **V30** мелкие arc'и без лейблов — нужны выносные leader lines наружу кольца, родственно V1/V6; **V31** PlasmidMap масштабируется при resize окна вместо сохранения фиксированного визуального размера (подозрение на регрессию Skeleton K4 — убранный `items-center justify-center` wrapper).

Спеки `docs/SPRINT_MAP_WS_1_SKELETON.md`, `docs/SPRINT_MAP_WS_1_FIX.md`, `docs/SPRINT_MAP_WS_1_FIX_B.md` штампуются `✅ РЕАЛИЗОВАНО 21.04.2026`; перемещены в `docs/archive/`. CURRENT_TASK.md → заглушка.

**Post-mortem (§4 п.6, цикл Skeleton→fix→fix-B = 3 итерации):** Root causes не выловленные в Skeleton-спеке: (1) предположение «all annotations have `id`» ложно для catalog whole-plasmid импорта (D1 root cause, потребовал fix-B K4.1 backfill); (2) ключи словарей `ANNOTATION_COLORS/FEATURE_COLORS` не совпали с `region.type` в assembly-контексте → fallback `#999`/`#666` на все регионы (D2); (3) `onSelectFragment(i)` передавал fragment-index, но Workspace.onMapSelect трактовал как region-index (mis-index mid-fragment); (4) `min-w-full` на content-div не растягивал `whitespace-pre` spans — текст сидел в левой трети pane'а (D3); (5) white labels поверх pastel palette нечитаемы (не предусмотрено как отдельная тройка в спеке). **Вывод:** подтверждает необходимость §5 «Предположения» в `_TEMPLATE_SPEC.md` (введён 21.04.2026). Дополнительно: при правке любой информационной маппинг-таблицы (цвет, тип, стратегия) в §5 спеки фиксировать «откуда приходит ключ» (catalog / assembly / single-plasmid view / legacy) и проверять `key ∈ dict.keys`, не надеяться на однообразие между контекстами. LABEL контраст на новой palette — обязательный check-item в visual-testing checklist.

---

### Сессия 21.04.2026 — Sprint 1.6 «Мутагенез UX v2.1» (partial visual acceptance)

После технической приёмки Sprint 1.5 (663 Vitest, 4 коммита K1–K4) визуальная приёмка выявила 4 проблемы архитектурного уровня в K2 mode switcher. Sprint 1.6 закрывал их 4 коммитами:

- **K5** (`c899f6e`): белок read-only в `mode='edit'` — баннер «Режим просмотра» + кнопка «→ Мутагенез», AA-clicks no-op. Биологическое обоснование: bookkeeping белка без кодона невозможен.
- **K6** (`acbf515`): новый `lib/split-annotations.js::trimAnnotationsForSubFragment` с биологически корректными правилами (signal_peptide drop, CDS/gene rename с (5'/3' trimmed), point-like drop на границе). Заменил coordinate-only inline-логику в `handleSaveFragment`.
- **K8** (`b2ac6ec`): `computeMutationHighlights(fragment, parent)` через `sequenceDiff` → Map\<ntPos, 'silent'|'nonsilent'\>. Red/yellow подсветка в DNA и protein views. Fallback на `fragment.mutations` когда нет parent.
- **K7** (`d110272`): split-группа на canvas. `splitGroupId` + метаданные на sub-фрагментах. `DesignCanvas` оборачивает consecutive same-groupId в `.split-group-container` с 4 визуальными эффектами (пунктирная рамка, фон, badge, линия). Internal/external junction routing сохраняет цепочечную семантику.

Тесты: 663 → **700** (+37). Build clean на всех четырёх коммитах.

**Визуальная приёмка — partial acceptance.** Игорь протестировал на Gibson сборке HygroR+EGFP → обнаружил 3 критические проблемы и 1 архитектурный запрос:

- **V15** — `FragmentEditor.isMutated` использует `m.label?.includes(String(pos))` — substring match вместо числового сравнения. Для mutations с номерами `G26A, R135A, G77C, C403G, G404C` любая AA-позиция, номер которой встречается как подстрока, подсвечивается ложно. Фикс в Sprint 1.7 K10 (Unified Editor переписывает рендер).
- **V16** — `computeMutationHighlights` игнорирует `fragment.templateStart`. Для HygroR_2 (templateStart=42) diff с parent HygroR сравнивает  «в лоб» → показывает всё как мутации. Фикс в Sprint 1.7 K9.
- **V17** — одиночный линейный фрагмент рендерит decorative 30-bp overlap-junction справа. Нужен явный topology toggle. Фикс в Sprint 1.7 K12.
- **Архитектурный запрос:** убрать tabs (Последовательность / Белок) из FragmentEditor. Последовательность — primary view, аннотации/белок — панель под ней. Mode (Правка/Мутагенез) остаётся как ортогональная ось. Реализация в Sprint 1.7 K10 Unified Editor.

**Решение:** Sprint 1.6 закрыт **partial** — технически реализованные фичи (K5–K8) остаются в ветке, все 700 тестов зелёные, билд чистый. Три новых бага (V15/V16/V17) + архитектурный запрос идут в Sprint 1.7. K2 mode switcher, `switchMode` helper и identity-guard в `handleSaveFragment` — база, на которую Sprint 1.7 K10 накладывает Unified Editor рефакторинг.

Спеку Sprint 1.7 пишет Claude Chat в следующей сессии.

---

### Сессия 21.04.2026 — Sprint 1.5 «Мутагенез v2» (formal acceptance, visual partial)

После Sprint 1 + визуальной приёмки сформирована спека `docs/SPRINT_1_5_MUTAGENESIS_V2.md` на 4 фикса мутагенеза. Реализованы в 4 коммитах:

- **K1 V14** (`f342c57`): `chooseStrategy(mutations, fragmentContext)` — KLD разрешён только при `topology==='circular' && isStandalone===true`. Linear/non-standalone → `two_fragment`/`multi_fragment` независимо от числа мутаций. Для single-mutation linear cut ставится в позиции мутации → мутация в overlap-зоне. `handleSaveFragment` + `MutagenesisWizard.compute` прокидывают context. +15 тестов.
- **K4 V11** (`67d2269`): KLD primers теперь с реальными Tm/GC через `calcTmNN` + готовую `gcPercent` из `tm-calculator.js` (DRY, не создавали новый `gcPctInt` helper из спеки CLEANUP_DEAD_CODE.md). `tmFull === tmBinding` для KLD (no tail). +2 теста.
- **K3 V13** (`e983fed`): Новое поле `uiSlice.mutagenesisInitialPlasmid` + setter. `PlasmidUseWizard` (оба пути — useEffect и menu-click при `presetMode='mutate'`) сохраняет plasmid перед закрытием. `MutagenesisWizard` принимает `initialTemplateSeq/Name/Organism/CdsStart/CdsEnd`, при наличии `initialTemplateSeq` стартует на Step 2. Initial seq санитизируется на mount. +3 теста.
- **K2 V12** (`c394c64`): Top-level mode switcher `edit | mutagenesis` в `FragmentEditor` (radio над tabs). AA-popup заблокирован в edit mode; DNA handlers не пишут в mutations в edit mode. Quick actions disabled в mutagenesis. `handleSave` разделён на `handleSaveEdit` (+editHistory writer) и `handleSaveMutagenesis`. Save button routed по mode. `switchMode` helper с confirm при накопленных mutations. +6 integration-тестов.

Тесты: 637 → **663** (+26). Build clean.

**Визуальная приёмка — partial.** K1/K3/K4 приняты. K2 технически правильный, но визуально обнаружены 4 проблемы (см. Sprint 1.6 в корневом `PROJECT_STATE.md` или `SESSIONS_2026_Q2.md` при следующей ротации) → доработки в Sprint 1.6 и далее в Sprint 1.7.

### Сессия 20.04.2026 — Визуальная приёмка Sprint 1 + планирование Sprint 1.5

Игорь провёл 8-блочную визуальную приёмочную сессию Sprint 1 на живом UI (25+ скриншотов).

**Sprint 1 принят формально** — ключевые фичи работают:
- V5 контраст annotation bar — подтверждено на pUC-like плазмиде с AmpR/ori/f1_ori
- V3 junction reset в context-menu — подтверждено
- V3-bulk: bulk-переключение всей сборки на GG — подтверждено
- V4 Wizard KLD — `IS001_mut_fwd_pET-23(+)` пара корректно сгенерирована с полным protocolSteps
- V4 in-place KLD на circular standalone — Q35A на CmR: single fragment + 2 мутагенезных олига сохраняются после auto-design re-run

**Найдены 7 новых багов, вне скоупа Sprint 1:**
- V14 (CRIT, арх) — `chooseStrategy` слеп к контексту фрагмента. Линейный фрагмент в сборке получает KLD вместо two_fragment.
- V12 (HIGH) — вкладки «Редактирование» и «Мутагенез» в FragmentEditor имеют одинаковый UI но разное поведение при Save → пользователь-ловушка, мутации с «Редактирования» теряются.
- V13 (HIGH) — кнопка «Мутагенез» в footer PlasmidViewer открывает пустой Wizard без template.
- V11 (MED) — KLD-праймеры приходят с `tmBinding: 0, gcPercent: 0` вместо расчёта через `calcTmNN`.
- V8 (MED) — CDS validation warnings перекрывают sequence view в PlasmidViewer на плазмидах с partial CDS (28+ warnings).
- V9 (LOW) — подписи коротких аннотаций (<10%) скрыты в annotation bar.
- V10 (LOW) — SBOL глифы в tree list бледные (fillOpacity 0.15 на 14px).

**V11, V12, V13, V14 сгруппированы в Sprint 1.5 «Мутагенез v2»** — спека в `docs/SPRINT_1_5_MUTAGENESIS_V2.md`. Архитектурное решение: top-level mode switcher в FragmentEditor разделяет bookkeeping-правку sequence (без мутаций) от реального мутагенеза (с strategy engine). `chooseStrategy` расширяется до `chooseStrategy(mutations, fragmentContext)` с учётом topology + isStandalone.

V8, V9, V10 записаны в BUGS как UX-долг для Sprint 3.

**Решение:** Sprint 2 (V7 InsertionClock + V1/V2/V6) откладывается до завершения Sprint 1.5. Причина: V7 InsertionClock зависит от корректной работы мутагенеза, InsertionClock US-2 (cursor по кольцу для выбора позиции мутации) не имеет смысла без правильной стратегии.

### Сессия 20.04.2026 — MUTWIZ-SANITIZE quick-fix

Мелкая, но архитектурно чистая правка: `MutagenesisWizard.jsx` использовал два legacy inline-regex (`/[^ATCGatcg]/g`, `/[^ATCG]/g`) в обход `sanitizeSequence` — нарушение контракта Этапа 1.1. Биологическая цена: saturation codons (NNK/NNN/MNN) молча стирались из template/insert-вводов.

Фикс: импорт `sanitizeSequence` + 2 onChange-замены + обновлённый placeholder insert-поля (подсказка про saturation). +3 integration-теста (`mutagenesis-wizard-sanitize.test.jsx`) через `@testing-library/react` с fetch-моком.

Тесты: 634 → **637 ✅** (+3). Build: clean. `MUTWIZ-SANITIZE` перенесён из OPEN/MED в FIXED.

### Сессия 19–20.04.2026 — Sprint 1: Читаемые метки, чистые стыки, настоящий мутагенез

**Три класса багов в одном спринте, 7 коммитов.**

1. ✅ **V5 contrast (`7521dcb`):** `getTextColor(bgHex)` helper + luminance-aware текст в `AnnotationEditor.jsx` annotation bar. 7 тестов.
2. ✅ **V3 junction reset (`50d8bf0`):** `resetJunctionForType(j, newType)` helper + 6 call-sites в `JunctionBlock.jsx`. 6 тестов.
3. ✅ **V3-bulk (`67ae2ee`):** `App.jsx:460` bulk GG-switch через тот же helper. 1 тест.
4. ✅ **V4 mutagenesis helper (`e0f48cd`):** `buildMutagenesisPayload(result, ctx)` чистая функция + `isMutagenesis` guard в `App.jsx` useEffect. 6 тестов.
5. ✅ **V4 Wizard path (`20e7df0`):** `MutagenesisWizard.onComplete` расширен (strategy/primers/protocol/warnings/templateName), `handleMutagenesis` через helper. 3 integration-теста.
6. ✅ **V4 overlap bridge (`ea96ca2`):** `local-primer-design.js` приоритезирует `junction.overlapSequence` над WT-флангами в split-mode. 2 теста.
7. ✅ **V4 in-place (`2f66348`):** `handleSaveFragment` переписан — computeMutagenesisStrategy выбирает KLD vs two/multi_fragment, дробит фрагмент на N с annotation split. No-PCR guard. 5 integration-тестов.

**Все визуальные проверки из спеки — подтверждены визуальной приёмкой 20.04.2026 (см. сессию в корневом `PROJECT_STATE.md`).**

Тесты: 604 → **634 ✅** (+30, совпало с прогнозом спеки ровно). Pytest: **112 ✅**. Build: clean на каждом коммите.

Новый MED баг в OPEN на момент закрытия: `MUTWIZ-SANITIZE` (MutagenesisWizard textarea не ходит через `sanitizeSequence`) — закрыт отдельной сессией 20.04.2026.

### Сессия 18.04.2026 — Этап 1.2: TYPE_MAP пересмотр в import-annotations.js

1. ✅ **Backend diff:** `snapgene_parser.py` `_TYPE_MAP['gene']: 'CDS'` → `'gene'` (1 строка). Pytest 112 ✅.
2. ✅ **REGION_TYPES расширен:** `gene`, `mRNA`, `tRNA`, `rRNA`, `ncRNA`, `misc_RNA`, `oriT`, `misc_binding`, `repeat_region`, `mobile_element`, `D-loop` (+11 новых).
3. ✅ **DETAIL_TYPES расширен:** `CAAT_signal`, `polyA_site`, `stem_loop`, `unsure` (+4 новых).
4. ✅ **TYPE_MAP переписан:** удалены ошибочные `gene/mRNA → CDS`, `oriT → rep_origin`. `gene` обрабатывается через `normalizeGeneType(feat)` по `/ncRNA_class` и `/product` (tRNA/rRNA regex).
5. ✅ **DETAIL_TYPE_MAP переписан:** `mat_peptide/domain/region → catalytic` заменены на identity, `transit_peptide → signal_peptide` → `transit_peptide`, `motif → binding` → `motif`. Новые: `CAAT_signal`/`GC_signal` → `core_promoter`, `polyA_site` → `poly_a`, `propeptide`/`disulfide_bond`/`stem_loop`/`unsure` явный identity.
6. ✅ **Gene-filter расширен:** `GENE_CHILD_TYPES` (CDS + 5 RNA-типов). Раньше фильтровал только CDS-children.
7. ✅ **`normalizeType(type, feat)`:** сигнатура расширена. Без `feat` — `gene` уходит в `misc_feature` (TYPE_MAP его не содержит).
8. ✅ **`EXON_BEARING_TYPES`:** `CDS`+`gene`+`mRNA` — покрывает intron-извлечение из `qualifiers.exons`.
9. ✅ **`extractColor`:** учитывает `ApEinfo_revcolor` для `strand === -1`.
10. ✅ **`strand: feat.strand || 1`** добавлен в 3 push-объекта (detail branch, point branch, unknown-heuristic detail), + в intron-push.
11. ✅ **`ANNOTATION_COLORS` +14 ключей:** mRNA/tRNA/rRNA/misc_RNA/oriT/repeat_region/mobile_element/D-loop, mat_peptide/transit_peptide/motif/region/unsure/stem_loop. `ncRNA`/`domain`/`gene`/`RBS` — не перезаписаны (уже существовали).
12. ✅ **Тесты:** +20 новых в `import-annotations-typemap.test.js` (red-first → green), 5 правок в `import-annotations.test.js` (обновлённые ожидания + фикстура `misc_RNA`→`weird_feature` т.к. `misc_RNA` стал known region).
13. ✅ **Известное ограничение:** legacy `catalytic` annotations из предыдущих импортов сохраняются как есть (information loss необратим, миграцию v7→v8 не делаем).
14. ✅ Vitest: **604 ✅** (было 583, +21), Build: ✅, Pytest: **112 ✅**.

### Сессия 18.04.2026 — Этап 1.1: Центральный sanitizeSequence

1. ✅ **P2-arch:** единая `sanitizeSequence` в `sequence-utils.js` + экспорт `IUPAC_DNA_REGEX`/`IUPAC_DNA_CHAR_REGEX`
2. ✅ Применено на **9 точках входа** (заявлено 7 — в процессе найдены 2 дополнительные: `file-import.js` backend `.dna` return + `AddFragmentModal.extractFeature` из API)
3. ✅ Удалён `AddFragmentModal.clean` helper (17 использований) — всё через `sanitizeSequence`
4. ✅ **P-wizard-iupac** (скрытый баг): `PlasmidUseWizard` использовал `[^ATGCN]` без IUPAC
5. ✅ **P-addfrag-iupac** (скрытый баг): `AddFragmentModal.clean = [^ATCGNatcgn]` + 2 raw textarea
6. ✅ Store migration v6→v7 с санитизацией legacy-данных
7. ✅ Удалены inline workarounds из `local-primer-design.js` (×3) и `PlasmidViewer.jsx`
8. ✅ **4 разных buggy-regex** схлопнуты в один источник через `IUPAC_DNA_REGEX`
9. ✅ Тесты: 583 ✅ (+28 новых), Build: ✅

Ожидание задачи Этапа 1.2 (TYPE_MAP пересмотр) от Claude Chat.

### Сессия 03.04.2026 (12) — Блок 11b: P1v2 + P3b

1. ✅ **P1v2** (CRIT): App.jsx useEffect не очищал stale-праймеры при fragments<2 → добавлен else-branch с clearance
2. ✅ **P3b** (HIGH): AnnotationEditor region opacity 0.5→0.9, detail 0.85→0.7 → яркие цвета + читаемый текст
3. 2 новых теста в crit-fixes.test.js
4. Тесты: 555 ✅, Build: ✅

### Сессия 03.04.2026 (11) — Блок 11: Bugfix P1-P5

1. ✅ **P1** (CRIT): handleUseWhole StrictMode double-fire → useRef guard + partId dedup
2. ✅ **P2** (HIGH): ∅ в primer sequences → sanitize regex в designPrimersLocal + overlapTail
3. ✅ **P3** (HIGH): Блёклые цвета при re-import → dedup regions в PlasmidMap (визуальная верификация нужна)
4. ✅ **P4** (HIGH): Нет аннотаций на PartBlock → migratePartAnnotations в handleUseWhole
5. ✅ **P5** (MED): Нет Карта/Стадион → inherit circular topology в handleUseWhole
6. 4 новых теста в crit-fixes.test.js
7. Тесты: 553 ✅, Build: ✅

### Сессия 03.04.2026 (10) — Блок 10d: B10 presetMode + PlasmidMap в wizard

1. ✅ PlasmidUseWizard: useEffect для instant actions (use_whole, view, disassemble, mutate, versions) → вызов напрямую вместо setStep
2. ✅ PlasmidUseWizard: mapFragments = [{whole plasmid}] (не массив регионов)
3. ❌ Claude Code не применил fix → Игорь исправил вручную (import useEffect + обе правки)

### Сессия 03.04.2026 (9) — Блок 10c: Circular Map регрессии

1. ✅ PlasmidMap: +onSelectRegion callback, +selectedRegionId prop
2. ✅ Sub-arc: id региона передаётся при клике
3. ✅ Подсветка выбранного sub-arc
4. ✅ Opacity/colors fix — увеличены контрастность

### Сессия 03.04.2026 (8) — Блок 10b: Circular Map Fix (B2/B9)

**Корневая причина:** PlasmidViewer передавал перекрывающиеся регионы как "фрагменты" → сумма длин > totalBp → арки > 360° → спагетти.

1. ✅ PlasmidViewer: mapFragments = [{whole plasmid with annotations}]
2. ✅ PlasmidMap: subArcs condition > 0 (было > 1)
3. ✅ PlasmidMap: assignSubTracks() для перекрывающихся sub-arcs

### Сессия 03.04.2026 (7) — Блок 10: Visual Testing Bugfix

1. ✅ B1: sanitize seq — strip non-ATGCN (BOM/null)
2. ✅ B8: RE cloning junction preview в wizard step 3
3. ✅ B10: useEffect presetMode sync (первая версия — неполная)
4. ✅ B13: creating guard + disabled для "Создать фланки" / "Создать на canvas"
5. ✅ B2/B9: assignTracks() + per-track radius (первая версия — недостаточная)
6. ✅ B11: SequenceViewer per-fragment color rendering
7. ✅ B16: stripHtml() в CatalogPanel
8. ✅ B19: Settings dropdown → useState + absolute top-full

### Сессия 03.04.2026 (6) — Блок 9: First-time User Flow Fixes

1. ✅ App.jsx: удалён fallback dead code
2. ✅ PlasmidViewer: 3 action buttons (clone/backbone/mutate) + onOpenWizard prop
3. ✅ ImportPrompt.jsx (NEW): "Импортируйте вектор" при пустой библиотеке
4. ✅ DesignCanvas: pendingAction + dismissed states, 4 варианта empty canvas

### Сессия 03.04.2026 (5) — Блок 8: HIGH фиксы + SnapGene каталог

**8a: HIGH фиксы:**
1. ✅ HIGH-3: Merge через ligation junction → block + warning
2. ✅ HIGH-9: reorderFragments в GG → re-design overhangs
3. ✅ HIGH-6: 1 fragment → info warning
4. ✅ HIGH-10: removeFragment junction count verified

**8b: SnapGene каталог:**
5. ✅ build_catalog_index.py → plasmids-index.json (867KB) + 19 category JSONs
6. ✅ CatalogPanel.jsx (NEW): поиск, фильтр, on-demand loading, actions
7. ✅ App.jsx: 📚 Каталог в header + showCatalog state
8. ✅ QuickStart: +catalog action

### Сессия 03.04.2026 (4) — Блок 7: SYSTEM_AUDIT CRIT фиксы

1. ✅ CRIT-4 + HIGH-1: flipFragment — GG overhang re-design + strand flip
2. ✅ CRIT-1: FragmentEditor applyDnaDel/Insert — annotation shift
3. ✅ CRIT-2: autoAnnotate useEffect (500ms debounce)
4. ✅ CRIT-5: warning text "merge (Ctrl+Click)" + short fragment warning
5. ✅ 6 новых тестов в crit-fixes.test.js

### Сессия 03.04.2026 (3) — Блок 6: UX Polish

1. ✅ ActionBar.jsx: sticky панель
2. ✅ App.jsx: header → ⚙️ Настройки dropdown
3. ✅ App.jsx: breadcrumb Проект → Сборка

### Сессия 03.04.2026 (2) — Блок 5: Quick Start + Smart Import

1. ✅ QuickStart.jsx (NEW): 7 action buttons
2. ✅ ImportDecisionModal.jsx (NEW): Smart Import при file drop
3. ✅ uiSlice + App.jsx + PlasmidUseWizard: presetMode bypass

### Сессия 03.04.2026 (1) — Блок 4b: Restriction Cloning → Canvas

1. ✅ restriction-db.js: +5 функций + 21 тест
2. ✅ local-primer-design.js: RE-тейлы на праймерах + 6 тестов
3. ✅ PlasmidUseWizard: restriction_cloning wizard
4. ✅ protocol-data.js: restriction_cloning template
5. ✅ CRIT-3 FIXED

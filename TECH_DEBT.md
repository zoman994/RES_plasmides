# TECH_DEBT.md — BodgeGene

Реестр технодолга, который влияет на эффективность разработки (Chat + Code + сам Игорь). Живой документ, обновляется при **финализации каждого спринта**.

**Расширенные архитектурные планы** (бэкенд/api.js audit, i18n cleanup, primer derivation, sequence components consolidation, Protocol AST) — `docs/archive/FUTURE_CLEANUP.md` (INBOX, в архиве с 26.04.2026, актуальны для v1.0 публикации и v1.1 рефакторинга).

**Читается:** при финализации спринта (Chat сверяет статусы) и когда Игорь спрашивает «что дальше». **Не** входит в стартовый пакет чтения (см. CHAT_PLAYBOOK_CORE.md §1).

**Формат записи:**
- `TD-ID` (статус): краткое описание.
  - **Эффект:** как мешает разработке прямо сейчас.
  - **Fix:** 1–3 строки предложения.
  - **Окно:** когда реалистично взяться.
  - **Фикс.:** дата / сессия.

Статусы: `OPEN` · `IN PROGRESS` (спека написана) · `DONE` (закрыто в указанном коммите).

---

## Файлы над size budget

Лимиты (⚓ ANCHORS.md, 22.04.2026): `.jsx` hard 40 KB / soft 30 KB; `.js` hard 25 KB / soft 20 KB; data-файлы без лимита.

### M-X.5 entries (07.05.2026)

- **TD-LIBRARYSINGLEINSPECTOR-DECOMP-V2** (OPEN, hard violation): `components/Library/inspector/LibrarySingleInspector.jsx` ≈ **45.94 KB** (hard 40 KB +5.94 KB over). M-X.2-fix снизил 44 → 32 KB; K6/K7/K10 wiring в v0.8.0 вернул к 45.94. Был closed как TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT at 32 KB — reopen.
  - **Эффект:** hard violation. LibrarySingleInspector — point of contact для всего edit-flow в Library workspace (K6 EDITABLE pill / K7 save actions / K10 manual-edit detection / K11 origin icons / SequenceView caret sync / TagsEditor / FeatureEditorModal launch). Любая правка одного блока рискует ломать другой. M-X.6 cleanup, M-C Container Window, TD-LIB-K10-CHARACTER-APPLY все попадают сюда — без декомпозиции файл превратится в untouchable.
  - **Fix:** extract в hooks: `useLibrarySaveFlow` (K7 overwrite + save-as-version), `useEditableModeToggle` (K6 read-only ↔ editable + pulsing dot), `useManualEditBranching` (K10 detection + confirm modal + branch creation). Title row + ActionsBar wire через хуки. Возможен отдельный `<LibraryInspectorTitleRow>` под title + EDITABLE pill + save actions (~6-8 KB). Цель: LibrarySingleInspector ≤ 28 KB (soft).
  - **Окно:** M-X.6 K0 (первым пунктом, ДО других K-step). Аналог TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT pattern.
  - **Фикс.:** 07.05.2026 (drift catch — Code не зафиксировал в отчёте v0.8.0; обнаружено в drift check сессии после compact).

- **TD-LIB-K2-DEAD-CODE-PURGE** (OPEN, hygiene, deferred from v0.8.0): MultiInspector.jsx (10.71 KB) + EmptyInspector.jsx (1.54 KB) + ActionsBar.jsx (7.90 KB) + SessionSummary.jsx (3.74 KB) — живые в `Library/inspector/`, но dead code после Library route переключения. Также: 'importer' callsites в Topbar / StartScreen / canvasSlice FULLSCREENS / ~15 test fixtures всё ещё используются (route alias DEC-LIB-K2-ROUTE-ALIAS-01 — historical baggage).
  - **Эффект:** confusing dead code в зоне actively-handling Library workspace. ~24 KB inactive .jsx + 'importer' alias путают reading. Risk: при следующем рефакторе Code может случайно ссылаться на dead-code component (тесты PASS т.к. покрыт, но dead путь). Deferred из v0.8.0 потому что aggressive purge во время Этап 2 user-facing rollout создал бы broken intermediate UX.
  - **Fix:** delete 4 файла + соответствующие тесты. Flip 'importer' callsites на 'library' (Topbar, StartScreen, canvasSlice FULLSCREENS, ~15 test fixtures). Удалить 'importer' route alias из FULLSCREENS array если все callsites flipped.
  - **Окно:** M-X.6 K1 (после LibrarySingleInspector decomp).
  - **Фикс.:** 07.05.2026.

- **TD-LIB-K10-CHARACTER-APPLY** (OPEN, functional gap, ⚓ DEC-LIB-12 promoted с partial impl): real character-level editing в SequenceView не работает. K10 wiring v0.8.0 landed — `createManualEditBranch` slice action + `useManualEditDetection` window-keydown hook + `ManualEditConfirmModal` создают branch entry «{name} (manual edit)», но новая branch identical к parent. Биолог нажимает букву в EDITABLE mode → modal → confirm → branch создан, но sequence НЕ изменён.
  - **Эффект:** S5 acceptance scenario заведомо fail. Семантика сломана для пользователя — pulsing dot, EDITABLE pill, confirm modal обещают character apply, но он не происходит. Биолог mutates annotations через FeatureEditorModal вместо character editing — workaround полупустой. ⚓ DEC-LIB-12 promoted в ANCHORS.md без полной реализации — нужен caveat либо closure через эту fix.
  - **Fix:** extension `useSequenceKeyboard.js` — после confirm-flow OK + branch created, accept keydown char и применить через store action (insert/replace/delete на baseSnapshot новой branch). Reuse существующих indel-aware highlights pattern. ~50-80 LOC + 5-8 тестов на keymap edge cases (insert mid / replace selection / delete with backspace / arrow nav после edit / undo).
  - **Окно:** M-X.6 K2 — блокирует honest S5 acceptance.
  - **Фикс.:** 07.05.2026.

- **TD-LIB-K4-VIEW-PREVIEW** (OPEN, UX polish, skipped в K4 minimal): per-file PlasmidMiniMap preview button в multi-import row. K4 minimal landed без preview — биолог в MultiImportView видит row с filename/topology/length/folder selector/annotation choice, без glance на содержимое.
  - **Эффект:** при batch import 5-20 файлов биолог не может быстро отличить «правильный pUC19» от «pUC19 с custom вставкой клиента» без открытия каждого по отдельности после импорта. Cognitive load высокий.
  - **Fix:** add preview button (eye-icon) в row, expand → inline 180×180 PlasmidMiniMap (existing component, тот же что в Library tree row hover). Reuse mini-map cache из catalog.
  - **Окно:** M-X.6 K12 polish.
  - **Фикс.:** 07.05.2026.

- **TD-LIB-K4-AUTO-TRIGGER** (OPEN, semantic gap, low priority): `ext.annotationChoice === 'auto'` в multi-import metadata recorded но не acted on. Сейчас auto работает de facto: biolog opens Library entry → AnnotationsTab embedded Annotator auto-runs L1 (existing pattern). Но это не explicit auto-trigger при first-open в LibrarySingleInspector — semantically `'auto'` choice обещает «без участия биолога», но requires AnnotationsTab mount чтобы fire.
  - **Эффект:** не блокер (auto работает defacto через AnnotationsTab). Но semantics неточная — biolog при batch import выбирающий 'auto' для 10 файлов ожидает что entries уже annotated при первом открытии, не «при первом mount AnnotationsTab».
  - **Fix:** в LibrarySingleInspector `useEffect` на mount: если `entry.ext.annotationChoice === 'auto'` && `!entry.ext.autoRun?.done` → trigger L1 через annotator-worker-client. Mark `entry.ext.autoRun.done = true` чтобы не повторять. ~30 LOC + 2 теста.
  - **Окно:** M-X.6 либо tactical ad-hoc fix.
  - **Фикс.:** 07.05.2026.

- **TD-LIB-PREIMPORT-LOCATION** (OPEN, cosmetic): `Library/PreImportModal.jsx` (21.51 KB) на top-level `Library/`, должен быть в `Library/import/` per K1 namespace plan.
  - **Эффект:** косметика. Reading misleads — PreImportModal logically часть import flow, должен жить рядом с MultiImportView.
  - **Fix:** `move_file` PreImportModal.jsx + соответствующего теста в `Library/import/`. Обновить импорты (~5-7 callsites).
  - **Окно:** M-X.6 K12 polish либо ad-hoc.
  - **Фикс.:** 07.05.2026.

- **TD-LIB-CATALOG-RENAME** (OPEN, cosmetic): `Library/catalog/` directory не renamed в `Library/lib/` per K1 plan. `catalog-cache.js`, `length-pattern.js` остались в catalog/, отдельно от других helper'ов в Library/lib/.
  - **Эффект:** косметика. Два helper directories вместо одного — confusing boundaries.
  - **Fix:** `move_file` содержимого `Library/catalog/` → `Library/lib/`. Обновить импорты.
  - **Окно:** M-X.6 K12 polish либо ad-hoc.
  - **Фикс.:** 07.05.2026.

- **TD-WRAP-KEYBOARD-NAV** (OPEN, functional gap, не блокер, зафлагирован Code в commit `c17899f`): `components/SequenceView/hooks/useSequenceKeyboard.js` line 131 делает `Math.max(0, Math.min(seqLength, next))` — клампит caret movement на seqLength boundary. Shift+ArrowRight/Down/PageDown/End через origin сейчас стопится на seqLength — биолог должен drag mouse'ом для extending selection через origin. Pointer-driven path (drag через origin) уже fixed в `c17899f`. Обнаружен Code в Step 3 auditе caret bridge fix.
  - **Эффект:** не блокер для primary use-case (drag selection через origin работает). Gap при keyboard-only nav: биолог keyboard-power-user (bug-rush #8 04.05.2026 «при перемещении каретки очень лагает») будет натыкаться. Несимметрия между mouse и keyboard nav — antipattern.
  - **Fix:** `useSequenceKeyboard.js` принимает `circular` flag в signature или выводит из store. Arrow{Left,Right}/PageUp/PageDown/Home/End расширяют caret arithmetic для circular: при `next > seqLength && circular` allow до `seqLength + (cpl - wrapAt)` (range bridge wrap-half). При `next < 0 && circular` allow до отрицательных (leading-wrap rows). Reuse extended-domain semantic из CaretOverlay/SelectionOverlay («caretPos < 0 → leading-wrap, > seqLength → trailing/bridge»). ~30-50 LOC + 5-7 тестов на keymap edge cases.
  - **Окно:** M-X.6 K3 (после K10 character apply landed, т.к. оба пути близкие — useSequenceKeyboard файл). Связан с TD-CIRCULAR-SELECTION (общая circular semantic).
  - **Фикс.:** 07.05.2026.

---

### M-X.2-fix entries (05.05.2026)

- **TD-ANNOTATIONTRACK-DECOMPOSE-V2** (OPEN, hard violation, escalated 07.05.2026): `components/SequenceView/tracks/AnnotationTrack.jsx` ≈ **48.54 KB** (hard 40 KB +8.54 KB over). M-X.2-fix K4 baseline был 41.6 KB; v0.7.3 wrap-tail rounds + v0.7.4 round-12..18 polish (DEC-WRAPTAIL-04/05, DEC-LAYOUT-PAINT-ONLY-01) добавили ~7 KB на trailing-wrap clip + bridge-aware rect logic + paint-only inset stripe. Drift не зафиксирован Code в отчётах v0.7.3/v0.7.4 — обнаружен в drift check сессии M-X.6 (07.05.2026).
  - **Эффект:** hard violation ⚓ ANCHORS.md 22.04.2026 продолжает расширяться. Любая правка одной фичи (sub-features rendering / SBOL glyphs / drag preview / hover indicators / multi-line chevrons / predicted-vs-confident styling / wrap-tail clipping / bridge-aware rect) рискует ломать другую — single jumbo SVG render body. Смежные правки в M-D Container Window и любой dragnext sprint затрагивающий AnnotationTrack попадут именно сюда. Скоуп decomp вырос — ≤22 KB main больше нереалистично без extract + bridge-aware logic split в отдельный helper.
  - **Fix:** extract `<RegionRect>` (~180 строк JSX — main rect + chevron + drag preview + glyph-paired-with-label + edge handles + hover indicators + bridge-wrap clip) + `<SubFeatureOverlays>` (~80 строк) + `<OverflowPill>` (~30 строк) + `useAnnotationStacker` хук (~80 строк) + `lib/annotation-bridge-clip.js` (~50 строк — bridge-aware coordinate math, отдельно от render). Цель: `AnnotationTrack.jsx` ≤ 26 KB (релакс target с 22 → 26 после v0.7.3/v0.7.4 расширения), `<RegionRect>` ≤ 9 KB. **Требует визуальной приёмки** (рисковая зона).
  - **Окно:** Sprint M-X.7 либо M-D Container Window first sprint trogan AnnotationTrack render. M-X.6 mini-cleanup НЕ покрывает — focus на Library inspector + character apply + keyboard nav.
  - **Фикс.:** 05.05.2026 (выявлено M-X.2-fix K4 deferred), обновлён 07.05.2026 (KB актуализирован 41.6 → 48.54, target relaxed, окно перенесено M-X.7+).

- **TD-SIZE-AATRACK** (OPEN, soft watch — новый 07.05.2026): `components/SequenceView/tracks/AATrack.jsx` ≈ **38.91 KB**, soft зона, 1.09 KB до hard 40 KB. Вырос в M-B.3 SequenceView rewrite (track-based AA codon rendering per (strand, frame)) + V50 reverse-strand fix (`buildCdsAAMap` strand=-1 path + walkCodons antisense).
  - **Эффект:** soft watch. Любой следующий sprint трогающий AA rendering (M-D Container Window codon picker, M-X.7+ wrap-tail-aware AA, frame translation polish) рискует прорыв hard. Tightly-woven render body как у AnnotationTrack — risk of repeat.
  - **Fix:** extract `useCdsAAMap` (existing logic ~120 строк) в `hooks/useCdsAAMap.js` + `<AACodonRow>` per-strand renderer + `lib/codon-walk.js` для walkCodons antisense logic. Цель: AATrack.jsx ≤ 28 KB.
  - **Окно:** перед M-D Container Window AA work либо при первом sprint расширяющем AA rendering. Сейчас не приоритет — track зрелый после V50 fix.
  - **Фикс.:** 07.05.2026 (drift check после v0.8.0 финализации).

- **TD-SIZE-SEQUENCEVIEW-INDEX** (OPEN, soft watch — новый 07.05.2026): `components/SequenceView/index.jsx` ≈ **38.52 KB**, soft зона, 1.48 KB до hard 40 KB. Root-component для всего SequenceView (caret + selection state aggregation + scroll API + tracks orchestration + settings popover wiring + wrap-tail mode switching).
  - **Эффект:** soft watch. Каждый M-X.3..v0.7.4 round добавлял по ~1-2 KB (caret extended-domain, body.caret-gliding gating, scroll-to-position, bridge wrap detection). M-X.6 K2 character apply + K3 keyboard wrap nav снова трогают index.jsx — высокий риск прорыва hard в одной из этих веток.
  - **Fix:** extract `useSequenceViewport` (scroll math + scrollIntoView + pendingScroll handling) + `useTracksOrchestration` (track visibility flags + render gating) + `lib/wrap-tail-compose.js` (wrap-tail row composition logic, currently inline). Цель: SequenceView/index.jsx ≤ 28 KB.
  - **Окно:** M-X.6 K0 LibrarySingleInspector decomp pattern прецедент; SequenceView/index decomp — кандидат на М-Х.7 либо при первом hard-violation triggered прорыве.
  - **Фикс.:** 07.05.2026 (drift check после v0.8.0 финализации).

- **TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT** (OPEN, soft warn): `components/Importer/inspector/SingleInspector.jsx` ≈ **32 KB** (soft 30 KB +2 KB over). M-X.2-fix K3 partial — Code extracted 3 хука из 4 запланированных (`useIdlePrewarm`, `useAnnotationUndoRedo`, `useFeatureEditorFlow`), `useSelectionStateInspector` остался inline.
  - **Эффект:** soft warn, не блокатор. Selection state ~3-4 KB — `cursorPos` / `cursorAnchor` / `cursorSelectionMode` / `cursorSelectionStrand` + `onBarSettle` / `onBarScrub` / `onCaretChangeFromView` / `onSelectRangeFromView` + `pendingScroll` + reset на plasmid switch. Любой следующий sprint расширяющий selection (M-X.3 wrap-tail, M-X.4 save UI, M-D Container Window) рискует balloon файла обратно в hard zone.
  - **Fix:** extract в `inspector/hooks/useSelectionStateInspector.js`. Signature: `useSelectionStateInspector({ activeTab, onActiveTabChange }) → { cursorPos, cursorAnchor, cursorSelectionMode, cursorSelectionStrand, pendingScroll, onPendingScrollHandled, onBarSettle, onBarScrub, onCaretChangeFromView, onSelectRangeFromView }`. ~3 KB hook + ~2 KB removed из SingleInspector → итого SingleInspector ≤ 28 KB (под soft 30).
  - **Окно:** при первом sprint'е после acceptance, который трогает selection state. Либо в M-X.4 Library Save Flow если новый «Save» button добавляется в title row рядом с selection counter (близкая зона).
  - **Фикс.:** 05.05.2026 (выявлено M-X.2-fix K3 partial).

- **TD-WRAPTAIL-RENDERING** (OPEN, фича-долг): SequenceView linear-вьюер circular плазмиды без визуальной непрерывности через origin. Биолог работает на стыке (primer hat 25 nt через origin) — упирается в конец, теряет контекст начала.
  - **Эффект:** регулярный pain point в primer-design workflow. Биолог использует workaround: переключиться в circular PlasmidMap, мысленно скопировать nucleotides, потом вернуться. Десятки раз в день при cloning — каждый context switch = risk of nucleotide miscount. Industry: SnapGene/Benchling делают только wrap-aware selection (TD-CIRCULAR-SELECTION ниже), не визуальную непрерывность.
  - **Fix:** рендерить 2-3 строки wrap-tail перед началом и после конца ленты с явным origin marker (horizontal line с подписью «1 / origin»). Edge case коротких плазмид: wrap-tail отключается когда `seqLength * lineHeight + 3 * lineHeight < viewportHeight` (плазмида + запас умещается → биолог уже видит всё). Origin marker показывается всегда. Не реализует selection через origin — это TD-CIRCULAR-SELECTION (отдельно). Тип B sprint, ~12-15 KB спека, ~5-8 KB патча.
  - **Окно:** Sprint M-X.3 после acceptance M-X.2 + M-X.4 Library Save Flow. Технически мог бы сразу после M-X.2-fix, но биолог приоритезировал save flow.
  - **Фикс.:** 05.05.2026 (выявлено в обсуждении wrap-tail vs infinite scroll vs selection через origin).

- **TD-CIRCULAR-SELECTION** (OPEN, фича-долг, industry-baseline): selection через origin не работает. Биолог не может одним движением выделить участок проходящий через позицию `seqLength → 0`. Sequence view's selection range нормализуется через `Math.min/max` — `start <= end` инвариант ломает wrap.
  - **Эффект:** industry-baseline функция (SnapGene release notes явно про «creating a new file from a wrap-around selection»; Benchling features могут wrap around plasmid). Без этого биолог делает два selection'а либо переключается в circular PlasmidMap. Workaround friction. Раздельно от TD-WRAPTAIL-RENDERING — это про data model + selection math, а не render.
  - **Fix:** поддержать `caret < anchor` как валидное wrap-state в `useSelectionState` + render двух прямоугольников в `AnnotationTrack` selection overlay когда `selectionRange.wraps` + Copy/Annotate/Edit operations поддерживают concat двух slice'ов (`seq.slice(start) + seq.slice(0, end)`). `applyAnnotationEdit` для region create — поддержать region с `start > end` (`annotation-model` сам должен это понимать). `wrapsOrigin: true` в `editedAnnotations` → проверить save-load round-trip (GenBank `join(4500..4537,1..18)` syntax — поддержан ли в `snapgene_parser` и backend save flow). ~200-400 строк патча. Тип B sprint, 10-15 KB спека.
  - **Окно:** Sprint M-X.4 либо позже. Не блокирует M-X.3 wrap-tail (разные задачи).
  - **Фикс.:** 05.05.2026 (выявлено в industry research SnapGene/Benchling).

- **TD-LIBRARY-WRITE-API** (OPEN, M-X.4 prerequisite): функция `updateLibraryEntryAnnotations` удалена из `librarySlice.js` в M-X.2-fix K1 (вместо «оставить с JSDoc deprecated» как просила спека). При implementation M-X.4 «Library Save Flow» нужно re-implement с правильной семантикой explicit save action.
  - **Эффект:** не блокатор сейчас (Library annotations stay frozen, biolog edits живут только в perFileEdits). Но M-X.4 спека должна явно начинаться с re-implement этой функции либо двух новых: `overwriteLibraryEntry(id, annotations, { versionBump })` для overwrite-with-version-counter + `cloneLibraryEntryAsVersion(id, annotations, { parentEntryId })` для save-as-new-version (с ссылкой на parent).
  - **Fix:** в M-X.4 K1 — добавить две функции в librarySlice. `overwriteLibraryEntry` инкрементит `entry.version` (counter int), persist через `putLibraryEntry`. `cloneLibraryEntryAsVersion` создаёт новую entry с новым UUID, `parent_entry_id` ссылка, `version = parent.version + 1`. JSDoc явно: «explicit save flow only, NOT call from edit dispatcher».
  - **Окно:** M-X.4 K1.
  - **Фикс.:** 05.05.2026 (выявлено в M-X.2-fix Code report — function удалена вместо deprecated).

### Pre-M-X.2 entries

Актуальный снимок: 05.05.2026 (после M-X.2-fix). **`AnnotationTrack.jsx` 41.6 KB hard violation** (deferred K4) + **`SingleInspector.jsx` 32 KB soft warn** (selection state inline). M-X.2-fix закрыл `SingleInspector.jsx` 44 → 32 KB и `uiSlice.js` 27.17 → 13.84 KB.

Предыдущий снимок 02.05.2026: **`PlasmidMiniMap.jsx` 10.13 → 24.95 KB** (+14.82 KB за v0.6.4 + v0.7.0 — palette A+v2 интеграция, drag handle, React.memo wrapper, hover-overlay polish, label truncate, leader-labels в catalog tree row). PlasmidUseWizard.jsx 38.79 KB / DesignCanvas.jsx 36.67 KB / AddFragmentModal.jsx 35.05 KB / PlasmidMap.jsx 34.94 KB / PartsPalette.jsx 29.75 KB / **JunctionBlock.jsx 29.23 KB** (новый soft кандидат) / **ProtocolTracker.jsx 28.35 KB** (новый soft кандидат) / Importer/index.jsx 21.89 KB (в зелёной зоне после v0.7.0 catalog tree rewrite, был 23.4 KB на M-B.2 acceptance).

- **TD-SIZE-PLASMID-MINI-MAP** (OPEN, soft warning escalated): `components/PlasmidMiniMap.jsx` ≈ **24.95 KB** — вырос +14.82 KB за время v0.6.4 + v0.7.0 (palette A+v2 интеграция в inline mini-map mode, React.memo + custom-comparator, hover-overlay polish, label truncate, leader-labels packing, drag handle).
  - **Эффект:** вырос в 5 раз за полтора месяца (3.96 → 10.13 → 24.95). Всё ещё в soft зоне (5 KB до порога 30 KB), но рост не останавливается — следующий спринт вероятно приведёт в hard.
  - **Fix:** вынести leader-labels logic (`positionLabels`, `assignLeaderLabels`) в `lib/leader-labels.js` (~5 KB); custom tooltip оставить внутри. Альтернатива: extract memo'изированный SVG path-renderer в sibling-component (выигрыш perf плюс size).
  - **Окно:** перед любой правкой PlasmidMiniMap.jsx в M-C/M-D Container Window (в той спеке первым пунктом декомпозиция).
  - **Фикс.:** 27.04.2026 (warning signal), обновлен 02.05.2026 (эскалация в active soft watch).

- **TD-SIZE-JUNCTION-BLOCK** (OPEN, soft watch — новый 02.05.2026): `components/JunctionBlock.jsx` ≈ **29.23 KB**, почти в soft 30 KB. v0.7.0 не трогал этот файл, но фиксация на этом snapshot'е важна — junction логика расширялась в Restriction Cloning + Plasmid-Git, работа в этой зоне ждёт в M-E (Mix Workspace).
  - **Эффект:** soft watch. Перед любой правкой файла — декомпозиция.
  - **Fix:** extract `JunctionDNARenderer.jsx` и `junction-validation.js` в sibling файлы.
  - **Окно:** перед M-E Mix Workspace работой.
  - **Фикс.:** 02.05.2026 (новый).

- **TD-SIZE-PROTOCOL-TRACKER** (OPEN, soft watch — новый 02.05.2026): `components/ProtocolTracker.jsx` ≈ **28.35 KB**, soft зона. Работа ждёт в M-E (Mix Workspace) и M-G (остальные reactions) — этот файл почти гарантированно будет расширяться.
  - **Fix:** extract step-renderer и protocol-AST helpers в sibling файлы.
  - **Окно:** Sprint M-E Mix Workspace.
  - **Фикс.:** 02.05.2026 (новый).

- **TD-SIZE-PLASMID-USE-WIZARD** (OPEN, soft): `components/PlasmidUseWizard.jsx` ≈ **38.79 KB** — soft-зона, 1.21 KB до hard.
  - **Эффект:** 10 режимов работы (view/use/restriction/replace/disassemble/extract/mutate/insert/delete/versions) в одном файле. Любая новая операция с плазмидой идёт сюда — высокий риск прорыва hard.
  - **Fix:** вынести каждый режим в `components/plasmid-wizard/<mode>.jsx` (router-паттерн), оставить `PlasmidUseWizard.jsx` как диспетчер с выбором режима.
  - **Окно:** v1.1 (не критично до появления нового режима; если вводится 11-й режим — декомпозиция first).
  - **Фикс.:** 22.04.2026 (новый пункт, ранее был в DECISIONS «Архитектурная гигиена» как граничная зона, повышен до активного).

- **TD-SIZE-DESIGN-CANVAS** (OPEN, soft): `components/DesignCanvas.jsx` ≈ **36.77 KB**, soft-зона.
  - **Эффект:** 4 view modes (blocks/sequence/map/racetrack) + split-group containers + junction routing в одном файле. Каждая правка view modes требует полного чтения.
  - **Fix:** вынести 4 view modes в `components/canvas/<mode>.jsx`, оставить `DesignCanvas.jsx` как router по `viewMode`.
  - **Окно:** Sprint 2b, после `TD-SIZE-APP`.
  - **Фикс.:** 21.04.2026, обновлено 27.04.2026 (38.44 → 36.77 KB после Kfix-7 удаления legacy `+ Добавить фрагмент` empty-state).

- **TD-SIZE-ADD-FRAGMENT-MODAL** (OPEN, soft): `components/AddFragmentModal.jsx` ≈ **35.05 KB**, soft-зона.
  - **Эффект:** модалка добавления фрагмента с extractFeature-API, sanitize, IUPAC regex syncing с курсором. Смешаны три подсистемы (UI form, API call, cursor sync).
  - **Fix:** вынести `useExtractFeature` hook (API) + `useCursorSync` hook (IUPAC regex) + сам модал как форма.
  - **Окно:** v1.1, после Sprint 2b.
  - **Фикс.:** 22.04.2026 (новый пункт, ранее был в DECISIONS как граничная зона).

- **TD-SIZE-PLASMID-MAP** (OPEN, soft): `components/PlasmidMap.jsx` ≈ **34.29 KB**, soft-зона, стабилизировался после Map-WS-1 cycle.
  - **Эффект:** сейчас ещё читаемо. Риск — Map-WS-2/3/4 добавит primer overlays и inline мутации, файл уйдёт за hard.
  - **Fix:** перед Map-WS-2 проверить размер; если рост >5 KB — декомпозиция (subarc rendering, RE labels, feature tracks в отдельные модули).
  - **Окно:** перед Map-WS-2.
  - **Фикс.:** 21.04.2026, обновлено 22.04.2026.

- **TD-SIZE-PLASMID-MINI-MAP** (OPEN, warning signal): `components/PlasmidMiniMap.jsx` ≈ **10.13 KB**, soft-зона (далеко от 30 KB), но вырос +6.17 KB за один спринт (3.96 → 10.13).
  - **Эффект:** порог «rise-per-sprint» signal CLAUDE.md §7 (>5 KB) превышен. Рост из Kfix-4 (custom React tooltip + leader-labels + click-overlay 180 px для малых карт) + V37 mini-fix (`<title>` → `aria-label` refactor). Сам по себе не проблема — файл продолжает быть читаемым (~280 строк). Сигнал: в следующем спринте (предположительно V38 пакетный либо Sprint UX-1 polish) следить за ростом.
  - **Fix:** при превышении ~15 KB — вынести leader-labels helper в отдельный модуль (`leader-labels.js`); custom tooltip оставить.
  - **Окно:** отслеживать при каждом спринте, затрагивающем PlasmidMiniMap.jsx.
  - **Фикс.:** 27.04.2026 (новый пункт по Sprint Import-Start-Screen финализации).

---

## Координационные файлы

Без регламента §4 (CHAT_PLAYBOOK_APPENDIX.md) раздуваются естественно.

- **TD-DOCS-ROTATION** (OPEN, регламент активен): BUGS.md / PROJECT_STATE.md / RELEASES.md / DECISIONS.md / ANCHORS.md растут без ротации.
  - **Эффект:** стартовый пакет чтения каждой сессии растёт. После реструктуризации 01.05.2026: ~ 60 KB обязательные (CLAUDE 18 + BUGS 1.5 + CURRENT_TASK 6 + PROJECT_STATE 11 + DECISIONS 4 + CHAT_PLAYBOOK_CORE 20). RELEASES и ANCHORS по запросу.
  - **Fix:** CHAT_PLAYBOOK_APPENDIX.md §4 регламент (архивация в `docs/archive/*_HISTORY.md` при финализации нового спринта). Якоря ⚓ в ANCHORS.md не переезжают; sprint-level в DECISIONS.md старше 2 спринтов → archive; RELEASES.md при 30 KB / 10 версий → archive.
  - **Окно:** ежеспринтно, автоматически при финализации.
  - **Фикс.:** 21.04.2026, обновлено 22.04.2026, обновлено 01.05.2026 (реструктуризация: PROJECT_STATE→snapshot only + RELEASES.md, DECISIONS→split на ANCHORS+DECISIONS, CHAT_PLAYBOOK→CORE+APPENDIX).

- **TD-SPECS-ARCHIVE** (OPEN, регламент активен): реализованные спеки копятся в `docs/`.
  - **Эффект:** лимит 8 активных файлов в docs/ (CLAUDE.md §6). Текущий `docs/` — в бюджете.
  - **Fix:** CHAT_PLAYBOOK_APPENDIX.md §4 — при финализации спринта реализованные спеки в `docs/archive/` с пометкой `✅ РЕАЛИЗОВАНО [дата]`.
  - **Окно:** ежеспринтно.
  - **Фикс.:** 21.04.2026, обновлено 22.04.2026.

---

## Системные

- **TD-A11Y-CATEGORY-BUTTONS** (OPEN, системный): кнопки категорий в catalog tree (`CatalogPanel.jsx`) не подхватывают `aria-label`. Chrome MCP `read_page` interactive показывает их безымянными (`ref_38..ref_57`).
  - **Эффект:** screen readers не объявляют имя категории; тесты/visual acceptance через Chrome MCP испытывают трудности при идентификации кликабельных элементов каталога. Не блокирует основные use-cases — системный ловушечный фикс «a11y baseline».
  - **Fix:** добавить `aria-label={category.name}` (с count в скобках) на `<button>` каждой категории в `CatalogPanel.jsx`. Проверить аналогичные паттерны в `CatalogTree.jsx` (legacy) и `PartsPalette.jsx` — единый a11y-baseline для всех tree-list кнопок.
  - **Окно:** v1.0 publication-prep либо отдельный a11y-baseline mini-fix (~30 мин Code). Не включён в Sprint Catalog Polish по решению Игоря.
  - **Фикс.:** 28.04.2026 (при приёмке IS-Final).

- **TD-USER-MEMORIES-DRIFT** (OPEN, режим «ручное выравнивание при финализации спринта»): userMemories имеют два источника — автогенерируемые Anthropic-side (асинхронно, с лагом в 1–2 сессии) и ручные edits Chat'а через `memory_user_edits` (мгновенно). При финализации спринта вручную перезаписываю записи о версии / коммитах / тестах / последнем спринте — это держит memory в синхроне с PROJECT_STATE.md.
  - **Эффект:** при отсутствии ручного выравнивания Chat может наложить устаревший фон на реальность (напр. 22.04.2026 было: memory знала v0.2.6-alpha / ~480 тестов, реально было v0.5.1-alpha / 886 тестов). Режим ручного выравнивания этот риск снимает — на 26.04.2026 memory содержит свежие записи v0.5.2-alpha / 958 тестов / Sprint X cycle, синхронно с файлами.
  - **Fix:** §5 playbook (сверка с файлами на старте сессии) + de-facto практика с 22.04.2026: при финализации спринта Chat обновляет memory через `memory_user_edits replace` на записях версии / спринта / свежих ⚓-решений. **Предложение Игорю:** прописать это явным пунктом в CHAT_PLAYBOOK_APPENDIX.md §4 «Регламент архивации и пост-мортем» (сейчас там 6 пунктов, добавить 7-й: «Обновить userMemories через memory_user_edits replace»). **Болевой урок 26.04.2026:** в этой сессии Chat при обновлении самого TD-USER-MEMORIES-DRIFT записал «дрейф достиг 3 минорных, пересоздание memory стало обязательным» — без вызова `memory_user_edits view` перед этим. Проверка показала реальный дрейф = 0 (memory уже синхронна после ротации). **Правило:** любое обновление этого TD-пункта начинается с `memory_user_edits view` и сверки с PROJECT_STATE.md. Ровно тот паттерн, что зафиксирован ⚓ ANCHORS.md «тесты side-effect функций проверяют конечный observable state, не spy на вызове» — ходячая иллюстрация.
  - **Окно:** ежеспринтно при финализации + в любой момент по запросу. Пересоздание memory «с нуля» — не требуется пока ручное выравнивание работает (работает 22.04 + 26.04).
  - **Фикс.:** 21.04.2026, обновлено 22.04.2026, обновлено 26.04.2026 (режим сменён на «ручное выравнивание» после сверки view-ом).

- **TD-IMPORTER-NO-ID** (OPEN, компенсируется в read-path): импортёры (`snapgene_parser.py`, `auto-annotate.js`, catalog через `PlasmidUseWizard → use whole`) не генерируют `id` для annotations.
  - **Эффект:** был root cause D1 FAIL приёмки Map-WS-1-fix (21.04.2026). Read-path fix в Map-WS-1-fix-B K4.1 (`getRegions` генерирует deterministic id-fallback) закрывает симптом, но write-path остаётся «грязным» — старые сохранённые проекты тоже без id.
  - **Fix:** на write-path `crypto.randomUUID()` при парсинге .dna/GenBank. Read-path normalize остаётся как safety net для legacy `.bodgegene` проектов.
  - **Окно:** v1.0.
  - **Фикс.:** 21.04.2026 (Map-WS-1-fix-B §4 архитектурное решение 2).

- **TD-ARCH-ANNOTATION-VERSIONING** (IN PROGRESS, направление выбрано 27.04.2026, ожидает спеки): Plasmid-Git версионирует только sequence-mutations; annotations — derived state, manual edits затираются при следующем replay.
  - **Эффект:** блокирует V40 (manual annotation editor) и делает Sprint X+1 (panel истории) архитектурно неполным. Скрытый bistable баг: редактирование аннотаций работает до первой sequence-мутации (`f.annotations` ещё прямой), потом резко ломается после bootstrap. Актуален для всех фрагментов с commits[] — биолог не получает «версии аннотаций» в panel истории и не может toggle annotation off без удаления.
  - **Направление:** variant (A) — annotations как first-class commits в едином `commits[]` (⚓ ANCHORS.md, изначально записано 27.04.2026, блок Sprint Annotation-Commits). Расширение `commit.type` на add_annotation/remove_annotation/edit_annotation, применяются в replay после indel-shifts. parentPos в baseline-coords + sanity-warning policy на UI-слое.
  - **Fix:** Sprint Annotation-Commits — расширение plasmid-git.js (~7 KB → ~12–15 KB в hard 25 KB), новые reducers в plasmid-git-reducers.js, V40 wiring AnnotationEditor.onChange на reducers, +30–50 unit tests, lazy bootstrap при first-mutation-OR-first-annotation-edit. Спека 25–30 KB. Перед спекой — kickoff-интервью по финальному набору commit-типов + sanity-warning N nt + разделение со Sprint X+1 (предложение: разделить — data-model + V40 в Annotation-Commits, panel в X+1).
  - **Окно:** следующий спринт после mini-fix-2 (V38+V39+V41) — V40 блокирован этим TD, не может идти раньше.
  - **Фикс.:** 27.04.2026 (выявлен в сессии «режим размышления» по вопросу Игоря «в рамках ГИТ мы учитываем аннотацию как версионирование?»).

- **TD-POSTMORTEM-PRACTICE** (OPEN, регламент активен): циклы спека→Code→приёмка с ≥2 итерациями FAIL-fix не документировались.
  - **Эффект:** уроки из Sprint 1.7 (копипаст кода в спеке, 85 KB) и Map-WS-1 (не проверенное предположение про id) извлекались вручную. Без систематики теряются через 2–3 спринта.
  - **Fix:** CHAT_PLAYBOOK_APPENDIX.md §4 пункт 6 (post-mortem 2 строки в версионный блок RELEASES.md при ≥2 итерациях). Первый пост-мортем по Map-WS-1 cycle (3 итерации) был записан 22.04.2026 в PROJECT_STATE.md (исторически — до реструктуризации 01.05.2026).
  - **Окно:** ежеспринтно, при финализации.
  - **Фикс.:** 21.04.2026, обновлено 22.04.2026 (первое применение практики, см. PROJECT_STATE.md §«Post-mortem» в сессии Map-WS-1 cycle).

- **TD-PROCESS-OUTPUTS** (OPEN, новый 30.04.2026): артефакты, выработанные в текущей Claude-сессии в `/mnt/user-data/outputs/`, **не персистентны** между сессиями. Когда tool-budget кончается до завершения работы — патчи / новые файлы / drawio из outputs утрачиваются вместе с sandbox. Прошлая сессия 29.04.2026 потеряла `bodgegene_windows_v2.drawio`, `PATCH_DECISIONS.md` (DEC-V2-01..27 формулировки), `PATCH_TECH_DEBT.md`, `PATCH_CHAT_PLAYBOOK.md` (§15-16), `CURRENT_TASK.md (M-A wireframe selection)` — пришлось воссоздавать с нуля в текущей сессии 30.04.2026.
  - **Эффект:** при незавершённой сессии работа уходит в null. Восстановление из Project Knowledge snapshot покрывает только текстовые документы, проиндексированные на момент snapshot — патчи и binary файлы теряются полностью.
  - **Fix:** **правило для Chat** — каждый ценный артефакт писать **сразу на диск Игоря** через `Filesystem:write_file`, а не складывать в outputs. Outputs использовать только как промежуточное хранилище в рамках одной сессии. Бинарные файлы (drawio, png, pdf) — попросить Игоря загрузить / сохранить вручную в репо немедленно после генерации. Документировано в CHAT_PLAYBOOK_APPENDIX.md §15.
  - **Окно:** немедленно (правило вступает в силу с 30.04.2026).
  - **Фикс.:** 30.04.2026 (post-mortem Sprint Project-Model FINAL цикла 29.04 → 30.04).

- **TD-BODGE-FILE-ASSOCIATION** (OPEN, future feature 01.05.2026, low priority): ассоциация `.bodge` файлов с приложением (double-click `.bodge` в проводнике → открывает BodgeGene PWA standalone window). Базируется на Web App Manifest File Handling API (W3C, Chromium с мая 2022). Требуется для удобства биолога — сейчас .bodge открываются только через `↑ Open .bodge…` кнопку в StartScreen.
  - **Эффект:** не блокер. После M-A.1 PWA install у биолога есть standalone окно, но double-click `.bodge` в проводнике пока открывает архиватор (ZIP по ассоциации `.bodge` → ZIP).
  - **Fix:** ~30–45 минут Code. Расширение `manifest.webmanifest` через `vite-plugin-pwa` config: добавить поле `file_handlers` с MIME `application/vnd.bodgegene.bodge+zip` + accept `.bodge` + `launch_type: 'single-client'`. В `App.jsx` подписка на `window.launchQueue.setConsumer` → reuse `openBodge` handler. UX: при уже-открытом проекте + double-click нового `.bodge` — modal «Save current project before opening new?» (dirty state guard). Только Chromium (Chrome / Edge / Brave); Firefox / Safari API не поддерживают, fallback — кнопка Open в StartScreen.
  - **Окно:** отдельный mini-spec Sprint M-A.3 после M-A.2 i18n-prep, либо включить в milestone где будет работа с file system access (M-B Importer).
  - **Фикс.:** 01.05.2026 (зафиксирован по запросу Игоря «запомнить чтоб не забыть»).

- **TD-CTRL-N-OS-FALLBACK** (OPEN, known limitation 01.05.2026, low priority): в standalone PWA окне Ctrl+N с открытым ProjectInfoModal/SettingsModal — K1 modal guard корректно блокирует handler `'new-project'`, `runHotkeyResolver` возвращает false, `event.preventDefault()` НЕ вызывается. Chrome подхватывает Ctrl+N как OS-fallback и открывает новое browser-окно (обычное, не standalone). Modal остаётся открытым, проект не создаётся.
  - **Эффект:** не блокер. При визуальной приёмке 01.05.2026 Игорь подтвердил интерпретацию как «new feature» / known limitation. Альтернативный сценарий (Ctrl+N в standalone открывает новое standalone окно BodgeGene) был бы логичнее, но Chrome OS-handler перехватывает Ctrl+N как window-create без различия standalone-vs-browser.
  - **Fix (отложен, trade-off):** `event.preventDefault()` в `runHotkeyResolver` при modal-block блокнёт OS-fallback в standalone — но тоже блокнёт OS-fallback в обычном Chrome tab где это не нужно (Chrome сам перехватывает ⋌N раньше любого listener'а). Нужен обдуманный подход — определить is-standalone через `window.matchMedia('(display-mode: standalone)')` и preventDefault только в standalone. ~5 строк + 2 теста.
  - **Окно:** отложено до накопления фактов (биологи на user-testing отмечают «new window confused me» либо нет). Без фактов — known behavior, не приоритет.
  - **Фикс.:** 01.05.2026 (обнаружен при визуальной приёмке Sprint M-A.1).

- **TD-DRAG-DROP-LIBRARY-CARDS** (OPEN, M-H polish 02.05.2026, low priority): drag-and-drop библиотечных cards (уже-импортированных LibraryEntry) между папками в v0.7.0 catalog tree работает только для drag handle ⋮⋮ на ItemRow (MIME `application/x-bodgegene-item-id`) — это ок, но drag обычным кликом по карточке (как в проводнике) НЕ работает — биолог должен искать handle.
  - **Эффект:** не блокер. UI mental model file-manager'а нарушена. На v0.7.0 baseline (~50 entries) не видно как проблема, при 100+ entries + глубоких folder tree биолог будет жаловаться.
  - **Fix:** перенести `draggable` attribute с inner `<span>` на wrapper `div.item-row`. Riski: Chrome/Vivaldi не пускают HTML5-drag из `<button>` (повод выбрать handle), но wrapper-левел div без этого ограничения. ~1 час Code + 2 теста.
  - **Окно:** Sprint M-H Library polish.
  - **Фикс.:** 02.05.2026 (зафиксирован в v0.7.0 RELEASES и в PROJECT_STATE шапке).

- **TD-PER-CDS-SIGNALIP** (OPEN, M-D feature 02.05.2026, medium priority): on-demand signal peptide / propeptide аннотация при клике на CDS region. v0.7.0 auto-annotate cleanup (DEC-AA-01) убрал auto-detect signal_peptide / propeptide из `annotateCDS` — биолог: «отдельно при нажатии на CDS можно выбрать через сигнал IP». Функции `detectSignalPeptide` / `detectPropeptide` в `domain-detection.js` остались. Нужен UI: action «Annotate signal peptide» в CDS region context menu в AnnotationsTab + Container Window → вызывает detector + добавляет child detail аннотацию.
  - **Эффект:** AnnotationsTab toolbar `📥 Авто-аннотация` кнопка сейчас disabled stub (RELEASES.md v0.7.0). Биолог не может вручную вызвать per-CDS detector до M-D.
  - **Fix:** Sprint M-D Container Window. UI: на region selection (CDS) — inline action в toolbar AnnotationsTab «Annotate signal peptide / propeptide / domain». Backend reuse: `detectSignalPeptide(seq, frame)` возвращает result или null. ~3-4 часа Code.
  - **Окно:** Sprint M-D Container Window.
  - **Фикс.:** 02.05.2026.

- **TD-ONBOARDING-INTRO-VIDEO** (OPEN, M-J Onboarding milestone 02.05.2026, ideation): первый запуск программы — 15-25 сек product-trailer overlay (CLICK HERE NOW → cut → x10 нарезка основных функций: + New Project / drag-drop импорт / catalog tree expand / mini-map spin / annotations pop / sequence scroll / DAG connect / Mix Workspace / Save .bodge → fade to logo). Pattern проверен у Linear / Arc / Raycast — выигрывают конверсию first-impression. Технически: `<video autoplay muted loop>` в onboarding overlay, skip button с первого кадра, persistent flag `bodgegene-onboarding-played` в localStorage, re-watch через Settings.
  - **Эффект:** не блокер. Биолог сейчас открывает программу с пустым StartScreen и должен догадываться что делать. SnapGene first-run wizard выигрывает на этом моменте — ведёт за руку через первый импорт.
  - **Fix:** видео-ролик 15-25 сек (нужен video editor / motion designer либо AI-tool generated через Runway / Pika / Sora). Onboarding overlay component в `components/Onboarding/` (~3-4 файла). Persistent flag через localStorage (zustand persist либо direct).
  - **Окно:** Sprint M-J Onboarding & First-Run Experience (новый milestone между M-I DAG polish и v0.9 публикацией). Связан с CTA-дизайном (Pornhub-orange amber на onboarding-only screen — явный antipattern для recurring actions, но perfect fit для one-time onboarding).
  - **Фикс.:** 02.05.2026 (зафиксирован по итогам M-B.3 spec write сессии, биолог shoutout: «click here NOW и дальше быстрый ролик с х10 нарезкой основных функций»).

- **TD-MINE-TAG-GROUPING-DEPRECATED** (OPEN, M-H polish 02.05.2026, low priority): в M-B.2 «Моя библиотека» группировалась по `entry.tags` с sub-groups «Без тегов N» / «ТегX N» в CatalogColumn (default approval Chat'а). Биолог на визуальной приёмке 02.05.2026: «таги вообще лишнее, пока поиск по тегам не реализован». v0.7.0 catalog tree rewrite (DEC-CAT-01..04) заменил tag-grouping на folder-as-slash-path в `userFoldersByGroup`. Теги на LibraryEntry остаются, но UI их больше не рендерит как иерархию.
  - **Эффект:** не блокер. tags-as-data работает в TagsEditor при импорте, но без search/filter UI биолог не может «найти все bacterial backbones» через tag.
  - **Fix:** Sprint M-H — search bar + tag-filter chip-bar в Library / Importer Catalog (часть TD-LIBRARY-SEARCH-SORT-BULK). При этом решение: tag-as-grouping (вернуть как optional toggle «Группировать по тегам» в catalog header) или tag-as-filter only (chip bar наверху «Моей библиотеки»).
  - **Окно:** Sprint M-H Library polish.
  - **Фикс.:** 02.05.2026 (post-mortem default approval §10.1 был ошибкой Chat'а — не проверил что tag-search infrastructure готова. v0.7.0 catalog tree rewrite фактически исправил выбор без Chat-spec — antipattern 7 из CHAT_PLAYBOOK §6 «эстетика подменяет функцию»).

- **TD-LIBRARY-CLEANUP-PENDING-DELETES** (OPEN, M-H polish 01.05.2026, low priority): при close tab до auto-dismiss timeout entries с `_pendingDelete: true` записаны в IndexedDB и остаются там без автоматической очистки после нового session start. `selectVisibleLibraryEntries` фильтрует их в UI, но в самой базе они накапливаются.
  - **Эффект:** не блокер — entries фильтруются на selector-уровне и не видны биологу. При длительном use-pattern (сотни удалений с close tab до timeout) база раздувается. Спека SPRINT_M-A-3.md §8.4 явно отложила GC на M-H.
  - **Fix:** новый helper `cleanupPendingDeletes()` в `db/dexie-schema.js`: при hydrate проходит по всем entries с `_pendingDelete: true`, вызывает `deleteLibraryEntry(id)` для каждого (commit). Альтернатива: TTL-поле `_pendingDeleteAt: timestamp` + GC по возрасту (больше кода, но правильнее semantically — не commit'им свеже помеченные из другого tab'а). ~10 строк + 2 теста.
  - **Окно:** Sprint M-H Library polish (после M-B/C/D/E/F/G core).
  - **Фикс.:** 01.05.2026 (по итогам финализации Sprint M-A.3).

- **TD-LIBRARY-PERSISTED-TAG-DB** (OPEN, M-H polish 01.05.2026, low priority): tag suggestions в `TagsInlineEditor` берутся из `selectAllLibraryTags(state)` — derived из текущего in-memory libraryEntries слайса. Сортировка by frequency, паттерн из ProjectInfoModal. Нет cross-project Tag-DB persistence — теги видны только от entries в текущей IndexedDB браузер-сессии.
  - **Эффект:** не блокер в v0.6 (биолог просто не видит suggestions пока не добавит несколько tagged entries вручную). Не блокирует M-B.1 (Importer будет создавать entries с пустыми tags по default).
  - **Fix:** выбор между вариантами: (a) отдельный store `tagDb` в IndexedDB с историей всех когда-либо использованных тегов + freq counter, write-on-add, list-on-suggest; (b) periodic rebuild из живых entries (proще, но пустые библиотеки теряют historical tags); (c) поле `Project.tags` и `LibraryEntry.tags` объединить в общий derived suggestions pool. (a) или (c) реалистичнее.
  - **Окно:** Sprint M-H, либо раньше если биолог в user-testing скажет «tag suggestions не работают как я жду».
  - **Фикс.:** 01.05.2026 (по итогам финализации Sprint M-A.3).

- **TD-LIBRARY-SEARCH-SORT-BULK** (OPEN, M-H polish 01.05.2026, low priority): Library skeleton M-A.3 осознанно опускает advanced фичи — спека SPRINT_M-A-3.md §3 IN фиксирует: нет search bar по name/tags, нет sort options (только default by addedAt desc), нет bulk-select / multi-delete, нет dedup при reimport (M-B.1 получит базовый dedup-prompt, advanced «library-wide canonical entries» — M-H).
  - **Эффект:** не блокер при либрарии <50 entries (visual scan). При 100+ entries (реальный use-pattern биолога после 6+ месяцев работы в BodgeGene) Library становится неудобной без search/sort.
  - **Fix:** сводная спека «Library M-H polish»: (1) `<input type="search">` в LibraryToolbar с fuzzy match по name + tags — derived в selector; (2) sort dropdown «Added recent / Added oldest / Name A-Z / Name Z-A / By tag count» — sort в selector; (3) bulk-select mode через чекбоксы на row-hover или long-press, панель «Delete N» / «Export N» в toolbar (multi-soft-delete паттерн из DEC-MA1-02); (4) library-wide canonical entries — обнаружение дубликатов по seq-hash при import, промпт «уже есть в library: pUC19 (added 3 days ago), use existing? / add as duplicate? / replace?». Спека ~15-20 KB.
  - **Окно:** Sprint M-H Library polish (после M-B/C/D/E/F/G core).
  - **Фикс.:** 01.05.2026 (по итогам финализации Sprint M-A.3).

- **TD-SEQUENCEVIEW-SHIFT-SELECTION** (OPEN, M-D Container Window 04.05.2026, medium priority): Shift+arrow расширение нативного выделения в SequenceView (Range API + window.getSelection манипуляции).
  - **Эффект:** mouse-drag selection работает через existing useRowSelectionIsolation, но клавиатурное расширение selection (стандартный текст-эдитор паттерн) не реализовано. Биолог не может precision-extend selection с клавиатуры — приходится использовать мышку или начинать сначала с правильной позиции.
  - **Fix:** Range API (`window.getSelection().modify('extend', 'forward', 'character')`) либо custom selection model в SequenceView state (selectionStart + selectionEnd + caretAnchor + extendDirection). Custom модель проще интегрируется с existing caret + selection separation. ~50–80 LOC + 5–8 тестов на keymap edge cases.
  - **Окно:** Sprint M-D Container Window (там SequenceView станет first-class editor + потребуется precise selection editing).
  - **Фикс.:** 04.05.2026 (зафиксирован в Sprint M-B.3 §3 OUT и в документе сессии 04.05 «Что отложено явно»).

- **TD-SEQUENCEVIEW-FOCUS-RING** (OPEN, low priority 04.05.2026): visible focus-ring на SequenceView root container при tab-фокусе.
  - **Эффект:** SequenceView root с tabIndex={0} принимает keyboard focus, но `outline:none` подавляет visible focus indicator. Индикатор фокуса сейчас — движущаяся каретка, что работает только когда биолог уже знает что компонент сфокусирован. Tab-навигация через Importer сейчас «скрытно» переходит в SequenceView без visual cue — a11y-issue.
  - **Fix:** добавить ring CSS через CSS-vars (не Tailwind hardcode) на focus-visible state SequenceView root. ~10 LOC + 1 visual test.
  - **Окно:** v1.0 publication-prep либо параллельно с TD-A11Y-CATEGORY-BUTTONS как a11y-baseline mini-fix.
  - **Фикс.:** 04.05.2026.

- **TD-LINEAR-BAR-PREDICTIONS** (OPEN, M-X.1 либо M-X.2 04.05.2026, medium priority): ORF-предсказания computed в SequenceView (через runPredictors useMemo на M-X.1 K3) не пробрасываются в LinearFeatureBar.
  - **Эффект:** биолог видит predicted ORFs unfilled+dashed contours в SequenceView нуклеотидной view, но на навигационной колбасе их не видит — нельзя быстро drag-scrubbed к predicted CDS, нельзя оценить на overview уровне сколько predicted regions на плазмиде. **Релевантно для M-X.1 acceptance §6:** если acceptance ожидает что биолог увидит predicted на колбасе — этот пункт включается в скоуп M-X.1 K4.
  - **Fix:** propagate `predictedRegions` array из SequenceView consumer (после mergeWithPredicted) в SingleInspector → LinearFeatureBar via prop. LinearFeatureBar расширяет render на predicted-style (dashed border, italic tilde-prefixed label при hover). +behavioral test `linear-feature-bar.test.jsx::renders predicted regions with dashed style`. ~30–50 LOC + 3–4 теста.
  - **Окно:** Sprint M-X.1 K4 (если acceptance §6 так требует) либо M-X.2 (если M-X.1 ограничивается SequenceView only).
  - **Фикс.:** 04.05.2026 (зафиксирован в документе сессии 04.05 «Что отложено явно»).

---

## Расширение auto-annotate БД (запросы 03.05.2026 evening)

- **TD-ADDGENE-API-PENDING** (OPEN, blocked on external approval — 03.05.2026): Игорь подаёт Access Request на developers.addgene.org для scope «Bulk Download: Plasmids with Sequences».
  - **Эффект:** Sprint Addgene Integration не может стартовать без approval'а. Approval workflow: создать addgene account → подать request с описанием use case → 5 рабочих дней review → accept Data Access License → получить token (1 год валидности).
  - **Path:** официальный API. Daily-refreshed JSON dump с ~172k plasmids, parsed sequences + features + metadata. PI names strip'нуты для приватности. Бесплатно для non-profit и for-profit.
  - **Альтернативы исключены:** scraping откинут как нарушение ToS Addgene (login wall на sequences = non-public portion + commercial restrictions для derivative works = публикация в JOSS / Bioinformatics была бы liability'ю).
  - **Risk:** approval может быть denied по sanctions для российских institutions (ToS clause 4 про jurisdictions). Если denied — fallback план через NCBI GenBank + JBEI ICE без Addgene.
  - **Use case text для request'а:** «BodgeGene — open-source plasmid design tool for biology education in Russian universities. Auto-annotate feature library construction. Non-commercial academic use. Will properly attribute Addgene as data source.»
  - **Окно:** Sprint Addgene Integration после approval (~неделя от подачи). Если denied — TD закрывается, scope перераспределяется на NCBI / JBEI.
  - **Фикс.:** запись 03.05.2026 evening, ожидание Igor подаст request.

- **TD-OPEN-PLASMID-REPOS** (OPEN, planning — 03.05.2026): расширение auto-annotate БД через открытые источники + локальная коллекция полных плазмид как fallback. Запрос Игоря: текущие 419 features недостаточны для general-purpose редактора, цель ~1500-3000 features через clean legal sources.
  - **Effect:** auto-annotate в Importer пропускает много стандартных features (особенно fungal-specific, mammalian, некоторые promoter / terminator варианты). Биолог при импорте чужой плазмиды получает sparse annotation, требуется ручная правка.
  - **Sources mapped (legal status verified 03.05.2026):**
    - **NCBI GenBank** — public domain (US government, no copyright). E-utilities API, no approval. **PRIMARY external source.** BioPython `Bio.Entrez` уже в stack. Targeted queries: Aspergillus / Trichoderma / Pichia / Yarrowia + common cloning backbones (pET, pUC, pGEM, pBR322, pcDNA, pmKate2, etc).
    - **JBEI ICE Public Registry** (public-registry.jbei.org) — Modified BSD license. REST API. High-quality JBEI-curated. Format: GenBank / FASTA / SBOL2. Auto-annotate built-in (для inspiration). Sizing меньше GenBank, но качество выше.
    - **iGEM Registry** (parts.igem.org / registry.igem.org) — CC-BY-SA. ~26000 parts (мостоло standard biological parts: promoters / RBS / terminators, не full plasmids). Готовый downloader: GitHub `Edinburgh-Genome-Foundry/igem-registry-downloader` (CC0). **Лицензия требует проверки совместимости** с BodgeGene LICENSE до integration'а — ShareAlike clause означает что derivative works (common-features.json содержащий iGEM data) тоже должны быть CC-BY-SA.
    - **DNASU** (dnasu.org) — academic non-profit, smaller scope, ORF focus.
  - **Sources excluded:**
    - **FGSC** (fgsc.net) — physical strain repository only, no digital bulk download. Полезен Игорю как fungal biotech researcher (можно заказывать reference Aspergillus / Trichoderma штаммы), но irrelevant для auto-annotate БД.
    - **PlasmidScope** (plasmid.deepomics.org), **IMG/PR** (img.jgi.doe.gov) — research databases для microbial ecology / metagenomics. Wrong scope для cloning-tool BodgeGene.
  - **Storage strategy** (open question для следующей сессии):
    - вариант (a) — отдельные `scripts/open_plasmids/{ncbi,jbei,igem}/` директории + отдельные build scripts (clean separation, parallel SnapGene workflow);
    - вариант (b) — унифицированный `scripts/external_plasmids/` с category subdirs;
    - вариант (c) — только feature extraction в common-features.json без хранения full plasmids.
    Игорь склонился к (a)+(c) комбо — полная коллекция плазмид как fallback safety net + features в auto-annotate БД.
  - **Roadmap order** (предложение):
    1. Sprint NCBI GenBank Integration — clean legal path, fungal-focused queries (~6-8 ч Code).
    2. Sprint JBEI ICE Integration — secondary, после NCBI прокачки (если синтетическая биология coverage нужна).
    3. Sprint iGEM Registry — license compatibility check first (если CC-BY-SA OK для BodgeGene LICENSE).
    4. Sprint Addgene Integration — после approval (отдельно, см. TD-ADDGENE-API-PENDING).
  - **Dependency:** не стартует до закрытия M-B.3 visual review + Sprint Snapgene Refresh K1..K5 + push commits. Sprint NCBI должен быть **отдельной сессией** после v0.7.1 финализации.
  - **Окно:** spring 2026 (после Snapgene Refresh + M-B.3 finalization).
  - **Фикс.:** 03.05.2026 evening (planning entry).

- **TD-CAZY-INTEGRATION** (OPEN, planning — 03.05.2026): автоматическая классификация гликозидных гидролаз (и в целом carbohydrate-active enzymes) при импорте плазмиды в CAZy семейства с порогом гомологии ≥60%. Профильная история для FIC RAS лаборатории (Aspergillus / Trichoderma промышленно экспрессируют именно carbohydrate-active enzymes — целлюлазы, ксиланазы, хитиназы).
  - **Background:** CAZy database классифицирует ~480 семейств carbohydrate-active enzymes по сходству последовательностей и структурной homology: ~190 GH (Glycoside Hydrolases), ~115 GT (Glycosyltransferases), ~16 PL (Polysaccharide Lyases), ~16 CE (Carbohydrate Esterases), ~85 AA (Auxiliary Activities), ~85 CBM (Carbohydrate-Binding Modules). Classification — это family-level (homology + evolution), не per-enzyme.
  - **Personal hook для Игоря:** GH18 — chitinase family, прямо тема его кандидатской (cloning хитиназ из Drosera / росянок). Industrial relevance: GH7 (cellobiohydrolase, Trichoderma reesei CBHI/Cel7A), GH5 (endo-glucanase), GH11 (endo-xylanase), GH18 (chitinase), GH10 (xylanase). Aspergillus и Trichoderma — major fungal biofactories именно для этих enzymes.
  - **Threshold ≥60% identity:** консервативный порог для family-level classification. Реально CAZy works at >50% identity often, иногда даже 30-40% (с careful curation). 60% — надёжный, низкий false-positive rate.
  - **Technical approach options** (open question для следующей сессии):
    - **Approach A (HMMER + dbCAN):** backend integration через `pyhmmer` (Python wrapper) + dbCAN HMM profiles (готовые, distributed by dbCAN3 server). При импорте plasmid → translate каждый CDS → HMMER scan против CAZy HMM profiles → если match с E-value < 1e-10 + identity ≥60% → annotate как «GH18 — chitinase family». Самый точный путь, ~100-200 MB HMM database (gitignored локально, downloaded by setup script).
    - **Approach B (reference seqs + similarity search):** скачать representative sequences для каждой CAZy family (5-10 best characterized members per family) → включить в common-features.json → при импорте использовать существующий auto-annotate.js similarity search. Проще, использует existing infrastructure, но менее accurate чем HMMER.
    - **Approach C (гибрид Tier 1 + Tier 2):** Tier 1 (reference seqs для quick lookup в common-features.json, fast in-browser) + Tier 2 (HMMER backend для precise classification по запросу пользователя при unclear / borderline cases). Лучшая точность за разумную complexity.
    Default proposal: Approach C, обсудить в следующей сессии.
  - **Scope priorities** (open question):
    - все ~480 CAZy families, или только industry-relevant subset (GH5/7/10/11/18/26 + select GT)?
    - GH families приоритетны (Игорь тематика), GT/PL/CE/AA/CBM — опционально.
  - **Data sources for CAZy:**
    - **dbCAN3** (bcb.unl.edu/dbcan3) — automated CAZy annotation server, distributes HMM profiles per family. Open source.
    - **CAZy main site** (cazy.org) — нужно проверить current public access status (раньше был полностью public, недавно появлялись ограничения).
    - **CUPP** (Conserved Unique Peptide Patterns) — alternative classifier, опционально.
  - **Linked future TDs (parallel специализированные классификации):** MEROPS (peptidases / proteases — для chymosin, signal peptidases), Pfam / InterPro (general-purpose domain annotation для остального). Не в этом TD, но логически parallel.
  - **Bundle size implications:** Approach A — backend HMMER не влияет на frontend bundle. Approach B — common-features.json вырастет на ~100-200 KB (representative seqs за CAZy family). Approach C — middle ground.
  - **Окно:** Sprint CAZy Integration — отдельная сессия, ~10-15 ч Code, **после** Sprint NCBI GenBank Integration (TD-OPEN-PLASMID-REPOS roadmap step 1). Может быть параллельно если выберем Approach B (только common-features.json правки).
  - **Фикс.:** 03.05.2026 evening (planning entry, agenda для следующей сессии).

---

## DONE (последний квартал)

Закрытые позиции переезжают сюда, чтобы был прогресс перед глазами. Старше 2 кварталов — в `docs/archive/TECH_DEBT_HISTORY.md`.

- **TD-V49-IMPORTER-HANG** (DONE — M-B.2 K4 коммит `4351552`, 02.05.2026): 50-секундный hang на default open Step2Combined (5333 bp, 12 регионов) закрыт через lazy-mount табов. SequenceTab и AnnotationsTab создаются ТОЛЬКО при `activeTab === 'X'` через React conditional render `{activeTab === 'sequence' && <SequenceTab />}`. Default tab `'overview'` рендерит лёгкий PlasmidMiniMap + categorized summary inline (~50-100 nodes). Regression-guard: `Importer/inspector/__tests__/lazy-tabs.test.jsx::default-overview-no-annotation-editor` PASS. **⚓ вынесен в ANCHORS.md DEC-IMP-15 как инвариант для всех fullscreen tab UIs (M-D / M-E / M-H).**

- **TD-V05-IMPORTSTARTSCREEN-DELETE** (DONE — M-B.2 cleanup, 02.05.2026): legacy `components/ImportStartScreen/` (89 KB, 10 файлов) удалён в процессе M-B.2 cleanup, подчищены orphan-строки STRINGS в v0.7.0 (`actionLibraryCopy`/`AutoAnnotateOn|Off`/`catalogBack`/`MineFlatLabel`/`ShowAll|Less`). v0.6 frontend не импортирует ImportStartScreen нигде в живом коде.

- **TD-HOTKEY-MODAL-GUARD** (DONE — Sprint M-A.1 K1 коммит `9ffdf2d`, 01.05.2026): modal guard добавлен в `lib/hotkeys.js::runHotkeyResolver` (~10 строк). `MODAL_BLOCKED` Set к которым применяется guard когда `modals.projectInfo || modals.settings`: `'new-project'`, `'open-bodge'`, `'close-project'`, `'open-settings'`, `'project-info'`. `'escape'` и `'save-bodge'` проходят. +2 регрессии-теста в `hotkeys.test.js`. Остаётся известное OS-поведение в standalone PWA (Chrome подхватывает Ctrl+N как OS-fallback) — вынесено в отдельный TD-CTRL-N-OS-FALLBACK выше.

- **TD-PROJECTINFO-SUGGESTIONS-NOTESTS** (DONE — Sprint M-A.1 K2 коммит `ca20869`, 01.05.2026): 3 теста tag suggestions добавлены в `ProjectInfoModal.test.jsx` — (a) excludes already-added tags from suggestions; (b) sorts suggestions by frequency then alphabetically; (c) click on suggestion adds tag and removes it from suggestions. Размер файла 5.14 → 7.60 KB.

- **TD-EXPORT-DELETE-NOTESTS** (DONE — Sprint M-A.1 K3 + K5 коммиты `39af2b4` + `aac0b53`, 01.05.2026): K3 добавил 4 теста в `StartScreen.test.jsx` (handleNewProject createProject + openProjectInfo order, export toggle exportMode + header text, checkbox click selectedIds + counter, exportMode скрывает delete ×). K5 реимплементировал delete-flow из confirm в soft-delete + 2 теста (`delete shows toast with undo, project hidden from list`, `undo callback restores project to list`). 2 устаревших confirm-flow теста удалены. Суммарный размер файла 13.08 → 16.94 KB. handleExportSelected loop тест отложен на M-B (по fake-timers + mock writeBodge + spy downloadBlob).

- **TD-PWA-SETUP-DEFERRED** (DONE — Sprint M-A.1 K4 коммит `facd425`, 01.05.2026): `vite-plugin-pwa@1.2.0` установлен (с `--legacy-peer-deps` из-за React 19 peer-conflict; `@testing-library/dom` переустановлен явно). `manifest.webmanifest` с name BodgeGene + theme `#f59e0b` + display standalone + start_url `/`. 3 финальные иконки (192/512/512-maskable) отрендерены из `docs/branding/logo.svg` (Hybrid B утверждён Игорем) через sharp + детерминированный скрипт `gui/designer/scripts/render-pwa-icons.mjs`. SW workbox `generateSW` + `registerType: 'autoUpdate'` + precache 34 entries (25.78 MiB) + `navigateFallback: '/index.html'` + `maximumFileSizeToCacheInBytes: 5 MiB` (для plasmids-index.json ~867 KB). `lib/pwa-install.js` захватывает beforeinstallprompt + expose `canPromptInstall()` + `promptInstall()`. Footer-кнопка «Install as desktop app» рендерится при `canInstallPwa: true`. Иконка в Windows taskbar Hybrid B, standalone-окно открывается без Chrome chrome.

- **TD-TOAST-UI-MINIMAL** (DONE — Sprint M-A.1 K5 коммит `aac0b53`, 01.05.2026): инлайн `<ToastBar/>` в App.jsx (~20 строк) заменён на Notion-style queue: `components/Toast/{Toast.jsx,ToastStack.jsx,toast-icons.jsx,index.jsx}` (4 файла ~5.2 KB). Bottom-left placement (24 px), dark fill `#262626` в обеих темах, 4 иконки, manual close, undo button, stack capacity 3 (FIFO drop), `column` ориентация (newest внизу по Notion / Linear / Sonner). Store API: `showToast(msg, kind, options) → id`, `clearToast(id?)` overload (clear all или by id). Auto-dismiss timer в `Toast.jsx::useEffect` + opt-in `onUndo` / `onAutoDismiss` callbacks (⚓ паттерн DEC-MA1-01 и DEC-MA1-03 в DECISIONS.md). +8 тестов в `Toast.test.jsx`. App.jsx 9.49 → 8.66 KB (похудел).

- **TD-CMD-W-VIVALDI-LIMITATION** (DONE — Sprint M-A.1 K4 через PWA install, 01.05.2026): standalone PWA окно отключает большинство Chrome-уровневых хоткеев — Ctrl+W теперь попадает в приложение и закрывает проект (подтверждено на визуальной приёмке). Vivaldi PWA install icon остаётся best-effort (known limitation Vivaldi PWA support, target-браузеры Chrome / Edge / Firefox). Ctrl+N в standalone — отдельный TD-CTRL-N-OS-FALLBACK (выше).

- **TD-TOOLS-DRAWIO** (DONE — ARCHITECTURE_v2.md §3.7 + §12, M-A wireframe сессия 30.04.2026 до старта wireframe генерации): `.drawio` подход заменён на встроенный Mermaid-код-блок прямо в документ, version-controllable в git и рендерится в GitHub.
  - **Путь:** новая §3.7 «Схема навигации (Mermaid)» с flowchart TD: 2 корня (Start/DAG) + 5 фулскринов (Container/Mix/Library/Importer/PrimerStand) + 1 fullscreen modal (CrossImport) + 4 drawer'а. Push transitions сплошными стрелками, overlay/drawer пунктирными. Условные обозначения + «что не показано» (modals/popups/back-edges) в проседающих пунктах под диаграммой. Ссылка в §12 обновлена — зачёркнут drawio + явный redirect «§3.7 этого документа». Реализовано одним атомарным `Filesystem:edit_file` (2 правки) по §16 playbook'а.
  - **Урок:** `.drawio` бинарные неудобны для local-first dev workflow без выделенного diagram-tool сервиса — Mermaid в Markdown решает 90% случаев визуализации навигации/архитектуры с нулём infrastructure overhead. Применять Mermaid как default для всех диаграмм окон/потоков; drawio оставить только для случаев где Mermaid выразительности не хватает (детальные схемы алгоритмов).

- **TD-SIZE-APP** (DONE — Sprint App-Decomp коммиты `301db04` + `b155e03`, 28.04.2026): `App.jsx` 40.39 KB → **30.56 KB** (−9.83 KB, soft с люфтом ~9.5 KB до hard).
  - **Путь:** K1 `ModalStack.jsx` (7.91 KB, 14 modals JSX-блок + 24 selectors через `useStore.getState()`-паттерн, 7 props вместо ожидаемых 12–15) + K2 `hooks/useAppEffects.js` (4.35 KB, side-effects extraction). Рефактор без поведенческих изменений, 978/978 Vitest, build clean. **K2 выполнен** хотя спека разрешала skip при K1 <32 KB — даёт ~10 KB headroom для будущих спринтов.
  - **Остаток:** App.jsx остаётся корневым root-component'ом (canvas wiring + бредкрамбы + ActionBar + project-flow router); любой рост выше 32 KB в будущих спринтах — сигнал пересмотреть разделение ответственностей.
  - **Урок (кодифицирован в DECISIONS.md ⚓ 28.04.2026):** ModalStack 7.91 KB вместо прогноза 12–15 KB — паттерн «UI/modal-компоненты читают store actions/setters через useStore.getState() напрямую, через props идут только composite handlers». Code этот паттерн уже применял в PartsPalette/DesignCanvas; отклонение от спеки (15 → 7 props) принято без оговорок.

- **TD-MUTATION-MODEL** (DONE — Sprint X cycle, 24–26.04.2026): `fragment.mutations[]` → Plasmid-Git (`baseSnapshot` + `commits[]` + `HEAD` + replay). Закрыты три открытых симптома:
  - **V22 HIGHLIGHT-INDEL-TAIL** (Высокий): indel в sub-фрагменте давал ложный красный хвост до конца. Закрыт архитектурно — indel-aware highlights из commit op + start/end, не из positional diff applied vs parent.
  - **V24 SINGLE-CIRCULAR-NO-PRIMERS** (Высокий): single-circular self-closure не генерировал primers (early-return в `local-primer-design.js` при `fragments.length < 2`). Закрыт extension'ом в Sprint X-fix K5 — пара праймеров с overhang-tails для физического самозамыкания.
  - **V27 MUTATION-DELETE-NO-REVERT** (Высокий): кнопка ✕ в Mutations panel убирала мутацию из списка, но не откатывала sequence. Закрыт через toggle `applied: bool` на уровне commit + replay пересчитывает sequence/Tm/GC%.
  - **Коммиты:** Sprint X K1–K6 + Sprint X-fix K1–K6 в составе baseline `16c58c5`; Sprint X-fix-2 commits `0f8211b` (`applyMutationsBatch` reducer) + `1bd69f4`; Sprint X-fix-3 commit `4292506` (corrected `pushUndo` timing).
  - **Реализация:** новый `lib/plasmid-git-reducers.js` (5.02 KB) + extension `local-primer-design.js` + workflow rewire `FragmentEditor::handleSaveMutagenesis`. **3 новых ⚓ в DECISIONS.md** (Plasmid-Git data model / `pushUndo` synchronous capture / тесты side-effect функций по конечному observable state).
  - **Pre-existing pushUndo timing баг** (Sprint X-fix-3): snapshot снимался внутри setTimeout-callback через 300мс после вызова. На одиночных user-actions (паузы >300мс) не проявлялся. Симптоматически всплыл на batch-apply из Sprint X-fix-2. Fix: module-level `_pendingSnapshot`, sync capture при первом вызове в окне + очистка в `undo()`/`redo()`.
  - **Урок:** три симптома (V22/V24/V27) + pre-existing pushUndo timing баг — результат одного фундаментального недостатка. Архитектурный фикс закрывает все под одной шапкой вместо трёх латок (V22 highlights, V24 primers, V27 ✕-button); выход 4 итерации (пост-мортем в PROJECT_STATE.md сессия 26.04.2026) — результат недостаточно покрытых entry-points в новую модель и тестов spy-вызова-вместо-результата.

- **TD-SIZE-FRAGMENT-EDITOR** (DONE — Sprint 2a.1 коммит `8699bf5`, 23.04.2026): `components/FragmentEditor/index.jsx` снят с hard-лимита: **62 KB** (Sprint 1.7) → **46 KB** (Sprint 2a, 7 модулей вынесено) → **35.57 KB** (Sprint 2a.1 EditorPanels extract). Hard 40 KB закрыт.
  - **Путь:** Sprint 2a (коммиты K1–K7) разобрал `FragmentEditor.jsx` на 8 файлов: `highlights.js` (3.54 KB), `color-palette.js` (1.35 KB), `region-types.js` (2.82 KB), `FullViewGrid.jsx` (2.31 KB), `AAMutationPopup.jsx` (5.17 KB), `DnaMutationPopup.jsx` (5.97 KB, c `NucTooltip`), `SequenceGrid.jsx` (7.67 KB), `index.jsx` (46.0 KB). Sprint 2a.1 (коммит `8699bf5`) добавил `EditorPanels.jsx` (9.39 KB) — вынос Annotations/Mutations/Protein collapsible panels.
  - **Остаток:** `index.jsx` = 35.57 KB, под soft 30 KB, т.е. в soft-зоне (выше 30, ниже 40). Кандидат на дальнейший вынос `useFragmentEditorState` hook — **только если появится повод** (новая фича, крупная правка handlers). Без триггера не трогаем.
  - **Урок:** декомпозиция должна закрывать hard-лимит целиком в спеке (⚓ ANCHORS.md, изначально 23.04.2026 — «Архитектурная гигиена» п.2); math «на глаз» в Sprint 2a привела к необходимости хвоста 2a.1. Трейсабильность — `docs/archive/SPRINT_2A_FRAGMENTEDITOR_DECOMP.md` §3 (OUT-прогноз ≤22 KB для index.jsx оказался ошибочным).

---

## Регламент обновления

При финализации каждого спринта Chat (в следующей сессии после коммитов Code) делает:

1. Проверяет, не закрылся ли пункт с `OPEN` → переносит в DONE с указанием коммита/спринта.
2. Проверяет новые находки из RELEASES.md (версионный блок + post-mortem при ≥2 итерациях, CHAT_PLAYBOOK_APPENDIX.md §4 пункт 6) — добавляет свежие `TD-*` сюда.
3. Обновляет оценки размеров в «Файлы над size budget» по последнему отчёту Code (там Code выдаёт KB-дельту на каждый затронутый файл) или через `list_directory_with_sizes`.

Если три спринта подряд ни одного изменения — значит, регламент не работает (файл мёртв). Сигнал обсудить с Игорем.

---

_Создан 21.04.2026 (выделено из CHAT_PLAYBOOK_APPENDIX.md §10, исторически §10 playbook'а до сплита 01.05.2026). Последнее обновление: 01.05.2026 (реструктуризация документации: ссылки на CHAT_PLAYBOOK_CORE/APPENDIX, ⚓ в ANCHORS.md, post-mortem в RELEASES.md вместо PROJECT_STATE.md журнала; TD-DOCS-ROTATION/SPECS-ARCHIVE/USER-MEMORIES-DRIFT/POSTMORTEM-PRACTICE/PROCESS-OUTPUTS обновлены)._ _Предыдущее: 01.05.2026 (Sprint M-A.3 финализация). Добавлены 3 новых OPEN: TD-LIBRARY-CLEANUP-PENDING-DELETES (GC `_pendingDelete: true` entries при hydrate, M-H), TD-LIBRARY-PERSISTED-TAG-DB (cross-project Tag-DB persistence, M-H), TD-LIBRARY-SEARCH-SORT-BULK (advanced search/sort/bulk-select/library-wide dedup, M-H). Рамка v0.6 M-A.3 baseline: 788 Vitest, 0 новых нарушителей size budget; все Library/* файлы green-zone (.jsx soft 30 KB), librarySlice.js 4.68 KB green._ _Обновление 01.05.2026 (Sprint M-A.1 финализация). Закрыты 6 OPEN entries → DONE: TD-HOTKEY-MODAL-GUARD (K1 `9ffdf2d`), TD-PROJECTINFO-SUGGESTIONS-NOTESTS (K2 `ca20869`), TD-EXPORT-DELETE-NOTESTS (K3+K5 `39af2b4` + `aac0b53`), TD-PWA-SETUP-DEFERRED (K4 `facd425`), TD-TOAST-UI-MINIMAL (K5 `aac0b53`), TD-CMD-W-VIVALDI-LIMITATION (K4 PWA standalone). 1 новый OPEN: TD-CTRL-N-OS-FALLBACK (low priority, known limitation в standalone PWA Chrome OS-fallback). Size budget: все файлы в лимитах, App.jsx даже похудел 9.49 → 8.66 KB._ Обновлен 22.04.2026: TD-SIZE-FRAGMENT-EDITOR → DONE, TD-SIZE-APP повышен до критически-близко-к-hard, добавлены TD-SIZE-PLASMID-USE-WIZARD и TD-SIZE-ADD-FRAGMENT-MODAL, актуализированы размеры всех остальных пунктов. Обновлён 26.04.2026: TD-MUTATION-MODEL → DONE (V22/V24/V27 закрыты Sprint X cycle), размер `store/index.js` 10.70 → 12.06 KB отражён в журнале сессии PROJECT_STATE.md (size budget hard 25 KB — далеко), новые V32/V33 остаются в BUGS.md/OPEN как UX-правки без системного характера — в TECH_DEBT.md не переносятся. Обновлён 27.04.2026: размеры после Sprint Import-Start-Screen (App.jsx стабилен 39.37 KB, DesignCanvas.jsx 38.44 → 36.77 KB после Kfix-7); добавлен **TD-SIZE-PLASMID-MINI-MAP** (warning signal: 3.96 → 10.13 KB, +6.17 KB превышает 5 KB rise-per-sprint бенчмарк CLAUDE.md §7, но в soft-зоне; отслеживать в V38+V39 mini-fix и последующих PlasmidMiniMap-правках). Обновлён 28.04.2026: по итогам Sprint IS-Final — App.jsx 39.37 → 40.39 KB (hard-зона), добавлен **TD-A11Y-CATEGORY-BUTTONS**. Обновлён 28.04.2026 (вторая сессия): по итогам Sprint App-Decomp — **TD-SIZE-APP → DONE** (App.jsx 40.39 → 30.56 KB, ModalStack + useAppEffects extracted). Обновлён 30.04.2026 (M-A wireframe сессия до старта wireframe генерации): **TD-TOOLS-DRAWIO → DONE** через Mermaid-диаграмму в ARCHITECTURE_v2.md §3.7 + ссылка в §12 обновлена._

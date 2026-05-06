# RELEASES.md — BodgeGene

> Журнал по версиям. Один блок на версию, 1.5–3 KB.
> Ротация: при достижении 30 KB или 10 версий — старшие → `docs/archive/RELEASES_YYYY_QN.md`.
> Схема версий: M-A.x = patches v0.6.x, M-B = v0.7.0, M-C = v0.8.0, ..., M-I = v1.4.0. Документационные milestones (kickoff'ы) без version bump. Patches между формальными milestones (post-acceptance polish между M-A.3 и M-B finale) допускаются как v0.6.x continuation.

---

## v0.7.2 — M-X.2 Annotation Editing + Annotator + UX/perf wave (05–06.05.2026)

**Коммиты:** ~50 на ветке `feature/sequence-view-feature-strip` от `7176f7d` (CPU 25% idle bug fix через Vite HMR pin) до `322031c` (drill-in animations). Финальный bump 0.7.0 → 0.7.2 одним прыжком (v0.7.1 в коде не бампался — журнал проскочил, синхронизация при этом релизе).
**Тесты:** Vitest 1421/1422 passing (+475 нетто vs v0.7.0; +2 worker-client coverage). 1 pre-existing flake (`primer-wizard.test.jsx:79` на full-suite, проходит изолированно). pytest 112/112.
**Build:** clean. PWA precache 21 entries / 865.7 KiB. Worker chunk `predictor.worker-*.js` 12.62 KB.

**Скоуп — M-X.2 Annotation Editing + Annotator (K1-K10 + 70+ post-K10 + M-X.2-fix K1-K6).** Интегрированный edit-annotations workflow в SequenceView: Del удаляет (two-pass exact → smallest covered), H создаёт через CreateAnnotationPopup рядом с правым краем строки selection, E открывает EditAnnotationModal на coords региона, drag edges с live preview + tooltip, double-click label → inline rename / double-click bar → FeatureEditorModal (tab Feature + tab Subfeatures), context menu ПКМ. Ctrl+Z/Y на edit. Sub-features (`level: 'detail'` + `parentId`) с inset rendering и shaded color по индексу — Split button делит последнего ребёнка пополам. SBOL glyphs paired с label, mirror на reverse strand. PreImportModal flow: paste / drop / catalog click → name / topology / folder / tags / annotate-now checkbox; multi-file shared metadata; existing-annotations radio (keep / discard). Embedded Annotator (default): three-level LevelPanel (L1 common-features-homology auto-run, L2 structural predictors orf-scan/sigma70/stem-loop/sgrna-scaffold manual, L3 BLAST stub) + PreviewTab с linear/circular sub-tabs + ghost drill-in side panel (Accept/Reject/BLAST/re-run). Threshold slider live с over-fetch 0.5 + render-time filter. Accept ghost → solid annotation. Hide-duplicates toggle. Per-level «Accept all». Library entry annotations frozen (DEC-LIB-11) — правки только через `perFileEdits.editedAnnotations`; catalog mini-map обновляется через render-time merge без write-through. AnnotationTrack 41.6 KB остался (TD-ANNOTATIONTRACK-DECOMPOSE-V2). M-X.2-fix санация: hard violations 4 → 1, перенос dedup-логики в `lib/annotation-edit.js`, общее API `applyAnnotationEdit`.

**Скоуп — UX-1/UX-2/UX-3/polish wave (05–06.05.2026).** UX-аудит через Chrome MCP с сравнением SnapGene/Benchling/ApE/pLannotate → 71 ranked finding в `docs/UX_AUDIT_FINDINGS.md`. P0 пакет UX-1 (`9bf5a51`): первое впечатление, чистка дублей, скорость отзывчивости. UX-2 (`782f234`): a11y + Annotator polish + hotkey cheatsheet (`?` в Topbar). UX-3 (`dc9cf40`): confidence ticks на slider, save flash ✓ с bounce micro-anim, origin chips clickable. UX-006 (`5e0810c`): Display & Defaults tab вернулся в Settings — theme/wrap/polymerase/primer prefix/annotate-on-import с persist в `bodgegene-ui-display-settings`. SnapGene catalog snappiness: chunked render (INITIAL_CHUNK 20 / NEXT_CHUNK 60 через `requestIdleCallback`), 250 ms debounced hover prefetch, SVG chevron rotation transition, skeleton placeholders убраны (выглядели как fake rows). Animation polish: modal/toast/save flash/splash/catalog row backwards-anim (none re-fires при scroll-back через content-visibility). TOPOLOGY toggle SVG icons 12×12 (Unicode glyph collision устранена). Меta-column origin reverse в правый sidebar (DEC-MB-03 supersedes DEC-MB-02). «Моя библиотека» fix (`f5820a9`): `buildFolderTree` пропускал empty-string folders → entries без folderPath не видны. Folder tree decoupled от tags — `folderPath` своё поле (`3482400`). ESLint no-cyrillic rule + flow-node selector hot path fix (`bb64d87`).

**Скоуп — Sequence/Annotator interaction parity (05–06.05.2026).** Drag-scrub на LinearFeatureBar в Annotator (`e00c8c1`) — `onBarScrub` гейтится на `activeTab === 'sequence' || 'annotations'`, `pendingScroll` flow через `AnnotationsTab → Annotator → PreviewTab → SequenceView` (forwardRef + `useImperativeHandle.scrollToPosition`). Caret glide animation (`e00c8c1`) — `CaretOverlay` switched с `left`/`top` на `transform: translate3d(...)` + `transition: transform 80ms linear` + `will-change: transform`. На быстром drag через strip каретка плавно проходит между нуклеотидами вместо teleport. ORF ghosts на Annotator strip (`e328f15`) — force `showDuplicates: true` когда `activeTab === 'annotations'` (ORF emits `type: 'CDS'`, дедуп с confirmed CDS prevented showing). Click strip больше не швыряет в Sequence tab из Annotations.

**Скоуп — performance + main-thread (05–06.05.2026).** **DEC-PERF-WORKER-01** (06.05, `240f87a`): predictor plugins (L1 common-features-homology + L2 structural orf-scan/sigma70/stem-loop/sgrna-scaffold) бегут off-main-thread в `lib/workers/predictor.worker.js`. Pipeline через `lib/annotator-worker-client.js` lazy singleton, vitest happy-dom через `import.meta.env.VITEST` early-return → fallback на синхронный path. BLAST stub (`requiresNetwork:true`) остаётся на main thread. 200-500 ms freeze на открытии Annotator уходит из main thread полностью. Defer L1 past first paint (`5279e44`) — двух-rAF гарантия что Annotator shell + progress bar paint'ятся до scan'а. Microtask prewarm Sequence + double-rAF Annotator (`71f1033`) — Inspector mount 183 ms → 0. SequenceLine `content-visibility: auto` removed + `transform: translateZ(0)` + `backface-visibility: hidden` (`24bb02c`) — устранил re-realisation jitter на 90/120 Hz мониторах. Auto-annotate cache + bucketed RE-site scan + memoised library selectors (`1c3b9d7`). Allocation-free PWM scan + stem-loop walk (`27e796f`). Cached codon walks + O(1) AA-track cell lookup (`4bab893`, PERF-01,09,14). 5 revComp impls consolidated (`2a88c60`). Catalog stable per-entry items + pre-sized flat-search pool (`40c1bb6`). PWA: drop plasmid pack from precache, CacheFirst on demand (`f362f07`). Vendor chunk split (`5de98f7`). 4 orphan exports + 2 orphan files dropped (~404 LOC, `4a859c7`).

**Скоуп — Animation polish финал (06.05.2026).** Tab content crossfade (`67c6da0`) — 100 ms opacity + 2 px translateY между Inspector tabs (Обзор / Последовательность / Аннотации) и Annotator PreviewTab Linear/Circular. `.importer-tab-pane[data-tab-active="true"]` гейтит. Drill-in panel slide-in 120 ms translateX(12px) → 0 + opacity на mount; Accept/Reject press pulse 140 ms scale(1 → 0.96 → 1) + saturation bump (`322031c`). Все анимации gated `prefers-reduced-motion`.

**Закрытые TD:** TD-LIBRARY-WRITE-CONTRACT (закрыт K1 M-X.2-fix через Library entry frozen + perFileEdits transient). TD-ANNOTATOR-MOUNT (root-mount решение отложено в M-D, embedded стал default — DEC-ANN-13).
**Открытые TD:** TD-ANNOTATIONTRACK-DECOMPOSE-V2 (41.6 KB, M-X.4 либо параллельно M-D), TD-SINGLEINSPECTOR-SELECTIONSTATE-EXTRACT (при следующем sprint'е трогающем selection), TD-WRAPTAIL-RENDERING (M-X.3), TD-CIRCULAR-SELECTION (после M-X.4), TD-LIBRARY-WRITE-API (M-X.4). От v0.7.1 остаются: TD-SEQUENCEVIEW-SHIFT-SELECTION (M-D), TD-SEQUENCEVIEW-FOCUS-RING (low priority a11y), TD-LINEAR-BAR-PREDICTIONS, TD-DRAG-DROP-LIBRARY-CARDS, TD-PER-CDS-SIGNALIP.
**DEC-блок:** **⚓ кандидаты:** DEC-LIB-11 (Library entry annotations mutable through explicit save flow only), DEC-EDIT-PARITY-01 (edit parity SequenceView ↔ embedded Annotator через `applyAnnotationEdit`), DEC-IMPORTER-TARGETS-01 (Library only / Library + project targets). Эти три промотируются в `ANCHORS.md` если паттерн повторится в M-D Container Window. **Sprint-level в DECISIONS.md:** DEC-FEATURE-SUBFEATURES-01, DEC-ANN-SBOL-01, DEC-ANN-12 (three-level LevelPanel), DEC-ANN-13 (embedded Annotator default), DEC-IMPORTER-PRE-01 (PreImportModal flow), DEC-FEATURE-EDIT-FLOW-01 (dblclick semantics), DEC-IDLE-PREWARM-01 (V49 fix), DEC-PLUGIN-OVERFETCH-01 (over-fetch + render-time filter), DEC-ANN-01..11 (M-X.2 спека), DEC-PERF-WORKER-01 (predictor Worker — кандидат на ⚓ при reuse в M-D).

**Post-mortem.** Bump version скипнул промежуточный 0.7.1 в коде — version.js застрял на 0.7.0 после M-B finale, переехал прямо на 0.7.2. Это допустимо для in-flight ветки, но процесс «Code не оставляет отчёта в CURRENT_TASK.md» (упомянутый в v0.7.1 post-mortem) повторился — финальные test counts на момент промежуточных коммитов восстанавливаются по git log + CI build, не из координационных файлов. **Вывод закрепляется:** при следующих finalisation Chat сначала читает `package.json` + `version.js` ДО написания нового RELEASES блока (а не доверяет PROJECT_STATE.md шапке).

---

## v0.7.1 — V50 parser fix + Parser-Unification + SnapGene Refresh + M-B.3 Sequence Viewer Rewrite (03–04.05.2026)

**Коммиты:** 03.05 morning V50 parser coord fix + 4 sub-fixes AA-track refactor (PRE-K1 для всех последующих); Sprint Parser-Unification `a6182ad` + `e8f0f56` на `feature/racetrack-canvas`; 03.05 PM Sprint SnapGene Refresh; Sprint M-B.3 SequenceView Rewrite `c1122fa` → `16c2c26` → `5972c2f` на `feature/sequence-view-feature-strip`.
**Тесты:** ~947 Vitest + 112 pytest (на момент V50 fix 03.05; B.3 cycle test count в координационных файлах не зафиксирован — Code не оставил отчёта в CURRENT_TASK.md; итог уточнится при ближайшей финализации M-X.1).
**Build:** clean.

**Скоуп — V50 parser coord fix (03.05 morning, PRE-K1 для всех последующих).** Каскадный off-by-1 в backend pipeline: `pvcs/snapgene_parser.py` хранил 1-based inclusive XML coords без конверсии; `pvcs/parser.py` добавлял второй `+1` на start → длины CDS не кратны 3 → reading frame ехал → ATG real-стартовых кодонов не попадали в AA-translation. **Fix:** в `snapgene_parser.py` — `xml_start - 1` (получить 0-based start, end остаётся exclusive). Верификация на pUC19: lacZα 147..469 (322 ✗) → 146..469 (324 ÷3 ✓); AmpR 1627..2486 (859 ✗) → 1626..2486 (861 ÷3 ✓). Контракт (⚓ DEC-PARSER-COORD-01 в ANCHORS.md, 03.05.2026): 0-based exclusive end end-to-end, дальше по pipeline координаты **не трогаются**. Инварианты: `length = end - start`; `(cds.end - cds.start) % 3 === 0`. См. BUGS.md FIXED V50.

**Скоуп — 4 sub-fixes AA-track refactor (03.05 morning).** (A) ruler line-end label убран целиком (major ticks 10 bp покрывают); (B) `buildCdsAAMap` поддерживает strand=-1 через `frame = (seqLen − end) % 3` + walkCodons antisense от 3'-конца; (C) regression test reverse-strand CDS показывает M на правом краю top строки; (D) AA-track render разнесён по (strand, frame) на свои строки, ORF fallback убран как noise. Регрессия-guards: `aa-track.test.jsx::reverse-strand CDS shows M at the 3'-end of top strand` + `single renders M for EACH forward CDS`.

**Скоуп — Sprint Parser-Unification (03.05 morning).** Разобрали второй .dna parser. `scripts/build_features_from_snapgene.py` имел inline `parse_dna()` + `parse_features_xml()` с **тем же V50 багом**: feature start/end хранились 1-based inclusive, затем Python slicing `seq[start:end]` брал 0-based exclusive → sequences в common-features.json были сдвинуты на 2 nt. **Fix:** scripts/ импортирует `parse_dna_file` из `pvcs.snapgene_parser` как single source of truth; inline-парсеры удалены. Backup `gui/designer/public/common-features.json` → `docs/archive/common-features_v_pre_v50.json`. Rebuild дал 419 features (все CDS ÷3). 3 ⚓ в commit message: **DEC-PARSER-UNIFY-01** (pvcs.snapgene_parser — single source of truth для .dna parsing); **DEC-PARSER-UNIFY-02** (scripts/build_features_from_snapgene.py owns post-processing only); **DEC-PARSER-UNIFY-03** (rebuilds always backup previous common-features.json в docs/archive/).

**Скоуп — Sprint SnapGene Refresh (03.05 PM).** Clean restart auto-annotate БД на свежих SnapGene эталонах. Wipe `scripts/snapgene_dna/` целиком (з3.gitignore'd, локальная операция) + redownload через `download_snapgene_library.py` (rate-limit 0.3 sec/file, ~2822 файлов, ~25-40 минут wall-clock). Backup current `common-features.json` → `docs/archive/common-features_v_pre_refresh_20260503.json`. Rebuild через unified parser. Роллинг-бэкап политика: V50-era backup остаётся как историческая референс-точка, дальше последний backup. Ни один Python-скрипт не модифицирован — data-only refresh.

**Скоуп — M-B.3 SequenceView Rewrite (04.05).** Rewrite сквозь пяти sequence-related файлов (~72 KB) в одну папку `components/SequenceView/`. **DELETE 5 файлов:** SequenceMapView.jsx, SequencePane.jsx, SequencePreview.jsx, SequenceViewer.jsx, PlasmidWorkspace.jsx. **Новые суб-компоненты** (~13 файлов, наибольший `index.jsx` ~10 KB): синхронные PrimerTrack / RestrictionTrack / RulerTrack / AnnotationTrack / StrandsTrack / AATrack по (strand, frame). **5 user settings** через SettingsPopover (⛙ icon в SequenceTab header, persist в `bodgegene-ui-sequenceview` localStorage): bottom strand visibility / AA frames mode (Auto/Single/All) / auto threshold 50-95% / primer style (filled/outline) / RE labels orientation (vertical/horizontal). Multi-row stacked annotations + leader-line labels + overflow `+N more`. Read-only foundation для M-C Container Window + M-D edit через optional callbacks.

**Скоуп — 04.05 интеракционные расширения поверх B.3 baseline.** **(1) Origin reverse в MetaColumn** (supersedes DEC-MB-02 от 02.05) — биолог: «Origin/межгенные участки/применить семантически в правом sidebar'е возле топологии». SequenceTab чисто viewer-only. **(2) LinearFeatureBar drag-scrubber** — pointer capture + touchAction:'none' + живое scrolling; `scrollIntoView({block:'center'})` заменяет ручной `containerRef.scrollTop = offset` когда SequenceView живёт в родительском overflow контейнере (importer-single-tab-content). **(3) Caret synchronization** — единый `cursorPos` в SingleInspector управляет LinearFeatureBar cursor + SequenceView caret одновременно. Клавиатурная навигация: ←/→ ±1 nt, ↑/↓ ±charsPerLine, Home/End границы строки, PageUp/PageDown ±10 строк. **(4) Selection + tri-modal copy context menu** (DEC-SV-04) — «Копировать (прямая цепь) Ctrl+C» / «Копировать обратную цепь Ctrl+Alt+C» / «Копировать аминокислоты Ctrl+Shift+C»; selection highlight (бледно-розовый с прозрачным fill) корректно работает над forward+reverse strands в reverse-strand контексте (numbers count down, AA-track перевёрнут). Caret и selection coexist как separate states.

**Отложено явно (в TECH_DEBT.md):** Shift+arrow расширение выделения (Range API — TD-SEQUENCEVIEW-SHIFT-SELECTION); visible focus-ring при tab-фокусе (TD-SEQUENCEVIEW-FOCUS-RING); ORF-предсказания на LinearFeatureBar (TD-LINEAR-BAR-PREDICTIONS, смяжно с M-X.1).

**Закрытые TD:** — (V50 был пойман и закрыт в одном цикле, не посредником TD).
**Открытые TD:** TD-SEQUENCEVIEW-SHIFT-SELECTION (M-D), TD-SEQUENCEVIEW-FOCUS-RING (low priority), TD-LINEAR-BAR-PREDICTIONS (M-X.1 либо M-X.2).
**DEC-блок:** ⚓ DEC-PARSER-COORD-01 (03.05.2026, ANCHORS.md) + ⚓ DEC-PARSER-UNIFY-01..03 (кандидаты в ANCHORS.md, сейчас в commit message Parser-Unification — перенос в ANCHORS.md отложен до следующей milestone-сессии) + sprint-level в DECISIONS.md (DEC-MB-03 supersedes DEC-MB-02, DEC-SV-01..04 caret/scrollIntoView/drag-scrubber/selection-context-menu).

**Post-mortem.** Отчёты Code в CURRENT_TASK.md не были оставлены ни по одному из четырёх sub-sprint'ов 03–04.05 (V50 fix + AA-track sub-fixes + Parser-Unification + SnapGene Refresh + M-B.3) — файл был перезаписан под M-X.1 спеку 05.05. Спеки в docs/ сохранили скоуп-информацию (PRE-K1, scope, decisions), но фактические commit-хеши от K-шагов + финальные test counts в координационные файлы не дошли. **Вывод:** формат Code-отчёта в CURRENT_TASK.md должен быть append в конец файла, схраняться до следующей финализации (не оверрайдиться при написании следующей спеки). Рассмотреть: Chat при написании новой спеки в CURRENT_TASK.md всегда сначала архивирует старый Code-отчёт в RELEASES.md, иначе файл оверрайдится без ревью истории.

---

## v0.7.0 — M-B finale: Catalog tree + folder-in-folder + auto-annotate cleanup (02.05.2026)

**Тесты:** Vitest 885 / 885 (от v0.6.4 baseline 891: −6 нетто — выкинул 6 obsolete promoter/terminator/linker auto-detect ассертов в `auto-annotate.test.js`/`auto-annotate-regions.test.js`, добавил 2 «no auto-detect» guards). pytest 112 / 112.
**Build:** clean, размер примерно ~570 KB (scope не вырос значимо — удалил больше кода чем добавил).

**Catalog perf — большие списки.** SnapGene категории на 300-400 items раньше тормозили при раскрытии. Три точечных оптимизации:
- `PlasmidMiniMap` обёрнут в `React.memo` с shallow-comparator — родительские state-обновления (drag highlight, hover bridges) не перерисовывают каждую mini-map.
- `PlasmidMiniMap` inline-mode пропускает связку `useState(vbox)` + `useLayoutEffect(setVbox)` — `vbox` теперь синхронный const от `size`. Раньше на mount каждый из 400 mini-map делал лишний re-render через `setVbox`. ~30% быстрее раскрытие.
- `ItemRow` тоже `React.memo` с custom-comparator (игнорит callback ref-churn, опирается на стабильный `item` ref).

**Drag-and-drop библиотечных items между папками + read-only protections + reload restore.**
- **Drag handle ⋮⋮** слева у каждого Mine ItemRow (Chrome/Vivaldi не пускают HTML5-drag из `<button>`, поэтому отдельный `<span draggable>`). MIME `application/x-bodgegene-item-id` + `-source-folder`. Drop на любую Mine-папку — move (untag source, add target). Drop на Mine GroupHeader — ungroup в корень.
- **Folder/file creation Mine-only** — биолог: «запрети создавать папки и файлы внутри снапген демо и прочих кроме библиотеки». Canvas/Demo/SnapGene GroupHeader без `onAddChild`. `renderFolderNodes` гейтит `onAddChild`/`onAddFile`/`onItemDrop`/`onFolderDrop`/`onDelete` через `isMine && !isUntagged`.
- **«Пусто» внутри пустых папок убрано** — после удаления папки оставляло визуальный шум.
- **«В библиотеку» точное правило** — `_libraryEntryId` propagated только для Mine-source items, проверка против `state.libraryEntries`. Item уже в библиотеке → кнопка скрыта; внешний импорт → видна.
- **Untagged-fallback** — когда `mineGroups = []` (legacy маркер) но `mine.length > 0`, синтетический `__untagged__` bucket. Раньше счётчик показывал N, на expand пусто.
- **`hydrateLibrary` подключён в bootstrap** — раньше определён но не вызывался, reload показывал пустую библиотеку (rows в Dexie оставались).
- **navStack persist для importer/library** — reload в Library больше не выбрасывает на стартовую. localStorage `bodgegene-nav-top` хранит top entry если это safe-state (importer + target=library).
- **Drag highlight depth-counter** — `useRef` enter/leave счётчик чтобы yellow-dashed не флипалось при пересечении inner-элементов (chevron, label, иконки).
- **Per-folder file import** — `addFiles(files, {targetFolderTag})` пробрасывает folder-path в `editedTags`. Триггеры: `⤓` hover-icon + drag-drop на folder row.
- **Folder + container delete (×)** — folder: убирает path + sub-paths из userFoldersByGroup + untags entries (контейнеры остаются); container: routes через `markLibraryEntryPendingDelete` → `commit`. Confirm dialogs предупреждают о project references.
- **Folder-in-folder через slash-paths** — `Vectors/CRISPR`. `buildFolderTree` парсит flat list в forest, `renderFolderNodes` рекурсивно до `MAX_INDENT_DEPTH=5`. Hover `＋` на header'е каждой папки.

**Mini-map polish (catalog list)**:
- Hover overlay смещён вправо (с fallback на лево) — биолог: «сместить чтобы другие значки видны».
- `data-theme` attribute на portal-span — dark theme через body-portal каскад теперь работает.
- Overlay 180 → 144 (~20% меньше).
- `HOVER_BRIDGE_MS` 250 → 80, `GROW_DURATION_MS` 200 → 140 — снапнее dismiss.
- Inline frame только для circular (`50%` border-radius merge с backbone-кругом). Linear — голая палочка.
- Inline size 20 px.

**LinearFeatureBar — greedy interval packing.** Старый алгоритм проверял anchor-X gap `< 80`, пропускал collision'ы при противоположных `dir`. Новый: pre-compute `textLeft`/`textRight` из `dir` + truncated text width, greedy-pack по rows. Корректно на плотных плазмидах, компактно на разреженных.

**Origin-rotate переехал из MetaColumn на SequenceTab.** Биолог: «выбор точки начала для плазмид должна быть доступна только на сиквенс вью, где можно тыкнуть на нуклеотид (там хоть номера видны)». Перенёс input + apply + intergenic-hints из правого sidebar (`MetaColumn`) в верхний toolbar `SequenceTab` — над `SequenceMapView`, где видны номера позиций. MetaColumn потерял: origin Card, `originOffset` state, `useEffect` reset, `onApplyOrigin`, импорт `computeIntergenicHints`. Топология toggle + length / info / IUPAC / description / organism / source остались. SequenceTab принимает новые пропы `fileKey` + `onUpdateEdits`, рендерит control только при `topology === 'circular'`. Тесты: новый `sequence-tab-origin.test.jsx` (4 теста), `meta-column.test.jsx` обновлён (origin-тесты удалены, добавлен guard что control больше не в MetaColumn). Vitest 887/887 (было 885, -2 +4).

**Удаление папок + контейнеров + минимапы вернулись в ItemRow.**
- **Минимапы**: каждая строка в catalog tree теперь префиксует 20 px `PlasmidMiniMap` (mode='inline', `disableHoverOverlay`) — биолог опять распознаёт плазмиды по форме. Были утеряны в первой v0.7.0 переписи.
- **Удаление папки (×)** — hover-revealed на header'е любой user или tag-derived папки (кроме `__untagged__` и SnapGene категорий). Confirm dialog показывает количество affected items и явно говорит «Контейнеры НЕ удаляются — это безопасная операция». Действие: убирает folder path + все sub-paths из `userFoldersByGroup[groupKey]`, untags затронутые library entries через `updateLibraryEntryTags`. Сами контейнеры остаются в библиотеке на корне.
- **Удаление контейнера (×)** — hover-revealed на каждой Mine `ItemRow`. Confirm dialog предупреждает: «Контейнеры могут использоваться в проектах — сначала отвяжите от всех проектов». Маршрутизируется через soft-delete: `markLibraryEntryPendingDelete(id)` → `commitLibraryEntryPendingDelete(id)`. Demo/SnapGene/Canvas/__untagged__ не имеют delete — read-only или отдельный flow.
- Новые строки: `catalogDeleteFolder/Confirm`, `catalogDeleteContainer/Confirm`.
- CSS: `.importer-catalog-delete` opacity 0.5 → 1 on row hover, на hover самой иконки — danger-red. ItemRow реструктурирован в wrapper `div.item-row` + click-button + delete-button: фон/hover теперь на wrapper, не на inner button.

**Финальная UX-полировка catalog tree.** «+ Новая папка» visible button-row убран целиком — иконки `＋` (создать папку) и `⤓` (импорт файла) теперь висят и на header'е каждой top-level группы, и на каждой папке внутри. Иконки **всегда видны** при opacity 0.5 (не hover-only — биолог пропускал) → opacity 1 на row hover. Эмодзи `📥` → Unicode `⤓` (DOWNWARDS ARROW TO BAR) — соответствует стилю символов проекта (▾ ▸ ＋ ‹ ⋯ ↻). Drop file на section header «Моя библиотека» → импорт в root; drop на folder row → импорт с folder-path в `editedTags`.

**Убран глобальный `DropOverlay`** в `App.jsx` — full-screen «Drop file here (M-B feature preview)» оверлей перекрывал per-folder drop targets в CatalogColumn (биолог жаловался, что «главное окно перехватывает загрузку»). Удалены: компонент `DropOverlay`, state `dragActive`, window-listeners `dragenter`/`dragleave`, строка `STRINGS.app.dropOverlay`. Остались только `dragover` + `drop` window handlers — они нужны для DAG → Importer routing (inner folder targets делают `e.stopPropagation()`, поэтому глобальный handler срабатывает только когда никакой child не поймал drop). Dead code: `NewFolderRow`, `newFolderActionStyle`, `catalogNewFolderHint`.

**Скоуп — Catalog tree rewrite (drill-down → fully inline).** Убрал режим drilldown/`←Назад` в `CatalogColumn.jsx`. Все группы — collapsible dropdown'ы:
- Top-level (Mine / Canvas / Demo / SnapGene) — порядок по запросу биолога: **Моя библиотека первой**, далее проекты, демо, SnapGene.
- Mine tag groups + SnapGene категории — nested `NestedSubGroup` collapsible inline (lazy-load для SnapGene категорий на первое раскрытие).
- Items внутри: рендерится **полный список**, без «Показать все/меньше» пагинации.
- **Depth-based indent** до 5 уровней: `indentForDepth(d) = 12 + d*12`, capped at 72 px. `CHEVRON_GUTTER = 16` добавлен к items чтобы text лёг под parent text column (раньше — под parent chevron).
- **Per-depth translucent accent tint** (`depthBackground(d) = 2.5%·d`, max 8%) — banded визуальная иерархия. Через CSS `--depth-bg` чтобы `:hover` не блокировался inline-style'ом.

**Скоуп — User folders (per-group, folder-in-folder).** Папки теперь можно создавать **в любом разделе** каталога:
- `userFoldersByGroup: {canvas, demo, mine, snapgene}` в `pvcs-catalog-user-folders-by-group` localStorage; миграция со старого single-array `pvcs-catalog-user-folders` ⇒ `mine`.
- Видимая «+ Новая папка» кнопка одна на раздел (внизу каждой top-level группы) — inline-input заменил `window.prompt` v0.6.4. Enter сохраняет, Esc/blur отменяет.
- **Folder-in-folder** через slash-paths (`Vectors/CRISPR`). `buildFolderTree(paths)` парсит flat list в forest, `renderFolderNodes` рекурсивно рендерит до `MAX_INDENT_DEPTH=5`.
- **File-manager паттерн для sub-folder creation:** на header каждой папки hover-revealed «＋» иконка справа (одна видимая «+ Новая папка» на раздел вместо buttons-flood). CSS `.importer-catalog-add-child { opacity: 0 }` + `.importer-catalog-nested-row:hover .importer-catalog-add-child { opacity: 1 }`.
- **Per-folder file import** (для Mine): hover-revealed «📥» иконка → shared `<input type="file">` с `pendingFolderTag` ref. Drag-drop файлов на folder row → импорт + folder-path тег на каждом imported entry. `addFiles(files, {targetFolderTag})` в `importer-state.js` пробрасывает тег в `editedTags`.
- `__untagged__` — виртуальный bucket, не получает «＋»/«📥» иконок.

**Скоуп — Auto-annotate cleanup (биолог: «не надо НАСТОЛЬКО МНОГО»).** Удалил детекторы шума из `auto-annotate.js`:
- **Linker detection** в `annotateCDS` (производил 25+ «Linker N» на каждой плазмиде).
- Promoter sub-features: `-10 element`, `-35 element`, `RBS (Shine-Dalgarno)`, `TATA box`, `CAAT box` — `annotatePromoter()` целиком удалён.
- Terminator sub-features: `Poly-A signal` — `annotateTerminator()` целиком удалён.
- **Signal peptide + Pro-peptide** — биолог: «отдельно при нажатии на CDS можно выбрать через сигнал IP». Удалены из CDS auto-flow; функции `detectSignalPeptide`/`detectPropeptide` остаются в `domain-detection.js` под будущий per-CDS on-demand action.
- Все типы (`linker`, `core_promoter`, `regulatory`, `polyA_signal`, `signal_peptide`, `propeptide`) **остались** в `TYPE_GROUPS` + палитре — пользователь добавляет вручную.
- Unused helpers (`findConsensus`, `isProkaryote`, `PROKARYOTE_KEYWORDS`) удалены.

**Скоуп — Auto-annotate UI moved.** «📥 Авто-аннотация» + «авто-аннотация при импорте» checkbox перенесены из ActionsBar overflow ⋯ menu в **AnnotationsTab toolbar** (биолог: «явно вынести на вкладку аннотаций»). Manual-trigger button сейчас disabled stub (новый annotator с per-CDS SignalIP — следующая итерация); checkbox по-прежнему рабочий — конфирм-flow auto-annotates автоматически.

**Скоуп — Critical AnnotationEditor fixes.**
- **Дубликаты edit-форм при клике карандашом.** Два корня:
  1. Non-region аннотация в нескольких вложенных регионах рендерилась как child каждого. Fix: `parentMap` (annotation → AT MOST ONE region: regionId match wins, else smallest containing).
  2. **`getRegions` synthetic-id substitution** — `getRegions(annotations).map(a => a.id ? a : {...a, id: ...})` возвращает NEW objects для id-less регионов; `annotations.indexOf(synthetic) === -1` для всех → клик ✎ ставит `editingIdx=-1` → каждый id-less регион в edit mode одновременно. После авто-аннотации (которая создавала регионы без id) — массовый «edit-everywhere». Fix: `annotations.filter(a => a.level === 'region')` (reference equality).
- Edit-form coord inputs `w-12 → w-16 + tabular-nums` под 5-значные плазмидные позиции.
- Theme-aware add/edit forms через scoped CSS overrides под `.importer-annotation-editor-wrap` — Tailwind defaults (`bg-gray-50`, `text-gray-400`, `bg-blue-100/-600`) → CSS-vars (`var(--surface-1/-2)`, `var(--text-tertiary/-secondary/-primary)`, `var(--accent-500)`).

**Скоуп — UX мелочи.**
- **«В библиотеку» прячется** когда файл уже добавлен в этой сессии. `Importer/index.jsx` считает `alreadyAddedToLibrary` через `state.addedItems`, ActionsBar скрывает обе library-кнопки. SessionSummary footer entry («✓ Уже добавлено …») остаётся как подтверждение.
- **«Скопировать в библиотеку»** wording убран — везде «В библиотеку». `actionLibraryCopy` + `isCatalogSource` prop удалены.
- **Topbar contextual title** «Библиотека» при `target=library` (заменяет `projectFallback: '—'` который смущал).
- **OverviewTab mini-map column** 240 → 320 px, **PlasmidMiniMap label truncate** 14 chars + `LinearFeatureBar` clamp + dynamic availW.

**Закрытые TD:** TD-V05-IMPORTSTARTSCREEN-DELETE (legacy `components/ImportStartScreen/` уже удалён в M-B.2; в v0.7.0 окончательно подчищены orphan-строки `actionLibraryCopy/AutoAnnotateOn|Off/catalogBack/MineFlatLabel/ShowAll|Less`).
**Открытые TD:** TD-MOLECULEWORKSPACE-M-D, TD-LIBRARY-CRUD-M-D, новый **TD-DRAG-DROP-LIBRARY-CARDS** (drag library cards между папками — сейчас drag-drop работает только для файлов с диска, не для уже-импортированных entries).
**DEC-блок:** DEC-IMP-13..18 + новые DEC-DS-NN по A+v2 палитре (из v0.6.4) + новые DEC-CAT-01..04 по дизайну дерева (no drilldown / depth-tint / file-manager hover-icons / folder-as-slash-path) — ждут добавления Chat'ом в `ANCHORS.md` / `DECISIONS.md` при финальной приёмке M-B.

---

## v0.6.4 — M-B.2 Importer Rework + post-acceptance polish (02.05.2026)

**Коммиты на ветке `feature/racetrack-canvas`:** M-B.2 K1..K6 (`f2554fd` → `c36d7bc`) + catalog-scroll-anchor (`8e9debe`) + Library wipe + TagsEditor (`3281779`) + StartScreen Library link (`18e86ce`, `a547f26`) + palette A+v2 + shade + canonical-key (`23bf484`, `7146af9`) + DESIGN_SYSTEM §2.1 (`03e3c11`) + StartScreen UX (`20508d5`) + Importer Critical (`219c2d7`) + Importer High (`98172f7`) + Polish round 2 (`c1f66ed`).
**Тесты:** Vitest 891 / 891 (от v0.6.3 baseline 834: +57 нетто — добавлены M-B.2 unit + integration suites, palette canonical-key matrix, tags-editor, lazy-tabs guard, multi-inspector; удалены legacy step2-combined.test + simple-import.test). pytest 112 / 112 (backend untouched).
**Build:** clean, ~570 KB / gzip ~172 KB (от M-A.3 baseline 120.49 KB +51 KB carries весь M-B.1 K6 + M-B.2 surface).

**Скоуп — M-B.2 Importer Rework (K1..K6).** Single-screen 4-column layout (CatalogColumn 320 / Inspector flex / MetaColumn 200 / footer) заменил Step1→Step2 двухэкранный flow из M-B.1. Inspector с TabBar: Обзор (eager, lightweight) / Последовательность / Аннотации / История (conditional). SequenceTab + AnnotationsTab — React conditional render → lazy mount → V49 50-сек hang fixed. CatalogColumn 4 sources («Этот проект» / «Учебные» / «Моя библиотека» sub-grouped by tags / «Каталог SnapGene» lazy-fetch) + sticky search с length-pattern + drop zone + paste textarea. MultiInspector table с tristate master. Inline TagsEditor пишет в `perFileEdits.editedTags` → Confirm flow промотит в LibraryEntry.

**Скоуп — post-acceptance polish (3 round'а Игоря).** **Round 1 (Critical):** AppShell `min-height:100vh` → `height:100vh` + overflow:hidden чтобы footer с primary actions не уезжал за viewport · `addCatalogItem` пробрасывает `_fromFileCount` (MetaColumn перестал показывать 0 для catalog items) · EmptyInspector context-aware (target=library + libraryEmpty → 📚 onboarding) · Cancel × → ‹ Назад в left header. **Round 2 (visual + simple-mode rip):** simple/advanced toggle убран целиком — всегда advanced; «не делать аннотацию» surfaces как autoAnnotate checkbox в overflow-menu · uppercase labels (СЕЛЕКЦИЯ / ПРОМОТОРЫ / etc.) перекрашены text-tertiary → text-secondary, weight 500 → 600 · межгенные участки label-stacked monospace вместо italic-tertiary · SequenceMapView `readOnly` prop drops 120 px primer reservation, +20% chars per line · AnnotationsTab `compact=false hideBar=false` → нормальные rows + linear feature-bar v0.5-style. **Round 3 (palette):** A+v2 approved over `docs/design_assets/feature-palette-comparison.html` mockup — 4 base hex changed (CDS/promoter/resistance/reporter), warm-sepia stroke сохранён · `featureColorShaded(type, name)` HSL ±10% L / ±6° H shade keyed by `canonicalFeatureKey(name)` (30+ entries; AmpR ≡ ApR ≡ bla → одинаковый shade) · DESIGN_SYSTEM §2.1 обновлён.

**Скоуп — Library fullscreen wipe.** `components/Library/` (4 файла + test) удалён. Function (browse saved containers) переехала в Importer CatalogColumn → «Моя библиотека». Tag-editing — только при импорте через TagsEditor. Soft-delete deferred to M-D Container Window. `librarySlice` data layer kept untouched. StartScreen `Library` SidebarLink → opens Importer with target=library + full catalog visible.

**Скоуп — StartScreen UX fixes.** Recent card layout `flex 1.1/0.9` → grid `[1fr 280px]` (~600px пустоты убрано) · ▷ chevron удалён · × delete hover-only · description colour primary opacity 0.85 (was tertiary, near-illegible на dark) · sidebar Browse links gap 2→4 + amber border-left accent on hover · Topbar Guide / Settings ghost-button styling · sidebar/header padding-left aligned at 20.

**v0.6.4 ↔ v0.7.0 contract.** Все M-B.2 фиксы накатываются как patch поверх M-A.3 (incremental). Formal v0.7.0 release block будет создан Chat'ом при финальной M-B.2 acceptance + bump до v0.7.0 (CLAUDE.md схема). До тех пор v0.6.4 — рабочий snapshot для visual review.

**Закрытые TD:** TD-V49-IMPORTER-HANG (lazy-tabs guard в `lazy-tabs.test.jsx::default-overview-no-annotation-editor`).
**Открытые TD:** TD-IMPORTSTARTSCREEN-V05-DELETE (v0.5 `components/ImportStartScreen/` — dead, удалить отдельным cleanup) · TD-MOLECULEWORKSPACE-M-D (компонент keep для Container Window) · TD-LIBRARY-CRUD-M-D (soft-delete + tag-edit existing entries — M-D scope).
**DEC-блок:** DEC-IMP-13..18 (single-screen / catalog 4-source / lazy tabs / edit через perFileEdits / SessionSummary footer / MoleculeWorkspace keep) + новые decision'ы по A+v2 палитре (ждёт DEC-DS-NN от Chat'а в финализирующей сессии) — добавятся в `ANCHORS.md` / `DECISIONS.md` Chat'ом при финальной приёмке.

---

## v0.6.3 — M-A.3 Library minimal CRUD + версионирование в коде (01.05.2026)

**Коммиты:** `5fcceea` → `41b394d` → `038986d` → `c568f61` → `525cac6` → `1167bba` (6 спринт-коммитов M-A.3 + 1 параллельный Chat-task fix StartScreen) + `<TBD>` (Type C версионирование v0.6.3 — package.json bump + `lib/version.js` + StartScreen footer + 1 unit-тест) · ветка `feature/racetrack-canvas`.
**Тесты:** 901 (789 Vitest + 112 pytest). Дельта от v0.6.2: +24 Vitest (M-A.3) + 1 Vitest (версионирование). _Если итоговый счётчик из K5 verify отличается — поправь это число одной правкой._
**Build:** clean, 0 warnings, bundle 384.51 KB / gzip 120.49 KB (M-A.3 baseline; версионирование bundle-нейтральное).

**Скоуп M-A.3.** Library fullscreen: list view + tabs Containers/Primers + topology filter + tags chips inline editable + soft-delete с undo. Schema v2 расширена table `library` с indexes `id, kind, addedAt, [kind+addedAt], *tags`. Reuse v0.5 паттернов: soft-delete (DEC-MA1-02), tag suggestions (DEC-MA-04), bilingual STRINGS (DEC-MA2-01). 8 отклонений Code от спеки (все приняты). Параллельный Chat-task: `↓ Import sequence` placeholder убран из StartScreen (DEC-IMP-03 follow-up).

**Скоуп версионирования (Type C, после M-A.3 приёмки).** `gui/designer/package.json` версия `0.0.0` → `0.6.3` (K1). Новый файл `gui/designer/src/lib/version.js` — single source of truth (`APP_VERSION = '0.6.3'`, K2). Footer в `StartScreen/index.jsx`: импорт `APP_VERSION`, отображение строки `BodgeGene v{APP_VERSION}` в нижней части sidebar — Code обернул его вместе с существующей PWA-install кнопкой в общий flex-контейнер с `marginTop: auto`, `data-testid="ss-version-footer"`, `fontSize: 11` / `var(--ss-text-tertiary)` (K3). Тест добавлен в `components/__tests__/StartScreen.test.jsx` (где уже живут другие StartScreen-тесты), ассерт по импортированному `APP_VERSION` — не ломается при следующем bump (K4). 2 отклонения Code от спеки: (a) тест положил рядом с другими component-тестами, не в новый `StartScreen/__tests__/` подкаталог; (b) Code обернул PWA-install в общий контейнер с footer вместо отдельных контейнеров — оба отклонения структурно чище и приняты на визуальной приёмке.

**Якорь схемы версий.** M-A.x = patches v0.6.x (M-A=v0.6.0, M-A.1=v0.6.1, M-A.2=v0.6.2, **M-A.3=v0.6.3**). Далее M-B=v0.7.0, M-C=v0.8.0, ..., M-I=v1.4.0. Документационные milestones (kickoff'ы, реструктуризация документации) — без bump. Закреплено в шапке этого файла + `lib/version.js` комментарии + `CLAUDE.md` правило 5.

**Закрытые TD:** —  
**Открытые TD:** TD-LIBRARY-CLEANUP-PENDING-DELETES · TD-LIBRARY-PERSISTED-TAG-DB · TD-LIBRARY-SEARCH-SORT-BULK (все 3 кандидаты M-H).
**DEC-блок:** ⚓ DEC-LIB-10 (фиксация «teги только на LibraryEntry», supersedes филд `MoleculeContainer.tagIds: UUID[]` из ARCHITECTURE_v2 v1.1). ARCHITECTURE_v2.md v1.1 → v1.2.

**Отложенная приёмка.** Группы D/E/F/H (list-rows / soft-delete / tags inline / persistence reload) требуют entries в Library — в release-сборке Library стартует пустым. 10 unit-тестов в `Library.test.jsx` покрывают функционал. Визуальная приёмка этих групп — после v0.7.0 (M-B.1 Importer наполнит Library реальным импортом).

---

## v0.6.2 — M-A.2 i18n-prep (01.05.2026)

**Коммиты:** `5f536a0` → `cc98e63` → `1a876d0` → `3ee3427` + K5 HEAD (5 спринт-коммитов Code + 5 Chat-direct strings post-приёмки).
**Тесты:** 764 (652 Vitest + 112 pytest). Дельта от v0.6.1: 0 новых — только assertions обновлены в 4 правках `StartScreen.test.jsx` на STRINGS namespace.
**Build:** clean, 25807 KiB precache, 34 entries.

**Скоуп.** UI strings вынесены в централизованный `gui/designer/src/lib/strings.js` (6.6 KB) — plain JS namespace dictionary, named export `STRINGS`. 11 namespaces (`startScreen` / `topbar` / `projectInfo` / `settings` / `toast` / `pwa` / `multiTabLock` / `hotkeys` / `placeholder` / `app` / `common`). ~15 компонентов + 5 lib-модулей + 2 store slice переведены. backend `src/pvcs/` чист (никаких russian литералов). 4 отклонения Code от спеки (все приняты).

**Закрытые TD:** —  
**Открытые TD:** —
**DEC-блок:** ⚓ DEC-MA2-01 (bilingual policy — public code english, coordination docs russian); DEC-MA2-02 (3 strings правки + 3 правила перевода для M-B+, sprint-level).

---

## v0.6.1 — M-A.1 Polish (01.05.2026)

**Коммиты:** `9ffdf2d` → `ca20869` → `39af2b4` → `facd425` → `aac0b53` (5 коммитов K1–K5).
**Тесты:** 764 (652 Vitest + 112 pytest). Дельта от v0.6.0: +25 Vitest.
**Build:** clean, PWA precache 34 entries 25.78 MiB, bundle 368.84 KB / gzip 116.99 KB, CSS 64.86 KB / gzip 12.28 KB.

**Скоуп.** 6 TD-entries накопленных при финализации v0.6.0 закрыты: K1 modal guard в `runHotkeyResolver`, K2 tag suggestions tests, K3 runtime UI tests, K4 PWA setup (`vite-plugin-pwa@1.2.0`, `manifest.webmanifest`, 3 финальных иконки Hybrid B отрендерены из `docs/branding/logo.svg` через sharp), K5 Notion-style Toast queue (`components/Toast/` 4 файла + 8 тестов) + soft-delete pattern (`_pendingDelete` flag на project entity). 18/18 визуальных критериев PASS, 1-pass. 6 отклонений Code от спеки (все приняты).

**Закрытые TD:** TD-HOTKEY-MODAL-GUARD · TD-PROJECTINFO-SUGGESTIONS-NOTESTS · TD-EXPORT-DELETE-NOTESTS · TD-CMD-W-VIVALDI-LIMITATION · TD-PWA-SETUP-DEFERRED · TD-TOAST-UI-MINIMAL.  
**Открытые TD:** TD-CTRL-N-OS-FALLBACK (low priority known: в standalone PWA Ctrl+N с открытым modal → guard блокирует handler, Chrome открывает новое browser-окно как OS-fallback).
**DEC-блок:** DEC-MA1-01..04 (sprint-level): Notion-style Toast queue / soft-delete pattern / auto-dismiss timer в useEffect / `_pendingDelete` на entity.

---

## v0.6.0 — M-A core + finalization trifecta (30.04.2026)

**Коммиты:** Основные K1–K11: `b1b13b9` → `5b30e81` → `82ee848` → `4213465` → `bb8c77f` → `77c339a` → `ce4fb47` → `aa4f188` → `c08cf22` → `b33c441`. K4 retrofit: `441b53b` + `baa01c8`. M-A-fix-2: `fedbeed`. Плюс несколько Chat-direct правок (theme toggle вынос, Guide stub, back button, runtime UI, tag suggestions). **Total ~17 коммитов.**
**Тесты:** 739 · 851 (627 Vitest + 112 pytest). Базелайн до M-A был 1031 (v0.5.4-alpha) — в v0.6.0 wipe удалил 305 v0.5 тестов, добавил 95 новых v0.6.
**Build:** clean.

**Скоуп.** Первый milestone v0.6 rewrite. **Wipe всех v0.5 данных** (DEC-V2-08, ARCHITECTURE_v2 §0). M-A core (10 K-шагов): IndexedDB schema v1 (Dexie · `projects` table), store rewrite, `lib/file-system.js` helpers, App+AppShell+Topbar skeleton, StartScreen Variant B v7 wireframe (split panel 220px sidebar + Recent column), заглушки (Settings/Library/Primer pool/All projects/Group projects), lifecycle (createProject / openProject / closeProject), `.bodge` round-trip (File System Access API + fflate ZIP, fallback `<a download>`), multi-tab guard (`navigator.locks`), CSS + v0.5 wipe. K4 retrofit: `lib/hotkeys.js` 7.62 KB — hotkey registry 7 entries (`new-project`/`open-bodge`/`save-bodge`/`close-project`/`open-settings`/`escape`/`project-info`), single global keydown listener через `runHotkeyResolver`. M-A-fix-2: `ProjectInfoModal` (auto-open после createProject) + 7-й хоткей ⌘I + reducer `updateDescription` + кнопка ✏️ в Topbar.

**Закрытые TD:** — (v0.6 rewrite, baseline)  
**Открытые TD:** TD-HOTKEY-MODAL-GUARD · TD-PROJECTINFO-SUGGESTIONS-NOTESTS · TD-EXPORT-DELETE-NOTESTS · TD-CMD-W-VIVALDI-LIMITATION · TD-PWA-SETUP-DEFERRED · TD-TOAST-UI-MINIMAL (все 6 кандидаты v0.6.1).
**DEC-блок:** DEC-MA-01..04 (sprint-level): theme toggle в углу header (не Settings) / ProjectInfoModal central UI / auto-open after createProject / tag suggestions sort by frequency. Все anchor-уровневые решения уже в DEC-V2-01..30 + DEC-DS-01.

**Post-mortem.** Цикл имел 2 fix-итерации (M-A-fix-1 UX руками Игоря + M-A-fix-2 ProjectInfoModal). Root causes: theme toggle в Settings (не в углу header) и базовое редактирование name/tags out of M-A scope — оба от недостаточной эмпатии к workflow биолога в формулировке спеки. Вывод: добавить §2 playbook'а 4-й sanity вопрос «как биолог попадёт в эту функцию?» (deferred).

---

## Документационные milestones (без version bump)

**M-B Kickoff формализация (01.05.2026, между v0.6.2 и v0.6.3).** Library re-definition (личная коллекция контейнеров и праймеров, **НЕ** 3-tier ownership) + Importer scope (3 источника file/paste/cross-project, 2 контекста in-project + into-library). 15 ⚓ решений: DEC-LIB-01..09 + DEC-IMP-01..05 + DEC-REUSE-01. ARCHITECTURE_v2.md обновлён в 8 секциях (v1.0 → v1.1) одним атомарным edit_file с 12 hunks. Исходные записки `M_B_KICKOFF_NOTES.md` (7 KB) в archive/.

---

## Предыдущие версии (перед v0.6 rewrite)

**v0.5.4-alpha (28.04.2026)** — feature-complete: ~290 коммитов, 1126 тестов (1014 Vitest + 112 pytest). Sprint Catalog Polish FIX-2 финал. История в `docs/archive/SESSIONS_2026_Q2.md` (цикл ImportStartScreen + App-Decomp + IS-Final). v0.5 baseline полностью wiped при переходе на v0.6.0 (DEC-V2-08).

# BUGS.md — BodgeGene v0.8.3-alpha

Баги → сюда. Починены → `[x]`. Claude Code читает при старте сессии.

**Trekking новой архитектуры (v0.6+).** v0.5 баги архивированы в `docs/archive/BUGS_v05.md`. v0.6/0.7/early-0.8 закрытые баги (V49–V57, M-B.2 + Parser-Unification 02–03.05.2026) — в `docs/archive/BUGS_HISTORY.md`. Открытые v0.5 баги, которые могут проявиться в v0.6 (биологические alg-баги P6 mutagenesis triplet, V20 split-PCR micro-fragments, V23 GG orthogonal palindromes), переоткрываются здесь по факту воспроизведения.

---

## OPEN

### Критичные

(пусто)

### Высокие

**V51 — Drag selection микролаги в SequenceView на legacy железе** (OPEN, зафиксирован 10.05.2026, обнаружен на приёмке M-X.8/M-X.9).
- **Симптом:** drag selection по плазмиде происходит с видимыми микролагами (frame drops). User-perceived choppy.
- **Среда воспроизведения:** ThinkPad 2013-го года (dev workstation Игоря). На современном железе может быть невидимо — биолог на лабовом PC 2017-2019 увидит тоже.
- **Предполагаемые корни** (не расследованы):
  - Selection state идёт через Zustand → SequenceView/index.jsx (~39 KB) rerender'ится целиком, включая несвязанные tracks (Ruler / Restriction).
  - Transient drag state не отвязан от canonical Zustand store — каждый mousemove (~120/sec) идёт через фулл store update + React rerender pipeline.
  - Нет RAF-throttling на mousemove handler.
  - SVG `<rect>` в SelectionOverlay перевычисляется на каждый frame вместо CSS transform на absolutely-positioned div.
  - Плохо настроенные `useMemo` deps в tracks — мемо не работает при фреквентных изменениях selection.
- **Чинится:** отдельным перфо-спринтом. Диагностика через React DevTools Profiler + Chrome Performance первым шагом, точечные фиксы вторым. Предполагаемый объём: 2-5 дней Code-работы. Тип спеки C, мини-спека ~5 KB.
- **Связь с Rust/Tauri:** НЕ связан. Bottleneck — React state propagation pipeline, не compute.
- **STOP-условие фикса:** на ThinkPad 2013 или эквиваленте — selection drag smooth, нет visible frame drops на плазмиде до 15 kb.

### Средние

(пусто на момент финализации v0.8.3-alpha)

---

## FEATURE REQUESTS

(пусто на старте v0.6 — фичи живут в `docs/ARCHITECTURE_v2.md` §7 Roadmap до момента, когда становятся конкретным дизайн-вопросом)

---

## FIXED (текущий спринт v0.8.3-alpha — four-tier T1-T10 + T4.5 + canvas UX + primer redesign)

**[x] V84 — Realise-продукты (frag/product) не наследовали аннотации исходника** (FIXED 17.05.2026; full Vitest 3168 pass / 1 skip / 0 fail + 1 pre-existing flake TD-PRIMER-WIZARD не связан, 2/2 изолированно; zero регрессий).
- **Симптом (репорт Игоря + скриншот pks4):** `Сборка 1-frag-1..4` после Realise — пустые серые бары, без фич, хотя источники (`pBluescript SK(+)` и т.д.) имеют аннотации (MCS / T7 / T3 promoter). «продукты не наследуют аннотации исходника».
- **Корень (класс V83, рассинхрон zone vs legacy):** legacy `assembly-model.makeSourcedSegment` переносит фичи через `transferAnnotations(parentAnns, lo, hi, rc, srcId)` (`segment-annotation-transfer.js`), а 4-tier `zone-pieces-to-dag.draftFromZone` хардкодил sourced-сегменту `annotations: []`. `realiseAssembly` берёт `seg.annotations` → frag-контейнеры пустые; финальный `-product` тоже `annotations: []`. Путь op-execute (`operation-product-assembly.js`, DEC-PROD-07) аннотации переносил — баг только в realise/zone-пути.
- **Фикс (DRY, переиспользование проверенных хелперов):** (1) `draftFromZone` sourced-сегмент → `transferAnnotations(c.annotations, r.start, r.end, rc, r.sourceId)` (тот же helper, что у legacy); gap/orphan/no-ann → `[]`. Frag-контейнеры наследуют каскадом. (2) Новый чистый `concatSegmentAnnotations(segments)` в `assembly-model.js` — аннотации каждого сегмента смещаются на его char-offset в конкатенации (gap двигает offset, фич не даёт), порядок как у `computeAssemblySequence`; финальный `-product` контейнер → `annotations: concatSegmentAnnotations(segs)`.
- **Acceptance:** sourced full-range → фича в локальных координатах; clipped range → клип+сдвиг; reverse → зеркало+strand −1; нет источника/аннотаций → `[]`; gap → `[]`; realise frag-контейнер несёт фичу; `-product` агрегирует со сдвигом. +12 тестов `assembly-product-annotations.test.js`. Full Vitest **3168 pass / 1 skip / 0 fail**, zero регрессий.

**[x] V83 — При вставке gap с известной ПСО (линкер/своя) в сборку добавлялся поли-N вместо реальной ДНК** (FIXED 17.05.2026; full Vitest 3119 pass / 1 skip / 0 fail + 1 pre-existing flake TD-PRIMER-WIZARD не связан; zero регрессий).
- **Симптом (репорт Игоря + скриншот):** в зоне-сборке сегмент №5 «gap · unknown · 54 bp» отрисован как 54×N в последовательности. 54 нт = пресет-линкер **T2A** (`GAGGGCAGAGG…CCT`, самовырезающийся пептид — функциональный элемент, НЕ unknown-плейсхолдер). «при добавлении gap добавляется поли N, а не то что написано в карточке».
- **Корень (подтверждён по коду):** 4-tier gap-piece (`piece-model.createPiece`, T6 DEC-T6-02) хранил **только** `gapLength`+`gapHint` — реальная ПСО (InsertGapModal таб «Линкер»/«Своя ПСО» → `onInsert({sequence})`) молча отбрасывалась в `zone-assembly-write-adapter.INSERT_MANUAL_SEGMENT` (брал лишь `.length`). На realise/display `draftFromZone`/`computeAssemblySequenceFromPieces` → `sequence:''` → `'N'.repeat(gapLength)`. Было задокументировано как T6-deviation DEC-T6-02/09 «sequence-lossy»; репорт Игоря промотировал в реальный баг.
- **Фикс (аддитивный, без миграции):** gap-piece получил опциональный `gapSequence`. Когда задан (линкер/своя) — хранится дословно, `gapLength === gapSequence.length`, `gapHint='known'`, end-to-end сохраняется (`createPiece` / `piece-invariants` consistency-инвариант / `zone-assembly-write-adapter` / `draftFromZone` / `segment-to-piece-adapter`). Когда НЕ задан (таб «Неизв. длина») — поведение **без изменений**: поли-N от `gapLength`. Старые persisted gap-pieces без `gapSequence` → поли-N (доп. поле опционально, `SCHEMA_VERSION` не бампился).
- **Acceptance:** линкер T2A → gap-piece c `gapSequence`=T2A, realise → frag/product содержат реальную ДНК, нет N-ранов; своя ПСО `atcgATCG` → `ATCGATCG` (uppercase) сохранена; «Неизв. длина» 20 → по-прежнему 20×N (корректный плейсхолдер). +15 тестов `gap-known-sequence-v83.test.jsx`. Full Vitest **3119 pass / 1 skip / 0 fail**, zero регрессий.

**[x] V82 — Дефолтная «стартовая сборка» не отражалась в счётчике «Сборки (N)»** (FIXED 17.05.2026; full Vitest 3105 pass / 1 skip / 0 fail, zero регрессий; вариант 1 «панель → zone-based» по выбору Игоря).
- **Симптом:** в стартовый проект добавлено 3 элемента в авто-сборку на canvas («Сборка 1 · 3 узла»). Панель «📋 Сборки (0)» / «Сборок пока нет.» её не показывала. «+ Новая сборка» создаёт нормально, но первая (дефолтная) не отражалась.
- **Корень (подтверждён по коду):** `buildInitialState` (skeleton-state.js:69–75, T3 DEC-T3-08) сидил новый проект **дефолтной ZONE** «Сборка 1» (`createZone`), НЕ assemblyDraft. `AssemblyDraftsPanel.jsx` считала `state.assemblyDrafts.length` (пуст — T6 мигрировал черновики→зоны). Пост-T6 рассинхрон: концептуальная «сборка» = zone, но legacy-панель считала drafts.
- **Фикс (вариант 1, архитектурно-верный — единый источник истины, без техдолга):** `AssemblyDraftsPanel.jsx` переписана **zone-based** — счётчик/карточки от `selectAllZones(state)`; узлы в карточке = `nodeListInZone` (containers+pieces+operations); «+ Новая сборка» → `CREATE_ZONE` («Сборка {N}», offset bounds); card Open → `openEditorAssemblyTab(zone.id)` (T6 dual-resolve в AssemblyModeShell); Delete → `REMOVE_ZONE`. Pin/Unpin убран (zone всегда on-canvas frame). Testid'ы сохранены.
- **Acceptance:** новый проект → «Сборки (1)», карточка «🧬 Сборка 1»; добавление узлов в зону → счётчик узлов в карточке растёт; «+ Новая сборка» → 2-я zone; Open → assembly-таб на zone id; Delete → zone удалена. +5 новых тестов `assembly-drafts-panel-v82.test.jsx`. Full Vitest **3105 pass / 1 skip / 0 fail**, zero регрессий.
- **Известное следствие:** `assemblyReducer`/`state.assemblyDrafts` остаётся живым (T6 K14) для on-canvas `AssemblyDraftBlock`/`MiniProjectCanvas` (legacy, не в скоупе V82). Полная зачистка legacy assembly-draft слоя — отдельный T-future cleanup.
- **Дополнительный реверс (17.05.2026, по AskUserQuestion):** позже DEC-T3-08 + V61 РЕВЕРСНУТЫ — `buildInitialState` больше НЕ сидит default zone, ghost auto-respawn отключён. Чистый старт (`zones:[]`); сборка создаётся явно через «+ Новая сборка». См. журнал PROJECT_STATE «реверс DEC-T3-08/V61» 17.05.

**[x] V81 — Мини-канвас нельзя свернуть (всегда занимает угол editor-окна)** (FIXED 16.05.2026, bug-session; full Vitest 2641 pass / 1 skip / 0 fail, build clean).
- **Запрос (Игорь):** мини-канвас (MiniProjectCanvas, V68 — всегда виден, zIndex 40) сделать сворачиваемым.
- **Решение (local-state toggle, минимальный scope; V68 always-visible сохранён как default):**
  1. `MiniProjectCanvas.jsx` — `useState collapsed` (default `false`).
  2. Свёрнуто → одиночная иконка-пилюля 🗺 (30×30, top:60/right:16, zIndex 40), `data-testid=mini-canvas-collapsed`, клик → развернуть.
  3. Развёрнуто → кнопка `–` `data-testid=mini-canvas-collapse` (top-right), клик → свернуть. Токены `--surface-*/--text-*/--border-subtle`.
- **Acceptance:** по умолчанию развёрнут (V68 не задет); клик `–` → frame исчезает, остаётся иконка 🗺; клик иконки → разворачивается; маркеры/клик-навигация/assembly-маркеры работают как раньше. +1 V81 `editor-window-shell.test.jsx` K4. Full Vitest **2641 pass / 1 skip / 0 fail**, build clean.

**[x] V80 — Выделение праймера в PCR-вьювере тянулось от 1-го нуклеотида** (FIXED 15.05.2026, root-caused; live-gesture за биологом).
- **Симптом:** в PcrModeShell выделение под праймер «автоматом тянется со всего с первого нуклеотида» (anchor = 0).
- **Корень:** `PcrModeShell.onCaretChange(pos)` ставил ТОЛЬКО `setCaretPos(pos)`, никогда не сбрасывал `caretAnchor`. SequenceView controlled по `caretAnchor`/`caretPos`; `caretAnchor` оставался на initial `useState(0)` навсегда. Эталон `ContainerEditorSkeleton.onCaretChangeFromView` при не-extend делает `setCursorAnchor(pos)` (collapse) — этого в PcrModeShell не было (недосмотр при V71-рефакторинге).
- **Фикс:** `onCaretChange(pos, opts)` зеркалит эталон: `setCaretPos(pos)`; если `!opts?.extendSelection` → `setCaretAnchor(pos)` + `setSelectionMode('dna')`.
- **Acceptance:** простой клик → anchor схлопывается на клик; extendSelection → anchor сохраняется. +2 V80 `pcr-mode-selection.test.jsx`. Full Vitest 2501 pass / 1 skip / 0 fail.

**[x] V79 — `127.0.0.1:3000` не грузился; AmneziaVPN перехватывал `localhost`** (FIXED 15.05.2026, измерено на машине).
- **Симптом:** биолог переустановил браузер — всё равно «не подхватывает» новый код. `localhost:3000` грузит старое, `127.0.0.1:3000` не грузится вообще.
- **Корень:** (1) Vite по умолчанию биндится только на `localhost` → резолвилось в IPv6 `::1`; на IPv4 `127.0.0.1:3000` не слушал НИКТО. (2) AmneziaVPN UP — перехватывал `localhost`/`::1`-путь и отдавал stale-ответ.
- **Фикс:** `vite.config.js` `server` — `host: true` (dual-stack), `strictPort: true`, `hmr.host: '127.0.0.1'`, proxy `/api` → `http://127.0.0.1:8000`.
- **Verification:** `:3000` биндит `::` (dual-stack), `127.0.0.1:3000` → 200; свежий бандл с V78/V76/V74.
- **Что делать биологу:** открывать **`http://127.0.0.1:3000`** (не `localhost`) — в обход AmneziaVPN.

**[x] V78 — Клик по committed PCR-опу открывал тесный params-popup, viewer недостижим** (FIXED 15.05.2026, live-verified в браузере).
- **Симптом:** биолог: «праймеры не отражаются, нет Tm, хоткеи/ПКМ не работают». PCR-viewer + праймеры через hover-иконку (V70) работали, но клик по ромбу committed PCR — открывал PCROpPopup, не viewer.
- **Корень:** `CanvasLayoutView.onOperationClick` для committed-op с inputs всегда делал PCROpPopup независимо от kind.
- **Фикс:** `onOperationClick` ветка для `op.kind === 'pcr'` с template → `actions.openEditorOpTab(op.id)` (как V70 hover-icon). Не-PCR kinds (cut/gibson/…) сохраняют popup.
- **Live verification:** committed PCR → single-click → pcr-mode-shell + editor-window-shell + 3 sequence-view-primer + PrimerSuggestionsPanel «Tm 61°C». +2 V78 `pcr-mode.test.jsx`. Full Vitest 2499 pass / 1 skip / 1 known flake / 0 real fail.

**[x] V77 — Stale PWA service worker отдаёт старый бандл в dev** (FIXED 15.05.2026).
- **Симптом:** в `npm run dev` браузер исполняет старый бандл — V72–V76 «не работают», хотя тесты зелёные. Все 4 фичи отсутствуют ОДНОВРЕМЕННО = stale JS из precache.
- **Корень:** SW от прошлого `vite build`/preview зарегистрирован на `localhost:3000` и контролирует origin; dev-сервер SW не отдаёт, поэтому старый SW бесконечно отдаёт свой precache. Ctrl+F5 не помогает (SW перехватывает fetch).
- **Фикс (dev-only, prod PWA не тронут):** `lib/pwa-install.js` — `purgeStaleServiceWorkers({nav,cacheStore})`: снимает все SW-регистрации + чистит все Cache Storage. `main.jsx` — вызов ТОЛЬКО под `if (import.meta.env.DEV)`; если SW контролировал страницу → один `location.reload()` под sessionStorage-guard. +4 V77 `pwa-install.test.js`. Full Vitest 2497 pass / 1 skip / 0 fail.
- **⚠ Bootstrap:** фикс в НОВОМ бандле, а браузер пока крутит СТАРЫЙ → нужно ОДИН раз выбить SW вручную, дальше V77 сам.

**[x] V76 — Нет температуры отжига рядом с курсором при выделении фрагмента** (FIXED 15.05.2026).
- **Запрос:** при выделении фрагмента в вьювере показывать рядом с курсором температуру отжига (Tm). Формула в v0.5.
- **Решение (переиспользование v0.5-формулы + prop-driven SequenceView):** `calcTm` из `src/tm-calculator.js` (SantaLucia 1998 NN). `SequenceView/index.jsx` — opt-in prop `showSelectionTm` (default false). При активном DNA-выделении считает `calcTm(fullSeq.slice(lo,hi))` и рисует near-cursor тултип `Tm ≈ X°C · N bp`. `SequenceTab` pass-through; `PcrModeShell` включает `showSelectionTm`.
- **Acceptance:** в PCR-вьювере выделил участок → рядом с курсором Tm + длина; нет выделения / aa-режим / off → тултипа нет. +4 V76 `selection-tm.test.jsx`. Full Vitest 2493 pass / 1 skip / 0 fail.

**[x] V75 — Праймеры + фланкируемая область не видны на canvas-минимапе при выбранной PCR** (FIXED 15.05.2026).
- **Запрос:** праймеры должны отражаться на минимапе; когда выбран PCR-оп — явно подсвечивать выбранные праймеры и какую область они фланкируют.
- **Решение (prop-driven расширение, переиспользование binding-математики):** `selectors-pcr.js::selectPcrSpans(state, opId)` — та же math что в `adapters/pcr.js`. Возвращает `{flank:{start,end}, primers:[{start,end,direction,name}]}`. `MiniPlasmidMap.jsx` — opt props `primers=[]`, `flank=null`. `ContainerBlock.jsx` pass-through. `CanvasLayoutView.jsx` — props только на блок темплейта highlighted PCR-оп.
- **Acceptance:** выбрал PCR → на блоке темплейта мини-карта показывает fwd/rev маркеры + flank-арку; не-PCR / не темплейт — без оверлея. +2/+4 V75 тестов. Full Vitest 2488 pass / 1 skip / 0 fail.

**[x] V74 — Нет записи праймера через right-click меню SequenceView** (FIXED 15.05.2026).
- **Запрос:** в существующее right-click меню добавить пункты выбора праймера.
- **Решение (чистое расширение через `extraItems`):** `SequenceView/index.jsx` — consumer-gated prop `onWritePrimer`; в extraItems добавляются «Прямой праймер» / «Обратный праймер» при `typeof onWritePrimer === 'function'`. Library/Importer prop не передают. `SequenceTab.jsx` pass-through. `PcrModeShell.jsx` — `writePrimerForRange(direction,lo,hi)` core; hotkey-путь и `onWritePrimer` идут в один core.
- **Acceptance:** right-click по выделению в PCR → «Прямой/Обратный праймер»; клик пишет нужную цепь. +2 V74 `pcr-mode-selection.test.jsx`. Full Vitest 2482 pass / 1 skip / 0 fail.

**[x] V73 — executePCR игнорировал выбранные/написанные праймеры (op.params.userPrimers)** (FIXED 15.05.2026 — keystone).
- **Симптом:** праймеры из вьювера (Ctrl+R → `op.params.userPrimers`) показывались, но при execute игнорировались.
- **Корень:** `adapters/pcr.js` `executeSingleTemplatePCR` не читал `operation.params.userPrimers`.
- **Фикс:** ветка перед auto-design — если `!primerPairId && userPrimers[0].forward && .reverse` → ампликон считается тем же bio-bridge (indexOf binding на темплейте, RC downstream от forward; tails не темплируются). `origin.userPrimers:true`. Приоритет: explicit primerPairId → userPrimers → autoDesign.
- **Acceptance:** PCR с `userPrimers` даёт ампликон по выбранным праймерам. +2 V73 `skeleton-adapters-s2.test.jsx`. Full Vitest 2480 pass / 1 skip / 0 fail.

**[x] V72 — Праймеры писались авто-по-выделению (без явной кнопки)** (FIXED 15.05.2026).
- **Запрос:** Ctrl+R прямой / Ctrl+Alt+R обратный — только в открытом PCR viewer.
- **Решение (decouple + per-strand hotkey, scoped via lifecycle):** `lib/hotkeys.js` — +2 entries `pcr-primer-forward` (Ctrl+R), `pcr-primer-reverse` (Ctrl+Alt+R). Scope `'global'`, viewer-scope через `useHotkey` lifecycle. RU-раскладка через `event.code` fallback. HotkeyCheatsheet auto-derives. `PcrModeShell.jsx` — `onSelectRangeFromView` теперь ТОЛЬКО трекает выделение; `writePrimerStrand(direction)` пишет ОДНУ цепь.
- **Acceptance:** выделение само не пишет; Ctrl+R в viewer пишет forward, Ctrl+Alt+R reverse, повтор аккумулирует; вне viewer Ctrl+R = reload браузера. Full Vitest 2478 pass / 1 skip / 0 fail.

**[x] V71 — PCR viewer = bespoke сущность вместо переиспользования Library sequence viewer** (FIXED 15.05.2026, spec-level — reverses DEC-CANVAS-PCR-05/06, добро Игоря явно).
- **Запрос:** переиспользовать Library sequence viewer (SequenceView/SequenceTab) внутри PcrModeShell.
- **Фикс:** `PcrModeShell.jsx` переписан: центр = `<SequenceTab>` (Library viewer). Bespoke `<pre>` template + `PrimerDragHandles` удалены. Header (level switcher), `PrimerSuggestionsPanel`, footer/OrderOligosConfirmGate сохранены. `operation-pcr-bridge.js` — `fwdBinding`/`revBinding` additive.
- **Acceptance:** PCR-режим показывает Library SequenceView с шаблоном; выделение пишет user primers (source 'edited'); auto-designed pair виден; bespoke компоненты отсутствуют. Full Vitest 2474 pass / 1 skip / 0 fail.
- **Открытый вопрос для Chat:** формализовать reversal DEC-CANVAS-PCR-05/06 + обновить F3 спеку — Code спеку не трогает.

**[x] V70 — Клик по hover-иконке PCR не открывает viewer** (FIXED 15.05.2026).
- **Симптом:** ожидаемый flow — клик по 🔬: (1) создаётся блок op, (2) вбивается темплейт, (3) сразу заходим в viewer. Фактически — только (1)+(2), биолог должен был руками double-click ромб.
- **Фикс:** `createOperationDraft` принимает опциональный `id`. `CanvasLayoutView.onPickHoverOp` — pre-gen `opId = uuidv7()`, передаётся в `opAdd`, затем `actions.openEditorOpTab(opId)`.
- **Acceptance:** hover filled-контейнер → клик 🔬 → активный operation-tab с PcrModeShell + темплейт. +1 V70 `pcr-mode.test.jsx` K7. Full Vitest 2472 pass / 1 skip / 1 pre-existing flake.

**[x] V69 — PCR-операция из hover-иконки не подхватывает темплейт (PCROpPopup игнорирует op.inputs[0])** (FIXED 15.05.2026).
- **Симптом:** клик 🔬 PCR создаёт op с `op.inputs=[fragmentId]`. Popup открывается с пустым template-`<select>`.
- **Корень:** `PCROpPopup.jsx:22` инициализировал `templateId` ТОЛЬКО из `params.templateId`, игнорируя `operation.inputs[0]`.
- **Фикс:** `inputTemplateId = operation.inputs?.[0]`; `templateId` init = `params.templateId || inputTemplateId || ''`. Тот же порядок резолва что в `adapters/pcr.js:25-27`.
- **Acceptance:** PCR из hover-иконки открывается с уже выбранным темплейтом; explicit `params.templateId` по-прежнему приоритетнее. +2 V69 `skeleton-op-popup-k6.test.jsx`. Full Vitest 2471 pass / 1 skip / 0 fail.

**[x] V68 — ContainerBlock: пропорции + MiniProjectCanvas visibility/labels** (FIXED 15.05.2026 приёмка F1-F4).
- **Запрос (4 пункта):** (1) блок «более квадратным»; (2) название контейнера не должно перекрываться подписями feature-арок; (3) MiniProjectCanvas виден всегда; (4) подписи у маркеров MiniProjectCanvas.
- **Фикс:** (1) `BLOCK_LINEAR_H` 110→150 (240×150). (2) Row1 (имя) — divider-band + Row2 overflow:hidden. MiniPlasmidMap height 62→90. (3) MiniProjectCanvas zIndex 2→40. (4) `<text>` подписи у маркеров (truncate 14 симв, halo).
- **Acceptance:** блок ближе к квадрату; имя в своей полосе, никогда не перекрывается; mini-canvas всегда видна; у маркеров truncate-имена. +8 V68 тестов. Full Vitest 2469 pass / 1 skip / 0 fail.

**[x] V67 — Соединительные линии op↔контейнер привязаны к центру, не к границе** (FIXED 15.05.2026 приёмка F1-F4).
- **Симптом:** линии op→input / op→output / preview drag-to-connect входили в горизонтальный ЦЕНТР контейнера, а не в боковую ГРАНИЦУ.
- **Фикс:** container endpoint X = `opCx >= (cPos.x+120) ? cPos.x + BLOCK_LINEAR_W : cPos.x` (facing edge). Применено в 3 местах. +1 V67 `skeleton-op-wires-a4.test.jsx`.

**[x] V66 — На canvas-прямоугольнике контейнера нет подписей feature-арок** (FIXED 15.05.2026 приёмка F1-F4).
- **Симптом:** в прямоугольнике контейнера на canvas (MiniPlasmidMap) feature-арки только с `<title>`, без видимых текстовых подписей.
- **Фикс:** новый shared `src/lib/plasmid-label-utils.js` (`pickRegionsForLabels` + `truncateLabel`). `MiniPlasmidMap.jsx` — рендер `<text>` подписей (`mini-plasmid-label`), малый шрифт 6.5 + halo.
- **Acceptance:** на canvas видны подписи; PlasmidMiniMap/Dag/overview без регрессий. +3 V66 тестов.

**[x] V65 — Нет user-facing входа в канвас проекта + canvas не per-project** (FIXED 15.05.2026 приёмка F1-F4).
- **Симптом:** (1) Из Library входа в canvas нет (только dev-кнопка sidebar StartScreen). (2) Состояние канваса персистилось в один глобальный blob, не привязано к проекту.
- **Фикс:** (1) `skeleton-persistence.js` `stateKeyFor(projectId)`: `null` → legacy global key, projectId → `canvas-state-v1::<projectId>`. (2) `skeleton-context.jsx` читает `currentProjectId` из global store; rehydrate keyed by него; project-switch без snapshot → `RESET`. (3) Nav: sidebar StartScreen + LibraryTopBar — кнопка `📂 Открыть проект` → `pushFullscreen({fullscreen:'canvasSkeleton'})`.
- **Acceptance:** из StartScreen sidebar И Library есть «Открыть проект»; проект A сохраняется отдельно от B. +3 V65 `skeleton-persistence-s3.test.jsx`. Full Vitest 2457 pass / 1 skip / 0 fail.

**[x] V64 — На 2-м контейнере ghost id коллидировал (slice 8 chars uuid)** (FIXED 14.05.2026 bug-session).
- **Корень:** `makeGhostPlaceholder` использовал `c-ghost-${uuidv7().slice(0, 8)}` — uuid'ы в одной мс начинаются с одних hex.
- **Фикс:** полный `uuidv7()` без slice.

**[x] V63 — Ghost respawn'ится рядом с filled (привязан); надо в углу** (FIXED 14.05.2026 bug-session).
- **Фикс:** `GHOST_HOME_POSITION = {x:40, y:40}`. `ensureGhostPlaceholder` default'ит на home; filled уезжает на cascade-slot grid 5×N (260×100 шаг).
- **Реверс (17.05):** см. ниже «реверс DEC-T3-08 + V61» — ghost auto-respawn отключён вообще.

**[x] V62 — Ghost auto-respawn не работал runtime + drag по ghost открывал picker** (FIXED 14.05.2026 bug-session).
- **Фикс:** (1) `skeleton-state.js` — FINALIZER на уровне main router'а: после любого action `ensureGhostPlaceholder`. (2) `CanvasLayoutView.jsx` — `justDraggedRef` флаг: `onPointerUp` ставит true когда `dragging.hasMoved`; `onPlaceholderClick` skip'ает picker если флаг true.
- **Реверс (17.05):** ensureGhostPlaceholder отключён, но `justDraggedRef`-guard сохранён и расширен на op-drag (см. ниже «drag ромба → отпускание бросает в сиквенс-вивер»).

**[x] V61 — Призрачный (ghost) контейнер + переделка picker** (FIXED 14.05.2026 → РЕВЕРС 17.05.2026).
- **Изначальный запрос:** на canvas всегда РОВНО 1 ghost. При его клике — picker с 4 секциями. После выбора → fill → новый ghost появляется автоматически.
- **Фикс 14.05:** `ensureGhostPlaceholder` финализатор + `makeGhostPlaceholder`. Стартовых placeholder'ов 1. `PlaceholderTreePicker.jsx` 4 секции (search + Из проекта + Коллекция + Другие проекты + Библиотека-link).
- **Реверс 17.05 (по AskUserQuestion Игоря «Полностью из state»):** в составе canvas cleanup — `ensureGhostPlaceholder` финализатор **отключён** в `skeletonReducer`. Чистый старт без авто-госта. Picker работает по запросу через explicit «+ Сборка»/«+ Операция»/drag-drop. **DEC-T3-08 одновременно реверснут** (default zone «Сборка 1» не сидится). См. PROJECT_STATE «реверс DEC-T3-08/V61» 17.05.

**[x] V59 — Пропала кнопка «+ Операция»** (FIXED 13.05.2026 bug-session).
- **Симптом:** floating button «+ Операция» отсутствует на Graph view.
- **Корень:** кнопка жила в `CanvasLayoutView.jsx`, а не в общем `CanvasArea`. При переключении на Graph view терялась.
- **Фикс:** перенёс в `CanvasSkeleton/index.jsx::CanvasArea`. `position: absolute; bottom: 20; right: 24; zIndex: 30`. Cascade-offset по `state.operations.length`.

**[x] V58 — Ромбы operation не двигаются по canvas** (FIXED 13.05.2026 bug-session).
- **Корень:** `onPointerMove` обрабатывал только `dragging` для контейнеров.
- **Фикс:** `dragging` state получил поле `kind: 'container' | 'operation'`, `onOperationPointerDown(e, opId)`, в `onPointerMove` switch → `actions.opSetPosition` для op-kind.
- **Regression test:** 2 теста `skeleton-operation-node-k5.test.jsx` (`describe('V58 ...')`).

**[x] V52 — Quick-add дублировал entry в активный проект без предупреждения** (FIXED 16.05.2026, bug-session; full Vitest 2640 pass / 1 skip / 0 fail).
- **Симптом:** клик hover-revealed `+` на entry в чужом проекте добавлял копию в активный проект без проверки на дубликат.
- **Фикс (инвариант в store):** `cloneEntryToActiveProject(entryId, opts={})` — fingerprint-скан перед клонированием (name + resourceHash/sequence). Дубликат → return `{ok:false, reason:'duplicate', existingId, name}` без клонирования. `opts.force` обходит. `TreeItemRow.onQuickAdd` → `window.confirm` («уже есть, добавить ещё одну копию?») → forced 2-я копия по Да.
- **Acceptance:** первый quick-add — как раньше; повторный → confirm Да/Нет, по умолчанию (Нет/dismiss) не создаётся. +4/+1 V52 тестов. Full Vitest **2640 pass / 1 skip / 0 fail**.

---

## Архивные FIXED записи

Старшие FIXED (v0.5 legacy + v0.6/0.7/0.8.0-0.8.2 — Sprint M-B.2 + Parser-Unification 02–03.05.2026, V49 / V50, и т.д.) — в `docs/archive/BUGS_HISTORY.md`.

v0.5 legacy баги — в `docs/archive/BUGS_v05.md` (последняя запись 28.04.2026: Sprint Catalog Polish + FIX cycle закрыл 11 import-related багов V35–V48).

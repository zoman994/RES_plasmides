# BUGS.md — BodgeGene v0.8.4-alpha

Баги → сюда. Починены → `[x]`. Claude Code читает при старте сессии. Единственный трекер багов (CLAUDE.md §4).

---

## Сброс 27.05.2026 — трекер начат с чистого листа

Трекер вычищен полностью. Причина: после переработки структуры assembly/skeleton
(Звено-сессии, 23.05+) диагнозы накопленных OPEN-багов ссылались на файлы,
которых в дереве больше нет (`assembly-realise-suggest.js`, `skeleton-state.js`,
`selectors-assembly.js` и др.) — следовать им вслепую нельзя. Решение Игоря:
не пере-диагностировать стек устаревших записей, а прогнать реальные пайплайны
заново и репортить свежие баги от живого симптома.

**Где старое:**
- `docs/archive/BUGS_PRE_RESET_2026_05_27.md` — полный до-сбросовый снимок
  (13 OPEN со стале-диагнозами V51/V98–V110 + весь FIXED-блок v0.8.3 V52–V117).
- `docs/archive/BUGS_HISTORY.md` — закрытые баги v0.6–0.8 (V49–V57 и др.).
- `docs/archive/BUGS_v05.md` — v0.5 legacy (V1–V48).

**Нумерация:** новые баги — с **V118**. Номера V1–V117 не переиспользовать —
они живут в `DECISIONS.md` / `ZVENO_LOG.md` / commit-сообщениях, коллизия
сломает обратные ссылки.

**Carry-over (известны, не репортить как новые).**
- Drag-selection микролаги в SequenceView на legacy-железе (бывш. V51) — ждёт перфо-спринта; живёт в `PROJECT_STATE.md`.
- ~~Рассинхрон Dexie: браузер `bodgegene-db` v50 vs код `DB_VERSION = 5`~~ — **ФАНТОМ, снято 31.05.2026.** Dexie кодирует IDB-версию ×10: `IDB v50 = Dexie v5` — норма. Реального downgrade нет (иначе приложение не открылось бы с VersionError, а оно работает). Не репортить.

---

## OPEN

### Средние

> **V139–V141 — canvas-UX кластер**, surfaced на приёмке слоя 2 набора live-junction (05.06.2026). **НЕ движковые баги:** слой 2 трогал `primer-derive.js` + `zone-pieces-to-dag.js`, не canvas-компоненты → это не регрессия слоя 2. Фикс — в отдельной canvas-сессии (§7: приёмка движка ≠ canvas-UX звено), пересекается со слоями 3 (JUNCTION) и 5 (CANVAS_LIVE_PROJECTION). Перед фиксом — читать код от симптома (§0), не от догадки.

**V139 — клик по ромбу PCR (realised op) на канвасе ничего не делает.** Найдено Игорем на приёмке слоя 2 (05.06). Симптом: realised-операция (ромб) на графе не реагирует на клик → инспекция realised-праймеров заблокирована. **Перед фиксом (§0):** читать `onOperationClick` / `justDraggedRef` guard в canvas-компоненте от симптома — возможен залипший drag-guard (ср. V61-период `justDraggedRef` на `onOperationClick`). Радиус неизвестен до чтения.

**V140 — зона-контейнер: сборку нельзя двигать внутри зоны, контейнер не масштабируется.** Найдено там же (приёмка слоя 2, 05.06). Симптом: внутри зоны узлы/сборка не перетаскиваются, габариты зоны-контейнера не меняются. Радиус — zone bounds / drag-within-zone / resize handles; читать от симптома до фикса. Тот же кластер, пересечение слои 3/5. **Половина «контейнер не масштабируется» — адресована 11.06** (см. FIXED 11.06: видимые угловые ручки + кнопка «⤢ подогнать» + `SET_ZONE_AUTO_RESIZE` opt-out, чтобы ручной ресайз не отскакивал). Половина «узлы не таскаются» — теперь **by-design** (M-CANVAS-FIX.1 K1: авто-раскладка авторитетна, таскается ЗОНА, не узлы). Финальная диспозиция V140 — за приёмкой M-CANVAS-FIX.1.

**V141 — панель «Контейнеры → Праймеры» обрезана/тесная.** Найдено там же. Праймеры в панели присутствуют, но читаемость низкая (layout/overflow панели). Тот же кластер. Косметика/layout, не корректность данных.

### Низкие

**V120 — ORF detection не видит circular wrap.** Найдено Code-аудитом 28.05. `orf-detection.js:39-67` сканирует линейные `seq` + `rcSeq`; ORF, пересекающий начало координат (origin кольцевой плазмиды), пропускается или обрезается. Плазмиды кольцевые. **Фикс:** для circular сканировать `seq + seq.slice(0, maxORFnt)`, фильтровать по старту в `[0, len)`. **⏸ ОТЛОЖЕНО 28.05.2026** — не быстрый фикс: требует проброса topology через `detectORFs`/`runPredictors` + wrap-scan + поддержку wrap-координат аннотаций (feature-sized, риск регрессии в predictor-пайплайне). Низшая severity (origin-spanning ORF — меньшинство, ORF — подсказка). Оставлен в OPEN для отдельной задачи.

**V121 — SapI `cutOffset: 4` неверен (мёртвые метаданные).** Найдено Code-аудитом 28.05. `golden-gate.js:31` — по конвенции остальных 4 GG-ферментов (`recognition_len + top_spacer`) для SapI `GCTCTTC(1/4)` должно быть 8, не 4. НО `cutOffset` нигде не читается (`designOverhangs` использует `overhangLength` + границы фрагментов) → функционального эффекта НЕТ. Чинить для корректности данных / будущих консьюмеров. (Не блокер, фикс не срочен.)

**V137 — смена типа фичи в Annotator плодит новый трек вместо смены типа текущей фичи.** Найдено Игорем на partial-приёмке 30.05.2026 (репортёр GFP). При смене `type` существующей фичи в Annotator создаётся НОВАЯ запись фичи (новый трек), а тип текущей не меняется → дублирующиеся фичи. Не диагностировано — вне скоупа partial-приёмки, отдельное звено. Радиус неизвестен (Annotator type-редактор / update-path аннотации) — читать код от симптома перед фиксом.

---

## FIXED — canvas realise UX (11.06.2026, прямой запрос Игоря; ждёт визуальной приёмки)

> Не sprint-задача — прямой запрос Игоря по скриншотам. Версия НЕ бампается. Git/трекеры (PROJECT_STATE/RELEASES/DECISIONS) — за Игорем.

**V142 — ✅ ИСПРАВЛЕНО 11.06.2026. Сборка дублируется при повторной «Реализации».** Найдено Игорем по скриншоту (зона «16 узлов» = 2× всё: два frag-1, два frag-2, два Gibson, два product). **Корень (пред-существующий, усилен снятием модалки):** `handleAssemblyRealise` (`store/skeleton-state.js`) делал `operations:[...state.operations, ...diff]` БЕЗ удаления прежнего вывода, а для ЗОНЫ `nextRev` всегда 1 (revision-cap — концепт legacy-драфта) → каждый клик «Реализовать» доклеивал полную копию DAG. Раньше модалка делала realise 2-кликовым (реже случайный повтор); прямой realise (этой же сессии) клик-в-клик умножал. **Фикс:** новый чистый хелпер `pruneZoneRealiseOutput(state, zoneId)` (`lib/zone-pieces-to-dag.js`) — перед добавлением diff сносит ПРЕДЫДУЩИЙ вывод realise этой зоны (каждый созданный realise op/container несёт `origin.assemblyId`; junctions — `realisedFrom.assemblyId`; источники тега не несут → переживают). **Только для зоны** — legacy-драфты сохраняют multi-revision накопление (design-variants, DEC-REAL-08). Re-realise теперь **идемпотентен** (само-лечится: повторный клик схлопывает уже наплодившийся дубль в один DAG). `skeleton-state.js` остался под hard (24.89/25 — хелпер вынесен). **Тесты:** unit `pruneZoneRealiseOutput` (prune-by-tag + same-ref fast-path) + integration в `zone-assembly-realise.test.jsx` (двойной клик → counts не удваиваются, ровно один `realised-product`). Full Vitest 4472 pass / 17 skip / 0 fail, build clean.

**Сопутствующее (review-driven, та же сессия):** убрана модалка «Реализовать как DAG» (битый SVG-preview после фикса топологии 10.06 → прямой realise + тост из редьюсера, единый источник); зона на канвасе сделана регулируемой (видимые угловые ручки + `SET_ZONE_AUTO_RESIZE` opt-out на ПЕРВОМ движении ресайза — не на голый клик; кнопка «⤢ подогнать»). Двойной тост и false-success на revision-cap устранены снятием компонентного тоста.

**Канвас-рендер графа (та же сессия, по скриншотам Игоря).** (1) **Стрелки шли «криво / из центра» — корень:** код рёбер в `ZoneGraphContent` выбирал размер узла по `fromNode.kind` (всегда `undefined` — kind лежит в `node.data.kind`, реальный размер — top-level `node.width/height`) → ВСЕ рёбра якорились op-размером 120×60, даже для блоков 240×150 → линия выходила из горизонтальной середины / у верха прямоугольника. Фикс: рёбра берут `node.width/height`; `edgeAnchors(...,{flow:'LR'})` форсит горизонтальный right→left поток (не 4-сторонний авто, который плёл углы на merge 2→1); offset-aware кривизна для пологого изгиба. (2) **Канвас компактнее:** `computeGraphPositions` кормит dagre реальными per-node размерами (ромб 120×60 ≠ блок 240×150), `computeAutoLayout` конвертит центр→top-left по собственному размеру узла (раньше единый 270×180 смещал ромбы на (75,60)); `ranksep` 80→56, `nodesep` 50→36. (3) **Кнопка «⛶ под размер сборки»** в zoom-контролах (`contentBBox`+`fitZoomToContent`, zoom+центрирование; инлайн-SVG, т.к. глиф ⛶ рендерится пустым в Windows-UI-шрифтах — проверено в живом приложении). Тесты (red→green): `dag-layout` per-node `sizeOf`; `contentBBox`/`fitZoomToContent`; `edgeAnchors` `flow:'LR'`; регресс в `zone-frame-graph-render` (ребро от блока стартует в `(left+240, top+75)`). Full Vitest **4484 pass / 17 skip / 0 fail**, `vite build` clean.

> **Отложено (не реализовано в этой сессии):** in-zone op-popup на клик по ромбу (паритет с `CanvasGraphView`: picker для draft / `OpPopupRouter` для committed, position-anchored на CanvasLayoutView). Сейчас клик в зоне диспатчит `OPEN_EDITOR_OP_TAB` (K4-минимум). Исследовано (CanvasGraphView/OpPopupRouter/op-kinds-registry — эталон готов), реализация — отдельная `.2`-задача.

---

## FIXED — live-junction ENGINE слои 1–2 (приёмка 05.06.2026)

> Часть набора live-junction сборки (4 спеки в `docs/`); это слои 1–2 из 6. **Версия НЕ бампается** (mid-spec). Канон ориентации хвостов — DEC-PRIMER-TAIL-01 (DECISIONS). Коммиты: `20d2978` (слой 1, pydna-диагностика), `4b9e5d5` (слой 2, `buildOverlapTail` + V130 + Tm), `ba423c1` (V130-тест). Git-коммит — за Игорем в терминале.

**V130 — ✅ ИСПРАВЛЕНО + принято (слой 2 PASS) 05.06.2026. realise роняла overlap-хвосты авто-праймеров сборки (tailless-материализация).** `deriveAutoPrimers` (`components/CanvasSkeleton/lib/primer-derive.js`) эмитит праймеры `source.kind='auto-group'` (с хвостами overlap/GG/RE) в `state.assemblyDraftPrimers[zoneId]`. `mapPrimersForSegment`/`realiseAssembly` (`components/CanvasSkeleton/lib/zone-pieces-to-dag.js`) матчил ТОЛЬКО `source.kind ∈ {segment, boundary}` → auto-group мимо → fallback `autoPrimerPair(seg.sequence)` = `slice(0,20)`/`rc(slice(-20))`, tm:0, БЕЗ хвостов (тихий неверный продукт — сборка физически не соберётся). **Фикс (слой 2, `4b9e5d5`):** `mapPrimersForSegment` матчит auto-group по `source.pieceId === seg.id` независимо от kind; `getBoundaryPrimerInfo` берёт праймер с самым длинным хвостом на стыке (односторонний overlap делает upstream-rev пустым). **Тест (`ba423c1`):** новый `describe` в `zone-pieces-to-dag.test.js` — `zoneStateWithGroup()` (CREATE_OP_GROUP `overlap_pcr` → 4 хвостатых auto-group драфта) → `realiseAssembly(s,'zn-1',{0:'gibson'},{})` → per-op ассерты `userPrimers[0].source==='assembly'` (НЕ `'auto'`-fallback), `fwdTm!==0`, `forward===` draft-fwd с хвостом + односторонний overlap (downstream fwd > binding, upstream rev = binding-only). До фикса вернулось бы `source:'auto'`/tm0/20нт. Code-verify §9b PASS (assertion на данные сильнее визуала, не зависит от сломанного canvas-UI — V139). Full Vitest 4328 pass / 17 skip / 0 fail, build clean.

**V131 — ✅ ИСПРАВЛЕНО + принято (слой 2 PASS) 05.06.2026. GG- и RE-хвосты `deriveAutoPrimers` расходились с принятыми V124/V125 (тот же класс ориентации сайта).** `primer-derive.js`: GG rev был `rc('GGTCTCN'+oh)` (rc ВСЕГО recognition+spacer+overhang → digest BsaI оставляет низовой конец BLUNT, не лигируется); RE fwd был `reSite+'GG'` (защитные основания ВНУТРИ, нет 5′-фланкинга → плохой/нулевой рез forward-плеча). Фиксы V123/V124/V125 легли только в `local-primer-design.js` (канвасом НЕ используется) → primer-derive их не получил. **Фикс (слой 2, `4b9e5d5`, через единый `buildOverlapTail`):** GG rev → `recognition + spacer + rc(oh)` (recognition НЕ rc, V124; pydna-proven — оба designed 5′-overhang'а AATG+AAGC лигируются); RE fwd → protective СНАРУЖИ сайта (V125; NEB-данные о терминальном резе); литерал спейсер `'N'`→`'A'`. Overlap-ветка primer-derive уже была верна (fwd дословно / rev rc). pydna-эталоны `tools/pydna/primer_tail_golden.json` (слой 1, `20d2978`): GG-инвариант перевёрнут `it.fails`→`it`. Full Vitest 4328 pass / 17 skip / 0 fail, build clean. **Не входит в V131 (→ TECH_DEBT):** per-enzyme recognition (BsaI-хардкод `GGTCTC` / protective `GCGC`, RE rev только 2 нт фланка vs fwd 4 нт) — пробрасывается из JUNCTION; ручной `buildAssemblyPrimer` A1-паритет (несёт старый хвост до унификации на `buildOverlapTail`).

---

## FIXED (v0.8.4-alpha — приёмка 31.05.2026)

> Трекер сброшен 27.05 (нумерация с V118), ничего старше 2 спринтов → архивация не требуется.
> **Все записи ниже приняты Игорем 31.05.2026 («всё принято»)** — пометки «Ждёт приёмки» / «Ждёт визуальной приёмки» в телах записей считать снятыми.
> Git-коммит фиксов (math/bio + partial) — за Игорем в терминале.

**V119 — ❌ ОТОЗВАНО 28.05.2026 — НЕ БАГ. Вырожденно-палиндромные сайты якобы считаются дважды.** **Снято при попытке фикса:** эмпирическая проверка (probe + полный прогон) показала, что `findSitesInSequence` возвращает РОВНО 1 хит для HincII/StyI/PpuMI — двойного счёта НЕТ. Ошибка исходного диагноза: `restriction-db.js` использует СОБСТВЕННЫЙ локальный `reverseComplement` (стр.108-113) с полной IUPAC-таблицей, а НЕ sequence-utils-версию (которая теряет коды → V118). Поэтому `rcSite('GTYRAC')==='GTYRAC'` → палиндром-skip срабатывает корректно → обратная цепь не сканируется второй раз. Правок в restriction-db не требуется. (V118 — реальный и НЕЗАВИСИМЫЙ: это ДРУГОЙ revComp в sequence-utils.)

### Критичные

**V123 — КРИТ: overlap/Gibson/OE-PCR праймеры не имеют общего перекрытия → сборка физически не соберётся.** Найдено Code math/bio-аудитом 28.05 (доказано симуляцией). **✅ ИСПРАВЛЕНО 28.05.2026** — все ветки `overlapTail` (split WT / split overlapSequence / left_only / right_only) + single-circular self-closure приведены к стандартной Gibson/OE-PCR конвенции (подтверждена исходниками pydna `assembly_fragments`: fwd-хвост = 3′-конец соседа как есть, rev-хвост = `rc(5′-начала соседа)`). Добавлен biology-invariant тест в `local-primer-design-overlap.test.js` (реконструкция амликонов → проверка общего overlap + бесшовной сшивки), переписаны 3 теста, фиксировавших инвертированные хвосты. Full Vitest 4083 pass / 0 fail, build clean. `local-primer-design.js:180-194` (`overlapTail`). Затронуты ВСЕ overlap/Gibson/OE-PCR сборки ≥2 фрагментов + single-circular self-closure. KLD/RE-ligation/Golden Gate идут другими ветками — не задеты. Канон — DEC-PRIMER-TAIL-01.

### Высокие

**V124 — Golden Gate: reverse-primer Type IIS хвост инвертирует recognition → BsaI-сайт у 3′-терминуса смотрит НАРУЖУ → это плечо не режется → GG не собирается.** Найдено Code math/bio-аудитом 28.05 (тот же класс, что V123). **✅ ИСПРАВЛЕНО 28.05.2026** — rev-хвост GG теперь `recognition + spacer + rc(oh)` (recognition БЕЗ rc, как в верном forward-плече). Добавлен Type IIS-симулятор дайджеста в `__tests__/primer-tail-orientation.test.js`: оба плеча режутся внутрь → комплементарные overhang'и (`rc(ohR)===ohL`, `===` designed oh). Full Vitest 4086 pass / 0 fail, build clean. `local-primer-design.js` (`overlapTail`, ветка `golden_gate`): rev = `enz.recognition + spacer + rc(oh)`. Канон — DEC-PRIMER-TAIL-01.

**V125 — RE-ligation: forward-primer RE-хвост реверс-комплементирован → сайт впритык к 5′-концу без защитных оснований снаружи → плохой/нулевой рез forward-плеча.** Найдено Code math/bio-аудитом 28.05 (тот же класс, что V123/V124). **✅ ИСПРАВЛЕНО 28.05.2026** — RE-ветка теперь `return tail` (literal) для обеих сторон; forward-продукт получает защитные основания СНАРУЖИ сайта (5′-фланкинг). Тест в `__tests__/primer-tail-orientation.test.js` (forward RE-сайт имеет ≥1 нт 5′-фланкинга). Full Vitest 4086 pass / 0 fail, build clean. `local-primer-design.js` (`overlapTail`, ветка `ligation`/`re_ligation`): `return tail;` для обеих сторон. Канон — DEC-PRIMER-TAIL-01.

### Средние

**V138 — ✅ ИСПРАВЛЕНО + принято визуально 31.05.2026 (DEC-FDP-01). Бокс CDS-фичи не покрывал всю ДНК гена: белковый детектор подрезал прямоугольник к кодонной сетке (≤2 nt), импорт голого сиквенса держал полный.** Найдено Игорем 31.05 (после приёмки V134), сравнение «Annotator vs импорт голого сиквенса». Воспроизведено Chat на реальном sfGFP. **АА верны — дело только в боксе** (Игорь подтвердил дважды). AA-дорожка `AATrack` (single) уже выбирает кадр через `pickReadingFrame` (минимум стопов, не start%3 — V133) и транслирует только полные кодоны внутри бокса → АА корректны независимо от ширины бокса, AATrack НЕ трогать. Расходилась только ширина БОКСА: `feature-detection.js` блок `protein_partial` маппил protein-матч на кодонную сетку (`frame.offset+k*3`) → бокс на ≤2 nt короче ДНК гена во фрагменте с разрезом посреди кодона. **Фикс (провалидирован Chat-харнессом, fwd+rev):** в блоке `protein_partial`, после кодонно-сеточных `ntStart/ntEnd`, nt-refine каждого края — тянуть наружу ≤2 nt, пока ДНК-таргет совпадает с собственной ДНК фичи `feat.sequence` (strand-aware), стоп на мисматче/краю; cap=2 ограничивает совпадение со фланком. Только `protein_partial`; `protein_exact`/`protein_fuzzy` и `dna_partial` — НЕ тронуты. Валидация: bare GFP-фрагмент fwd/rev → бокс `0..len` полный = как импорт; embedded → клип во фланк ≤2 nt (cap); exact/fuzzy не задеты.

**V134 — ✅ ИСПРАВЛЕНО + принято визуально 31.05.2026 (DEC-FDP-01). Partial mis-fragmentation: неполный фрагмент фичи с правкой на стыке либо дробился на два `_part_` (A), либо терял клочок < floor (B, ~45 nt чистого GFP пропадали).** Найдено Игорем на приёмке partial 31.05 — два кадра: A `_part_7-213`+`_part_217-684`; B `_part_217-585` с потерянной головой 172-216. Воспроизведено Chat (20+ сценариев, реальный sfGFP из `common-features.json`). Один корень: `extendSeedPartial` вставал на ≥2-кодонном мисматч-ране, а отколотый кусок < `minLen` (17 aa/50 nt) не выпускался → merge склеивать нечего. **Фикс (2 слоя, провалидирован Chat-харнессом):** Слой 1, главный — заменить оконный разрыв в `extendSeedPartial` на BLAST-style X-drop (score +1/−1, граница = пик/snap-back, protein `xdrop=8` / DNA `xdrop=20`; финальный identity-гейт + coverage-floor — бэкстоп): мостит замену-ран → ОДИН кусок с точными границами (чинит A и B сразу). Слой 2, вторичный — `mergeCollinearPartials` выпущенных кусков для indel'ов, которые X-drop не мостит (И featureGap И targetGap ≤ `PARTIAL_MERGE_MAX_GAP`=18 → слить; вставка ≥30 nt → split). Провалидировано: чистый фрагмент 217-630 → ровно `_part_217-630`; стык-ран → один кусок; вставка 3/6/15 nt → слить, 30/90 → split; варианты GFP (fuzzy/exact) без изменений.

**V133 — Annotator Level 1: устаревший результат «прилипает» к новой плазмиде (чужой хит мапится, пока не нажмёшь «Run again»).** Найдено Игорем на partial-приёмке 29.05. `Annotator/index.jsx` авто-ран L1 ключевался по `scope.sequenceId` + гейт `if (results[L1]) return`. В embedded-режиме `sequenceId` залипает → старый L1-хит остаётся в `annotator.results` и рисуется на новой последовательности (тихий неверный результат). **✅ ИСПРАВЛЕНО 29.05.2026** — авто-ран ключуется по СОДЕРЖИМОМУ `sequence` (deps `[annotator.open, sequence]`, `autoRunFiredFor` по контенту); при смене контента → `resetAnnotatorScope()` + ре-ран. Идемпотентность сохранена. Тест в `annotator-autorun.test.jsx`. Full Vitest 4110 pass / 0 fail, build clean.

**V127 — сборщик последовательностей показывает координаты фич/сегментов с 0 (должно быть 1-based).** Найдено в диалоге с Игорем 29.05. Хранение 0-based, end-exclusive (⚓ DEC-ANN-10), UI везде 1-based — НО в сборщике (`assembly-mode`) четыре места печатали сырой 0-based `start`. **✅ ИСПРАВЛЕНО 29.05.2026** — `RangePickerModal` (`featureLabel` + start-инпут) и `SegmentList` (`rowSource` + inline-редактор) переведены на 1-based дисплей через `toUiCoords`/`fromUiCoords`; хранение/slice/onConfirm/updateSegmentRange/caretAnchor не тронуты. Новый `assembly-coords-1based-v127.test.jsx` + обновлены 5 ассертов в 4 файлах. Full Vitest 4097 pass / 0 fail, build clean. ✔ Визуальная приёмка пройдена 29.05.2026 (Игорь: «стало с 1»).

**V118 — `reverseComplement` молча теряет IUPAC-коды → N.** Найдено Code-аудитом 28.05. `sequence-utils.js`. `sanitizeSequence` при вводе ambiguity-коды СОХРАНЯЕТ, а `reverseComplement` маппил R/Y/S/W/K/M/B/D/H/V → 'N'. Радиус: feature-detection (−цепь), orf-detection (rcSeq), golden-gate `checkInternalSites`, primer design на −цепи. **НЕ затрагивает рестрикцию** (свой локальный IUPAC-корректный revComp, см. отзыв V119). **✅ ИСПРАВЛЕНО 28.05.2026** — `COMPLEMENT_MAP` расширен до полной IUPAC-таблицы (R↔Y, M↔K, S↔S, W↔W, B↔V, D↔H, N↔N + lowercase). Тест `__tests__/iupac-revcomp.test.js` + переписан `sequence-utils.test.js`. Full Vitest 4091 pass / 0 fail, build clean.

**V122 — digest: аннотации, пересекающие линию реза, ломаются или теряются.** Найдено Code-аудитом 28.05. `restriction-db.js`: `_shiftAnnotations` при linearize — аннотация через `cutPos` получала `start > end`. **✅ ИСПРАВЛЕНО 28.05.2026 (linearize)** — `_shiftAnnotations` теперь split'ит straddling-фичу на ДВЕ валидные дуги (`[tail..seqLen]` + `[0..head]`); тест в `restriction-digest.test.js`. Full Vitest 4094 pass / 0 fail. **Остаётся отдельно (НЕ блокер, follow-up):** excise-ветки (`_exciseTwoEnzymes`/`_exciseSameEnzyme`) всё ещё ДРОПают straddling-аннотации — lossy, но НЕ corrupting (вывод валиден); split там — отдельная правка по запросу.

### Низкие

**V129 — RC-ориентация сегмента не видна у координат (флаг «скрыт» в дальней RC-колонке).** Найдено Игорем на приёмке V127 (29.05). **Решение (конвенция):** числа НЕ переворачиваем (координаты = диапазон в источнике, по возрастанию — GenBank `complement(1..69)`), добавляем явный маркер: `pUC19 [1:69] ←RC`. **✅ ИСПРАВЛЕНО 29.05.2026** — `SegmentList.rowSource` (`reverseComplement` → ` ←RC`); тесты в `assembly-coords-1based-v127.test.jsx`. Full Vitest 4105 pass / 0 fail, build clean. ✔ Визуальная приёмка пройдена 29.05.2026 («работает»).

**V128 — audit close-out: enrich мутировал чужие объекты + detail/point без write-path id + генератор id на Math.random.** Найдено Code-аудитом модуля аннотаций 29.05 (продолжение V127, три не-блокера). **✅ ИСПРАВЛЕНО 29.05.2026** — (1) enrich клонирует каждую аннотацию на входе (`annotations.map(a => ({...a}))`) + новый common_db-region получает `id`; (2) `importFeatures` / `autoAnnotate` / `migratePartAnnotations` стампят `id` на каждую аннотацию всех уровней перед возвратом (write-path TD-IMPORTER-NO-ID закрыт); (3) новый `lib/ids.js::makeId` (crypto.randomUUID feature-detect), `generateRegionId` делегирует. Тесты: новый `annotation-write-path-ids.test.js` + 2 в `enrichment.test.js`. Full Vitest 4103 pass / 0 fail, build clean. Остаток: read-path net для legacy detail/point оставлен открытым (TD).

**V126 — auto-annotate: детекция стоп-кодона «в конце» использует неверную формулу позиции последнего кодона для регионов с длиной не кратной 3.** Найдено Code math/bio-аудитом 28.05. `auto-annotate.js:70` — `lastCodonPos = Math.floor((upper.length - 1) / 3) * 3`. Для длины `L%3 ∈ {1,2}` указывала на НЕПОЛНЫЙ хвостовой кодон и пропускала реальный последний полный in-frame кодон. **✅ ИСПРАВЛЕНО 28.05.2026** — формула заменена на `(Math.floor(upper.length / 3) - 1) * 3`. Тест `__tests__/auto-annotate-stop.test.js` (стоп находится при L%3≠0 + регрессия L%3==0). Full Vitest 4094 pass / 0 fail.

---

## FEATURE REQUESTS

(пусто — фичи живут в `docs/ARCHITECTURE_v2.md` §7 Roadmap до момента, когда становятся конкретным дизайн-вопросом)

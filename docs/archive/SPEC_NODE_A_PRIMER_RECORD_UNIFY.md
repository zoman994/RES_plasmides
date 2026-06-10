# SPEC — Узел A: унификация record'а assembly-праймера

**Тип:** A (архитектура / data model — единый record праймера + миграция-вайп).
**Версия:** v0.8.3-alpha. **Дата:** 23.05.2026.
**Закрывает:** `BUGS.md` V107; `docs/UX_AUDIT_FINDINGS.md` WT-UX-16, WT-UX-17. Снимает раскол двух систем праймеров (источник V105/V109 и будущих рассинхронов).
**Согласовано с Игорем 23.05.2026:** Вариант 1 (нормализация на записи); контракт record'а — за Chat; старые персистентные праймеры — вайп.
**Источник диагностики:** чтение кода 23.05.2026 — `primer-derive.js`, `assembly-primer-utils.js`, `skeleton-state-assembly.js`, `skeleton-state-operations.js`, `selectors-assembly.js`, `assembly-realise-suggest.js`, `AssemblyPrimersPanel.jsx`, `useAssemblyPrimerWriting.js`.
**Cross-ref:** канонический record §4 суперсидит форму праймера в `SPEC_ASSEMBLY_WORKFLOW_UX.md` §3/§6.3 (та спека ввела старую auto-форму `origin:{kind:'auto-from-group'}` + `binding`/`tail`/`autoMode`). Когда реализуется M-CANVAS-WORKFLOW-UX, её K11/K12 (primer derivation) пишутся против §4 этой спеки, не против §6.3 ASSEMBLY_WORKFLOW_UX. Соответствующая правка внесена в ASSEMBLY_WORKFLOW_UX §6.3 (пометка суперседа 23.05).

---

## §0 Размеры затрагиваемых модулей

| Файл | Размер | Лимит | Примечание |
|---|---|---|---|
| `lib/primer-derive.js` | 6.14 KB | .js 25/20 | `makePrimer` переписывается, запас большой |
| `lib/assembly-primer-utils.js` | 5.02 KB | .js 25/20 | `buildAssemblyPrimer` +2 поля |
| `lib/assembly-realise-suggest.js` | 3.89 KB | .js 25/20 | `getBoundaryPrimerInfo` — фильтр |
| `store/skeleton-state-assembly.js` | 17.07 KB | .js 25/20 | `WRITE_ASSEMBLY_PRIMER` — +2 поля |
| `store/skeleton-state-operations.js` | 20.78 KB | .js 25/20 | **выше soft 20.** Правки net-neutral (замена строк, не добавление) — декомпозиция не требуется, но Code не дописывает в него лишнего |
| `store/selectors-assembly.js` | 3.22 KB | .js 25/20 | `selectBoundaryCoverage` — фильтр |
| `store/skeleton-persistence.js` | 18.98 KB | .js 25/20 | вайп-гейт на hydrate |
| `editor/assembly-mode/AssemblyPrimersPanel.jsx` | ~11 KB | .jsx 40/30 | `srcLabel` — +ветка |

Ни один файл не требует декомпозиции. `skeleton-state-operations.js` — watch: правки в нём заменяющие, не растящие.

---

## §1 Контекст / корень (подтверждено чтением кода)

Хранилище праймеров **уже единое**: `state.assemblyDraftPrimers` — мапа `draftId → Primer[]` (`draftId` = id зоны или legacy-assemblyDraft). Op-группы — не отдельный слайс: это `Operation` с `isOpGroup:true` + `zoneId` + `inputPieces` в `state.operations`.

В одну мапу `assemblyDraftPrimers[draftId]` пишут **два продюсера**, каждый — своей формой:
- **`WRITE_ASSEMBLY_PRIMER`** (ручной праймер из выделения) → `buildAssemblyPrimer` (`assembly-primer-utils.js`). Форма: `source:{kind:'boundary'|'segment', boundaryAtOffset?, leftSegmentId?, rightSegmentId?, segmentId?, selectionStart, selectionEnd}`, поле binding'а — `bindingSequence`, `direction:'forward'|'reverse'`, есть `pairId/gc/range/status/crossesBoundaries/origin(строка)`.
- **`CREATE_OP_GROUP`** («Auto-собрать») → `deriveAutoPrimers` (`primer-derive.js`). Форма: `origin:{kind:'auto-from-group', opGroupId, pieceId, side}` (**объект**), поле binding'а — `binding`, направление — `origin.side:'fwd'|'rev'`, `source` **отсутствует**, нет `pairId/gc/range/status/crossesBoundaries`.

**Раскол — не структурный, а раскол формы записи** в одном слайсе. Потребители покрытия границ (`selectBoundaryCoverage`, `getBoundaryPrimerInfo`) фильтруют `p.source.kind==='boundary'` — auto-праймеры без `source` им невидимы → V107 (счётчик границ 0/N), WT-UX-16/17 (вкладка «Границы» не показывает overlap). `REMOVE_OP_GROUP`/`DISBAND_OP_GROUP`, наоборот, написаны под auto-форму (`p.origin.kind==='auto-from-group'`). Худшая ловушка — поле `origin`: **одно имя, разный тип** (строка у manual, объект у auto).

Два продюсера нужны оба — `buildAssemblyPrimer` отвечает на «биолог выделил диапазон», `deriveAutoPrimers` — на «выведи fwd/rev на каждый кусок op-группы с overlap-хвостами»; это разные вычисления. Унификация = **единый record + потребители под него**, продюсеров остаётся два.

---

## §2 Стратегия

Канонический record праймера — надмножество обеих форм. Провенанс целиком уходит в `source` (расширенный); отдельное поле `origin` убирается. Оба продюсера эмитят канонический shape. Потребители покрытия границ ключуются на наличие `source.boundaryAtOffset`, не на `source.kind`. Старые персистентные праймеры — вайп (схема-гейт на hydrate). После — V107/WT-UX-16/17 закрыты, локальный обход V109 остаётся валидным (комплементарен).

---

## §3 Где задача сядет / Scope

**Связи (что задевается):**
- Продюсеры: `primer-derive.js::deriveAutoPrimers/makePrimer`, `assembly-primer-utils.js::buildAssemblyPrimer`, `skeleton-state-assembly.js::WRITE_ASSEMBLY_PRIMER`.
- Потребители: `selectors-assembly.js::selectBoundaryCoverage`, `assembly-realise-suggest.js::getBoundaryPrimerInfo`, `AssemblyPrimersPanel.jsx::srcLabel`, `skeleton-state-operations.js::REMOVE_OP_GROUP/DISBAND_OP_GROUP`.
- Персистентность: `skeleton-persistence.js` (вайп-гейт).
- Не задевается, проверено: `findPairId` (manual-only — auto получает `pairId` напрямую), `SHIFT_ASSEMBLY_PRIMERS` (auto-праймеры не имеют `source.selectionStart` → корректно пропускаются), `useAssemblyPrimerWriting.viewerPrimers` (читает поля, которые в каноне есть у всех — auto-праймеры начнут корректно рисоваться, см. §побочный эффект).
- Ничего нового не создаётся. Расширяются существующие функции и один record.

**Scope IN:**
- Канонический record праймера (§4).
- Оба продюсера эмитят канон (§5.1, §5.2, §6).
- Потребители — переведены на `source.boundaryAtOffset` / `source.kind:'auto-group'` (§5.3–5.6).
- Вайп персистентного `assemblyDraftPrimers` (§7).
- Тесты (§8).

**Scope OUT:**
- `local-primer-design.js` / `lib/bio/gibson-primer-design.js` / `sanger-primer-design.js` — op-level primer-world (ПЦР-операции, не assembly-группы). К этому расколу отношения не имеют. НЕ трогать.
- Объединение самих продюсеров в одну функцию — НЕ делается (разные вычисления, §1).
- `suggestMethodForBoundary` ветка `opGroup.kind` — это V109 (отдельная спека, см. §15). Узел A до-правит в `assembly-realise-suggest.js` только `getBoundaryPrimerInfo` под новую форму.
- Подгонка длины binding авто-праймера под целевую Tm — не этот узел (WT-UX-18, отдельный батч).
- Переименование слайса `assemblyDraftPrimers` (имя legacy, используется и для зон) — naming-debt, отдельно.

---

## §4 Канонический record праймера (контракт)

Каждая запись в `assemblyDraftPrimers[draftId]` — этот shape. Оба продюсера обязаны эмитить его полностью.

```
{
  id,                                  // 'asmprm-' + uuidv7 (префикс унифицирован)
  draftId,                             // id зоны/драфта (= ключ мапы; хранится для self-containment)
  pairId,                              // fwd+rev одной пары делят pairId
  name, label,                         // label по умолчанию = name
  direction: 'forward' | 'reverse',    // auto-продюсер маппит из side fwd/rev
  sequence,                            // полный 5'→3' = tail + bindingSequence
  bindingSequence,                     // только binding-область (auto: было поле `binding`)
  tail,                                // overlap/adapter-хвост 5'→3'; '' если хвоста нет
  tm,                                  // SantaLucia NN (calcTm) — после V105
  gc,                                  // GC% binding-области; auto-продюсер считает
  mutated,                             // bool; default false
  status: 'auto' | 'edited' | 'stale', // default 'auto'
  autoMode: 'auto' | 'manual',         // у ВСЕХ явно; manual-продюсер ставит 'manual'
  crossesBoundaries,                   // segId[] стыка; '' → []; auto с хвостом → [leftSegId,rightSegId]
  range,                               // {start,end} ассемблейные коорд.; manual — есть, auto — null
  notes,                               // string; default ''
  createdAt, updatedAt,                // Date.now()
  source: {
    kind: 'segment' | 'boundary' | 'auto-group',
    boundaryAtOffset?,    // ← ЕДИНЫЙ ключ покрытия границы; присутствует у любого
                          //   праймера, реализующего внутренний стык (manual-boundary ИЛИ auto)
    leftSegmentId?,       // при boundaryAtOffset — сегменты стыка
    rightSegmentId?,
    segmentId?,           // kind:'segment' (manual в пределах одного сегмента)
    selectionStart?,      // manual: провенанс выделения (kind boundary|segment)
    selectionEnd?,
    opGroupId?,           // kind:'auto-group': провенанс
    pieceId?,
    side?,                // 'fwd' | 'rev'
  }
}
```

**Решения по контракту (обоснование для DECISIONS):**

**A1 — провенанс единым полем `source`; поле `origin` удалено.** Старый `origin` был коллизией (строка `'manual'` у одного продюсера, объект у другого). Manual-провенанс уже жил в `source` (`kind`/`selectionStart`/`selectionEnd`). Auto-провенанс (`opGroupId`/`pieceId`/`side`) переезжает в `source`. Одно поле провенанса на весь record.

**A2 — `source.kind` остаётся честным: `'auto-group'` ≠ `'boundary'`.** Auto-праймер НЕ притворяется `kind:'boundary'`. Причина: `srcLabel` (PrimerRow) и `findPairId` используют `source.kind` по назначению — смешав auto с manual-boundary, получим неверные подписи («граница X→Y» вместо «авто»).

**A3 — покрытие границ ключуется на `source.boundaryAtOffset`, не на `source.kind`.** `selectBoundaryCoverage` / `getBoundaryPrimerInfo` фильтруют по `Number.isFinite(p.source?.boundaryAtOffset) && p.source.boundaryAtOffset === off`. Тогда и manual-boundary-праймер, и auto-group-праймер с overlap-хвостом считаются одинаково, kind при этом остаётся точным. По одной строке правки в каждом селекторе.

**A4 — `tail` хранится явно у всех.** `buildAssemblyPrimer` сейчас не хранит `tail` отдельно (только склеивает `sequence`); `deriveAutoPrimers` хранит. Канон — хранить всегда (`tail=''` если нет). Нужно для overlap-Tm (WT-UX-17, будущий батч) и упрощает `getBoundaryPrimerInfo` (длина хвоста = `tail.length`).

**A5 — `autoMode` явный у всех.** Manual-продюсер ставит `'manual'` (раньше не ставил → `undefined`). `REMOVE_OP_GROUP`/`DISBAND_OP_GROUP` решают keep-vs-drop по `autoMode!=='manual'` — явное значение надёжнее.

---

## §5 Изменения по файлам

### 5.1 `primer-derive.js` — `makePrimer` (продюсер auto)
Переписать `makePrimer` под канон §4. Эмитить: `direction` (маппинг `side` fwd→forward / rev→reverse), `bindingSequence` (бывшее `binding`), `tail` (уже вычисляется), `gc` (посчитать по `bindingSequence` — helper как `gcPercent` в `assembly-primer-utils.js`, либо переиспользовать его), `status:'auto'`, `autoMode:'auto'` (уже есть), `mutated` (уже есть), `pairId` (присвоить: fwd+rev одного куска делят один `pair-${uuidv7()}` — генерится один раз на кусок), `crossesBoundaries` (`[leftSegId,rightSegId]` если у праймера есть overlap-хвост, иначе `[]`), `notes:''`, `createdAt/updatedAt`, `id` с префиксом `asmprm-`. `source` — `{kind:'auto-group', opGroupId, pieceId, side, boundaryAtOffset?, leftSegmentId?, rightSegmentId?}` (`boundaryAtOffset` и сегменты — см. §6). Поля `binding`/`origin` старой формы — удалить.

### 5.2 `assembly-primer-utils.js` — `buildAssemblyPrimer` (продюсер manual)
- Добавить в возвращаемый объект `tail`: для junction-ветки — уже вычисленный overlap (`tail` переменная), для single-segment — `''`.
- `source` остаётся как есть (`kind:'boundary'|'segment'` + координаты) — он уже канонический.
- `gc`, `crossesBoundaries`, `bindingSequence` — уже есть.

### 5.3 `skeleton-state-assembly.js` — `WRITE_ASSEMBLY_PRIMER`
В сборку record'а: добавить `tail` (из `built.tail`), `autoMode:'manual'`. Удалить поле `origin` (строка `action.source||'manual'`). `range/status/pairId/crossesBoundaries/name/label/...` — уже есть. (Действия `REMOVE/UPDATE/SHIFT_ASSEMBLY_PRIMER` — без правок: оперируют по `id`, `SHIFT` корректно пропускает coordless.)

### 5.4 `selectors-assembly.js` — `selectBoundaryCoverage`
Фильтр `at`: было `p.source && p.source.kind==='boundary' && p.source.boundaryAtOffset===off` → стало `p.source && Number.isFinite(p.source.boundaryAtOffset) && p.source.boundaryAtOffset===off`. Одна строка. `fwd`/`rev` по `p.direction` — у auto-праймеров `direction` теперь есть.

### 5.5 `assembly-realise-suggest.js` — `getBoundaryPrimerInfo`
Тот же фильтр-сдвиг, что §5.4 (по `boundaryAtOffset`, не `kind`). `tailLength` — взять `hit.tail.length` напрямую (поле `tail` теперь есть), убрать вычисление через `sequence.length - bindingSequence.length`. `suggestMethodForBoundary` ветку `opGroup.kind` — НЕ трогать (это V109).

### 5.6 `skeleton-state-operations.js` — `REMOVE_OP_GROUP`, `DISBAND_OP_GROUP`
Фильтр удаления auto-праймеров: `p.origin.kind==='auto-from-group' && p.origin.opGroupId===…` → `p.source && p.source.kind==='auto-group' && p.source.opGroupId===…`. `p.autoMode!=='manual'` — без изменений. Два места (`REMOVE_OP_GROUP` + цикл `DISBAND_OP_GROUP`).

### 5.7 `AssemblyPrimersPanel.jsx` — `srcLabel`
Добавить ветку `source.kind==='auto-group'` → подпись вида «авто · кусок {segName(?)}» либо «авто-группа: {segName(left)} → {segName(right)}» при наличии `boundaryAtOffset`. Строки — `STRINGS`. PrimerRow в остальном работает (читает `p.direction/p.tm/p.gc/p.autoMode/p.status/p.crossesBoundaries` — все в каноне есть у auto).

---

## §6 `deriveAutoPrimers` — простановка `boundaryAtOffset` (ядро узла)

Сейчас `deriveAutoPrimers(opGroup, state)` не считает ассемблейные координаты. Для канонического `source.boundaryAtOffset` нужно:

1. Резолв драфта зоны: `opGroup.zoneId` → `state.zones` → `draftFromZone(state, zone)` (импорт из `zone-pieces-to-dag`). Если зоны нет (legacy assemblyDraft) — `boundaryAtOffset` не проставляется, auto-праймер получает `source.kind:'auto-group'` без `boundaryAtOffset` (фолбэк, не ломается).
2. `segmentBoundaries(draft).boundaries` — массив, `boundaries[i]` несёт `segmentId`, `startOnAssembly`, `endOnAssembly`. Внутренний стык между сегментом i и i+1 = `boundaries[i].endOnAssembly` (контракт `selectBoundaryCoverage`).
3. Маппинг куска op-группы на сегмент драфта по `pieceId`/`segmentId` (Code сверяет shape — в зоне piece ↔ segment).
4. Простановка:
   - **fwd-праймер** куска с индексом сегмента `k` (k≥1, есть `logicalPrev` ⇒ непустой `fwdTail`) → `boundaryAtOffset = boundaries[k-1].endOnAssembly`; `leftSegmentId/rightSegmentId` — сегменты `k-1` и `k`.
   - **rev-праймер** куска `k` (k < last, есть `logicalNext` ⇒ непустой `revTail`) → `boundaryAtOffset = boundaries[k].endOnAssembly`; сегменты `k` и `k+1`.
   - fwd первого амплифицируемого куска / rev последнего — хвоста нет → `boundaryAtOffset` отсутствует, `crossesBoundaries:[]`.

`deriveAutoPrimers` уже walk'ает `logicalPrev`/`logicalNext` — наличие хвоста известно в той же точке, где строится праймер. Сниппеты/gap между кусками не дают непрерывного стыка — существующий walk это уже учитывает (gap «walls the tail walk»), для таких праймеров `boundaryAtOffset` не ставится.

**Это главный риск узла** (§13 R1): маппинг кусок op-группы → индекс сегмента ассемблии. Code сверяет, что порядок `inputPieces`/`segmentBoundaries` согласован, и резолвит индекс через `segmentId`, а не через позицию в `inputPieces`.

---

## §7 Вайп персистентного `assemblyDraftPrimers`

Старые записи несовместимы с каноном (нет `source` у auto, поле `binding`, `origin`-объект). Решение Игоря — вайп, не миграция.

`skeleton-persistence.js` — на hydrate / `REPLACE_STATE` снапшота: если снапшот до-каноничный, `assemblyDraftPrimers` сбрасывается в `{}`. Механизм — на усмотрение Code: либо bump версии схемы скелет-снапшота (`canvas-state-v1` → `v2`) с дропом primer-мапы у досхемных снапшотов, либо detect-гейт (запись без `source` / с полем `binding` / с `origin`-объектом → мапа не несёт канон → сброс). Bump версии — предпочтительно (явно, без эвристик на форму).

Последствие (ожидаемо, не регресс): после вайпа ручные праймеры из старых снапшотов теряются; auto-праймеры регенерятся K15-финализатором при пересчёте op-групп. `.bodge`-файлы со старой формой при импорте — primer-мапа также сбрасывается тем же гейтом.

---

## §8 Тесты

- **Record-форма.** `deriveAutoPrimers` для overlap_pcr-группы из 2 кусков: каждый праймер несёт `direction`, `bindingSequence`, `tail`, `gc`, `source.kind==='auto-group'`, `pairId`; `origin`/`binding` отсутствуют. fwd 2-го куска и rev 1-го несут `source.boundaryAtOffset` равный `boundaries[0].endOnAssembly`.
- **`buildAssemblyPrimer`** — junction-праймер несёт непустой `tail`; single-segment — `tail===''`.
- **`selectBoundaryCoverage`** — зона с авто-праймерами через «Auto-собрать»: внутренний стык показывает `fwd:true, rev:true` (был `false/false`). Регрессия: manual-boundary-праймеры по-прежнему считаются.
- **`getBoundaryPrimerInfo`** — видит auto-праймер, `tailLength` = `tail.length` (≈ `OVERLAP_LEN`).
- **`REMOVE_OP_GROUP`/`DISBAND_OP_GROUP`** — удаляют auto-праймеры по `source.opGroupId`, сохраняют `autoMode:'manual'`.
- **PrimerRow** — auto-праймер рендерится: `srcLabel` даёт «авто…», бейджи `direction/tm/autoMode` корректны.
- **Вайп** — досхемный снапшот → `assemblyDraftPrimers === {}` после hydrate.
- **Регрессия:** полный Vitest зелёный; существующие primer-тесты обновить под канон (поле `binding`→`bindingSequence`, нет `origin`).

---

## §9 Порядок выполнения

1. Канонический record — `assembly-primer-utils.js` (`buildAssemblyPrimer` +`tail`) + `skeleton-state-assembly.js` (`WRITE_ASSEMBLY_PRIMER` +`tail`/`autoMode`, −`origin`).
2. `primer-derive.js` — `makePrimer` переписать под канон; `deriveAutoPrimers` — простановка `boundaryAtOffset` (§6).
3. Потребители: `selectors-assembly.js`, `assembly-realise-suggest.js`, `skeleton-state-operations.js`, `AssemblyPrimersPanel.jsx` (§5.4–5.7).
4. Вайп — `skeleton-persistence.js` (§7).
5. Тесты (§8) + обновление существующих под канон. Полный Vitest + `vite build`.

---

## §10 STOP-условие и формат отчёта

После зелёного полного Vitest + `vite build` clean — **STOP**, отчёт в `CURRENT_TASK.md`: commit range; Vitest counters (pass/skip/fail); `vite build`; spec deviations; size budget по всем 8 файлам; механизм вайпа (bump версии vs detect-гейт — какой выбран). Координационные файлы не финализировать. Визуальная приёмка (вкладка «Границы» считает auto-праймеры; счётчик покрытия ненулевой после «Auto-собрать») — отдельная сессия.

---

## §11 Запрещённые зоны для Code

- `tm-calculator.js` — эталон, не трогать.
- `local-primer-design.js` / `lib/bio/*primer-design*` — op-level primer-world, вне узла A.
- `suggestMethodForBoundary` (ветка `opGroup.kind`) — это V109, не дублировать.
- Координационные файлы (`CLAUDE/BUGS/CURRENT_TASK/PROJECT_STATE/DECISIONS/TECH_DEBT/COMPONENT_MAP/CHAT_PLAYBOOK`), спеки в `docs/`.

---

## §12 Зависимости и порядок относительно других батчей

- **После V105** (`SPEC_V105_TM_SANTALUCIA.md`): узел A переписывает `makePrimer` целиком — `tm` берётся через `calcTm`, что V105 уже внедряет. Узел A ассумирует пост-V105 `primer-derive.js`.
- **После V109** (`SPEC_V109_REALISE_OPGROUP_KIND.md`): обе спеки трогают `assembly-realise-suggest.js`. V109 добавляет ветку `opGroup.kind` в `suggestMethodForBoundary`; узел A правит `getBoundaryPrimerInfo` (фильтр + `tailLength`). Разные функции/строки — не конфликтуют, но узел A ассумирует пост-V109 файл.
- V105 и V109 — быстрые тип-C, диспатчатся первыми. Узел A — следом.
- Комплементарность: V109 чинит *первичный* путь realise-диалога (читать интент `opGroup.kind`); узел A чинит *фолбэк-эвристику* (`getBoundaryPrimerInfo` начинает видеть auto-праймеры). Оба нужны.

---

## §13 Риски

- **R1 — маппинг кусок op-группы → индекс сегмента ассемблии (§6).** Главный риск. Митигация: резолв через `segmentId`, а не позицию в `inputPieces`; при несходстве shape — `boundaryAtOffset` не ставится (фолбэк), узел не ломается, лишь не улучшает покрытие для этой границы. Code сверяет `draftFromZone`/`segmentBoundaries` output.
- **R2 — multi-layer op-группы (layer-1 Gibson поверх layer-0 бакетов).** `autoGroupPipeline` для >6 sources даёт layer-1 группу с `intermediateFromGroups`. `deriveAutoPrimers` для layer-1 куски-intermediate ещё не материализованы. Митигация: для layer-1/intermediate `boundaryAtOffset` не ставится (хвост есть, но ассемблейный стык не определён до финализации) — фолбэк как R1. Основной кейс (linear/≤6 → одна layer-0 группа) покрыт полностью.
- **R3 — вайп уносит ручные праймеры старых снапшотов.** Согласовано Игорем («пофиг, убиваем»). Скелет DEV-only — радиус мал.
- **R4 — `assemblyDraftPrimers` персистится; смена формы — schema-impact.** Митигация: §7 вайп-гейт; полный Vitest ловит REPLACE_STATE-регрессии.
- **R5 — тесты, ассертящие поле `binding`/`origin` авто-праймера, сломаются.** Ожидаемо — переписать под канон, зафиксировать в отчёте.

---

## §14 Открытые вопросы

1. `srcLabel` для `auto-group` — формулировка подписи («авто · кусок N» vs «авто-группа: X→Y»). Дизайн-система панели, на усмотрение Code; при сомнении — скриншот Игорю. По умолчанию: с `boundaryAtOffset` → «авто: {left}→{right}», без — «авто · кусок».
2. Префикс `id` авто-праймера (`pr-` → `asmprm-`) — унифицирую для единообразия; если есть код, матчащий `pr-` префикс (маловероятно — id'ы непрозрачны), Code фиксит. Дефолт — унифицировать.

---

## §15 DECISIONS-записи (Chat вносит в `DECISIONS.md` при постановке/приёмке)

- **DEC-PRIMER-RECORD-UNIFY-01** — единый канонический record assembly-праймера (§4); оба продюсера (`buildAssemblyPrimer`, `deriveAutoPrimers`) эмитят его. Провенанс — поле `source`; поле `origin` удалено.
- **DEC-PRIMER-RECORD-UNIFY-02** — покрытие границ ключуется на `source.boundaryAtOffset`, не на `source.kind`; `source.kind:'auto-group'` остаётся честным отдельным значением.
- **DEC-PRIMER-RECORD-WIPE-01** — старые персистентные `assemblyDraftPrimers` вайпаются на hydrate (схема-bump скелет-снапшота); миграция не делается (скелет DEV-only).

---

## §16 Что узел A закрывает

- **V107** (счётчик покрытия границ 0/N) — `selectBoundaryCoverage` начинает видеть auto-праймеры. Переезжает из Bin 2 в этот узел.
- **WT-UX-16** (вкладка «Границы» неинформативна) — частично: вкладка получает корректное покрытие; полное обогащение содержания вкладки (показ overlap) — UX-надстройка, может потребовать отдельного мелкого UX-таска поверх узла A.
- **WT-UX-17** (overlap-Tm не считается) — узел A даёт инфраструктуру: `tail` теперь хранится у каждого праймера. Сам показ overlap-Tm (`calcTm(tail)` в UI вкладки «Границы») — короткий UX-таск поверх узла A, не входит в этот scope, но узел A его разблокирует.
- Снимает корень будущих рассинхронов того же класса (раскол формы записи праймера).

Узел A **не** закрывает: V110 (раскладка DAG после realise — отдельный архитектурный разбор), WT-UX-13/11/12 (модель канваса), WT-D-1 (онбординг). Они остаются в Bin 2 / своих треках.

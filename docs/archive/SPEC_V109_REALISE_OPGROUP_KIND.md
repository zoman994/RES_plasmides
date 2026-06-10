# SPEC — V109: Realise-диалог читает тип op-группы

**Тип:** C (bugfix, алгоритмическая зона §3 — реализует Code).
**Версия:** v0.8.3-alpha. **Дата:** 23.05.2026.
**Закрывает:** `BUGS.md` V109 (walkthrough overlap-PCR WT-B-7, высокий).
**Источник:** `docs/WALKTHROUGH_OVERLAP_PCR_2026_05_23.md` §A WT-B-7 + §F.

---

## §0 Размеры затрагиваемых модулей

| Файл | Размер | Лимит | Примечание |
|---|---|---|---|
| `components/CanvasSkeleton/lib/assembly-realise-suggest.js` | ~3.3 KB | .js 25/20 | запас большой |

Декомпозиция не нужна.

---

## §1 Контекст / корень (подтверждено чтением кода)

При «Realise as DAG» диалог (`RealiseModal`) для каждой границы предлагает метод-дефолт через `suggestMethodForBoundary` (`assembly-realise-suggest.js`). Дерево решений:
1. есть праймер границы → по длине tail: <10 overlap_pcr(medium) / 10–25 overlap_pcr(high) / >25 gibson(high);
2. иначе общие RE-сайты во флангах → restriction(medium);
3. иначе оба сегмента manual → direct_ligation(medium);
4. иначе → **gibson(low, default)**.

Детектор праймеров `getBoundaryPrimerInfo` ищет ТОЛЬКО legacy-форму: `state.assemblyDraftPrimers[draftId]` с `p.source.kind==='boundary'` и `p.source.boundaryAtOffset===off`. Праймеры от «Auto-собрать» (`deriveAutoPrimers`, `primer-derive.js`) имеют другую форму — `origin.kind==='auto-from-group'`, поля `source` нет, поле binding'а называется `binding` (не `bindingSequence`). → `getBoundaryPrimerInfo` их не видит → `hasPrimer:false` → дерево падает в шаг 4 — `gibson(low)`.

`suggestMethodForBoundary` **не читает `opGroup.kind` вообще**, хотя op-группа уже типизирована: «Auto-собрать» строит группу через `autoGroupPipeline`, та возвращает `kind:'overlap_pcr'` (для linear/≤6 sources) — корректный тип. Итог: op-группа = «Overlap PCR», а диалог по умолчанию предлагает Gibson — два места одного экрана противоречат; «Реализовать» без ручного переключения радио → реализация как Gibson.

**Подтверждено §F:** `realiseAssembly` ручной выбор радио честно применяет (`perBoundaryMethods[i]`→`junctionForMethod`) — баг локализован в *дефолте* радио, т.е. в `suggestMethodForBoundary`. Биологической катастрофы нет (Gibson и overlap-PCR оба на 25-нт хвостах) — теряется протокол/интент дизайна.

Корень — раскол двух систем сборки: op-группы + `primer-derive.js` (новое) vs assemblyDrafts + `assembly-primer-utils.js` (старое); realise-suggest подключён к старой.

---

## §2 Стратегия

`suggestMethodForBoundary` ДО эвристики смотрит op-группу зоны: если граница лежит внутри op-группы — `method = opGroup.kind` (это и есть выбранный дизайн, не предмет угадывания). Эвристика остаётся фолбэком для границ без op-группы (legacy assemblyDraft-путь, частично-сгруппированные зоны). `getBoundaryPrimerInfo` не правим — он остаётся входом фолбэк-эвристики.

Принцип: тип op-группы — **факт дизайна**, эвристика по tail-length — догадка. Когда факт есть, догадка не нужна.

---

## §3 Где задача сядет (связи)

- **`assembly-realise-suggest.js`** — `suggestMethodForBoundary` (правка: новая ветка в начале), новый внутренний helper поиска op-группы границы. `getBoundaryPrimerInfo` / `detectCompatibleREsites` / `resolveDraft` — без правок.
- **`RealiseModal.jsx`** — НЕ трогать; он лишь потребляет `{method,confidence,rationale}`.
- **`autoGroupPipeline`** (`auto-group-pipeline.js`) — НЕ трогать; читаем результат его работы (op-группы), не его самого.
- Op-группы зоны — Code локализует слайс: создаются при «Auto-собрать» из output `autoGroupPipeline`, op-группа-сущность несёт `id` / `kind` / `inputPieces` (список piece-id, как читает `deriveAutoPrimers(opGroup,state)`) / `zoneId`. Найти по `zoneId === draftId`.

## Scope IN
- `suggestMethodForBoundary` — ветка «op-группа границы найдена → её kind».
- helper: для `(state, draftId, boundaryIdx)` вернуть op-группу, охватывающую оба сегмента границы (или `null`).
- Тесты.

## Scope OUT
- `getBoundaryPrimerInfo` — не править (вариант B «расширить детектор на форму `auto-from-group`» отклонён: он сохраняет переугадывание метода по tail-length, тогда как `opGroup.kind` уже несёт ответ явно; см. §4.3).
- `realiseAssembly` / `zone-pieces-to-dag.js` — не трогать (§F: ручной выбор применяется честно).
- `golden_gate` — по-прежнему никогда не авто-предлагается (нужен явный фермент).

---

## §4 Архитектурные решения

1. **`opGroup.kind` — первоисточник метода границы.** В начале `suggestMethodForBoundary`, до текущего дерева: найти op-группу, охватывающую границу `boundaryIdx`. Найдена → вернуть `{ method: opGroup.kind, confidence: 'high', rationale: 'из группы операций' }`. Не найдена → текущая эвристика без изменений.

2. **«Граница охвачена op-группой» = оба фланкирующих сегмента/piece в одной группе.** Минимальное безопасное правило: helper берёт два piece, фланкирующих границу, и ищет op-группу зоны, чьи `inputPieces` содержат ОБА. Найдена ровно одна такая → её `kind`. Если оба piece в разных группах (стык между layer-0 бакетами) либо op-групп у зоны нет — `null` → фолбэк-эвристика. Это покрывает основной кейс (linear/≤6 sources → одна `overlap_pcr`-группа на все pieces, все границы внутри неё) и безопасно для multi-layer.

3. **Вариант B отклонён.** Расширять `getBoundaryPrimerInfo` на форму `auto-from-group` — патч: он продолжит выводить метод из длины tail (`OVERLAP_LEN=25` → ветка `<=25` → overlap_pcr), что для overlap_pcr-группы случайно совпадёт, но это переугадывание уже известного факта. Чтение `opGroup.kind` напрямую — корректнее и устойчивее.

---

## §5 Файлы и правки

**`assembly-realise-suggest.js`:**
- Новый внутренний helper `boundaryOpGroup(state, draftId, boundaryIdx)`:
  - получить draft через существующий `resolveDraft`; взять `segments[boundaryIdx]` и `segments[boundaryIdx+1]`, из них piece-id (для zone-draft сегмент несёт ссылку на piece — Code сверяет shape).
  - собрать op-группы зоны (`zoneId === draftId`).
  - вернуть единственную группу, чьи `inputPieces` содержат оба piece-id; иначе `null`.
- `suggestMethodForBoundary` — в начале (после `resolveDraft`/`if(!d)`): `const og = boundaryOpGroup(...)`; если `og` — `return { method: og.kind, confidence: 'high', rationale: 'из группы операций' }`. Иначе текущий код без изменений.

---

## §6 Тесты

- Зона с op-группой `kind:'overlap_pcr'`, 2 piece, 1 граница → `suggestMethodForBoundary` → `method:'overlap_pcr'` (НЕ `gibson`), `confidence:'high'`.
- Зона с op-группой `kind:'restriction'` → граница → `method:'restriction'`.
- Зона БЕЗ op-групп (legacy assemblyDraft) → фолбэк-эвристика отрабатывает как раньше (регрессия: существующие тесты `assembly-realise-suggest` зелёные).
- Граница между двумя разными op-группами (multi-layer) → `boundaryOpGroup` → `null` → фолбэк-эвристика.

---

## §7 Порядок выполнения

1. helper `boundaryOpGroup` + локализация слайса op-групп.
2. ветка в `suggestMethodForBoundary`.
3. Тесты. Полный Vitest + `vite build`.

---

## §8 STOP-условие и формат отчёта

После зелёного полного Vitest + `vite build` clean — **STOP**, отчёт в `CURRENT_TASK.md`: где найден слайс op-групп; Vitest counters; `vite build`; size budget `assembly-realise-suggest.js`; spec deviations. Координационные файлы не финализировать. Визуальная приёмка (op-группа = «Overlap PCR» → диалог по умолчанию Overlap PCR) — отдельная сессия.

---

## §9 Риски

- **R1 — слайс op-групп локализован неверно / op-группа не несёт `inputPieces`.** Митигация: `deriveAutoPrimers(opGroup,state)` уже читает `opGroup.inputPieces` — форма подтверждена этим callsite'ом; Code сверяет.
- **R2 — multi-layer зона: граница между бакетами.** Митигация: §4.2 — оба piece не в одной группе → `null` → фолбэк. Не ломается, лишь не улучшается (приемлемо — основной кейс single-group).
- **R3 — сегмент zone-draft'а не несёт прямой ссылки на piece-id.** Митигация: Code сверяет shape сегмента (`draftFromZone` output); если связь через `source` — helper резолвит через неё.

---

## §10 Открытые вопросы

1. Слайс op-групп — точное имя поля state (`state.opGroups` / `state.operations` с group-семантикой?) Code определяет при реализации; спека описывает контракт (`id`/`kind`/`inputPieces`/`zoneId`), не имя слайса.
2. Текст `rationale` для UI — «из группы операций» как дефолт; если Игорь хочет точнее («тип сборки: Overlap PCR») — тривиальная правка строки.

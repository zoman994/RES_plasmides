# DESIGN-DOC — Editable assembled view (правка сборки по курсору)

**Статус:** design-doc, пред-спека. НЕ спека. §5 (чтение pieces- и primer-слоёв) выполнено 22.05.2026. §4 развилки: Fork A/B — решены Игорем 22.05; Fork C — снята (движок авто-дизайна уже есть). Спека спринта 1 пишется после подтверждения примеров Fork A.
**Источник:** Игорь, 22.05.2026 (устно) + уточнения: «там ещё должно быть удаление», «нуклеотиды становятся новым блоком: ≤80 — хвост праймера, >80 — синтез-кусок, порог настраиваемый», «разгруппировывать».
**Тип будущей реализации:** A (архитектурный wave, ядро редактора сборки). Дробится на ~3 спринта — см. §8.

---

## 1. Продуктовая модель (слова Игоря)

Куски накидываются на canvas → к ним **автоматически пишутся праймеры**. Но частая рутина: к куску надо добавить буквально 3 нуклеотида. Самое быстрое для биолога — **дописать их руками прямо в последовательности**.

Поведение, которое должно быть:
- Поставил курсор в assembled-виде, напечатал `A T G C` → эти нуклеотиды появляются в нужном месте сборки.
- **Праймеры пересчитываются** — с учётом дописанных нуклеотидов.
- Выделил участок, нажал Delete → сборка делится на две части; **части сохраняют родителей**.
- Замена = выделение + ввод (Delete + печать).

**Ценность.** Не «текстовый редактор ради редактора» — устранение ручной возни с праймерами: биолог правит последовательность, инструмент сам досчитывает праймеры.

## 2. Что показывает код (находки 22.05.2026)

**Редактор сборки** (`AssemblyShellBody.jsx`): assembled-вид = `SequenceTab` `editable={false}`, `reBehavior:'off'`. Read-only визуализация склейки цветных pieces. Каретка — только для написания праймеров. `editable` — реальный prop `SequenceView` (его использует `ContainerEditorSkeleton`); в assembled-виде выключен. Что именно включает `editable={true}` — единственный недочитанный пункт §5, добирается первым шагом spec-сессии.

**Природа piece (определяет модель):**
- **`sourced` piece НЕ хранит свою последовательность** — указатель `sourceIds[]`+`ranges[]`, последовательность выводится срезом, rc-aware. Дописать «внутрь» него физически некуда.
- **`gap`/`snippet`/`synthesis` хранят свою `sequence`** (`gap` — `gapSequence`). Правка тривиальна.
- **`kind:'snippet'`+`embedsInPrimer:true`+`sequence` уже есть** — «обвес встраивается в 5′-хвост соседнего праймера».
- **`mutations[]`+`ADD_PIECE_MUTATION` уже есть** — точечная замена в sourced piece моделируется без правки `ranges`.
- **`SPLIT_PIECE`/`TRIM_PIECE` НЕТ.** Набор экшенов `piecesReducer` закрыт. `UPDATE_PIECE` меняет `ranges` (trim одного края). Split = новый piece + `UPDATE_PIECE` — нужен новый compound-экшен. `assembly-model.splitSegment` несёт rc-aware математику пересчёта range — готовый референс.

**Авто-дизайн праймеров — СУЩЕСТВУЕТ (исправление: ранее ошибочно «нет»).** Три пути, движок — v0.5 `designPrimersLocal` (SantaLucia NN):
- **`deriveAutoPrimers(opGroup, state)`** (`primer-derive.js`, K11) — авто-дизайн по op-группе. Для каждого амплифицируемого piece — fwd+rev. **`snippet` pieces СКИПАЮТСЯ — их `sequence` сворачивается в fwd-хвост соседнего piece** (`buildFwdTail` собирает `leftSnippets`). `gap` стенит обход. **Мутации piece применяются перед извлечением binding → праймер мутагенный.** overlap_pcr/gibson → 25-bp overlap-хвосты; golden_gate/restriction → ферментные хвосты.
- **`suggestPrimers`/`recomputeFromSelection`** (`operation-pcr-bridge.js`, F3) — PCR-режим, обёртка `designPrimersLocal`.
- **`autoPrimerPair`/`mapPrimersForSegment`** (`zone-pieces-to-dag.js`) — грубый realise-time fallback (20-bp срез).
- Праймеры несут `autoMode:'auto'`/`origin.kind:'auto-from-group'`; ручные — иной origin.

Editable assembled view = три пласта: editable-режим текста; новые piece-операции (вставка/split/trim с сохранением происхождения); перезапуск авто-дизайна после правки.

## 3. Гипотеза модели — подтверждена кодом

«Дописанные нт вшиваются в хвост, отдельный блок на каждые 3 нт» — механизм `snippet`/`embedsInPrimer` + `deriveAutoPrimers` `leftSnippets`-обход существует именно для этого.

## 4. Развилки — статус

### Закрыто кодом
- **Q3 математика split** — `SPLIT_PIECE` переиспользует rc-aware пересчёт range из `assembly-model.splitSegment`. forward: `[start,start+at]`+`[start+at,end]`; reverse: зеркало. `sourceIds`/`origin` копируются обеим половинам.
- **Q5 граница «ввод vs модалка»** — печать оснований = in-view; выбор источника из библиотеки / вставка блока = модалка `custom-segment`.
- **Q6 read-only зоны** — `frozen` piece — hard read-only; orphan — read-only до починки; `sourced`/`gap`/`snippet`/`synthesis` не-frozen — editable.
- **Q7 undo/redo** — серия печати коалесцируется в одну history-запись (debounce) через `skeleton-history.js`.

### Решено Игорем 22.05.2026
- **Fork A — куда попадают дописанные нуклеотиды.** Решение: **дописанные нт = новый блок (piece) на стрипе.** `kind` выбирается по длине относительно настраиваемого порога (дефолт 80 нт):
  - длина ≤ порога → `kind:'snippet'`, `embedsInPrimer:true` — `deriveAutoPrimers` уже сворачивает его в хвост соседнего праймера, отдельной реакции нет.
  - длина > порога → `kind:'synthesis'` — `deriveAutoPrimers` трактует как амплифицируемый piece (свой ампликон / заказывается синтезом).
  - Порог — настройка (синтез олигов варьируется: стандарт ~60–100 нт, ультрамеры ~200 → дефолт 80, диапазон конфигурируется).
  - Печать подряд в одной точке расширяет ОДИН и тот же snippet/synthesis блок (не блок на keystroke). Перевалив порог при росте — `kind` блока перещёлкивается snippet↔synthesis.
  - Печать в середину `sourced` piece → piece делится (`SPLIT_PIECE`), новый блок встаёт между половинами.
  - **Открытый под-пункт (нужно решение Игоря, не блокирует спринт 1):** замена *той же длины* в середине sourced piece — маршрутизировать в `mutations[]` (мутагенный праймер, без split и без блока — механизм уже есть и `deriveAutoPrimers` его чтит) ИЛИ единообразно «удаление + новый блок»? Рекомендация Chat: substitution → `mutations[]`; вставка/удаление со сдвигом длины → split + блок. Решается к спринту 2.
- **Fork B — правка piece в op-группе.** Решение Игоря: **разгруппировывать.** Правка `grouped` не-frozen piece → piece выходит из op-группы (`groupId` сбрасывается; группа ≤1 члена — расформировывается имеющейся логикой), тост-предупреждение. Биолог пере-группирует / повторяет automode. `frozen` (поглощён исполненной реакцией) — hard read-only (Q6).

### Снято — Fork C (пересчёт праймеров)
Движок авто-дизайна уже есть (см. §2): `deriveAutoPrimers` сворачивает snippet в хвост и делает мутагенные праймеры из `mutations[]`; `suggestPrimers` поверх `designPrimersLocal`. Спека editable-view **не добавляет движок праймеров.** Её задача по праймерам: (1) правки легли в piece как корректный `kind` (snippet/synthesis/mutation/split) — тогда `deriveAutoPrimers` подхватывает их сам; (2) `deriveAutoPrimers` перезапускается для затронутых op-групп после правки; (3) перезапуск заменяет только праймеры `autoMode:'auto'`, ручные (иной origin/`status:'edited'`) — не трогает, предупреждает. Это инварианты спеки, не продуктовая развилка.

## 5. Что прочитать перед спекой — статус
- ✅ `piece-model.js`, `skeleton-state-pieces.js`, `piece-invariants.js`, `zone-assembly-write-adapter.js` — pieces-слой.
- ✅ `op-piece-bridge.js`, `auto-group-pipeline.js` — связь pieces↔op-group.
- ✅ `assembly-primer-utils.js`, `useAssemblyPrimerWriting.js`, `primer-derive.js`, `auto-reaction-builder.js`, `operation-pcr-bridge.js` — primer-слой.
- ✅ `useSequenceSelection.js` — селекция, обработки ввода/paste нет.
- ⏳ `SequenceView` editable-путь — что включает `editable={true}` (печать оснований / Delete / paste). Первый шаг spec-сессии.

## 6. Граница с другими задачами
- **`SPEC_ASSEMBLY_CUSTOM_SEGMENT` (модалка, тип B)** — вставка заметного куска отдельным сегментом / из библиотеки. Editable-view дополняет (быстрая правка vs вставка блока). Модалка — первой.
- **`SPEC_ASSEMBLY_PICKER_UNIFICATION`** — единый library-пикер.
- Editable-view — следующий wave после модалки.

## 7. Следующий шаг
§5 выполнено (1 пункт добирается в spec-сессии). Fork A/B решены, Fork C снята. Остаётся подтверждение Игорем примеров Fork A → пишется спека спринта 1.

## 8. Дробление на спринты (тип A)
1. **Editable-input + new-block** — editable assembled-вид; печать → новый snippet/synthesis-блок (Fork A, порог-настройка); правка `sequence` у gap/snippet/synthesis; правка сгруппированного piece → разгруппировка (Fork B). Без split.
2. **SPLIT_PIECE + delete** — `SPLIT_PIECE` compound-экшен; печать в середину sourced piece; Delete выделения → trim/split; сохранение родителей (Q3); решение под-пункта substitution→`mutations[]`.
3. **Перезапуск авто-дизайна** — `deriveAutoPrimers` re-run для затронутых op-групп; замена только `autoMode:'auto'` праймеров. Тонкий — может слиться в хвост спринта 2.

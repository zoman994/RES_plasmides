# SPEC — Editable assembled view, спринт 3: поддержка координат праймеров после правки

**Тип:** B (тонкий спринт 3 из 3 архитектурного wave editable-assembly). **Статус:** готова к выдаче Code — после editable-спринтов 1–2 И консолидации калькулятора (`SPEC_PRIMER_CALCULATOR_UNIFICATION.md`).
**Wave:** `docs/DESIGN_EDITABLE_ASSEMBLY_VIEW.md`. Завершает wave.
**Уточнение к wave-доку §8.** Исходная формулировка спринта 3 — «перезапуск авто-дизайна». После чтения кода (`AssemblyPrimersPanel`, `selectors-pcr`) она частично снята: авто-праймеры op-группы пересчитываются при (пере)формировании группы, а консолидация калькулятора делает `deriveAutoPrimers` алиасом единого `computeAssemblyPrimers` — то есть пересчёт группы уже идёт через единый калькулятор без работы этого спринта. Реальный остаток спринта 3 — **поддержка координат уже сохранённых праймеров**, когда правка в editable-виде сдвигает собранную последовательность.
Диагноз — чтением `AssemblyPrimersPanel.jsx`, `AssemblyPipelinePanel.jsx`, `useAssemblyPrimerWriting.js`, `selectors-pcr.js`, `assembly-primer-utils.js`.

---

## 0. Размеры затрагиваемых модулей

- `store/skeleton-state-assembly.js` — 15.08 KB (под hard 25). Сюда — `SHIFT_ASSEMBLY_PRIMERS`. Code читает его для shape `assemblyDraftPrimers` (`source.selectionStart/End`, `crossesBoundaries`, `autoMode`, `status`).
- `editor/assembly-mode/AssemblyShellBody.jsx` — 22.97 KB (под hard 40). Хендлер `onSequenceEdit` диспатчит maintenance.
- `editor/assembly-mode/AssemblyPrimersPanel.jsx` — 12.46 KB (под hard 40). Отображение `status:'stale'`.
- `lib/assembly-edit-router.js` — новый в спринте 1, расширен в 2. Спринт 3 добавляет в результат роутера дельту правки (см. §5.2).

## 1. Контекст

Праймеры сборки хранятся в `state.assemblyDraftPrimers[draftId]` (массив). Пишутся вручную (`useAssemblyPrimerWriting` — выделение + Ctrl+R) и авто (op-группа → калькулятор). Каждый праймер несёт `autoMode` (`'auto'` — пересчитывается; `'manual'` — заблокирован, ручная правка ПСО авто-локает), `status` (`'edited'` — изменён вручную), `source` (`kind:'segment'|'boundary'`, `selectionStart`/`selectionEnd` — координаты на собранной последовательности, `segmentId`/`leftSegmentId`/`rightSegmentId`), `crossesBoundaries`.

Editable-спринты 1–2 дали биологу править собранную последовательность. Любая вставка/удаление **сдвигает координаты** всего, что правее точки правки. Сохранённый праймер с `source.selectionStart=100` после вставки 5 нт на позиции 50 фактически связывается на `[105,…]`, но хранит `100` — координаты протухли. Если правка попала ВНУТРЬ binding-региона праймера — праймер биологически неверен.

Авто-праймеры op-группы этим спринтом не пересчитываются вручную: правка сгруппированного piece расформировывает группу (Fork B, спринт 1), авто-праймеры расформированной группы осиротевают; при пере-сборке группы калькулятор отрабатывает заново сам. Остаётся починка координат **сохранённых** праймеров (ручных и осиротевших авто).

## 2. Где задача сядет (связи)

Точка — `state.assemblyDraftPrimers` (reducer `skeleton-state-assembly.js`). Новый action `SHIFT_ASSEMBLY_PRIMERS` чинит координаты. Триггер — хендлер `onSequenceEdit` в `AssemblyShellBody`: после применения piece-правки он знает дельту (тип + позиция + длина) и диспатчит maintenance. `assembly-edit-router` уже резолвит правку — спринт 3 добавляет в его результат поле дельты собранной последовательности. Отображение протухших праймеров — `AssemblyPrimersPanel` (`status:'stale'` бейдж + кнопка пересчёта).

Затрагивает: `skeleton-state-assembly.js`, `AssemblyShellBody.jsx`, `AssemblyPrimersPanel.jsx`. Ссылается на: авто-праймеры расформированной группы — `DISBAND_OP_GROUP` (спринт 1) должен их убрать (см. §5.5). Может сломаться: тесты, ожидающие неизменность `assemblyDraftPrimers` при правке сегментов.

## 3. Стратегия

Editable-правка эмитит дельту собранной последовательности `{atPos, delta}` (`delta>0` — вставка, `<0` — удаление). Хендлер `onSequenceEdit` после piece-операций диспатчит `SHIFT_ASSEMBLY_PRIMERS`:

- Праймер, чьи координаты целиком ПРАВЕЕ `atPos` → `selectionStart`/`selectionEnd` (и `crossesBoundaries`-офсеты, `source.boundaryAtOffset`) сдвигаются на `delta`. Последовательность праймера не трогается — регион тот же, сдвинулся только адрес.
- Праймер целиком ЛЕВЕЕ `atPos` → без изменений.
- Правка ПОПАЛА ВНУТРЬ binding-региона праймера (`atPos` в `[selectionStart, selectionEnd)`) → праймер помечается `status:'stale'`; координаты/последовательность не трогаются (молчаливый сдвиг сделал бы праймер биологически неверным). Биолог видит ⚠ и пересчитывает.
- Авто-праймеры (`autoMode:'auto'`) расформированной op-группы — удаляются (`DISBAND_OP_GROUP`, спринт 1).

Ручные/заблокированные праймеры (`autoMode:'manual'`/`status:'edited'`) тоже чинятся по координатам — но их последовательность сохраняется всегда (биолог её настроил); при попадании правки внутрь — `stale`, не перезапись.

## 4. Scope

**IN:**
- `SHIFT_ASSEMBLY_PRIMERS {draftId, atPos, delta}` — сдвиг координат сохранённых праймеров; пометка `stale` при попадании внутрь региона.
- `assembly-edit-router` результат несёт дельту собранной последовательности.
- `AssemblyShellBody.onSequenceEdit` диспатчит maintenance после piece-операций.
- `AssemblyPrimersPanel` — бейдж `status:'stale'` (⚠) + кнопка «пересчитать» для протухшего праймера.
- `DISBAND_OP_GROUP` (спринт 1) убирает осиротевшие авто-праймеры группы.

**OUT:**
- Пересчёт авто-праймеров op-группы — идёт через единый калькулятор при (пере)формировании группы (консолидация); спринт 3 не дублирует.
- Авто-пере-дизайн протухшего ручного праймера — биолог жмёт «пересчитать» сам; авто-перезапись ручного праймера запрещена (затёрла бы настройку).
- PCR-режим (`selectPcrPrimers`) — реактивный селектор, координат не хранит, не задет.

## 5. Архитектурные решения

1. **`SHIFT_ASSEMBLY_PRIMERS {draftId, atPos, delta}`** — action `skeleton-state-assembly.js`. Для каждого праймера в `assemblyDraftPrimers[draftId]`: (а) `source.selectionEnd ≤ atPos` → без изменений; (б) `source.selectionStart ≥ atPos` → `selectionStart += delta`, `selectionEnd += delta`, `source.boundaryAtOffset += delta` если есть; (в) `atPos` строго внутри `[selectionStart, selectionEnd)` → `status:'stale'`, координаты/`sequence` не трогаются. Чистый, идемпотентность не требуется (вызывается ровно раз на правку).
2. **Дельта из роутера.** `routeAssemblyEdit` (спринт 1/2) дополнительно возвращает `seqDelta:{atPos, delta}` — позиция на собранной последовательности и знаковая дельта длины. `insert` 1 символ → `{atPos:pos, delta:+1}`; `delete` length → `{atPos, delta:-length}`; `replace` → `{atPos:start, delta: replacement.length-(end-start)}`; substitution (равная длина) → `delta:0` (координаты не двигаются, праймер на этой позиции — кандидат в `stale`, см. §5.3).
3. **Substitution и stale.** Замена равной длины (`delta:0`) координаты не сдвигает, но если меняет основание ВНУТРИ binding-региона праймера — праймер биологически меняется (мутагенным становится). Для авто-праймера это правильно (пересчёт группы учтёт мутацию). Для ручного/заблокированного — `status:'stale'` (его сохранённая ПСО больше не соответствует шаблону). `SHIFT_ASSEMBLY_PRIMERS` при `delta:0` всё равно вызывается — только для пометки `stale` ручных праймеров, чей регион накрыл `atPos`.
4. **Хендлер.** `AssemblyShellBody.onSequenceEdit`: после диспатча piece-операций (спринт 1/2) — `actions.dispatch(SHIFT_ASSEMBLY_PRIMERS, {draftId, ...result.seqDelta})`. Один вызов на правку.
5. **Осиротевшие авто-праймеры.** `DISBAND_OP_GROUP` (спринт 1, §5.6): помимо очистки `groupId` и удаления op-группы — удалить из `assemblyDraftPrimers` авто-праймеры (`autoMode:'auto'` И `origin.opGroupId===G`). Этой спекой — дополнить `DISBAND_OP_GROUP`, если спринт 1 этого не сделал (зафиксировать как cross-spec правку: спринт 3 проверяет и при необходимости дополняет `DISBAND_OP_GROUP`).
6. **UI протухших.** `AssemblyPrimersPanel.PrimerRow` — при `status:'stale'` бейдж ⚠ «координаты устарели после правки» + кнопка «пересчитать» (для авто — `computeAssemblyPrimers` по его op-группе, если группа есть; для ручного — открыть тот же primer-from-selection путь на текущем регионе). Минимально: бейдж + tooltip; кнопка пересчёта — если инфраструктура тяжёлая, бейджа достаточно (биолог удалит и перепишет). Low-stakes объём — Code решает.

## 6. Файлы / сигнатуры

**`skeleton-state-assembly.js`** — `SHIFT_ASSEMBLY_PRIMERS` в action-set + reducer-ветка (§5.1). Code читает текущую shape `assemblyDraftPrimers` / `writeAssemblyPrimer` / `updateAssemblyPrimer`.

**`lib/assembly-edit-router.js`** — каждый результат `routeAssemblyEdit` дополняется `seqDelta:{atPos, delta}` (§5.2).

**`AssemblyShellBody.jsx`** — `onSequenceEdit`-хендлер после piece-операций диспатчит `SHIFT_ASSEMBLY_PRIMERS`.

**`AssemblyPrimersPanel.jsx`** — `PrimerRow` рендерит `status:'stale'` (⚠ + tooltip + опц. кнопка пересчёта).

**`DISBAND_OP_GROUP`** (спринт 1) — дополнить удалением осиротевших авто-праймеров (§5.5), если спринт 1 не покрыл.

**Тесты:** юниты `SHIFT_ASSEMBLY_PRIMERS` (праймер правее → сдвиг; левее → без изменений; правка внутри региона → `stale`; boundary-праймер `boundaryAtOffset` сдвиг); юнит `seqDelta` из роутера на insert/delete/replace/substitution; интеграция (печать в начало сборки → праймер правее сдвинулся, последовательность та же; правка внутри ручного праймера → `stale` + ⚠; расформирование группы → её авто-праймеры убраны); регрессия (`assemblyDraftPrimers` не задет, когда editable-вид выключен; ручная запись Ctrl+R не сломана).

## 7. Порядок выполнения

1. `SHIFT_ASSEMBLY_PRIMERS` в `skeleton-state-assembly.js` + юнит-тесты.
2. `assembly-edit-router` — `seqDelta` в результат + юнит-тест.
3. `AssemblyShellBody.onSequenceEdit` — диспатч maintenance.
4. `DISBAND_OP_GROUP` — проверить/дополнить уборку осиротевших авто-праймеров.
5. `AssemblyPrimersPanel` — `stale`-бейдж.
6. Интеграция + регрессия.
7. Полный Vitest + `vite build`.

## 8. STOP-условие и формат отчёта

После реализации §3 IN-scope и зелёного полного Vitest + `vite build` clean — STOP. Отчёт в `CURRENT_TASK.md`: commit range; Vitest counters; `vite build`; spec deviations; size budget (`skeleton-state-assembly.js`). Визуальная приёмка — отдельная Chat-сессия. Координационные файлы не финализировать.

## 9. Риски

- **boundary-праймеры — несколько координатных полей.** `source.boundaryAtOffset` + `selectionStart/End` + `crossesBoundaries`. Пропустить одно = рассинхрон. Митигация: §5.1 перечисляет все поля; тест на boundary-праймер.
- **Дельта при spanning-правке (спринт 2).** Spanning-удаление = несколько piece-операций; `seqDelta` должен быть суммарной дельтой собранной последовательности, не пер-piece. Митигация: роутер считает `seqDelta` от исходного [start,end] выделения и итоговой длины замены, один раз.
- **Ложный `stale`.** Правка ровно на границе региона праймера (`atPos === selectionStart`) — это вставка ПЕРЕД праймером, не внутрь → сдвиг, не stale. Граница строгая: `stale` только при `selectionStart < atPos < selectionEnd`. Митигация: тест на краевые `atPos`.
- **Cross-spec с `DISBAND_OP_GROUP`.** Уборка авто-праймеров может оказаться в спринте 1 или здесь. Митигация: §5.5 — спринт 3 проверяет и дополняет; дубля не будет (идемпотентная фильтрация).

## 10. Открытые вопросы

1. Кнопка «пересчитать» у протухшего праймера — полноценная (вызов калькулятора / primer-from-selection) или только бейдж ⚠ в спринте 3. Low-stakes, дефолт — бейдж + tooltip, кнопка опционально.
2. Авто-классификация: стоит ли при `delta:0`-substitution внутри binding авто-праймера сразу пере-дизайнить (через калькулятор), а не ждать пере-сборки группы. Спека: не в спринте 3 (группа расформирована правкой, пересоберётся — калькулятор учтёт); пересмотреть, если UX покажет необходимость.

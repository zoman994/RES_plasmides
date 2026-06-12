# Sprint M-VERIFY.1 — verifyAssembly: вердикт выполнимости до заказа (overlap/gibson клин)

**Тип:** feature
**База:** v0.8.7-alpha (junction-UX срезы 1–4 приняты; коммит — за Игорем)
**Предпосылка:** концептуальная проработка («компилятор сборки ДНК») + deep code-recon показали: типчекер химии **уже написан** (`validate.js::validateJunctionEnds` возвращает структурированные `{junction, severity, message, suggestion}`), но импортируется **только тестами** и работает на legacy-форме `fragments[]/junctions[]`, а не на живом four-tier пути. Задача — подключить вердикт выполнимости к живому пути сборки **до** необратимого шага (заказ олигов), на проверенном срезе overlap/gibson, с клик-через от сломанного стыка к точному праймеру.

> Это Фаза 1 из 4-фазной дорожки (см. концепт-документ в чате 10.06). Фазы 2 (GG/RE), 3 (именованные версии), 4 (учёба со стола) — отдельными спеками, **не в этом скоупе**.

> **⏸ СТАТУС 10.06 (решение Игоря) — ХИМИЧЕСКИЙ ВЕРДИКТ ВЫПОЛНИМОСТИ ОТЛОЖЕН / ЗАГЛУШКА.** Игорь: «параметр оценки работчисти химии введём позже, заглушку оставь — пока не очевидно, что это будет хорошо работать». Следствие: **K2/K3 (overlap-предикаты GC/Tm/палиндром/повтор) сейчас НЕ строим** — `verifyAssembly` возвращает stub (всё `note:'не проверено'`, плюс максимум СТРУКТУРНЫЕ certain-проверки, которые realise и так гейтит). **Строим только рельсы** (панель на стык + клик-через стык→праймер→метод, K4/K5 — это моат, от химии не зависит). Уверенный ✅ по химии НЕ показываем → §10.5 honesty-оговорка снята (нечего оговаривать). Реальные предикаты + калибровка доверия — позже, на работающем прототипе с биологами (день-1 = Игорь догфудит; биологи — на прототипе, §10.1). **Этот спринт целиком — кандидат на отсрочку до после канваса/триптиха/протокол-вкладки** (приоритет — работающий прототип). Канвас (M-CANVAS-FIX.1) — текущий immediate-приоритет.

---

## 0. Срез размеров затрагиваемых модулей

| Файл | Размер | Лимит | Зона |
|------|--------|-------|------|
| `validate.js` | 19.32 KB | 25 KB (.js) | soft (warning 20) — **НЕ трогаем**, предикаты портируются в новый файл (§4.2) |
| `components/CanvasSkeleton/lib/zone-pieces-to-dag.js` | 13.04 KB | 25 KB | OK — не трогаем (только читаем `realiseAssembly`/`draftFromZone`) |
| `components/CanvasSkeleton/lib/junction-derive.js` | 8.43 KB | 25 KB | OK |
| `components/CanvasSkeleton/lib/assembly-model.js` | 8.34 KB | 25 KB | OK (читаем `computeAssemblySequence`/`segmentBoundaries`) |
| `components/CanvasSkeleton/lib/primer-derive.js` | ~15 KB | 25 KB | OK (читаем `buildOverlapTail`/`overlapTailLen`, **не меняем**) |
| `components/CanvasSkeleton/editor/assembly-mode/RealiseModal.jsx` | 5.51 KB | 40 KB (.jsx) | OK |
| `components/CanvasSkeleton/editor/assembly-mode/RealiseDagPreview.jsx` | 2.65 KB | 40 KB | OK |
| **новый** `components/CanvasSkeleton/lib/assembly-verify.js` | 0 → ~6–8 KB | 25 KB | green field |
| **новый** `components/CanvasSkeleton/editor/assembly-mode/VerifyPanel.jsx` | 0 → ~4–6 KB | 40 KB | green field |

Ни одного файла в red zone. `validate.js` в soft — **поэтому предикаты портируются в `assembly-verify.js`, а не дописываются в `validate.js`** (§4.2). Декомпозиция-первым-шагом не требуется.

---

## 0.1. Visual reference / Source of truth

No visual reference — design на усмотрение Code в рамках `docs/DESIGN_SYSTEM.md` tokens (`--surface-*`/`--text-*`/`--border-*`/`--accent-500`; статусные `--emerald`/`--amber`/`--accent` для ✅/⚠/⛔). Палитра вердикта переиспользует семантику строки готовности (срез 4, `assemblyReadiness`). Точная вёрстка панели — Code, по design-system; на визуальной приёмке Игорь корректирует.

---

## 0.2. Component reuse audit

| Use | NOT use (legacy) | Reason |
|-----|------------------|--------|
| `validateJunctionEnds`/`detectIdenticalFragmentIssues` **как референс-логику** (портировать предикаты) | вызывать `validate.js` целиком из живого пути | работает на legacy `fragments[]/junctions[]` + СИНТЕТИЧЕСКОМ окне overlap (`validate.js:215`), а не на реальном codegen-окне — прямой вызов даст **ложный вердикт** (§4.3) |
| `realiseAssembly`/`draftFromZone` (`zone-pieces-to-dag.js`) | legacy `assemblyDrafts` путь | four-tier — единственный живой путь сборки |
| `RealiseModal` + `RealiseDagPreview` (живой триггер realise) | `MethodPickerCard` как место вердикта | вердикт — отдельная панель, карточки метода остаются read-only (J9) |
| `buildOverlapTail`/`overlapTailLen` (`primer-derive.js`) — **читать вывод** | пере-вычислять окно overlap в верификаторе | §4.3 — проверять ту же строку, что закажут |

Новые: `assembly-verify.js`, `VerifyPanel.jsx`. Остальное — reuse.

---

## 0.5. Kickoff-интервью

Не проводилось — спека написана из концепт-проработки. **Ключевые решения вынесены в §10 как явные открытые вопросы**, по которым Code должен получить ответ Игоря ДО соответствующего K-шага (помечено в §6). Главные: severity повтора-в-конструкте (K3), нужна ли honesty-оговорка у зелёного вердикта (K4).

---

## 1. Контекст

Шесть методов сборки на стыках уже работают в codegen (`deriveAutoPrimers`), и стык кликабелен (junction-UX срезы 1–4). Чего нет: **никто не проверяет, что сборка физически соберётся, до того как биолог закажет олиги** (необратимый шаг — неделя + деньги). `realiseAssembly` сегодня гейтит только структурные ошибки (нет сегментов / осиротевший источник / gap без сиквенса, `zone-pieces-to-dag.js:215–228`) — **ни одной химической проверки**.

При этом проверки химии **написаны**: `validateJunctionEnds` (`validate.js:187`) возвращает `{junction, severity:'error'|'warning'|'info', message, suggestion}` для коллизии overlap у идентичных фрагментов, GC%/Tm overlap-зоны, палиндрома, повтора-в-конструкте, и т.д. Но `validate.js` импортируется **только** `validate.test.js`/`modules.test.js`/`biology.test.js` (grep: ноль импортов из CanvasSkeleton) и оперирует legacy-формой. Это мёртвый код относительно живого пути.

Стратегический клин (концепт): **вывести вердикт выполнимости в `RealiseModal` per-junction (✅/⚠/⛔), с клик-через сломанный-стык → точный праймер → метод → живая пере-проверка, гейтя кнопку Realise/заказа только на физически невозможной химии.** Моат — не математика GC/Tm, а клик-через по `pairKey`, который уже прошит сквозь `zone.junctions`, `internalBoundaries`, `primer.source.boundaryAtOffset`.

---

## 2. Стратегия

Делаем чистую `verifyAssembly(state, zoneId) → {ok, problems[]}` через **портирование overlap/gibson-предикатов** из `validate.js` в новый `lib/assembly-verify.js`, гоняя их на **реальном codegen-окне** (вывод `buildOverlapTail`/`overlapTailLen` + пост-codegen продукт `computeAssemblySequence`), потому что синтетическое окно `validate.js` асимметрично расходится с реальными праймерами и дало бы ложный вердикт (§4.3). Подключаем в `RealiseModal` как панель ✅/⚠/⛔ с клик-через и гейтом Realise — переиспользуя шов `RealiseDagPreview` (чистый realise в `useMemo` + рендер `result.error` инлайн) и общий ключ `pairKey`. Методы кроме overlap/gibson получают нейтральное «не проверено» (не зелёное и не блокирующее) — Фаза 2.

---

## 3. Scope

### IN
- новый `lib/assembly-verify.js` — `verifyAssembly(state, zoneId)` + portированные предикаты (identical / GC / Tm / palindrome / repeat) + problem-модель + severity→level карта.
- новый `editor/assembly-mode/VerifyPanel.jsx` — per-junction ✅/⚠/⛔ + клик-через.
- `editor/assembly-mode/RealiseModal.jsx` — смонтировать `VerifyPanel`, расширить гейт `confirm`/Realise на `level:'error'`.
- `editor/assembly-mode/RealiseDagPreview.jsx` — (опц.) показать сводный вердикт над DAG.
- новые тесты: `__tests__/assembly-verify.test.js`, `__tests__/verify-panel.test.jsx`, расширение `assembly-realise.test.jsx` (гейт).

### OUT (явно отложено)
- **GG/RE/KLD/direct_ligation вердикт** — Фаза 2 (блокировано отсутствием поля `seedJunction.overhang` + UI ввода overhang/фермента; вердикт сейчас = «не проверено»).
- **PlasmidVCS / именованные версии** — Фаза 3.
- **.ab1 / Sanger / рекомендатель** — Фаза 4.
- **Правка `validate.js`** — не трогаем (soft-зона; предикаты портируются).
- **Изменение `realiseAssembly`/`buildOverlapTail`** — только читаем; движок не переписываем.
- Вторичная структура / Dam-Dcm / суперскрутка — верификатор их не видит (§10.5).

Всё не в IN — не трогаем.

---

## 4. Архитектурные решения

1. **`verifyAssembly` — чистая функция рядом с `realiseAssembly`, не внутри.** Сигнатура зеркалит realise (`state, zoneId`), чтобы RealiseModal звал обе через один `useMemo`-шов. Чистота → тестируемость данных без UI (паттерн V130).
2. **Предикаты портируются в `assembly-verify.js`, `validate.js` не трогаем.** `validate.js` в soft-зоне (19.32/20) и работает на legacy-форме. Портируем **только** overlap-предикаты, адаптируя вход под four-tier. `validate.js` остаётся как референс + legacy-тесты. (Дубль логики осознан: legacy-путь умирает, форсить общий модуль сейчас = тащить legacy-форму в новый код.)
3. **⚓ Верность важнее покрытия: предикаты гоняются на РЕАЛЬНОМ codegen-окне.** `validate.js:215` строит симметричное плоское окно overlap; `primer-derive.js:154` делает асимметричный Tm-таргетный односторонний плеч. Верификатор берёт **фактический** overlap/binding из `buildOverlapTail`/`overlapTailLen` (тот же вызов, что у праймера) и пост-codegen продукт из `computeAssemblySequence`. Зелёная галочка удостоверяет ту строку, что закажут. **Никогда не звать синтетическое окно валидатора.**
4. **⚓ Асимметричное трение: блокирует только `level:'error'`.** `severity ∈ {error, warning, note}`; `level = (severity==='error') ? 'block' : 'pass'`. **Только `identical-fragments` overlap — `error`** (физически невозможно). GC/Tm/палиндром/повтор — `warning` (эвристика, не блок). `note` = «не проверено» (некрытый метод). Закреплено frozen-тестом. Один ложный блок в день 1 — биолог кликает мимо проверки навсегда.
5. **⚓ Нет зелёного, пока не доказана верность.** Зелёный ✅ ставится только если метод стыка ∈ {overlap_pcr, gibson} И проверенное окно == codegen-окно (доказано тестом). Иначе серое «не проверено». Заслуживается тестом, не выдаётся по умолчанию.
6. **`pairKey` — позвоночник.** `problem.scope.pairKey` идентифицирует стык; клик-через и подсветка праймера (`source.boundaryAtOffset` → boundary → pairKey) идут по нему. Никакой параллельной схемы адресации.
7. **Язык биолога.** UI: «Проверить сборку», «Стык N не соберётся», «почему», «починить». Слова compile/typecheck/verify — только в коде/доках.

---

## 5. Предположения

- **`draftFromZone(state, zone).segments` дают `.sequence` (slice+RC+мутации) для каждого куска.** Источник: code-recon (`zone-pieces-to-dag.js:108`), используется `suggestMethodForBoundary`/realise. Проверено: да (живой realise работает). Действие: K1 строит вход верификатора через `draftFromZone`, не вручную.
- **`buildOverlapTail`/`overlapTailLen` экспортируются и чисты.** Источник: `primer-derive.js`, экспортированы (используются в тестах праймеров). Проверено: да. Действие: K2 читает их вывод; если сигнатура не совпадёт — **первый под-шаг K2 = проверить экспорт/сигнатуру** перед предикатами.
- **`problem.scope.pairKey` ↔ порядок `allBoundaries(draft)` == порядок адаптера fragments[].** Источник: `internalBoundaries` (`junction-derive.js`). Проверено: **нет** (адаптер четыре-тир→предикат-вход новый). Действие: K1 — тест «pairKey проблемы садится на правильный стык» (off-by-one — самый вероятный баг).
- **`computeAssemblySequence(draft)` даёт полный продукт с хвостами.** Источник: `assembly-model.js`, используется AssemblyShellBody. Проверено: да. Действие: K3 гоняет repeat/palindrome на нём.
- **`validateJunctionEnds`-предикаты не зависят от legacy-полей, которых нет в four-tier (`frag.strand`, `j.overhang`).** Источник: recon — overlap-предикаты читают `frag.sequence`/`frag.name`. Проверено: **частично**. Действие: K2 портирует **только** sequence/name-зависимые предикаты; всё, что трогает `j.overhang`/`frag.strand` → Фаза 2 (GG), не портируется.

---

## 6. Задачи

### K1 — `verifyAssembly` каркас + problem-модель + адаптер four-tier→предикат-вход

**Файл:** новый `lib/assembly-verify.js`.

**Что делаем:** чистый каркас вердикта: резолв зоны через `draftFromZone`, перечисление стыков через `allBoundaries`, пустой список предикатов (заполняется K2–K3), severity→level карта, problem-shape.

**Сигнатура:**
```
verifyAssembly(state, zoneId) → {
  ok: boolean,                       // true ⇔ нет ни одной problem level:'block'
  problems: [{
    code,                            // 'identical-fragments' | 'overlap-gc' | ...
    severity,                        // 'error' | 'warning' | 'note'
    level,                           // 'block' | 'pass'  (derived: error→block)
    scope: { pairKey, segmentLabel },
    message,                         // ru, биолог-язык
    suggestion,                      // ru, что сделать (или null)
  }],
}
```
Логика:
1. `draftFromZone(state, zone)` → segments (`.sequence`, `.id`). Нет зоны / <2 кусков → `{ok:true, problems:[]}`.
2. `allBoundaries(draft)` → стыки с `pairKey`/role; метод стыка из `zone.junctions[pairKey].method`.
3. Для каждого стыка: если метод ∉ {overlap_pcr, gibson} → одна `note`-проблема `code:'unverified-method'` («метод не проверяется на этой фазе»), `level:'pass'`. Иначе — прогон предикатов (K2–K3, пока пусто).
4. `level = severity==='error' ? 'block':'pass'`; `ok = !problems.some(p=>p.level==='block')`.

**Тесты** (`__tests__/assembly-verify.test.js`, +~6):
1. Happy: 2-кусковая overlap-зона без проблем → `{ok:true, problems:[]}` (или только note нет — overlap покрыт).
2. Не-overlap стык (golden_gate) → ровно одна `note` `unverified-method`, `ok:true` (не блокирует).
3. <2 кусков / нет зоны → `{ok:true, problems:[]}`.
4. **Адаптер-порядок:** 3 куска, проблема на среднем стыке → `problem.scope.pairKey === pairKeyFor(seg1,seg2)` (off-by-one guard).
5. severity→level: сконструировать problem каждого severity → только `error`→`block`.

### K2 — overlap-предикаты на реальном codegen-окне

**Файл:** `lib/assembly-verify.js` (предикаты), читает `primer-derive.js` экспорт.

**Что делаем:** портировать overlap-предикаты, гоняя на **фактическом** overlap/binding (вывод `buildOverlapTail`+`overlapTailLen`), не на синтетическом окне.

**Под-шаг K2.0 (verify-first, §5):** подтвердить экспорт/сигнатуру `buildOverlapTail`/`overlapTailLen`; если не пробрасывается окно — извлечь чистый хелпер длины окна без переписывания праймерного пути.

Предикаты (каждый → problem с `pairKey`):
1. `identical-fragments` — соседние куски с одинаковым source-container / sequence → `severity:'error'` (overlap-зоны схлопываются). Единственный блок.
2. `overlap-gc` — GC% реального overlap вне [≈20%,≈80%] → `warning`.
3. `overlap-tm` — `calcTm(overlap)` вне рабочего диапазона → `warning`.
4. `overlap-palindrome` — overlap самокомплементарен (шпилька) → `warning`.

**Тесты** (+~7):
1. Идентичные соседи → `identical-fragments` `error`, `ok:false`.
2–4. GC-низкий / Tm-низкий / палиндром → соответствующий `warning`, `ok:true`.
5. **⚓ Верность окна:** overlap, проверенный верификатором, **побайтово равен** `buildOverlapTail`-выводу для того же стыка (frozen — ловит расхождение с синтетическим окном).
6. Чистая overlap-зона → ноль проблем.
7. **Frozen severity:** только `identical-fragments` имеет `severity:'error'`; GC/Tm/палиндром — `warning`.

### K3 — повтор-в-конструкте на пост-codegen продукте

**Файл:** `lib/assembly-verify.js`.

**Что делаем:** repeat-предикат на **полном собранном продукте** (`computeAssemblySequence`), чтобы видеть повторы, внесённые самими гомология-хвостами.

Логика: построить продукт через `computeAssemblySequence(draft)`; если overlap-зона стыка встречается в продукте >1 раза (мисассембли-риск) → `code:'repeat-in-construct'`, `pairKey` стыка.

**Severity — ОТКРЫТЫЙ ВОПРОС §10.4** (warning / error / suppressible). **K3 не начинать без ответа Игоря.** Дефолт-предложение: `warning` (tandem-repeat конструкты легитимны).

**Тесты** (+~3): повтор overlap в продукте → `repeat-in-construct`; уникальный overlap → нет; повтор внесён хвостом (не виден на голых кусках, виден на продукте) → ловится.

### K4 — `VerifyPanel` + гейт Realise

**Файлы:** новый `VerifyPanel.jsx`; `RealiseModal.jsx` (монтаж + гейт).

**Что делаем:** per-junction ✅/⚠/⛔ панель; кнопка Realise/заказа блокируется **только** при `!result.ok` (есть `level:'block'`); warning'и показываются, не блокируют.

Логика:
1. `VerifyPanel` зовёт `verifyAssembly(state, zoneId)` в `useMemo` (шов как `RealiseDagPreview`).
2. Рендер: строка на стык — ✅ (overlap/gibson, ноль проблем) / ⚠ (warning) / ⛔ (error) / серое «не проверено» (note). Сводка сверху (переиспользовать семантику `assemblyReadiness`).
3. `RealiseModal.confirm`/Realise: `disabled = !verify.ok` (вдобавок к существующему `allChosen`). Tooltip ⛔ → почему.
4. **honesty-оговорка зелёного — §10.5** (нужен ответ Игоря): по умолчанию подпись «химия правдоподобна, стол не гарантирован» у сводки.

**Тесты** (`__tests__/verify-panel.test.jsx` + расширить `assembly-realise.test.jsx`, +~6):
1. Зона с `error` → Realise `disabled`, ⛔ на нужном стыке.
2. Зона только с `warning` → Realise **enabled**, ⚠ показан (warning не блокирует).
3. Чистая overlap-зона → ✅, Realise enabled.
4. Не-overlap стык → «не проверено», не блокирует.
5. Гейт-регрессия: существующий realise-confirm флоу зелёный когда `verify.ok`.

### K5 — клик-через: стык → праймер → метод → живая пере-проверка

**Файлы:** `VerifyPanel.jsx`, `RealiseModal.jsx`.

**Что делаем:** клик по «⛔ Стык N» → подсветка точного праймера (через `source.boundaryAtOffset` → boundary → pairKey) + фокус на пикер метода этого стыка; смена метода → `verifyAssembly` пере-выполняется (тот же `useMemo`) → вердикт обновляется без перезагрузки.

Логика:
1. `problem.scope.pairKey` → найти праймер(ы) с `source.boundaryAtOffset` этого boundary → подсветить (data-attr / выделение в превью).
2. Скролл/фокус к `MethodPickerCard` этого стыка.
3. Смена метода → `zone.junctions` патч → `verify` (в useMemo на `state`) пересчитывается → строка стыка перекрашивается.

**Тесты** (+~4):
1. Клик по проблеме-стыку → правильный праймер помечен (по `boundaryAtOffset`).
2. Смена метода overlap→(другой overlap) → вердикт пере-вычислен (проблема ушла/появилась).
3. pairKey проблемы ↔ pairKey подсвеченного праймера совпадают (общий ключ).

---

## 7. Порядок и оценка

K1 → K2 → K3 → K4 → K5. Порядок фиксирован: K1 даёт problem-модель + адаптер, на которых стоят предикаты (K2–K3); K4 монтирует готовый `verifyAssembly`; K5 — клик-через поверх панели. **K3 заблокирован на §10.4, K4 honesty-оговорка на §10.5 — Code останавливается перед ними, если ответа нет.**

Оценка: ~1–1.5 дня Code (K1–K2 — ядро, ~полдня; K4–K5 — UI + интеграция, ~полдня; K3 мал). Если K5 клик-через разрастётся — выделить в K5.1.

---

## 8. STOP-условие и формат отчёта

### STOP
После commit K5 (или K4, если K5 делится) Code останавливается. **НЕ** обновляет PROJECT_STATE/RELEASES/DECISIONS/ANCHORS/BUGS, **НЕ** архивирует спеку, **НЕ** начинает Фазу 2 (GG/RE), **НЕ** трогает OUT-скоуп. Визуальная приёмка — отдельной сессией (вердикт-панель + клик-через + гейт).

### Формат отчёта
Code дописывает в `CURRENT_TASK.md` блок «Отчёт Code по Sprint M-VERIFY.1»: коммиты K1–K5; размеры (`assembly-verify.js`/`VerifyPanel.jsx` новые KB, `RealiseModal` Δ); Vitest (baseline + Δ); pytest (не трогалось); build; **подтвердить чтением:** окно верификатора == codegen-окно (frozen-тест K2.5); только `identical-fragments` блокирует (frozen K2.7); pairKey проблемы садится на правильный стык (K1.4); отклонения явным блоком; size budget.

---

## 9. Риски

1. **Ложный зелёный из-за расхождения окна.** Митигация: ⚓ §4.3 + frozen-тест K2.5 (проверенный overlap побайтово == `buildOverlapTail`). Без этого теста K2 не считается green.
2. **Ложный блок в день 1 (повтор / идентичность).** Митигация: только `identical-fragments` → `error` (frozen K2.7); повтор — `warning` по дефолту, severity на решении Игоря (§10.4) до K3.
3. **Off-by-one: проблема села не на тот стык.** Митигация: K1.4 адаптер-порядок тест (allBoundaries == fragments[] порядок).
4. **`validate.js` предикат тащит legacy-поле (`j.overhang`/`frag.strand`), которого нет в four-tier.** Митигация: §5 — портируем **только** sequence/name-предикаты; overhang-зависимое → Фаза 2.
5. **`RealiseModal` рост.** 5.51 KB, далеко от soft 30 — панель в отдельном `VerifyPanel.jsx`. Если RealiseModal прыгнет >3 KB — вынести гейт-логику в хелпер.

---

## 10. Открытые вопросы

1. **Кто пользователь день 1 — Игорь (dogfood) или внешние биологи?** Если Игорь — overlap/gibson-срез, вероятно, покрывает большинство реальных конструктов, и Фаза 1 самодостаточна. Жду решения.
2. **Доля Golden Gate vs overlap/gibson в реальных конструктах Игоря?** Если доминирует GG — тянуть overhang-редактор (Фаза 2) вперёд, принять более медленный, но релевантный релиз. Жду решения.
3. **Диапазоны GC%/Tm для `warning`** — конкретные пороги (предлагаю GC 20–80%, Tm overlap по существующему `calcTm` ≥ ~48°C). Жду подтверждения/корректировки.
4. **Severity повтора-в-конструкте (K3):** warning / error / suppressible per-junction? Tandem-repeat и легитимные повторные overlap'ы реальны. **Дефолт — warning.** Самый вероятный ложный блок — нужен ответ ДО K3.
5. **Honesty-оговорка зелёного вердикта (K4):** ставить ли у ✅ подпись «химия правдоподобна, стол не гарантирован» (верификатор не видит вторичную структуру / Dam-Dcm / суперскрутку)? Защищает доверие vs подрывает ценность. **Дефолт — ставить тихую подпись у сводки.** Нужен ответ.

---

_Спека M-VERIFY.1, Фаза 1 из 4. Фазы 2–4 (GG/RE · именованные версии · учёба со стола) — отдельные спеки после приёмки Фазы 1. Концепт-документ (полный by-design) — в чате 10.06._

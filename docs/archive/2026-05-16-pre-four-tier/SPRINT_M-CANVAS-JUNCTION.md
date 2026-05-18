# SPRINT M-CANVAS-JUNCTION — Junction Contract + Reactive Cascade (F2)

**Дата спеки:** 15.05.2026 (написана в batch вместе с F1 / F3 / F4 без acceptance gate между — см. R-DRIFT).
**Тип:** A.
**Target размер спеки:** ~25 KB.
**Источник:** `docs/NOTES_CANVAS_V2_KICKOFF.md` §9.5 F2 + §9.2 решения #6-12 + §9.9.1 уточнение #11 (toast vs confirmation gate).
**Цепочка:** F1 Window System (написана) → **F2 этот sprint** → F3 PCR Op Mode → F4 Live Product Preview.
**Статус:** черновик Chat 15.05.2026, batch с F1 — реализуется после F1 acceptance.

---

## 0. Срез размеров

| Файл | Сейчас | Статус | Действие в F2 |
|---|---|---|---|
| `canvas/junction-styles.js` | 4.25 KB | OK | +1.5-2 KB (расширение detectJunctionKind + endRequirements heuristic) |
| `canvas/JunctionMethodPicker.jsx` | 6.70 KB | OK | +5-7 KB (overlapTarget toggle, length/Tm toggle, ends preview) |
| `store/skeleton-state-canvas.js` | 21.51 KB | Watch | +2-3 KB (расширение SET_JUNCTION_KIND + новые SET_JUNCTION_PARAMS + RECONCILE_AUTO_JUNCTIONS extended). Если выйдет за hard 25 — декомпозировать junction reducer в `skeleton-state-junctions.js`. |
| `canvas/CanvasLayoutView.jsx` | 34.36 KB | Watch | +1-1.5 KB (junction badge clickable + validation indicator). |

Новые файлы:
- `store/selectors-junction.js` ~5-7 KB (reactive selectors: tails, ends, validation).
- `canvas/JunctionPopover.jsx` ~6-8 KB (extended popover; **заменяет JunctionMethodPicker.jsx**, который становится sub-component в нём).
- `lib/junction-toast.js` ~1.5-2 KB (corner toast helper для non-critical recompute).

Migration: `JunctionMethodPicker` остаётся как inner section in JunctionPopover (kind picker — одна из секций нового popover'а). Возможен rename / inline — реализатор решает.

---

## 1. Контекст и связи перед действием (§17 R4)

### Где задача сядет

- `canvas/junction-styles.js` — добавляются helper'ы `inferEndRequirements(kind, overlapTarget)` + расширение `detectJunctionKind` для нового shape.
- `store/skeleton-state-canvas.js::junctionsReducer` cases — `SET_JUNCTION_KIND` теперь принимает `{kind, mode, ...}`, новый `SET_JUNCTION_PARAMS { junctionId, patch }` для overlap length/Tm/target/endRequirements. `RECONCILE_AUTO_JUNCTIONS` дополнительно подставляет default params.
- `canvas/CanvasLayoutView.jsx::JunctionBadge` — clickable, открывает новый `JunctionPopover` вместо старого `JunctionMethodPicker`. + warning indicator (красная точка) если validation селектор вернул incompatibility.
- `store/skeleton-context.jsx` — новая action `setJunctionParams(junctionId, patch)`.
- `store/selectors-junction.js` — pure selectors: `selectTailsForJunction`, `selectEndsRequirementsForContainer`, `selectJunctionValidation`. Импортируются точечно в Spec 3 (PCR primer cascade), в Spec 2 — только тестируются на mock-op.

### Что НЕ задеваем

- `container.ends` data field — **остаётся writable**, в Spec 2 derived endRequirements только сравниваются с ним для warning. Реальное приведение container.ends к junction requirements — это Spec 3 (PCR op добавляет tails) и Spec 4 (Live product computes assembly).
- Annotator / Library / SequenceView — без изменений.
- Algorithm core — без изменений.
- F1 window system — без изменений; junction popover открывается из canvas, не из editor tab.

### Дубли check (§17 R1)

- `JunctionMethodPicker` существует — расширяем его в `JunctionPopover` либо inline новые секции; не плодим параллельный picker.
- `junction-styles.js::detectJunctionKind` — расширяем, не дублируем.
- `selectors-junction.js` новый файл — таких selectors сейчас нет, не дублируем.

### Запрещённые слова §17 R3 — обоснования

- «**Новый компонент** JunctionPopover»: старый `JunctionMethodPicker` 6.70 KB решает только kind-choice; новый popover имеет 3-4 секции (kind + overlapTarget + length/Tm + ends preview). Inline всё в один файл — overflow soft 30 KB не достигается, но семантически разделение «выбор метода» / «параметры overlap» / «ends preview» — отдельные ответственности. Реализатор может оставить один файл `JunctionMethodPicker.jsx` если расширение влезает в soft.
- «**Новая модалка**»: нет, popover — тот же что был. Анхор position fixed.

---

## 2. Стратегия

Junction в скелете сейчас — `{id, fromContainerId, toContainerId, kind, autoDetectedKind}`. F2 расширяет shape до **контракта** с явными полями overlap target / length-xor-Tm / endRequirements / status (auto/manual) согласно §9.2 решение #7. Reactive selectors (pure functions) выводят tails-for-primers и endRequirements-for-container из junction shape — это инфраструктура, которую Spec 3 PCR Op Mode подключит к реальному primer-design.

В Spec 2 reactive cascade демонстрируется тестами и на mock-операции в junction popover — биолог видит «при изменении length Tm пересчиталась», «при изменении kind endRequirements обновились». Реальный primer-cascade — Spec 3.

Corner toast (§9.2 решение #11) — тихий info-toast при auto-recompute. Через existing `state.toasts` queue + `ToastBridge`. Только non-critical; critical confirmation gate для заказа олигов — Spec 3.

Validation rule (§9.2 решение #12) — для container'а с inputs L и output R пара junction'ов вокруг него должна иметь совместимые overlapTarget'ы (не оба 'both'). Selector `selectJunctionValidation` возвращает массив warnings; рендерится badge'ами на junction в CanvasLayoutView.

---

## 3. Scope IN / OUT

### IN

- Расширение junction shape: `overlapTarget`, `overlapLength`, `overlapTm`, `endRequirements`, `status`.
- `SET_JUNCTION_PARAMS` reducer case + action.
- Reactive selectors `selectTailsForJunction` / `selectEndsRequirementsForContainer` / `selectJunctionValidation`.
- JunctionPopover (или JunctionMethodPicker expanded): kind picker + overlapTarget toggle (L/R/both) + length-xor-Tm toggle + ends preview + validation warning section.
- Corner toast при auto-recompute (info kind, через existing toasts queue).
- Validation warnings: container с конфликтом overlap targets вокруг → красная точка на junction badge, hover-tooltip с описанием.
- Tests на reactive selectors + popover UI + validation rules.

### OUT

- Реальный primer-design cascade (это Spec 3 — selector используется там).
- Container.ends auto-update from junction — биолог сам приводит ends через PCR op (Spec 3) / blunting / digest.
- Confirmation gate для заказа олигов — Spec 3.
- Bio-validation rules из R5-R9 (KLD back-to-back, Gibson overlap min length, GG enzyme orthogonality) — **уже реализованы** в `lib/bio/*` после R5-R9; Spec 2 их использует через import, не переписывает.
- Junction между >2 контейнерами (Gibson из 4 фрагментов = mid-junction). Spec 2 — только pairwise junction; multi-junction model — отдельный sprint после Spec 4 если потребуется (R5-R9 OPS-BIO Gibson обрабатывает multi через цепь pairwise).

---

## 4. Архитектурные решения

### DEC-CANVAS-JUNC-01 — Расширенный junction shape

```
{
  id: string,
  fromContainerId: string,
  toContainerId: string,
  kind: 'overlap'|'golden_gate'|'re_ligation'|'ligation'|'kld'|'sticky_end'|'blunt'|'preformed'|'auto',
  autoDetectedKind: string,
  status: 'auto' | 'manual',          // NEW: 'auto' если последний raised detectJunctionKind; 'manual' после user-override.
  overlapTarget: 'left' | 'right' | 'both',   // NEW: на какой стороне берётся overhang. Default 'right' (3'-конец from = 5'-конец to).
  overlapLength: number | null,        // NEW: фиксированная длина overhang в bp. Mutually exclusive с overlapTm.
  overlapTm: number | null,            // NEW: целевая Tm overhang в °C. Mutually exclusive с overlapLength.
  endRequirements: {
    fromEnd: { type: 'overhang'|'blunt'|'any', overhang?: string, length?: number },
    toEnd: { type: 'overhang'|'blunt'|'any', overhang?: string, length?: number },
  } | null,                            // NEW: что junction требует от ends contiguous containers.
}
```

**Mutually exclusive overlapLength xor overlapTm** обеспечивается reducer'ом: при set одного — другой автоматически становится null. UI toggle переключает «активный» параметр.

**Defaults** при `RECONCILE_AUTO_JUNCTIONS`:
- `overlap` / `re_ligation`: overlapTarget='right', overlapLength=30, overlapTm=null.
- `golden_gate`: overlapTarget='right', overlapLength=4 (стандарт BsaI), overlapTm=null.
- `kld`: overlapTarget='both', overlapLength=0 (back-to-back), overlapTm=null.
- `ligation` / `blunt`: overlapTarget='right', overlapLength=0, overlapTm=null.
- `sticky_end`: overlapTarget='right', overlapLength=4, overlapTm=null.
- `preformed`: всё null (ничего не делаем).

### DEC-CANVAS-JUNC-02 — status 'auto' / 'manual'

- `RECONCILE_AUTO_JUNCTIONS` создаёт junction со `status: 'auto'`. Любое ручное изменение через popover (SET_JUNCTION_KIND / SET_JUNCTION_PARAMS) флипает в `status: 'manual'`.
- Manual junction'ы **не перезаписываются** при следующем reconcile (биолог явно override'нул).
- В popover'е indicator status — small dot near header («auto-detected» / «manual override»).
- "Reset to auto" кнопка в popover'е — возвращает status='auto', kind=autoDetectedKind, params=defaults.

### DEC-CANVAS-JUNC-03 — Reactive selectors как pure functions

`store/selectors-junction.js`:

- `selectTailsForJunction(state, junctionId)` → `{forwardTail: string, reverseTail: string, source: 'overlap'|'golden_gate'|...} | null`. Pure-function reading `state.containers` + `state.junctions`. NULL если junction.kind === 'preformed' или контейнеры не имеют достаточно sequence для tail extraction.
- `selectEndsRequirementsForContainer(state, containerId)` → `{required5prime, required3prime, conflicts: string[]}`. Aggregate от всех incident junctions (incoming = endRequirements.toEnd, outgoing = endRequirements.fromEnd). Conflicts массив пуст если совместимо, иначе warning strings.
- `selectJunctionValidation(state, junctionId)` → `{ok: boolean, warnings: string[]}`. Локальные проверки: container endRequirements satisfied? Overlap target conflict с парной junction вокруг container'а?

Selectors **чистые** — Zustand pattern `useStore((s) => selectTailsForJunction(s, jid))` mounts re-render-on-change без явного subscribe.

### DEC-CANVAS-JUNC-04 — Validation: что считается конфликтом

**Реальные конфликты:**

1. **End type mismatch на одной стороне.** Для contiguous контейнера C посередине junction L (входящий в C) и junction R (исходящий из C): если L.endRequirements.toEnd.type = 'blunt' и на той же стороне C уже есть sticky overhang (из container.ends.fivePrime) — conflict.

2. **Incompatible sticky overhang sequences.** L.endRequirements.toEnd.overhang = 'ATCG' и R.endRequirements.fromEnd.overhang = 'ATCC' — разные sticky-последовательности, биологически несовместимы.

3. **GG enzyme orthogonality fail.** Для kind='golden_gate' в каскаде junction'ов вокруг одного контейнера — два 4-nt overhang'а с одинаковым sequence (cross-anneal). Reuse R5-R9 валидации из `lib/bio/*` если есть, иначе минимальный stub.

**НЕ конфликт:**

- Обе junction вокруг C с `overlapTarget='both'` — это валидный workflow (двойной PCR / digest с обеих сторон C). Не warning.
- Допустимые комбинации (L='right' + R='left' или L='right' + R='both', etc.) — все valid пока end types/sequences совместимы.

Warnings non-blocking: биолог может игнорировать (это план, не лаборатория в real-time). Hard block — только в F4 Live Product для биологически невозможных (Gibson двух circular без digest).

### DEC-CANVAS-JUNC-05 — Corner toast non-critical

При auto-recompute (detectJunctionKind при reconcile / overlapTm recompute от length change / cascade pull endRequirements) — push в `state.toasts` queue с kind='info', message короткое («Auto-recompute: junction X kind → GG»). ToastBridge их consumирует через existing showToast.

**Critical gates** (заказ олигов, transform) — в Spec 3, не здесь.

### DEC-CANVAS-JUNC-06 — JunctionPopover sections

```
Header: title «Метод сборки на стыке» + status indicator
Section 1: Kind picker (existing 6 methods grid + visual badges)
Section 2: Overlap parameters (visible когда kind in ['overlap','re_ligation','golden_gate','sticky_end','kld'])
  - overlapTarget toggle: [L] [R] [both]
  - length-or-Tm toggle: (•) Length [30] bp  ( ) Tm [60] °C
  - hint: «Биологически: <descriptive line>»
Section 3: Ends preview (visible после section 2)
  - From container 3'-end: required <overhang ATCG / blunt / any>
  - To container 5'-end: required <overhang ATCG / blunt / any>
  - Current vs required: ✓ / ⚠ mismatch + hint «Provide через PCR / digest»
Section 4: Validation warnings (visible если selectJunctionValidation.warnings.length > 0)
  - Bulleted list, red text, link to Spec 3 PCR op для quick-fix.
Footer: «Reset to auto» (выходит на status='auto', defaults) + ✕ Close.
```

### DEC-CANVAS-JUNC-07 — Auto-recompute trigger points

Triggers RECONCILE_AUTO_JUNCTIONS (pointer-up на canvas — existing) дополнительно пересчитывает params **только для status='auto' junction'ов**. Manual junction'ы не трогаются.

При `SET_JUNCTION_KIND` через popover (status → 'manual') params reset к defaults для нового kind. Биолог может явно изменить params после kind-change (params не auto-reset на каждое изменение).

### DEC-CANVAS-JUNC-08 — Backward-compat миграция

Existing junctions без новых полей (после rehydrate из IndexedDB старой схемы):
- Lazy normalize в reducer: missing полей → дефолты при первом read. `selectors-junction.js::normalizeJunction(j)` helper.
- Schema version на root state — bump v2 → v3 в `skeleton-persistence.js::SCHEMA_VERSION`. Migration chain нормализует junction'ы при rehydrate (так же как DEC-OPS-SNAPSHOT-MIGRATE-01 после R12).

---

## 5. Файлы и сигнатуры

### Новые файлы

**`store/selectors-junction.js`** (~5-7 KB)

- `selectTailsForJunction(state, junctionId): {forwardTail, reverseTail, source} | null`. Reads `state.containers` + `state.junctions`. For overlap/Gibson: берёт last N nt from-container's 3' + first N to-container's 5' где N = overlapLength или derived from overlapTm via `tm-calculator.calculateTm()` reverse search. Для GG: 4-nt overhang from junction params. Для preformed: null.
- `selectEndsRequirementsForContainer(state, containerId): {required5prime, required3prime, conflicts}`. Aggregate от incident junctions (junction.toContainerId === containerId → use endRequirements.toEnd как required5'; junction.fromContainerId === containerId → endRequirements.fromEnd как required3'). Conflicts если incompatible.
- `selectJunctionValidation(state, junctionId): {ok, warnings}`. Checks: container ends satisfy endRequirements? Overlap target conflict с парной junction? GG kind но нет recognized overhang pattern?
- `normalizeJunction(j): junction` — lazy migration helper для backward-compat.

**`canvas/JunctionPopover.jsx`** (~6-8 KB)

`JunctionPopover({ junction, position, onPick, onSetParams, onCancel, onResetAuto })`. Renders 4 sections per DEC-JUNC-06. Использует existing `junction-styles.js` палитру. Inner sub-components inline (OverlapTargetToggle, LengthTmToggle, EndsPreview, ValidationList).

**`lib/junction-toast.js`** (~1.5-2 KB)

`pushJunctionToast(actions, kind, message)` — helper, wraps `actions.showToast({kind, message, ttl: 3000})`. Используется reducer'ом через side-effect pattern (actions injected). Alternative: reducer возвращает toast в state, ToastBridge consumес (это существующий pattern в state.toasts queue). **Take B (existing pattern).** Helper только централизует formatting.

### Существующие файлы

**`canvas/junction-styles.js`** (+1.5-2 KB)

- `detectJunctionKind(from, to, opts?)` — расширяется опцией opts.preferredEnds для cascade-aware detection (например, биолог в parent junction задал GG → в child junction default GG если совместимо).
- `inferEndRequirements(kind, overlapTarget, overlapLength|overlapTm)` — новая helper. Возвращает `{fromEnd, toEnd}` shape согласно kind/target.
- `defaultJunctionParams(kind)` — новая helper, возвращает defaults из DEC-JUNC-01.

**`store/skeleton-state-canvas.js`** (+2-3 KB)

- `SET_JUNCTION_KIND` extended: при kind change также сбрасывает params к defaults через `defaultJunctionParams(kind)` + sets status='manual'.
- Новый case `SET_JUNCTION_PARAMS { junctionId, patch }` — merge patch в junction, enforce overlapLength xor overlapTm (set одного → другой null). Sets status='manual' если был 'auto'.
- Новый case `RESET_JUNCTION_TO_AUTO { junctionId }` — kind=autoDetectedKind, params=defaults, status='auto'.
- `RECONCILE_AUTO_JUNCTIONS` extended: для status='auto' существующих junction'ов пересчитывает kind через `detectJunctionKind` + params через `defaultJunctionParams`. Push corner toast если kind изменился. Manual junction'ы не трогает.

**Если файл вырастет за hard 25 KB** — декомпозиция junction reducer в `skeleton-state-junctions.js` первым пунктом sprint'а.

**`store/skeleton-state.js`** (+0.5 KB)

Router добавляет SET_JUNCTION_PARAMS / RESET_JUNCTION_TO_AUTO в canvas sub-reducer chain.

**`store/skeleton-context.jsx`** (+0.3 KB)

Новые actions: `setJunctionParams(junctionId, patch)`, `resetJunctionToAuto(junctionId)`.

**`canvas/CanvasLayoutView.jsx`** (+1-1.5 KB)

JunctionBadge: добавляется hover-state с validation indicator (красная точка если selectJunctionValidation вернул warnings). Click → `JunctionPopover` вместо `JunctionMethodPicker`. Если popover'и идентичны API — drop-in replace.

**`store/skeleton-persistence.js`** (+0.3-0.5 KB)

Schema bump: SCHEMA_VERSION 'v2' → 'v3'. Migration `migrateV2ToV3(state)`: применяет `normalizeJunction()` ко всем `state.junctions`.

### Тесты

Файл `__tests__/canvas-skeleton/junction-contract.test.jsx` (~10-12 KB).

Покрытие:
1. **Shape backward-compat:** rehydrate state v2 (old junction shape) → migration v3 → все junctions имеют новые поля с defaults.
2. **detectJunctionKind:** existing 4 правила pass без regression.
3. **defaultJunctionParams:** для каждого kind возвращает корректные defaults.
4. **SET_JUNCTION_KIND:** kind change → params reset к defaults для нового kind, status → 'manual'.
5. **SET_JUNCTION_PARAMS:** setting overlapLength → overlapTm=null (mutex). И обратно.
6. **RESET_JUNCTION_TO_AUTO:** kind → autoDetectedKind, params=defaults, status='auto'.
7. **RECONCILE_AUTO_JUNCTIONS:** для status='auto' пересчёт; для status='manual' — игнор.
8. **selectTailsForJunction:** mock containers ATCG..TTTT, junction kind='overlap' length=10 → forwardTail = last 10 from from, reverseTail = first 10 to reversed-complemented. Для GG length=4 → специфичный pattern.
9. **selectEndsRequirementsForContainer:** контейнер C, junction L (to=C, overlapTarget='right'), junction R (from=C, overlapTarget='left') → required5prime = L.endRequirements.toEnd, required3prime = R.endRequirements.fromEnd, conflicts=[].
10. **selectJunctionValidation:** случай overlap target both+both → warning «overlap target conflict». Случай sticky end mismatch ATCG vs ATCC → warning.
11. **Corner toast:** RECONCILE_AUTO_JUNCTIONS на изменении kind → toast в state.toasts с kind='info'.
12. **JunctionPopover render:** все 4 секции рендерятся при kind='overlap'. Click kind=GG → switch секции / params reset.
13. **JunctionPopover UI:** length-Tm toggle переключает поле, set length=30 → overlapTm input disabled. Reset to Auto → возврат.

---

## 6. Порядок выполнения

### K1 — Shape extension + reducer

- Junction normalize + new fields в `junction-styles.js` (`inferEndRequirements`, `defaultJunctionParams`, расширенный `detectJunctionKind`).
- Reducer cases SET_JUNCTION_PARAMS / RESET_JUNCTION_TO_AUTO + расширение SET_JUNCTION_KIND.
- Migration v2 → v3 в persistence.
- Backward-compat tests pass.

### K2 — Reactive selectors

- `store/selectors-junction.js` файл.
- Pure functions, unit tests на mock state.
- Tests pass — все selectors return корректно на mock junction'ах.

### K3 — JunctionPopover

- Новый компонент с 4 секциями.
- Replace `JunctionMethodPicker` в CanvasLayoutView (опционально rename или оставить старый файл удалённым).
- Manual smoke: open popover → переключить kind → params reset → set overlap length → ends preview обновился.

### K4 — Validation + warnings

- `selectJunctionValidation` use в CanvasLayoutView (red dot на junction badge при warnings).
- ValidationList section в popover.
- Tests pass на conflict scenarios.

### K5 — Corner toast + reconcile cascade

- `RECONCILE_AUTO_JUNCTIONS` пушит toast при kind change.
- ToastBridge consumес (existing).
- Tests pass на toast queue.

### K6 — Cleanup

- Lint, build clean.
- Размеры файлов в budget.
- Финальный отчёт.

**STOP после K6.** Не финализирует координационные файлы.

---

## 7. STOP-условие и формат отчёта

Идентично F1 (size budget table + tests count + DECISIONS draft 8 DEC-CANVAS-JUNC-NN + manual smoke + отклонения).

**Manual smoke**: «открыл popover → kind/target/length/Tm меняются, ends preview обновляется, reset to auto работает, conflict scenario рендерит red dot».

---

## 8. Риски

### R-DRIFT (cross-spec, applies F2/F3/F4) — нет acceptance gate Spec 1 → Spec 2

Spec 2 написана до acceptance F1 (по решению Игоря 15.05). Если F1 в реализации сместит API (например, junction popover открывается из editor tab, не из canvas badge) — Spec 2 потребует поправок. Митигация: каждая последующая спека ссылается на конкретные точки в F1 (canvas-level badge клик), отклонения от F1 в реализации поднимают флаг в acceptance F1, не доходя до F2 Code-сессии.

### R1 — Selectors performance при 20+ junction'ах

Pure selectors на каждый useStore subscribe пересчитывают tails. Митигация: memoize через `useMemo`/`React.memo` на consumer-side; reactive recompute только когда junction shape / containers actually change (Zustand selector shallow equality).

### R2 — Schema migration v2 → v3 ломает старые saved snapshots

Тесты K1 на rehydrate v2 → v3 + integration smoke со snapshot из IndexedDB. Если миграция не cover'ит edge case — поправка в K1.

### R3 — overlapTm calculation требует tm-calculator интеграцию

Если `tm-calculator.calculateTm()` возвращает только Tm на основе sequence, а нам нужно «N nt для target Tm 60°C» — это reverse search. Митигация: stub-helper `lengthForTm(seq, tm)` в `lib/bio/tm-search.js` (или inline в selector) — линейный поиск 8-40 nt с early stop.

### R4 — JunctionPopover overflow если ends preview длинный

Если sequence в overhang длинная (например 30 nt) — preview не помещается в 280px popover. Митигация: monospace + truncate в середине («ATCG...TTTT» для длинных).

### R5 — Validation rules false positives

«Sticky end mismatch ATCG vs ATCC» — может быть legit если биолог планирует blunt с дальнейшим adapter ligation. Митигация: warnings не блокирующие (биолог может игнорировать), только indicator. Hard block (ошибка) только для биологически невозможных вариантов (Gibson двух circular без digest).

---

## 9. Открытые вопросы — закрыты дефолтами 15.05.2026 (Игорь принял F1 дефолты)

### Q1 — Single junction popover vs separate sections в editor

Дефолт: single popover на canvas-level badge click, 4 секции inline. Не отдельный wizard, не отдельный editor tab.

### Q2 — Manual junction immutability

Дефолт: manual junction'ы (status='manual') не перезаписываются при RECONCILE_AUTO_JUNCTIONS. Биолог явно делает «Reset to auto» если хочет вернуться.

### Q3 — Toast persistence

Дефолт: toasts проходят через existing state.toasts queue, кратко (~3 sec), без persist в IndexedDB.

### Q4 — Selectors memoization scope

Дефолт: useMemo на consumer-side. Зависит от F1 multi-tab architecture (selector subscribe per active tab). Если F1 уйдёт от mount/unmount model — переоценить.

---

## Acceptance gate

После Code commit'а + STOP — compact + новая chat-сессия (либо общая acceptance F1+F2+F3+F4 в одной сессии по решению Игоря).

- Open canvas с 2-3 junction'ами разных kind'ов.
- Click junction badge → popover открывается.
- Switch kind → params reset, ends preview обновился.
- Set overlap length → Tm input disabled. Switch toggle → length disabled.
- Conflict scenario (оба соседних junction'а 'both') → red dot + warning text в popover'ах.
- Manual junction → RECONCILE auto event → манул не тронут.
- Reset to auto → возврат к autoDetected kind/params.
- Reload (persistence) → junction shape preserved (включая новые поля).

---

_Дата:_ 15.05.2026.
_Реализация Code:_ после F1 acceptance + compact (либо в batch с F1 если Игорь решит так).
_Acceptance:_ отдельная chat-сессия или batch с F1.

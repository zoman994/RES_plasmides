# SPRINT_1_5_MUTAGENESIS_V2.md

**Статус:** 📋 ЗАПЛАНИРОВАН
**Приоритет:** HIGH — блокирует Sprint 2 (V7 InsertionClock зависит от корректной архитектуры мутагенеза)
**Оценка времени:** 6–8 часов (4 коммита)
**Автор:** Claude Chat, 20.04.2026 — написано сразу после приёмки Sprint 1, пока контекст свежий
**Предыдущий этап:** Sprint 1 ✅ (8 коммитов, 637 Vitest)

---

## TL;DR

Визуальная приёмка Sprint 1 нашла три взаимосвязанных архитектурных бага в мутагенезе, один UX-баг, один мелкий data-баг. Все четыре входят в один кластер и должны решаться вместе:

- **V14** `chooseStrategy` не знает контекст фрагмента → линейным кускам в сборке прописывается KLD (биологически невозможно)
- **V12** FragmentEditor смешивает два разных workflow (правку sequence и мутагенез) в одном UI с ловушкой при сохранении
- **V13** Кнопка «Мутагенез» в footer PlasmidViewer теряет template при переходе в Wizard
- **V11** KLD-праймеры из strategy приходят с `tmBinding: 0`, `gcPercent: 0`

После Sprint 1.5 мутагенез работает **по всем трём UX-путям** (Wizard, in-place FragmentEditor, PlasmidViewer footer) и корректно разделяет bookkeeping-правки sequence от реального лабораторного мутагенеза.

---

## Контекст — что нашла визуальная приёмка

### Биологическое различие двух операций

Игорь указал на фундаментальную путаницу в текущем дизайне:

**«Редактирование» (bookkeeping, документационная операция)**
- Пример: секвенирование пришло, в сохранённой последовательности обнаружена опечатка. Или GenBank-файл импортирован с некорректной аннотацией одного нуклеотида. Или синтезированный олиго получил номер не ту букву.
- Цель: поправить sequence так, чтобы **запись в системе** соответствовала реальной ДНК, которая уже существует в пробирке.
- Биологически: **никакого эксперимента не нужно**. Мутации вносить не надо. Олиги заказывать не надо. Протокола нет.
- История: в `fragment.editHistory` (отдельное поле, для аудита кто что правил). В `fragment.mutations` — НЕ записывается (это не мутация).
- Workflow: кликнул по нуклеотиду → заменил → сохранил.

**«Мутагенез» (эксперимент, лабораторная операция)**
- Пример: хочу получить вариант белка E245A. Нужно спланировать эксперимент.
- Цель: система строит **стратегию** (KLD / two_fragment / multi_fragment), подбирает **олиги**, даёт **протокол** реакций.
- Биологически: полный workflow — ПЦР, DpnI, KLD-реакция / overlap PCR, трансформация, colony PCR, секвенирование.
- История: в `fragment.mutations` — да (это запланированная экспериментальная модификация). В parts library создаётся variant.
- Workflow: кликнул → выбрал замену → система рассчитывает → применяешь к canvas с праймерами и протоколом.

**Это принципиально разные операции**, несмотря на одинаковый гест клика по нуклеотиду. Пользователь их различает, а система сейчас — нет.

### Биологическое различие трёх классов фрагментов для выбора стратегии

V14 обнаружен на скрине, где пользователь сделал две мутации в CmR (199 bp) в составе 3-фрагментной Gibson-сборки. Получил KLD-праймеры. Это **биологически невозможно**, потому что:

**KLD работает только на circular standalone плазмиде** — ПЦР-ишь всю плазмиду back-to-back праймерами, DpnI съедает родителя, лигаза замыкает концы. Нужен:
- Circular topology (есть что замыкать)
- Standalone фрагмент (не часть сборки)
- Backbone вокруг CDS (для посадки внешних праймеров)

**Линейный фрагмент в составе сборки (любой длины, хоть 199 bp, хоть 5 кб)** — KLD неприменим. Нужно two-fragment overlap PCR:
1. Разрезаешь CDS в точке мутации.
2. ПЦР-ишь два куска со WT-матрицы с праймерами, где мутация **записана в overlap-тейле**.
3. Overlap PCR с соседями сборки сшивает всё через мутантный стык.

**Одна мутация тоже может требовать split**, если фрагмент линейный — тогда two_fragment (фрагмент режется надвое через мутацию). Текущий `chooseStrategy` для одной мутации ВСЕГДА возвращает `'kld'` — на линейном куске это неправильно.

### Сводка багов Sprint 1.5

| # | Приоритет | Суть |
|---|-----------|------|
| **V14** | CRIT (арх) | `chooseStrategy` слеп к контексту фрагмента. Линейный кусок в сборке получает невозможный KLD. |
| **V12** | HIGH | Вкладки «Редактирование» и «Мутагенез» визуально одинаковы, но разное поведение сохранения. Мутации с «Редактирования» теряются. |
| **V13** | HIGH | «Мутагенез» в footer PlasmidViewer открывает пустой Wizard без template. |
| **V11** | MED | KLD-олиги приходят с tmBinding=0, annealTemp в протоколе = 0°C. |

---

## Архитектурные решения

### 1. Mode switcher в FragmentEditor (Вариант C из обсуждения)

В заголовке редактора — radio-переключатель двух режимов **над** tabs (tabs остаются для переключения между DNA-view / Protein-view / Regions):

```
┌─ FragmentEditor ──────────────────────────────────────┐
│ [AmpR]  999 п.н. · 333 а.о.        [×]                │
│                                                        │
│ ○ Правка (фикс записи)    ● Мутагенез (эксперимент)   │
│                                                        │
│ ┌─── DNA ── Белок ── Аннотации ────────────────────┐ │
│ │  [sequence view with clickable nucleotides/AA]   │ │
│ └──────────────────────────────────────────────────┘ │
│                                                        │
│ [💾 Сохранить правки]  или  [🧬 Применить мутагенез] │
└────────────────────────────────────────────────────────┘
```

**Поведение Mode=edit:**
- Клик по нуклеотиду → inline input для замены (A/T/G/C), Enter применяет, Escape отменяет.
- Клик по аминокислоте → **отключён** (это операция мутагенеза, не правки).
- Quick actions (+ATG, +Kozak, +His6, Убрать стоп) — остаются, они применяют текстовые правки к sequence.
- Textarea для массового редактирования sequence — остаётся.
- При сохранении: `onSave(updated БЕЗ mutations)`, `handleSaveFragment` получает updated → **ранний return в simple-edit ветке**, seq просто записывается. В `fragment.editHistory` добавляется запись `{ timestamp, diff, user }`.
- Кнопка: `💾 Сохранить`.
- Цвет режима: нейтральный серо-синий.

**Поведение Mode=mutagenesis:**
- Клик по нуклеотиду → popup «ДНК мутация» (как сейчас).
- Клик по аминокислоте → popup «замена AA» (как сейчас).
- Quick actions — **отключены** или скрыты (они не про мутагенез).
- Textarea для массового edit — отключена или скрыта.
- При сохранении: `onSave(updated С mutations)` → strategy engine через `handleSaveFragment` путь V4-D + V4-новый.
- Кнопка: `🧬 Применить мутагенез (N)`.
- Цвет режима: фиолетовый.

**Состояние вкладки Protein/Regions — не меняется**, остаётся как сейчас.

**Переключение режимов сбрасывает накопленные mutations** с подтверждением («Переключение режима отменит 3 накопленные мутации. Продолжить?»). Это защищает от накопления мусора в state.

### 2. `chooseStrategy(mutations, fragmentContext)` — расширение сигнатуры

**Файл:** `gui/designer/src/mutagenesis.js`

Новая сигнатура:
```js
/**
 * Choose mutagenesis strategy based on mutations AND fragment context.
 *
 * @param {Array}  mutations — mutations list (with dnaPosition)
 * @param {Object} fragmentContext
 * @param {'circular'|'linear'} fragmentContext.topology
 * @param {boolean} fragmentContext.isStandalone — true if fragment is the only one on canvas
 *                                                  (potential full plasmid for KLD)
 * @param {number}  fragmentContext.length — fragment bp length (для порога multi_fragment)
 * @returns {'kld'|'two_fragment'|'multi_fragment'}
 */
export function chooseStrategy(mutations, fragmentContext = {}) {
  const sorted = [...mutations].sort((a, b) => a.dnaPosition - b.dnaPosition);
  const { topology = 'circular', isStandalone = true, length = 0 } = fragmentContext;

  // KLD requires: circular topology + standalone fragment (full plasmid with backbone)
  const canUseKLD = topology === 'circular' && isStandalone;

  if (!canUseKLD) {
    // Linear fragment OR part of multi-fragment assembly → must use overlap PCR
    if (sorted.length === 1) return 'two_fragment'; // split around the single mutation
    if (sorted.length === 2) return 'two_fragment';
    return 'multi_fragment';
  }

  // Circular standalone — existing logic applies
  if (sorted.length === 1) return 'kld';
  if (sorted.length === 2 && sorted[1].dnaPosition - sorted[0].dnaPosition < 100) return 'kld';
  if (sorted.length === 2) return 'two_fragment';
  return 'multi_fragment';
}
```

**Обратная совместимость:** если `fragmentContext` не передан (старый вызов), `topology='circular'` и `isStandalone=true` — работает как раньше. Все существующие тесты strategy проходят без изменений.

### 3. `computeMutagenesisStrategy` тоже принимает context

Пропагируется дальше:
```js
export function computeMutagenesisStrategy(templateSeq, mutations, options = {}) {
  const {
    bindingLength = 20, overlapLength = 30,
    featureStart = 0, featureEnd = templateSeq.length,
    fragmentContext = { topology: 'circular', isStandalone: true, length: templateSeq.length },
  } = options;

  const strategy = chooseStrategy(mutations, fragmentContext);
  // ... остальное без изменений
}
```

### 4. Вызывающие места передают context

**В `handleSaveFragment` (V4-D, уже существует, нужно допилить):**

```js
const active = getActive();
const fragmentContext = {
  topology: active?.circular ? 'circular' : 'linear',
  isStandalone: fragments.length === 1,  // фрагмент один на canvas → полная плазмида
  length: original.sequence.length,
};

const result = computeMutagenesisStrategy(templateSeq, normMuts, {
  featureStart: 0,
  featureEnd: templateSeq.length,
  fragmentContext,
});
```

**В `MutagenesisWizard.jsx::compute`:**

Wizard работает с **template sequence** (обычно полный CDS или плазмида, пришедшая через selConstruct или textarea). Для Wizard'а `fragmentContext = { topology: 'circular', isStandalone: true }` — это самостоятельный контекст мутагенеза, не в составе сборки. Передать:

```js
const result = computeMutagenesisStrategy(templateSeq, mutations, {
  featureStart: cdsStart,
  featureEnd: cdsEnd,
  fragmentContext: { topology: 'circular', isStandalone: true, length: templateSeq.length },
});
```

### 5. V13: `MutagenesisWizard` принимает pre-filled template

**Файл:** `gui/designer/src/components/MutagenesisWizard.jsx`

Новые props:
```js
export default function MutagenesisWizard({
  onComplete, onClose,
  initialTemplateSeq,   // string — pre-filled sequence
  initialTemplateName,  // string — display name
  initialOrganism,      // string
  initialCdsStart,      // number
  initialCdsEnd,        // number
}) {
  const [templateSeq, setTemplateSeq] = useState(initialTemplateSeq || '');
  const [templateName, setTemplateName] = useState(initialTemplateName || '');
  const [organism, setOrganism] = useState(initialOrganism || 'E. coli');
  const [cdsStart, setCdsStart] = useState(initialCdsStart ?? 0);
  const [cdsEnd, setCdsEnd] = useState(initialCdsEnd ?? (initialTemplateSeq?.length || 0));
  const [step, setStep] = useState(initialTemplateSeq ? 2 : 1);  // skip step 1 if template provided
  // ... остальное
}
```

**В `App.jsx` при открытии Wizard с `wizardPresetMode === 'mutate'`:**
```js
{showMutagenesis && (
  <MutagenesisWizard
    initialTemplateSeq={wizardPresetMode === 'mutate' ? wizardPlasmid?.sequence : undefined}
    initialTemplateName={wizardPresetMode === 'mutate' ? wizardPlasmid?.name : undefined}
    initialOrganism={wizardPresetMode === 'mutate' ? wizardPlasmid?.organism : undefined}
    onComplete={handleMutagenesis}
    onClose={() => { setShowMutagenesis(false); setWizardPlasmid(null); setWizardPresetMode(null); }}
  />
)}
```

**Проверить что PlasmidViewer footer «Мутагенез»** устанавливает оба: `setWizardPlasmid(viewerPart)` + `setWizardPresetMode('mutate')` + `setShowMutagenesis(true)`.

### 6. V11: Tm расчёт в `makeKLDStrategy`

**Файл:** `gui/designer/src/mutagenesis.js`

Уже импортируется `calcTmNN` на строке 5. Заменить плейсхолдеры в primer-объектах:

```js
// Before:
tmBinding: 0, tmFull: 0, gcPercent: 0, length: fwdSeq.length, direction: 'forward'

// After:
tmBinding: Math.round(calcTmNN(fwdSeq)),
tmFull: Math.round(calcTmNN(fwdSeq)),  // full === binding для KLD (нет tail)
gcPercent: Math.round(100 * (fwdSeq.match(/[GC]/g)?.length || 0) / fwdSeq.length),
length: fwdSeq.length,
direction: 'forward'
```

То же для revSeq. Обновить тест `mutagenesis.test.js` который проверял `tmBinding: 0` (теперь проверяем `tmBinding > 0`).

---

## Scope

**IN:**
- Новый `editHistory` механизм (минимально): поле в fragment, writer в simple-edit ветке handleSaveFragment, ничего больше
- Mode switcher в FragmentEditor (Вариант C, радио-переключатель)
- Разделение `handleSave` в FragmentEditor на `handleSaveEdit` и `handleSaveMutagenesis`
- `chooseStrategy` + `computeMutagenesisStrategy` принимают `fragmentContext`
- `handleSaveFragment` передаёт `fragmentContext` в strategy engine
- `MutagenesisWizard` принимает initial* props и hydrate state при mount
- `App.jsx` прокидывает viewer plasmid в Wizard при presetMode='mutate'
- V11 Tm вычисление в makeKLDStrategy
- Обновление тестов под новые сигнатуры + новые integration-тесты

**OUT:**
- Полный audit `editHistory` (read/write/UI) — минимальный writer, read/UI в v1.1
- Переработка UI под mobile / tablet — не в scope
- UX-исследование «какой вариант дизайна Mode switcher удобнее» — решение C принято, не пересматриваем без veto Игоря
- V7 InsertionClock — это Sprint 2

---

## Шаги реализации

### Коммит 1 — V14 strategy context (2 часа)

**Файлы:** `src/mutagenesis.js`, `src/__tests__/mutagenesis.test.js`, `src/hooks/useFragmentHandlers.js`, `src/components/MutagenesisWizard.jsx`

1. [ ] `chooseStrategy(mutations, fragmentContext)` — расширить сигнатуру. Default context = `{ topology: 'circular', isStandalone: true }` для обратной совместимости.
2. [ ] `computeMutagenesisStrategy(templateSeq, mutations, options)` — принимать `options.fragmentContext`, прокидывать в chooseStrategy.
3. [ ] Тесты `mutagenesis.test.js`:
   - [ ] `chooseStrategy([mut], { topology: 'linear' })` → `'two_fragment'`
   - [ ] `chooseStrategy([mut1, mut2_close], { topology: 'linear' })` → `'two_fragment'` (не kld)
   - [ ] `chooseStrategy([mut], { topology: 'circular', isStandalone: false })` → `'two_fragment'`
   - [ ] `chooseStrategy([mut], { topology: 'circular', isStandalone: true })` → `'kld'` (regression)
   - [ ] Default fragmentContext — обратная совместимость (все существующие тесты проходят).
4. [ ] `handleSaveFragment` в `useFragmentHandlers.js` — собирать `fragmentContext` из `active.circular`, `fragments.length`, `original.sequence.length`, передавать в `computeMutagenesisStrategy`.
5. [ ] `MutagenesisWizard.jsx::compute()` — явно передавать `fragmentContext: { topology: 'circular', isStandalone: true, length }`.
6. [ ] Regression: все существующие тесты стратегии / payload / handleMutagenesis / handleSaveFragment — green.
7. [ ] `npx vitest run && npx vite build` — green.
8. [ ] `git commit -m "fix(v14): chooseStrategy respects fragment topology and isStandalone context"`

**Ожидаемый rise тестов:** +5.

**Важный edge case для теста вручную:** после этого коммита мутация на линейном CmR (как в приёмке Sprint 1) должна давать split на два фрагмента вместо KLD.

### Коммит 2 — V12 FragmentEditor Mode switcher (3 часа)

**Файлы:** `src/components/FragmentEditor.jsx`, `src/__tests__/FragmentEditor.test.jsx` (создать если нет)

1. [ ] В `FragmentEditor`: добавить state `mode: 'edit' | 'mutagenesis'` (default: 'edit').
2. [ ] Рендер: radio-переключатель **над** tabs (не заменяет tabs, они остаются для DNA/Protein/Regions).
3. [ ] При переключении mode — если `mutations.length > 0`, confirm: «Отменить N накопленных мутаций?». Если confirm — clear mutations. Если cancel — не переключаемся.
4. [ ] `mode === 'edit'` поведение:
   - Клик по нуклеотиду → inline input (заменить на A/T/G/C)
   - Клик по аминокислоте → **отключён** (пустой onClick или visually disabled)
   - Popup'ы мутации (DNA + AA) — не рендерятся
   - Quick actions — активны
   - Кнопка сохранения: `💾 Сохранить`
   - Цвет кнопки: blue (существующий)
5. [ ] `mode === 'mutagenesis'` поведение:
   - Клик по нуклеотиду → popup DNA-mutation (как сейчас)
   - Клик по аминокислоте → popup AA-mutation (как сейчас)
   - Quick actions — disabled (grey out) или скрыты
   - Кнопка сохранения: `🧬 Применить мутагенез (N)`, disabled при `mutations.length === 0`
   - Цвет кнопки: purple (существующий)
6. [ ] Разделение `handleSave`:
   ```js
   const handleSaveEdit = () => {
     persistDomains(...);
     const editEntry = { timestamp: Date.now(), oldSeq: fragment.sequence, newSeq: seq };
     onSave({
       ...fragment, sequence: seq, length: seq.length, domains, annotations,
       customColor: customColor || undefined,
       editHistory: [...(fragment.editHistory || []), editEntry],
       editedAt: new Date().toISOString(),
       // БЕЗ mutations — это не мутагенез
     });
     onClose();
   };
   const handleSaveMutagenesis = () => {
     persistDomains(...);
     const mutLabels = mutations.map(m => m.label).join(',');
     const name = mutations.length > 0 ? `${fragment.name}(${mutLabels})` : fragment.name;
     onSave({
       ...fragment, name, sequence: seq, length: seq.length, domains, annotations,
       customColor: customColor || undefined,
       mutations: mutations.length > 0 ? [...(fragment.mutations || []), ...mutations] : fragment.mutations,
       editedAt: new Date().toISOString(),
     });
     onClose();
   };
   ```
7. [ ] Вкладки удалить `tab === 'mutagenesis'` — теперь это Mode, не Tab. `tab` оставить для DNA/Protein/Regions переключения внутри обоих режимов.
   - Альтернатива если трогать tabs страшно: сохранить `tab === 'edit'` / `tab === 'mutagenesis'` как историческое имя, но добавить Mode параллельно. Менее чисто, но меньше регрессий.
8. [ ] Tests (integration через `@testing-library/react`):
   - [ ] `mode='edit'` + клик по нуклеотиду → input появился, нет popup
   - [ ] `mode='edit'` + клик по AA → ничего не происходит (нет popup)
   - [ ] `mode='mutagenesis'` + клик по нуклеотиду → popup DNA-mutation появился
   - [ ] `mode='edit'` → Save → onSave вызван БЕЗ mutations
   - [ ] `mode='mutagenesis'` + 2 мутации → Save → onSave вызван с mutations.length === 2
   - [ ] Переключение mode при mutations.length > 0 → confirm → clear
9. [ ] `npx vitest run && npx vite build` — green.
10. [ ] **Визуальная проверка Игорем** (обязательно до коммита): mode switcher работает визуально; текст подсказок в обеих режимах читаем; quick actions отключаются корректно.
11. [ ] `git commit -m "feat(v12): FragmentEditor mode switcher separates edit from mutagenesis"`

**Ожидаемый rise тестов:** +6.

### Коммит 3 — V13 PlasmidViewer → Wizard template passthrough (1 час)

**Файлы:** `src/components/MutagenesisWizard.jsx`, `src/App.jsx`

1. [ ] `MutagenesisWizard` — добавить props `initialTemplateSeq`, `initialTemplateName`, `initialOrganism`, `initialCdsStart`, `initialCdsEnd`. В useState инициализация из этих props, `step` = 2 если `initialTemplateSeq` задан.
2. [ ] В `App.jsx`: при рендере `<MutagenesisWizard>` — если `wizardPresetMode === 'mutate'` и `wizardPlasmid`, прокинуть props.
3. [ ] Проверить PlasmidViewer footer Мутагенез — он уже должен вызывать `onOpenWizard('mutate', part)` или аналог. Если нет — допилить: `setWizardPlasmid(part)` + `setWizardPresetMode('mutate')` + `setShowMutagenesis(true)`.
4. [ ] Tests:
   - [ ] `<MutagenesisWizard initialTemplateSeq="ATGAAA..." initialTemplateName="AmpR" />` → рендерится на Step 2 с заполненными полями.
   - [ ] Без init props — рендерится на Step 1 (regression).
5. [ ] **Визуальная проверка Игорем:** каталог → pET-28a → Просмотреть → в footer клик Мутагенез → Wizard открыт на Step 2 с pET-28a как template, имя pET-28a, sequence заполнена.
6. [ ] `npx vitest run && npx vite build` — green.
7. [ ] `git commit -m "fix(v13): PlasmidViewer mutate button passes template to MutagenesisWizard"`

**Ожидаемый rise тестов:** +2.

### Коммит 4 — V11 KLD Tm calculation (30 мин)

**Файлы:** `src/mutagenesis.js`, `src/__tests__/mutagenesis.test.js`

1. [ ] В `makeKLDStrategy` (строки ~122–135): заменить хардкод `tmBinding: 0, tmFull: 0, gcPercent: 0` на вычисление через `calcTmNN` (уже импортирован) и GC-regex для fwdSeq и revSeq.
2. [ ] Обновить соответствующий тест (если был с `expect(primer.tmBinding).toBe(0)` — заменить на `toBeGreaterThan(0)`).
3. [ ] Новый тест: «KLD primers for E245A → tmBinding > 50°C и < 80°C», «gcPercent between 0 и 100 и > 0 для ненулевого sequence».
4. [ ] `npx vitest run && npx vite build` — green.
5. [ ] **Визуальная проверка Игорем:** сделать KLD мутагенез → в primer panel TM BIND показывает реальные температуры (не 0°C) → в протоколе annealTemp корректный (55–65°C обычно).
6. [ ] `git commit -m "fix(v11): KLD primers report real Tm and GC% instead of placeholder zeros"`

**Ожидаемый rise тестов:** +2.

### После всех коммитов

- [ ] Обновить `BUGS.md`: V11, V12, V13, V14 из OPEN → FIXED с датой 20–21.04.2026.
- [ ] Обновить `PROJECT_STATE.md`: журнал Sprint 1.5 сессии.
- [ ] Обновить `DECISIONS.md`: архитектурные решения 1–6 из этой спеки (особенно (1) Mode switcher Вариант C, (2) fragmentContext в chooseStrategy, (3) editHistory как минимальный writer).
- [ ] В `CURRENT_TASK.md` ставить `✅ РЕАЛИЗОВАНО 20–21.04.2026`.
- [ ] Переместить эту спеку в `docs/archive/` после подтверждения Игорем.

---

## Визуальная приёмка Sprint 1.5

Пять обязательных проверок. Без скринов — Sprint 2 не начинается.

### V14 проверка — linear fragment → two_fragment split

1. Пустой canvas → Gibson/Overlap сборка → собрать сборку из 3 фрагментов (например из палитры: AmpR + CmR + KanR).
2. Дождаться auto-design overlap-праймеров.
3. Двойной клик на **средний** фрагмент (CmR) → FragmentEditor.
4. Переключиться в Mode=мутагенез.
5. Кликнуть на одну аминокислоту в середине CmR → заменить на A.
6. Применить мутагенез.
7. **Ожидание:** CmR разрезался на 2 фрагмента (`CmR_1` + `CmR_2`), между ними новый overlap-стык с indicator мутации. В primer panel количество олигов выросло (были 6, стало 8 — 2 новых для split'а).
8. **До V14 фикса** было: CmR остался одним фрагментом, 2 мутагенезных KLD-олига добавились к сборке (бессмысленно биологически).

### V12 проверка — Mode switcher разделение

1. Пустой canvas → каталог → любая плазмида → Как backbone (single fragment, circular).
2. Двойной клик → FragmentEditor.
3. **Mode=edit** (default).
4. Клик по аминокислоте → **ничего не происходит** (popup не появляется).
5. Клик по нуклеотиду → появляется inline input `A/T/G/C`, выбираю T → замена применилась без добавления в mutations.
6. Сохранить → на canvas фрагмент с обновлённой sequence, **без метки мутации** в заголовке, **без** мутагенезных олигов в panel.
7. Снова двойной клик → переключаюсь на Mode=mutagenesis.
8. Клик по аминокислоте → popup появился, выбрал замену.
9. Применить мутагенез → на canvas метка `(E245A)` в заголовке фрагмента, 2 мутагенезных олига в panel, KLD-протокол.

### V13 проверка — Wizard template из PlasmidViewer

1. Пустой canvas → каталог → pET-28a → Посмотреть (модалка PlasmidViewer).
2. В footer модалки клик «Мутагенез».
3. **Ожидание:** MutagenesisWizard открылся **на Step 2 Define Mutations**, template pre-filled (видна sequence в поле, видно имя pET-28a, organism E. coli).
4. Добавить мутацию → Compute → Apply → на canvas появляется фрагмент с мутацией + олиги.
5. **До V13 фикса** было: Wizard открылся на Step 1 Select Template, пустой, пользователь должен был выбрать заново.

### V11 проверка — KLD Tm real

1. Мутагенез любым путём (Wizard или in-place на circular standalone).
2. Получить 2 KLD-олига.
3. В primer panel колонка **TM BIND** показывает реальные температуры (55–65°C обычно), НЕ 0°C.
4. Колонка **GC%** показывает реальный процент (30–70% обычно), НЕ 0%.
5. Кликнуть «Протокол» → шаг PCR имеет `annealTemp` соответствующий min(fwdTm, revTm), НЕ 0°C.

### Комплексный тест — все четыре бага вместе

1. Каталог → pET-28a → Просмотреть → footer Мутагенез (V13 check).
2. Wizard открыт на Step 2 с pET-28a template (V13).
3. Добавить одну мутацию → Compute → strategy = KLD (V14: circular+standalone, корректно).
4. Apply → на canvas 1 фрагмент + 2 олига с РЕАЛЬНЫМИ Tm (V11).
5. Двойной клик на фрагмент → FragmentEditor, Mode=edit default (V12).
6. Клик по AA → ничего, клик по нуклеотиду → inline edit → поправил букву → Сохранить → не мутация, просто правка.
7. Снова двойной клик → Mode=mutagenesis → применил ещё одну мутацию → Apply → strategy KLD (это всё ещё single circular), новые олиги → у каждого Tm реальный.
8. Всё работает последовательно.

---

## Открытые вопросы — спросить Chat до реализации

1. **`editHistory` поле — храним в store или in-memory?** Предлагаю в store persisted (полезно для аудита), но если влияет на store migration v7→v8 (добавление поля) — может быть v1.1 перенести. Chat рекомендация: minimal writer сейчас (добавить поле без миграции — legacy фрагменты просто не имеют editHistory, это ок), full read/UI в v1.1.

2. **Mode switcher confirm при переключении с mutations** — через `confirm()` (нативный браузерный) или через кастомный модал? Нативный проще, кастомный консистентнее с остальным UI. Решение: нативный `confirm()` для Sprint 1.5, кастомный в v1.1 если будет раздражать.

3. **Quick actions в mode=mutagenesis — отключать или скрывать?** Отключение (grey out) информативнее — пользователь видит что они существуют но недоступны в этом режиме. Скрытие — чище визуально. Предлагаю отключение с tooltip «Доступно только в режиме Правки».

4. **V14: что делать с circular+non-standalone?** Если на canvas несколько фрагментов и один из них помечен circular (редкий edge case в BodgeGene) — как обрабатывать? Предлагаю трактовать как `isStandalone=false` (не KLD), потому что circular обычно означает завершённую плазмиду как product. Но это edge case, возможно просто протестировать и если нет реальных юзкейсов — не усложнять.

5. **V13: MutagenesisWizard должен ли разрешать редактирование initial template?** Если пришёл template из PlasmidViewer — можно ли его менять в Wizard textarea? Предлагаю да (пользователь может передумать и вставить другую плазмиду). Простой approach: initial-value fill state, state мутабелен.

---

## Команда для Claude Code на старт Sprint 1.5

> Прочитай CLAUDE.md, BUGS.md, docs/SPRINT_1_5_MUTAGENESIS_V2.md (эту спеку целиком), последние архитектурные решения из DECISIONS.md и журнал последней сессии в PROJECT_STATE.md.
>
> Sprint 1.5 — исправление трёх архитектурных и одного data-бага мутагенеза, найденных визуальной приёмкой Sprint 1. 4 коммита, ~6-8 часов.
>
> Начни с Коммита 1 (V14 fragmentContext) — это блокер для остальных. После него — короткий отчёт Chat с результатом теста «mutation on linear fragment in Gibson assembly gives two_fragment split».
>
> ВАЖНО: перед Коммитом 2 (Mode switcher) обязательно визуальная проверка Игорем на его экране (UI меняется сильно, боты могут сделать страшное). Не коммить Коммит 2 без визуального подтверждения Игоря.
>
> TDD как обычно. Баги из BUGS.md → FIXED по мере закрытия.

---

**Конец спеки.**

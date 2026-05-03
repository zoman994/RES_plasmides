# FUTURE_CLEANUP.md — Архитектурный долг на потом

**Статус (на 26.04.2026):** 📋 INBOX — референсный документ для планирования v1.0 публикации и v1.1 рефакторинга. Примарный реестр технодолга — `TECH_DEBT.md` в корне репо (выделен из CHAT_PLAYBOOK.md §10 после 21.04.2026); этот файл хранит развёрнутые планы с код-примерами для пунктов, которые не влезают в компактный TECH_DEBT.md.

**Актуальность пунктов (на 26.04.2026):**
- **B1 Консолидация палитр** — частично закрыт Sprint Map-WS-1-fix (`feature-palette.js` 21.04.2026 как ⚓ контракт цветов regions); остаётся живым риском в `theme.js::FEATURE_COLORS`, `auto-annotate.js::ANNOTATION_COLORS`, `domain-detection.js::DOMAIN_COLORS`, `AddFragmentModal::COLORS` — 4 источника всё ещё живы. **Актуально** для UX-1 series.
- **B2 Аудит api.js и опциональность бэкенда** — **актуально** для v1.0 публикации (Docker Compose решение).
- **B3 i18n.js аудит** — **актуально** для v1.0 публикации.
- **C1 Primer derivation императив → селектор** — **актуально** для v1.1, разовое решение для V4-A guard / P1v2 / Plasmid-Git workflow rewire.
- **C2 Консолидация sequence-компонентов** — **актуально** для v1.1.
- **C3 App.jsx декомпозиция** — входит в TECH_DEBT.md `TD-SIZE-APP` (Sprint 2b, плановый). Этот пункт в FUTURE_CLEANUP.md — superseded.
- **C4 Protocol AST** — **актуально** для v1.0/v1.1, большой план. Окно в спеке «Sprint 1.7» — историческое; Sprint 1.7 уже сделан 22.04.2026 без этого пункта. План остаётся валидным как backlog для Sprint X+2 или позже.
- Низкоприоритетные мелочи (PCR_MIXES unused, primer-reuse buildOrderSheet, pvcs-collections cleanup) — актуальны.

**Архивировано 26.04.2026** в рамках финализации цикла Sprint X cycle (docs/ cleanup). Первый опыт использования этого файла — при планировании v1.0 publication или v1.1 refactoring sprint, Chat проверяет этот файл и выбирает пункты для спринта.

---

# FUTURE_CLEANUP.md — Архитектурный долг на потом

**Статус:** 📋 INBOX — не для выполнения сейчас
**Автор:** Claude Chat, 21.04.2026 (по итогам архитектурного аудита)
**Не является спекой.** Это инвентаризация известного tech-долга, чтобы он не терялся и чтобы при будущих сессиях было куда смотреть.

Порядок — по ожидаемой ценности / риску. Самое полезное и безопасное сверху.

---

## B1. Консолидация цветовых палитр

**Масштаб:** средний. **Риск:** средний (видимые изменения). **Когда делать:** перед публикацией, отдельным UX-спринтом.

### Проблема

В кодобазе **четыре независимых источника цветов** для одних и тех же типов аннотаций:

| Источник | Файл | Пример (CDS / promoter / terminator) |
|---|---|---|
| `FEATURE_COLORS` | `theme.js` | `#56B4E9` / `#009E73` / `#D55E00` (Okabe-Ito) |
| `ANNOTATION_COLORS` | `auto-annotate.js` | `#3B82F6` / `#22C55E` / `#F97316` (Tailwind) |
| `DOMAIN_COLORS` | `domain-detection.js` | только для доменов, отдельный набор |
| `COLORS` (локальный) | `AddFragmentModal.jsx` строки ~23–26 | `#F5A623` / `#B0B0B0` / `#CC0000` |

Плюс `pvcs-custom-part-types` в localStorage (пользовательские кастомы) и `darken()` в theme.js как независимый способ модификации.

### Видимая симптоматика

Один и тот же CDS рендерится:
- в PartsPalette / PartsLibrary — голубой `#56B4E9`
- в SequencePreview / PlasmidVersionTree / exports — синий `#3B82F6`
- в AddFragmentModal «Extract from Construct» — оранжевый `#F5A623`

На плазмидах с большим числом аннотаций (pDHG25, pUC118) несоответствие заметно пользователю.

### Куда целиться

Единый источник в `theme.js`:
- `FEATURE_COLORS` становится caноническим
- `ANNOTATION_COLORS` удаляется, импортёры переключаются на `FEATURE_COLORS` (+ при необходимости расширить его недостающими ключами из ANNOTATION_COLORS)
- `COLORS` в AddFragmentModal удаляется
- `DOMAIN_COLORS` умирает естественно, когда и если уберётся CDSEditor/autoDetectDomains

### Затронуто файлов

Основные потребители (грубый список):
- `components/SequencePreview.jsx`
- `components/PlasmidVersionTree.jsx`
- `components/AnnotationEditor.jsx`
- `components/SequenceViewer.jsx`
- `exports.js`

Перед началом — grep по всем обращениям к `ANNOTATION_COLORS` и `FEATURE_COLORS` + сверка ключей (какие есть здесь, которых нет там). Возможно потребуется добавить в `FEATURE_COLORS` ключи: `mRNA`, `tRNA`, `rRNA`, `oriT`, `repeat_region`, `mobile_element`, `D-loop`, `mat_peptide`, `transit_peptide`, `motif`, `region`, `unsure`, `stem_loop`, `modified_base`, `variation` — всё из ANNOTATION_COLORS после Этапа 1.2.

### Риски

- Регрессии: существующие snapshot-тесты могут зафиксировать старые цвета. Решение: обновить baseline, проверить визуально на 3–5 реальных плазмидах.
- Пользовательские `pvcs-custom-part-types` в localStorage — не ломаются (это пользовательский ввод, не системные цвета).

### Оценка

~4–6 часов, 1 коммит. Тестов добавить: 1 snapshot-check на согласованность палитр.

---

## B2. Аудит api.js и опциональность бэкенда

**Масштаб:** маленький. **Риск:** требует решения Игоря. **Когда делать:** до публикации, как часть решения о deploy-модели.

### Проблема

В `gui/designer/src/api.js` есть эндпоинты, которых никто не зовёт:

| Функция | Вызывается? |
|---|---|
| `fetchParts` | Да, `App.jsx` на mount |
| `fetchConstructs` | Только в `AddFragmentModal` mode='construct' (ветка «извлечь из конструкта») |
| `fetchFeatures` | Только в `AddFragmentModal` mode='construct' |
| `designPrimers` | Только в `useGeneratePrimers` — API-path («🔄 Пересчитать (API)»), клиентский дизайн идёт через `local-primer-design.js` |
| `validateGoldenGate` | Никто |
| `calcTm` | Никто. Клиент через `tm-calculator.js::calcTmNN` |

Плюс в `exports.js::saveToPVCS` — `fetch('/api/assembly/create')` — тоже никем не вызывается.

### Вопрос

Нужен ли Python-бэкенд в деплое:

- **Вариант A.** Backend только для `.dna` import через `snapgene_parser.py` (на него указывает `file-import.js`). Всё остальное клиентское. Тогда `validateGoldenGate`, `calcTm`, `saveToPVCS`, `fetchConstructs`, `fetchFeatures` — удалить. `designPrimers` (API-path) — удалить из `useGeneratePrimers`, оставить только локальный `designPrimersLocal`. Кнопка «🔄 Пересчитать (API)» снять.
- **Вариант B.** Backend поднят всегда и планируется использовать — ничего не трогать, но для публикации/Docker нужно документировать какие endpoints действительно нужны в runtime.

### Side-эффект от выбора A

Упрощается Docker Compose: фронт статический, backend только `POST /api/import/dna`. Меньше поверхности для ошибок в статье.

### Оценка

Вариант A — ~2 часа (удаление + снятие кнопки). Вариант B — 0, документирование в README.

---

## B3. i18n.js — аудит unused keys

**Масштаб:** маленький. **Риск:** нулевой. **Когда делать:** перед публикацией.

### Проблема

`i18n.js` ~800 строк, две раскладки (en/ru). Обе поддерживаются через `t(key)`. Но:

- UI-переключателя языка в коде не нашёл (нет компонента, зовущего `setLang`).
- `currentLang = 'ru'` хардкодом.
- Половина ключей не используется в живом коде — накопилось за сессии добавления/удаления компонентов.

### Подход

```bash
# 1. Собрать все ключи из i18n.js (первая половина — TRANSLATIONS.en.*)
# 2. Для каждого ключа:
grep -rn "t('<key>')" src/ || echo "UNUSED: <key>"
# 3. Удалить unused из обеих раскладок.
```

### Побочный вопрос

Нужна ли двуязычность в публикации v1.0? Если нет — можно удалить английскую раскладку и инлайнить русские строки (убрать `t()` из кода). Это ~день работы и спорно — оставляю на решение Игоря.

### Оценка

Аудит — 2 часа. Удаление — 1–2 часа. Снятие `t()` если решат — отдельно, не в этой задаче.

---

## C1. Primer derivation — императивный push → селектор

**Масштаб:** большой. **Риск:** средний (много тестов). **Когда делать:** v1.1, после публикации.

Это уже зафиксировано в DECISIONS (18.04.2026) как «Derived primers vs imperative push отложено до v1.1». Здесь дублирую для полноты, чтобы не потерялось.

### Проблема

`App.jsx:auto-design useEffect` проверяет `p.isMutagenesis` флаги, чтобы НЕ затереть мутагенезные праймеры стандартным auto-design. Это workaround, не архитектура:

- Любая новая категория праймеров потребует нового флага (`isCustom`, `isVerification`, `isSequencing` — уже намекают).
- `updateActive({ primers: [], ... })` разбросан по 8+ местам: `handleSaveFragment`, `handleMutagenesis`, `clearAssembly`, `completeAssembly`, else-ветка auto-design (P1v2 fix), `generate()` (API-path).
- V4-A guard (Sprint 1) накладывается поверх P1v2 else-ветки (Блок 11b) — два разных случая «не-затирать» в одном useEffect.

### Цель

`primers` — производная от `(fragments, junctions, circular, mutagenesisOverrides)`:

```js
const primers = useMemo(
  () => derivePrimers(fragments, junctions, circular, active?.mutagenesisOverrides),
  [fragments, junctions, circular, active?.mutagenesisOverrides]
);
```

Overrides хранятся явно в `assembly.mutagenesisOverrides` как структура, а не размазаны через флаги на отдельных праймерах.

### Оценка

~1 неделя, ~30% тестов трогается, риск регрессии средний. Делать после публикации.

---

## C2. Консолидация sequence-компонентов

**Масштаб:** большой. **Риск:** высокий. **Когда делать:** v1.1, осторожно.

В репо три живых компонента для отображения последовательности:

| Файл | Назначение |
|---|---|
| `SequencePreview.jsx` (~404 строки) | Read-only + аннотации + AA + introns. Используется в AddFragmentModal, PlasmidViewer |
| `SequenceMapView.jsx` | Двуцепочечный + primers + RE sites + selection. Используется в DesignCanvas (sequence view mode) |
| `SequenceViewer.jsx` | Per-fragment colored strand для assembly tab |

Примерно 50% общей логики (line-wrapping, codon translation, annotation overlay) дублируется. Но разные роли и разная интерактивность.

### Цель v1.1

Единый `<SequenceDisplay mode="preview|map|fragment" {...props}>` с конфигурацией по пропсам. Это архитектурный рефакторинг уровня 1-2 недели работы + тщательное визуальное тестирование на 10+ реальных плазмидах.

### Почему не сейчас

- Работает.
- Риск сломать визуально без очевидной выгоды для пользователя.
- Перед публикацией куда важнее закрыть открытые баги (V1/V2/V6/V7/V8 и т.д.), чем рефакторить визуально-стабильные компоненты.

---

## C3. App.jsx декомпозиция

Уже в DECISIONS (18.04.2026). Здесь упомянуто для полноты.

`App.jsx` ~37KB, 14 modals mount inline, useEffect auto-design с двумя ветками-гардами. Декомпозиция:

- Вынести модалы в `<ModalStack>`
- Вынести useEffect-ы в `useAppEffects` hook
- Разделить header/breadcrumb/tabs на подкомпоненты

Оценка: ~3 дня. После публикации, вместе с C1.

---

## C4. Protocol AST — плоский `protocolSteps[]` → дерево с зависимостями

**Масштаб:** большой. **Риск:** средний (много тестов, но backward-compat через `flattenToSteps`). **Когда делать:** Sprint 1.7 — сразу после Sprint 1.6 и Sprint 2, перед публикацией. Автор идеи: Игорь, обсуждено Chat 21.04.2026.

### Проблема

Сейчас `useGeneratePrimers.buildProtocolSteps` генерит плоский массив:

```js
protocolSteps = [
  {id:'pcr_0', type:'pcr', title:'ПЦР X'},
  {id:'pcr_1', type:'pcr', title:'ПЦР Y'},
  {id:'assembly', type:'assembly', title:'Gibson'},
  {id:'transform', ...}, {id:'screening', ...}, {id:'sequencing', ...}
]
```

Минусы копятся с усложнением сборок:

1. **Порядок держится на хрупкой договорённости** — никакой явной ссылки «assembly зависит от pcr_0, pcr_1».
2. **Multi-round Gibson неотличим от единственного раунда** — `overlap_0, overlap_1, overlap_final` в одном списке равноправно.
3. **Параллелизм не выражен** — 4 PCR, которые можно ставить параллельно в одном термоциклере, идут как 4 отдельных шага.
4. **Split-группа из Sprint 1.6 не видна в протоколе** — на canvas пользователь видит визуальную группировку HygroR_1+HygroR_2, в steps — три независимых шага.
5. **Финализация (transform+screening+seq) прибита к концу хардкодом** — нельзя вставить промежуточную трансформацию в сложной сборке.

### Цель

Протокол как дерево (AST). Нода = биологическая операция. Дети выполняются до родителя (post-order traversal). Сиблинги параллельно-безопасны.

Пример — split-мутагенез из Sprint 1.6:

```
Sequencing
└── Screening
    └── Transform
        └── Gibson(EGFP + HygroR_mutated)
            ├── PCR(EGFP)
            └── OverlapPCR(HygroR_mutated)   ← split-группа = «скобки»
                ├── PCR(HygroR_1)
                └── PCR(HygroR_2)
```

Алгебраически: `Transform ∘ Gibson(EGFP ⊕ (HygroR_1 ⊕_mut HygroR_2))`.

Скобки = split-группа на canvas. Это **одна структура на двух экранах**.

### Примеры покрытия типовых workflow'ов

**Golden Gate 3 фрагмента (один enzyme):**
```
Transform ∘ GG_BsaI(P1 ⊕ CDS ⊕ T1)
```
— assembly-нода имеет 3 детей, все параллельны в термоциклере.

**KLD (унарная операция):**
```
Transform ∘ KLD(PCR_whole(pET-23a))
```
— дерево почти плоское, но тип унарный (не `⊕`).

**Hybrid multi-round (5 фрагментов, maxFinalParts=3, +RE-backbone):**
```
Transform ∘ Gibson( (A ⊕ B) ⊕ (C ⊕ D) ⊕ RE(Backbone, EcoRI+BamHI) )
```
— три уровня скобок, три параллельных поддерева.

### Типы нод

```js
export const NODE_TYPES = {
  PCR: 'pcr',           // leaf, бинарная полимераза
  OVERLAP_PCR: 'overlap_pcr',  // ⊕ — overlap-fusion group
  GIBSON: 'gibson',     // ⋈ — Gibson assembly
  GOLDEN_GATE: 'golden_gate', // Type IIS reaction
  DIGEST: 'digest',     // unary
  LIGATION: 'ligation',
  RE_LIGATION: 're_ligation',
  KLD: 'kld',           // unary
  TRANSFORM: 'transform',
  SCREENING: 'screening',
  SEQUENCING: 'sequencing',
};
```

Каждая нода:
```ts
interface ProtocolNode {
  id: string;
  type: NodeType;
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';
  children: ProtocolNode[];
  parentId?: string;
  payload: { /* type-specific */ };
  timing?: { setupMin: number; runMin: number; };
  dependencies?: string[]; // явные, для сложных случаев
}
```

### План реализации

**Шаг 1.** Новый `src/protocol-ast.js`: типы, `createNode`, `buildAssemblyTree`, `wrapWithFinalization`, `flattenToSteps`.

**Шаг 2.** `buildAssemblyTree(fragments, junctions, circular, options)`:
- Листья = PCR на каждый `needsAmplification !== false` фрагмент.
- Группировка по `splitGroupId` (из Sprint 1.6) → OverlapPCR ноды.
- По типам junctions (`deriveAssemblyType`) → final assembly нода.

**Шаг 3.** `flattenToSteps(tree)` — DFS post-order + flatten + `depth` поле. Backward compat: `ProtocolTracker` подхватывает `depth` для отступов, не требует переписывания.

**Шаг 4.** `useGeneratePrimers.buildProtocolSteps` переписать: сначала AST, потом flatten. Сохранить exactly тот же API наружу.

**Шаг 5.** В v1.2 (не сейчас) — новый `<ProtocolTree>` с раскрытием/сворачиванием поддеревьев. Но flat+depth уже даёт 80% ценности.

### Ценность

1. **Canvas ↔ Protocol synchronized** — splitGroupId → OverlapPCR нода. Одна структура на двух экранах.
2. **Экспорт для статьи** — AST → LaTeX-like `Gibson(EGFP \oplus (HygroR_1 \oplus_{E245A} HygroR_2))`. Можно в Methods.
3. **Точный timing** — дерево знает параллелизм, текущий список считает время линейно.
4. **Post-assembly чистка** — по дереву можно выбрать поддерево для экспорта/удаления/пересоздания.
5. **Validation** — статические проверки до запуска: «у ноды X не хватает праймеров», «children Y не все PCR — Digest среди них, проверьте».

### Что это НЕ даёт

- Не помогает в UX мутагенеза (его Sprint 1.6 закрывает).
- Не упрощает отладку — дерево сложнее списка.
- Не решает "где делать мутацию в backbone" — это V7 InsertionClock (Sprint 2).
- Параллелизм не автоматический — нужна явная `ParallelGroup` нода или convention «сиблинги = параллельно» с guard'ами.

### Затронутые файлы

Основные:
- Новый `src/protocol-ast.js`
- `src/hooks/useGeneratePrimers.js::buildProtocolSteps` — переписать через AST
- `src/components/ProtocolTracker.jsx` — подхватить поле `depth` из flatten'а
- `src/exports.js::exportProtocol` — опционально использовать tree для вложенной нумерации `1.1.2`

Тесты: новый `src/__tests__/protocol-ast.test.js` — building tree, flatten, различные workflow types (KLD / GG / multi-round / split-мутагенез). ~25 тестов.

### Оценка

~3–4 дня работы, 3 коммита:
1. Core AST + builder + flatten + тесты (~1.5 дня).
2. Интеграция в useGeneratePrimers + backward compat тест (~1 день).
3. ProtocolTracker: рендер с отступами по depth (~0.5 дня).

### Риски

- Существующие тесты на `protocolSteps` могут ожидать точный order/id — обновить assertions, не менять смысл.
- При ошибке в дереве (циклы, отсутствующие children) — валидатор перед flatten'ом.

---

## Низкоприоритетные мелочи

### Неиспользуемый import

В `useFragmentHandlers.completeAssembly` импортируется `PCR_MIXES` из `protocol-data.js`, но не используется. Удалить при следующем касании файла.

### `primer-reuse.js::buildOrderSheet`

Экспортируется, но вызывается только через API-path в `useGeneratePrimers` (data.orderSheet из ответа API). Если пойдём по варианту A в пункте B2 — эта функция тоже dead. Пока оставить.

### `collections` в localStorage у существующих пользователей

После Cleanup-коммита 1–2 ключ `pvcs-collections` останется у тех, кто ставил приложение раньше. Занимает 2 байта (`[]`). Можно почистить в миграции store v7→v8, но это чистый косметический tech-debt — не трогать до следующей реальной миграции.

---

## Процесс добавления в этот файл

Если в ходе будущих сессий появляется «мы бы хотели это почистить, но не сейчас» — добавлять сюда с теми же полями:

- **Масштаб** (маленький / средний / большой)
- **Риск** (нулевой / средний / высокий)
- **Когда делать** (до публикации / v1.1 / неопределённо)
- **Проблема** (чем плохо сейчас)
- **Цель** (куда хотим прийти)
- **Оценка** (часы/дни работы)

Этот документ — контейнер для tech-долга, не план действий.

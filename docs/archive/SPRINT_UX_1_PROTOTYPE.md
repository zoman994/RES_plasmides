# Sprint UX-1 prototype

**Тип:** feature (prototype phase)
**База:** v0.5.1-alpha, коммит `8699bf5` (Sprint 2a.1 финал)
**Статус:** ✅ REVIEW PASS 23.04.2026 — палитра принята как актив, прототип удалён. Основа для серии Sprint UX-1 full — `docs/UX_1_PROTOTYPE_REVIEW.md`. Перемещён в архив 28.04.2026 в рамках accumulated debt ротации Sprint App-Decomp.
**Предпосылка:** раскатить новую палитру (paper/ink/семейство-based feature colors) на компоненты, которые сейчас используют legacy `theme.js` Okabe-Ito или произвольные Tailwind-цвета. Игорь выбрал prototype-first подход: сначала прототип на трёх поверхностях, полный UX-1 после review прототипа.

---

## 0. Срез размеров затрагиваемых модулей

Снимок `list_directory_with_sizes` по `gui/designer/src/components/` и `gui/designer/src/` — 23.04.2026.

| Файл | Размер | Лимит | Зона | Действие |
|------|--------|-------|------|----------|
| `src/main.jsx` | 1.40 KB | — | OK | правим (URL-switch + render Prototype) |
| `src/App.jsx` | **39.19 KB** | 40 KB | **soft (в 0.8 KB от hard)** | **не трогаем** |
| `src/feature-palette.js` | 3.54 KB | 25 KB | OK | возможно расширим экспорты |
| `src/theme.js` | 3.20 KB | 25 KB | OK, deprecating | не трогаем (остаётся для main flow) |
| `components/DesignCanvas.jsx` | 38.44 KB | 40 KB | **soft (близко к hard)** | **не трогаем**, используем через обёртку или fork Blocks-branch |
| `components/PlasmidViewer.jsx` | 20.12 KB | 40 KB | OK | не трогаем, используем через обёртку |
| `components/AnnotationEditor.jsx` | 15.09 KB | 40 KB | OK | не трогаем, используем через обёртку |
| `components/PartBlock.jsx` | 25.85 KB | 40 KB | OK | может потребоваться копия (см. §9 риск 1) |
| `components/JunctionBlock.jsx` | 29.23 KB | 40 KB | OK (soft warning 30 близко) | не трогаем |
| `src/sbol-glyphs.jsx` | 21.15 KB | — (jsx, но data-like) | OK | не трогаем в прототипе (§9 риск 3) |
| _новый_ `components/Prototype/index.jsx` | 0 → ~2 KB | 40 KB | OK | создаём |
| _новый_ `components/Prototype/CanvasBlocksView.jsx` | 0 → ~3–5 KB | 40 KB | OK | создаём |
| _новый_ `components/Prototype/PlasmidViewerWrapper.jsx` | 0 → ~2 KB | 40 KB | OK | создаём |
| _новый_ `components/Prototype/AnnotationEditorWrapper.jsx` | 0 → ~2 KB | 40 KB | OK | создаём |
| _новый_ `components/Prototype/prototype-tokens.css` | 0 → ~2 KB | — | OK | создаём |
| _новый_ `components/Prototype/fixture.js` | 0 → ~3 KB | — | OK | создаём |

**Риск-сигналы:** `App.jsx` на 39.19 KB (≈0.8 KB до hard) — **главный аргумент за вариант C** (URL-switch в main.jsx, App.jsx нетронут). Любая правка в `App.jsx` в рамках этого спринта запрещена (§3 OUT, §9 риск 4). `DesignCanvas.jsx` 38.44 KB — тоже не модифицируем; если проброс палитры через обёртку невозможен — fork Blocks-branch в `Prototype/CanvasBlocksViewFork.jsx` ≤5 KB (§9 риск 1).

---

## 0.5. Ответы Игоря на kickoff-интервью 23.04.2026

**Снимок ответов — не правится.** Уточнения в §0.6 и далее.

### Scope

- **Q:** UX-1 — один спринт или разбиваем на части?
  **A:** Сначала прототип на 1–2 экранах, потом решим полный scope. Prototype-first подход.

- **Q:** Legacy `theme.js` (Okabe-Ito) после UX-1: удалить / fallback / мигрировать custom types / оставить для Blocks?
  **A:** _Прямого ответа из 4 опций не было._ Вместо этого Игорь уточнил: PUNK-палитра отменена, решил делать удобный интерфейс, референс — `design_teasers/feature_palette.html` с семейство-based SnapGene-compliant палитрой. Для разных типов фичей — **оттенки в едином семейственном цвете**. Фактический ответ — доопределяется в fase 2 (после прототипа); направление: миграция на `feature-palette.js` V2 с унифицированным `featureColor(type, name)`.
  **Действие Chat 23.04.2026:** обновлён skill `design-system` — PUNK перенесён в teaser-only, добавлены 5 семейств цветов, `theme.js` отмечен как deprecating.

- **Q:** Эталон дизайна — какой из `design_teasers/*.html` ведущий?
  **A:** `feature_palette.html` — приоритет цветам, остальное по духу. `bodgegene_workspace.html` используется как референс layout/chrome.

### Prototype scope

- **Q:** На каких экранах делаем прототип?
  **A:** Canvas Blocks view + PlasmidViewer (блок просмотра плазмид) + одна модалка. Три поверхности, а не одна-две.

- **Q:** Прототип — что именно (HTML-mockup / React в main / изолированный React-экран)?
  **A:** Не определён — Игорь попросил Chat предложить. **Рекомендация Chat:** вариант C — изолированный React-экран по URL `/ux-prototype`, не в main flow. Обоснование зафиксировано в §4 ниже. Подтверждение — в §0.6 батч.

- **Q:** После прототипа — как продолжаем UX-1?
  **A:** Прототип мерджится → дальше итерации по 1–2 компонента за спринт (UX-1a, UX-1b, …). Не один большой спринт, а серия маленьких.

---

## 0.6. Pending — уточняющий батч (ожидает ответов)

_Два вопроса задано Chat'ом 23.04.2026, Игорь ушёл в compact до ответов. В следующей сессии: прочитать эту §0.6, задать Игорю те же вопросы, записать ответы как §0.5 продолжение (пометить «— ответ получен DD.MM.YYYY»)._

- **Q:** По рекомендации Chat на prototype-вариант: идём с C (изолированный React-экран), или всё же A (HTML-mockup) / B (feature flag в main)?
  **A:** **C — /ux-prototype изолированный React-экран** — ответ получен 23.04.2026.

- **Q:** Какая модалка в прототипе — AddFragmentModal / PlasmidUseWizard / ImportDecisionModal / AnnotationEditor?
  **A:** **AnnotationEditor** — ответ получен 23.04.2026.

### Router-check (первое непроверенное предположение §5, выполнено Chat 23.04.2026)

`src/main.jsx` (1.40 KB) прочитан целиком; `src/App.jsx` head 80 строк прочитан — **react-router-dom отсутствует** в проекте, импортов `Route`/`BrowserRouter`/`useRouter` нет. Это меняет scope §6: вместо добавления роутера делается lightweight **URL-param switch в `main.jsx`** (query string `?ux=prototype` → рендерим `<Prototype />` вместо `<App />`). Обоснование — §4 пункт 4. `App.jsx` в результате вообще не трогаем (дополнительная страховка от hard-лимита 40 KB).

---

## 0.7. Отложено на фазу 2 (полный UX-1, после review прототипа)

Не задавать до получения результата прототипа. Фиксирую, чтобы не потерять:

- Legacy `theme.js` судьба — полное удаление / fallback для custom types из localStorage / оставить для Blocks view / мигрировать custom types в V2
- `.bodgegene` проекты с кастомными цветами из localStorage — миграция / as-is / сброс?
- SnapGene native .dna colors при импорте — мапим в семейственную палитру или сохраняем source?
- Полная миграция `PartBlock` / `JunctionBlock` / `PlasmidViewer` / `CatalogPanel` / `AnnotationEditor` / `AddFragmentModal` / `PlasmidUseWizard` — один спринт или разбить на 3–4?
- Acceptance format — один скриншот всех режимов или покомпонентно?
- Tolerance к `design_teasers/*.html` — точное воспроизведение или «в духе»?

---

## 1. Контекст

BodgeGene сейчас живёт на двух сосуществующих feature-палитрах: `theme.js` (Okabe-Ito, 9 цветов, используется Canvas Blocks view и частью остальных компонентов) и `feature-palette.js` V2 (15 biological-feature семейств, warm desaturated pastel + `FEATURE_STROKE` `#3A2F1F`, применяется в `PlasmidMap` sub-arc + `SequencePane` background). Вторая сложилась в Sprint Map-WS-1 cycle (приёмка 21.04.2026, ⚓ DECISIONS.md) и прошла визуальную приёмку на pDHG25. До раскатки семейство-based палитры на остальные поверхности проекта нужен проверочный раунд: как V2 ведёт себя на малых chip-элементах `AnnotationEditor`, в `PlasmidViewer` region-selection, и на больших `PartBlock`/`JunctionBlock` Canvas Blocks view.

⚓ DECISIONS.md 23.04.2026 (prototype-first для крупных UX-спринтов, третья запись в секции «Процесс — Chat ↔ Code координация»): перед полной спекой UX-1 сделать прототип на 2–3 поверхностях на живых React-компонентах с живыми данными, Игорь проводит review, **и только после review** пишется полная спека UX-1 с миграцией `PartBlock`/`JunctionBlock`/`PlasmidViewer`/`CatalogPanel`/`AnnotationEditor`/`AddFragmentModal`/`PlasmidUseWizard`. Этот файл — спека самого прототипа, не полного UX-1.

См. §0.5 (ответы Игоря на kickoff batch 1) и §0.6 (batch 2: подтверждение варианта C + выбор AnnotationEditor третьей поверхностью + router-check). §0.7 — отложенное на фазу 2. Референсы дизайна: `design_teasers/feature_palette.html` (приоритет цветам) + `design_teasers/bodgegene_workspace.html` (chrome/layout референс). Полный UX-1 разбивается на серию маленьких спринтов UX-1a/b/c после review (§0.5 «После прототипа»).

---

## 2. Стратегия

Делаем изолированный React-экран, доступный по URL `?ux=prototype`, через минимальный switch в `src/main.jsx`: читаем `window.location.search`, если содержит `ux=prototype` — рендерим `<Prototype />`, иначе — существующий `<App />`. Внутри `<Prototype />` — layout с тремя поверхностями (Canvas Blocks view / PlasmidViewer / AnnotationEditor) в обёртках, которые реиспользуют существующие компоненты с пробросом семейство-based палитры из `feature-palette.js` (через prop, React context или минимальный fork-рендер — решается первым шагом каждого K). `theme.js` Okabe-Ito в main flow не трогаем — он остаётся до фазы 2 полного UX-1. Prototype работает на синтетической плазмиде-fixture с разнообразным набором аннотаций, покрывающим все 15 семейств палитры.

---

## 3. Scope

### IN

- `src/main.jsx` — добавить URL-param switch: `new URLSearchParams(window.location.search).get('ux') === 'prototype'` → render `<Prototype />`, иначе → `<App />`. Сохранить `<StrictMode>` + `<ErrorBoundary>` в обеих ветвях.
- `src/components/Prototype/index.jsx` — новый layout-компонент с тремя панелями (Canvas Blocks | PlasmidViewer | AnnotationEditor) + header с названием прототипа и fixture-info. Root class `.ux-prototype-root` для scoped CSS-переменных.
- `src/components/Prototype/CanvasBlocksView.jsx` — обёртка или fork (решение по итогам K2 первого шага) для Canvas Blocks view на fixture с цветами из `featureColor`.
- `src/components/Prototype/PlasmidViewerWrapper.jsx` — обёртка `PlasmidViewer` с пробросом семейство-based палитры в region-цвета.
- `src/components/Prototype/AnnotationEditorWrapper.jsx` — обёртка `AnnotationEditor` с пробросом палитры в annotation chips.
- `src/components/Prototype/prototype-tokens.css` — CSS-переменные paper/ink/accent из `design_teasers/bodgegene_workspace.html` (warm paper `#F8F5EE` background, warm-dark ink, terra cotta accent). Scope — только под `.ux-prototype-root`.
- `src/components/Prototype/fixture.js` — синтетическая плазмида ~4–6 kb с 15+ аннотациями, покрывающими все семейства `feature-palette.js` (CDS с подтипами resistance/reporter/his/tag/linker, promoter, terminator, origin, primer_bind, restriction_site, misc_feature, gene, repeat_region, polyA_signal, signal_peptide).
- `__tests__/prototype-scaffold.test.jsx` — +4–5 тестов (scaffold, canvas blocks rendered, viewer rendered, annotation editor rendered).

### OUT (явно отложено)

- Миграция существующих компонентов (`PartBlock` / `JunctionBlock` / `PlasmidViewer` / `AnnotationEditor` / прочие) — остаются на `theme.js` и произвольных Tailwind до фазы 2 (серия спринтов UX-1a/b/c после review).
- **Правка `App.jsx`, `DesignCanvas.jsx`, `PlasmidViewer.jsx`, `AnnotationEditor.jsx` — запрещена** в этом спринте. Обёртки читают существующие компоненты как чёрный ящик либо используют минимальный fork-рендер для частей, которые нельзя дотянуться через prop/context.
- SBOL-глифы в `AnnotationEditor` — оставляем на текущих цветах `sbol-glyphs.jsx` (см. V10 BUGS.md + §10 open question 3). В полный UX-1 — отдельная задача.
- Добавление `react-router-dom` — не надо, URL-switch в main.jsx делает это решение ненужным (§4 пункт 4).
- Acceptance UX-1 в целом — только review прототипа (визуальный, не formal visual acceptance по `docs/ACCEPTANCE_ALGORITHM.md`).
- Миграция `.bodgegene` проектов с кастомными цветами из localStorage, судьба `theme.js` (удалить / fallback / оставить), SnapGene native `.dna` color mapping при импорте — всё §0.7, фаза 2.
- Всё, не перечисленное в IN, **не трогаем** в этом спринте. Даже если «очевидно улучшает».

---

## 4. Архитектурные решения

1. **Prototype-first подход** — ⚓ DECISIONS.md 23.04.2026 (секция «Процесс — Chat ↔ Code координация», третья запись). Источник: §0.5 Q1 ответ Игоря. Для крупных UX-спринтов перед полной спекой — prototype round на узком скоупе, review, затем полная спека основана на итогах review. Паттерн совместим с `/feature-dev` Claude Code («PRDs are dead: prototypes replaced them»), адаптирован под dual-agent модель BodgeGene. Ортогонально kickoff-интервью (⚓ выше): интервью формирует scope прототипа, прототип формирует scope полного спринта.

2. **Вариант C — изолированный React-экран** (подтверждён §0.6 batch 2). Почему не HTML-mockup (A): `feature_palette.html` уже показал палитру статикой, нужен следующий уровень проверки — React с живыми данными. Почему не feature flag в main flow (B): усложняет cognitive load main flow и — критично — **`App.jsx` уже на 39.19 KB** (§0), добавление flag-ветки почти гарантированно пробивает hard 40 KB и тянет за собой декомпозицию в том же спринте.

3. **Три поверхности в прототипе: Canvas Blocks + PlasmidViewer + AnnotationEditor.** Три разных класса UI: рабочий canvas (большие элементы `PartBlock`/`JunctionBlock`), просмотровая поверхность (circular map + sequence view), модалка с chip-элементами. Покрывает большую часть UX-паттернов BodgeGene. Остальные компоненты (QuickStart, CatalogPanel, ActionBar, AddFragmentModal, PlasmidUseWizard, PartsPalette и пр.) проверяются итеративно в фазе 2 серией UX-1a/b/c.

4. **URL-param switch в `main.jsx`, без `react-router-dom`** (результат router-check §0.6 + §5). `main.jsx` (1.40 KB, тривиальный switch) проверяет `window.location.search` на `ux=prototype` и выбирает `<Prototype />` или `<App />`. Обоснование: (а) добавление `react-router-dom` — новая зависимость + изменения в `main.jsx` + возможно обёртка `<App />` в `<BrowserRouter>`, потенциально пробивает `App.jsx` через hard 40 KB (нарушает решение №2); (б) прототип запускается вручную по ссылке, SPA routing внутри прототипа не нужен; (в) удаление прототипа после review = revert `main.jsx` + удаление папки `components/Prototype/`, zero side effects на main flow.

---

## 5. Предположения

§0.5 kickoff-интервью + §0.6 batch 2 + router-check закрыли основные scope/UX/acceptance вопросы. В §5 остаётся короткий хвост про инварианты существующего кода (те, что не покрыты интервью и не проверены Chat'ом на старте этой сессии):

- **`feature-palette.js::featureColor(type, name)` покрывает все 15 типов из `fixture.js`.** Источник: K2 Map-WS-1-fix прошёл приёмку D2 PASS на pDHG25 (21.04.2026), ⚓ DECISIONS.md. Проверено частично: нужно составить fixture с каждым из 15 семейств, если какое-то не покрывается `featureColor` — либо расширить `featureColor`, либо дополнить fixture на существующие семейства. **Действие:** первый шаг K1 — составить fixture и прогнать через `featureColor` все 15 типов, убедиться что fallback `misc` не срабатывает на известные типы.
- **`AnnotationEditor.jsx` (15.09 KB) — chip-цвета приходят либо через props, либо hardcoded через `theme.js` импорт.** Источник: header AnnotationEditor в архитектурной памяти, детали props не проверены Chat'ом на старте. Проверено: **нет**. **Действие:** первый шаг K4 — прочитать импорты и props-signature `AnnotationEditor.jsx`; если `theme.js` зашит hardcoded — React context override в обёртке, либо минимальный fork chip-рендера в `AnnotationEditorWrapper.jsx`.
- **`PlasmidViewer.jsx` (20.12 KB) принимает region-селектор-callback + возможно цвет-resolver.** Источник: используется в Map-WS-1 cycle, `onSelectRegion` callback документирован в ⚓ DECISIONS.md 21.04.2026. Проверено частично: прямой проброс `featureColor` не факт что работает. **Действие:** первый шаг K3 — прочитать импорты `PlasmidViewer.jsx`, найти точки resolve цвета region.
- **`DesignCanvas` Blocks view рендерит `PartBlock`/`JunctionBlock`, цвета — из `part.color` (per-fragment) либо `theme.js`.** Источник: архитектурная память + §0.5. Проверено: **нет**. **Действие:** первый шаг K2 — прочитать Blocks branch `DesignCanvas` + импорты `PartBlock`; если палитра несовместима без in-place правки — fork Blocks-branch в `Prototype/CanvasBlocksViewFork.jsx` (≤5 KB, только рендер без Zustand state).
- **`main.jsx` StrictMode + ErrorBoundary сохранены в обеих ветвях switch.** Источник: `main.jsx` прочитан целиком — ErrorBoundary обёрнут вокруг `<App />`, будет обёрнут и вокруг `<Prototype />`. Проверено: да.
- **Tailwind 4 + CSS-переменные в `:root` (или scoped под `.ux-prototype-root`) совместимы.** Источник: Tailwind 4 `@theme` поддерживает CSS-custom-properties; `index.css` (816 B) без кастомных переменных — пустой canvas. `prototype-tokens.css` scoped под `.ux-prototype-root`, не конфликтует с Tailwind utility classes в main flow. Проверено: косвенно через текущее отсутствие конфликтов в `index.css`.

---

## 6. Задачи

### K1 — URL-switch + Prototype scaffold + tokens + fixture

**Файлы:** `src/main.jsx` (URL-switch), `src/components/Prototype/index.jsx`, `src/components/Prototype/prototype-tokens.css`, `src/components/Prototype/fixture.js`.

**Что делаем:** минимальный каркас прототипа без содержимого обёрток — layout с тремя пустыми панелями-placeholder'ами, URL-gate в main.jsx, CSS-переменные paper/ink/accent, синтетическая плазмида-fixture с 15+ аннотациями (по одной на каждое семейство `feature-palette.js`).

**Первый шаг:** прогнать все типы fixture через `featureColor(type, name)` в unit-тесте, убедиться что ни один не падает в `misc` fallback (если падает — либо корректировать тип в fixture, либо расширять `featureColor` — решение в commit message).

**main.jsx switch:** `new URLSearchParams(window.location.search).get('ux') === 'prototype'` → render `<Prototype />`, else `<App />`. Оба в `<StrictMode><ErrorBoundary>`.

**`Prototype/index.jsx` structure:** header с названием + fixture-info → 3-row grid (CanvasBlocksView top / PlasmidViewerWrapper middle / AnnotationEditorWrapper bottom) — в K1 все три — placeholder-divs «Canvas Blocks prototype (K2)», «PlasmidViewer prototype (K3)», «AnnotationEditor prototype (K4)». Root class `.ux-prototype-root`.

**Тесты** (`__tests__/prototype-scaffold.test.jsx`, +2):
1. URL `?ux=prototype` → `<Prototype />` rendered, `<App />` отсутствует.
2. URL без `ux=prototype` → `<App />` как раньше (regression guard).

### K2 — CanvasBlocksView обёртка или fork

**Файл:** `src/components/Prototype/CanvasBlocksView.jsx` (и возможно `CanvasBlocksViewFork.jsx` если придётся fork'ать).

**Первый шаг:** `grep -n "theme\|color" gui/designer/src/components/DesignCanvas.jsx gui/designer/src/components/PartBlock.jsx gui/designer/src/components/JunctionBlock.jsx` — найти все точки resolve цвета. Если цвета идут через prop/context — обёртка-passthrough с `FeaturePaletteContext.Provider`. Если hardcoded — fork Blocks-view branch (только JSX рендера блоков, без state из Zustand) в `CanvasBlocksViewFork.jsx`. Commit message явно указывает выбранный путь.

**Что делаем:** Canvas Blocks view на fixture из K1, цвета `PartBlock`/`JunctionBlock` resolved через `featureColor(type, name)` вместо `theme.js`/`part.color`.

**Тесты** (extend `prototype-scaffold.test.jsx`, +1): fixture's fragments rendered, ≥1 PartBlock имеет background-color из семейства палитры (resistance pastel, promoter pastel и т.п. — смотрим computed style или inline style).

### K3 — PlasmidViewerWrapper обёртка

**Файл:** `src/components/Prototype/PlasmidViewerWrapper.jsx`.

**Первый шаг:** `grep -n "theme\|ANNOTATION_COLORS\|FEATURE_COLORS" gui/designer/src/components/PlasmidViewer.jsx` — найти все места resolve цвета regions. Если через prop/callback — проброс готов; если hardcoded — context override или минимальный fork.

**Что делаем:** `PlasmidViewer` на fixture с region-цветами через `featureColor`; стрелки и текст labels на `FEATURE_STROKE` (наследовано из Map-WS-1-fix-B ⚓).

**Тесты** (extend, +1): fixture plasmid в PlasmidViewer, circular map содержит ≥10 sub-arc с разными pastel цветами из палитры (уникальных fill-значений ≥10).

### K4 — AnnotationEditorWrapper обёртка

**Файл:** `src/components/Prototype/AnnotationEditorWrapper.jsx`.

**Первый шаг:** прочитать props-signature `AnnotationEditor.jsx` (15.09 KB, малый — можно целиком) и найти где chip-элементы получают цвет. Ожидание (§5): через `theme.js`. Если так — оборачиваем с context override или минимальный fork chip-рендера.

**Что делаем:** `AnnotationEditor` на fixture с chip-цветами из `featureColor`. SBOL-глифы оставляем на текущих цветах `sbol-glyphs.jsx` (§10 open question 3, вне scope).

**Тесты** (extend, +1): fixture's 15 аннотаций рендерятся в tree list, ≥10 разных pastel цветов chip'ов (уникальных computed `background-color` ≥10).

### K5 (опционально) — mock ↔ live toggle

**Файл:** `src/components/Prototype/index.jsx` — добавить header-toggle «Fixture ↔ Живая сборка из Zustand».

**Условие реализации:** §10 open question 1 решён в пользу «оба». Если Игорь в review говорит «хватит fixture» — K5 пропускается. Можно не делать до review и добавить позже, если понадобится.

**Что делаем:** toggle переключает источник фрагментов — `useStore((s) => s.fragments)` vs `fixture.fragments`. Живая сборка показывает текущий проект пользователя в той же семейство-based палитре. Пустой store → fallback на fixture + notice «Store пуст».

**Тесты:** skip (чисто UX-toggle, review-smoke).

---

## 7. Порядок и оценка

K1 → K2 → K3 → K4 → (K5). Порядок фиксирован: K1 создаёт scaffold + fixture (без которых K2/K3/K4 не имеют данных); K2/K3/K4 технически независимы, но концептуально идут от самой сложной поверхности к самой простой (Canvas Blocks → circular map → chip-list). K5 — опциональный last step, можно отложить до review.

Оценка: ~4–6 ч Code (K1 ~1 ч, K2 ~1.5–2 ч с возможным fork, K3 ~1 ч, K4 ~1 ч, K5 ~30 мин если делаем). Тесты соразмерны коду (⚓ 22.04.2026 DECISIONS.md) — всего +5–6 Vitest на 4–5 коммитов. Прототип UX- и review-ориентирован, heavy TDD не нужен.

---

## 8. STOP-условие и формат отчёта

### STOP

После commit K4 (и K5 если был) Code останавливается. **НЕ:**

- обновляет `PROJECT_STATE.md` / `DECISIONS.md` / `BUGS.md` — это делает Chat в сессии review;
- перемещает спеку в `docs/archive/` — прототип не финальный артефакт, спека остаётся активной до review + полной UX-1 спеки;
- начинает Sprint UX-1a/b/c фазы 2;
- трогает OPEN баги вне скоупа (V7, V23, V28, V29, V30, V31 и прочие — все откладываются на свои спринты);
- **трогает `App.jsx`, `DesignCanvas.jsx`, `PlasmidViewer.jsx`, `AnnotationEditor.jsx` в местах вне обёртки** — §3 OUT.

### Формат отчёта

Code дописывает в конец `CURRENT_TASK.md` блок:

```
## Отчёт Code по Sprint UX-1 prototype

- K1 коммит: `<hash>` — feat(prototype): URL-switch + scaffold + tokens + fixture
- K2 коммит: `<hash>` — feat(prototype): CanvasBlocksView (wrapper|fork)
- K3 коммит: `<hash>` — feat(prototype): PlasmidViewerWrapper
- K4 коммит: `<hash>` — feat(prototype): AnnotationEditorWrapper
- K5 коммит: `<hash>` / skipped
- Для K2/K3/K4 явно указать по каждой обёртке: wrapper (prop/context) или fork (копия части рендера).
- Изменения размеров:
  - main.jsx: 1.40 → X KB
  - App.jsx: 39.19 → 39.19 KB (не трогался — подтверждение)
  - DesignCanvas.jsx: 38.44 → 38.44 KB (не трогался)
  - PlasmidViewer.jsx: 20.12 → 20.12 KB (не трогался)
  - AnnotationEditor.jsx: 15.09 → 15.09 KB (не трогался)
- Новые файлы:
  - components/Prototype/index.jsx (X KB)
  - components/Prototype/CanvasBlocksView.jsx (X KB) [+ CanvasBlocksViewFork.jsx если fork-path]
  - components/Prototype/PlasmidViewerWrapper.jsx (X KB)
  - components/Prototype/AnnotationEditorWrapper.jsx (X KB)
  - components/Prototype/prototype-tokens.css (X KB)
  - components/Prototype/fixture.js (X KB)
  - __tests__/prototype-scaffold.test.jsx (+N тестов)
- Vitest: N/N (baseline зависит от git state: 774 если Sprint X Plasmid-Git ещё не принят, 822 если принят).
- pytest: 112/112 (backend не трогается).
- vite build: clean | warnings: <...>
- Отклонения от спеки (§3 / §4 / §6): <явный список или «нет»>
- Противоречия с §0.5 / §0.6 (если обнаружены в процессе): <список или «нет»>
- Size budget: OK (все файлы под hard; App.jsx / DesignCanvas.jsx не тронуты).
```

После коммита K4 — **review сессия с Игорем** (визуальная, не formal acceptance по `docs/ACCEPTANCE_ALGORITHM.md`): запускается dev server, открывается `?ux=prototype`, Игорь пробегается по трём поверхностям. Результат review определяет фазу 2 (план серии UX-1a/b/c). Chat пишет `docs/UX_1_PROTOTYPE_REVIEW.md` на основе review, затем пишет первую полную спеку UX-1a.

---

## 9. Риски

1. **`DesignCanvas` Blocks view — цвета hardcoded в `PartBlock`/`JunctionBlock`, проброс палитры через обёртку невозможен без правки `DesignCanvas.jsx` (38.44 KB, soft zone).** Митигация: K2 первый шаг — `grep` импортов; если context/prop-проброс не работает — fork Blocks-branch в `Prototype/CanvasBlocksViewFork.jsx` (≤5 KB, только рендер блоков из fixture, без Zustand state и без взаимодействия). In-place правка `DesignCanvas` — **запрещена** в этом спринте.

2. **Семейство-based палитра на review визуально не работает на малых элементах PartBlock.** Митигация: это не bug, а legitimate review finding. Если review FAIL — прототип не мёрджится (прототип на отдельной git-ветке), возвращаемся к итерации палитры (либо HTML-mockup, либо другой набор цветов). Таких roundtrip может быть 1–2, не считать регрессией.

3. **`AnnotationEditor` SBOL-глифы читают цвета из `sbol-glyphs.jsx` напрямую, не из палитры** (см. V10 BUGS.md: `fillOpacity="0.15"` делает их бледными). Митигация: глифы — scope фазы 2 (§10 open question 3). В прототипе оставляем как есть. Если Игорь на review скажет «сначала глифы» — отдельная итерация, не этот спринт.

4. **`App.jsx` 39.19 KB — в 0.8 KB от hard 40.** Любая правка в этом спринте почти гарантированно пробивает hard. Митигация: правка `App.jsx` запрещена (§3 OUT). URL-switch в `main.jsx` обходит необходимость трогать App.jsx. Если Code при реализации видит необходимость в правке App.jsx — **STOP**, отчёт о блокере, mini-spec на декомпозицию App.jsx **перед** продолжением прототипа (не молча дописывать).

5. **Игорь на review говорит «направление в целом не то»** (не семейство-based, не paper/ink, другой подход к chrome). Митигация: прототип на отдельной git-ветке, не в main. Если review FAIL — ветка не мёрджится, следующий round на HTML-mockup или с другим набором поверхностей. Прототип по определению рассчитан на возможный FAIL — именно за этим он и делается до полной спеки.

---

## 10. Открытые вопросы

Вопросы из §0.6 закрыты батчем 23.04.2026 (перешли в Q/A с ответами). Вопросы §0.7 отложены на фазу 2 полного UX-1. Здесь — мелкие реализационные развилки, которые Chat может решить «на глаз», но Игорь может хотеть сказать слово.

1. **Живая сборка vs только fixture.** В прототипе используем только синтетическую fixture (полное покрытие 15 семейств) или добавляем toggle на живую сборку из Zustand (K5)? Предполагаемый ответ: дефолт — fixture, опциональный toggle как K5 (не блокирующий). Решается по ходу review, не обязательно до старта Code.

2. **URL-pattern: `?ux=prototype` vs `/ux-prototype`.** Pathname требует SPA-fallback в Vite dev server (теоретически не проблема). Query string проще: Vite serve отдаёт тот же `index.html`, `main.jsx` делает switch. Предполагаемый ответ: query string `?ux=prototype`. Жёстко не принято — Code может поменять в K1, если увидит причину.

3. **SBOL-глифы в `AnnotationEditor` — scope v0 прототипа или фазы 2?** См. §9 риск 3. Предполагаемый ответ: фаза 2 (с V10 из BUGS.md). В прототипе глифы остаются на текущих SBOL-цветах. Формально это в §3 OUT, но вопрос про review — может возникнуть.

4. **Где фиксируем результаты review прототипа — новый `docs/UX_1_PROTOTYPE_REVIEW.md` или §11 в этой же спеке?** Предполагаемый ответ: отдельный файл `docs/UX_1_PROTOTYPE_REVIEW.md` (Chat пишет после review-сессии), чтобы эта спека оставалась read-only после реализации. Полная спека UX-1a идёт отдельным `docs/SPRINT_UX_1A_*.md` на основе review-файла.

---

## Handoff для Code

> Прочитай `CLAUDE.md`, `BUGS.md`, `CURRENT_TASK.md`, `docs/SPRINT_UX_1_PROTOTYPE.md`. Реализуй Sprint UX-1 prototype по K1–K4 (K5 опционально). После K4 остановись — жди review-сессии Игоря, не финализируй `PROJECT_STATE` / `DECISIONS` / `BUGS`, не перемещай спеку в `docs/archive/`.

---

**Chat этой сессии (23.04.2026, batch 2) выполнил:**

- Задал §0.6 pending вопросы (вариант прототипа + третья поверхность) и получил ответы: **C** + **AnnotationEditor**.
- Router-check по `main.jsx` + head `App.jsx`: `react-router-dom` **отсутствует**, выбрано URL-param switch решение (§4 пункт 4).
- Зафиксировал prototype-first подход в `DECISIONS.md` как ⚓ (секция «Процесс — Chat ↔ Code координация 23.04.2026», третья запись после kickoff-интервью и `.claude/skills/`).
- Дописал §0 (срез размеров по `list_directory_with_sizes` — 14 файлов в скоупе) + §1, §2, §3 IN/OUT, §4 (4 решения), §5 (предположения — короткий хвост после §0.5/§0.6), §6 (K1–K5 с первыми шагами), §7, §8, §9 (5 рисков), §10 (4 open questions).
- Удалил все TBD-маркеры.

**Chat предыдущей сессии (23.04.2026, batch 1) выполнил:**
- 9 скиллов в `.claude/skills/` (bio-invariants / annotation-contract / size-budget / tdd-enforce / scope-stop / assembly-methods-ref / design-system / ui-interactions / sprint-report)
- Обновил `CHAT_PLAYBOOK.md` (§1.5 новая, §1/2/4/6/7/8/9/11 обновлены)
- Обновил `docs/_TEMPLATE_SPEC.md` до v1.1 (§0.5, §5 переформулирован)
- Обновил `DECISIONS.md` (новый раздел «Процесс — Chat ↔ Code координация 23.04.2026» с двумя ⚓ — kickoff-интервью и `.claude/skills/`)
- Обновил skill `design-system` (PUNK перенесён в teaser-only, добавлены 5 семейств цветов, `theme.js` → deprecating)
- Провёл 2 батча kickoff-интервью (6 вопросов, 5 отвеченных)

---

_Создан 23.04.2026 (batch 1 kickoff). Дополнен 23.04.2026 (batch 2 ответы + полные §0–§10). Заменяется / архивируется после коммита K4 + review-сессии Игоря + написания `docs/UX_1_PROTOTYPE_REVIEW.md`._

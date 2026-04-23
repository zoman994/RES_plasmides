# CURRENT_TASK.md — Sprint UX-1 prototype

**Статус:** 🟢 Готов к реализации
**Спека:** `docs/SPRINT_UX_1_PROTOTYPE.md` (41.47 KB — prototype-спека с полным rationale по вариантам выбора, §2 playbook легитимное отклонение для жанра прототипа)
**Тип:** feature (prototype phase)
**База:** v0.5.1-alpha, коммит `8699bf5` (Sprint 2a.1 финал) либо любой коммит после Sprint X Plasmid-Git — не критично для прототипа (прототип изолирован, не зависит от mutation-фичей).
**Оценка:** ~4–6 ч Code (K1–K4 + опционально K5).

---

## TL;DR (для Code)

URL-param switch в `src/main.jsx` (query `?ux=prototype`) → изолированный React-экран `<Prototype />` с тремя поверхностями (Canvas Blocks view + PlasmidViewer + AnnotationEditor), каждая в обёртке или минимальном fork, цвета через `featureColor` из `feature-palette.js` вместо `theme.js`. Fixture-плазмида с 15 семействами аннотаций. `App.jsx` / `DesignCanvas.jsx` / `PlasmidViewer.jsx` / `AnnotationEditor.jsx` — **не трогаем** (App.jsx в 0.8 KB от hard 40 KB, остальные крупные). Задача — review-оценка новой палитры на живых React-компонентах до полной UX-1 спеки.

**5 подзадач K1–K5, K5 опционально. После K4 — STOP, ждём review-сессию Игоря.**

---

## Порядок чтения перед началом

1. `CLAUDE.md` — правила проекта (особенно §7 лимиты размеров).
2. `BUGS.md` — по OPEN секции багов в скоупе нет (это prototype, не bugfix). Можно просмотреть `head` — иметь в виду V28/V29/V30/V31 (они в OUT спеки, но могут всплывать в review).
3. `docs/SPRINT_UX_1_PROTOTYPE.md` — **вся спека**, особенно:
   - §0 срез размеров — что можно и что нельзя трогать;
   - §4 четыре архитектурных решения (prototype-first ⚓, вариант C, 3 поверхности, URL-switch);
   - §5 предположения — каждое с «первым шагом K*»;
   - §6 задачи (подробности по K1–K5 там, здесь только чеклист).
4. Целевые файлы — по мере надобности для каждого K (§6 спеки указывает «первый шаг» — что читать/grep'ать первым).

---

## Чеклист подзадач

### K1 — URL-switch + Prototype scaffold + tokens + fixture

- [ ] **Первый шаг:** прогнать все 15 типов fixture через `featureColor(type, name)` в unit-тесте — ни один не должен уходить в `misc` fallback. Если уходит — решение (расширить `featureColor` или поправить fixture) в commit message.
- [ ] `src/main.jsx` — URL-param switch на `new URLSearchParams(window.location.search).get('ux') === 'prototype'`. `<StrictMode><ErrorBoundary>` сохранить в обеих ветвях.
- [ ] `src/components/Prototype/index.jsx` — 3-row grid layout с placeholder-divs для K2/K3/K4, root class `.ux-prototype-root`.
- [ ] `src/components/Prototype/prototype-tokens.css` — CSS-переменные paper/ink/accent из `design_teasers/bodgegene_workspace.html`, scoped под `.ux-prototype-root`.
- [ ] `src/components/Prototype/fixture.js` — синтетическая плазмида ~4–6 kb, 15+ аннотаций, каждое семейство `feature-palette.js`.
- [ ] `__tests__/prototype-scaffold.test.jsx` — +2 (URL `?ux=prototype` → `<Prototype />`; URL без параметра → `<App />` regression).
- **Артефакты:** `main.jsx` изменён, 4 новых файла в `components/Prototype/`, 1 новый тест.

### K2 — CanvasBlocksView обёртка или fork

- [ ] **Первый шаг:** `grep -n "theme\|color" gui/designer/src/components/DesignCanvas.jsx gui/designer/src/components/PartBlock.jsx gui/designer/src/components/JunctionBlock.jsx`. Решить: wrapper (prop/context via `FeaturePaletteContext.Provider`) или fork Blocks-branch в `CanvasBlocksViewFork.jsx`. Commit message явно указывает путь.
- [ ] `src/components/Prototype/CanvasBlocksView.jsx` (и опц. `CanvasBlocksViewFork.jsx` ≤5 KB, только рендер из fixture без Zustand state) — Canvas Blocks view с цветами через `featureColor`.
- [ ] **Запрещено:** in-place правка `DesignCanvas.jsx` / `PartBlock.jsx` / `JunctionBlock.jsx`.
- [ ] Тесты extend: +1 (≥1 PartBlock имеет background-color из семейства палитры).
- **Артефакты:** 1–2 новых файла в `Prototype/`, extend test.

### K3 — PlasmidViewerWrapper обёртка

- [ ] **Первый шаг:** `grep -n "theme\|ANNOTATION_COLORS\|FEATURE_COLORS" gui/designer/src/components/PlasmidViewer.jsx`. Решить wrapper vs fork по тому же принципу, что K2.
- [ ] `src/components/Prototype/PlasmidViewerWrapper.jsx` — PlasmidViewer на fixture, region-цвета через `featureColor`, labels на `FEATURE_STROKE` (⚓ Map-WS-1-fix-B).
- [ ] **Запрещено:** in-place правка `PlasmidViewer.jsx`.
- [ ] Тесты extend: +1 (circular map ≥ 10 уникальных pastel fill-значений).

### K4 — AnnotationEditorWrapper обёртка

- [ ] **Первый шаг:** прочитать props-signature `AnnotationEditor.jsx` (15.09 KB, малый — можно целиком). Найти где chip-элементы получают цвет. Ожидание: через `theme.js`.
- [ ] `src/components/Prototype/AnnotationEditorWrapper.jsx` — AnnotationEditor на fixture, chip-цвета через `featureColor`. SBOL-глифы оставляем на текущих `sbol-glyphs.jsx` цветах (§10 open question 3 спеки).
- [ ] **Запрещено:** in-place правка `AnnotationEditor.jsx`.
- [ ] Тесты extend: +1 (≥10 уникальных chip computed background-color).

### K5 (опционально) — mock ↔ live toggle

- [ ] **Условие:** §10 open question 1 спеки — в пользу «оба». **По умолчанию пропускаем**, добавляем по итогам review если Игорь попросит.
- [ ] Header-toggle в `Prototype/index.jsx` — `useStore((s) => s.fragments)` vs `fixture.fragments`. Fallback на fixture при пустом store + notice.
- [ ] Тесты: skip (UX-toggle review-smoke).

---

## STOP-условие

После commit K4 (и K5 если был) — **остановись**. НЕ:

- обновляй `PROJECT_STATE.md` / `DECISIONS.md` / `BUGS.md` — это Chat в сессии review;
- перемещай `docs/SPRINT_UX_1_PROTOTYPE.md` в `docs/archive/` — прототип ждёт review + полной UX-1 спеки;
- начинай Sprint UX-1a/b/c фазы 2;
- трогай OPEN баги вне скоупа (V7, V22, V23, V24, V27, V28, V29, V30, V31 — все на своих спринтах);
- **трогай `App.jsx` / `DesignCanvas.jsx` / `PlasmidViewer.jsx` / `AnnotationEditor.jsx`** вне обёртки (§3 OUT спеки).

Если `App.jsx` пришлось бы править — **STOP в середине K***, отчёт о блокере в CURRENT_TASK.md, mini-spec на декомпозицию App.jsx **перед** продолжением, не молча дописывать.

---

## Формат отчёта

Дописать в конец этого файла (полный шаблон — спека §8). Обязательно:

- коммит-хэши K1–K4 (+K5 если был);
- по K2/K3/K4 — явно **wrapper или fork** по каждой обёртке;
- подтверждение что `App.jsx` / `DesignCanvas.jsx` / `PlasmidViewer.jsx` / `AnnotationEditor.jsx` **не тронуты** (исходные размеры в отчёте);
- Vitest baseline зависит от git state (774 до Sprint X Plasmid-Git мерджа, 822 после);
- Size budget + отклонения от спеки (§3 / §4 / §6) явным списком;
- противоречия с §0.5 / §0.6 если обнаружены в процессе.

---

## Что делать при регрессии

- Любой сломанный существующий тест (не в скоупе K) → **STOP**, отчёт о регрессии, не фиксировать молча — обсудить с Игорем.
- Если `featureColor` не покрывает тип из fixture (K1 первый шаг) → остановись, обсудить: расширять `featureColor` (меняет контракт Map-WS-1-fix ⚓) или корректировать fixture.
- Если в K2/K3/K4 wrapper невозможен и нужен fork — **это не блокер**, зафиксируй в commit message и продолжай. Fork ≤5 KB — в пределах нормы.
- Если vite build падает из-за CSS-переменных (K1 prototype-tokens.css) → проверить Tailwind 4 `@theme` вместо обычного `:root` блока.

---

## Ссылки

- **Спека:** `docs/SPRINT_UX_1_PROTOTYPE.md` (41.47 KB, полные §0–§10).
- **Kickoff:** §0.5 ответы Игоря batch 1 + §0.6 batch 2 (C + AnnotationEditor + router-check) + §0.7 отложенное на фазу 2.
- **Архитектурные основы:** `DECISIONS.md` секция «Процесс — Chat ↔ Code координация 23.04.2026» (три ⚓: kickoff-интервью, `.claude/skills/`, **prototype-first**); секция Sprint Map-WS-1 cycle (⚓ `getRegions` id contract, `feature-palette.js` контракт, responsive charsPerLine).
- **Референсы дизайна:** `design_teasers/feature_palette.html` (палитра), `design_teasers/bodgegene_workspace.html` (chrome).
- **Playbook:** `CHAT_PLAYBOOK.md` §3 (CURRENT_TASK.md — оперативный чеклист, не зеркало спеки).

---

**Handoff (из спеки §Handoff):**

> Прочитай `CLAUDE.md`, `BUGS.md`, `CURRENT_TASK.md`, `docs/SPRINT_UX_1_PROTOTYPE.md`. Реализуй Sprint UX-1 prototype по K1–K4 (K5 опционально). После K4 остановись — жди review-сессии Игоря, не финализируй `PROJECT_STATE` / `DECISIONS` / `BUGS`, не перемещай спеку в `docs/archive/`.

---

_Переписан Chat'ом 23.04.2026 на Sprint UX-1 prototype. Предыдущая версия содержала отчёт Code по Sprint X «Plasmid-Git» (K1–K6, коммиты `bb868f1`..`bc20620`, 822/822 Vitest); визуальная приёмка Sprint X не проведена — Chat следующей приёмки восстановит отчёт через `git log CURRENT_TASK.md` (или смотрит commits напрямую)._

---

## Отчёт Code по Sprint UX-1 prototype

Реализован 23.04.2026 на ветке `feature/racetrack-canvas`, база `54b1e0f`.

### Коммиты

- K1: `f2c3f36` — `feat(prototype): K1 URL-switch + scaffold + tokens + fixture`
- K2: `0d680d2` — `feat(prototype): K2 CanvasBlocksView (fork)`
- K3: `4d99663` — `feat(prototype): K3 PlasmidViewerWrapper (wrapper)`
- K4: `d08a109` — `feat(prototype): K4 AnnotationEditorWrapper (wrapper)`
- K5: **skipped** (§10 open question 1 default — дефолт fixture, toggle добавим только если Игорь попросит на review).

### По каждой обёртке (wrapper vs fork)

- **K2 CanvasBlocksView → fork.** `PartBlock.jsx` импортирует `getFragColor` / `FEATURE_COLORS` напрямую из `theme.js` (строки 3, 64, 323). Проброс палитры через prop/context невозможен без правки `PartBlock.jsx` (25.85 KB) и/или `DesignCanvas.jsx` (38.44 KB, soft zone) — обе правки OUT §3. Fork: `CanvasBlocksView.jsx` 3.37 KB (< 5 KB fork-budget ⚓), render-only, без Zustand / drag-drop / context-menu. Каждая аннотация fixture → карточка с gradient-фоном `featureColor(type, name)`, SBOL-глиф со stroke = `FEATURE_STROKE`, junction-бусина между блоками.
- **K3 PlasmidViewerWrapper → wrapper (PlasmidMap).** Полный `PlasmidViewer.jsx` — `fixed inset-0 z-50` модалка (строка 153) и его sequence pane ещё на legacy `theme.js` `FEATURE_COLORS` (строки 14, 259–307). Review-релевантная поверхность — круговая карта, а `PlasmidMap.jsx` уже резолвит sub-arc fill через `featureColor(r.type, r.name)` + labels через `FEATURE_STROKE` (строки 12, 263, 333 — Sprint Map-WS-1-fix, ⚓ 21.04.2026). Wrapper (1.48 KB) передаёт fixture как один whole-plasmid fragment в `<PlasmidMap>`, `totalBp = fixture.length`. Нулевые правки `PlasmidViewer` / `PlasmidMap`. Известный gap (phase 2): outer frame arc `PlasmidMap` всё ещё на `getFragColor` (hollow ring stroke), sequence pane `PlasmidViewer` — out of scope.
- **K4 AnnotationEditorWrapper → wrapper (prop injection).** `AnnotationEditor.jsx` резолвит chip-цвет как `ann.color || ANNOTATION_COLORS[ann.type]` в обоих render-путях (строка 174 `Row`, строка 234 annotation bar). Per-annotation `color` — выше legacy lookup в приоритете. Wrapper (1.33 KB) обогащает `fixture.annotations` полем `color = featureColor(a.type, a.name)` перед передачей в `<AnnotationEditor readOnly />` → V2 палитра по всему tree-list + bar + tree-row SBOL-глифам (строка 207 тоже читает `ann.color`). Не покрыты (phase 2): child-row border (строка 260 `regionColor = ANNOTATION_COLORS[...]`), edit-mode SBOL-глиф (строка 179) — не основные review-поверхности.

### Изменения размеров

- `main.jsx`: 1.40 → **1.56 KB** (+0.16 KB, URL-switch import + one-line `RootComponent` selection).
- `App.jsx`: 39.19 → **39.19 KB** — НЕ тронут. ✓
- `DesignCanvas.jsx`: 38.44 → **38.44 KB** — НЕ тронут. ✓
- `PartBlock.jsx`: 25.85 → **25.85 KB** — НЕ тронут. ✓
- `JunctionBlock.jsx`: 29.23 → **29.23 KB** — НЕ тронут. ✓
- `PlasmidViewer.jsx`: 20.12 → **20.12 KB** — НЕ тронут. ✓
- `PlasmidMap.jsx`: 34.29 → **34.29 KB** — НЕ тронут. ✓
- `AnnotationEditor.jsx`: 15.09 → **15.09 KB** — НЕ тронут. ✓
- `theme.js`: 3.20 → **3.20 KB** — НЕ тронут (остаётся для main flow до phase 2). ✓
- `feature-palette.js`: 3.54 → **3.54 KB** — не расширялся (все 16 семейств fixture вошли в существующий `featureColor` без падения в misc). ✓

### Новые файлы

- `components/Prototype/index.jsx` — **1.86 KB**, root layout с 3-row grid и header.
- `components/Prototype/CanvasBlocksView.jsx` — **3.37 KB**, fork Blocks-branch.
- `components/Prototype/PlasmidViewerWrapper.jsx` — **1.48 KB**, wrapper PlasmidMap.
- `components/Prototype/AnnotationEditorWrapper.jsx` — **1.33 KB**, wrapper AnnotationEditor.
- `components/Prototype/prototype-tokens.css` — **2.34 KB**, scoped под `.ux-prototype-root`, paper/ink/accent из `design_teasers/bodgegene_workspace.html`.
- `components/Prototype/fixture.js` — **2.86 KB**, 5 kb циркулярная fixture с 16 аннотациями (все 16 семейств `FEATURE_COLORS_V2`, включая misc).
- `__tests__/prototype-scaffold.test.jsx` — **4.42 KB**, +7 тестов (K1: URL gate / 3 панели / покрытие палитры / coord sanity; K2: ≥10 уникальных chip-bg; K3: ≥10 уникальных SVG fill; K4: ≥10 уникальных chip-bg в AnnotationEditor).

### Baseline

- **Vitest:** 829/829 (baseline 822 — Sprint X Plasmid-Git уже в дереве, +7 от K1–K4).
- **pytest:** 112/112 (backend не трогался).
- **vite build:** clean. Pre-existing warnings остались (auto-annotate.js INEFFECTIVE_DYNAMIC_IMPORT, 500 KB chunk size — оба не привнесены этим спринтом).

### Отклонения от спеки

- **Fixture levels:** спека §6 K1 подразумевала смешанные уровни (region/detail/point). Реализовано — **все 16 аннотаций на `level: 'region'`**. Причина: `PlasmidMap.getRegions()` фильтрует по `level === 'region'`, при исходной раскладке только 9 семейств выходили на круговую карту и K3 тест падал (9 < 10). Для прототипа, где единственная цель — палитровое review, все аннотации — регионы. Для реального flow detail/point разделение остаётся в силе. Зафиксировано в коммите K3.
- **K5 skipped:** соответствует §10 open question 1 default-ответу — не отклонение, а согласованный пропуск.
- Других отклонений от §3 / §4 / §6 нет.

### Противоречия с §0.5 / §0.6

Нет. Вариант C подтверждён (`?ux=prototype`), AnnotationEditor — третья поверхность (K4 реализован). `react-router-dom` не добавлен — URL-param switch в `main.jsx`, как и решено в §0.6 router-check.

### Size budget

**OK.** Все новые файлы под 5 KB (fork ≤5 KB соблюдён), ни один «замороженный» модуль (`App.jsx` / `DesignCanvas.jsx` / `PartBlock.jsx` / `JunctionBlock.jsx` / `PlasmidMap.jsx` / `PlasmidViewer.jsx` / `AnnotationEditor.jsx` / `theme.js` / `feature-palette.js`) не изменился — подтверждено `git log --stat` и `stat -c '%s'` на каждый файл.

Новых нарушителей: **нет.** Warning signal (>5 KB прирост за спринт): **нет.**

### STOP-условие

Остановлен после K4. **НЕ** обновлены: `PROJECT_STATE.md`, `DECISIONS.md`, `BUGS.md`, `docs/archive/` (спека SPRINT_UX_1_PROTOTYPE.md остаётся активной). Review-сессия Игоря: запуск `cd gui/designer && npm run dev`, открыть `http://localhost:3000/?ux=prototype`, пробежать три панели.

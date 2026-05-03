# UX_1_PROTOTYPE_REVIEW.md

> Результаты review Sprint UX-1 prototype от 23.04.2026 — read-only артефакт.
> Основание для написания полной спеки Sprint UX-1 (серия UX-1a/b/c).
> После написания полной спеки этот файл **не архивируется** — остаётся активной ссылкой в `docs/` пока UX-1 серия не закрыта.

---

## 0. Что это такое

Sprint UX-1 prototype — изолированный React-экран на `?ux=prototype` с тремя поверхностями (Canvas Blocks view / PlasmidViewer / AnnotationEditor), реализованный по спеке `docs/SPRINT_UX_1_PROTOTYPE.md` (v1.1 шаблон, prototype-first pattern ⚓ DECISIONS 23.04.2026).

Прототип был написан **не ради мёрджа**, а ради палитрового review на живых React-компонентах перед полной UX-1 спекой. Паттерн `/feature-dev` Claude Code («PRDs are dead: prototypes replaced them»), адаптирован под dual-agent модель BodgeGene.

**Реализация (Code):** коммиты `f2c3f36` (K1 scaffold + fixture) / `0d680d2` (K2 CanvasBlocksView fork) / `4d99663` (K3 PlasmidViewerWrapper wrapper) / `d08a109` (K4 AnnotationEditorWrapper wrapper) на ветке `feature/racetrack-canvas`. 829/829 Vitest (+7 от baseline 822). Все 9 «замороженных» модулей (`App.jsx`, `DesignCanvas.jsx`, `PartBlock.jsx`, `JunctionBlock.jsx`, `PlasmidViewer.jsx`, `PlasmidMap.jsx`, `AnnotationEditor.jsx`, `theme.js`, `feature-palette.js`) не тронуты.

**Review (Chat + Игорь):** 23.04.2026, после compact, по протоколу `docs/ACCEPTANCE_ALGORITHM.md` §1 (цикл визуальной приёмки). 4 скриншота: Canvas Blocks, circular map, AnnotationEditor tree + bar, regression guard main flow без query.

---

## 1. Вердикт

**PASS по всем 8 acceptance-критериям.** Палитра `feature-palette.js` V2 (warm desaturated pastel + `FEATURE_STROKE #3A2F1F` на paper `#F8F5EE`) принята как главный актив для полной UX-1 спеки.

| # | Критерий | Скриншот | Вердикт |
|---|---|---|---|
| 1 | Палитра на Canvas Blocks (большие элементы) | 1 | PASS |
| 2 | Палитра на circular map | 2 | PASS |
| 3 | Chrome (paper/ink/accent) согласован на 3 поверхностях | 1/2/3 | PASS |
| 4 | `FEATURE_STROKE` контрастен на paper-фоне | 1/2/3 | PASS |
| 5 | Палитра на AnnotationEditor chip-list (малые элементы) | 3 | PASS |
| 6 | SBOL-глифы не усугубляются на новой палитре (V10 контроль) | 3 | PASS условно (V10 унаследован) |
| 7 | Main flow рендерится при URL без `?ux=prototype` | 4 | PASS |
| 8 | Zustand persist-данные целы (`App.jsx` не тронут) | 4 | PASS |

**Три риска §9 спеки не сработали:**
- §9.1 (Canvas Blocks — прoброс палитры в `DesignCanvas` невозможен → fork) — fork 3.37 KB, правок крупных файлов избежали.
- §9.2 (палитра на малых элементах) — сработала и на sub-arc'ах circular map, и на tree-list chip'ах AnnotationEditor.
- §9.5 (review «направление не то») — направление принято.

**Отклонения Code от спеки, принятые в review:**
- Fixture 16 аннотаций все на `level: 'region'` вместо смеси region/detail/point — прагматичный обход `PlasmidMap.getRegions()` фильтра. Для review палитры не критично (фильтры level уже прошли Map-WS-1-fix ⚓ на pDHG25).
- K5 `mock ↔ live toggle` skipped — согласовано по §10 open question 1 default.

---

## 2. Принятая палитра как актив для UX-1 full

### 2.1 Что конкретно принято

- **`feature-palette.js::featureColor(type, name?)`** — 15 biological-feature семейств + misc fallback, CDS→resistance/reporter/his/tag/linker refine по name-regex, GenBank-aliases. На 16 семействах fixture fallback в `misc` ни разу не сработал — покрытие полное для типовых плазмид (проверочный set включал CDS подтипы, promoter, terminator, origin, primer_bind, restriction_site, misc_feature, gene, repeat_region, polyA_signal, signal_peptide, CMV enhancer, 5' LTR, Kozak).
- **`FEATURE_STROKE #3A2F1F`** (warm dark brown) — контрастен на всех 15 семействах pastel-фонов без необходимости `textShadow`. Подтверждено в Map-WS-1-fix-B ⚓ 21.04.2026 и ещё раз в прототипе на трёх поверхностях.
- **Paper background `#F8F5EE`** + warm-dark serif typography + monospace для meta/координат — единая визуальная система на 3 поверхностях. Регистр «панк в душе, не в chrome» работает (DECISIONS 21.04.2026).
- **Paper/ink/accent tokens из `design_teasers/bodgegene_workspace.html`** — реализованы в `components/Prototype/prototype-tokens.css` как scoped CSS-переменные под `.ux-prototype-root`. В UX-1 full их нужно переселить в `src/index.css` (или Tailwind 4 `@theme`) на глобальный `:root`, чтобы main flow получил тот же регистр.

### 2.2 Что НЕ тестировалось прототипом (scope gap)

Явные пробелы, которые UX-1 full обязан закрыть (в порядке приоритета):

- **Outer frame arc `PlasmidMap`** по-прежнему на `getFragColor` из `theme.js` (hollow ring stroke, per-fragment цвет). В прототипе fixture = один whole-plasmid fragment → ring получил один нейтральный цвет, конфликта нет. На реальной плазмиде с несколькими fragment'ами на canvas outer ring становится мульти-цветным и конфликтует с V2 палитрой sub-arc'ов. **UX-1 full решение:** либо outer ring → `featureColor` от первого fragment, либо вообще убрать per-fragment stroke, оставить нейтральный.
- **PlasmidViewer sequence pane** (строки 259–307) читает `FEATURE_COLORS` напрямую из legacy `theme.js`. Прототип обошёл это через wrapper'инг только `PlasmidMap`, не `PlasmidViewer` целиком. **UX-1 full:** перевести sequence pane на `featureColor`.
- **AnnotationEditor child-row border** (`regionColor = ANNOTATION_COLORS[...]`, строка 260) и edit-mode SBOL-глиф (строка 179) — тоже на legacy `ANNOTATION_COLORS`. Не покрыто K4 wrapper'ом (prop injection работает только через `ann.color`).
- **`PartBlock.jsx` и `JunctionBlock.jsx`** — hard-импорты `getFragColor` / `FEATURE_COLORS` из `theme.js` (строки 3, 64, 323 в PartBlock). Фактический main-flow Canvas Blocks view ещё на Okabe-Ito палитре — прототип это закрыл fork'ом. UX-1 full должен провести миграцию `PartBlock`/`JunctionBlock` на `featureColor`.

### 2.3 Судьба `theme.js`

`theme.js` (3.20 KB) — legacy feature-палитра Okabe-Ito, 9 цветов, per-fragment coloring. Используется в main flow `PartBlock`/`JunctionBlock`/`DesignCanvas` Blocks view, в `PlasmidMap` outer frame arc, в `PlasmidViewer` sequence pane, в `AnnotationEditor` edit-mode. После полной UX-1 миграции `theme.js` → либо удаляется, либо остаётся как fallback для импортированных `.bodgegene` проектов с кастомными цветами из localStorage (§0.7 прототипа). Решение по судьбе `theme.js` — §0.7 прототипа (отложено на фазу 2 явно).

---

## 3. Pre-existing проблемы, воспроизведённые прототипом

Четыре бага из OPEN BUGS.md воспроизвелись в прототипе — это **не регрессии** (они были до прототипа), но review подтвердил что все четыре **обязательны к закрытию в UX-1 full**, потому что любая поверхность, переиспользующая `PlasmidMap` или `AnnotationEditor`, наследует их.

### 3.1 V31 — PlasmidMap rescale on window resize (Высокий приоритет для UX-1 full)

**Подтверждение review:** Игорь прокомментировал ко скриншоту 2 (circular map) — «проблема с размерами, пришлось делать ресайз всего чтобы найти плазмиду». То же поведение в main flow (pre-existing с Map-WS-1 Skeleton K4 убранный `items-center justify-center` wrapper, `docs/archive/SPRINT_MAP_WS_1_SKELETON.md` §5).

**Почему это prerequisite для UX-1 full:** Sprint UX-1 полный план включает расширение использования `PlasmidMap` на дополнительные поверхности (в `PlasmidUseWizard`, в `RestrictionPanel`, возможно inline-preview в `ImportDecisionModal`). Каждая новая поверхность унаследует V31 пока он не закрыт. **Рекомендация:** V31 — первая подзадача UX-1 full (UX-1a или preflight K0), до миграции компонентов.

**Возможное направление fix:** centered wrapper в `PlasmidWorkspace` top-pane + max-width cap на `PlasmidMap` SVG (~800px diameter, как в печатных статьях). `viewBox` / `preserveAspectRatio` пересмотреть.

### 3.2 V30 — Tiny labels outside на circular map (Средний)

На скриншоте 2 видны ~4 микро-arc'а (между lacI/AmpR и на верхней дуге) без internal labels — текст физически не помещается в arc. Родственно V1 REGION-OVERFLOW (крупные regions без meaningful labels) и V6 RE-LABELS-OVERLAP (RE sites сливаются). **Единый UX-спринт по PlasmidMap readability** — часть UX-1b.

Возможное направление: leader lines с truncation rules, адаптивный font-size с min threshold, cluster labels при sub-arc <2% окружности.

### 3.3 V9 — Short annotation labels на annotation bar (Средний)

На скриншоте 3 видно: labels есть только на arc'ах >10% ширины (`GFP`, `lacI`, `AmpR`, `pUC ori`), остальные 12 из 16 без labels. Pre-existing код `{width > 10 ? a.name : ''}` в `AnnotationEditor.jsx`. **UX-1c scope.**

Возможное направление: tooltip на hover + leader lines наружу полосы + адаптивный threshold (при большом числе коротких — показывать с truncation).

### 3.4 V10 — SBOL glyph paleness (Низкий-средний)

Pre-existing в `sbol-glyphs.jsx` (`fillOpacity=0.15` + stroke=2 на 14px canvas). На новой палитре **не усугубляется**. По §10 open question 3 прототипа — scope фазы 2 UX-1c.

Fix: поднять `fillOpacity` до 0.3–0.4, `strokeWidth` до 2.5–3.0 в базовых глифах (CDSGlyph, MarkerGlyph, SignalGlyph, промоторы).

### 3.5 Сквозной design-принцип — выносные подписи (leader lines) как главная стратегия против нехватки места (Высокий для UX-1 full)

Комментарий Игоря в конце review: выносные надписи — хороший приём, надо вводить, это снимет проблему нехватки места. Зафиксировано как сквозной принцип design-системы, не как одиночный fix к V30 или V9.

**Суть:** когда внутреннее пространство элемента (sub-arc, chip, carousel block) слишком мало для вмещения корректного лэйбла (порог — оценочно <60% от длины лэйбла в его моноширинном представлении) — лэйбл выводится **наружу** на leader line (тонкая линия от элемента к вынесенному тексту), вместо truncation или полного подавления. Стандартный приём plasmid editors (SnapGene, Benchling, Geneious) и печатных статей.

**Применимо к трём open багам одним механизмом:**

- **V30** (PlasmidMap tiny sub-arcs) — вынос лэйбла наружу кольца с leader line, угловая позиция = середина arc.
- **V9** (annotation bar в `AnnotationEditor` — скрытые лэйблы при `width <= 10%`) — вынос над или под полосой с leader line, staggered вертикально чтобы соседние не сливались.
- **V6** (RE-лэйблы в MCS `PlasmidMap` — 6 сайтов в точке 50 bp → сливаются) — тот же механизм: leader lines разной длины (vertical stacking), чтобы разнести по высоте над кольцом.

**Рекомендация для UX-1 full:** закрывать V30/V9/V6 **одним shared helper'ом**, не тремя отдельными fix'ами. Кандидат: `lib/leader-line-layout.js` — pure helper, принимает координату anchor'а + текст лэйбла + ограничивающий bbox контейнера, возвращает `{ labelX, labelY, lineD, anchorSide }` с collision avoidance (не накладывать на соседние вынесенные лэйблы). Переиспользуется всеми тремя контекстами. Если helper ложится на 25 KB hard — разбивать на `leader-line-geometry.js` + `leader-line-collision.js`.

**Scope в UX-1 full:** leader-line shared helper — **инвестиция UX-1b** (PlasmidMap cleanup) + перенос в UX-1c (AnnotationEditor annotation bar). Не переносить в UX-1 preflight K0: V31 + глобальные tokens + cleanup прототипа уже отдельный быстрый спринт, leader-line layout тяжелее (collision avoidance + тесты на кучные случаи вроде MCS).

**Связь с V1 REGION-OVERFLOW:** крупные regions (repeat_region 2440 bp на 10791 bp) — другая крайность той же проблемы (лэйбл по арке не читается даже когда место есть). V1 leader line не решит — там нужен inner-track layout. Но сам helper может пригодиться для вывода inner-track лэйблов наружу — отмечаем как возможный reuse.

---

## 4. Рекомендации для полной UX-1 спеки

Предложение **пути B** (§конец прошлой сессии review): V31 как prerequisite, затем серия UX-1a/b/c.

### 4.1 UX-1 preflight (K0, обязателен до серии)

- **Закрыть V31.** `PlasmidMap` получает centered wrapper + max-width cap. Фиксированный визуальный размер (~600–800 px diameter) независимо от canvas size. Тесты: не рескейлится на window resize, центрирован, не вытягивается при узком canvas.
- Оценка: ~2–3 ч Code.

### 4.2 UX-1a — Canvas Blocks migration

- `PartBlock.jsx` (25.85 KB) и `JunctionBlock.jsx` (29.23 KB) — миграция с `theme.js::getFragColor` / `FEATURE_COLORS` на `featureColor(type, name)` из `feature-palette.js`.
- `DesignCanvas.jsx` (38.44 KB, soft-zone близко к hard 40) — **не трогать** напрямую; если нужно пробросить что-то, сделать через context `FeaturePaletteContext` на уровне App.jsx (но App.jsx тоже в soft-zone — решение в спеке UX-1a первым пунктом).
- Закрывает: расхождение палитр между canvas и `PlasmidMap`/`SequencePane`.
- Junction-бусины в fork прототипа были упрощены до нуля — реальный `JunctionBlock` в UX-1a сохранить как есть (полноценные junction-визуалы).

### 4.3 UX-1b — PlasmidMap/PlasmidViewer cleanup

- `PlasmidMap` outer frame arc на `featureColor` от первого fragment (или нейтральный — решение в спеке).
- `PlasmidViewer` sequence pane (строки 259–307): `FEATURE_COLORS` legacy → `featureColor`. Full-screen modal остаётся, палитра sequence pane синхронизируется с circular map.
- V30/V6 закрываются пакетом через shared helper `lib/leader-line-layout.js` (см. §3.5): leader lines наружу кольца для tiny sub-arcs + vertical stacking для кластеров RE-сайтов. Адаптивный threshold label size больше не нужен — всё что не влезает внутрь, уходит наружу.
- V1 REGION-OVERFLOW решается той же UX-1b, но другим механизмом — inner-track layout для крупных regions (§3.5 объясняет). Получается единый спринт по PlasmidMap readability на два связанных приёма.

### 4.4 UX-1c — AnnotationEditor + SBOL polish

- child-row border + edit-mode SBOL-глиф → `featureColor` (не `ANNOTATION_COLORS`).
- **V9 закрытие — через тот же `lib/leader-line-layout.js`, что в UX-1b** (§3.5). Текущее поведение `{width > 10 ? a.name : ''}` заменяется на вынос лэйбла над annotation bar с leader line к anchor'у в середине span'а; staggered по высоте чтобы соседние не накладывались (collision avoidance helper'а). Tooltip на hover остаётся как fallback для случаев когда leader line тоже не влезает (>N аннотаций на видимую ширину bar'а).
- V10 закрытие — `fillOpacity` и `strokeWidth` в `sbol-glyphs.jsx`.

### 4.5 CSS-токены на `:root`

- Перенести `prototype-tokens.css` содержимое (paper/ink/accent) в `src/index.css` или Tailwind 4 `@theme` на глобальный `:root`. Без этого UX-1a/b/c будут каждый раз подключать локальные токены.
- Подзадача UX-1 preflight (можно объединить с K0 закрытием V31).

---

## 5. Артефакты прототипа — план удаления

Решение Игоря 23.04.2026: **прототип удаляется**, палитра остаётся. Ветка `feature/racetrack-canvas` не мёрджится в main.

### 5.1 Что удалять (когда начнётся UX-1 full или раньше)

Файлы на ветке `feature/racetrack-canvas`, которые **не нужны** в main:

- `gui/designer/src/components/Prototype/index.jsx`
- `gui/designer/src/components/Prototype/CanvasBlocksView.jsx`
- `gui/designer/src/components/Prototype/PlasmidViewerWrapper.jsx`
- `gui/designer/src/components/Prototype/AnnotationEditorWrapper.jsx`
- `gui/designer/src/components/Prototype/prototype-tokens.css`
- `gui/designer/src/components/Prototype/fixture.js`
- `gui/designer/src/__tests__/prototype-scaffold.test.jsx`

Плюс revert `src/main.jsx` (1.56 → 1.40 KB) обратно на безусловный `<App />` без URL-switch.

### 5.2 Что сохранить

- Спека `docs/SPRINT_UX_1_PROTOTYPE.md` остаётся в `docs/` как исторический артефакт до финализации UX-1 full. После UX-1 full полной серии — в `docs/archive/` вместе с `docs/UX_1_PROTOTYPE_REVIEW.md` (этот файл) единым пакетом.
- `feature-palette.js` и `FEATURE_STROKE` — **никак не трогаются**, остаются действующим контрактом (⚓ Map-WS-1-fix 21.04.2026).
- `design_teasers/bodgegene_workspace.html` и `design_teasers/feature_palette.html` — референсы дизайна, живут на месте.

### 5.3 Когда удалять

Два варианта:

- **(a) Сейчас**, отдельным cleanup-коммитом в main — `revert main.jsx` + `rm -rf components/Prototype/` + удалить test file. 15–20 минут Code, спека уже написана в этом файле (§5.1 список явный).
- **(b) В первом коммите Sprint UX-1 preflight (K0)** — всё равно Code будет править `main.jsx` и/или `index.css` для глобальных tokens. Cleanup прототипа встраивается в тот же коммит.

**Рекомендация:** (b) — меньше коммитов, чище git history. Прототип живёт пока не пришёл UX-1 preflight, потом исчезает одной правкой.

---

## 6. Следующие шаги

1. **Chat (эта сессия):** минимально обновляет `PROJECT_STATE.md` журнал + перезаписывает `CURRENT_TASK.md` на between-sprints placeholder. **Не трогает** BUGS/DECISIONS/архивы.
2. **Игорь:** решает, когда запускать UX-1 preflight. Перед запуском — compact.
3. **Chat (следующая сессия, когда запустишь UX-1 preflight):** пишет спеку UX-1 preflight (K0 V31 + глобальные tokens + cleanup прототипа) по шаблону `docs/_TEMPLATE_SPEC.md` v1.1. Размер целевой 15–20 KB (single-focus спринт).
4. **Chat (следующие UX-1a/b/c спринты):** отдельные спеки на каждую серию. Review между ними (полная formal acceptance по `docs/ACCEPTANCE_ALGORITHM.md`, не prototype-review).

---

**Создан:** 23.04.2026 после review Sprint UX-1 prototype.
**Статус:** read-only артефакт, основание для Sprint UX-1 full серии.
**Архивируется:** после финализации всех UX-1a/b/c + UX-1 preflight, вместе со спекой прототипа `docs/SPRINT_UX_1_PROTOTYPE.md` единым пакетом в `docs/archive/`.

# CURRENT_TASK.md — Sprint 1.6 «Мутагенез UX v2.1»

**Статус:** 🚧 В РАБОТЕ (начат 2026-04-21)
**Спека:** `docs/SPRINT_1_6_MUTAGENESIS_V2_1.md`
**Приоритет:** HIGH — закрывает визуальную приёмку K2 из Sprint 1.5
**Оценка:** 6–8 часов, 4 коммита
**Ветка:** `feature/racetrack-canvas`
**Предыдущий этап:** Sprint 1.5 закоммичен целиком. K2 (mode switcher) технически валидный (663 теста), но визуальная приёмка нашла 4 проблемы архитектурного уровня → Sprint 1.6.

---

## Цель

Починить поверх K2 четыре дефекта, выявленных визуальной приёмкой mode switcher'а:

- **K5** Белок в mode=edit должен быть **read-only** (bookkeeping белка невозможен без кодона)
- **K6** Аннотации при split обрезаются биологически корректно (signal peptide дропается, CDS переименовывается)
- **K7** Split-фрагменты визуально сгруппированы на canvas (пунктирная рамка + подложка + badge + линия)
- **K8** Мутации подсвечиваются в FragmentEditor через `sequenceDiff` относительно parent-part

**Порядок:** K5 → K6 → K8 → K7. K7 последний (крупный UI-change) — сразу видно подсветку K8 при визуальной приёмке.

---

## Коммиты

### K5 — Белок read-only в Правке (1 ч)
- [ ] Баннер «Режим просмотра» + кнопка «→ Мутагенез» в tab='regions' + mode='edit'
- [ ] AA-span: `onClick` и `cursor: pointer` только в mode='mutagenesis'
- [ ] Подсказка «Клик → мутагенез» только в mode='mutagenesis'
- [ ] +2 теста, 1 обновлённый в `fragment-editor-mode-switcher.test.jsx`
- [ ] `feat(fragment-editor): protein tab is read-only in edit mode (K5, Sprint 1.6)`

### K6 — Биологически корректная обрезка аннотаций при split (2 ч)
- [ ] Новый `lib/split-annotations.js::trimAnnotationsForSubFragment`
- [ ] Правила: signal_peptide/transit_peptide/propeptide → drop при partial overlap; start/stop codon → drop если не на границе; restriction_site/primer_bind/mutation/variation → drop при trim; CDS/gene → rename с суффиксом `(5' trimmed)` / `(3' trimmed)`; остальное → trim + flag
- [ ] `useFragmentHandlers.handleSaveFragment` делегирует helper'у
- [ ] +15 unit-тестов в `split-annotations.test.js`
- [ ] `feat(split): biologically correct annotation trimming on mutagenesis split (K6, Sprint 1.6)`

### K8 — Цветовая подсветка мутаций в FragmentEditor (1–1.5 ч)
- [ ] Экспорт helper'а `computeMutationHighlights(fragment, parent)` → `Map<ntPos, 'silent'|'nonsilent'>`
- [ ] Primary: diff с parent-part через `sequenceDiff` (уже существует)
- [ ] Fallback: `fragment.mutations` (конservatively nonsilent)
- [ ] Рендер: DNA per-nt (red/yellow background + underline), protein per-codon
- [ ] Tooltip «Мутация: silent/nonsilent»
- [ ] +4 теста в `fragment-editor-highlights.test.js`
- [ ] `feat(fragment-editor): highlight mutations relative to parent (K8, Sprint 1.6)`

### K7 — Split-группа визуально на canvas (3–4 ч)
- [ ] `handleSaveFragment` (two/multi_fragment): ставит `splitGroupId`, `splitGroupParentName`, `splitGroupIndex`, `splitGroupTotal` на новые фрагменты
- [ ] `handleMutagenesis` (Wizard-путь) то же для non-KLD
- [ ] `DesignCanvas` группирует соседние фрагменты с одинаковым splitGroupId
- [ ] Группа рендерится с 4 визуальными эффектами: пунктирная рамка + тонированная подложка + badge «🧬 parent (split: N частей)» + соединительная линия
- [ ] +3 компонентных теста в `split-group-rendering.test.jsx`
- [ ] `feat(canvas): visual grouping for mutagenesis-split fragments (K7, Sprint 1.6)`

---

## STOP после K7

Не обновляю BUGS/PROJECT_STATE/DECISIONS и не перемещаю спеку в archive до визуальной приёмки Игорем. После приёмки — решение по 4 визуальным эффектам K7 (какие оставить, какие убрать).

## Regression guard

- Все существующие 663 Vitest тестов остаются зелёными
- После каждого коммита: `cd gui/designer && npx vitest run && npx vite build`

---

**Конец.**

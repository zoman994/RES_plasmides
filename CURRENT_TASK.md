# CURRENT_TASK.md — Sprint M-X.1 Structural Predictor

**Статус:** 🟡 Готов к реализации Code (спека готова 05.05.2026, v1.1).  
**Тип задачи:** A (новый алгоритмический слой + visual layer).  
**Спека:** `docs/SPRINT_M-X.1_STRUCTURAL_PREDICTOR.md` v1.1 (~30 KB).  
**Зависимость:** M-B.3 SequenceView + Snapgene Refresh закрыты и push'нуты (подтверждено Игорем 05.05).

---

## TL;DR

ИИ-аннотатор Wave 1 — frontend-only baseline. 4 детектора: CDS (retrofit existing ORF detection с predicted-флагом), σ70 promoter PWM, stem-loop terminator, sgRNA Cas9 scaffold БД-match. Predicted regions хранят internal evidence в `signals[]`, рендерятся unfilled+dashed на AnnotationTrack (vs filled solid у confident). Settings UI: per-source toggle + threshold slider, persistence в `bodgegene-ui-sequenceview`. Default visibility — Variant B (CDS+sgRNA on, promoter+terminator off).

**Persistence model — transient (DEC-PRED-06):** predicted regions вычисляются в SequenceView consumer через useMemo, не сохраняются в baseSnapshot, не входят в Snapshot.hash. ORFs выносятся из `enrichWithCommonFeatures()` в transient detection слой. Settings.predictions реактивны через useMemo dependency. M-X.2 Modal action "Принять как confident" → создаёт ContainerCommit type='annotation_edit' (единственный path к persisted).

После M-X.1 → M-X.2 Analyze Modal с Evidence tab (там signals разворачиваются) → M-X.3 backend Pfam → M-X.4 SignalP → M-X.5 AUGUSTUS интроны.

---

## Порядок чтения перед началом

1. `CLAUDE.md` (правила + лимиты размеров).
2. `BUGS.md` OPEN секция (на момент 05.05 пусто).
3. Этот файл.
4. `docs/SPRINT_M-X.1_STRUCTURAL_PREDICTOR.md` v1.1 (спека целиком — там §1 контекст + §4 архитектурные решения DEC-PRED-01..06 + §5 задачи + §6 acceptance + §9 риски).
5. По мере реализации — целевое чтение existing файлов: `auto-annotate.js` / `orf-detection.js` / `annotation-model.js` / `feature-detection.js` / `domain-detection.js` / `components/SequenceView/tracks/AnnotationTrack.jsx` / `components/SequenceView/index.jsx` / `components/SequenceView/SettingsPopover.jsx` / `store/uiSlice.js`.

---

## K1..K6 — чеклист

### K1 — Annotation model + ORF retrofit
- [ ] `src/annotation-model.js`: добавить `PREDICTOR_SOURCES` const (4 значения) + `isPredicted(annotation)` helper + JSDoc на расширенный shape (`predicted, source, confidence, signals`).
- [ ] `src/orf-detection.js`: `detectORFs()` возвращает regions с `predicted: true, source: PREDICTOR_SOURCES.ORF_SCAN, signals: [{type:'orf', aaLen}]`.
- [ ] +2-3 unit теста (`isPredicted()` + ORF predicted-flag verification).
- [ ] Existing ORF tests pass с расширенной структурой (regression).
- [ ] Build clean.

### K2 — `predicted-detection.js` (4 детектора + orchestrator)
- [ ] Новый файл `src/predicted-detection.js` с 4 функциями + `runPredictors(seq, settings, existingConfident)` orchestrator. Размер ~12-15 KB (под soft 20 KB).
- [ ] `detectORFsAsPredicted(seq, existing)` — wrapper над `detectORFs()` (после K1 уже даёт predicted-флаг).
- [ ] `detectPromotersSigma70(seq, threshold)` — PWM scan для -35 + -10 + 17±2 spacer. Signals: `[{-35}, {-10}, {spacer}]` per region.
- [ ] `detectTerminatorsStemLoop(seq, threshold)` — inverted repeats + GC scoring. Signals: `[{hairpin}]` per region.
- [ ] `detectGuideRNAScaffolds(seq)` — Cas9 scaffold ≥95% identity + 20 bp spacer upstream. Signals: `[{scaffold}, {spacer}]` per region.
- [ ] `runPredictors(seq, settings, existingConfident=[])` — orchestrator с дедупликацией (predicted overlapping confident → dropped; predicted-predicted overlap → highest confidence wins). Запускает только enabled детекторы по `settings.predictions`.
- [ ] +6-10 unit тестов в `__tests__/predicted-detection.test.js` (positive synthetic + negative random + dedup + orchestrator settings respect).
- [ ] Build clean.

### K3 — Consumer-level integration (DEC-PRED-06)
- [ ] `src/auto-annotate.js`: убрать вызов `detectORFs()` из `enrichWithCommonFeatures()`. Сигнатура остаётся `(seq, anns)` — без settings параметра. ORFs больше не пишутся в baseSnapshot.
- [ ] Cleanup `hasRealRegions` condition: убрать `a.detector === 'orf_scan'` (теперь ORF не приходит сюда).
- [ ] `components/SequenceView/index.jsx`: import `runPredictors` из `../../predicted-detection.js`.
- [ ] Новый useMemo: `predictedRegions = useMemo(() => runPredictors(fullSeq, settings.predictions, features), [fullSeq, settings.predictions, features])`.
- [ ] `mergeWithPredicted(features, predictedRegions)` helper (или extension `buildFeatureMap`): объединение confident + predicted в единый array перед передачей в `SequenceLine`.
- [ ] +3-5 integration тестов в `__tests__/index-composition.test.jsx`: settings toggle on/off реактивно (без re-import), threshold filter, confident vs predicted dedup, regression на baseSnapshot.regions без ORFs.

### K4 — AnnotationTrack visual для predicted
- [ ] `components/SequenceView/tracks/AnnotationTrack.jsx`: расширить render на predicted (`fill='transparent'` + fillOpacity 0.08, stroke=color, strokeWidth=1, strokeDasharray="3,2"). Chevron — same dashed.
- [ ] Label inside (когда влезает): italic + tilde prefix `~name`.
- [ ] Label leader-line: italic + tilde prefix.
- [ ] `data-predicted="true"` data-attr на predicted rect.
- [ ] `components/SequenceView/index.jsx → buildFeatureMap`: propag'ate `predicted, source, confidence, signals` поля в `feats.push({...})` для confident regions; те же поля приходят из predicted regions через `mergeWithPredicted`.
- [ ] +3-4 unit теста (`__tests__/annotation-track.test.jsx`): predicted vs confident render, mixed render, label tilde prefix, data-attr, italic style.
- [ ] Build clean, existing M-B.3 SequenceView tests pass (regression).

### K5 — Settings UI секция "Предсказания"
- [ ] `components/SequenceView/SettingsPopover.jsx`: новая section "Предсказания" — 4 toggle (CDS / Промоторы / Терминаторы / Guide RNAs) + slider 0.5..1.0 (default 0.7) + Reset кнопка.
- [ ] `store/uiSlice.js`: расширить `SEQUENCE_VIEW_DEFAULTS.predictions = { cds: true, sgRNA: true, promoter: false, terminator: false, threshold: 0.7 }`.
- [ ] `loadInitialSequenceView()`: defensive fallback если в old localStorage поле `predictions` отсутствует.
- [ ] Persistence через existing `bodgegene-ui-sequenceview` localStorage key.
- [ ] **Re-run trigger через useMemo dependency в SequenceView consumer (см. K3)** — не useEffect, не явный re-run кнопкой. Изменение settings.predictions → автоматический re-render AnnotationTrack.
- [ ] +4-5 unit тестов в `__tests__/settings-popover.test.jsx` (defaults verify, toggle persist, slider persist, reset, localStorage migration).

### K6 — Acceptance fixtures + integration tests
- [ ] Подготовить 3-4 acceptance plasmids:
  - pUC19.dna (existing test fixture)
  - pET-28b.dna или pET-22b.dna
  - один CRISPR plasmid из `crispr_plasmids` категории SnapGene (например pSpCas9-2A-Puro или pX330)
  - synthetic_predictors.dna — короткая тестовая последовательность с заранее вставленными `TTGACA-N17-TATAAT` + palindrome stem-loop + Cas9 scaffold (для проверки что все 4 детектора срабатывают на одном fragment)
- [ ] +3-5 integration тестов в `__tests__/index-composition.test.jsx`: confident + predicted mix, settings all-off → predicted hidden, threshold 0.95 → low-confidence filtered, **behavioral verify ORFs не в baseSnapshot.regions** (DEC-PRED-06 regression check).
- [ ] Final commit + отчёт в формате §8 спеки.

---

## STOP-условие

После K6 commit. **Не финализировать** PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / BUGS — финализация в отдельной сессии после визуальной приёмки Игорем (§6 спеки).

При обнаружении регрессии в M-B.3 SequenceView (existing tests fail после K4 правки AnnotationTrack) — **остановиться** и уведомить Игоря в PROJECT_STATE journal entry. Не пытаться обойти регрессию — может быть архитектурный конфликт между K4 visual и M-B.3 stacking logic.

---

## Формат отчёта Code (в конце этого файла после K6)

```
## Отчёт Code по Sprint M-X.1

### Commits
- K1: <hash> annotation-model + ORF retrofit
- K2: <hash> predicted-detection.js (4 детектора + orchestrator)
- K3: <hash> consumer-level integration (cleanup auto-annotate + SequenceView useMemo)
- K4: <hash> AnnotationTrack visual + propagation
- K5: <hash> Settings UI + persistence
- K6: <hash> acceptance fixtures + integration tests

### Тесты
Vitest: NEW_COUNT/TOTAL (Δ +X)
Pytest: 115/115 (без изменений)

### Build
Bundle delta: +X KB / +Y KB gzip

### Size budget
Новые нарушители: 0 (или явный список)
Warning signal: <файлы выросшие >5 KB>

### Отклонения от спеки
<явный список>

### Что pending для Игоря
- Визуальная приёмка по §6 спеки.
- Acceptance plasmids: <пути к 3-4 fixtures>
```

---

## Wave 1 progress tracker

- 🟡 **M-X.1 Structural Predictor** (frontend baseline) — текущий sprint, спека готова v1.1.
- ⚪ M-X.2 Analyze Modal + Region info tab + "Принять как confident" action (frontend) — после M-X.1 acceptance.
- ⚪ M-X.3 Backend Pfam (pyhmmer) + Domains tab — первый backend dep, требует решения 4 open questions из CURRENT_TASK 04.05 §4.A (deployment / SignalP лицензия / AUGUSTUS species / Pfam scope).
- ⚪ M-X.4 SignalP / Phobius + Subcellular tabs.
- ⚪ M-X.5 AUGUSTUS intron prediction tab.

После Wave 1 целиком → **Wave 1.5 ИИ enhancement** (DNABERT-2 LoRA / HyenaDNA на 4 GB VRAM) — спека пишется отдельно после Wave 1 finished. **Wave 2** (NCBI / CAZy / open plasmids integration) — параллельно с M-X.3-5 если ресурс позволит, дефолт после Wave 1.

Историческая agenda по Wave 2 — в `TECH_DEBT.md` entries (TD-OPEN-PLASMID-REPOS, TD-CAZY-INTEGRATION, TD-ADDGENE-API-PENDING).

---

## Handoff для Code

> Прочитай `CLAUDE.md`, `BUGS.md`, `CURRENT_TASK.md`, `docs/SPRINT_M-X.1_STRUCTURAL_PREDICTOR.md` v1.1. Выполни Sprint M-X.1 K1..K6 на новой ветке `feature/structural-predictor` от main HEAD (после push'а v0.7.1 release block). Размер модулей в зоне правки — все в зелёной зоне (см. §0 спеки), декомпозиций до K1 не требуется. Тесты пишутся первыми (TDD), затем код, затем `npx vitest run && npx vite build` после каждого K-шага. **STOP после K6 commit** — не push, не финализируй PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT / BUGS, жди визуальной приёмки Игоря по §6 спеки. **Ключевое архитектурное решение DEC-PRED-06** (transient predicted regions, не в baseSnapshot) — критично для K3, не отклоняйся: ORFs выносятся из `enrichWithCommonFeatures()`, predicted detection живёт ТОЛЬКО в SequenceView consumer через useMemo. При регрессии в M-B.3 SequenceView tests после K4 — остановись и уведоми в журнале.

# Sprint M-X.1 — Structural Predictor (frontend baseline)

**Версия спеки:** v1.1 (05.05.2026)  
**Тип задачи:** A (новый алгоритмический слой + visual layer)  
**Wave / Milestone:** Wave 1 M-X.1 — первый sprint аннотатора, frontend-only baseline. Дальше M-X.2 (Analyze Modal с Evidence tab) → M-X.3 (Pfam backend) → M-X.4 (SignalP) → M-X.5 (AUGUSTUS).  
**Зависимость:** M-B.3 SequenceView (закрыт + push'нут на момент старта).

---

## §0. Срез размеров затрагиваемых модулей

| Файл | Размер сейчас | После M-X.1 (прогноз) | Зона |
|---|---|---|---|
| `src/auto-annotate.js` | 14.38 KB | ~14 KB (минус ORF dispatch, см. K3) | safe |
| `src/annotation-model.js` | 2.78 KB | ~3.5 KB (+ predicted constants) | safe |
| `src/orf-detection.js` | 3.39 KB | ~3.5 KB (+ predicted flag) | safe |
| `src/feature-palette.js` | 12.00 KB | без изменений | safe |
| `src/predicted-detection.js` | НЕ существует | ~12-15 KB (новый файл) | safe |
| `components/SequenceView/tracks/AnnotationTrack.jsx` | 11.97 KB | ~14 KB (+ unfilled+dashed render) | safe |
| `components/SequenceView/index.jsx` | 18.38 KB | ~19.5 KB (+ useMemo predictedRegions + merge helper) | safe |
| `components/SequenceView/SettingsPopover.jsx` | 10.68 KB | ~14-15 KB (+ Predictions section) | safe |
| `store/uiSlice.js` (sequenceView slice) | не измерено отдельно | +0.5 KB (predictions defaults) | safe |

Все файлы остаются в зелёной зоне. Hard 40 KB (.jsx) / 25 KB (.js) не близки. Декомпозиций до K1 не требуется.

---

## §1. Контекст

### Существующая инфраструктура (что уже работает)

Pipeline аннотации при импорте unannotated sequence сейчас идёт в два прохода:

1. **`auto-annotate.js → autoAnnotate(part)`** — instant, pattern-based. Кладёт одну region на всю последовательность (если нет existing regions), детектирует start/stop codon, His-tag, named protein tags (PEPTIDE_TAGS + FUSION_PARTNERS), RE sites. Уровни: region / detail / point.
2. **`auto-annotate.js → enrichWithCommonFeatures(seq, anns)`** — async. Грузит `common-features.json` (419 features после refresh `ba5218a`), матчит через `feature-detection.js → detectCommonFeatures()` (CDS protein exact/fuzzy + non-CDS DNA identity ≥0.96), потом запускает `orf-detection.js → detectORFs()` (ATG→stop ≥100 aa, обе цепи, до 6 ORFs).

**Annotation model** (`annotation-model.js`): три уровня (region / detail / point), `getRegions()` с id-backfill, `REGION_RENDER_RULES` per-type. Все annotations живут одним массивом `annotations[]` на entity.

**SequenceView (M-B.3)** рендерит `regions` из `getRegions()` через `AnnotationTrack` — multi-row stacked, latest-wins per-position для StrandsTrack tint, leader-line labels, overflow `+N more`. Все regions сейчас отображаются **одинаково** filled solid.

### Past lesson (важно)

В шапке `auto-annotate.js` стоит комментарий:

> "linker / -10 / -35 / RBS / TATA / CAAT / poly-A / signal-peptide / pro-peptide consensus detectors были удалены из auto-annotate. Их 6–8 bp signatures имели high false-positive rates и производили 25+ Linker N + flock of -10 element / RBS spurious entries на каждой плазмиде, drowning LinearFeatureBar в leader-labels."

Прошлый sprint обжёгся на низкоспецифичных детекторах. M-X.1 не должен повторить эту ошибку. Решение (см. §4 DEC-PRED-01): **detail-level элементы (-10, -35, hairpin arms, scaffold parts) хранятся внутри predicted region как internal evidence (`signals[]`), но НЕ выносятся как отдельные annotations**. Финальная аннотация = одна region на найденный structural feature. Биолог видит "Probable promoter" одним unfilled+dashed контуром, а не россыпь -10/-35/spacer элементов.

### Что не работает / чего не хватает

При импорте unannotated sequence (custom construct, fragment с ORI без known features, чужая последовательность из публикации) биолог сейчас видит:
- Region annotations только из `common-features.json` (если matched) + ORF detection (для CDS ≥100 aa).
- **Все они выглядят одинаково** — confident match из БД и predicted ORF от ATG-сканера.
- Promoters / terminators / sgRNA НЕ детектируются вообще.

Биолог теряется на пустой плазмиде. M-X.1 закрывает три проблемы:

1. **Visual disambiguation:** confident (из common-features БД, из manual user input) ≠ predicted (algorithmic guess). Filled solid vs unfilled+dashed.
2. **Дополнительные категории:** σ70 promoters (прокариоты), stem-loop terminators, sgRNA scaffolds — три новых детектора рядом с существующим CDS predictor (ORF detection).
3. **Provenance evidence:** "почему этот регион promoter" — вытащить наружу через signals[] в аннотации, сделать видимым в M-X.2 Modal Evidence tab.

---

## §2. Стратегия

Predicted-слой = новый flag `predicted: true` на region annotation объектах с дополнительными полями `source / confidence / signals`. Detection logic в новом файле `predicted-detection.js` (4 функции: σ70 PWM, stem-loop scoring, sgRNA scaffold БД-match, retrofit ORF detection с predicted-флагом + orchestrator). Internal evidence (-10/-35 для promoter, hairpin arm coordinates для terminator, scaffold match position для sgRNA, ATG/stop coords для ORF) хранится в `region.signals[]` без выноса как separate annotations.

**Persistence model — transient (DEC-PRED-06):** `runPredictors(sequence, settings)` вызывается **в SequenceView consumer** через useMemo (dependency: sequence + settings.predictions). Predicted regions объединяются с confident regions на render, не персистируются в `baseSnapshot.regions[]`, не входят в Snapshot.hash. ORFs вынесены из `enrichWithCommonFeatures()` в transient detection слой вместе с остальными predictors. Settings.predictions = personal preference, не фиксируется в .bodge файле.

AnnotationTrack расширяется на render mode "predicted" (unfilled rect, dashed stroke, italic label с tilde prefix). Settings UI в SettingsPopover получает секцию "Предсказания" с per-source toggle и threshold slider; persistence через existing `uiSlice.sequenceView`.

---

## §3. Scope

### IN

- **4 detector функции** в `predicted-detection.js`:
  - `detectORFsAsPredicted(seq, existing)` — wrapper над `detectORFs()` с `predicted: true` + `signals: [{type:'orf', start, end, aaLen}]`.
  - `detectPromotersSigma70(seq, threshold)` — PWM scan для σ70 (-10 + -35 + 17±2 bp spacer для прокариот). Возвращает predicted regions с `signals: [{type:'-10', start, end, score, sequence}, {type:'-35', ...}, {type:'spacer', length}]`.
  - `detectTerminatorsStemLoop(seq, threshold)` — поиск inverted repeats + грубая ΔG estimation (sliding window ≥4 nt stem, loop 3-8 nt, GC content в stem). Predicted regions с `signals: [{type:'hairpin', stemStart, stemEnd, loopStart, loopEnd, deltaG}]`.
  - `detectGuideRNAScaffolds(seq)` — match Cas9 scaffold (76 bp consensus + variants) с identity ≥95%. Spacer 20 bp upstream (если присутствует) — second region. Predicted regions с `signals: [{type:'scaffold', identity, variant}, {type:'spacer', start, end}]`.
- **Annotation model extension:** добавить optional fields `predicted: boolean`, `source: string` (имя детектора), `confidence: number 0..1`, `signals: array<object>` в annotation schema (`annotation-model.js` — добавить `PREDICTOR_SOURCES` const + `isPredicted()` helper).
- **Consumer-level integration (DEC-PRED-06):** `runPredictors(seq, settings)` вызывается в **SequenceView consumer** через useMemo (dependency: sequence + settings.predictions). Predicted regions объединяются с confident regions (из props.fragments → baseSnapshot.regions через `buildFeatureMap`) на render. `enrichWithCommonFeatures()` очищается от вызова `detectORFs()` — ORFs становятся transient (как все остальные predicted), не persisted в baseSnapshot.
- **Visual extension AnnotationTrack:** если `region.predicted === true` → render `<rect>` без fill (или fillOpacity ≤0.15), stroke=color, strokeWidth=1, strokeDasharray="3,2". Chevron — same dashed. Label — italic + tilde prefix `~name` (pLannotate convention).
- **Settings UI секция "Предсказания":**
  - 4 toggle (CDS via ORF / Promoters / Terminators / Guide RNAs).
  - 1 threshold slider 0.5..1.0 (default 0.7) — общий confidence cutoff.
  - Default per-source visibility (см. §4 DEC-PRED-03): `cds: true, sgRNA: true, promoter: false, terminator: false`.
- **Tests:** unit per detector (≥3 случая каждый, включая negative controls на random sequence), integration test в SequenceView render predicted vs confident, regression на existing AnnotationTrack tests (filled solid не сломан).
- **Acceptance:** визуальная приёмка на 3-4 плазмидах (см. §6).

### OUT

- TATA-box detection и эукариотические promoters (отложено в M-X.1.1 после feedback от Игоря на σ70).
- Detail-level annotations для elements внутри predicted region (-10/-35/hairpin arms как separate annotations) — хранятся только в `signals[]`. Биолог может вручную добавить detail-аннотации если нужно.
- Intron prediction — отложено в M-X.5 (AUGUSTUS backend) per "click on CDS region → run AUGUSTUS" workflow.
- Signal peptide / propeptide / linkers — `domain-detection.js` остаётся dormant до M-X.4 (SignalP / Phobius backend в Modal как on-demand action).
- Analyze Modal с Evidence tab — это M-X.2.
- Backend infrastructure (Pfam HMM, AUGUSTUS, SignalP) — M-X.3+.
- ИИ-предсказания (DNABERT-2, HyenaDNA) — Wave 1.5 после Wave 1.
- Apply / Reject UI на predicted regions — отложено в M-X.2 Modal (там кнопки "Принять как confident" → ContainerCommit type='annotation_edit', "Отклонить" → удалить из transient view).
- Persisted predictions в baseSnapshot — DEC-PRED-06 запрещает (см. §4).

---

## §4. Архитектурные решения

### DEC-PRED-01 — Internal evidence в `signals[]`, не как separate annotations

Predicted region хранит `signals[]` как internal evidence detection algorithm. Например для σ70 promoter:

```
{
  level: 'region',
  type: 'promoter',
  start: 145,
  end: 195,
  predicted: true,
  source: 'sigma70_pwm',
  confidence: 0.78,
  signals: [
    { type: '-35', start: 148, end: 154, score: 0.82, sequence: 'TTGACA' },
    { type: '-10', start: 165, end: 171, score: 0.74, sequence: 'TATAAT' },
    { type: 'spacer', start: 154, end: 165, length: 11 }
  ],
  name: 'Probable σ70 promoter',
  ...
}
```

На SequenceView и в финальном экспорте рендерится **одна** region (unfilled+dashed). В M-X.2 Modal Evidence tab signals разворачиваются в табличный вид. Это ровно лечит проблему past-removal (drowning labels): LinearFeatureBar получает 1 leader на promoter, не 3.

**Почему не отдельные detail annotations:** detail-level аннотации идут в `getDetails()` и рендерились бы как отдельные мелкие тики на AnnotationTrack или в детальном multi-track view. На плазмиде с 5 потенциальными промоторами это 15+ extra labels — drowning. Хранение signals в parent region — single source of truth, optional rendering only on demand (M-X.2 Modal).

### DEC-PRED-02 — Existing ORF detection retrofit на `predicted: true`

`orf-detection.js → detectORFs()` сейчас возвращает regions без `predicted` флага, рендерятся filled solid одинаково с common-features hits. Это путает биолога: ORF от ATG-сканера и подтверждённая common-features аннотация выглядят идентично.

**Изменение:** `detectORFs()` добавляет `predicted: true, source: 'orf_scan', confidence: aaLen-based, signals: [{type:'orf', aaLen}]`. После K3 ORFs приходят на render через transient detection (не из baseSnapshot) — биолог видит их пунктирным контуром.

**Поведенческий impact:** биолог импортирующий plasmid с ORFs видит их теперь пунктирным контуром, а не сплошным синим. Биологически правильно (ORF = predicted ATG→stop, не аннотированный CDS), но visual change. Это noted в release notes.

Confidence из существующего кода: `aaLen > 200 → 0.9, aaLen > 150 → 0.7, else 0.5`. Threshold slider в Settings отфильтровывает low-confidence (< user threshold) — биолог может задрать ползунок до 0.85 и видеть только большие ORFs.

### DEC-PRED-03 — Variant B default visibility (per-source)

Default per-source toggle в Settings:

| Детектор | Default | Обоснование |
|---|---|---|
| CDS via ORF | ON | High specificity (ATG→stop ≥100 aa, фильтрация overlaps с existing CDS). На большинстве плазмид даёт 0-3 hits, не drowning. Уже работал в v0.6 — биолог привык. |
| sgRNA scaffold | ON | High specificity (76 bp Cas9 scaffold БД-match identity ≥95%). На non-CRISPR плазмидах 0 hits, на CRISPR — 1-2 hits. Не drowning. |
| Promoter (σ70 PWM) | OFF | Low specificity. На 5 kb прокариотической плазмиде PWM находит 5-20 hits даже при threshold 0.7. Биолог явно opt-in когда работает с unannotated прокариотическим вектором. |
| Terminator (stem-loop) | OFF | Low specificity. Inverted repeats встречаются в любой ДНК; ΔG estimation без термодинамической модели даёт false positives. Opt-in. |

Threshold slider общий, default 0.7. Биолог может поднять до 0.85+ для агрессивной фильтрации.

### DEC-PRED-04 — Intron detection deferred to M-X.5

Frontend-only intron detection шумит сильно (consensus splice GT/AG = 2 nt → сотни кандидатов на 5 kb). Species-specific intron prediction делает AUGUSTUS (backend в M-X.5). Workflow для биолога: click на CDS region в SequenceView → M-X.2 Modal → "Run AUGUSTUS" (на M-X.5). M-X.1 не пытается guess intronов.

### DEC-PRED-05 — Visual язык pLannotate

Filled solid = confident (manual + common-features БД hit). Unfilled (или fillOpacity ≤0.15) + dashed stroke + italic label с `~` prefix = predicted. Hover (M-X.2 reserved) показывает source + confidence + spec evidence. Chevron в обоих случаях — но dashed для predicted сохраняет direction info. Этот язык наследует pLannotate (NAR 2021), который уже знаком biocomputational community.

### DEC-PRED-06 — Predicted regions transient, не в baseSnapshot

Predicted regions вычисляются в SequenceView consumer через `runPredictors(sequence, settings)` (useMemo dependency на sequence + settings.predictions). Не сохраняются в `baseSnapshot.regions[]` и не входят в Snapshot.hash (ARCHITECTURE_v2 §2.8 replay invariants). Settings.predictions — personal preference, не фиксируется в .bodge файле.

**Последствия:**
- `enrichWithCommonFeatures()` больше не вызывает `detectORFs()`. ORFs выносятся в transient detection слой вместе с остальными predictors. **Поведенческое изменение** для existing M-B.3 Importer flow: новые импорты больше не пишут ORFs в baseSnapshot. Для v0.6+ wipe-data approach (DEC-V2-08) impact минимален — saved containers в Library нет на момент M-X.1.
- Settings.predictions в SettingsPopover срабатывают реактивно — изменение toggle или threshold сразу обновляет AnnotationTrack без явного "Re-detect" action.
- M-X.2 Modal action "Принять как confident" → создаёт явный ContainerCommit type=`annotation_edit` с payload `{add: [regionWithoutPredictedFlag]}`. Replay добавляет region в baseSnapshot.regions[]. Это единственный path от transient к persisted, и он явный + фиксируется в commits[] (совместимо с principle 1.5 «provenance side-effect»).
- LibraryEntry фризит только confident regions (DEC-LIB-05). Другой биолог открывший entry в своём проекте с другими settings.predictions увидит свои предсказания на той же последовательности — правильный UX (predictions = personal view, не fixed в data file).

---

## §5. Задачи K1..K6

### K1 — Annotation model + ORF retrofit

**Файлы:**
- `src/annotation-model.js` — добавить:
  - export const `PREDICTOR_SOURCES = { ORF_SCAN: 'orf_scan', SIGMA70_PWM: 'sigma70_pwm', STEM_LOOP: 'stem_loop', SGRNA_SCAFFOLD: 'sgrna_scaffold' }`.
  - export `isPredicted(annotation)` helper (для consumer'ов).
  - JSDoc на annotation shape с новыми optional fields (`predicted`, `source`, `confidence`, `signals`).
- `src/orf-detection.js` — `detectORFs()` возвращает regions с `predicted: true, source: PREDICTOR_SOURCES.ORF_SCAN, signals: [{type:'orf', aaLen}]`. Confidence остаётся существующим (aaLen-based).

**Тесты:**
- `isPredicted({predicted: true})` → true; `isPredicted({})` → false.
- `detectORFs()` на pUC19 sequence: возвращает ORFs все с `predicted: true, source: 'orf_scan'`.
- Existing ORF tests должны pass с расширенной структурой (regression).

**Артефакты:** ~5 строк на annotation-model + ~10 строк правки в `detectORFs()`. Тестов 3-5 новых.

### K2 — `predicted-detection.js` (4 детектора + orchestrator)

**Новый файл `src/predicted-detection.js`** с 4 detection функциями + `runPredictors(seq, settings)` orchestrator. Размер ~12-15 KB (под soft 20 KB).

| Функция | Возвращает | Примечания |
|---|---|---|
| `detectORFsAsPredicted(seq, existing)` | Array<region with signals[orf]> | Wrapper над `detectORFs()` (после K1 уже даёт predicted-флаг). Existing — для дедупликации против confident CDS. |
| `detectPromotersSigma70(seq, threshold)` | Array<region with signals[-35, -10, spacer]> | PWM score = product log-odds. Threshold по composite score. Spacer length filter 15-19. Min sequence 50 nt. |
| `detectTerminatorsStemLoop(seq, threshold)` | Array<region with signals[hairpin]> | Stem ≥5 nt, loop 3-8 nt, mismatch ≤1. Score = stem GC content × (1 - mismatch_fraction). ΔG approx без полной NN-модели. |
| `detectGuideRNAScaffolds(seq)` | Array<region with signals[scaffold, spacer]> | DNA identity ≥95% против `CAS9_SCAFFOLD` + 2-3 known variants. Spacer = 20 bp upstream от scaffold start. |
| `runPredictors(seq, settings, existingConfident)` | Array<region> (combined) | Запускает только enabled детекторы по `settings.predictions`. Дедупликация через overlap check: predicted overlapping confident (>50%) → dropped, predicted-predicted overlap → highest confidence wins. |

**Сигнатура orchestrator:**

```
runPredictors(sequence, predictionsSettings, existingConfidentRegions = [])
  → Array<predictedRegion>
```

Третий параметр `existingConfidentRegions` нужен для дедупликации (predicted ORF не должен дублировать common-features CDS).

**Constants внутри файла:**
- `SIGMA70_MINUS35_PWM` (6×4 matrix, RegulonDB 2024 — см. §10 #2).
- `SIGMA70_MINUS10_PWM` (6×4 matrix).
- `CAS9_SCAFFOLD` (76 nt SpCas9 consensus).
- `CAS9_SCAFFOLD_VARIANTS` (массив 2-3 known variants).

**Тесты (`src/__tests__/predicted-detection.test.js`):**
- σ70 PWM: positive — synthetic `TTGACA-N17-TATAAT` → detect with confidence ≥0.8. Negative — random 200 bp seq, threshold 0.7 → 0-1 hits.
- Stem-loop: positive — synthetic palindrome `GCCCGC[N5]GCGGGC` → detect. Negative — random — ≤1 hit.
- sgRNA: positive — sequence with `CAS9_SCAFFOLD` embedded → detect both scaffold and 20 bp spacer. Negative — pUC19 sequence → 0 hits.
- ORF wrapper: pUC19 with 1 known ORF (lacZα) → returns 1 predicted region with `signals[orf]`.
- Orchestrator: settings `{cds:true, others:false}` → only ORF results returned. `{all true}` → all 4 detectors.
- Dedup: predicted overlapping confident region in existingConfident → predicted dropped.

### K3 — Consumer-level integration (DEC-PRED-06)

**Цель:** вынести detection predicted regions из baseSnapshot в transient SequenceView consumer layer.

**Файл `src/auto-annotate.js`:**
- Убрать вызов `detectORFs()` из `enrichWithCommonFeatures()`. ORFs больше не пишутся в baseSnapshot.regions при импорте.
- Сигнатура `enrichWithCommonFeatures(seq, anns)` остаётся с двумя параметрами, без settings — детектирует только common-features hits (это persistent и ok, их находка deterministic от свежести БД).
- Фильтр "remove generic misc_feature если hasRealRegions" в конце функции остаётся, но без ORF в проверке (`a.detector === 'orf_scan'` убрать из hasRealRegions condition — теперь ORF не приходит сюда вообще).

**Файл `components/SequenceView/index.jsx`:**
- Импорт `runPredictors` из `../../predicted-detection.js`.
- Новый useMemo:
  ```
  predictedRegions = useMemo(
    () => runPredictors(fullSeq, settings.predictions, features),
    [fullSeq, settings.predictions, features]
  )
  ```
  Запускается при изменении sequence (редко), settings.predictions (toggle/slider), или features (новый импорт).
- Расширить `buildFeatureMap` или новый wrapping helper `mergeWithPredicted(features, predictedRegions)`: объединение confident features + predicted regions в единый array перед передачей в `SequenceLine`.
- Передавать объединённый `features` в SequenceLine (как сейчас, но теперь включает predicted).

**Что про visibility filter:** не нужен отдельно. `runPredictors` уже уважает toggles в settings (orchestrator из K2 запускает только enabled детекторы). Threshold slider фильтрует low-confidence внутри каждого детектора.

**Тесты (`components/SequenceView/__tests__/index-composition.test.jsx`):**
- Импорт plasmid с known features из common-features → confident regions (filled). В baseSnapshot.regions нет ORFs (regression check после K3 cleanup).
- SequenceView рендерит confident + predicted ORFs (приходят из useMemo) вместе в AnnotationTrack — первые filled, вторые dashed.
- Settings.predictions.cds=false → ORFs исчезают из render. Settings.predictions.cds=true → появляются без re-import.
- Threshold slider: 0.95 → low-confidence predicted (< 0.95) скрываются.
- Confident vs predicted dedup: ORF overlapping common-features CDS → ORF падает (внутри runPredictors).

**Миграционная заметка:** в отчёте K3 commit Code явно отмечает список вызовов `enrichWithCommonFeatures` по проекту (grep) — все остаются без изменения сигнатуры. Функция больше не отвечает за predicted detection.

### K4 — AnnotationTrack visual для predicted

**Файл `components/SequenceView/tracks/AnnotationTrack.jsx`:**

Сейчас `<rect>` рендерится с `fill={color}, stroke="#3A2F1F", strokeWidth=0.5`. Расширить:

```
const isPredicted = region.predicted === true;
const fill = isPredicted ? 'transparent' : ensureColor(region.color);
const stroke = isPredicted ? ensureColor(region.color) : '#3A2F1F';
const strokeWidth = isPredicted ? 1 : 0.5;
const strokeDasharray = isPredicted ? '3,2' : undefined;
```

Chevron path — same `stroke` + `strokeDasharray`. Label:
- Inside label (когда влезает): для predicted — italic, цвет тёмный (`#3A2F1F`), tilde prefix.
- Leader-line label: italic, tilde prefix.

`<rect>`: добавить fillOpacity 0.08 для predicted (very subtle background tint в цвет региона) — биолог видит что regions с одного типа группируются по цвету even на пунктире. Если визуально мешает — Code убирает в acceptance.

**`SequenceView/index.jsx → buildFeatureMap`:** propag'ate новые поля для каждой region:
```
feats.push({
  ...existing fields,
  predicted: r.predicted,
  source: r.source,
  confidence: r.confidence,
  signals: r.signals,
});
```
Применяется как для confident regions (из fragments), так и для predicted regions (из useMemo через mergeWithPredicted).

**Тесты (`components/SequenceView/__tests__/annotation-track.test.jsx`):**
- Predicted region rendered с `data-predicted="true"` (новый data-attr).
- Confident region rendered как раньше (regression).
- Mixed: 2 confident + 2 predicted → 4 rects, 2 с `stroke-dasharray`.
- Label tilde prefix: `~Probable promoter` для predicted, `Probable promoter` для confident.
- Label стиль italic для predicted (через `font-style: italic` в `<text>`).

### K5 — Settings UI секция "Предсказания"

**Файл `components/SequenceView/SettingsPopover.jsx`:**

Новая секция `<fieldset>` после existing sections:

```
Предсказания
  [✓] CDS (ORF detection)
  [ ] Промоторы (σ70 PWM)
  [ ] Терминаторы (stem-loop)
  [✓] Guide RNAs
  
  Минимальная уверенность: [slider 0.5—1.0]  0.70
  
  [Сбросить к умолчаниям]
```

**Файл `store/uiSlice.js`:** расширить `SEQUENCE_VIEW_DEFAULTS`:

```
predictions: {
  cds: true,
  sgRNA: true,
  promoter: false,
  terminator: false,
  threshold: 0.7,
}
```

`loadInitialSequenceView()`: defensive fallback если в old localStorage поле `predictions` отсутствует — добавить дефолты.

Persistence через existing localStorage `bodgegene-ui-sequenceview` — существующая `loadInitialSequenceView()` валидирует поля; добавить валидацию для `predictions` (default fallback если поля отсутствуют в old localStorage).

**Re-run триггер:** изменение settings.predictions автоматически re-runs `runPredictors` через useMemo dependency в SequenceView consumer (см. K3 + DEC-PRED-06). На 5 kb плазмиде < 100 ms — ниже UX threshold. Если perf станет проблемой на больших плазмидах — добавим cache key (sequence hash + settings hash) в M-X.1.1.

**Тесты (`components/SequenceView/__tests__/settings-popover.test.jsx`):**
- Predictions section visible с 4 toggles + slider.
- Default values: CDS + sgRNA on, promoter + terminator off, threshold 0.7.
- Toggle change persists в localStorage.
- Slider change persists.
- Reset кнопка возвращает к defaults.
- localStorage migration: old payload без `predictions` field → defaults применены.

### K6 — Acceptance fixtures + integration tests

**Acceptance plasmids (для §6 чеклиста):**
1. **pUC19** — confident (lacZα CDS, AmpR, lacZα promoter) + predicted ORF (если detection пройдёт через дедуп против AmpR). Базовый sanity check: confident filled + predicted dashed visible together.
2. **pET-28b или pET-22b** — confident KanR + T7 promoter (из common-features). Settings → enable promoter detection → ожидаемо detect σ70 промотор upstream KanR.
3. **CRISPR plasmid** (любой из категории `crispr_plasmids`) — predicted sgRNA scaffold + 20 bp spacer detected.
4. **Synthetic test fragment** — короткая последовательность с заранее вставленными `TTGACA-N17-TATAAT` (σ70 consensus) + palindrome stem-loop + Cas9 scaffold. Проверка что все 4 детектора срабатывают на 1 fragment.

**Integration tests (`components/SequenceView/__tests__/index-composition.test.jsx`):**
- SequenceView с 1 confident + 1 predicted region → 2 annotation rects, 1 dashed.
- Settings predictions all-off → predicted regions не рендерятся.
- Settings threshold 0.95 → low-confidence predicted (< 0.95) скрываются.
- **Regression check:** baseSnapshot.regions после import НЕ содержит ORFs (раньше содержал — проверка что K3 cleanup не оставил ORF в baseSnapshot).
- Settings.predictions.cds toggle off → on → off without re-import: ORFs появляются и исчезают на лету.

---

## §6. Acceptance чеклист (визуальный)

После реализации Code и перед финализацией спринта Игорь проходит этот чеклист на dev-сервере (`cd gui/designer && npm run dev`):

- [ ] Импорт pUC19.dna в Importer → SequenceView показывает lacZα / AmpR / lacZα promoter **filled solid** (confident из common-features). Любые ORFs (если detection не отфильтровал) — **unfilled+dashed** с italic+tilde label.
- [ ] Settings ⚙ → секция "Предсказания" видна, 4 toggle + slider + Reset.
- [ ] Toggle "Промоторы" → ON, threshold 0.7. На pBR322 или pET-28b появляются predicted promoters — пунктирные контуры зелёного оттенка (тип promoter color), italic labels `~Probable σ70 promoter`. **Появляются без re-import (реактивно через useMemo).**
- [ ] Threshold slider → 0.85: predicted promoters с low confidence исчезают на лету, остаются 1-2 высокоуверенных hit.
- [ ] Toggle "Терминаторы" → ON: на pET-28b (T7 terminator known) появляются predicted stem-loop near T7 termination region. Существующий confident T7 terminator (из common-features) остаётся filled solid рядом.
- [ ] Импорт CRISPR плазмиды (например pSpCas9-2A-Puro) → predicted sgRNA scaffold detected как unfilled+dashed teal/cyan region. 20 bp spacer upstream — отдельный predicted region.
- [ ] Перезагрузка страницы → settings.predictions сохранены (localStorage `bodgegene-ui-sequenceview`).
- [ ] Confident annotation labels БЕЗ tilde prefix, БЕЗ italic. Predicted — С tilde prefix, italic.
- [ ] Multi-row stacking: confident + predicted overlap → раскладываются по разным rows AnnotationTrack (existing M-B.3 infra работает).
- [ ] Settings → Reset кнопка возвращает к defaults (CDS+sgRNA on, promoter+terminator off, threshold 0.7).
- [ ] **Regression check:** plasmid после импорта в Library — re-open в новой session с другими settings.predictions → видно свои предсказания (DEC-PRED-06: predictions personal, не frozen в Library).
- [ ] **Performance check:** 8.8 kb плазмида с все 4 detection on, threshold 0.7 → first paint < 250 ms (existing tracksReady defer срабатывает), runPredictors < 200 ms.
- [ ] **Behavioral change verify:** baseSnapshot.regions нового импорта **не содержит ORFs** (DEC-PRED-06: ORFs transient). Можно проверить через React DevTools → fragment.annotations.

---

## §7. Порядок выполнения

K1 → K2 → K3 → K4 → K5 → K6 строго последовательно. K2 — самый объёмный шаг (PWM tuning, stem-loop scoring без ΔG библиотеки, sgRNA scaffold variant collection, тесты на synthetic + real plasmids). K4 нельзя начинать пока K3 не закрыт (AnnotationTrack читает propagated `predicted` поле, которое объединяется в `mergeWithPredicted` на K3).

---

## §8. STOP-условие и формат отчёта

**STOP после K6 commit (последний коммит спринта).** Не финализировать `PROJECT_STATE.md` / `RELEASES.md` / `DECISIONS.md` / `ANCHORS.md` / `TECH_DEBT.md` / `BUGS.md` — финализация в отдельной сессии после визуальной приёмки Игорем (§6 чеклист).

**Формат отчёта Code в конце CURRENT_TASK.md:**

```
## Отчёт Code по Sprint M-X.1

### K1..K6 commits
- K1: <hash> annotation-model + ORF retrofit
- K2: <hash> predicted-detection.js (4 детектора + orchestrator)
- K3: <hash> consumer-level integration (cleanup auto-annotate + SequenceView useMemo)
- K4: <hash> AnnotationTrack visual + propagation
- K5: <hash> Settings UI + persistence
- K6: <hash> acceptance fixtures + integration tests

### Тесты
Vitest: NEW/TOTAL → NEW/TOTAL (Δ +X)
Pytest: 115/115 (без изменений — backend не тронут)

### Build
Bundle delta: +X KB / +Y KB gzip

### Size budget
Новые нарушители: 0
Warning signal: predicted-detection.js X KB (под soft 20)
                AnnotationTrack.jsx Y KB (под soft 30)
                SettingsPopover.jsx Z KB (под soft 30)

### Отклонения от спеки
<явный список даже мелких>

### Что pending для Игоря
- Визуальная приёмка по §6 чеклисту.
- 4 plasmids fixtures: pUC19 / pET-28b / pSpCas9 (или эквивалент) / synthetic_predictors.dna.
```

---

## §9. Риски

1. **σ70 PWM шумит несмотря на per-source toggle.** Биолог включит "Промоторы" на 5 kb плазмиде, threshold 0.7 — увидит 15+ predicted promoters → drowning. Митigaция: PWM tuning на benchmark dataset (e.g. RegulonDB σ70 promoters), default threshold 0.75 если 0.7 окажется шумным. Если на acceptance pET-28b даёт >5 predicted promoters при default settings — Code снижает default до threshold=0.8.
2. **Performance regression на 10+ kb плазмиде.** Все 4 детектора enabled + threshold 0.5 → runPredictors на 12 kb pJAZZ-OK может занять >500 ms, blocking re-render при toggle Settings. Митigaция: каждый детектор должен быть O(n) по длине, без квадратичных complexity. Добавить timing warnings в dev mode (console.warn если runPredictors > 300 ms). Мемоизация useMemo защищает от ненужных re-runs (sequence не меняется → cached).
3. **Visual confusion confident vs predicted.** Биолог не понимает разницы между filled и unfilled+dashed. Митigaция: tooltip on hover (M-X.2 reserved) + Settings explainer text "Предсказания отображаются пунктирным контуром". Если на acceptance Игорь говорит "не очевидно" → Code добавляет hint icon с popover в Settings.
4. **Cas9 scaffold variant coverage недостаточен.** Detection ловит SpCas9 scaffold но пропускает SaCas9 / Cpf1 / engineered variants. Митigaция: M-X.1 покрывает только SpCas9 + 2-3 common variants. Расширение в M-X.1.2 после feedback.
5. **localStorage migration:** existing users имеют старый `sequenceView` slice без `predictions` поля. `loadInitialSequenceView()` должен делать default fallback при отсутствии поля. Митigaция: добавить defensive parser check в K5.
6. **Behavioral change ORFs из baseSnapshot.** Биолог импортирует свою плазмиду и в Importer Inspector «Аннотации» tab видит меньше region annotations чем раньше (ORFs теперь не в baseSnapshot, только в SequenceView через transient). Может read как «что-то сломалось / detection хуже». Митigaция: release notes явно отметят «ORF detection теперь живёт в SequenceView slot, не в Annotations list — это правильное разделение confident vs predicted». Сразу после M-X.2 биолог сможет click на ORF и явно "Принять как CDS" → ORF попадает в Annotations list как confident.
7. **AnnotationTrack stacking с predicted.** Existing `stackAnnotations()` в M-B.3 lib работает на regions. Predicted regions теперь приходят через тот же features array — должны автоматически stackнуться правильно. Risk если stacking даст неожиданный layout (e.g. predicted всегда на верхней row). Митigaция: K6 visual acceptance проверяет stacking на mixed plasmid.

---

## §10. Открытые вопросы

1. **Tilde prefix `~name` для predicted labels — приемлемо?** Это pLannotate convention. Альтернатива: суффикс `(?)` или italic без префикса. Tilde занимает 1 char — не критично для wide regions, но на узких может выталкивать label на leader-line раньше времени. Если на K4 acceptance мешает — Code тестирует альтернативу.
2. **σ70 PWM source matrices — какая версия consensus?** Harley & Reynolds 1987 / Lisser & Margalit 1993 / RegulonDB 2024. Code выбирает RegulonDB как наиболее свежую и validated. Если есть строгое предпочтение — указать.
3. **Stem-loop scoring без ΔG.** σ70 PWM — well-defined PWM scoring. Stem-loop scoring через GC content × stem length × loop length × mismatch penalty — heuristic, не настоящая термодинамика. Полная NN модель ΔG требует библиотеку (например ViennaRNA WASM или pure-JS implementation ~3 KB+) — сейчас вне scope. Если это не приемлемо — предусмотреть M-X.1.1 на ΔG (отдельный спринт).
4. **sgRNA spacer как separate region или signal?** Spacer 20 bp upstream от scaffold — отдельная predicted region типа `gRNA spacer` или signal внутри parent scaffold region? Я выбрал separate region (биолог хочет видеть spacer чтобы понимать target). Альтернатива — signal внутри scaffold, требует click на M-X.2 Modal чтобы увидеть spacer. Код идёт по separate region — поправить если иначе.

---

**Spec status:** ⏳ Pending Code execution. После K6 commit — визуальная приёмка Игорем (отдельная сессия, фрэш контекст).

**После реализации:** перенос в `docs/archive/` с пометкой `**Статус:** ✅ РЕАЛИЗОВАНО [дата]` (при финализации release block v0.7.2 / v0.8.0 — зависит от того, идёт ли M-X.1 на minor bump).

# SPEC_FEATURE_DETECTION_PARTIAL — partial seed-extend в `detectCommonFeatures`

**Статус:** ✅ РЕАЛИЗОВАНО 27.05.2026; расширено и принято визуально 31.05.2026 — **V134** (X-drop seed-extend заменил оконный разрыв + `mergeCollinearPartials`) + **V138** (nt-refine бокса `protein_partial` до полной ДНК гена через `feat.sequence`, cap=2; AA-дорожка не тронута). Актуальная логика pipeline — DEC-FDP-01 в `DECISIONS.md` (тело этой спеки описывает исходный 27.05-подход). · **Тип:** B (новый алгоритм в существующем модуле, A+B сценарии) · **Целевая версия:** v0.8.4-alpha (patch) · **Создано:** 27.05.2026 · **Уточнено:** 31.05.2026 (V134/V138).

---

## 0. Срез размеров затронутых модулей

| Файл | Сейчас | После (оценка) | Лимит | Декомпозиция? |
|------|--------|----------------|-------|----------------|
| `gui/designer/src/feature-detection.js` | 10.3 KB | ≈15 KB | hard 25 / soft 20 | нет |
| `gui/designer/src/__tests__/feature-detection.test.js` | 4.5 KB | ≈8 KB | n/a | нет |
| `gui/designer/src/lib/annotator-plugins/common-features.js` | 3.7 KB | ≈4.2 KB | hard 25 | нет |
| `gui/designer/src/lib/annotator-plugins/__tests__/common-features.test.js` | 2.9 KB | ≈4 KB | n/a | нет |

Все четыре файла существенно ниже soft. Декомпозиция первым пунктом не требуется.

---

## 1. Контекст

`feature-detection.js::detectCommonFeatures` ищет фичи common-features DB в plasmid sequence. Три ветки:

- **CDS exact** — `frame.protein.indexOf(feat.protein)`. Требует полную длину protein в frame.
- **CDS fuzzy** — seed-and-extend, 3 сида по 8 aa на 25/50/75% длины фичи. **Verification — окно полной длины** (`candStart + fp.length <= tp.length`). Identity ≥0.90.
- **DNA identity** — seed (12 nt начала фичи) + verification полной длины (`pos + flen <= targetSeq.length`). Identity ≥0.96.

**Общий паттерн:** seed находится, verification на окне = длина фичи. Если фрагмент короче — окно вылетает за target, отбрасывается.

**Две точки ломки, которые мы покрываем:**

**A. Truncated feature.** Биолог вырезал кусок KanR (≈250 nt из 800-nt полной фичи) и вставил в плазмиду. Все три ветки сейчас отбрасывают — окно verification вылетает за длину target. Биолог не видит, что это вообще часть KanR.

**B. Split feature with foreign insertion.** Биолог вставил в KanR 100 nt чужой ДНК. В target — два независимых куска KanR разнесённых вставкой:

```
target: [KanR nt 1-400][вставка 100 nt][KanR nt 500-800]
```

Хотим увидеть **две partial-фичи** на canvas: `KanR_part_1-400` и `KanR_part_500-800`. Не одно «KanR с gap внутри» — а две независимые находки. Smith-Waterman с gaps дал бы одно gapped alignment; нам нужны N gapless alignments, по одному на каждый non-overlapping match.

**Что НЕ покрываем здесь:**
- Точечные мутации внутри куска (одна буква на другую) — это уже терпит fuzzy full / partial extend через mismatch-tolerance в скользящем окне.
- Indel'ы внутри одного куска (родственные гены из разных организмов) — это L3 BLAST в Annotator, у нас есть отдельно.

**Callsite один** — `lib/annotator-plugins/common-features.js::commonFeaturesPlugin.run` → `detectCommonFeaturesAsync(sub)` → `rowToRegion` → `regions[]` в Annotator UI. Схема устойчивая (`region.name/type/confidence/method/...`), добавление новых полей UI не сломает.

---

## 2. Связи (R4 §17 CHAT_PLAYBOOK)

- **`feature-detection.js`** — алгоритм. Экспортирует `detectCommonFeatures` + async wrapper.
- **`annotator-plugins/common-features.js`** — единственный production callsite. Async-вызов из `Annotator L1` (auto-runs).
- **`Annotator/`** — UI (`ResultRow`) читает `region.name/confidence/method/description`. Новые поля игнорирует — есть spread по схеме, не ломается.
- **`lib/sequence-search.js`** — похожий seed-and-extend, **другая задача** (query → entries для Ctrl+F поиска). Не дубль. Общий рефакторинг — отдельный sprint, в этом не делаем (см. §11 заметка про shared primitive).
- **Predictor worker** (`predictor.worker.js`) — common-features plugin запускается в main thread, не в worker. Worker трогать не надо.

Mockup audit: визуального source of truth нет, UI delta минимальный (имя в Annotator row + опциональные поля). В спеке нет визуальной приёмки — есть функциональная (плазмида с фрагментом KanR / со split KanR → rows появляются).

---

## 3. Стратегия

Добавить **partial seed-extend как fallback после fuzzy full** в каждой алгоритмической ветке (CDS, DNA). Если ни exact, ни fuzzy full не сработали — каждый seed-hit запускает локальный extend влево/вправо со скользящим окном; собираются **все non-overlapping в target** валидные partial'ы (не break после первого — это критично для split-кейса). Координаты совпадения сохраняем и в target (как сейчас), и в **исходной фиче** (новые поля `featureStart, featureEnd`).

Возврат: `method: 'protein_partial' | 'dna_partial'`. В `rowToRegion` partial-row получает имя вида `KanR_part_40-289` (1-based от старта фичи, формат от Игоря).

---

## 4. Scope

**IN:**
- `feature-detection.js` — partial branches в CDS-fuzzy и DNA путях, два новых internal helper'а.
- `__tests__/feature-detection.test.js` — partial-тесты (6 кейсов, включая split).
- `lib/annotator-plugins/common-features.js` — `rowToRegion` для partial.
- `lib/annotator-plugins/__tests__/common-features.test.js` — тест partial-имени.

**OUT:**
- Smith-Waterman / gapped alignment — не нужно (см. §1: gaps появляются от эволюции, для них L3 BLAST).
- Изменения в Annotator UI (`ResultRow`, popup) — UI должен подхватить через существующую схему region.
- `lib/sequence-search.js` — другая задача.
- Predictor worker.
- BLAST L3 — отдельный flow в Annotator, не задет.
- **Extract shared primitive в `lib/seed-extend.js`** — преждевременное обобщение из одного callsite. Делаем in-line в `feature-detection.js`, extract когда станут известны 2-3 реальных callsite'а (см. §11 заметка).

---

## 5. Архитектурные решения

**DEC-FDP-01. Partial — fallback ТОЛЬКО при отсутствии full match.** В каждой ветке (exact → fuzzy → partial) пробуется последовательно. Partial запускается только если ни exact, ни fuzzy full ничего не вернули. Гарантирует что partial не подменит более сильный full hit.

**DEC-FDP-02. Partial-алгоритм — gapless local extend.**
- От seed-hit идём вправо со скользящим окном (16 aa для protein, 30 nt для DNA).
- Окно: счётчик matches/mismatches в текущем участке. Расширяемся пока identity внутри окна ≥ partial threshold.
- Останавливаемся когда identity в окне падает ниже порога ИЛИ выходим за длину фичи/target.
- Симметрично влево.
- Финальная identity = matches / extLength по всему extended span.

Без gaps. См. §1 — gaps внутри одного куска для нашей задачи не появляются.

**DEC-FDP-03. Пороги.**
- Coverage ≥ 0.50 (доля длины фичи которая совпала, **per одиночный partial-row**; в split-кейсе каждый кусок проверяется на свои 50% независимо — иначе мы потеряем оба куска, если каждый меньше половины).
- Identity для partial: 0.90 protein / 0.96 DNA (те же что у full fuzzy, для консистентности).
- Абсолютный пол совпавшей длины: **50 nt** (для protein-пути это ≈17 aa, `Math.ceil(50 / 3)`).
- Все три порога — гасят false positives. 30-nt совпадение из 800-nt фичи (3.75% coverage) — спам, отсечётся всеми тремя одновременно.

**Уточнение про coverage 50% и split.** Если в split-кейсе обе половины ≥50% фичи каждая — оба сохраняются. Если одна половина 60%, другая 30% — выживет первая, вторая отсечётся полом. Это намеренно: фрагмент 30% — на грани шумовых хитов в feature DB ≈1000 записей. Если на практике биолог сталкивается с split-кейсами, где обе половины <50%, — это уже намёк что либо feature DB неполная, либо порог надо ослаблять (открытый вопрос — будем смотреть на реальных плазмидах после первой приёмки).

**DEC-FDP-04. Новые поля row.**
- `method: 'protein_partial' | 'dna_partial'`
- `featureStart, featureEnd` — координаты в **исходной фиче** в **nt** (0-based, [start, end) — convention BodgeGene).
  - Для DNA-partial — напрямую позиции в `feat.sequence`.
  - Для protein-partial — `proteinStart * 3` / `proteinEnd * 3` (CDS-фичи в DB sequence-aligned: `feat.sequence` начинается с того же кодона что `feat.protein[0]`, проверено в риске №3).
- `coverage` — доля (0..1).
- Существующие поля сохраняются: `feature, start, end, strand, identity`.

**DEC-FDP-05. Имя в `rowToRegion` для partial** — `{feat.name}_part_{featureStart+1}-{featureEnd}`. `+1` — переход в 1-based для биолога (GenBank convention). Используется именно `feat.name`, без HTML-стрипа (имена в DB plain text).

**DEC-FDP-06. Глобальная дедупликация в конце функции** — keep highest identity, не overlap, same `feature.type`. Тот же механизм что сейчас (без правок). Partial-row имеет ту же `type` как полная фича → full match (identity 1.0) автоматически побеждает partial (identity ≤0.99) при overlap. Двойного отчёта одной фичи в одном target-span не будет. **В разных target-span'ах** (split-кейс) overlap нулевой → оба partial'а выживают.

**DEC-FDP-07. Производительность.** Partial extend re-использует **уже найденные** seed-hits из fuzzy fallback (CDS) / DNA-seed loop. Дополнительной `indexOf`-работы нет. Дополнительный overhead — inner extend на seed-hits, которых full verification отбросил, плюс multiple extends per feature вместо одного. Extend дешевле full verification (ранняя остановка при падении identity), на 14-kb плазмиде с ~1000 фичами прибавит ≈100-200 мс — приемлемо. **Verification floor:** если в отчёте Code видит >500 мс прироста — флаг, разбираемся.

**DEC-FDP-08. Backward-compat.** Существующие 6 тестов в `feature-detection.test.js` — не правятся, должны пройти как есть. Plugin тесты — добавляется новый, существующие не правятся.

**DEC-FDP-09. Multiple partial hits per feature (split-кейс).** Каждый seed-hit (внутри одной feature, одной ветки) запускает отдельный extend.

Логика:
1. Для каждого seed-hit (из существующего candidates-набора в CDS, из indexOf-loop'а в DNA) — запустить `extendProteinPartial` / `extendDnaPartial`.
2. Собрать все валидные results в локальный массив `featurePartials` внутри одной фичи.
3. **Local dedup внутри фичи** — отсортировать по identity desc, пройти жадно: оставить partial если он не overlap'ит с уже принятым (по target-span'у), иначе skip. Это убирает duplicate extends с соседних seed'ов резолвящихся в один локус.
4. Push **все оставшиеся non-overlapping** в `results`.
5. **Не выходим из feature loop'а** после первого partial — но и не запускаем партиалы если был full match (см. DEC-FDP-01).

В split-кейсе KanR разрезан вставкой:
- В первой половине target — seed hits для первой части фичи (например seed на 25% фичи нашёлся на target позициях [200..400]).
- Во второй половине — seed hits для второй части фичи (seed на 75% нашёлся на target позициях [500..700]).
- Local dedup: оба не overlap'ятся в target → оба сохраняются.
- В global dedup (DEC-FDP-06) — partial'ы одной фичи в разных target-span'ах не overlap'ятся → оба выживают.

**DEC-FDP-10. DNA partial — расширение seed-strategy до 3 сидов.** В full DNA-пути сейчас один seed (первые 12 nt фичи). Для DNA-partial-fallback это **недостаточно для split-кейса**: если первые 12 nt фичи есть только в первой половине target — вторая половина не найдётся. Расширяем до **3 сидов на 25/50/75% длины фичи**, длина seed как было (`Math.min(12, Math.floor(flen / 4))`). Симметрично CDS-fuzzy. **Full-match DNA-путь не трогаем** — там seed в начале фичи достаточен (если фича целиком в target — она там целиком, начинается тоже там). Расширяем только partial-fallback.

---

## 6. Файлы / Сигнатуры

### `feature-detection.js`

Два новых internal helper'а (не exported, без default):

**`extendProteinPartial(featProt, targetProt, seedTargetIdx, seedFeatIdx, threshold)`**

Args:
- `featProt` — protein string фичи.
- `targetProt` — protein string frame.
- `seedTargetIdx` — index в targetProt где найден seed.
- `seedFeatIdx` — index в featProt откуда взят seed.
- `threshold` — identity floor (0.90).

Returns: `{ identity, coverage, featStart, featEnd, targetStart, targetEnd } | null`

Логика:
1. Расширение вправо: scan от `seedTargetIdx + SEED_LEN` в targetProt и `seedFeatIdx + SEED_LEN` в featProt параллельно, накопление matches/mismatches в скользящем окне 16 aa. Stop когда identity в окне < threshold или достигнут end любого из protein'ов.
2. Симметрично влево.
3. Подсчёт total matches / extLength.
4. Floor checks: extLength ≥ 17 aa AND coverage ≥ 0.50 AND identity ≥ threshold. Если хоть одно не выполняется → return null.

**`extendDnaPartial(featSeq, targetSeq, seedTargetIdx, seedFeatIdx, threshold)`**

Args:
- `featSeq` — feature DNA string.
- `targetSeq` — target DNA string (seq или rc).
- `seedTargetIdx` — index в targetSeq где найден seed.
- `seedFeatIdx` — index в featSeq откуда взят seed.
- `threshold` — identity floor (0.96).

Returns: `{ identity, coverage, featStart, featEnd, targetStart, targetEnd } | null`

Логика та же, окно 30 nt, floor 50 nt, coverage ≥ 0.50.

### Интеграция в `detectCommonFeatures`

**CDS-fuzzy ветка** — после существующего fuzzy loop (когда `!found` после прохода по всем frames):

```
если !found (ни exact ни fuzzy full):
  featurePartials = []
  for frame in frames:
    for s in seeds:
      for каждый seed-hit в frame.protein:
        result = extendProteinPartial(feat.protein, frame.protein,
                                      hitIdx, s.off, 0.90)
        если result не null:
          featurePartials.push({
            ...result,
            frame: frame.strand, frameOffset: frame.offset
          })

  // Local dedup: keep highest-identity non-overlapping в target
  отсортировать featurePartials по identity desc
  accepted = []
  for p in featurePartials:
    если p не overlap'ит ни одного из accepted в target → accepted.push(p)

  // Push все accepted в results
  for p in accepted:
    nt-coords пересчитать из protein-coords через p.frameOffset/p.strand
    results.push({
      feature: feat, start, end, strand: p.frame, identity: p.identity,
      method: 'protein_partial',
      featureStart: p.featStart * 3, featureEnd: p.featEnd * 3,
      coverage: p.coverage
    })
  found = true если accepted.length > 0
```

**DNA ветка** — после существующего sliding-window loop (если `!matched`). Используем 3 сида (DEC-FDP-10) на 25/50/75% фичи. Для каждого `[targetSeq, strand]`:

```
если !matched (full DNA не нашёл):
  featurePartials = []
  seedLen = Math.min(12, Math.floor(flen / 4))
  seedOffsets = [25%, 50%, 75%] фильтрованные на seedOffset + seedLen <= flen
  seeds = seedOffsets.map(off => ({ off, str: fseq.slice(off, off+seedLen) }))

  for [targetSeq, strand] in [[seq, 1], [rc, -1]]:
    for s in seeds:
      pos = targetSeq.indexOf(s.str)
      while pos >= 0:
        result = extendDnaPartial(fseq, targetSeq, pos, s.off, 0.96)
        если result не null:
          featurePartials.push({ ...result, strand })
        pos = targetSeq.indexOf(s.str, pos + 1)

  // Local dedup и push — как в CDS ветке
  ...
  matched = true если accepted.length > 0
```

**Замечание про strand'ы в split-кейсе:** теоретически возможно что одна половина KanR в target в +1 strand, вторая в -1. Это биологически странно (инверсии внутри гена редки), но не невозможно. Local dedup работает по target-span (абсолютные координаты в seq), strand на overlap не влияет — обе половины сохранятся как два независимых row с разным strand. Это OK.

### `lib/annotator-plugins/common-features.js::rowToRegion`

Изменение в начале функции:

- Если `row.method === 'protein_partial' || row.method === 'dna_partial'`:
  - `region.name = `${feat.name}_part_${(row.featureStart || 0) + 1}-${row.featureEnd || row.featureStart + 1}``
  - `region.featureRange = [row.featureStart, row.featureEnd]` (на случай UI расширения).
  - `region.coverage = row.coverage`
- Иначе — без изменений.

Остальные поля (`type, level, start, end, strand, confidence, method, description`) — как сейчас.

---

## 7. Тесты

### `__tests__/feature-detection.test.js` (добавить, существующие не трогать)

Использовать существующие fixtures (`AMPR_PROTEIN_50`, `AMPR_DNA_50`, `ORI_DNA`, `mockDB`).

1. **`protein partial: AmpR truncated к first 30 aa из 50-aa фичи → protein_partial`**
   - Build: prefix + ATG + proteinToDNA(AMPR_PROTEIN_50.slice(0, 30)) + TAA + suffix.
   - Expect: row found, `method === 'protein_partial'`, `featureStart === 0`, `featureEnd ≈ 90` (30 aa × 3), `coverage` между 0.55 и 0.65 (30/50), `identity ≥ 0.90`. Ровно ОДИН row для AmpR.

2. **`dna partial: ori truncated к first 110 nt из 200-nt фичи → dna_partial`**
   - Build: prefix + ORI_DNA.slice(0, 110) + suffix.
   - Expect: row found, `method === 'dna_partial'`, `featureStart === 0`, `featureEnd ≈ 110`, `coverage ≈ 0.55`. Ровно ОДИН row для ori.

3. **`partial under-50-nt floor: фрагмент 40 nt из ori → NOT found`**
   - Build: prefix + ORI_DNA.slice(0, 40) + suffix.
   - Expect: `results.find(r => r.feature.name === 'ori')` → undefined.

4. **`partial under-coverage-50%: фрагмент 80 nt из 200-nt ori → NOT found`**
   - Build: prefix + ORI_DNA.slice(0, 80) + suffix. (80/200 = 40% < 50%.)
   - Expect: NOT found.

5. **`partial не подменяет full match: full + partial одной фичи → keep full`**
   - Build: prefix + full ORI_DNA + spacer + ORI_DNA.slice(0, 120) + suffix.
   - Expect: один row найден, `method === 'dna_identity'` (full победил), `identity ≥ 0.96`. Не два row для ori.

6. **`split partial DNA: ori разрезан 100-nt вставкой → 2 dna_partial rows`** (split-кейс)
   - Build: `ORI_FIRST = ORI_DNA.slice(0, 120)`, `ORI_SECOND = ORI_DNA.slice(120)` (80 nt — но это 40%, не пройдёт; берём другой split). Реально: `ORI_FIRST = ORI_DNA.slice(0, 120)` (60%), `ORI_SECOND = ORI_DNA.slice(100)` (50%, перекрытие 20 nt — допустимо в тесте).
   - Или альтернативно: использовать ORI как 200 nt, разрезать на 110 + 110 (с 20-nt overlap в исходной фиче), вставить 100-nt чужой ДНК между.
   - Build: prefix + ORI_FIRST + FOREIGN_100 + ORI_SECOND + suffix, где FOREIGN_100 — последовательность не в DB.
   - Expect: 2 rows для ori, оба `method === 'dna_partial'`, target-span'ы не перекрываются, **featureStart первого ≈ 0**, **featureStart второго ≈ 100**.

Плюс существующие 6 тестов — должны пройти без правки.

### `lib/annotator-plugins/__tests__/common-features.test.js` (добавить два теста)

1. **`partial row → region.name has _part_ suffix and coverage field`**
   - Setup: mock `detectCommonFeaturesAsync` чтобы вернул `[{ feature: { name: 'KanR', type: 'marker' }, start: 100, end: 350, strand: 1, identity: 0.92, method: 'protein_partial', featureStart: 39, featureEnd: 288, coverage: 0.31 }]`.
   - Expect: `result.regions[0].name === 'KanR_part_40-288'`, `result.regions[0].coverage === 0.31`, `result.regions[0].featureRange == [39, 288]`.

   (Coverage 0.31 искусственно — это тест mapping'а, не floor'а; floor проверяется в feature-detection.test.js.)

2. **`split partial → два региона с разными `_part_` именами`**
   - Setup: mock возвращает два row одной фичи KanR с разными featureStart/End.
   - Expect: `result.regions.length === 2`, имена `KanR_part_1-400` и `KanR_part_500-800` (или подобные).

---

## 8. Порядок выполнения

1. **Red.** Добавить 6 partial-тестов в `feature-detection.test.js` и 2 в plugin тесты. `npm test feature-detection` → fail.
2. **Helpers.** Реализовать `extendProteinPartial` + `extendDnaPartial` в `feature-detection.js`. Запустить unit-проверку (логика extend'а изолированно — можно временным test'ом, потом снести).
3. **Integration.** Вживить partial-fallback в обе ветки `detectCommonFeatures` (включая local dedup и 3-seed DNA partial). `npm test feature-detection` → green.
4. **Plugin.** Обновить `rowToRegion`. `npm test common-features` → green.
5. **Full suite.** `cd gui/designer && npm test && npx vite build`. Vitest всё зелёное, build clean.
6. **Sanity на реальных данных.** Если есть тестовая плазмида с фрагментом гена / split гена — Code запускает локально, скриншот / лог результата в отчёт.

---

## 9. STOP-условие

После шага 5 — остановиться. Жду визуальной приёмки в **отдельной сессии** (Annotator на реальной плазмиде с фрагментом KanR или split KanR — Игорь проверяет глазами что rows появляются, имена в формате `KanR_part_X-Y` правильные).

**Не финализировать** PROJECT_STATE / BUGS / TECH_DEBT / RELEASES / version / ANCHORS / CLAUDE.md (всё это — отдельная Chat-сессия Пачка 2 после приёмки, плюс уже висящая Пачка 2 v0.8.3).

---

## 10. Формат отчёта в `CURRENT_TASK.md`

В конце реализации Code пишет:
- Коммит-хэши по шагам (2-helpers, 3-integration, 4-plugin, 5-sanity).
- Финальные Vitest + pytest (pytest не запускался — backend не задет, отметить).
- Build status.
- Сколько добавлено partial-тестов (ожидается 8: 6 в feature-detection + 2 в plugin).
- Размер `feature-detection.js` до/после.
- Performance: timing на 14-kb тестовой плазмиде до/после (если есть способ замерить — вставить console.time вокруг detectCommonFeatures). Если прирост >500 мс — флаг.
- Отклонения от спеки — явный блок (даже если нет).
- Статус-шапка спеки `**Статус:** ✅ РЕАЛИЗОВАНО [дата]` — проставлена?

---

## 11. Риски

1. **False positives при низком coverage.** Partial 0.90 protein может ловить параллогичные домены (β-lactamase варианты — общий core). Митигация: coverage floor 50% + abs length 50 nt отсекают большинство; legitimately похожие домены (>50% длины, >90% identity) — это и есть полезное «эта фича родственна KanR», ровно то что мы хотим показать.

2. **Множественные partial'ы одной фичи в split-кейсе — легитимны.** Глобальная дедупликация (DEC-FDP-06) отсеивает partial при overlap с full match в том же target-span; partial'ы одной фичи в **разных** target-span'ах overlap нулевой → оба сохраняются. **Это намеренно** для покрытия split-кейса (вставка чужой ДНК внутрь гена). Local dedup внутри фичи (DEC-FDP-09) защищает от duplicate-extends с соседних seed'ов в одной точке.

3. **CDS-partial координаты: protein ↔ nt.** `featureStart_nt = proteinStart * 3` предполагает что `feat.sequence` начинается с того же кодона что `feat.protein[0]`. **Проверить:** взять 2-3 фичи из common-features DB, проверить что `translateFrame(feat.sequence) === feat.protein`. Если есть фичи с pre-ATG payload в `feat.sequence` (signal peptide, 5'UTR в feature span) — координаты сдвинутся на эту длину. Митигация: если несогласовано — Code добавляет внутренний offset (`feat.cdsStart || 0`) и проставляет в спеку как deviation. Скорее всего DB чистая (SnapGene экспорт обычно sequence-aligned), но проверка обязательна.

4. **Performance regression на 14-kb плазмиде.** Дополнительный extend per seed-hit когда full не нашёл, плюс multiple extends per feature (split). Митигация: extend дешевле full verification (early exit при падении identity); ожидаемый прирост ≤200 мс. Если в отчёте Code видит >500 мс прироста — флаг, спека не завершена.

5. **Backward compat: код предполагающий `region.name === feat.name`.** Где-то в Library hooks или save flow может быть matching на имя. Митигация: Code grep'ит `'_part_'` и `feat.name` в `lib/`, `components/Library/`, `components/Annotator/` — если есть прямое сравнение `region.name === entry.name` (которое сломается на `_part_`) — флаг в отклонениях.

6. **Shared primitive (future, не делаем сейчас).** Тот же gapless seed-extend с mismatch-tolerance понадобится в трёх местах:
   - **Сценарий C:** Gibson / Overlap PCR — поиск гомологичных плеч между концами фрагментов (seq-vs-seq, не feature-vs-target).
   - **Сценарий D:** Primer binding mismatch tolerance — праймер 25 nt, ложатся 22 nt, 3 nt на конце mismatch. То же gapless seed-extend между query (праймер) и target (плазмида).
   - **Сценарий A+B:** этот спринт.

   Делать сейчас shared primitive в `lib/seed-extend.js` — преждевременное обобщение из одного callsite. Реализуем in-line в `feature-detection.js`. Через 2-3 спринта, когда C или D станут реальной задачей, **в первой строке** их спеки указывается: «extract `extendProteinPartial` + `extendDnaPartial` из `feature-detection.js` в `lib/seed-extend.js`, текущая задача — второй callsite». Решение зафиксировано в `docs/BACKLOG.md` (раздел про будущие алгоритмические primitive'ы).

---

## 12. Открытые вопросы

1. **Uppercase инвариант.** `feat.sequence` и `targetSeq` везде uppercased до partial-кода. Новый helper не правит case — проверить что upstream это держит. Не блокирующее, проверка через тест.

2. **Visual marker partial в Annotator.** Сейчас partial-region рендерится как и full в `ResultRow`. Различение (ghost / dashed border / суффикс в имени достаточен?) — отдельная UI-тикетка, в этом спринте не делаем. Имя `KanR_part_40-289` уже даёт биологу понятный сигнал.

3. **`featureRange` field name.** Положил это поле в region, имя финальное. Альтернативы (`featureSlice`, `coverageRange`) хуже — `featureRange` соответствует convention `[start, end)` в проекте.

4. **Split coverage порог.** Сейчас каждый кусок в split-кейсе проверяется на свои 50% независимо. Возможен альтернативный режим: «суммарная coverage всех partial'ов одной фичи ≥50%» — тогда два куска по 30% каждый (всего 60%) сохранились бы оба. Это open question — по умолчанию делаем независимую проверку, после первой приёмки на реальных плазмидах смотрим, не теряем ли legitimate split'ы.

---

## 13. Handoff Code

> Прочитай CHAT_PLAYBOOK §1, CLAUDE.md, BUGS.md, CURRENT_TASK.md. Открой `docs/SPEC_FEATURE_DETECTION_PARTIAL.md` целиком — спека ~26 KB, читается полностью.
>
> Выполни задачу по `§8. Порядок выполнения`. После шага 5 (`npm test && npx vite build` clean) остановись — жду визуальной приёмки в отдельной сессии.
>
> Не финализируй PROJECT_STATE / DECISIONS / BUGS / RELEASES / ANCHORS / TECH_DEBT / CLAUDE.md / package.json / version.js. Только статус-шапка в этой спеке (`✅ РЕАЛИЗОВАНО [дата]`) после реализации.
>
> Отчёт в `CURRENT_TASK.md` по `§10. Формат отчёта`.

# Sprint Parser-Unification — Унификация .dna парсеров и пересборка common-features.json v1.0

**Тип:** refactor + data rebuild (single source of truth для .dna parsing + полный rebuild auto-annotate БД)
**База:** v0.7.0, ветка `feature/racetrack-canvas`, M-B FINAL HEAD + V50 PRE-K1 fix (03.05.2026 morning)
**Bump после реализации:** v0.7.0 → v0.7.1 (вместе с M-B.3 SequenceView Rewrite в одном release block).
**Связь с M-B.3:** независимый sprint, можно делать **до** M-B.3 K1 либо параллельно с ним. Не блокирует SequenceView rewrite. **НО:** common-features.json должен быть пересобран до публичного release v0.7.1, иначе auto-annotate в Importer'е работает на сдвинутых AA-координатах из старой БД (баг невидим биологу но реальный).

---

## 0. Зачем

После V50 fix (03.05.2026 morning) backend `pvcs/snapgene_parser.py` корректно конвертирует SnapGene XML 1-based inclusive → 0-based exclusive end (DEC-PARSER-COORD-01 ⚓). Live import .dna файлов через Importer теперь даёт правильные координаты, длины CDS кратны 3, AA-translation работает.

**НО** в репозитории есть **второй .dna parser** — `scripts/build_features_from_snapgene.py` (внутренний `parse_dna` + `parse_features_xml` inline в файле, ~270 строк). Этот скрипт строит `gui/designer/public/common-features.json` (415 verified features из 2822 reference SnapGene .dna файлов в `scripts/snapgene_dna/`). **Он содержит тот же V50 баг:**

```python
# scripts/build_features_from_snapgene.py, parse_features_xml():
f['start'] = min(s[0] for s in segments)   # 1-based inclusive из XML, raw
f['end'] = max(s[1] for s in segments)     # 1-based inclusive

# Затем main():
feat_dna = seq[start:end]   # Python slicing — 0-based exclusive
```

Off-by-1 на обоих концах: `seq[1:5]` берёт positions 1,2,3,4 (4 chars) — но XML «1 to 5 inclusive» означал 5 chars. **Длины CDS не кратны 3, AA-translation в БД построена по сдвинутым координатам.** common-features.json содержит ~415 features где все CDS-protein записи **возможно содержат сдвиг на 2 nt**.

Auto-annotate работал визуально (биолог не замечал) потому что matching идёт через protein hash **внутри одной системы**: features extracted with off-by-1 совпадают между собой. Но **AA-translation в текущей БД и AA-translation после live-парсинга (теперь правильная)** будут **расходиться на 2 nt** на CDS regions. Это **невидимый баг** который мешает hash-matching между БД и новыми импортами.

**Также — архитектурный долг.** Два парсера = две точки правды = двойной maintenance. Текущий `pvcs/snapgene_parser.py` существенно лучше (notes parsing, type normalization, color extraction), но scripts/ его не использует.

---

## 1. Контекст

### Текущая структура

| Компонент | Файл | Что делает | Используется |
|-----------|------|------------|--------------|
| Live parser (primary) | `src/pvcs/snapgene_parser.py` | Pure Python .dna binary parser, no deps. Notes + features + sequence + topology + accession + organism. Координаты 0-based exclusive end (после V50 fix). | Importer flow в production через `pvcs/parser.py::parse_snapgene()` |
| Live parser (fallback) | `pvcs/parser.py::parse_snapgene()` BioPython branch | Используется только если own parser fail'нул | Production fallback |
| Build-script parser | `scripts/build_features_from_snapgene.py` (внутренние `parse_dna` + `parse_features_xml`) | Дублирует логику pvcs/snapgene_parser.py упрощённо. Нет notes, нет type_map, нет color, **есть V50 баг**. | Только при ручном запуске `python scripts/build_features_from_snapgene.py ...` для генерации common-features.json |
| Reference files | `scripts/snapgene_dna/` 19 категорий, ~2822 .dna файла | Curated SnapGene library — basic_cloning_vectors / pet_and_duet_vectors / fluorescent_protein_genes / etc. | Input для build-script |
| Auto-annotate БД | `gui/designer/public/common-features.json` 627 KB, modified 02.04.2026 | 415 verified features (markers / reporters / promoters / origins) + protein/DNA sequences + occurrence counts + source plasmids. | Frontend auto-annotate через homology hits на raw FASTA |

### Как auto-annotate использует БД

1. Биолог импортирует raw FASTA / .dna без annotations (или с минимальными).
2. Frontend `auto-annotate.js` итерирует через features в `common-features.json`.
3. Для каждой entry — поиск substring match (DNA или protein after translate) в загруженной sequence.
4. Если match — создаётся annotation с правильным name / type / color / source attribution.

**Если БД построена с off-by-1:** AA-strings в БД сдвинуты на 2 nt → hash не совпадает с правильной AA-translation после V50 fix. **Auto-annotate либо не сработает на CDS** (no match), либо сработает по DNA-substring (без protein verification). Это даёт **degraded auto-annotate quality** на CDS specifically.

### Что нашёл биолог 02.05.2026 на MinION тесте

Auto-annotate **работал** на MinION raw FASTA — но **только потому что** matching шёл по DNA substring level, не по protein. На .dna files с pre-existing CDS annotations бóльшая часть recognition'а идёт через DNA match, и баг маскировался. **На M-B.3 SequenceView с правильными AA tracks** баг становится видимым: M на AmpR / lacZα не отображалось корректно (Sub-fix этого утром через PRE-K1 V50).

---

## 2. Стратегия

**Single source of truth.** `scripts/build_features_from_snapgene.py` импортирует `pvcs.snapgene_parser.parse_dna_file` вместо собственного parsing. Inline `parse_dna` + `parse_features_xml` в scripts/ удаляются. Скрипт оставляет **только post-processing**: feature classification (marker/reporter/origin patterns), deduplication по protein hash, aliases collection, occurrence counting, sourceFiles tracking.

**Два чистых слоя:**
- **Parsing layer** — `pvcs/snapgene_parser.py`. Один парсер, один контракт DEC-PARSER-COORD-01.
- **DB-build layer** — `scripts/build_features_from_snapgene.py`. Использует parser, делает aggregation.

После refactor — backup current common-features.json → archive → запуск нового билда → smoke test на pUC19 → commit.

---

## 3. Scope

### IN

**Refactor `scripts/build_features_from_snapgene.py`:**

1. Удалить inline `parse_dna()` (~30 строк) и `parse_features_xml()` (~50 строк) — функции дублирующие `pvcs/snapgene_parser.py`.
2. Импортировать `from pvcs.snapgene_parser import parse_dna_file`.
3. В main pipeline заменить вызов `parsed = parse_dna(dna_file)` на `parsed = parse_dna_file(dna_file)`. Shape результата идентичный (sequence / features / topology / name / description).
4. Координатный layer: после parse_dna_file координаты уже 0-based exclusive end. Удалить любые дополнительные `+1`/`-1` adjustments в main loop (если есть). `feat_dna = seq[start:end]` остаётся **как есть** — Python slicing 0-based exclusive ровно совпадает с контрактом.
5. Reverse complement extraction `if feat.get('strand', 1) == -1: feat_dna = rc(feat_dna)` — остаётся, корректно.
6. Translation: `translate(feat_dna)` остаётся, теперь работает на правильной длине (для CDS `len(feat_dna) % 3 == 0`).
7. Trim после первого STOP — остаётся как safety guard.

**Backup current common-features.json:**

8. `cp gui/designer/public/common-features.json docs/archive/common-features_v_pre_v50.json` — на случай отката.

**Rebuild:**

9. Запустить `python scripts/build_features_from_snapgene.py --dna-dir scripts/snapgene_dna --output gui/designer/public/common-features.json --verbose`. Сравнить output stats — количество features (~415), distribution by type (marker / reporter / CDS / promoter / terminator / rep_origin), top-occurrence entries (AmpR ~N плазмид, ori ~N плазмид).

**Smoke test:**

10. Открыть pUC19.dna в Importer на dev-сервере (`http://localhost:3000`).
11. Verify:
    - AmpR детектится auto-annotate с правильной protein translation (начинается с M, длина 286 aa).
    - lacZα детектится с правильной AA (начинается с M, длина 107 aa).
    - ori детектится по DNA substring (origin не CDS, не имеет protein).
12. Если auto-annotate **не находит** AmpR / lacZα → значит refactor сломан, debug. Если находит **с разной AA** vs ручного translate'а от backend live parser → значит backup/restore старой БД и debug.

### OUT (явно отложено)

- **CRUD UI для common-features.json в frontend.** Не M-B.3 / Parser-Unification scope. Сейчас БД read-only, обновляется только rebuild'ом.
- **Addgene parsing.** Игорь упомянул вчера: «обнулим к хренам базу ОРФ тех которые внутри и заного отпарсим адген и снапген файлы». **Addgene .gb / .dna файлы пока не идентифицированы** в репо — нужен отдельный sprint после Parser-Unification если файлы найдутся (либо подкачаются с addgene.org через `download_snapgene_library.py` или новый script).
- **GenBank parser unification.** `pvcs/parser.py::_bio_feature_to_pvcs()` использует BioPython, своя 1-based convention внутри (`int(loc.start) + 1`). Это **не V50 баг** — BioPython даёт 0-based, +1 правильно конвертирует в pvcs internal 1-based. Но финальный pvcs Feature.start 1-based, а frontend ожидает 0-based exclusive end. Это **отдельная инверсия** которая случайно работает (где-то в API serialization есть -1 на start). Нужен audit и DEC-PARSER-COORD-01 alignment, но **не critical сейчас** — все импорты через .dna parser path. Audit GenBank path — Sprint Parser-Audit (TD пункт после Parser-Unification).
- **`scripts/fetch_snapgene_plasmids.py` и `scripts/download_snapgene_library.py`** — содержат свои inline parsers (predшествующие версии того же кода). Если они вызываются — refactor аналогично через `parse_dna_file`. Если не вызываются (deprecated artifact когда-то сделанной выкачки) — пометить deprecated, не трогать в этом sprint'е.
- **IndexedDB cache cleanup на стороне фронта.** Auto-annotate результаты могут кешироваться в Dexie schema v3. После rebuild common-features.json — **не нужно** clear browser data для existing testers, потому что auto-annotate runs on demand при импорте, не cached pre-computed. Если кеш reuse'ится между импортами — отдельный TD для Parser-Audit sprint.

---

## 4. Архитектурные решения

1. **DEC-PARSER-UNIFY-01 — Single source of truth для .dna parsing.** `pvcs/snapgene_parser.py::parse_dna_file()` — единственная точка где SnapGene XML координаты конвертируются в 0-based exclusive end. Любой код который читает .dna файлы (live import, batch DB build, future scripts) импортирует `parse_dna_file` из `pvcs.snapgene_parser`. **Запрещено** дублировать parse_dna / parse_features_xml inline в scripts/. Если post-processing нужен — он работает над выходом `parse_dna_file`, не парсит сам.

2. **DEC-PARSER-UNIFY-02 — `scripts/build_features_from_snapgene.py` сохраняет ответственность за post-processing.** Classification (marker / reporter / origin patterns через MARKER_PATTERNS / REPORTER_PATTERNS / ORIGIN_PATTERNS), dedup по protein hash, aliases collection, occurrence count, sourceFiles tracking — остаются в скрипте. Это **DB-aggregation layer**, отделён от parsing layer.

3. **DEC-PARSER-UNIFY-03 — common-features.json archive policy.** При каждом rebuild — старая версия копируется в `docs/archive/common-features_v_<reason>.json` (например `_pre_v50.json`, `_pre_addgene_merge.json`). **Не overwrite без backup**. Это safety net на случай если rebuild сломал auto-annotate quality.

---

## 5. Предположения

1. `pvcs/snapgene_parser.py::parse_dna_file()` после V50 fix корректно даёт 0-based exclusive end для всех 2822 reference файлов. **Verified** on pUC19 (lacZα 146..469, AmpR 1626..2486, AmpR promoter 2487..2591). Для других файлов assumed analogous поведение — tested batch on subset как safety.
2. Shape результата `parse_dna_file` совместим с тем что ожидает main pipeline в `build_features_from_snapgene.py`: `{sequence, features: [{start, end, strand, name, type, ...}], topology, name}`. Verified — shape идентичный.
3. Наличие 2822 reference файлов в `scripts/snapgene_dna/` (19 категорий) предполагается стабильным. Если каких-то файлов нет — `dna_dir.rglob('*.dna')` вернёт меньше, скрипт продолжит работу, output будет меньше features. Не блокер.
4. Backend perf — rebuild 2822 файлов через python parser занимает 30-60 сек на современном железе. Не critical, скрипт one-off.
5. `gui/designer/public/common-features.json` modified date 02.04.2026 — это последний rebuild. После Parser-Unification — будет 03.05.2026. Date update в JSON `generated` field автоматически.

---

## 6. Задачи

### K1 — Refactor `scripts/build_features_from_snapgene.py`

**Файл:** `scripts/build_features_from_snapgene.py`.

**Действия:**
1. Заменить imports: `from pvcs.snapgene_parser import parse_dna_file`. Гарантировать что `sys.path` корректен при запуске из repo root (если необходимо: `sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))` в начале файла).
2. Удалить функции `parse_dna()` (строки ~50-90) и `parse_features_xml()` (строки ~95-150) — заменены импортом.
3. В main pipeline (~строка 220): `parsed = parse_dna(dna_file)` → `parsed = parse_dna_file(dna_file)`. Shape совместим.
4. Убедиться что main loop правильно использует `start`/`end` от parser — теперь это 0-based exclusive end, никаких adjustments.
5. Test: `python scripts/build_features_from_snapgene.py --dna-dir scripts/snapgene_dna --output /tmp/test-features.json --verbose --min-occurrences 3 --min-length 30` → проверить что output stats совпадают (±5%) с ожидаемым (~415 features) — если совпадают, refactor успешен. Если drastically отличаются (например 200 или 800) — что-то сломалось.

**Тест pytest** (новый, опционально — `tests/scripts/test_build_features.py`, +1):
- Импортирует `parse_dna_file` через тот же путь что и build_features_from_snapgene.py использует.
- Парсит pUC19.dna (если он есть в test fixtures, иначе skip).
- Проверяет что AmpR feature имеет `(end - start) % 3 == 0`.

### K2 — Backup current common-features.json

**Действия:**
1. `mkdir -p docs/archive` (если ещё нет).
2. `cp gui/designer/public/common-features.json docs/archive/common-features_v_pre_v50.json`.
3. Verify: `ls -la docs/archive/common-features_v_pre_v50.json` показывает 627 KB.

### K3 — Rebuild common-features.json

**Действия:**
1. `cd C:\Users\sinig\Desktop\RESplasmide`.
2. `python scripts/build_features_from_snapgene.py --dna-dir scripts/snapgene_dna --output gui/designer/public/common-features.json --verbose --min-occurrences 3 --min-length 30 > /tmp/rebuild.log 2>&1`.
3. Проверить лог: `Found N .dna files` (N ≈ 2822), `Parsed: M OK, K failed` (K should be < 50, low parse failures), `Features: ~415`. By-type distribution: marker / reporter / CDS / promoter / terminator / rep_origin.
4. Verify file size: `gui/designer/public/common-features.json` должен быть ~600-700 KB (близко к старому 627 KB, не должен сильно отличаться).
5. **Сравнить с backup**: `diff <(jq '.stats' docs/archive/common-features_v_pre_v50.json) <(jq '.stats' gui/designer/public/common-features.json)` — stats должны быть похожи. Major drift в counts — risk-bullet.

### K4 — Smoke test через Importer

**Действия:**
1. Запустить backend: `cd C:\Users\sinig\Desktop\RESplasmide && python -m pvcs.cli serve` (или whatever команда у тебя стандартная для FastAPI dev server).
2. Запустить frontend: `cd gui/designer && npm run dev`.
3. Открыть `http://localhost:3000` в Chrome.
4. Importer → выбрать pUC19.dna из BlueScribe / любого test fixture → ImportStartScreen → SequenceTab.
5. Verify в auto-annotate output:
   - **AmpR**: должна быть detected, длина 861 bp, protein начинается с M, ~286 aa.
   - **lacZα**: detected, 324 bp, protein начинается с M, ~107 aa.
   - **ori**: detected по DNA homology, без protein (это rep_origin не CDS).
6. Сравнить с manual extraction из backend live parser — координаты должны совпадать (146..469 для lacZα, 1626..2486 для AmpR).
7. Если auto-annotate не находит AmpR / lacZα → debug. Если находит с расходящейся AA → откатить через `cp docs/archive/common-features_v_pre_v50.json gui/designer/public/common-features.json` и debug.

### K5 — Commit

**Действия:**
1. `git add scripts/build_features_from_snapgene.py gui/designer/public/common-features.json docs/archive/common-features_v_pre_v50.json`.
2. Commit message:
   ```
   refactor(scripts): unify .dna parsing through pvcs.snapgene_parser, rebuild common-features.json
   
   - scripts/build_features_from_snapgene.py: removed inline parse_dna() + parse_features_xml(),
     now imports parse_dna_file from pvcs.snapgene_parser as single source of truth.
   - common-features.json: rebuilt with V50 PRE-K1 fix applied (0-based exclusive end coordinates),
     CDS protein translations now correct.
   - docs/archive/common-features_v_pre_v50.json: backup of previous build (off-by-1 era).
   
   ⚓ DEC-PARSER-UNIFY-01: pvcs.snapgene_parser is single source of truth for .dna parsing.
   ⚓ DEC-PARSER-UNIFY-02: scripts/build_features_from_snapgene.py owns post-processing only.
   ⚓ DEC-PARSER-UNIFY-03: rebuilds always backup previous common-features.json to docs/archive/.
   ```
3. **Не push** — Игорь делает push сам после визуальной проверки в Importer.

---

## 7. Порядок и оценка

K1 → K2 → K3 → K4 → K5. Между K-шагами Code НЕ останавливается.

| Сеанс | K-шаги | Оценка |
|-------|--------|--------|
| 1 | K1 + K2 + K3 + K4 + K5 | 2-3 ч |

Total ~2-3 ч Code, 1 сеанс. Спринт компактный.

---

## 8. STOP-условие и формат отчёта

### STOP

После K5 Code останавливается. **НЕ:** обновляет PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / BUGS / TECH_DEBT / ARCHITECTURE_v2; не перемещает спеку в archive; не начинает M-B.3 K1; не трогает GenBank parser path в `pvcs/parser.py`; не трогает Addgene scripts.

### Формат отчёта

Code дописывает в конец `CURRENT_TASK.md`:

```
## Отчёт Code по Sprint Parser-Unification

- K1 commit: <hash> — refactor build_features_from_snapgene.py to import parse_dna_file
- K2 backup: docs/archive/common-features_v_pre_v50.json (X KB) — verified
- K3 rebuild: 
  - Files parsed: N (out of 2822)
  - Parse failures: K (acceptable < 50)
  - Features in output: M (~415 expected)
  - By-type: marker=X, reporter=Y, CDS=Z, promoter=W, terminator=V, rep_origin=U
  - Output file: gui/designer/public/common-features.json (X KB, was 627 KB)
- K4 smoke test:
  - pUC19 AmpR: detected, 861 bp, ~286 aa, starts with M ✓ / FAIL
  - pUC19 lacZα: detected, 324 bp, ~107 aa, starts with M ✓ / FAIL
  - pUC19 ori: detected by DNA ✓ / FAIL
- K5 commit: <hash>
- pytest: 112/112 PASS (backend не трогался)
- vitest: 947/947 PASS (frontend не трогался)
- Отклонения от спеки: <список или нет>
- Risk-bullets: <список или нет>
```

---

## 9. Риски

1. **Refactor может сломать import path для скрипта.** `scripts/build_features_from_snapgene.py` запускается из repo root, нужен `sys.path` adjust для импорта `pvcs.snapgene_parser`. Mitigation: явный `sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))` в начале скрипта если стандартный pip install pvcs в editable mode не настроен.

2. **Rebuild может дать существенно разные stats** vs старого билда. Если старая версия имела ~415 features, а новая ~300 или ~500 — что-то фундаментально изменилось. Mitigation: K3 verify через jq diff. Если drift >20% — K4 не запускать, разобраться почему.

3. **Auto-annotate в Importer может стать хуже** на некоторых плазмидах после rebuild. Возможные причины: новые правильные AA-strings не совпадают с DNA-substring matching old hashes; classification поменялась (например feature раньше был 'CDS', теперь 'marker' — auto-annotate logic зависит от type). Mitigation: K4 smoke test на pUC19 + 2-3 других плазмидах. Если регрессия — restore backup.

4. **AmpR / lacZα в новом common-features.json могут быть с слегка разной длиной** vs старого (старая была сдвинута, новая правильная — на 2 nt длиннее для CDS). Это **expected** и **correct**. Не баг.

5. **GenBank parser в `pvcs/parser.py` может выдавать координаты в другой convention** vs `pvcs/snapgene_parser.py` после V50 fix. Internal pvcs Feature использует 1-based start (видно по `start = int(loc.start) + 1` в `_bio_feature_to_pvcs`). Frontend ожидает что-то конкретное. Если есть несовпадение — auto-annotate на GenBank-imported плазмидах может работать криво. **Это OUT of scope этого sprint'а** (Parser-Audit отдельно), но если K4 smoke test на GenBank fixture тоже сделать — может всплыть.

6. **`parse_dna_file` может крешиться на некоторых reference файлах** где старый inline parser был более fault-tolerant. Mitigation: try/except в main loop скрипта (уже есть), `parse_fail` counter в логе. Если parse_fail spike (был 0-50, стал 500+) — какие-то файлы проблемные, сюда смотреть отдельно.

7. **`pvcs.snapgene_parser` extracts больше metadata** (notes / accession / organism) которые scripts/ post-processor может не использовать. Это безвредно — лишние fields в parsed dict игнорируются main loop'ом. Не риск.

---

## 10. Открытые вопросы

1. **Addgene parsing — где файлы?** Игорь упомянул «обнулим базу и заново отпарсим адген и снапген». В `scripts/` есть `download_snapgene_library.py` и `fetch_snapgene_plasmids.py`, но **Addgene-specific скрипта нет**. Нужно понять: (а) Addgene файлы где-то downloaded и просто не интегрированы в build pipeline, либо (б) их нужно отдельно скачивать через addgene.org API в новом скрипте. **Решение:** Parser-Unification закрывает только SnapGene reference. Addgene — отдельный sprint (Sprint Addgene-Integration) после успешного Parser-Unification. Игорь подтверждает / просит включить Addgene в этот sprint.

2. **GenBank parser audit.** `pvcs/parser.py::_bio_feature_to_pvcs()` использует `int(loc.start) + 1` для конверсии BioPython 0-based в pvcs internal 1-based. Frontend получает `Feature.start` через API serialization. Где-то `-1` должен быть применён обратно для соответствия DEC-PARSER-COORD-01 (0-based exclusive end в frontend). **Возможно есть скрытый bag в GenBank import path** который похож на V50 в .dna path. **Решение:** Parser-Audit как отдельный sprint после Parser-Unification (TD-PARSER-AUDIT-GENBANK).

3. **`scripts/fetch_snapgene_plasmids.py` и `scripts/download_snapgene_library.py` — used or deprecated?** Если used и содержат свой inline .dna parser — нужно тоже refactor через `parse_dna_file`. Если deprecated artifacts — просто пометить и не трогать. Игорь должен подтвердить статус.

---

_Spec v1.0 — 03.05.2026 morning, после V50 PRE-K1 fix. Ready for Code start. Источник правды — V50 fix в `pvcs/snapgene_parser.py`, audit `scripts/build_features_from_snapgene.py` (270 строк, два inline функции parse_dna + parse_features_xml дублируют production parser), audit `pvcs/parser.py::parse_snapgene()` показал что primary path использует `parse_dna_file`. Read-before-spec: snapgene_parser.py, parser.py, build_features_from_snapgene.py — прочитаны полностью._

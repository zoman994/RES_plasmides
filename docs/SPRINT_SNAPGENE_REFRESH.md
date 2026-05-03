# Sprint SnapGene Refresh — Полный wipe + redownload SnapGene library + rebuild common-features.json v1.0

**Тип:** data refresh (wipe local SnapGene .dna коллекции + redownload c snapgene.com + rebuild auto-annotate БД через unified parser)
**База:** v0.7.0, ветка `feature/racetrack-canvas`, после push'а Parser-Unification (`a6182ad` + `e8f0f56`).
**Bump после реализации:** v0.7.0 → v0.7.1 (объединённый release block с M-B.3 SequenceView и Parser-Unification).
**Связь с другими sprint'ами:** Sprint Parser-Unification (FIXED `e8f0f56`) — pre-requisite. Sprint M-B.3 — параллельно, не блокирует. **Sprint Addgene Integration — отдельный sprint, отложен.**

---

## 0. Зачем

Sprint Parser-Unification (`e8f0f56`) сделал rebuild common-features.json через unified `parse_dna_file` из `pvcs.snapgene_parser` — что дало правильные V50-coords (419 features, все CDS теперь ÷3). **Но input data — те же `scripts/snapgene_dna/` файлы которые лежали локально с момента изначальной выкачки** (вероятно весна 2024 или раньше — точная дата неизвестна).

С тех пор:
- SnapGene **обновляет** аннотации существующих плазмид по мере улучшения curation.
- SnapGene **добавляет** новые плазмиды в коллекции (особенно crispr_plasmids, fluorescent_protein_genes, mammalian_expression).
- SnapGene **может изменять** organism tags / category structure / canonical filenames.

Текущая локальная коллекция отстаёт от snapgene.com на **~год минимум**. Биолог хочет **clean restart**: убедиться что auto-annotate БД построена на свежих эталонных данных, а не на застарелом snapshot'е.

**Это data refresh, не code refactor.** Никаких изменений в parsers / scripts / pvcs. Только wipe + redownload + rebuild.

**Архивная политика:** rolling backup. После rebuild — старая `common-features.json` идёт в `docs/archive/common-features_v_pre_refresh_20260503.json`. Старый `common-features_v_pre_v50.json` (Sprint Parser-Unification backup) **остаётся** в архиве как историческая референс-точка V50-era. Дальше — только последний backup, чтобы архив не разбухал.

---

## 1. Контекст

### Текущее состояние scripts/snapgene_dna/

19 категорий, ~2822 .dna файлов, ~общий размер sizes неизвестен (read через `du` если станет важно). `.gitignore` исключает `*.dna` — файлы **не в git**, чистая локальная операция, push не везёт delete'ы.

### Инфраструктура downloader'а

`scripts/download_snapgene_library.py` (готовый, ~200 строк) делает:
- Scrape категорий с https://www.snapgene.com/plasmids/.
- Для каждой категории — XML index через `fetch.php?set={category}`.
- Для каждой плазмиды — download .dna binary через `fetch.php?set={category}&plasmid={slug}`.
- Rate limit 0.3 sec между запросами (sustained, не burst — sociable scraping).
- Skip-if-exists: если `out_path.exists() and stat().st_size > 100` — пропускает.
- 503 retry once с longer delay.

**Скрипт уже работает корректно** (использовался для изначальной выкачки 2822 файлов). Не трогаем.

### Инфраструктура rebuild'а

`scripts/build_features_from_snapgene.py` после Sprint Parser-Unification (`e8f0f56`) — единая точка построения common-features.json через `pvcs.snapgene_parser.parse_dna_file`. Параметры: `--min-occurrences 3 --min-length 30`. Output ~620 KB / 419 features.

**Скрипт работает.** Не трогаем.

### Что меняется

- `scripts/snapgene_dna/` — **полный wipe** + redownload.
- `gui/designer/public/common-features.json` — **rebuilt** на новых файлах.
- `docs/archive/common-features_v_pre_refresh_20260503.json` — **новый backup** перед rebuild.

### Чего НЕ касается

- Ни один Python-скрипт не модифицируется.
- `pvcs/snapgene_parser.py` — V50 fix остаётся.
- `tests/scripts/test_build_features.py` — guard'ы остаются.
- Никаких frontend изменений.
- M-B.3 working tree не трогается (отдельный sprint, параллельно).

---

## 2. Стратегия

**Three-step операция:**

1. **Wipe + Backup** — снести `scripts/snapgene_dna/` и забекапить current `common-features.json`.
2. **Redownload** — запустить `download_snapgene_library.py` без аргументов, дать скачать всё. Rate-limit 0.3 sec/file × ~2822 файла = **~14 минут нижний bound, реалистично 25-40 минут с retry'ями**.
3. **Rebuild + smoke** — запустить `build_features_from_snapgene.py`, сравнить stats с backup'ом, проверить что auto-annotate в Importer работает на pUC19 + 2-3 других плазмидах.

**Никаких параллельных операций.** Sprint serial — каждый step ждёт предыдущий.

**Если download падает посередине** (network glitch, rate limit, server 503 после retry) — **скрипт идемпотентен**: повторный запуск пропускает уже существующие файлы. Просто запускаем ещё раз. Нет нужды в transaction-safety.

---

## 3. Scope

### IN

**Wipe local SnapGene коллекции:**
1. Удалить директорию `scripts/snapgene_dna/` целиком (все 19 категорий, все .dna файлы).
2. Backup current `gui/designer/public/common-features.json` → `docs/archive/common-features_v_pre_refresh_20260503.json` (если файл уже существует с этим именем — overwrite; такого ранее не было).

**Redownload:**
3. `python scripts/download_snapgene_library.py --output-dir scripts/snapgene_dna/` — без `--categories`, без `--max-per-category`, полный download.
4. Verify по логу: `Total .dna files on disk: ~2800+` (точное число может отличаться от старых 2822 на десятки — SnapGene добавлял/убирал плазмиды), `Total size: ~XXX MB`. Все 19 категорий должны иметь `.dna` файлы.

**Rebuild common-features.json:**
5. `python scripts/build_features_from_snapgene.py --dna-dir scripts/snapgene_dna --output gui/designer/public/common-features.json --verbose --min-occurrences 3 --min-length 30 > /tmp/refresh.log 2>&1`.
6. Verify stats: `Files parsed: ~2800+/2800+ OK, K failed (K should be < 100)`. `Features in output: ~415-450` (drift от 419 baseline допустим в коридоре ±10%). By-type distribution не должно резко поменяться (~22 marker, ~48 reporter, ~168 CDS, ~77 promoter, ~29 terminator, ~21 rep_origin).

**Smoke test через Importer:**
7. Запустить backend (`python -m pvcs.cli serve` или эквивалент) + frontend (`cd gui/designer && npm run dev`).
8. Открыть `http://localhost:3000` → Importer → 4 тест-плазмиды: pUC19, BluescribeBA, pET28b или pET-22b (если в новой выкачке есть), pcDNA3.1(+) или pmKate2-C.
9. Verify auto-annotate:
   - **pUC19** — AmpR detected (861 bp, 286 aa, M start), lacZα detected (324 bp, 107 aa, M start), ori detected.
   - **BluescribeBA** — AmpR detected, lacZα detected, T7/T3 promoters detected.
   - **pET28b/22b** — KanR detected, T7 promoter detected, His6 tag detected.
   - **pcDNA3.1(+)/pmKate2-C** — fluorescent reporter detected (mKate2 / EGFP / GFP / mCherry в зависимости от плазмиды), promoter detected.

**Commit:**
10. `git add gui/designer/public/common-features.json docs/archive/common-features_v_pre_refresh_20260503.json`.
11. `git status` — проверить что **только** эти 2 файла staged. M-B.3 working tree, любые `__pycache__`, любые temp files **не** должны попасть в commit.
12. Commit:
    ```
    refresh(snapgene): full library wipe + redownload + rebuild common-features.json
    
    - scripts/snapgene_dna/: full wipe + redownload from snapgene.com
      (~2800+ .dna files, latest curation as of 2026-05-03).
    - gui/designer/public/common-features.json: rebuilt through unified
      pvcs.snapgene_parser (DEC-PARSER-COORD-01) on fresh data.
    - docs/archive/common-features_v_pre_refresh_20260503.json: backup
      of pre-refresh build (419 features from possibly stale ~2024 data).
    
    No code changes. Data refresh only.
    Stats: <files-parsed> OK / <failures> failed / <output-features> features.
    ```
13. **Не push** — Игорь делает push сам после визуального smoke acceptance.

### OUT

- **Изменения в parsers / scripts / pvcs.** Если refresh выявит баг в parser — отдельный TD, не в этом sprint'е.
- **Addgene integration.** Полностью отложен в Sprint Addgene Integration. Никаких `download_addgene.py`, никакого `addgene_dna/`, никакого `build_features_from_library.py` extension.
- **GenBank parser audit (TD-PARSER-AUDIT-GENBANK).** Не критичен для этого sprint'а — все .dna парсятся через `pvcs.snapgene_parser`, GenBank path не задействован.
- **Tuning classification параметров.** `MARKER_PATTERNS` / `REPORTER_PATTERNS` / `ORIGIN_PATTERNS` остаются как есть. Fungal-specific patterns (pyrG / amdS / pgla / pcbh) — отдельная feature если нужна, **не в этом sprint'е**.
- **Tuning `--min-occurrences` / `--min-length`.** Остаются 3 / 30. Если хотим больше features — отдельная итерация после визуального acceptance refresh'а.
- **Изменения в frontend auto-annotate logic** (`gui/designer/src/auto-annotate.js`). Refresh — data-only, не code.
- **Удаление dead deprecated скриптов** (`fetch_snapgene_plasmids.py` если deprecated). Отдельный TD-SCRIPTS-CLEANUP.
- **Финализация PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / TECH_DEBT.** Не в этом sprint'е, на финальной сессии после M-B.3 closed.

---

## 4. Архитектурные решения

1. **DEC-REFRESH-01 — Wipe + redownload как clean restart.** Не incremental refresh (где сравниваем local vs server и докачиваем diff) — потому что (а) нет authoritative manifest от SnapGene с timestamps; (б) downloader skip-if-exists работает только по filename, не по content hash; (в) clean restart proще и не оставляет stale копий с устаревшими аннотациями. Стоимость — ~30 минут wall-clock на download + ~50-100 MB трафика. Acceptable.

2. **DEC-REFRESH-02 — Rolling backup policy.** В `docs/archive/` остаются: (а) последний pre-refresh backup (`common-features_v_pre_refresh_<date>.json`), (б) первый исторически значимый backup `common-features_v_pre_v50.json` (V50-era, до Parser-Unification). Промежуточные backups между значимыми milestone'ами **не сохраняются** — иначе архив разбухает. Если нужно восстановить какую-то промежуточную версию — берём из git history (common-features.json в commits).

3. **DEC-REFRESH-03 — Smoke test acceptance criterion.** Sprint считается успешным только при **зелёном smoke на 4 reference plasmids** (pUC19 + BluescribeBA + pET28b/22b + pcDNA3.1/pmKate2-C). Если auto-annotate не находит хотя бы одну ключевую feature на одной из них — restore backup, debug. Это hard gate, не "best-effort".

---

## 5. Предположения

1. Сервер snapgene.com доступен и стабилен в момент запуска. Если есть network issues — wait + retry, sprint stalled но не failed.
2. Rate limit 0.3 sec корректно обрабатывается snapgene.com. Если есть signal что 0.3 sec triggering bans — увеличить до 0.5 sec в скрипте (это +50% wall-clock, не блокер).
3. Disk space на C: достаточен для ~50-100 MB новой коллекции. (Старые файлы wipe'нуты до redownload, поэтому net delta = 0 примерно.)
4. `python` команда в PATH указывает на интерпретатор с установленными `requests` / `beautifulsoup4` / `tqdm`. Если нет — `pip install requests beautifulsoup4 tqdm` first. (Они уже должны быть с прошлого использования скрипта, но check на всякий случай.)
5. SnapGene не сделал breaking change в схеме своего endpoint'а `fetch.php` с момента когда `download_snapgene_library.py` был написан. Если сделал — sprint stalled, нужен пересмотр downloader'а (это **не** scope refresh'а, отдельный TD-SCRIPTS-DOWNLOADER-FIX).
6. `gui/designer/public/common-features.json` после rebuild имеет **совместимый shape** с frontend `auto-annotate.js`. Schema не менялась с Parser-Unification (тот же JSON, новые координаты).
7. Frontend dev-server подхватит обновлённый common-features.json без перезапуска (Vite HMR). Если кеш браузера держит старую версию — hard refresh `Ctrl+Shift+R`.

---

## 6. Задачи

### K1 — Wipe + Backup

**Действия:**

1. `cd C:\Users\sinig\Desktop\RESplasmide`.
2. **Backup** current common-features.json:
   ```
   cp gui/designer/public/common-features.json docs/archive/common-features_v_pre_refresh_20260503.json
   ```
3. **Verify backup:** `ls -la docs/archive/common-features_v_pre_refresh_20260503.json` показывает ~620 KB (текущий размер post-Parser-Unification файла).
4. **Wipe** local SnapGene collection:
   ```
   rm -rf scripts/snapgene_dna/
   ```
   На Windows: `Remove-Item -Recurse -Force scripts\snapgene_dna\`.
5. **Verify wipe:** `ls scripts/snapgene_dna/` должно дать "No such file or directory" / эквивалент.

**Контракт K1:** `docs/archive/common-features_v_pre_refresh_20260503.json` существует ≥600 KB; `scripts/snapgene_dna/` не существует; никаких других изменений.

### K2 — Redownload

**Действия:**

1. `python scripts/download_snapgene_library.py --output-dir scripts/snapgene_dna/` — без других аргументов.
2. Скрипт сначала scrape'ит категории (~5 sec), потом для каждой XML index (~10 sec/cat × 19 cats), потом сами .dna files (rate-limit 0.3 sec/file × ~2800 files = **~14-30 минут wall-clock**).
3. Прогресс-бар через tqdm. Code следит за логом, если видит что более 5% files подряд fail (>5 fail из 100 sequential) — стоп, отчёт.
4. **Verify:** в конце скрипта summary с breakdown по категориям. Все 19 категорий должны иметь >0 files.

**Контракт K2:** `scripts/snapgene_dna/` существует, содержит 19 поддиректорий, total .dna файлов **в пределах ±5%** от baseline 2822 (т.е. 2680-2965). Если drastically меньше (<2500) — что-то сломалось в download'е, K3 не запускать, debug.

### K3 — Rebuild common-features.json

**Действия:**

1. `python scripts/build_features_from_snapgene.py --dna-dir scripts/snapgene_dna --output gui/designer/public/common-features.json --verbose --min-occurrences 3 --min-length 30 > /tmp/refresh.log 2>&1`.
2. Tail лога: `Parsed: M OK, K failed`. K **acceptable < 100** (raw .dna files иногда битые или nonstandard — это normal).
3. `Features: <N>` в конце лога — **N в коридоре 380-460** (419 baseline ±10%). Major drift вне коридора — risk-bullet.
4. By-type distribution в логе. Сравнить с baseline (CDS=168, promoter=77, misc_feature=54, reporter=48, terminator=29, marker=22, rep_origin=21). Major drift в одном из top-3 type'ов (>30% change) — risk-bullet.
5. `du -h gui/designer/public/common-features.json` — **600-700 KB** ожидаемо.

**Контракт K3:** common-features.json существует, in size range 600-700 KB, features count в коридоре, by-type distribution не резко смещён.

### K4 — Smoke test через Importer

**Действия:**

1. `cd gui/designer && npm run dev` (если не запущено).
2. Backend: `python -m pvcs.cli serve` (порт :8000).
3. Открыть Chrome: `http://localhost:3000`.
4. **Test plasmid 1: pUC19.dna**:
   - Drag-and-drop / открыть через File picker из `scripts/snapgene_dna/basic_cloning_vectors/pUC19.dna`.
   - Importer → ImportStartScreen → SingleInspector → SequenceTab.
   - **Expect:** AmpR (861 bp, 286 aa, M start), lacZα (324 bp, 107 aa, M start), ori detected.
5. **Test plasmid 2: BluescribeBA.dna** (`basic_cloning_vectors/BlueScribe.dna` или похожий — точное имя в новой выкачке проверяет Code).
   - **Expect:** AmpR detected, T7/T3 promoters detected.
6. **Test plasmid 3: pET28b или pET-22b** (`pet_and_duet_vectors_(novagen)/` категория).
   - **Expect:** KanR detected, T7 promoter detected, His6 tag detected.
7. **Test plasmid 4: pcDNA3.1(+) или pmKate2-C** (mammalian / fluorescent_protein category).
   - **Expect:** fluorescent reporter detected, mammalian promoter (CMV / SV40) detected.

**Контракт K4:** все 4 plasmids показывают ожидаемые auto-annotate features. Если хотя бы одна ключевая feature пропущена — стоп, restore backup, отчёт regression.

### K5 — Commit

**Действия:**

1. `git status` — verify только 2 файла modified: `gui/designer/public/common-features.json` + `docs/archive/common-features_v_pre_refresh_20260503.json` (как new).
2. **Если в `git status` видны другие файлы** (M-B.3 working tree, `__pycache__`, etc) — **не делать `git add .`**. Только targeted: `git add gui/designer/public/common-features.json docs/archive/common-features_v_pre_refresh_20260503.json`.
3. Commit message:
   ```
   refresh(snapgene): full library wipe + redownload + rebuild common-features.json
   
   Refreshed local SnapGene reference collection from snapgene.com (latest
   curation as of 2026-05-03). Previous local files dated back to spring
   2024 with stale annotations.
   
   - scripts/snapgene_dna/: full wipe + redownload (~2800+ .dna files,
     gitignored, not in repo).
   - gui/designer/public/common-features.json: rebuilt through unified
     pvcs.snapgene_parser (DEC-PARSER-COORD-01) on fresh data.
     Stats: <N> features (vs 419 baseline), by-type unchanged scope.
   - docs/archive/common-features_v_pre_refresh_20260503.json: backup
     of post-Parser-Unification rebuild (419 features from stale ~2024 data).
   
   No code changes. Data refresh only.
   
   ⚓ DEC-REFRESH-01: wipe + redownload as clean restart strategy.
   ⚓ DEC-REFRESH-02: rolling backup — keep last pre-refresh + V50-era milestone.
   ```
4. **Не push** — Игорь делает push сам после K4 manual visual acceptance.

---

## 7. Порядок и оценка

K1 → K2 → K3 → K4 → K5. Между K-шагами Code НЕ останавливается (кроме K2 → K3 если K2 зафейлился).

| Сеанс | K-шаги | Wall-clock | Активного Code |
|-------|--------|------------|----------------|
| 1 | K1 + K2 + K3 + K5 | ~30-45 минут (большая часть — download wait) | ~5 минут (запуск команд + проверки) |
| 2 (Игорь) | K4 manual visual smoke | ~10 минут | n/a |

Total ~45-60 минут wall-clock. Code занят только ~5 минут активного, остальное — waiting for download.

---

## 8. STOP-условие и формат отчёта

### STOP

После K5 Code останавливается. **НЕ:**
- Обновляет PROJECT_STATE / RELEASES / DECISIONS / ANCHORS / BUGS / TECH_DEBT / ARCHITECTURE_v2.
- Перемещает спеку в archive (это финализация).
- Делает push.
- Начинает Sprint Addgene Integration (отложен).
- Начинает M-B.3 K1 (отдельный sprint, параллельно).
- Делает `git add .` или `git commit -a` — **только targeted add двух файлов**.

### Формат отчёта

Code дописывает в конец `CURRENT_TASK.md`:

```
## Отчёт Code по Sprint SnapGene Refresh

- K1 backup: docs/archive/common-features_v_pre_refresh_20260503.json (X KB)
- K1 wipe: scripts/snapgene_dna/ removed
- K2 download:
  - Wall-clock: X min Y sec
  - Files downloaded: N (vs 2822 baseline, delta +/-X)
  - Failures: K (acceptable < 100)
  - Per-category breakdown: <list>
- K3 rebuild:
  - Files parsed: M OK / K failed
  - Features in output: F (vs 419 baseline)
  - By-type: marker=X, reporter=Y, CDS=Z, promoter=W, terminator=V, rep_origin=U, misc_feature=T
  - Output size: Q KB (vs 620 KB baseline)
- K4 smoke test:
  - Awaiting Игорь manual verification on 4 plasmids.
- K5 commit: <hash>
- pytest: 115/115 PASS (no code changes)
- vitest: 947/947 PASS (no code changes)
- Отклонения от спеки: <список или нет>
- Risk-bullets: <список или нет>
```

---

## 9. Риски

1. **SnapGene server rate-limits жёстче чем 0.3 sec.** Если получим 429 / 503 после retry — увеличить delay до 0.5-1.0 sec в `download_snapgene_library.py` локально и перезапустить. Sprint stalled на ~30-50 min, не failed. Если сервер вообще отдаёт 403 / blocks IP — sprint failed, нужен пересмотр headers / proxy / отложить на другой день. Mitigation: **pre-flight check** в K2 — скачать одну категорию `--categories basic_cloning_vectors` first как probe; если работает — продолжать full download.

2. **Drastic drift в features count после rebuild.** Если новая коллекция содержит существенно меньше plasmids (например 1500 вместо 2800), `--min-occurrences 3` отсекает features которые раньше проходили. Получим резкое падение features count (419 → 250). Mitigation: **K3 verify** проверяет коридор 380-460. Если сильно вне — **сначала** проверить K2 stats (сколько файлов скачалось), **потом** решать decrease `--min-occurrences` до 2 или принимать новый baseline.

3. **Auto-annotate регрессирует на специфических плазмидах.** Если SnapGene изменил какие-то annotations (например renamed feature, или сменил organism tag), `common-features.json` после rebuild может не содержать feature которое раньше было. Например AmpR может теперь называться "bla" в curated SnapGene, и MARKER_PATTERN не ловит. Mitigation: K4 smoke test ловит это на 4 plasmids. Если регрессия — restore backup + добавить failing pattern в `MARKER_PATTERNS` (но это код-изменение, **out of scope** этого sprint'а — open TD).

4. **K5 commit случайно zatypaет M-B.3 working tree.** `git add .` или `git commit -a` поверх dirty working tree (14 новых SequenceView файлов + 6 модифицированных) внесёт всё это в один Refresh commit, поломав логическую структуру коммитов M-B.3 K1..K8 которые Игорь будет делать вручную. Mitigation: **K5 действие 2 явно targeted** — только 2 файла, проверка `git status` перед commit.

5. **`scripts/snapgene_dna/` wipe ловит файлы которые там не должны быть.** Если кто-то (Игорь / Code) положил туда **non-SnapGene** .dna файлы (свои клонированные плазмиды, тестовые fixtures) — wipe их удалит. Mitigation: **pre-K1 проверка** — `ls scripts/snapgene_dna/` показывает только 19 ожидаемых категорий-директорий и никаких файлов на верхнем уровне. Если что-то непонятное — стоп, спросить Игоря.

6. **Network drop в середине download'а.** Скрипт идемпотентный (skip-if-exists), повторный запуск продолжит. Mitigation: K2 действие 4 — verify total files. Если меньше ожидаемого — re-run K2.

7. **Disk space exhaustion.** ~100 MB должно быть. Если C: переполнен — sprint failed, нужно clean up disk. Mitigation: **pre-K1 check** — `df -h C:` должно показывать > 1 GB free. (Тривиально на современных машинах.)

---

## 10. Открытые вопросы

1. **Точная дата изначальной выкачки `scripts/snapgene_dna/`.** Не критично для sprint'а, но полезно для commit message. Если Игорь помнит — добавить в message. Если нет — "spring 2024 ~estimate".
2. **Включать ли pre-flight probe (single category first)?** Я в риске #1 предложил mitigation через basic_cloning_vectors сначала. Если Игорь хочет — добавляем как K2.0 шаг (3 минуты), снижает риск catastrophic 403 после 20 минут wait. Если предпочитает rolling-the-dice — пропускаем, идём напрямую в full download. **Default: Code делает probe, это безопаснее.**
3. **Что если новая выкачка даёт 419 → 380 features (нижняя граница коридора)?** Принимаем как новый baseline (SnapGene обновил коллекцию, мы следуем) или alarm? **Default: принимаем, smoke test на 4 plasmids остаётся главным критерием. Если smoke зелёный — всё в порядке, даже если absolute count чуть упал.**

---

_Spec v1.0 — 03.05.2026 PM. Pre-implementation, ready for Code start. Источник правды — Sprint Parser-Unification commit `e8f0f56` (unified parser + last rebuild) + биолог запрос на clean restart с свежими SnapGene данными. Read-before-spec: `download_snapgene_library.py` + `build_features_from_snapgene.py` + `.gitignore` (verified `*.dna` excluded) + `docs/archive/` listing (verified pre-V50 backup существует, для refresh нужен новый). Sprint Addgene Integration отложен — отдельная сессия со свежей discussion'ой scope'а._

# WF_IMPORT_PREVIEW_GAP.md — Workflow Import & Preview, gap-analysis

**Статус:** этап (1) per-workflow цикла (Vision § 7), pending обсуждение перед этапом (2) моделирования визуала.
**Workflow:** Import & Preview — file drop / catalog / file picker → ImportDecisionModal → PlasmidViewer.
**Версия:** v0.5.2-alpha (~265 коммитов, 958 тестов). Дата: 26.04.2026.

Vision-якорь: § 3 ставка 5 (Decision-modal-driven import), ставка 6 (fragment-aware rendering + provenance). § 8 #7 (Import / Export) перенесён в начало очереди — обоснование в `CURRENT_TASK.md`.

---

## 1. Скоуп

**Точки входа (4):**
1. Window-level OS drag-drop (App.jsx::handleFileDrop, строки 165–178).
2. QuickStart на пустом canvas — кнопка «📂 Импортировать плазмиду».
3. PartsPalette — file button (общий `ACCEPT_STRING` из `file-import.js`).
4. CatalogPanel — НЕ файл, а lazy-load из `public/plasmids-data/{cat}.json` (2822 SnapGene плазмиды).

**В скоупе:** парсинг (.dna / .gb / .gbk / .fasta), enrichment (importFeatures + enrichWithCommonFeatures + autoAnnotate), ImportDecisionModal, PlasmidViewer, CatalogPanel.

**Не в скоупе:** Export (отдельный workflow), assembly wizards, открывающиеся через `presetMode` после import — это Mutagenesis / Restriction / Gibson workflows.

---

## 2. Sub-workflows биолога

**S1. Drag-drop `.dna` (бинарный SnapGene).** Уходит в `/api/import` (FastAPI). Backend: `parse_snapgene` (parser.py:166) — PRIMARY свой бинарный парсер `pvcs.snapgene_parser.parse_dna_file` (NO внешних зависимостей), FALLBACK `Bio.SeqIO.read(.., 'snapgene')` через `try / except Exception` (parser.py:200). Затем frontend enrichment.

**S2. Drag-drop `.gb` / `.gbk` / `.genbank` (текстовый GenBank).** Frontend `parseGenBank(text)` — state-machine header / FEATURES / ORIGIN, поддерживает `complement()`, `join()`, `order()`. **Останавливается на первом `//` молча** (genbank-parser.js:60).

**S3. Drag-drop `.fasta` / `.fa` / `.fna`.** Frontend `parseFasta` — имя из `>`, остальное sequence. Topology фиксированно `'linear'`, features пусты. Затем `autoAnnotate` + `enrichWithCommonFeatures` дают full auto-annotation.

**S4. QuickStart / PartsPalette file picker.** Тот же `handleFileImport`, но через явный picker. Multi-file НЕ поддержан — `<input type="file">` без `multiple`.

**S5. Открытие из CatalogPanel.** Поиск по index → клик плазмиды → fetch `plasmids-data/{cat}.json` → preview detail **inline** в той же модалке (без map). 4 actions: `В библиотеку` / `Просмотреть` / `Клонировать` / `Как backbone`. Структурно дублирует ImportDecisionModal без переиспользования.

**S6. Preview через action `Просмотреть`.** ImportDecisionModal::view → `setViewerPart(part)` → `<PlasmidViewer>` 950×92vh. Sync map ↔ annotations ↔ sequence через `selectedRegionId`. Footer: 5 групп кнопок (Закрыть, wizard actions, Версии, cDNA, Экспорт GenBank).

---

## 3. Что есть сейчас

### 3.1 Парсеры

| Формат | Где | Файл |
|---|---|---|
| `.dna` | Backend | `pvcs/snapgene_parser.py` PRIMARY + `pvcs/parser.py::parse_snapgene` FALLBACK BioPython |
| `.gb`/`.gbk` | Frontend | `genbank-parser.js` |
| `.fasta`/`.fa` | Frontend | `file-import.js::parseFasta` |
| `.dna` endpoint | Backend FastAPI | `gui/api/server.py::import_file` (POST `/api/import`) |

Все sequence sanitized at entry — `sanitizeSequence(...)` на каждом возврате (⚓ DECISIONS).

### 3.2 Enrichment pipeline

В `file-import.js::handleFileImport` логика **дублируется** в двух ветках (.dna и текстовых форматах):

1. `importFeatures(rawFeatures, length, format)` — конвертация в 3-уровневую модель (region/detail/point) с `regionId` backfill. Фильтр: `source` features удаляются всегда; `gene` фильтруется если CDS/RNA child внутри. Heuristic для unknown types: span >10% и не внутри region → новая region; иначе → detail.
2. `enrichWithCommonFeatures(sequence, annotations)` — homology-naming через 415 verified features (common-features.json из 2822 SnapGene плазмид). Проставляет `knownFeature`, `identity`, `source: 'common_db'`. ORF detection (`detectORFs`) добавляет unknown CDS. Снимает generic `misc_feature` >80% sequence.
3. `autoAnnotate({sequence, annotations})` — detail-уровень: signal peptides, tags, domains, RE sites. Дозаписывает только новые detail/point.

### 3.3 ImportDecisionModal (4.26 KB)

Header: `📂 {name} · {length} п.н. · {topology}` + опц. `· {N} features`. Actions: для circular — 6, для linear — 2. **Decision процессуальный** («что делать»), не семантический («верно ли распознано»).

### 3.4 PlasmidViewer (20.12 KB)

Read-only modal. Секции: header, CDS warnings (red strip без max-height — V8), main split (PlasmidMap 400 px + AnnotationEditor readOnly), нижняя панель sequence (sense + antisense + AA exon-aware + RE cut markers ▼ только для cutters `cutCount ≤ 2`, отключён при `seq.length > 50000`), footer 5 групп.

### 3.5 CatalogPanel (11.09 KB)

Modal 700×85vh, lazy-load index → category JSON. Detail view inline **без map**. 4 actions; `Просмотреть` — единственный, что открывает PlasmidViewer (`setViewerPart`).

### 3.6 Wiring в App.jsx

Window-level handlers (строки 279–280) с `dragCounter` для child-elements. `handleFileDrop` забирает `e.dataTransfer.files[0]` — **только первый файл**. На ошибку — нативный `alert()`.

---

## 4. Связанные V-баги (open)

**Прямой скоуп:**
- **V8** CDS-WARNINGS-OVERFLOW — в PlasmidViewer 28 warnings перекрывают 60% модалки.
- **V9** SHORT-ANNOTATION-LABELS — AnnotationEditor скрывает имена при ширине ≤10%.
- **V10** SBOL-GLYPH-PALENESS — на 14px tree list `fillOpacity=0.15` практически не виден.

**Косвенный (читаемость карты в preview):** V1 REGION-OVERFLOW, V2 DUP-REGIONS, V6 RE-LABELS-OVERLAP — все в PlasmidMap. Запланированы под Vision § 8 #2 (working with circular plasmids), здесь затрагиваются опосредованно.

---

## 5. Белые пятна

### 5.1 Vision ставка 5 (Decision-modal-driven import)

**5.1.1. Семантический step.** ImportDecisionModal — шаг 1 («что делать»), шага 0 («верно ли распознано») нет. Биолог не имеет UI, чтобы:
- Override topology (parser сказал circular, биолог хочет linear или наоборот).
- Override origin start (re-index — стандарт SnapGene «Set Origin»).
- Отключить enrichment (импортировать «as-is»).
- Увидеть «сколько features из файла vs сколько добавлено enrichment'ом».

**5.1.2. Multi-record `.gb`.** `parseGenBank` останавливается на первом `//` (genbank-parser.js:60) → второй+ записи невидимы. Backend `Bio.SeqIO.read` — тоже только первая запись. Биолог без feedback'а: вторая плазмида в файле пропала.

**5.1.3. Re-index origin hint.** Если detected `rep_origin` / `oriT` / ARS не в позиции 0 — нет UI «origin на позиции X, переиндексировать?». Стандартное «Set Origin» отсутствует.

**5.1.4. Parse fallback UX.** PRIMARY `.dna` parser → BioPython FALLBACK silently (parser.py:197 `except Exception`). Биолог не знает, что features могут быть неполными после fallback'а. На полный fail — `alert()` (handleFileDrop:178). Нет: badge `parsed via fallback`, toast `extracted N (PRIMARY) / M (FALLBACK)`, видимого logging'а.

**5.1.5. Multi-file drop.** App.jsx::handleFileDrop:170 — `files[0]`. Drop 5 файлов → 4 проигнорированы молча, без warning'а.

**5.1.6. Repeat import.** `id: 'import_${Date.now()}'` гарантирует уникальный Part ID, но не проверяет дубль (`name + length + checksum`). Дважды импортнул — две копии в библиотеке без диалога.

### 5.2 Vision ставка 6 (Fragment-aware rendering + provenance)

**5.2.1. %coverage не считается.** `enrichWithCommonFeatures` ставит `identity` (% nt совпадение в hit) и `source: 'common_db'` (auto-annotate.js:534–550), но **не coverage** (hit длина / reference длина из common-features.json). Без этого ставка 6 «<95% coverage → white-fill + colored outline» нереализуема.

**5.2.2. Provenance enum узкий.** `source` поле имеет 3 значения: `'import'` (хардкод в importFeatures), `'common_db'` (enrichment), отсутствует у autoAnnotate base. ORF результаты помечены параллельным полем `detector: 'orf_scan'` — разнобой. Vision просит расширенный энум: `'auto-genolib' | 'auto-orf' | 'auto-re-site' | 'manual' | 'imported-genbank' | 'imported-snapgene' | 'imported-fasta' | 'imported-addgene' | 'derived'`.

**5.2.3. Provenance tooltip.** AnnotationEditor (readOnly в PlasmidViewer) и PlasmidMap не показывают на hover «GenoLIB hit, X% identity, Y% coverage» / «Imported from SnapGene, original name «AmpR»». Все аннотации визуально равны.

**5.2.4. Fragment-aware rendering.** Аннотация с 67% coverage truncated AmpR рендерится одинаково с full-length AmpR. Нет визуальной отметки incomplete (white-fill / dashed outline / hashed pattern). Это центральная differentiator-ставка по Vision.

---

## 6. Pending decision points для этапа (2)

Для kickoff'а сессии моделирования визуала с Игорем:

1. **Семантический step** — отдельный modal перед actions, banner-strip над actions, или collapsible header в существующем ImportDecisionModal? Двухступенчатый flow ломает «один модал — одно решение»; banner-strip компактен, но нагружает один modal двумя ролями.

2. **Multi-record `.gb`** — dialog «выбери одну», batch «импортировать все в библиотеку», или комбинированный («одна в decision modal, остальные drafts в библиотеку»)?

3. **`.dna` parse fallback** — silent (как сейчас), inline badge на header decision modal, toast при открытии preview, или диагностика в footer PlasmidViewer? От ответа зависит, нужно ли поле `parser_used: 'primary' | 'fallback'` в ответе backend'а.

4. **PlasmidViewer footer** — оставить 5 групп или унести часть (`cDNA`, `Версии`, `Экспорт`) в `Действия ▾` dropdown? При circular + introns + версии = 8 кнопок, footer перегружен. Vision § 5 принцип 1 «keyboard-first» намекает на shortcuts вместо кнопок.

5. **CatalogPanel preview detail** — встроить map в саму CatalogPanel (дубль кода с PlasmidViewer), открывать PlasmidViewer поверх (modal-on-modal), или PlasmidViewer общий компонент с переключаемым mount-point (refactor)?

6. **Repeat-import dedup** — по `name + length + checksum` или только `name`? При обнаружении дубля — диалог «уже есть {name}: добавить как версию (parentId) / заменить / отменить»?

7. **Provenance enum** — фиксированный 7–9 значений (typed) или extensible string (гибкость)? От ответа зависит data-model сдвиг для ставки 6.

8. **Multi-file drop** — batch import dialog «N файлов: [list], импортировать все как drafts?» или silently первый файл (как сейчас) с warning toast «N файлов проигнорировано»?

---

## 7. Размеры модулей в скоупе

На случай этапа (3) спеки:

| Файл | Размер | Зона |
|---|---|---|
| `App.jsx` | 39.29 KB | **NEAR HARD .jsx 40** — Sprint 2b декомпозиция в backlog |
| `auto-annotate.js` | 18.68 KB | Близко к soft .js 20 KB |
| `components/PlasmidViewer.jsx` | 20.12 KB | OK |
| `components/CatalogPanel.jsx` | 11.09 KB | OK |
| `components/ImportDecisionModal.jsx` | 4.26 KB | OK |
| `file-import.js` | 7.06 KB | OK |
| `genbank-parser.js`, `import-annotations.js` | 7.47 / 9.27 KB | OK |

**Риски для будущей спеки:**
- `auto-annotate.js` 18.68 KB. Расширение под provenance + coverage может перевалить soft 20 KB → **вероятна декомпозиция** (вынести `enrichWithCommonFeatures` + ORF integration в `enrichment.js`).
- `App.jsx` на границе hard 40 KB. Любая правка wiring (новый Provider / новый modal / новые store actions) рискует свалить за hard. **Если спека потребует существенных правок App.jsx — Sprint 2b декомпозиция должна идти первым шагом** (или входить в скоуп этой спеки).

---

## 8. STOP-условие

Gap прочитан Игорем. После согласия — handoff к этапу (2): «gap готов, переходим к этапу (2) моделирование визуала отдельной сессией». Этап (2) использует этот документ как pre-read и ведёт обсуждение по pending decision points § 6.

---

_Создан 26.04.2026, per-workflow цикл Vision § 7. Этап (1) — gap. Pending этап (2) — моделирование визуала._

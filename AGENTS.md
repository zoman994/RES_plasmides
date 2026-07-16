# AGENTS.md — BodgeGene (PlasmidVCS)

## Восстановление контекста

```
Прочитай AGENTS.md → BUGS.md → CURRENT_TASK.md → PROJECT_STATE.md → DECISIONS.md
```

Пяти файлов хватит (~30 KB). RELEASES.md / ANCHORS.md / docs/ — только по явной инструкции в CURRENT_TASK.md или по триггерам из CHAT_PLAYBOOK.md §1.

---

## Проект

BodgeGene — визуальный конструктор генетических сборок (плазмид). React SPA + Python CLI бэкенд.

**Автор:** Игорь Синельников, ФИЦ Биотехнологии РАН  
**Путь:** `D:\RESplasmide`  
**Версия:** v0.8.4-alpha (feature-detection partial pipeline V134/V138 + math/bio orientation audit V118–V126 + v0.5-верстак cleanup −404КБ, 31.05.2026; база — four-tier T1–T10 + canvas UX + primer redesign из v0.8.3). Архитектура v0.6+ — в `docs/ARCHITECTURE.md` (единый агрегатор: принципы, data model, окна, persistence, roadmap). Фундаментальные решения — в `ANCHORS.md`; sprint-level — в `DECISIONS.md`; журнал по версиям — в `RELEASES.md`. **Точные счётчики (версия / число ⚓ / тесты / promotion-кандидаты) НЕ дублируются здесь** — берутся из `PROJECT_STATE.md` (первая строка + snapshot) + `RELEASES.md` + `ANCHORS.md`; в AGENTS.md они устаревают. Предыдущая v0.5.4-alpha (~290 коммитов, 1126 тестов) — feature-complete, **wipe data при переходе на v0.6** (⚓ DEC-V2-08 «quality > speed»).

**Стартовая ссылка:** вся архитектура v0.6+ — в `docs/ARCHITECTURE.md`. Читается перед любой M-A...M-I сессией, не в стартовом пакете (CURRENT_TASK.md явно направляет туда).

---

## Манифест производительности: слабый компьютер — базовая платформа

**Статус:** постоянный архитектурный контракт BodgeGene. Он обязателен при проектировании поиска, выравнивания, аннотации, визуализации, локальных моделей и других вычислительных функций. Изменяется только осознанным совместным решением, а не ради ускорения отдельной реализации.

### Эталонная машина

- **Базовая цель:** Windows 10/11, 2 физических ядра / 4 потока, 8 GB RAM, интегрированная графика.
- **4 GB RAM:** best-effort режим для обычных плазмид; комфортная работа с крупными библиотеками не обещается.
- Интернет и выделенная GPU не требуются для основной работы. Тяжёлые локальные модели могут быть опциональными.

### Неподвижные принципы

1. **Биологическая точность не понижается молча.** На слабой машине можно уменьшить детализацию отрисовки, число подписей, анимации, overscan и параллелизм, но нельзя незаметно упрощать алгоритм или пропускать биологические проверки. Быстрый предварительный результат явно помечается как неполный; сохранение и экспорт требуют точной финальной проверки.
2. **Интерфейс всегда остаётся отзывчивым.** Тяжёлые вычисления не выполняются в UI-потоке: они идут в постоянных worker'ах с отменой, stale-drop, прогрессом и контролем памяти. На двухъядерной машине одновременно работает не более одного тяжёлого compute-worker; на более мощной машине минимум одно ядро оставляется интерфейсу.
3. **Сначала алгоритм и данные, потом другой язык.** До переписывания применяются профилирование, индексы minimizer/k-mer, инкрементальный пересчёт, кэширование по содержимому, виртуализация и LOD. Rust/WASM не компенсирует полный повторный перебор или лишние копирования данных.
4. **Один вычислительный контракт для всех поставок.** React/JavaScript управляет сценарием через `BioComputeBackend`; обязательный JS fallback обеспечивает совместимость, WASM работает внутри Dedicated Worker в браузере/PWA, а тот же Rust crate при необходимости используется нативно в desktop-оболочке. UI и биологические правила не дублируются между реализациями.
5. **Local-first остаётся нормой.** Базовые функции, проверка конструкта и воспроизводимость не зависят от облака. Маленькие модели загружаются лениво, имеют версию, ограниченный ресурсный бюджет и детерминированный fallback; они помогают анализу, но не становятся единственной точкой биологического решения.
6. **Оптимизируется измеренный сценарий.** Каждая крупная оптимизация подтверждается одинаковым benchmark-набором на эталонной слабой машине. Версии алгоритмов, моделей и биологических баз входят в метаданные результата и ключи кэша.

### Порядок оптимизации

1. Измерить end-to-end время, long tasks, память, копирования и время отмены на эталонной машине.
2. Убрать тяжёлую работу из UI-потока; добавить отмену, прогресс, stale-drop и ограничение параллелизма.
3. Устранить повторную работу: постоянные индексы, ленивые данные, инкрементальный пересчёт и кэш с ключом `sequenceContentHash + topology + algorithmVersion + normalizedSettings`.
4. Снизить цену передачи данных: `Uint8Array`/`Uint32Array`, компактный CIGAR и пакетные вызовы; никаких вызовов WASM на каждый нуклеотид и гигантского JSON между слоями.
5. Только после повторного профилирования переносить доказанные hot kernels в Rust/WASM. Первые кандидаты: WFA/Gotoh/POA-выравнивание и splice/gene-model inference; поиск и другие модули переносятся лишь при подтверждённой необходимости.

### Gate для Rust/WASM

Перенос разрешён, только если одновременно выполнены условия:

- kernel занимает **более 30%** времени реального целевого сценария;
- прототип даёт минимум **2× end-to-end** ускорение с учётом сериализации и передачи данных;
- пик памяти не хуже JS-реализации более чем в **1.25×**;
- golden/property/differential-тесты подтверждают биологическую эквивалентность;
- сохранены JS fallback, ленивая загрузка и отмена операции.

### Начальные бюджеты приёмки

| Метрика на эталонной машине | Цель |
|-----------------------------|------|
| Реакция интерфейса и отмена операции, p95 | < 100 ms |
| Long task в UI-потоке в обычном сценарии | < 50 ms |
| Частичный поиск по метаданным | < 100 ms |
| Точный поиск по 1 Mb DNA после готовности индекса | < 1 s |
| Открытие обычной плазмиды | < 1 s warm; < 3 s cold |
| Память при библиотеке 10 Mb | < 250 MB; stress ceiling < 500 MB |

Бюджеты уточняются только по воспроизводимым измерениям. Их нельзя молча ослабить ради прохождения теста или выпуска функции.

---

## ПРАВИЛА (обязательные)

### 1. Тесты ПЕРВЫМИ, код вторым

```
Написать тесты (red) → Написать код (green) → npm test
```

Никогда не писать код без теста. Это главное правило проекта.

### 2. Один файл задания

Все задачи — в одном CURRENT_TASK.md. Никаких `_1b`, `_append`, побочных файлов. Если нужно дополнить — дополняй основной файл.

### 3. Проверка после каждого изменения

```bash
cd gui/designer && npm test && npx vite build
```

### 4. Баги — ТОЛЬКО в BUGS.md

Обнаружил баг → записал в BUGS.md. Починил → отметил `[x]`. НИКУДА БОЛЬШЕ — ни в docs/, ни в PROJECT_STATE.md, ни в отдельные файлы. BUGS.md — единственный трекер.

### 5. Обновляй документацию после сессии

- `RELEASES.md`: новый версионный блок (при бампе версии) / дополнение текущего (без бампа).
- `PROJECT_STATE.md`: обновить snapshot (версия / тесты / «Что работает» / «Что дальше»).
- `BUGS.md`: обновить статусы.
- `DECISIONS.md`: если было спринт-level решение; `ANCHORS.md` — если фундаментальное (⚓).
- `CURRENT_TASK.md`: отметить выполненные задачи.
- `gui/designer/package.json` + `gui/designer/src/lib/version.js`: bump при финализации спринта (M-A.x = v0.6.x, M-B = v0.7.0, ...).

### 6. Координация Codex Chat ↔ Codex

| Документ | Кто пишет | Кто обновляет |
|----------|-----------|---------------|
| `CURRENT_TASK.md` | Chat создаёт задачу | Code отмечает ✅ |
| `RELEASES.md` | Chat финализирует версионный блок | Chat при бампе версии |
| `PROJECT_STATE.md` | Chat (snapshot при финализации) | Chat |
| `DECISIONS.md` | Chat добавляет sprint-level | Chat |
| `ANCHORS.md` | Chat добавляет фундаментальные ⚓ | Chat |
| `BUGS.md` | Оба добавляют баги | Code отмечает [x] |
| `docs/*.md` (спеки) | Chat создаёт | Code НЕ редактирует тело спеки; ставит только статус-шапку `✅ РЕАЛИЗОВАНО` после реализации |

**Жизненный цикл спеки:**
1. Chat пишет спеку в docs/ (напр. docs/RESTRICTION_CLONING.md)
2. Chat копирует задачи из спеки в CURRENT_TASK.md
3. Code реализует по CURRENT_TASK.md
4. После реализации: Code ставит `**Статус:** ✅ РЕАЛИЗОВАНО [дата]` в заголовок спеки
5. Когда спека полностью реализована → перемещается в docs/archive/

**Запрещено:**
- Создавать параллельные трекеры багов (MASTER_TODO.md, TEST_RESULTS.md и т.п.)
- Дублировать информацию между docs/ файлами
- Держать в docs/ больше 8 активных файлов (остальное → archive/)

### 7. Лимиты размера модулей (⚓ DECISIONS.md 22.04.2026, калибровка ⚓ DEC-SIZE-CALIBRATION-01 08.05.2026)

Пределы на один файл:
- `.jsx` компонент — hard **40 KB**, soft warning 30 KB
- `.js` helper / algorithm — hard **25 KB**, soft warning 20 KB
- Data-файлы (словари, константы, локали — `restriction-db.js`, `i18n.js`, `tags-db.js`, `part-descriptions.js`) — не лимитируются

**Формальное превышение hard НЕ автоматически требует декомпозицию** (калибровка 08.05.2026). Триггеры: (1) rate-of-change >5 KB за спринт два спринта подряд, (2) entanglement (правка одной фичи в файле ломает другую), (3) explicit правка в следующем спринте. Stable файлы (рост ≤1 KB за 2+ спринта) без entanglement — Watch list, не блокер. Разбивка Активный/Watch по открытым TD-SIZE-* — в ANCHORS.md DEC-SIZE-CALIBRATION-01 + TECH_DEBT.md «Файлы над size budget».

**Если модуль в скоупе спеки уже ≥ hard И в Active decomp по calibration:** Chat ставит декомпозицию первым пунктом спеки. Если не поставил — Code останавливается и просит Chat дополнить спеку. **Если в Watch list** — правка продолжается без декомпозиции, Code в отчёте фиксирует рост (если вырос >2 KB) — если trigger вспыхивает (rate-of-change второй спринт подряд), TD повышается в Active.

**В отчёте после реализации спринта** Code запускает (Git Bash / PowerShell):

```bash
cd gui/designer/src
find components -name '*.jsx' -printf '%s %p\n' | sort -n | tail -15
find . -maxdepth 1 -name '*.js' -printf '%s %p\n' | sort -n | tail -10
```

И выдаёт в отчёте две строки:
- **Новые нарушители:** файлы, переросшие hard за этот спринт (с указанием скачка в KB)
- **Warning signal:** файлы, выросшие >5 KB за спринт (даже если не перевалили hard)

Если ни одного такого — просто «size budget: OK». Это единственный канал для Chat увидеть дрейф размеров между спринтами без ручной проверки.

---

## Архитектура

### Frontend (gui/designer/)

```
src/
├── App.jsx              — root layout, wiring, 14 modals
├── store/               — Zustand 6 slices (project, fragment, junction, primer, ui, flow)
├── hooks/               — useGeneratePrimers, useFragmentHandlers
├── components/          — 206 React компонентов (.jsx non-test; эскиз ниже частью описывает v0.5-верстак, снесён в v0.8.4 — актуальное в docs/ARCHITECTURE.md)
│   ├── QuickStart       — welcome screen при пустом canvas (6 actions)
│   ├── ImportDecisionModal — smart import при file drop
│   ├── ActionBar        — sticky actions после расчёта праймеров
│   ├── DesignCanvas     — 4 view modes (blocks/sequence/map/racetrack)
│   ├── PartBlock        — фрагмент на canvas (regular/merged/compact)
│   ├── JunctionBlock    — junction настройки (overlap/GG/RE/KLD/ligation)
│   ├── JunctionDNA      — визуал стыка (праймеры + overlap zone)
│   ├── CatalogPanel     — SnapGene каталог (2800+ плазмид, lazy-loaded)
│   ├── PlasmidUseWizard — 10 режимов (view/use/restriction/replace/disassemble/extract/mutate/insert/delete/versions)
│   └── flow/            — Project Flow (@xyflow/react, 5 node types, 3 edge types)
├── local-primer-design.js — клиентский primer design (без API)
├── tm-calculator.js     — SantaLucia 1998 NN Tm
├── golden-gate.js       — GG enzyme DB + validation (Type IIS ТОЛЬКО)
├── restriction-db.js    — 63 RE + digest() + checkDoubleDigest() + generateRETail()
├── orf-detection.js     — ORF detection (ATG→stop ≥100aa, обе цепи)
├── tags-db.js           — 13 PEPTIDE_TAGS + 5 FUSION_PARTNERS
├── validate.js          — validateJunctionEnds + end scanning
└── __tests__/           — Vitest (~583 tests)
```

### Backend (src/pvcs/)

Python CLI + FastAPI. 22 модуля, 112 pytest тестов. Бэкенд НЕ нужен для основной работы — primer design, Tm, validation всё на клиенте. Нужен для .dna import (свой binary парсер snapgene_parser.py PRIMARY, BioPython FALLBACK).

### Tech stack

React 19, Vite 8, Tailwind 4, Zustand 5 + Immer, React Compiler, @xyflow/react, Vitest, react-dnd.

---

## Ключевые концепции

| Термин | Значение |
|--------|----------|
| **Part** | Элемент в библиотеке (CDS, promoter, terminator). Статусы: draft/verified/archived |
| **Fragment** | Part на canvas сборки |
| **Junction** | Соединение между фрагментами (overlap/GG/RE/KLD/ligation) |
| **Merged block** | Склеенные фрагменты с пунктирным контуром и "швами" |
| **Assembly** | Конструкт = фрагменты + junctions + праймеры |
| **Annotation** | 3 уровня: region > detail > point. Все в annotations[], НЕТ отдельного domains[] |

### Типы блоков на canvas

| Тип | needsAmplification | subFragments | Описание |
|-----|--------------------|--------------|----------|
| Regular (R) | true | null | Обычный из палитры |
| No-PCR (N) | false | null | Без амплификации |
| Merged (M) | false | [...] | Склеенные фрагменты |
| Product (P) | false | [...] | Результат completeAssembly |

### Биологически корректные методы сборки

| Топология | Junction | Метод | Label |
|-----------|----------|-------|-------|
| Линейная | overlap | Overlap PCR | OV-PCR |
| Кольцевая | overlap | Gibson Assembly | Gibson |
| Любая | golden_gate | Golden Gate | Golden Gate |
| Любая | kld | KLD | KLD |
| Любая | ligation | Restriction Cloning | RE-клонирование |
| Любая | re_ligation | RE лигирование | RE-лигирование |

### Ферменты: строгое разделение

- **GG_ENZYMES** (golden-gate.js): Type IIS (BsaI, BpiI, BsmBI, BtgZI, SapI) — ТОЛЬКО для Golden Gate
- **RE_ENZYMES** (restriction-db.js): 63 классических (EcoRI, BamHI, etc.) — ТОЛЬКО для RE-лигирования
- Два словаря, два файла. НЕ СМЕШИВАТЬ.

### Restriction cloning pipeline

```
digest(sequence, annotations, enzyme1, enzyme2?) → backbone + excised
checkDoubleDigest(enzyme1, enzyme2) → buffer/temp compatibility
checkInsertSites(insertSeq, enzyme1, enzyme2) → internal site warnings
checkReadingFrame(enzyme) → frame check for CDS inserts
generateRETail(enzyme) → protective bases + RE site for primer tails
```

### Adaptive overlap для "без ПЦР" соседей

Если сосед фрагмента — "без ПЦР", split mode автоматически переключается на full overlap (30bp вместо 15bp). Если оба соседа "без ПЦР" → warning "overlap невозможен" (кроме ligation junctions).

---

## UX Flow

### Пустой canvas → QuickStart
6 кнопок: restriction, gibson, golden_gate, mutagenesis, import, free.

### File drop → ImportDecisionModal
Circular: 6 действий (restriction/backbone/mutagenesis/view/library/disassemble). Linear: 2 (view/library).

### Wizard → presetMode bypass
`wizardPresetMode` пропускает меню PlasmidUseWizard → сразу нужный режим.

### Праймеры рассчитаны → ActionBar
Sticky: протокол, заказ олигов, GenBank, завершить сборку.

### Header: ⚙️ Настройки dropdown
Polymerase + primer prefix вынесены из header в collapsible dropdown.

### Breadcrumb: Проект → Сборка
Навигация Construct ↔ Flow.

---

## Принцип двух кликов

Любая операция ≤ 2 кликов. Expert mode = always ON (нет гейта).

| Действие | Как |
|----------|-----|
| Добавить фрагмент | Drag из палитры |
| Удалить | Click → Del |
| Редактировать | Double-click |
| Перевернуть | Click → R |
| Склеить | Ctrl+Click + Ctrl+Click → floating pill |
| Развернуть | Double-click merged |
| Настроить junction | Click junction |
| Переключить view | Ctrl+1/2/3/4/5 |

---

## Что НЕ делать

- `useState` в App.jsx — только store slices
- Ручной `useMemo`/`useCallback` — React Compiler
- `primers: []` при изменениях canvas — праймеры персистентны
- Перезапись Part при мутации — создавать child variant
- Побочные файлы задач (`_1b`, `_append`) — только CURRENT_TASK.md
- Код без тестов
- `domains[]` как отдельное поле — всё в `annotations[]` с `level: 'detail'`
- Баги вне BUGS.md
- Merge через ligation junction — биологически невозможно
- Каталог SnapGene в parts[] — пользователь явно добавляет в библиотеку

---

## Документация проекта

### Оперативные (корень репо) — читаются каждую сессию

| Файл | Назначение |
|------|-----------|
| `AGENTS.md` | Правила, архитектура, координация и постоянный performance-манифест |
| `BUGS.md` | Единственный трекер багов |
| `CURRENT_TASK.md` | Текущая задача |
| `PROJECT_STATE.md` | Snapshot only (версия / тесты / «Что работает» / «Что дальше») без журнала |
| `DECISIONS.md` | Sprint-level решения последних 2 спринтов |

### Оперативные (корень репо) — читаются по необходимости

| Файл | Назначение |
|------|-----------|
| `CHAT_PLAYBOOK.md` | Операционные правила Chat — единый файл, Chat читает первым каждую сессию (до AGENTS.md). 24.05.2026 CORE/APPENDIX слиты сюда обратно |
| `RELEASES.md` | Журнал по версиям (блок 1.5–3 KB на версию) — при финализации спринта и по запросу |
| `ANCHORS.md` | Фундаментальные решения (⚓, 48 записей) — в milestone-сессиях (M-A..M-I) и при вводе новых ⚓ |
| `TECH_DEBT.md` | Реестр технодолга — при финализации спринта и планировании спеки |

### Справочные (docs/) — читать по необходимости

После консолидации docs/ (27.05.2026) — рабочее ядро: 8 файлов в корне `docs/` + `process/` + `guides/` + `archive/`.

| Файл | Назначение |
|------|-----------|
| `VISION.md` | Продуктовое направление BodgeGene |
| `ARCHITECTURE.md` | Архитектура v0.6+ — единый агрегатор: принципы, data model, окна, persistence, distribution, roadmap. Слияние ARCHITECTURE_v2 + ARCHITECTURE_CANVAS_MODEL + SPEC_M-CANVAS-FOUR-TIER (консолидация S2). Читается перед M-A..M-I сессией |
| `BACKLOG.md` | Единый тактический бэклог — незавершённые планы кластерами. Заменяет россыпь SPEC_* / SPRINT_* / DESIGN_* |
| `COMPONENT_MAP.md` | Компас по codebase (CHAT_PLAYBOOK §17 R1) — читается каждую сессию, задевающую существующие компоненты |
| `DESIGN_SYSTEM.md` | Design tokens (цвета, типографика, spacing, компонентарий) — single source of truth для визуала v0.6+ |
| `UX_REFERENCE_BASE.md` | UX-референс по 5 ПО (SnapGene, Benchling, Geneious, ApE, pLannotate) — при планировании UX-спеки |
| `SPEC_BODGE_FORMAT_V2_CORE.md` | Живая спека M-FORMAT-V2 — формат `.bodge` v2 |
| `SPEC_BODGE_NOTEBOOK_MARKDOWN.md` | Живая спека M-FORMAT-V2 — notebook markdown |

### Процессная инфра (docs/process/) — ситуативный lookup

`ACCEPTANCE_ALGORITHM.md` (протокол визуальной приёмки), `BUG_BASH_PROTOCOL.md`, `CODE_HANDOFF_PROTOCOL.md` (регламент Chat-Code), `SPEC_CHECKLIST.md` (pre-handoff чеклист), `_TEMPLATE_SPEC.md` (скелет спеки).

### Пользовательские гайды (docs/guides/) — НЕ читаются при старте сессии

| Файл | Назначение |
|------|-----------|
| `guides/USER_GUIDE_ANNOTATIONS.md` | Руководство по аннотациям |
| `guides/USER_GUIDE_PARTS.md` | Руководство по запчастям |
| `guides/USER_GUIDE_RESTRICTION.md` | Руководство по RE-клонированию |

### Визуальные ассеты и прототипы (docs/) — НЕ читаются при старте сессии

| Папка | Назначение |
|------|-----------|
| `docs/branding/` | Логотипы BodgeGene — `logo.svg`, `logo-mark.svg`, README |
| `docs/prototype/` | HTML-прототипы UI (importer M-B.1, start screen, glyph redesign) — визуальные референсы для спек, mockup audit (CHAT_PLAYBOOK §2) |
| `docs/design_assets/` | Некурируемая свалка: реальные mockup'ы (`bodgegene_workspace.html`, `start_screen.html`, `Library.html`, `feature_palette.html`) вперемешку с инсталляторами, договорами, личными файлами. Как источник истины не использовать без проверки |
| `docs/ux-baseline/` | Пусто — кандидат на удаление |

### Архив (docs/archive/) — НЕ ЧИТАТЬ без запроса

Устаревшие спеки, реализованные задачи: BLOCK_COMBINATIONS, TWO_CLICK_OPS, RESTRICTION_CLONING, UX_QUICKSTART, UX_POLISH.

---

## Команды

```bash
cd gui/designer && npm run dev     # dev server (фронт + бэк)
cd gui/designer && npm test        # все тесты (vitest run)
cd gui/designer && npm run test:watch       # watch mode
cd gui/designer && npm run test:related      # только changed-since-HEAD
cd gui/designer && npx vite build  # билд
```

**НЕ использовать `npx vitest`** — `npx` резолвит vitest из global npm cache (возможна устаревшая версия без happy-dom config) вместо local `node_modules/.bin/vitest`. Симптом: фейковые ошибки `document is not defined` в component тестах. Команды выше через npm scripts корректно резолвят local. Если нужен один файл: `npm test -- path/to/file.test.jsx` либо `./node_modules/.bin/vitest run path/...`.

## graphify

This project has a graphify knowledge graph at .graphify/.

Rules:
- For codebase or architecture questions, when `.graphify/graph.json` exists, first run `graphify query "<question>"` (or `graphify path "<A>" "<B>"` / `graphify explain "<concept>"`); these return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run `graphify migrate-state --dry-run` first; if tracked legacy artifacts are reported, ask before using the recommended `git mv -f graphify-out .graphify` and commit message
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run /graphify . --update when appropriate
- Before proposing or committing .graphify artifacts, run `graphify portable-check .graphify`; commit-safe graph artifacts must use repo-relative paths, and never commit .graphify/branch.json, .graphify/worktree.json, .graphify/needs_update, or .graphify/cache/. If a repo already tracks any of them, first add them to .gitignore, then propose `git rm --cached .graphify/branch.json .graphify/worktree.json .graphify/needs_update` and `git rm -r --cached .graphify/cache`; never mutate git state without asking
- Before deep graph traversal, prefer `graphify summary --graph .graphify/graph.json` for compact first-hop orientation
- For review impact on changed files, use `graphify review-delta --graph .graphify/graph.json` instead of generic traversal
- Read `.graphify/GRAPH_REPORT.md` only for broad architecture review or when `query` / `path` / `explain` do not surface enough context
- After modifying code files in this session, run `npx graphify hook-rebuild` to keep the graph current

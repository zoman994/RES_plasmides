# CLAUDE.md — BodgeGene (PlasmidVCS)

## Восстановление контекста

```
Прочитай CLAUDE.md → BUGS.md → CURRENT_TASK.md → PROJECT_STATE.md → DECISIONS.md
```

Пяти файлов хватит (~30 KB). RELEASES.md / ANCHORS.md / docs/ — только по явной инструкции в CURRENT_TASK.md или по триггерам из CHAT_PLAYBOOK_CORE.md §1.

---

## Проект

BodgeGene — визуальный конструктор генетических сборок (плазмид). React SPA + Python CLI бэкенд.

**Автор:** Игорь Синельников, ФИЦ Биотехнологии РАН  
**Путь:** `C:\Users\sinig\Desktop\RESplasmide`  
**Версия:** v0.7.1 (Sprint M-B.3 Sequence Viewer + V50 parser coord fix + Snapgene Refresh, 03–04.05.2026). Архитектура v0.6+ — в `docs/ARCHITECTURE_v2.md` v1.2 (~117 KB). Фундаментальные решения — в `ANCHORS.md` (52 ⚓, последний DEC-PARSER-COORD-01 от 03.05.2026). Sprint-level — в `DECISIONS.md`. Журнал по версиям — в `RELEASES.md`. Тесты: ~947 Vitest + 112 pytest (последний authoritative счёт от V50 fix 03.05; B.3 cycle 04.05 не оставил test count в координационных файлах — итог уточнится при ближайшей финализации). Предыдущая v0.5.4-alpha (~290 коммитов, 1126 тестов) — feature-complete, **wipe data при переходе на v0.6** (⚓ DEC-V2-08 «quality > speed»).

**Стартовая ссылка:** вся архитектура v0.6+ — в `docs/ARCHITECTURE_v2.md`. Читается перед любой M-A...M-I сессией, не в стартовом пакете (CURRENT_TASK.md явно направляет туда).

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

### 6. Координация Claude Chat ↔ Claude Code

| Документ | Кто пишет | Кто обновляет |
|----------|-----------|---------------|
| `CURRENT_TASK.md` | Chat создаёт задачу | Code отмечает ✅ |
| `RELEASES.md` | Chat финализирует версионный блок | Chat при бампе версии |
| `PROJECT_STATE.md` | Chat (snapshot при финализации) | Chat |
| `DECISIONS.md` | Chat добавляет sprint-level | Chat |
| `ANCHORS.md` | Chat добавляет фундаментальные ⚓ | Chat |
| `BUGS.md` | Оба добавляют баги | Code отмечает [x] |
| `docs/*.md` (спеки) | Chat создаёт | Code НЕ редактирует спеки |

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

### 7. Лимиты размера модулей (⚓ DECISIONS.md 22.04.2026)

Пределы на один файл:
- `.jsx` компонент — hard **40 KB**, soft warning 30 KB
- `.js` helper / algorithm — hard **25 KB**, soft warning 20 KB
- Data-файлы (словари, константы, локали — `restriction-db.js`, `i18n.js`, `tags-db.js`, `part-descriptions.js`) — не лимитируются

**Если модуль в скоупе спеки уже ≥ hard:** Chat должен был поставить декомпозицию первым пунктом. Если не поставил — Code останавливается и просит Chat дополнить спеку, не начинает дописывать в раздутый файл.

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
├── components/          — 48 React компонентов
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
| `CLAUDE.md` | Правила, архитектура, координация |
| `BUGS.md` | Единственный трекер багов |
| `CURRENT_TASK.md` | Текущая задача |
| `PROJECT_STATE.md` | Snapshot only (версия / тесты / «Что работает» / «Что дальше») без журнала |
| `DECISIONS.md` | Sprint-level решения последних 2 спринтов |

### Оперативные (корень репо) — читаются по необходимости

| Файл | Назначение |
|------|-----------|
| `CHAT_PLAYBOOK_CORE.md` | Операционные правила Chat (§1-3 + §13-14) — обязательное чтение в начале сессии |
| `CHAT_PLAYBOOK_APPENDIX.md` | Справочные правила (§4-12 + §15-16) — по триггерам (файловая гигиена, антипаттерны, recovery) |
| `RELEASES.md` | Журнал по версиям (блок 1.5–3 KB на версию) — при финализации спринта и по запросу |
| `ANCHORS.md` | Фундаментальные решения (⚓, 48 записей) — в milestone-сессиях (M-A..M-I) и при вводе новых ⚓ |
| `TECH_DEBT.md` | Реестр технодолга — при финализации спринта и планировании спеки |

### Справочные (docs/) — читать по необходимости

| Файл | Статус | Назначение |
|------|--------|-----------|
| `SYSTEM_AUDIT.md` | Активный | Трекинг проблем (5 CRIT fixed, HIGH/MED в работе) |
| `PARTS_LIFECYCLE.md` | Реализовано | Статусы draft/verified/archived |
| `FLOW_V2_DESIGN.md` | План | Universal ReactionNode (не реализован) |
| `TASK_FLOW_PHASE2_3.md` | Частично | Flow Phase 2+3 |
| `_TEMPLATE_SPEC.md` | Шаблон | Пустой скелет спеки (синхронизирован с CHAT_PLAYBOOK_CORE.md §2) |
| `UX_REFERENCE_BASE.md` | Активный | UX-референс по 5 ПО (SnapGene, Benchling, Geneious, ApE, pLannotate) — читать при планировании UX-спеки |
| `UX_VISION.md` | Активный | UX-видение BodgeGene — 7 ставок + 5 отказов + 10 принципов + per-workflow процесс. Якорь для всех UX-сессий после 26.04.2026 |
| `ARCHITECTURE_v2.md` | Активный (v0.6+ central) | ~117 KB агрегатор архитектуры: principles + data model + окна + persistence + distribution + roadmap. Читается перед любой M-A…M-I сессией |
| `DESIGN_SYSTEM.md` | Активный | Design tokens (цвета, типографика, spacing, компонентарий, язык, motion). Single source of truth для визуала v0.6+. v1.0 от 29.04.2026, ~47 KB — принципы, tokens, компоненты, открытые вопросы. Эволюционирует через дизайн-сессии M-A → M-I, новые DEC-DS-NN |
| `CODE_HANDOFF_PROTOCOL.md` | Активный | Регламент Chat → Code (что в спеке, как Code выдаёт отчёт) |
| `SPEC_CHECKLIST.md` | Активный | Pre-handoff чеклист (Chat перед «спека готова» проходит этот лист) |

### Пользовательские гайды (docs/guides/) — НЕ читаются при старте сессии

| Файл | Назначение |
|------|-----------|
| `guides/USER_GUIDE_ANNOTATIONS.md` | Руководство по аннотациям |
| `guides/USER_GUIDE_PARTS.md` | Руководство по запчастям |
| `guides/USER_GUIDE_RESTRICTION.md` | Руководство по RE-клонированию |

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

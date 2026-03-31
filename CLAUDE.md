# CLAUDE.md — BodgeGene (PlasmidVCS)

## Восстановление контекста

```
Прочитай CLAUDE.md → BUGS.md → CURRENT_TASK.md
```

Трёх файлов хватит. Дополнительно при необходимости: DECISIONS.md, docs/TWO_CLICK_OPS.md, docs/BLOCK_COMBINATIONS.md.

---

## Проект

BodgeGene — визуальный конструктор генетических сборок (плазмид). React SPA + Python CLI бэкенд.

**Автор:** Игорь Синельников, ФИЦ Биотехнологии РАН  
**Путь:** `C:\Users\Zoman\Desktop\RESplasmide`  
**Версия:** v0.3.0-alpha  

---

## ПРАВИЛА (обязательные)

### 1. Тесты ПЕРВЫМИ, код вторым

```
Написать тесты (red) → Написать код (green) → npx vitest run
```

Никогда не писать код без теста. Это главное правило проекта.

### 2. Один файл задания

Все задачи — в одном CURRENT_TASK.md. Никаких `_1b`, `_append`, побочных файлов. Если нужно дополнить — дополняй основной файл.

### 3. Проверка после каждого изменения

```bash
cd gui/designer && npx vitest run && npx vite build
```

### 4. Баги — в BUGS.md

Обнаружил баг → записал в BUGS.md. Починил → отметил `[x]`. Claude Code читает BUGS.md при старте каждой сессии.

### 5. Обновляй документацию

После сессии обновить: PROJECT_STATE.md (журнал), BUGS.md (статусы), DECISIONS.md (если было архитектурное решение).

---

## Архитектура

### Frontend (gui/designer/)

```
src/
├── App.jsx              — root layout, wiring
├── store/               — Zustand 6 slices (project, fragment, junction, primer, ui, flow)
├── hooks/               — useGeneratePrimers, useFragmentHandlers
├── components/          — 37+ React компонентов
│   ├── DesignCanvas     — 4 view modes (blocks/sequence/map/racetrack)
│   ├── PartBlock        — фрагмент на canvas (regular/merged/compact)
│   ├── JunctionBlock    — junction настройки (overlap/GG/RE/KLD)
│   ├── JunctionDNA      — визуал стыка (праймеры + overlap zone)
│   └── flow/            — Project Flow (@xyflow/react, 5 node types)
├── local-primer-design.js — клиентский primer design (без API)
├── tm-calculator.js     — SantaLucia 1998 NN Tm
├── golden-gate.js       — GG enzyme DB + validation
├── restriction-db.js    — 55 RE, IUPAC, siteToRegex
├── validate.js          — validateJunctionEnds + end scanning
└── __tests__/           — Vitest (~400 tests)
```

### Backend (src/pvcs/)

Python CLI + FastAPI. 22 модуля, 112 pytest тестов. Бэкенд НЕ нужен для основной работы — primer design, Tm, validation всё на клиенте.

### Tech stack

React 19, Vite 8, Tailwind 4, Zustand 5 + Immer, React Compiler, @xyflow/react, Vitest, react-dnd.

---

## Ключевые концепции

| Термин | Значение |
|--------|----------|
| **Part** | Элемент в библиотеке (CDS, promoter, terminator) |
| **Fragment** | Part на canvas сборки |
| **Junction** | Соединение между фрагментами (overlap/GG/RE/KLD) |
| **Merged block** | Склеенные фрагменты с пунктирным контуром и "швами" |
| **Assembly** | Конструкт = фрагменты + junctions + праймеры |

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
| Любая | re_ligation | RE лигирование | RE-лигирование |

### Adaptive overlap для "без ПЦР" соседей

Если сосед фрагмента — "без ПЦР", split mode автоматически переключается на full overlap (30bp вместо 15bp). Если оба соседа "без ПЦР" → warning "overlap невозможен".

---

## Принцип двух кликов

Любая операция ≤ 2 кликов. Expert mode = always ON (нет гейта). Подробная спека: `docs/TWO_CLICK_OPS.md`.

| Действие | Как |
|----------|-----|
| Добавить фрагмент | Drag из палитры |
| Удалить | Click → Del |
| Редактировать | Double-click |
| Перевернуть | Click → R |
| Склеить | Click + Click → floating pill |
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

---

## Команды

```bash
cd gui/designer && npm run dev     # dev server
cd gui/designer && npx vitest run  # тесты
cd gui/designer && npx vite build  # билд
```

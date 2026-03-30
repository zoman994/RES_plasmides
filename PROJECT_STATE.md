# PROJECT_STATE.md — Текущее состояние BodgeGene / PlasmidVCS

> **Последнее обновление:** 30 марта 2026
> **Версия:** v0.2.4-alpha
> **Коммитов:** 166
> **Тестов:** 450 (338 Vitest + 112 pytest)

---

## Статус модулей

### Frontend (gui/designer/src/)

| Модуль | Статус | Готовность | Заметки |
|--------|--------|------------|---------|
| Zustand store (5 slices) | ✅ | 95% | persist, undo/redo, devtools, removePart |
| React Compiler v1.0 | ✅ | 100% | babel-plugin-react-compiler |
| Canvas (3 вида) | ✅ | 90% | Blocks/Sequence/Map (Ctrl+1/2/3) |
| PartBlock + JunctionBlock | ✅ | 90% | 4 типа junction, мутации, compact mode, ПКМ |
| SequencePreview | ✅ | 90% | Label row + color strip, introns, ПКМ |
| PlasmidMap + PlasmidViewer | ✅ | 90% | SVG карта, скролл, cDNA кнопка |
| PlasmidUseWizard | ✅ | 85% | 9 режимов |
| PartsPalette | ✅ | 92% | 8 категорий, плазмиды, импорт, ПКМ |
| AddFragmentModal | ✅ | 90% | Smart type, enrichWithCommonFeatures |
| ContextMenu + CopySeqButton | ✅ | 95% | createPortal, clipboard |
| File import | ✅ | 92% | .gb/.fasta/.dna, common features fallback |
| Auto-annotate | ✅ | 90% | CDS/promoter/terminator + 16 RE + common features |
| (остальные модули) | ✅ | 85-95% | |

### Backend (src/pvcs/)

| Модуль | Статус | Готовность | Заметки |
|--------|--------|------------|---------|
| Parser | ✅ | 90% | snapgene_reader fallback, logging |
| FastAPI | ✅ | 75% | /api/import с logging |
| (остальные модули) | ✅ | 80-90% | |

---

## Известные баги

| ID | Описание | Статус |
|----|----------|--------|
| B1-B6 | GenBank, RE, интроны, cDNA | ✅ Закрыты |
| B7 | "Пометить как интрон" | Отложен (ПКМ готов, нужен selection range) |
| B8-B13 | Различные | ✅ Закрыты (сессии 7-13) |

**Итого:** 12/13 закрыты, 1 отложен (B7).

---

## Журнал сессий

| Сессия | Дата | Что сделано |
|--------|------|-------------|
| 13 | 30.03 | Critical fixes (0a-0d) + Блок 9 (ContextMenu, CopySeq, ПКМ). B12+B13 закрыты. |
| 12 | 29.03 | B9+B11 fixes |
| 11 | 29.03 | B10 fix, SequencePreview redesign |
| 10 | 29.03 | Визуальное тестирование → B9-B13 |
| 9 | 29.03 | Блок 8 (палитка, категории, импорт, DnD) |
| 6-8 | 28-29.03 | v0.2.0, performance, B1-B8 |
| 1-5 | 25-27.03 | v0.1.0, canvas, assembly, mutagenesis |

---

## Метрики

| Метрика | Значение |
|---------|----------|
| Python backend | ~6,800 строк / 22 модуля |
| Frontend JS/JSX | ~15,800 строк / 39 компонентов |
| Тесты | 450 (338 Vitest + 112 pytest) |
| Git коммитов | 166 |

---

## Что дальше

### Блок 10: Racetrack Canvas (docs/RACETRACK_DESIGN.md)

| # | Задача | Приоритет |
|---|--------|-----------|
| 1 | `computeRacetrackLayout()` — layout алгоритм (овал, углы, ширины) | HIGH |
| 2 | `RacetrackView.jsx` — SVG junctions + HTML PartBlock overlay | HIGH |
| 3 | Интеграция в DesignCanvas: viewMode='racetrack', Ctrl+4 | HIGH |
| 4 | DnD на racetrack (drop из палитки + reorder по овалу) | MEDIUM |
| 5 | Junction popup на кривой Безье | MEDIUM |

### Блок 11: Junction Improvements

| # | Задача | Приоритет |
|---|--------|-----------|
| 1 | Junction calcMode: "По длине" vs "По Tm" | HIGH |
| 2 | Auto-adjust junction для фрагментов без ПЦР | HIGH |
| 3 | Primer phosphorylation для KLD/blunt-end | MEDIUM |

### Дальше
- **Блок 12:** Genome-to-Parts pipeline
- **Блок 13:** CRISPR wizard + React SPA

---

## Future Tasks (единый backlog)

### 🔬 Биология / Аннотация
- [ ] NCBI BLAST интеграция (⚡ локальная vs 🌐 API)
- [ ] Расширение common-features.json (96 → 500+)
- [ ] Codon optimization (DNA Chisel, 5 организмов)
- [ ] ORF info для CDS (масса, рамка, превью белка)
- [ ] Стем-луп детекция в терминаторах

### 🧬 Модули / Wizards
- [ ] Subcloning wizard (две плазмиды)
- [ ] Region reordering (drag внутри плазмиды)
- [ ] CRISPR нокаут/интеграция wizard
- [ ] Олиго-менеджер (реестр, статусы, заказ)
- [ ] Genome import + EC→pathway
- [ ] Авто-генерация экспрессионных кассет

### 🎨 UX / Визуализация
- [ ] **🏟 Racetrack canvas** — блоки на овале для circular. Ctrl+4. Спека: `docs/RACETRACK_DESIGN.md`. **ВЫСОКИЙ ПРИОРИТЕТ.**
- [ ] **🔬 Multi-plasmid canvas** — несколько плазмид одновременно. Drag между ними = subcloning. Зависит от Racetrack.
- [ ] Hover tooltip с мини-превью Part
- [ ] Auto-scroll палитки к новому Part
- [ ] Ctrl+C для копирования выделенной последовательности
- [ ] Overlap mode визуальные кнопки (◀/◀▶/▶)
- [ ] State нормализация (byId вместо array)
- [ ] Diff engine: улучшенное описание замен

### 📋 Протоколы / Лаб
- [ ] Gantt-таймлайн (SVAR React Gantt)
- [ ] Print-friendly протокол (react-to-print)
- [ ] Inventory pipeline (конц-ция, дата, объём)
- [ ] Tecan EVO150 интеграция (PyLabRobot)

### 🏗 Инфраструктура
- [ ] Docker Compose
- [ ] GitHub Pages деплой
- [ ] CI: GitHub Actions
- [ ] React SPA (multi-page, React Router)
- [ ] TanStack Table/Virtual

### 📄 Публикация
- [ ] Статья Bioinformatics/JOSS
- [ ] bioRxiv препринт
- [ ] README.md (скриншоты, quick start)
- [ ] Use case: PglaA→XynTL→TtrpC в A. niger
- [ ] AI disclosure statement

---

## Тестовые последовательности

### CDS с premature stop (тест 13):
```
ATGCGTCTACTGTCACTGCTGTAACGATCGTACGATCGCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGACTGA
```

### Нормальный CDS (303 нт, тест 17):
```
ATGGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCGCCTAA
```

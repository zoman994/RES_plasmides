# CURRENT_TASK.md — BodgeGene

**Дата:** 1 апреля 2026
**Статус:** ✅ Блок 1 + Блок 2 выполнены (сессия 27).

---

## Выполнено: Блок 1 — Unified Annotations + Bugfixes

| # | Задача | Файлы |
|---|--------|-------|
| 1 | BUG-58: KLD primers merge | useFragmentHandlers.js |
| 2 | BUG-47: IUPAC regex | JunctionBlock.jsx |
| 3 | BUG-54: flip mirrors annotations | fragmentSlice.js |
| 4 | Удаление `domains` (12+ мест) | fragmentSlice, useFragmentHandlers, PartBlock |
| 5 | SequenceViewer → annotations | SequenceViewer.jsx |
| 6 | autoAnnotate always при addPart | fragmentSlice.js |

## Выполнено: Блок 2 — Toolbar Redesign + Context Menu

| # | Задача | Файлы |
|---|--------|-------|
| 1 | ContextMenu: shortcut, description, danger | ContextMenu.jsx |
| 2 | Type-dependent context menu | PartBlock.jsx |
| 3 | Убран global method toggle + Mutagenesis из header | App.jsx |
| 4 | mutagenesisTarget + template prop | uiSlice, App.jsx |
| 5 | ReplacePicker + replaceFragment | ReplacePicker.jsx, fragmentSlice.js |
| 6 | TagFusionPicker (11 preset тегов) | TagFusionPicker.jsx |
| 7 | Junction default = overlap | fragmentSlice.js |
| 8 | Убраны expertMode обёртки | App.jsx |

## Выполнено: Все баги из BUGS.md

23 бага закрыты за сессию 27 (BUG-47..71 + click=select).
Осталось: BUG-66 (дизайн-задача: этапы в flow DAG).

**Тесты:** 428 passed, build ok.

---

## Следующие приоритеты

1. BUG-66: Концепция шага/этапа в flow DAG (дизайн)
2. MutagenesisWizard: template prop (Step 1 skip) — UI доработка
3. Остальные expertMode обёртки за пределами header
4. Тесты для новых компонентов (ReplacePicker, TagFusionPicker)

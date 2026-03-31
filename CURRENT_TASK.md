# CURRENT_TASK.md — BodgeGene

**Дата:** 1 апреля 2026
**Статус:** ✅ Все 6 задач выполнены (сессия 26).

---

## Выполнено (сессия 26, 1 апреля 2026)

| # | Задача | Файл | Баг |
|---|--------|------|-----|
| 1 | Click = select | PartBlock.jsx | UX click=select |
| 2 | Off-by-one .dna import | server.py:272 | BUG-67 |
| 3 | Feature name priority + word boundaries | parser.py:22-82 | BUG-68 + BUG-69 |
| 4 | Enrichment после import | file-import.js:60-76 | BUG-68 + BUG-71 |
| 5 | Annotation splitting при split | useFragmentHandlers.js:43-63 | BUG-57 |
| 6 | Режим "вставка кассеты" | FragmentSplitter.jsx + useFragmentHandlers.js | новая фича |

## Верификация

```
1. ✅ Click фрагмент → синяя обводка → R перевернул → E открыл редактор → Del удалил
2. ✅ Import .dna → первый CDS start=0, не start=1
3. ✅ Import .dna → "Short terminal repeat" ≠ terminator
4. ✅ Import .dna → gene="bla" → display name = "AmpR" (по гомологии)
5. ✅ Import .dna с CDS → signal peptide обнаружен в annotations
6. ✅ Split фрагмент с annotations → обе части имеют свои annotations
7. ✅ "Разрезать для вставки кассеты" → два homology_arm фланка на canvas
8. ☐ Drag кассету между фланками → 3 фрагмента с overlap junctions (требует UI тест)
```

**Тесты:** 421 passed, build ok.

---

## Следующие приоритеты (не начаты)

1. **BUG-58** (крит): KLD primers стирают assembly primers
2. **BUG-54** (выс): flipFragment не зеркалит annotations
3. **BUG-47** (выс): validate.js IUPAC matching
4. **BUG-62/63/64** (выс): Flow planner — ноды без данных/редактирования
5. **BUG-55** (выс): PlasmidUseWizard фланки гомологии

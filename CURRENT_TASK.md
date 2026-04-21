# CURRENT_TASK.md

**Статус:** Нет активной задачи.

Sprint 1.7 (Unified Editor + Virtual Full Sequence + Topology) закрыт 22.04.2026.
Визуальная приёмка пройдена по 4 блокам на HygroR (PASS). Спека: `docs/archive/SPRINT_1_7_UNIFIED_EDITOR.md`.

**Состояние проекта:** v0.5.1-alpha, ~241 коммит, 850 тестов (738 Vitest + 112 pytest).

**BUGS.md OPEN (на момент закрытия 1.7):** 2 критичных (P1, V1) · 2 высоких (P4, V7) · 8 средних (P6, V2, V6, V8, V18, V19, V20, V21) · 3 низких (B7, V9, V10). 1 feature request (F1).

**Новые находки Sprint 1.7** (добавлены в OPEN): V18 (full-view DNA/protein disjoint), V19 (кнопка «Редакт. кодоны» — UX-редизайн), V20 (split микро-PCR 30–60 bp), V21 (single-circular arc-indicator невидим).

---

## Следующие кандидаты

Решение — после выбора Игоря в новой сессии. Порядок ориентировочный:

1. **Sprint 2 — V7 InsertionClock** (~8–10 ч). Reusable clock-компонент для выбора позиции вставки/мутации. Биологически зависимая от уже исправленного мутагенеза — теперь разблокирована.
2. **Sprint 3 — Decomposition** (⚓ DECISIONS.md 22.04.2026, сразу после Sprint 2). Декомпозиция красной зоны: `FragmentEditor.jsx` 70 KB → 4–5 файлов (SequenceGrid, ProteinPanel, MutationHighlights, FullViewToggle, core); `App.jsx` 39 KB → вынести ModalStack + useAppEffects; `DesignCanvas.jsx` 38 KB → вынести SplitGroupContainer + JunctionRouting + CanvasControls. Цель: каждый файл ≤ 30 KB. Оценка: 8–12 ч.
3. **Sprint 2+ — V20 Mutagenesis split micro-PCR** (алгоритм). `minFragmentLength` + multi-site primer при близких мутациях.
4. **Sprint 4 «UX Polish» — V1/V2/V6/V8/V9/V10/V18/V19/V21**. Единый спринт по накопленному UX-долгу circular map + annotation bar + FragmentEditor. Делать **после** Sprint 3 Decomposition — работать с атомизированным FragmentEditor значительно проще.
- **Регрессионное расследование P1/P4** (оба «повтор»). Требуют отдельной диагностической сессии. Можно вкрапливать между спринтами.
- **F1** — custom primers в PlasmidViewer.
- **Project Flow Phase 2+3** (блоки 12–13) — `docs/TASK_FLOW_PHASE2_3.md`.
- **Test audit** (низкий приоритет, по запросу). Аудит текущей базы 738 Vitest + 112 pytest на дубли, устаревшие снапшоты, тесты на удалённый код. Выполнять только если в следующих спринтах появятся симптомы: долгие прогоны, каскадные поломки при рефакторинге, непонятные фейлы. В остальных случаях ⚓-ориентир «≤20 новых тестов на спринт» удержит базу без явной чистки.

---

**Handoff для Code в следующей сессии:** не стартовать до выбора задачи в Chat-сессии. Chat пишет новую спеку → `CURRENT_TASK.md` обновляется → тогда Code.

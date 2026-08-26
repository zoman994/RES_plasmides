# Agarose Gel — пакет проектирования будущей фичи

**Статус:** FUTURE / NOT ACTIVE
**Подготовлено:** 26.07.2026
**Текущий активный scope не меняется:** [`CURRENT_TASK.md`](../../../CURRENT_TASK.md) остаётся единственным трекером реализации.
**Назначение:** передать следующей Code-сессии проверенный продуктовый, биологический, UX- и TDD-контракт без повторной архитектурной разведки.

Этот каталог не является параллельным backlog или журналом. Когда текущий спринт завершён и пользователь даёт GO на гель, утверждённые этапы из этого пакета переносятся в `CURRENT_TASK.md`; только после этого начинается RED→GREEN.

## Состав пакета

1. [`SPEC_AGAROSE_GEL.md`](./SPEC_AGAROSE_GEL.md) — нормативный продуктовый и биологический контракт.
2. [`UX_AND_VISUAL_MODEL.md`](./UX_AND_VISUAL_MODEL.md) — компоновка отдельного инструмента, состояния, действия и доступность.
3. [`ALGORITHM.md`](./ALGORITHM.md) — детерминированная модель полос, миграции и яркости с честными научными границами.
4. [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — пофайловый план, TDD-этапы, тестовая матрица и гейты приёмки.
5. [`REFERENCES.md`](./REFERENCES.md) — научные источники и выводы, которые разрешено переносить в продуктовые подсказки.

## Проверенные факты о текущем коде

Срез ниже относится к рабочему дереву 26.07.2026 и MUST быть перепроверен перед реализацией.

- Реального эмулятора агарозного геля в production нет.
- Отдельные инструменты живут в левой панели и открываются как lazy workspaces через:
  - `components/StartScreen/Sidebar.jsx`;
  - `store/workspaceSlice.js`;
  - `components/AppShell/index.jsx`.
- Уже существует чистый topology-aware расчёт всех фрагментов полного рестрикционного дайджеста:
  - `components/CanvasSkeleton/lib/digest-fragments.js`;
  - circular: `N` уникальных разрезов → `N` фрагментов, включая origin-crossing;
  - linear: `N` разрезов → `N + 1` фрагментов;
  - одинаковые физические позиции разреза дедуплицируются.
- `DigestFragmentPicker.jsx` называется «гель», но фактически это карта молекулы и список фрагментов для выбора. Он не моделирует электрофоретическую миграцию, яркость, дорожки или маркер.
- Для выбора молекул существует канонический `components/CanvasSkeleton/canvas/LibrarySearchBar.jsx`; Align уже переиспользует его вне CanvasSkeleton.
- Классические рестриктазы находятся в `RE_ENZYMES`; пользовательские Type II добавляются через `selectMergedREEnzymes`. `GG_ENZYMES` в гель не подмешиваются.

## Размерный baseline

| Файл | Размер 26.07.2026 | Решение |
|---|---:|---|
| `components/StartScreen/Sidebar.jsx` | 22 890 B | небольшая route-проводка допустима |
| `components/AppShell/index.jsx` | 4 307 B | lazy workspace route |
| `store/workspaceSlice.js` | 3 184 B | добавить одно имя workspace |
| `components/icons/Icon.jsx` | 12 896 B | добавить один domain icon и registry-test |
| `components/CanvasSkeleton/lib/digest-fragments.js` | 3 788 B | сначала characterisation, затем перенос pure core |
| `DigestFragmentPicker.jsx` | 7 132 B | в MVP не менять |
| `i18n.js` | 44 726 B | data-файл, size budget не применяется |

Новые `.js` SHOULD быть ниже 20 KiB и MUST быть ниже 25 KiB. Новые `.jsx` SHOULD быть ниже 30 KiB и MUST быть ниже 40 KiB.

## Принятые решения

- Гель — самостоятельный инструмент в левой панели, а не вкладка SequenceView и не модал.
- MVP моделирует линейную dsDNA и продукты **полного** рестрикционного дайджеста.
- Неразрезанная кольцевая плазмида не превращается в фальшивую «линейную полосу того же размера».
- Положение полос — относительная планировочная оценка, не обещание сантиметров или минут реального запуска.
- Пользователь видит источник, размер, массу и состав полосы; внутренние sequence/edit-script данные не выводятся.
- Сессия геля хранит ссылки на библиотечные записи и настройки дорожек, но не копирует последовательности в параллельную модель.
- Существующий `DigestFragmentPicker` остаётся отдельным assembly-flow; его унификация с новым workspace — только отдельный follow-up после принятия MVP.

## Активация будущего спринта

Перед первой правкой production-кода:

1. завершить и принять текущий `CURRENT_TASK`;
2. перечитать `AGENTS.md`, новый `CURRENT_TASK.md` и `PROJECT_STATE.md`;
3. перечитать skills `tdd-enforce`, `design-system`, `ui-interactions`, `size-budget`, `scope-stop`, `bio-invariants`;
4. повторно снять git status, размеры, related/full baseline и build;
5. проверить актуальные consumers `digest-fragments.js`, route registry, store shape и `LibrarySearchBar`;
6. перенести утверждённые этапы из [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) в новый `CURRENT_TASK.md`;
7. начать с RED-контрактов, не с UI.

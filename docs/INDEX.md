# docs/INDEX.md — Индекс документации BodgeGene

## Основные файлы (корень репозитория)

| Файл | Назначение | Когда читать |
|------|-----------|-------------|
| **CLAUDE.md** | Архитектура, правила, структура | **ПЕРВЫМ** при старте сессии |
| **BUGS.md** | Трекер багов (open/fixed) | **ВТОРЫМ** при старте сессии |
| **CURRENT_TASK.md** | Текущие задачи | **ТРЕТЬИМ** — что делать |
| **PROJECT_STATE.md** | Статус, журнал сессий | При необходимости |
| **DECISIONS.md** | Архитектурные решения (append-only) | Не пересматривать |
| **CHANGELOG.md** | История версий | При ревью |

## Спецификации (docs/)

| Файл | Назначение | Статус |
|------|-----------|--------|
| **TWO_CLICK_OPS.md** | 10 атомарных операций Two-Click UX | ★ Активный |
| **TWO_CLICK_CONCEPT.md** | Концепция двух кликов — аудит всех операций | ★ Активный |
| **BLOCK_COMBINATIONS.md** | 16 комбинаций блоков R/N/M/P + баги | ★ Активный |
| **ARCHITECTURE_APPROVED_v2.md** | Утверждённая архитектура v2 | Справка |
| **ASSEMBLY_ENGINE_v2.md** | Assembly + primer design спека | Справка |
| **PART_MODEL.md** | Part versioning + наследование | Справка |
| **REFACTORING_ANNOTATIONS.md** | Region-based аннотации | Справка |
| **RACETRACK_DESIGN.md** | Racetrack canvas спека | Справка |
| **PROJECT_FLOW_DESIGN.md** | Project Flow canvas спека | Справка |
| **ROADMAP_v2.md** | Roadmap (15 модулей) | Backlog |

## Stale файлы (не читать)

| Файл | Почему stale |
|------|-------------|
| CURRENT_TASK_1b.md | Заменён единым CURRENT_TASK.md |
| DOCUMENTATION_PROTOCOL.md | Интегрирован в CLAUDE.md |
| ENZYME_NOTE.md | Интегрирован в restriction-db.js |
| PALETTE_SPEC.md | Интегрирован в PartsPalette |
| TEST_RESULTS.md | Устарел, тесты в vitest |
| docs/architecture.md | Заменён ARCHITECTURE_APPROVED_v2.md |
| docs/ARCHITECTURE_v2.md | Заменён ARCHITECTURE_APPROVED_v2.md |
| docs/AUDIT_RU.md | Выполнен, результаты в BUGS.md |
| docs/DOCUMENTATION_SYSTEM.md | Интегрирован в CLAUDE.md |
| docs/MANUAL_TESTS_v2.md | Заменить на Playwright (TODO) |
| docs/ux-concept-ru.md | Заменён TWO_CLICK_CONCEPT.md |

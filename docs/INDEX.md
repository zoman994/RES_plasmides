# docs/INDEX.md — Мастер-индекс документации BodgeGene / PlasmidVCS

> **Последнее обновление:** 29 марта 2026

---

## Как ориентироваться

### Быстрый старт (для Claude Code после /clear)
```
Прочитай CLAUDE.md, PROJECT_STATE.md и CURRENT_TASK.md из C:\Users\Zoman\Desktop\RESplasmide
```

### Полный контекст (для глубокого погружения)
1. `CLAUDE.md` → архитектура, правила, структура
2. `PROJECT_STATE.md` → где мы, что работает, что сломано
3. `CURRENT_TASK.md` → что делать прямо сейчас
4. `DECISIONS.md` → почему так, а не иначе
5. `docs/ARCHITECTURE_v2.md` → модель данных (если нужно менять store/модели)

---

## Файлы в корне репо

| Файл | Строк | Обновлён | Тип | Назначение |
|------|-------|----------|-----|-----------|
| [CLAUDE.md](../CLAUDE.md) | ~200 | 29.03 | Статичный | **Главная точка входа.** Структура, стек, правила, команды |
| [PROJECT_STATE.md](../PROJECT_STATE.md) | ~250 | 29.03 | Динамический | Статусы модулей, баги, журнал сессий, метрики |
| [CURRENT_TASK.md](../CURRENT_TASK.md) | ~250 | 29.03 | Задание | Конкретные задачи с инструкциями по реализации |
| [DECISIONS.md](../DECISIONS.md) | ~130 | 29.03 | Append-only | Архитектурные решения с обоснованиями |
| [CHANGELOG.md](../CHANGELOG.md) | ~160 | 29.03 | Версионный | История v0.1.0 → v0.2.0 |
| [TEST_RESULTS.md](../TEST_RESULTS.md) | ~350 | 29.03 | Аудит | Code audit: 40 тестов, 8 багов |
| [PALETTE_SPEC.md](../PALETTE_SPEC.md) | ~540 | 29.03 | Спецификация | Палитка, режимы, DnD, категории |
| [README.md](../README.md) | ~180 | 25.03 | Публичный | Описание проекта, установка, примеры |

---

## Файлы в docs/

### Актуальные (v2, дата ≥ 27.03.2026)

| Файл | Строк | Обновлён | Назначение | Когда читать |
|------|-------|----------|-----------|-------------|
| [ARCHITECTURE_v2.md](ARCHITECTURE_v2.md) | ~720 | 28.03 | **★ Модель данных.** Part, Fragment, Junction, Primer, localStorage | При изменении store/моделей |
| [ASSEMBLY_ENGINE_v2.md](ASSEMBLY_ENGINE_v2.md) | ~500 | 29.03 | Движок сборки. AssemblyPlan, primer generation, 5 методов | При работе с assembly/primers |
| [PART_MODEL.md](PART_MODEL.md) | ~580 | 28.03 | Part inheritance. Part → Fragment → PhysicalDNA, derivation | При работе с библиотекой |
| [REFACTORING_ANNOTATIONS.md](REFACTORING_ANNOTATIONS.md) | ~360 | 29.03 | Region-based аннотации. 3 уровня, fusion/split логика | При работе с аннотациями |
| [AUDIT_RU.md](AUDIT_RU.md) | ~320 | 28.03 | 10 findings аудита. Приоритеты, effort, решения | Обзор технического долга |
| [ROADMAP_v2.md](ROADMAP_v2.md) | ~370 | 27.03 | 15 модулей roadmap. Сроки, волны, приоритеты | Планирование |
| [DOCUMENTATION_SYSTEM.md](DOCUMENTATION_SYSTEM.md) | ~60 | 29.03 | Как работает система документации | Мета-документация |
| [plasmide_operator](plasmide_operator) | ~1450 | 29.03 | PlasmidUseWizard (9 операций) + PlasmidViewer | При работе с wizard/viewer |
| [hand_test](hand_test) | ~1450 | 29.03 | Чеклист ручного тестирования (40 тестов, 4 части) | QA |

### Устаревшие (заменены v2-версиями)

| Файл | Заменён на | Заметки |
|------|-----------|---------|
| [architecture.md](architecture.md) | ARCHITECTURE_v2.md | Исходная архитектура (20.03), исторический интерес |
| [ux-concept-ru.md](ux-concept-ru.md) | PALETTE_SPEC.md | Ранние UX концепты (23.03) |

### Пустые / заглушки

| Папка | Статус |
|-------|--------|
| `docs/examples/` | Пусто — планируется для примеров .gb файлов |

---

## Граф зависимостей документов

```
CLAUDE.md (точка входа)
  ├── PROJECT_STATE.md (где мы)
  │     └── CURRENT_TASK.md (что делать)
  ├── DECISIONS.md (почему так)
  │
  └── docs/
        ├── ARCHITECTURE_v2.md (★ модель данных)
        │     ├── PART_MODEL.md (наследование Part)
        │     ├── ASSEMBLY_ENGINE_v2.md (сборка + праймеры)
        │     └── REFACTORING_ANNOTATIONS.md (аннотации)
        │
        ├── AUDIT_RU.md (технический долг)
        │     └── ROADMAP_v2.md (план на будущее)
        │
        └── plasmide_operator (wizard/viewer спека)
              └── hand_test (QA чеклист)
```

---

## Правила обновления

| Событие | Что обновить |
|---------|-------------|
| Завершена рабочая сессия | PROJECT_STATE.md → журнал сессий + статусы модулей |
| Выполнена задача | CURRENT_TASK.md → отметить как done |
| Принято архитектурное решение | DECISIONS.md → новая запись |
| Новая версия (release) | CHANGELOG.md → новая секция |
| Изменена структура файлов | CLAUDE.md → обновить дерево |
| Новый документ в docs/ | docs/INDEX.md → добавить в таблицу |
| Изменена модель данных | docs/ARCHITECTURE_v2.md → обновить |

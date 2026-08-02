# PROJECT_STATE — BodgeGene

Обновлено: 02.08.2026.

## Текущий снимок

- Версия приложения: **0.8.7-alpha** (`gui/designer/package.json`,
  `gui/designer/src/lib/version.js`).
- Рабочая ветка: `checkpoint/integration-2026-07-17`.
- SEARCH-GAPPED-DNA прошёл local production acceptance; checkpoint ещё не создан.
- Frontend: **804/804 файлов**, **8182 теста**
  (**8162 passed, 20 skipped, 0 failed**).
- Backend: **127 passed**.
- Production build: **успешен, 579 modules**.
- Browser acceptance shipping-сборки: **32/32 сценария**,
  0 console errors, 0 HTTP errors, 0 long tasks >50 мс.
- `git diff --check` чист; mutation/temp/backup residues не найдены.
- Новые и изменённые файлы не добавляют lint errors;
  полный проектный lint сохраняет предсуществующий долг.
- Stage/commit ожидают отдельного разрешения пользователя.

## Приложение

BodgeGene — local-first React-приложение для создания, анализа и
версионирования плазмид и генетических сборок.

Основной интерфейс: `gui/designer/`.

- React 19 + Zustand + Dexie + Vite.
- FastAPI используется для операций, которым нужен Python/SnapGene-парсер.
- Python CLI `pvcs` остаётся отдельным поддерживаемым интерфейсом.

Основные рабочие области:

- библиотека молекул, проектов и праймеров;
- глобальный поиск по метаданным, ДНК, белку и сайтам рестрикции;
- Sequence/Map просмотр и редактирование;
- аннотации и common-feature detection;
- сборочный canvas, стыки и проверка сборки;
- canonical primer pool;
- выравнивание и Sanger-данные;
- `.bodge`, GenBank и SnapGene import/export.

## DNA Search

Shipping-контракт:

- corpus-wide route: **EXACT_FIRST**;
- approximate kernel: **LINEAR**;
- exact-запросы не имеют верхнего предела длины;
- bare DNA использует `minQueryLen` (default 8), явный `seq:` обходит порог
  автоопределения, а Ctrl+F отдельно требует минимум 8 нт;
- approximate запускается для принятого DNA query длиной до **100 нт**;
- при threshold <100% запрос `>100` без exact даёт `REQUIRES_ALIGNMENT`;
  threshold 100% остаётся exact-only и может честно вернуть ноль;
- query alphabet: только `A/C/G/T`;
- identity: `M / (M + X + I + D)`;
- обе цепи и кольцевые origin-wrap локусы поддерживаются;
- timeout: **15 с**;
- тяжёлая работа выполняется в worker;
- обычная отмена кооперативна и не уничтожает worker;
- строгая граница ответа: `{occurrences, locationCount, bestIndex}`;
- ошибка или resource limit дают incomplete, а не honest-empty;
- выдача ведёт к каноническому локусу, а Back восстанавливает search session;
- индикатор показывает активность без фиктивного процента.

Локальная приёмка не заявляет поведение на эталонном слабом ПК
и точный peak памяти самого worker текущей сборки. Эти измерения
отложены в `docs/BACKLOG.md`.

## Текущее состояние документов

- `CURRENT_TASK.md` содержит только компактный итог закрытого Search scope.
- Открытые дефекты читаются только из `BUGS.md`.
- Незавершённые улучшения читаются только из `docs/BACKLOG.md`.
- Действующие архитектурные решения читаются из `DECISIONS.md`.
- Реализованные промежуточные планы и отчёты не хранятся в текущих документах.
- Graphify не используется автоматически и не является доказательством.

## Источники истины

1. Исполняемый код и тесты.
2. `AGENTS.md` — постоянные правила разработки.
3. `CURRENT_TASK.md` — единственная текущая задача или последний закрытый scope
   до открытия следующего.
4. Этот файл — краткий актуальный snapshot.
5. `DECISIONS.md` — действующие архитектурные решения.
6. `docs/ARCHITECTURE.md` и нормативные спецификации.

Если документ противоречит коду или тестам, документ считается устаревшим
и исправляется.

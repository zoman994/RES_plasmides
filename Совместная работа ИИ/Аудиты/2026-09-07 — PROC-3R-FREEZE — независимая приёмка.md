# AUD-2026-09-07-003 — PROC-3R-FREEZE: независимая приёмка

> **NON-CANONICAL INPUT**

- Source ID: `AUD-2026-09-07-003`.
- Автор / роль: Codex, ведущий Ревизор; консолидация двух независимых read-only линз.
- Дата / часовой пояс: 07.09.2026 18:45 MSK (`UTC+03:00`, Europe/Moscow).
- Author handoff / часовой пояс: 07.09.2026 18:45 MSK (`UTC+03:00`, Europe/Moscow).
- Supersedes source path: `NONE`.
- Supersedes source SHA-256: `NONE`.
- Branch / base SHA: `checkpoint/integration-2026-07-17` /
  `bd710973112ad8712c81c619eefd7fc6c755858d`.
- Candidate manifest / digest: 11 paths / 1 124 B /
  `e2baa6fd4621ab001725590aebfa1564c2648d531fa456316c88849a2e533d53`;
  unified process surface 20 paths / 1 954 B /
  `592021b4efb0bb6810cb46a9ddbf290cc987526a5188cf733b02946e2eab24b1`.
- Линзы проверки: protocol semantics; forensic manifest/preservation.
- Не изменялось и не запускалось: candidate, product/test WIP, source worktree и live
  IDEA; tests, build, lint, browser, benchmark; stage/commit/push.

После этого handoff файл immutable. Его SHA-256 фиксируется внешним DISP и
`CURRENT_TASK.md`; disposition или backlink сюда не добавляется.

## Человеческий вывод

Физическое замораживание и цепочка отдельных DISP реализованы, а все заявленные хэши
воспроизводятся. До безопасной приёмки нужны две точечные правки: AUD не должен имитировать
формальный вердикт, а REF обязан однозначно разделять metadata-wrapper и внешний payload.

## Находки

### P1 — AUD-source содержит теневой язык формального решения

- Файл/строка: `Совместная работа ИИ/Аудиты/ШАБЛОН.md:20-22`.
- Контракт: формальные `ACCEPT/REJECT/...` принадлежат отдельному DISP, frozen AUD хранит
  доказательства и рекомендацию.
- Факт: шаблон просит написать «что принято, что отклонено» внутри AUD.
- Ожидание: «что подтверждено, что не подтверждено и каков риск»; формальное решение
  существует только в DISP.
- Confidence: high.

### P1 — REF pin не определяет, какой артефакт проверяется

- Файл/строка: `Совместная работа ИИ/README.md:30-43,103-105` и
  `Совместная работа ИИ/Референсы/README.md:7-14,34-35`.
- Контракт: `CURRENT_TASK.md` обязан однозначно content-pin выбранный context-only REF.
- Факт: REF одновременно обязан содержать служебную шапку и объявлен копией внешнего
  материала без содержательного редактирования; не определено, относится SHA к wrapper,
  исходному payload или sidecar.
- Ожидание: REF — immutable metadata-wrapper со своим внешним SHA. Неизменённый payload
  хранится отдельно либо остаётся внешним; wrapper фиксирует payload path/URL и full
  SHA-256. Если локальный payload реально используется, `CURRENT_TASK.md` пинит и
  wrapper, и payload; pointer-only остаётся явно непроверенным контекстом.
- Confidence: high.

## Подтверждено

- HEAD/branch: `bd710973112ad8712c81c619eefd7fc6c755858d` /
  `checkpoint/integration-2026-07-17`.
- Candidate: 11 / 1 124 B / `e2baa6fd…`; unified: 20 / 1 954 B / `592021b4…`.
- Preserved WIP: 59 / 7 552 B / `d2faa68a31345aae283348b07ffcb3ec2e8356d02bc5c02abb953ace3bfe0183`.
- `CURRENT_TASK.md` pin: `7bd12b90ea31f7d185721c714d82bbcf5bd868d2eedd66c0c82aed2109d93e26`.
- Оба legacy-audit SHA совпали; `git diff --check` exit 0; staged = 0.
- Остальной immutable source/DISP, vocabulary, authorization, NNN/predecessor/fork/race
  и canonical-tracker контракт семантически согласованы.

## Непроверено и residual risk

- Tests/build/lint/browser/benchmark не запускались по docs/policy-only контракту.
- Фактического внешнего REF payload ещё нет, поэтому новая модель проверяется статически.
- Нельзя доказать постфактум, какие файлы открывал предыдущий процесс; доказана только
  неизменность content-pinned артефактов.

## Рекомендация

Выдать ровно один correction pass: исправить язык AUD и согласованно определить wrapper /
payload pins во всех REF execution entrypoints. После correction проверять только эти две
находки, unified 20-path digest, preserved exclusions и `git diff --check`.

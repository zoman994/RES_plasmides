# CURRENT_TASK — SYNC-1 принят / S3-C2 smoke isolation принят, BG-022 STOP / 0.8.8

**Статус:** SYNC-1 принят 06.09.2026. S3-C2 принят только как изоляция конкретного
smoke-теста; утверждения «worker исправлен» и «полный gate стабильно зелёный» отклонены.
BG-022 остаётся открытым, эта correction-линия остановлена. Checkpoint ждёт отдельного
явного разрешения на stage и commit.

## S3-C2 correction contract

Этот раздел — единственное разрешённое расширение прежних Manifest/OUT для correction.

- Base/HEAD: `15169db8636ed8c9fdc2dbb759a8719f58e7af23`; accepted dirty main:
  150 tracked modified + 54 untracked, index clean.
- RED: полный Vitest собрал 856 файлов / 9 280 тестов (9 260 passed, 20 skipped),
  затем завершился с code 1: unnamed fork-worker exit и пять `ECONNREFUSED` к
  `localhost:3000`; относительно предыдущего gate потеряны 1 файл / 6 тестов.
- Локализация: три запуска `container-editor-skeleton-v2.test.jsx` дали 25/25 assertions,
  но `--detectAsyncLeaks` обнаружил 7 висящих Promise из fire-and-forget primer hydration.
- Цель: smoke-тест не запускает неотносящиеся primer hydration и реальный HTTP; focused
  leak-check завершается с 0 leaks, а полный gate собирает весь набор и выходит с code 0.
- Writer mode: solo; Integration owner: Codex; writable checkout только main.
- Correction manifest: этот файл и
  `gui/designer/src/components/CanvasSkeleton/__tests__/container-editor-skeleton-v2.test.jsx`.
  Существующий B1-ui hunk теста (pre-edit SHA-256
  `b1060be0306ac83c499f152580bebdb30df56f1cdd98fb2552b6b366ef459621`) сохранить.
- OUT: product code, другие тесты, BUGS/BACKLOG/PROJECT_STATE, вторичные worktree,
  dependency/config changes, staging, commit, bundle и push.
- Gate: focused 1 файл / 25 тестов, 0 async leaks и 0 localhost errors → один read-only
  review → один post-correction Vitest → при PASS pytest → production build.
- Если тот же worker failure переживает correction либо открывается новая корневая
  причина — STOP и новое планирование; второй test-only correction запрещён.
- Результат smoke-isolation: focused 1 файл / 25 тестов PASS без leaks и
  `ECONNREFUSED`; cleanup/unstub, `_primersHydrated` и локальный fetch-stub приняты.
- Полный post-correction Vitest: из трёх прогонов на одном дереве два собрали
  857 файлов / 9 286 тестов и вышли с code 0; один собрал 856 / 9 266, потерял другой
  файл на 20 тестов и завершился `Worker exited unexpectedly`, code 1. Единственный
  JSON-инвентарный repeat чистого прогона совпал с `rg` поимённо: 857 / 857.
- Вердикт: причина worker crash не установлена и S3-C2 её не устранил; BG-022 открыт.
  Поскольку тот же дефект пережил correction, действует STOP без второго test-only pass.
- Остаточный сетевой шум: пять пойманных `ECONNREFUSED` печатает happy-dom для
  относительного `fetch('/common-features.json')`; это отдельная инфраструктурная
  гигиена и по имеющимся данным не причина worker crash.
- Остальной gate: pytest 195 / 195 и production build 624 modules — PASS; browser не
  проверялся. Полный Vitest не считается стабильно зелёным.

## Основание и границы

- HEAD/base: `15169db8636ed8c9fdc2dbb759a8719f58e7af23`.
- Dirty main worktree (141 M / 54 ??) — принятый воспроизводимый вход. Чужие hunks не
  трогать и не очищать; перед правкой уже изменённого файла отделить существующий diff
  от своего.
- Writer mode: один Implementation coder, он же Integration owner; main checkout
  `D:\RESplasmide`, без отдельного worktree. Stage/commit/push запрещены.
- Planner: Claude (сессия аудита 05.09). Приёмка владельца после одного review.
- Источник правок: пакет `D:\RESplasmide\.claude\handoff\2026-09-05-sync1` вне репозитория —
  `02-BUGS-delta.md`, `03-BACKLOG-delta.md`, `04-docs-delta.md`,
  `05-PROJECT_STATE.md`. Готовый текст применять как есть. При расхождении текста с
  кодом не «улучшать» самостоятельно, а записать в handoff как open question.
- Цель: трекеры и нормативные документы описывают код, который есть в дереве сейчас;
  полный Vitest gate становится зелёным (BG-047).

## Manifest

Часть S1 (docs-only):

- `BUGS.md`, `docs/BACKLOG.md`, `PROJECT_STATE.md`;
- `AGENTS.md`, `docs/COMPONENT_MAP.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`;
- `CHANGELOG.md`, `README.md`, `gui/designer/README.md`;
- `.agents/skills/bio-invariants/SKILL.md`, `.agents/skills/annotation-contract/SKILL.md`.

Часть S2 (одна строка кода):

- `gui/designer/src/components/Library/lib/importer-strings.js`.

OUT: `DECISIONS.md`; любой другой продуктовый код и тесты; новые файлы в `docs/` или в
корне; `.graphify/`; вторичные worktree; BUGS/BACKLOG-записи, не названные в `02`/`03`;
`CURRENT_TASK.md` сверх отметки чеклиста ниже.

## Инварианты пакета

- `BUGS.md` содержит только живые дефекты плюс один раздел «Ожидают приёмки владельца
  или checkpoint»; закрытые записи удаляются, история остаётся в Git.
- Каждая новая BG-запись: заголовок, механизм с `file:line`, риск, приёмка. Статус
  evidence — «по коду»; browser-воспроизведение не выдумывать.
- `CURRENT_TASK.md` ≤ 200 строк; в `docs/` ≤ 8 файлов `.md`; никаких `*_TODO`,
  `*_REPORT`, временных spec.
- Каждая ссылка, заявленная как существующий repo-файл, разрешается рекурсивно;
  псевдосинтаксис, archive members, generated/policy и внешние artifacts явно
  классифицируются отдельно.
- Единственное изменение поведения — удаление мёртвого ключа BG-047.
- Строки изменённых файлов сохраняют существующий стиль переносов; `git diff --check`
  не добавляет новых предупреждений кроме LF→CRLF.

## Шаги

- [x] S1.1 `BUGS.md` по `02`: удалить 8 записей; свернуть 10 в раздел ожидания;
      переписать BG-028, BG-030; дополнить BG-007, BG-033, BG-045, BG-062; добавить
      BG-063…BG-087 в указанные секции.
- [x] S1.2 `docs/BACKLOG.md` по `03`.
- [x] S1.3 Нормативные документы и skills по `04`.
- [x] S1.4 `PROJECT_STATE.md` = `05` целиком.
- [x] S1.5 Проверки S1 из раздела Gate; результат в handoff.
- [x] S2.1 Удалить строку `featureEditorSubfeatureDelete: '✕',` в `importer-strings.js`
      (сейчас строка 274). Доказательство отсутствия потребителей:
      `rg -n featureEditorSubfeatureDelete gui/designer/src` → только определение.
- [x] S2.2 Focused test (естественный RED: 05.09 в полном прогоне этот файл FAIL):
      `npm test -- src/components/Library/__tests__/strings-coverage.test.js --maxWorkers=4`
      → 1 файл / 1 тест PASS.
- [x] Handoff: manifest; SHA-256 каждого файла manifest после правок; `wc -l` для
      `CURRENT_TASK.md` и `BUGS.md`; вывод каждой проверки gate; open questions.

## Gate

- `git status --porcelain` показывает изменения только в manifest поверх стартового
  состояния; число `??` остаётся 54 (новых untracked нет).
- `wc -l CURRENT_TASK.md` ≤ 200; `ls docs/*.md | wc -l` ≤ 8.
- Рекурсивная проверка реальных filesystem-ссылок в backticks → 0 unresolved;
  псевдосинтаксис (`.js/.jsx`), члены `.bodge`-архива, globs и явно внешние пути
  handoff/benchmark, а также опциональные generated/policy-каталоги классифицируются
  отдельно и не считаются обязательными repo-файлами.
- Focused test `strings-coverage.test.js` PASS.
- `git diff --check` без новых предупреждений кроме LF→CRLF.
- Related и полный прогон coder не выполняет: Planner запускает полный
  test/build/pytest один раз перед S3 (checkpoint).
- Review: один read-only reviewer, линза «документ против кода»: выборочно 8 новых
  BG-записей (пути, строки, механизм), таблица размеров в BACKLOG, карта AGENTS.md.

## Контракт содержимого

- Новые BG-номера идут подряд с BG-063; нумерацию не переставлять.
- Секции BUGS.md: P0/P1 биология и потеря данных; P1 неверное или вводящее в
  заблуждение состояние; P2 доступность и визуальная читаемость; P2 тестовая
  инфраструктура; в конце — «Ожидают приёмки владельца или checkpoint».
- BACKLOG сохраняет структуру Now / Next / Maintenance / Legacy / Active specifications /
  Ideas; выполненные пункты удаляются, а не помечаются.
- Цифры gate в `05` — из сессии 05.09 (Vitest 857 файлов / 9 286 тестов, 1 FAIL
  BG-047; pytest 195; build PASS; ESLint 360 errors / 5 458 warnings). Не пересчитывать.

## Допущения Planner

- A1: BG-017/026/029/031/040 переносятся в раздел ожидания, не удаляются.
- A2: ручные boundary-праймеры регистрируются как BG-064 с приёмкой «решение владельца».
- A3: BG-007 остаётся открытым с зафиксированным противоречием по химии KLD.
- A4: `DECISIONS.md` не меняется; предложение по источнику истины каталогов лежит в `04`.
- A5: checkpoint, bundle и push выполняет Planner после приёмки SYNC-1.

## После приёмки (S3, не для coder)

Полный gate один раз → `git worktree list` → stage по manifest всего dirty tree с
явным списком исключений → commit `chore(checkpoint): 0.8.8-alpha WIP checkpoint
2026-09-05` с телом (потоки, принятое/непринятое, цифры gate, digest) → docs-commit с
новым base SHA → `git bundle --all` на другой диск + `git push -u origin
checkpoint/integration-2026-07-17` при разрешении владельца.

## Открытые вопросы владельца

- Семантика ручных boundary-праймеров (BG-064): дефект или принятая конвенция.
- Химия KLD (BG-007): 5′-фосфат в заказе или киназный шаг.
- Источник истины по каталогам ферментов: JS; фиксировать в DECISIONS §7.
- Второй экземпляр репозитория: путь для bundle, push в origin да/нет, тег да/нет.

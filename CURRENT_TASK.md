# CURRENT_TASK — INFRA-GATE-2: module-aware RSS и точный Vitest gate

**Статус:** принят 06.09.2026 на recovery base, готов к exact checkpoint. INFRA-GATE-1 остановлен после
информативного полного прогона: все 859 модулей завершились; reporter отдельно показал
два skipped, а RSS — две setup-only записи без moduleId. Их точное соответствие ещё не
доказано. Строгий контракт «две RSS-точки на каждый expected module» отклонён; это не
worker crash и не закрытие BG-022.

## Основание и режим

- Base/HEAD: `6145bf0f1fcc8e44211eaf17445f1b00f84a6d96`; текущий candidate не закоммичен.
- Writer mode: solo; Integration owner: Codex; writable checkout только
  `D:\RESplasmide`.
- Владелец 06.09.2026 разрешил пакет, exact stage/commit, bundle и обычный push. Tag не
  создаётся: имя не задано, а BG-022 открыт.
- Принятые входы нового пакета: точечный common-features stub, три независимых inventory
  и сохранение raw stdout/stderr. Перепроверяется только опровергнутый RSS-контракт.

## Наблюдаемый контракт

1. Test setup перехватывает только точную строку `/common-features.json`, возвращает
   свежую test DB и делегирует любой другой URL/Request исходному happy-dom fetch.
   Локальные success/error mocks тестов имеют приоритет и восстанавливаются cleanup.
2. Gate требует raw exit 0, Vitest reason `passed`, JSON success и точное ненулевое
   expected = ended = run-end = JSON inventory; missing/extra/duplicate дают nonzero.
3. Каждый RSS-сэмпл содержит `moduleId`, один раз полученный из текущего Vitest worker
   context, и `phase`; gate нормализует путь централизованно. Каждый expected module
   обязан дать ровно один `setup`.
4. Модуль со state `skipped` может дать `setup` либо `setup -> afterAll`; любой иной
   модуль обязан дать точную пару. State кроме `passed`/`skipped` независимо оставляет
   общий gate красным. Неизвестный module/state, duplicate, неверный порядок, missing
   или лишний sample — FAIL; skipped setup-only отдельно перечисляются в summary.
5. Сопоставление RSS по одному `moduleId` допустимо только при его уникальности в expected
   inventory; неоднозначность между проектами делает evidence неполным.
6. RSS остаётся точечным `process.memoryUsage().rss`, не process-tree total и не peak.
   Каждый run сохраняет отдельные byte-for-byte stdout/stderr, JSON, lifecycle, RSS и
   summary в ignored `tmp/vitest-gate/<run-id>`.

## Manifest

Implementation candidate:

- `CURRENT_TASK.md`;
- `gui/designer/package.json`;
- `gui/designer/vite.config.js`;
- `gui/designer/src/test/common-features-fetch.js`;
- `gui/designer/src/test/setup.js`;
- `gui/designer/src/test/vitest-process-probe.js`;
- `gui/designer/src/test/__tests__/common-features-fetch.test.js`;
- `gui/designer/scripts/vitest-inventory-reporter.mjs`;
- `gui/designer/scripts/vitest-gate.mjs`;
- `gui/designer/scripts/__tests__/vitest-gate.test.js`;
- `gui/designer/scripts/__tests__/fixtures/vitest-gate-fully-skipped.test.js`.

Planner tracker sync: `BUGS.md`, `docs/BACKLOG.md`, `PROJECT_STATE.md`.

## OUT

- Product fetch/load semantics, `/api/import`, store/plugin behavior и BG-067.
- Смена Vitest pool, зависимостей, timeout, concurrency или product fixtures.
- Закрытие BG-022, три подтверждающих прогона, browser и продуктовые ASM/ACT-пакеты.
- Вторичные worktree, Graphify, release tag и force-push.

## TDD и проверка

- [x] RED/GREEN для точечного common-features stub и потерянного inventory; compatibility
      selection подтвердил override/cleanup/delegation.
- [x] Первый полный gate дал exact 859/859 во всех inventory и опроверг строгую RSS-пару:
      setup 859, afterAll 857; reporter отдельно дал два ended state `skipped`, но старые
      samples не позволяют сопоставить их по moduleId.
- [x] RED-RSS2: `passed` setup-only должен FAIL, а точно сопоставленный `skipped`
      setup-only — PASS; unknown/duplicate/missing module остаются fail-closed.
- [x] Реализация записывает реальный moduleId в setup и afterAll; focused real gate
      exact 2/2 доказал одну RSS-пару и один именованный skipped setup-only; unit 25/25.
- [x] Frozen digest `006d5009…a42a` воспроизвели два независимых read-only reviewer;
      оба дали ACCEPT без correction.
- [x] Один полный параллельный `test:gate`: exact 860/860 во всех inventories,
      9 318 тестов (9 297 passed, 21 skipped), exit 0, unhandled 0, RSS complete.
- [x] Production build: 624 modules PASS; scoped ESLint 8 infra-файлов: 0 ошибок.
- [x] Финальные `git diff --check`, размеры, exact status/manifest и package digest.
      Pytest/browser вне scope.

## Критерий завершения

- Common-features localhost noise отсутствует; остаточный `/api/import` шум не маскируется.
- Полный gate либо поимённо доказывает каждый модуль и module-aware RSS, либо честно
  называет потерю/state/sample и возвращает nonzero.
- BG-022 остаётся OPEN до причины, исправления и трёх подряд полных parallel exact PASS;
  один чистый gate этого пакета для закрытия недостаточен.

Итоговый run: 860 setup, 857 afterAll, 857 точных пар и три поимённых skipped
setup-only (`vitest-gate-fully-skipped`, `canvas-click-add-v99`,
`skeleton-canvas-layout`); 1 717/1 717 RSS-сэмплов валидны. Наблюдавшийся максимум
worker RSS — 866 148 352 bytes; это не process-tree total и не гарантированный peak.

## Следом, не смешивать

- Первый продуктовый пакет после infra acceptance: ASM-6, затем ASM-5.
- ACT-0 ждёт явных семантических решений владельца, включая BG-064 и KLD.

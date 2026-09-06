# PROJECT_STATE — BodgeGene

Обновлено: 06.09.2026 (приёмка SYNC-1 и S3-C2).

## Текущий снимок

- GUI: **0.8.8-alpha**; ветка `checkpoint/integration-2026-07-17`; HEAD/base
  `15169db8636ed8c9fdc2dbb759a8719f58e7af23`; ветка без upstream, 66 коммитов с
  12.06.2026 существуют только локально.
- Main checkout намеренно содержит интегрированный WIP: 150 изменённых и 54 untracked
  файла против HEAD. Stage/commit/push после base не выполнялись.
- Post-correction gate 06.09.2026: из трёх полных Vitest-прогонов на одном дереве два
  собрали **857 файлов / 9 286 тестов** (9 266 passed, 20 skipped, exit 0), один —
  **856 / 9 266**, `Worker exited unexpectedly`, exit 1, потерян файл на 20 тестов.
  JSON-инвентарь единственного разрешённого repeat совпал с `rg`: 857 / 857. Поэтому
  полный frontend gate не считается стабильно зелёным, BG-022 открыт. Focused
  `container-editor-skeleton-v2.test.jsx`: 1 файл / 25 тестов PASS без async leaks и
  `ECONNREFUSED`; pytest **195 / 195**; production build **624 modules PASS**.
  Browser не проверялся; ESLint не перезапускался, база 05.09 остаётся 360 errors /
  5 458 warnings.
- Последний чистый checkpoint: frontend 828 файлов / 8 817 тестов, backend 195, build
  599 modules — baseline HEAD, не gate текущего дерева.

## Принятые пакеты в дереве

- **P16** (принят, «Шикарно»): физически честная full-oligo посадка праймера с
  фиксированным 3′, реальный 5′-хвост, P6a-термодинамика, единая annealing policy,
  PrimerTrack/StepGlyph/Inspector, disclosure одного праймера.
- **P17** (принят 04.09, «ну чтож неплохо»): collision-aware подписи RE-сайтов, Horizontal
  по умолчанию, фоновые выноски, cut-zone на физическую координату.
- **ANN A1/A2/B1** (приняты по прежнему снимку): единый currentDocument для Library и
  Container, opaque стабильные id с cascade, run-keyed Annotator. Записи BG-026/029/031
  ждут checkpoint в разделе ожидания BUGS.md.

## Непринятый WIP в том же дереве

- ANN **B3** — reverse-strand CDS auto-annotation реализован (`auto-annotate.js`) с
  proof-тестом; BG-033 остаётся открытым до приёмки.
- Primer **P4–P10** — canonical assembly-primer sites, skeleton schema v13
  (`canonicalizeAssemblyPrimerRecords`), PCR-occurrence snapshots, замена EditModal на
  общий PrimerFromSelectionModal; evidence только в BUGS «TECHNICALLY RESOLVED».
- **Selection contract** — `selection-range.js`, `useSelectionContract`, origin-crossing
  drag; без записи в трекерах до SYNC-1.
- **Assembly annotation geometry** — `segment-annotation-transfer.js` на 0-based
  end-exclusive, overhang-aware RC с аннотациями; открыт BG-068 (миграция).
- Пять untracked lib-модулей праймеров и семь модулей ANN-INTEGRITY импортируются
  изменёнными tracked-файлами: при checkpoint они неделимы от своих importers.

## Текущий пакет

**SYNC-1 принят. S3-C2 принят только как smoke-test isolation** (см. `CURRENT_TASK.md`):
локальные async/network side effects конкретного теста устранены, но случайный fork-worker
crash пережил correction. Эта линия остановлена по контракту; BG-022 остаётся открытым.
Checkpoint всего dirty-дерева рекомендован и ждёт отдельного явного разрешения владельца
на stage и commit; bundle и push требуют самостоятельного разрешения.

## Открытые направления после SYNC-1

1. **Restriction occurrence** (BG-062, BG-063, BG-086): одна модель occurrence с
   recognition start, strand и top-cut; двойной `cut[0]` в «cut here»; digest по модулю;
   все потребители через `effectiveEnzymes()`.
2. **Assembly primers integrity** (BG-064, BG-065, BG-072, BG-073, BG-074, BG-076, BG-068):
   решение владельца по ручным boundary-праймерам; сохранение derived-праймеров;
   стабильные id; миграция сегментных аннотаций.
3. **Project persistence** (BG-066, BG-027, BG-070, BG-071, BG-083, BG-001, BG-002):
   гидратация пула при старте, libraryEntries в Ctrl+S, schema-маркер snapshot, честный
   отказ для `.bodgeassembly`/v1, lock на активации.
4. **Modal hotkey isolation** (BG-078, BG-079) и **Annotator fail-closed** (BG-067).
5. **Alignment** (BG-077) до старта спецификации M-ALIGN-TRUST.
6. Перф-инструментовка на эталонной машине; scanAllSites и alignment вне UI-потока.
7. **Test infrastructure** (BG-022): установить причину случайного fork-worker exit по
   диагностическому протоколу; отдельно убрать happy-dom шум от `/common-features.json`
   детерминированным test-harness stub с явными override для error-path тестов.

## Производительность и размеры

- В worker с отменой работает только DNA-поиск (без индекса: клон корпуса на запрос).
  Остальные тяжёлые пути синхронны в UI-потоке; ни одна численная цель AGENTS.md не
  измерена на эталонной машине (harness `D:\bodgegene-bench\u6-weakpc` без отчёта).
- 14 файлов выше hard-лимита, три новых soft-entrant в WIP; список и seams — BACKLOG
  «Oversized module boundaries».

## Репозиторий и источники истины

- Вторичные worktree (`.claude/worktrees/*`, `.codex`, Desktop v05): Codex-worktree
  находится на том же HEAD, остальные перечисленные worktree — строгие предки; не
  удалять без разрешения, их dirty-состояние не инспектировалось.
- Источник истины: код и тесты → `AGENTS.md` → `CURRENT_TASK.md` → этот snapshot →
  `BUGS.md` / `docs/BACKLOG.md` / архитектурные спецификации.
- Полный аудит 05.09.2026 (22 read-only читателя, 70 независимых верификаций) хранится
  вне репозитория; выводы перенесены в трекеры пакетом SYNC-1.

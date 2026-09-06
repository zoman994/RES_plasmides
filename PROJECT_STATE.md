# PROJECT_STATE — BodgeGene

Обновлено: 06.09.2026 (INFRA-GATE-2 checkpointed).

## Текущий снимок

- GUI: **0.8.8-alpha**; ветка `checkpoint/integration-2026-07-17`; recovery checkpoint
  принятого product/WIP-снимка — `31fcca17a56e9d76c9db46c2c0d8cd6972968658`
  (предыдущий base `15169db8636ed8c9fdc2dbb759a8719f58e7af23`); принятый infra checkpoint —
  `7417966c2d29adc424139b21e59b9154bf42863c`.
- Checkpoint зафиксировал точный main-manifest: 150 изменённых tracked + 54 untracked =
  204 файла, 22 358 additions / 2 930 deletions. Main был чист сразу после commit;
  follow-up snapshot — `6145bf0f1fcc8e44211eaf17445f1b00f84a6d96`. Оба commit отправлены
  в `origin/checkpoint/integration-2026-07-17`; проверенный complete bundle хранится вне
  репозитория. Тег не создавался.
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

**INFRA-GATE-2 checkpointed** как `7417966c2d29adc424139b21e59b9154bf42863c`
на base `6145bf0` (см. `CURRENT_TASK.md`). Два
read-only reviewer воспроизвели frozen digest и дали ACCEPT. Единственный полный
parallel gate: exact 860/860 expected/ended/run-end/JSON, 9 318 тестов (9 297 passed,
21 skipped), raw exit 0, unhandled 0. Module-aware RSS complete: 860 setup, 857
afterAll, 857 пар и три точно названных skipped setup-only; observed worker point maximum
866 148 352 bytes, не peak/process-tree total. Common-features network noise исчез;
четыре отдельных `/api/import` ECONNREFUSED-группы остаются в BACKLOG. Production build
624 modules PASS; scoped ESLint новых infra-файлов 0. BG-022 остаётся открыт: причина
случайного fork crash не установлена, а один чистый run не выполняет критерий закрытия.

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
7. **Test infrastructure** (BG-022): использовать принятый module-aware exact-inventory
   gate и установить причину случайного fork-worker exit. Точечный test-harness stub для
   `/common-features.json` не должен скрывать отдельный `/api/import` network noise.

## Производительность и размеры

- В worker с отменой работает только DNA-поиск (без индекса: клон корпуса на запрос).
  Остальные тяжёлые пути синхронны в UI-потоке; ни одна численная цель AGENTS.md не
  измерена на эталонной машине (harness `D:\bodgegene-bench\u6-weakpc` без отчёта).
- 14 файлов выше hard-лимита, три новых soft-entrant в WIP; список и seams — BACKLOG
  «Oversized module boundaries».

## Репозиторий и источники истины

- Вторичные worktree (`.claude/worktrees/*`, `.codex`, Desktop v05) сверены перед
  checkpoint: Codex `b85d` остался на предыдущем `15169db`, остальные — на более ранних
  HEAD. Их dirty/staged/untracked состояние исключено из checkpoint и сохранено;
  worktree не удалялись.
- Источник истины: код и тесты → `AGENTS.md` → `CURRENT_TASK.md` → этот snapshot →
  `BUGS.md` / `docs/BACKLOG.md` / архитектурные спецификации.
- Полный аудит 05.09.2026 (22 read-only читателя, 70 независимых верификаций) хранится
  вне репозитория; выводы перенесены в трекеры пакетом SYNC-1.

# PROJECT_STATE — BodgeGene

Обновлено: 07.09.2026 (PROC-3R-FREEZE checkpointed; docs-state sync).

## Текущий снимок

- GUI: **0.8.8-alpha**; ветка `checkpoint/integration-2026-07-17`; recovery checkpoint
  принятого product/WIP-снимка — `31fcca17a56e9d76c9db46c2c0d8cd6972968658`
  (предыдущий base `15169db8636ed8c9fdc2dbb759a8719f58e7af23`); принятый infra checkpoint —
  `7417966c2d29adc424139b21e59b9154bf42863c`; принятый UI checkpoint —
  `864bc76deabada4b47f84cdecb5f2d31ff2314c9`.
- Локальный checkpoint принятого process-пакета и сохранённого WIP —
  `02a26b75bc22062e0eccc02c3b982b2e952104dc` на parent
  `bd710973112ad8712c81c619eefd7fc6c755858d`: exact 76-path snapshot / 9 580 B /
  `e75205cc586b652d0716ffb8569fde45f2de48854300182e21fb7ad345fe37a2`;
  55 modified, 18 added, 3 deleted; 4 332 additions / 943 deletions. Main был чист
  сразу после commit; bundle, push и tag не выполнялись.
- Recovery checkpoint `31fcca17…` зафиксировал точный main-manifest: 150 изменённых
  tracked + 54 untracked =
  204 файла, 22 358 additions / 2 930 deletions. Main был чист сразу после commit;
  follow-up snapshot — `6145bf0f1fcc8e44211eaf17445f1b00f84a6d96`. Оба commit отправлены
  в `origin/checkpoint/integration-2026-07-17`; проверенный complete bundle хранится вне
  репозитория. Тег не создавался.
- ASM-6A: related-прогон потерял один модуль на четыре теста после 145/146 из-за
  открытого BG-022; три предопределённых точных раздела завершили 146/146 и 1 252 теста.
  Финальный полный gate затем дал exact expected/ended/run-end/JSON **863 / 863**,
  9 339 тестов (9 318 passed, 21 skipped, 0 failed), raw exit 0. BG-022 остаётся открыт:
  один чистый полный run не устанавливает причину и не равен трём подряд.
- Production build: **625 modules PASS**. Browser smoke на реальном Settings flow:
  focus-outside Escape и Escape из input закрывают только диалог, Ctrl+R не перезагружает
  страницу и не теряет draft, console errors 0. Scoped ESLint 20 изменённых JS/JSX:
  один доказанный на base error `PromptModal.jsx:23`, 182 warning; новых errors нет.

## Принятые пакеты в дереве

- **P16** (принят, «Шикарно»): физически честная full-oligo посадка праймера с
  фиксированным 3′, реальный 5′-хвост, P6a-термодинамика, единая annealing policy,
  PrimerTrack/StepGlyph/Inspector, disclosure одного праймера.
- **P17** (принят 04.09, «ну чтож неплохо»): collision-aware подписи RE-сайтов, Horizontal
  по умолчанию, фоновые выноски, cut-zone на физическую координату.
- **ANN A1/A2/B1** (приняты по прежнему снимку): единый currentDocument для Library и
  Container, opaque стабильные id с cascade, run-keyed Annotator. Записи BG-026/029/031
  ждут checkpoint в разделе ожидания BUGS.md.
- **ASM-6A**: общий LIFO modal keyboard boundary для десяти диалогов, exact hotkey
  registry hand-back, viewer-scoped Escape и выборочное подавление browser defaults.

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

**PROC-3R-FREEZE принят и checkpointed; активного Кодера нет.** Единственный correction
C1 закрыл обе P1: AUD хранит evidence/risk без теневого disposition, а REF разделён на
immutable metadata-wrapper и payload с `SIDECAR`/`POINTER_ONLY`, dual pin и честным
`UNVERIFIED`.
Semantic и forensic линзы дали ACCEPT. Final correction 9-path `7e27fdcf…`, unified
process 20-path `47e3843e…`. Frozen audit `AUD-2026-09-07-004` (`99b0b2cb…`) и matching
`PACKAGE_REVIEW/ACCEPT` DISP (`0f094c2d…`) фиксируют приёмку. Checkpoint `02a26b75…`
сохранил exact 76-path snapshot (`e75205cc…`), включая frozen 74-path subset
(`9b1e09f8…`) и два canonical control-plane файла. Tests/build/browser не запускались:
docs/policy-only. Этот двухфайловый docs-state sync не меняет candidate; его фактический
SHA определяется после commit, а следующий пакет должен пинить итоговый чистый HEAD.

**PROC-3R STOP / REPLAN, не принят.** Его 19 process-файлов физически остаются в main и
побайтово совпадают с source (`3bb1fda1…`), но candidate отклонён: shared-record
одновременно объявлялся frozen и допускал append disposition, инвалидирующий SHA.
Второй correction pass не выполнялся. Content pin `AUD-2026-09-07-002` проверен; audit
выбран как read-only evidence нового replan. Source-worktree сохраняется; живой файл
Креативщика не принят, не прочитан и не перенесён в main.

**ASM-5B остаётся STOP и не принят.** На package base `bd710973112ad8712c81c619eefd7fc6c755858d`
заморожен product/proof candidate: 49 путей, payload 6 594 B, SHA-256 `d78a7b61…`.
Обе named read-only линзы приняли correction; focused correction 35/35, related gate
466/466 файлов и 4 480 тестов, exit 0. Единственный полный module-aware gate потерял
`gui/designer/src/components/SequenceView/__tests__/out-of-range-mask-v87.test.jsx`
(4 теста): expected 864, lifecycle ended 863, raw exit 1, один unhandled fork error;
строгие inventory/RSS неполны. BG-022 остаётся открыт, полного
retry нет. Build, scoped lint и browser smoke после STOP не запускались; BG-062/063/086
не закрыты. Product/test-файлы не менялись после freeze; tracker-sync выполнен отдельно
на blocker-границе. Candidate сохранён внутри checkpoint `02a26b75…` без приёмки;
push отсутствует.

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
4. **Annotator fail-closed** (BG-067) и остаточный audit transient surfaces из BACKLOG.
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
- ASM-6A не добавил hard-entrant: `hotkeys.js` 17 602 bytes,
  `gui/designer/src/hooks/useModalKeyboardBoundary.js` 3 011 bytes; существующий hard-zone
  `RangePickerModal.jsx` остаётся 57 686 bytes, в нём только тонкая wiring-правка.

## Репозиторий и источники истины

- Вторичные worktree (`.claude/worktrees/*`, `.codex`, Desktop v05) сверены перед
  checkpoint: Codex `b85d` остался на предыдущем `15169db`, остальные — на более ранних
  HEAD. Их dirty/staged/untracked состояние исключено из checkpoint и сохранено;
  worktree не удалялись.
- Источник истины: код и тесты → `AGENTS.md` → `CURRENT_TASK.md` → этот snapshot →
  `BUGS.md` / `docs/BACKLOG.md` / архитектурные спецификации.
- Полный аудит 05.09.2026 (22 read-only читателя, 70 независимых верификаций) хранится
  вне репозитория; выводы перенесены в трекеры пакетом SYNC-1.

# PROJECT_STATE — BodgeGene

Обновлено: 26.08.2026.

## Текущий снимок

- GUI version: **0.8.8-alpha**.
- Ветка: `checkpoint/integration-2026-07-17`.
- WIP integration checkpoint:
  `6f652ac846f6faaa832df28c1387327840b93bdb`.
- Текущий HEAD после него содержит только tracker handoff; push не выполнялся.
- Frontend: **828 файлов**, **8 817 тестов** — 8 797 passed, 20 skipped,
  0 failed.
- Backend: **195 passed**.
- Production build: **PASS, 599 modules**.
- Основной checkout после tracker handoff не содержит staged, modified или untracked
  project-файлов. Локальный `.claude/settings.local.json` сохранён и ignored.
- Общий browser gate всего WIP snapshot не заявляется. Targeted browser acceptance
  пройден для search, SnapGene import, `.bodge` flows и primer tail/reopen; известные
  browser-находки находятся только в `BUGS.md`.

## Продукт

BodgeGene — local-first React-приложение для создания, анализа и версионирования
плазмид и генетических сборок. Основной интерфейс находится в `gui/designer/`;
Python `pvcs` версионируется отдельно и обслуживает CLI/парсинг.

Текущий WIP snapshot включает:

- библиотеку молекул, проектов, версий и canonical primer pool;
- Sequence/Map просмотр, редактирование и annotation tracks;
- сборочный canvas, PCR/KLD, primer reuse, substitution/indel/AA mutagenesis;
- exact/approximate DNA search с worker cancellation и honest incomplete states;
- локальный SnapGene catalog: 19 categories / 2 822 plasmids;
- `.bodge` full-project open, donor-container import и v2 topology normalization;
- GenBank/FASTA/SnapGene ingress, alignment и Sanger foundations.

## Важная WIP-граница

Checkpoint сохраняет смешанную ANN/primer поверхность, но не превращает её в
release-ready реализацию. BG-035 и связанный paused ANN-0M остаются открыты: lossless
primer/annotation ownership, document identity/provenance и Annotator scope требуют
отдельного вертикального correction package. Остальные подтверждённые дефекты читаются
только из `BUGS.md`, улучшения — только из `docs/BACKLOG.md`.

## Репозиторий и локальные данные

- Накопленный snapshot сохранён одним WIP commit: 195 файлов, tree
  `845988f21c474f2f273edd53f8cf68e13c4e9f1c`.
- Старый параллельный debt-tracker ликвидирован; 79 unresolved legacy-ID получили
  канонический исход без второго журнала.
- Отдельный CAD/bioreactor проект сохранён в `D:\RES-lab`: 76 файлов,
  64 826 067 bytes, digest
  `47560e4b53258c291278432a8ea564c5cfd261aa02259a9ec158a85716efe10b`.
- `.agents/skills`, project Claude profiles, agarose-gel future specification и новые
  product tests/sources входят в checkpoint.
- Три зарегистрированных secondary worktree оставлены как локальные recoverable
  snapshots; принятая main-работа от них не зависит.
- Generated caches, `dist`, temp PNG и одноразовые runners в checkpoint не входят.

## Проверенная search-семантика

Shipping route остаётся EXACT_FIRST с LINEAR approximate kernel, обеими цепями,
circular origin-wrap, worker execution/cancellation, 15 s timeout и строгой границей
ответа `{occurrences, locationCount, bestIndex}`. Provider/resource failure даёт
incomplete, а не honest-empty. Полный контракт находится в
`docs/guides/TECHNICAL_GUIDE_SEARCH.md`.

## Источники истины

1. Исполняемый код и тесты.
2. `AGENTS.md` — постоянные правила.
3. `CURRENT_TASK.md` — единственный текущий scope.
4. Этот файл — короткий snapshot, не журнал.
5. `BUGS.md`, `docs/BACKLOG.md`, `DECISIONS.md`.
6. `docs/ARCHITECTURE.md` и активные нормативные specs.

Если документ противоречит коду или тестам, документ устарел.

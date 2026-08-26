# CURRENT_TASK — TREE-INTEGRATION-0.8.8

**Статус:** ACCEPTED / CHECKPOINTED (26.08.2026).

## Git

- Accepted base: `876bad0d7e7e073ac29273be2a23afc13c6f26ad`.
- WIP integration checkpoint:
  `6f652ac846f6faaa832df28c1387327840b93bdb`.
- Staged tree: `845988f21c474f2f273edd53f8cf68e13c4e9f1c`.
- Staged manifest SHA-256:
  `0a5b8fcd804fd9919827c5c85ea4e0d28f4d2292e32bab6d73cd0da789b4b9f8`.
- Этот tracker и `PROJECT_STATE.md` входят во второй docs-handoff commit.
- Push не выполнялся и не разрешался.

## Цель и решение

Основной checkout `D:\RESplasmide` приведён к чистому Git-состоянию без потери
накопленной работы. Смешанную annotation/primer поверхность не разделяли рискованным
hunk-rollback: весь снимок сохранён как честный **WIP checkpoint**, а не как заявление
о стабильном product release. Известные ANN-риски остаются в `BUGS.md`.

## Что интегрировано

- Исходный frozen snapshot: 126 tracked-dirty + 146 untracked, index пуст.
- Первый commit: 195 файлов — 70 added, 123 modified, 2 deleted from repository;
  28 482 additions / 2 099 deletions.
- 70 новых project-файлов проверены независимо: 816 134 bytes, aggregate SHA-256
  `e121671c9738303652a7f12a3b4f21d87ac9aa42140e3fa296761888118fbdfe`.
- `.claude/settings.local.json` удалён только из Git index, сохранён локально и
  покрывается `.gitignore`.
- Отдельный проект `RES-lab` атомарно перенесён в `D:\RES-lab`: 76 файлов,
  64 826 067 bytes, tree digest
  `47560e4b53258c291278432a8ea564c5cfd261aa02259a9ec158a85716efe10b`.
- Старый параллельный debt-tracker удалён после консолидации: 52 unresolved legacy-ID
  находятся в `BUGS.md`/`docs/BACKLOG.md`, 27 входят в проверенный resolved allowlist;
  unresolved union 79, потерянных ID — 0.
- Доказанные temp/cache/build residues были удалены до checkpoint; generated output
  не попал в commit.

## Проверка

- Frontend full gate: 828 файлов; 826 passed + 2 skipped.
- Frontend tests: 8 817; 8 797 passed + 20 skipped, 0 failed.
- Backend: 195/195 passed.
- Production build для байт-идентичного product snapshot: PASS, 599 modules.
- Version sync: package, lock и runtime — `0.8.8-alpha`.
- Staged `git diff --check`: PASS после точечного удаления whitespace в восьми новых
  docs/test files.
- Secret/private-key/sensitive-filename scans: реальных совпадений нет.
- Локальный dev server продолжает обслуживать `127.0.0.1:3000`.

## Size budget

Новых hard-zone production entrants нет. Новые soft-zone entrants зафиксированы в
каноническом backlog: `PrimerTrack.jsx`, `PlasmidMapV2.jsx` и
`skeleton-state-assembly.js`. Стабильные существующие hard-файлы не разрезались
механически внутри checkpoint-пакета.

## Сохранённые границы

- BG-035 и paused ANN-0M не объявлены исправленными только из-за checkpoint.
- Три secondary worktree сохранены без удаления; принятая работа присутствует в main
  checkpoint, а их локальные остатки не влияют на чистоту основного checkout.
- Новые product fixes, reset/checkout/clean/stash и push не выполнялись.

# BodgeGene designer (gui/designer)

> **v0.6.0-dev — rewrite в работе.** Текущий main соответствует
> v0.5.4-alpha; Sprint M-A находится в feature-ветке. v0.5
> компоненты сохраняются на диске как orphan-файлы (не импортируются
> в build entry) до конца rewrite-фазы — переиспользуются в M-B+ по
> [`docs/ARCHITECTURE_v2.md`](../../docs/ARCHITECTURE_v2.md) §8.

## Стек

React 19 + Vite 8 + Tailwind 4 + Zustand 5 (Immer) + React Compiler.
Persistence: Dexie 4 (IndexedDB) + fflate (.bodge ZIP). UUIDv7 ids
через `uuid` v10.

## Команды

```bash
cd gui/designer
npm install
npm run dev:front      # Vite dev сервер (порт 3000)
npx vitest run         # все unit-тесты
npx vite build         # production-сборка
```

## Структура (актуальная для M-A)

```
src/
├── App.jsx                 — root layout + routing по activeFullscreen
├── main.jsx                — bootstrap + ErrorBoundary
├── index.css               — design tokens (light/dark) + StartScreen styles
├── store/                  — Zustand 3 slices (project, canvas, ui)
├── db/dexie-schema.js      — Dexie v1 (projects, containers)
├── lib/
│   ├── storage.js          — localStorage wrapper + memory fallback
│   ├── file-system.js      — File System Access wrapper + fallback
│   ├── bodge-zip.js        — .bodge ZIP I/O (fflate)
│   ├── multi-tab-lock.js   — navigator.locks + BroadcastChannel
│   └── v05-cleanup.js      — one-shot legacy localStorage wipe
└── components/
    ├── AppShell/           — Topbar + content frame
    ├── StartScreen/        — wireframe v7 layout
    ├── DagPlaceholder.jsx  — пустой канвас в проекте
    ├── UnderConstruction.jsx — фулскрин-заглушка для M-F/M-H/etc
    ├── MultiTabBlocked.jsx — multi-tab race UI
    ├── ReadOnlyForced.jsx  — view после force-release
    └── SettingsModal.jsx   — Display / Identity / Advanced
```

См. также `docs/SPRINT_M-A.md` (спека) и `CURRENT_TASK.md` (чеклист).

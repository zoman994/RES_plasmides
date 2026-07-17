# BodgeGene designer

Основное локальное приложение BodgeGene: React 19 + Vite 8 + Zustand/Dexie, local-first persistence и Web Workers для тяжёлого поиска/анализа.

Актуальная архитектура: [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md). Правила разработки: [`AGENTS.md`](../../AGENTS.md).

## Запуск

Сначала из корня репозитория установите Python helper и его зависимости, затем
установите frontend-зависимости:

```bash
py -m pip install -e ".[gui]"
cd gui/designer
npm install
npm run dev
```

Приложение открывается на `http://localhost:3000`.

## Проверка

```bash
npm test
npx vite build
```

Для одного теста используйте `npm test -- path/to/file.test.jsx`. Не запускайте глобальный `npx vitest`: он может выбрать несовместимую версию из npm cache.

## Основные каталоги

- `src/components/` — рабочие пространства и UI;
- `src/store/` — канонический Zustand state;
- `src/lib/` — биологические, файловые и поисковые контракты;
- `src/__tests__/` и локальные `__tests__/` — Vitest suites;
- `public/` — PWA/static assets.

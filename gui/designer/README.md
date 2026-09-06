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

Приложение открывается на `http://127.0.0.1:3000` (не `localhost`: на этой машине `localhost`/`::1` перехватывает VPN, см. комментарии в `vite.config.js`).

## Проверка

```bash
npm test
npm run build
```

Для одного теста используйте `npm test -- path/to/file.test.jsx`. Не запускайте глобальный `npx vitest`: он может выбрать несовместимую версию из npm cache.

## Основные каталоги

- `src/components/` — рабочие пространства и UI;
- `src/store/` — канонический Zustand state;
- `src/lib/` — биологические, файловые и поисковые контракты;
- `src/__tests__/` и локальные `__tests__/` — Vitest suites;
- `public/` — PWA/static assets.

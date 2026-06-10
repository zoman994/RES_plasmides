# SPEC — AddModal UX Batch (WT-UX-4 / 7 / 8 / 9)

**Тип:** C (UX-итерация одного компонента — `AddModal`). **Версия:** v0.8.3-alpha. **Дата:** 23.05.2026.
**Закрывает:** `docs/UX_AUDIT_FINDINGS.md` WT-UX-4, WT-UX-7, WT-UX-8, WT-UX-9.
**Источник:** `docs/WALKTHROUGH_OVERLAP_PCR_2026_05_23.md` §B.

> **Зависимость:** ставить ПОСЛЕ `SPEC_WT_B_IMPORT_BATCH.md` (V103/V104/WT-D-2).
> Тот батч уже добавляет поле `autoAnnotate` в `preset` и в `importFiles`;
> этот батч добавляет в тот же `preset` поля `topology` и `name`. Code должен
> видеть пост-Батч-1 версии `AddModal.jsx` / `LibraryTreeHost.jsx`.
>
> **WT-UX-6 (textarea word-wrap маскирует пробел)** — отдельного кода НЕ требует:
> failure mode (`>F1 ACGT` одной строкой → пустой сиквенс) закрыт фиксом V103 в
> `parseFasta`. Textarea остаётся с обычным wrap (длинные ПСО биолог хочет видеть
> переносом). В этом батче WT-UX-6 — закрыт по факту V103, без правок.

---

## §0 Размеры затрагиваемых модулей

| Файл | Размер | Лимит | Примечание |
|---|---|---|---|
| `components/Library/AddModal/AddModal.jsx` | 12.66 KB (до Батча 1) | .jsx 40/30 | запас есть |
| `components/CanvasSkeleton/LibraryTreeHost.jsx` | ~8 KB (до Батча 1) | .jsx 40/30 | запас большой |

Декомпозиция не нужна.

---

## §1 Контекст / корень (подтверждено чтением `AddModal.jsx`)

- **WT-UX-9 — заголовок не соответствует цели.** Header захардкожен `{ws.addBtn} в библиотеку`. При этом `useEffect` дефолтит `target` на текущий проект (`setTarget(currentT.id)`), если он есть. Заголовок «в библиотеку» противоречит дефолтной цели «активный проект».
- **WT-UX-8 — нет поля имени для headerless-вставки.** Paste-секция (`pickedSource==='paste'`) даёт только textarea. Headerless ACGT → `parseFasta` возвращает `name:'imported'` (после Батча 1 — спасение сиквенса не меняет имя), `extractItemName` отдаёт `imported` (внутреннее имя не temp/unknown → filename не используется). Контейнер «imported».
- **WT-UX-7 — нет выбора топологии.** Paste-путь: `parseFasta` хардкодит `topology:'linear'`. Для линейного фрагмента верно, для сырой ПСО кольцевой молекулы — молча неверно. Тумблера linear/circular в `AddModal` нет.
- **WT-UX-4 — три неразличимых «Новый проект».** Секция «КУДА ДОБАВИТЬ»: project-таргеты строятся из `targets` useMemo, `label: p.name`. Проекты с дефолтным именем «Новый проект» (не переименованные) дают три одинаковые строки; единственное отличие — точка `●` (текущий) + одинаковый `sub:'📦 .bodge'`. Resolution нечитаемый.

---

## §2 Стратегия

`AddModal` — UI-источник полей; `preset` (уходит в `onLaunchPreImport`) расширяется `topology`/`name`; `LibraryTreeHost` применяет их к `parsed` после `parseFile`. Заголовок и таргет-строки — чисто презентационные правки в `AddModal`.

---

## §3 Где задача сядет (связи)

- **`AddModal.jsx`** — header (WT-UX-9), paste-секция (+ поле имени WT-UX-8, + тумблер топологии WT-UX-7), target-список (WT-UX-4). Локальный state `pasteText` уже есть — добавляются `pasteName`, `pasteTopology`.
- **`LibraryTreeHost.jsx`** — `onLaunchPreImport` paste-ветка кладёт `name`/`topology` в `preset`→`importFiles`; `importFiles` после `parseFile` (и `enrichAnnotations` из Батча 1) применяет: `name` (если задан и непуст) → переопределяет `parsed.name`; `topology` (если задан) → переопределяет `parsed.topology`. Только для paste-пути.
- Ничего нового не создаётся. `parseFasta`/`parseFile` не трогаются (Батч 1 их уже правил; здесь — только post-обработка `parsed` в `importFiles`).
- Риск пересечения с Батчем 1: оба правят `AddModal` + `onLaunchPreImport`/`importFiles`. Митигация — явная зависимость (Батч 1 первым); правки этого батча — другие участки тех же функций (новые поля preset, не те же строки).

## Scope IN
- `AddModal`: динамический заголовок; поле имени в paste-секции; тумблер топологии в paste-секции; distinguishing-деталь в project-таргетах.
- `LibraryTreeHost`: проброс `name`/`topology` через preset + применение к `parsed`.
- Тесты.

## Scope OUT
- `parseFasta` / `parseFile` / `extractItemName` — не трогать (Батч 1 закрыл парсер).
- WT-UX-6 — без кода (закрыт V103, см. шапку).
- Дефолтное имя проектов «Новый проект» (корень WT-UX-4) — это `ProjectInfoModal` / создание проекта (WT-UX-2, Bin 3). Здесь — только различение в списке `AddModal`, не переименование проектов.
- Топология для файлового импорта (.gb/.dna несут свою) — тумблер действует только на paste-путь.

---

## §4 Архитектурные решения

1. **WT-UX-9 — заголовок из выбранного `target`.** Заголовок вычисляется из `target`: project-таргет → «Добавить в проект «{имя}»»; `loose` → «Добавить на свободный стол». Обновляется при смене радио. Строки — `STRINGS` (namespace `AddModal`/`libraryWorkspace`).
2. **WT-UX-8 — опциональное поле имени для paste.** В paste-секции — input «Имя (необязательно)». Значение → `preset.name`. `LibraryTreeHost`: если `preset.name` непуст → после `parseFile` `parsed.name = preset.name`. Пусто → текущее поведение (имя из `>`-заголовка либо `imported`). Подсказка «если в тексте есть `>name` — имя возьмётся оттуда».
3. **WT-UX-7 — тумблер топологии для paste.** В paste-секции — toggle linear/circular, дефолт `linear`, выбор виден. → `preset.topology`. `LibraryTreeHost`: `preset.topology` задан → `parsed.topology = preset.topology` после `parseFile`. Применяется только к paste-пути (файловый сохраняет топологию из файла).
4. **WT-UX-4 — различающая деталь в project-таргетах.** Каждая project-строка `targets` получает в `sub` (или второй строкой) различающий атрибут — дата создания `p.createdAt` ИЛИ число контейнеров проекта (Code берёт доступное поле `project`-объекта). `●`-маркер текущего сохраняется. Цель: две одноимённые строки визуально различимы.

---

## §5 Файлы и правки

**`AddModal.jsx`:**
- Header — заменить статический `{ws.addBtn} в библиотеку` на функцию от `target` (§4.1).
- Локальный state: `pasteName` (init `''`), `pasteTopology` (init `'linear'`).
- Paste-секция (блок `pickedSource==='paste'`): добавить input имени и toggle топологии над/под textarea.
- `onSubmit` paste-ветка: `onLaunchPreImport({ source:'paste', target, text:pasteText, name:pasteName, topology:pasteTopology, autoAnnotate:<из Батча 1> })`.
- `useEffect` reset-on-open: сбрасывать `pasteName`/`pasteTopology`.
- `targets` useMemo: project-строки получают различающую деталь (§4.4).

**`LibraryTreeHost.jsx`:**
- `onLaunchPreImport` paste-ветка: пробросить `name`/`topology` из `preset` в `importFiles` (через opts).
- `importFiles`: после `parseFile`+`enrichAnnotations` — `if (opts.name?.trim()) parsed.name = opts.name.trim()`; `if (opts.topology) parsed.topology = opts.topology` (до `buildLibraryEntry`).

---

## §6 Тесты

- `AddModal`: заголовок при `target=project:X` содержит имя проекта; при `target=loose` — «свободный стол».
- `AddModal`: paste-секция рендерит поле имени и toggle топологии; `onSubmit` paste кладёт `name`/`topology` в `preset`.
- `AddModal`: два project-таргета с одинаковым `name` визуально несут разную деталь (дата/счётчик).
- `LibraryTreeHost.importFiles`: paste с `opts.name` → entry имя = заданное; с `opts.topology='circular'` → entry топология circular; без них → поведение Батча 1 без изменений.
- Регрессия: существующие `AddModal` тесты зелёные.

---

## §7 Порядок выполнения

1. `AddModal` — header (WT-UX-9).
2. `AddModal` — поле имени + тумблер топологии в paste-секции (WT-UX-8/7) + reset.
3. `AddModal` — различающая деталь в project-таргетах (WT-UX-4).
4. `LibraryTreeHost` — проброс + применение `name`/`topology`.
5. Тесты. Полный Vitest + `vite build`.

---

## §8 STOP-условие и формат отчёта

После зелёного полного Vitest + `vite build` clean — **STOP**, отчёт в `CURRENT_TASK.md`: Vitest counters; `vite build`; size budget 2 файлов; spec deviations. Координационные файлы не финализировать. Визуальная приёмка — отдельная сессия.

---

## §9 Риски

- **R1 — конфликт правок с Батчем 1.** Митигация: явная зависимость (Батч 1 первым); этот батч добавляет НОВЫЕ поля preset/новые UI-блоки, не переписывает строки Батча 1. Code сверяет, что видит пост-Батч-1 файлы.
- **R2 — `project`-объект не несёт `createdAt`/счётчик контейнеров.** Митигация: §4.4 — Code берёт любое доступное различающее поле; если оба отсутствуют — короткий id-суффикс (`…a3f`).
- **R3 — `topology` override ломает .gb/.dna импорт.** Митигация: override только в paste-ветке `importFiles`; файловый путь `topology` из `preset` не получает.

---

## §10 Открытые вопросы

1. WT-UX-4 различающая деталь — дата создания или число контейнеров? Дефолт: что доступно в `project`-объекте; при наличии обоих — дата (биологу понятнее «когда создал»).
2. Тумблер топологии — radio или сегмент-кнопка? Дизайн-система `AddModal`, на усмотрение Code; при сомнении — скриншот Игорю.

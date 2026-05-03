# CODE_HANDOFF_PROTOCOL.md — регламент работы Chat ↔ Code

> **Назначение:** этот документ — расширение `CHAT_PLAYBOOK_CORE.md` §3, выделено в отдельный файл из-за объёма. Описывает конкретные процедуры handoff'а спеки в Claude Code, верификации отчёта Code, и обработки регрессий.
>
> **Источник:** систематизация проблем взаимодействия Chat ↔ Code, накопленных за апрель 2026 (Sprint X / Sprint 1.7 / Map-WS / Import Start Screen).
>
> **Когда читать:** Chat читает в начале сессий-приёмок (как замена/дополнение `ACCEPTANCE_ALGORITHM.md`) и при подготовке handoff'а Code.

---

## 0. TL;DR

Шесть коренных проблем взаимодействия с Code, которые мы ловили:

1. **Code не дочитывает interaction-flow** — реализует store-слой правильно, но не подключает его к UI (Sprint X — applyMutationGit не вызывается из handleSaveFragment)
2. **Code упрощает спеку** — `applyMutationsBatch` becomes loop of `applyMutationGit` (N undo steps вместо 1)
3. **Code не сообщает о spec violations в отчёте** — пишет "всё по спеке" когда отклонения есть
4. **Memory leaks от взаимодействия useEffects** — 14GB утечка ловится только через DevTools, не Vitest
5. **Vitest unit-тесты не покрывают visual regression** — Code отчитывается зелёным, приёмка FAIL
6. **Lifecycle paths не покрыты в acceptance scenarios** — apply mutation тестируется, undo applied mutation — нет

Каждая проблема имеет конкретный counter-pattern в этом документе.

---

## 1. Pre-handoff checklist для спеки

Перед тем как отдать спеку Code, Chat обязан пройти этот checklist. Если хоть один пункт fail — спека incomplete.

**Architecture & integration:**
- [ ] Все mutations к store явно перечислены с **каждой UI-точкой вызова** (не только сам reducer, но и где он триггерится)
- [ ] Lifecycle states покрыты: создание → правка → удаление → re-creation. Не только "happy path applied"
- [ ] Если есть useEffects с side-effects — указано какие зависимости стабилизируются и как избегается infinite re-render
- [ ] Если меняется shape store — указаны все existing call sites которые надо обновить (через grep'ом проверенный список)

**Acceptance scenarios:**
- [ ] Минимум 2-3 negative paths (что НЕ должно произойти, что должно остаться неизменным)
- [ ] Минимум 1 lifecycle test (apply → undo → verify state)
- [ ] Если есть UI-визуальный output — указан "критерий правильно vs неправильно" в текстовой форме (не "красивая карта", а "subarc renders с цветом из featurePalette")

**Verification commands для Code:**
- [ ] Конкретные `npm test -- <pattern>` команды для запуска relevant тестов
- [ ] Manual verification steps если Vitest не покрывает (e.g. "open HygroR, mutagenesis mode, verify mutations panel shows ✕ button on each entry")
- [ ] Memory profiling если spec затрагивает useEffect/timer/debounce (Chrome DevTools steps)

**Regression coverage:**
- [ ] Список соседних модулей которые могут сломаться (grep dependents)
- [ ] Минимум 1 regression test для каждого соседнего модуля

**Spec hygiene (из CHAT_PLAYBOOK §2):**
- [ ] Размер 20-30 KB
- [ ] Никаких copy-paste кода >10 строк
- [ ] §5 "Предположения" заполнен с источниками и статусом проверки
- [ ] Размеры затрагиваемых модулей проверены через `list_directory_with_sizes` перед написанием спеки

Если Chat ловит себя в situation "это маленький fix, пропущу один пункт" — это **сигнал переложить fix на Code без спеки**, а не сократить спеку.

---

## 2. Handoff format

Стандартный handoff (Chat пишет, Игорь копирует Code):

```
Прочитай:
- CLAUDE.md
- BUGS.md
- CURRENT_TASK.md
- docs/SPRINT_<NAME>.md (это спека, ОБЯЗАТЕЛЬНО прочитать целиком до начала работы)

Выполни Sprint <NAME> по чеклисту K1..KN в CURRENT_TASK.md.

Важно: спеку в docs/ не переписывай, не упрощай, не объединяй K-шаги.

После последнего K-шага остановись. НЕ:
- финализируй PROJECT_STATE.md / RELEASES.md / DECISIONS.md / ANCHORS.md / BUGS.md
- архивируй спеку
- начинай следующий спринт

Запусти на финале:
- cd gui/designer && npx vitest run
- npx vite build

Допиши в конце CURRENT_TASK.md блок "## Отчёт Code по <NAME>" по формату из §4 этого документа.

Жду визуальной приёмки от Игоря в отдельной сессии Chat.
```

**Что не делает handoff:** не пересказывает содержание спеки. Code прочитает спеку — handoff не должен дублировать.

**Что обязательно в handoff:** явная STOP-фраза. Без неё Code продолжает работать дальше — он не знает где граница спринта.

---

## 3. Контракт `npm run`-команд

В каждой спеке Chat фиксирует точные команды verification, которые Code должен запустить и приложить вывод:

```
Verification commands:
- cd gui/designer && npx vitest run                          # все unit-тесты
- npx vitest run src/__tests__/<spec_name>.test.js           # spec-specific
- npx vite build                                              # build cleanness
- npx vitest run --coverage src/<changed_module>.js          # coverage конкретного модуля
```

Code в отчёте указывает **точные числа** (не "all green", а "846/846 passed, 0 skipped"), и при FAIL — **полный output** включая stderr.

---

## 4. Формат отчёта Code

В конце CURRENT_TASK.md, после последнего K-шага, Code пишет блок:

```markdown
## Отчёт Code по <Sprint Name>

### Коммиты
- K1 `<hash>` — <commit message>
- K2 `<hash>` — <commit message>
- ...

### Размеры файлов (затронутые)
- `path/to/file1.jsx`: 12.3 KB → 14.7 KB (+2.4 KB) [soft budget OK / hard budget OK]
- `path/to/file2.js`: создан, 3.1 KB
- `path/to/file3.jsx`: 35.2 KB → 38.9 KB (+3.7 KB) [soft 30 KB EXCEEDED — отметить в TECH_DEBT]

### Тесты
- Vitest: 856 → 873 (+17). 873/873 passed, 0 skipped.
- pytest: 112/112 passed (не трогалось).
- Build: clean (pre-existing warnings: INEFFECTIVE_DYNAMIC_IMPORT, chunk>500KB — оставлены).

### Отклонения от спеки
**ОБЯЗАТЕЛЬНО** — явный список ВСЕХ отклонений, даже мелких. "Нет отклонений" допустимо только если их реально нет.

Примеры формата:
- §3.2 спеки требовал helper `validateFoo(input, options)`, реализован как `validateFoo(input, opts={})` с дефолтом — функционально эквивалентно
- §4.1 K3 требовал переименовать `oldName` в `newName`, оставлен оба имени с deprecation comment, потому что 12 call sites — slowmotion миграция
- §5 §"Предположения" пункт 3 был неверен: `getRegions()` возвращает не `Region[]` а `{ regions: Region[], errors: ... }` после Sprint X-fix-2. Адаптировано в K1.

### Открытые вопросы
- OQ-1: <вопрос если Code наткнулся на неоднозначность>
- OQ-2: ...

### Что НЕ финализировано (по STOP-условию)
- PROJECT_STATE.md / DECISIONS.md / BUGS.md / docs/archive/ — не тронуты, ждут визуальной приёмки
```

**Если Code прислал отчёт без блока "Отклонения от спеки" — Chat не финализирует спринт, требует переотчёт.**

Это ключевая lesson learned: Code иногда пишет "всё по спеке" даже когда отклонения есть. Явный блок заставляет его проверить.

---

## 5. Acceptance verification — что делать с отчётом Code

В новой сессии (compact обязателен!) Chat:

**Шаг 1. Стартовый пакет (как обычно):**
- CLAUDE.md, BUGS.md, CURRENT_TASK.md (включая отчёт Code в конце)
- docs/SPRINT_<NAME>.md (спека)
- docs/ACCEPTANCE_ALGORITHM.md (если applicable)

**Шаг 2. Сверка отчёта со спекой:**
- Размеры файлов: совпадают с ожидаемыми? Над soft/hard budget?
- Тесты: ожидаемый прирост N±2?
- Отклонения от спеки: каждое — это intent или regression?
- Build clean?

**Шаг 3. Архитектурная проверка (читать код, не отчёт):**
Это критичный шаг. Code-отчёт может говорить "всё по спеке", но по факту:
- Read ключевые файлы которые меняла спека
- Проверь что **call sites** обновлены, не только реализация
- Проверь что **side-effects** в useEffects не зацикливаются
- Проверь что **interaction между модулями** работает (e.g. handleSaveFragment действительно вызывает applyMutationGit)

**Конкретный приём:** для каждого contract из спеки — найди в коде **точку вызова** через grep. Если не нашёл — Code не подключил.

**Шаг 4. Visual acceptance:**
Если есть UI-output — Игорь делает скриншоты по acceptance scenarios из спеки. Каждый scenario — отдельный скриншот с явным "ожидаю / вижу".

**Шаг 5. Verdict:**
- PASS — финализировать (PROJECT_STATE/DECISIONS/BUGS, архив спеки)
- PARTIAL — большинство OK, регрессии в 1-2 местах → mini-spec X-fix
- FAIL — критичная регрессия → mini-spec X-fix-N + откладываем финализацию

**Шаг 6. Финализация (только при PASS):**
- BUGS.md OPEN → FIXED для closed багов
- `RELEASES.md` новый версионный блок (или дополнение текущего) с post-mortem (если ≥2 итераций FAIL→fix)
- `PROJECT_STATE.md` snapshot: версия / тесты / «Что работает» / «Что дальше»
- Bump версии в коде (при milestone): `package.json` + `lib/version.js`
- `DECISIONS.md` sprint-level новые решения; `ANCHORS.md` фундаментальные ⚓
- Архивация спеки в `docs/archive/SPRINT_<NAME>.md` с пометкой `**Статус:** ✅ РЕАЛИЗОВАНО [дата]`
- TECH_DEBT.md обновление (закрытые DONE, новые находки)

---

## 6. Регрессии — что делать когда что-то пошло не так

### 6.1 Spec violation (Code упростил/обошёл спеку)

**Симптом:** Code-отчёт пишет "all green", но архитектурная проверка показывает что spec contract не реализован.

**Action:**
1. Mini-spec `X-fix` или `X-fix-N` (если уже не первый fix). Размер ≤10 KB.
2. Точный список нарушений с reference на §спеки
3. Точный fix: что заменить, как должно быть
4. Минимум 1-2 regression теста чтобы не сломалось обратно
5. Handoff Code в **той же сессии** Chat если контекст ещё свежий, иначе compact + новая сессия

**Не делать:**
- Не "ладно, это допустимо" — если spec был serious, fix реальный
- Не finalize спринт с pending regression "потом починим"

### 6.2 Memory leak / performance regression

**Симптом:** Игорь замечает 14GB usage / freeze / "тормозит".

**Action:**
1. Игорь делает Chrome DevTools heap snapshot **до и после** регрессионного действия
2. Сравнение через Comparison view → искать классы с большим Delta
3. Если ясно что класс — find references → искать infinite cycle (обычно useEffect с unstable deps)
4. Hot-fix mini-spec (≤2 KB), patch one useEffect или один helper
5. Apply, retest

**Защита на будущее:** в спеках где есть useEffect / debounce / setTimeout — раздел "memory profile expectation" с явным "no growth after N actions".

### 6.3 Visual regression при unchanged code

**Симптом:** код outwardly не менялся, но UI выглядит хуже после спринта.

**Действия:**
1. Git blame на ключевой компонент — что изменилось
2. Проверь indirect dependencies (CSS variable, palette module, общий хелпер)
3. Если indirect causation — добавить regression test (visual-by-prose: "expect color from featurePalette[type]")

### 6.4 Test silently broken

**Симптом:** test count не вырос как ожидалось, или тесты "passed" но не покрывают что должны.

**Action:**
1. Запросить у Code coverage report для конкретного модуля
2. Проверь что каждый из обязательных acceptance scenarios имеет тест
3. Если тест есть, но проходит при сломанном коде — тест incorrectly written (assert на wrong thing)

---

## 7. Tools для verification — что использует Chat

При acceptance review Chat имеет доступ к:

**`Filesystem:read_text_file` с `head` / `tail` / `view_range`** — для targeted чтения больших файлов. Не надо грузить весь FragmentEditor (62 KB), читай только relevant 50 строк.

**`Filesystem:read_multiple_files`** — для batch чтения нескольких файлов одной операцией. **Внимание:** silently truncates files > ~16 KB. Для больших файлов — read_text_file отдельно.

**`Filesystem:list_directory_with_sizes`** — для проверки size budget после Code's edits.

**`Filesystem:search_files`** — листинг по pattern. **Внимание:** возвращает только paths, не content. Для grep-like поиска по контенту — `copy_file_user_to_claude` + `bash_tool grep -n`.

**`copy_file_user_to_claude` + `bash_tool`** — для grep, search, programmatic анализа. Копирует файл в Claude container, дальше можно использовать любой Linux tool.

**Memory_user_edits** — для записи long-term observations о tools/проекте.

---

## 8. Известные tool limitations

Зафиксированы в `TECH_DEBT.md` категория `TD-TOOLS`. Ключевые:

**T1. `create_file` vs `Filesystem:write_file` (CRITICAL).** `create_file` пишет в Claude container, не на диск Игоря. Возвращает false positive "successfully". Для Windows-пути `C:\Users\Zoman\Desktop\RESplasmide\` использовать ТОЛЬКО `Filesystem:write_file` или `Filesystem:edit_file`.

**T2. `Filesystem:write_file` timeouts на > 20 KB.** Если файл большой — может висеть 4+ минут до timeout. Workaround: restart MCP server (Claude Desktop → Settings → Developer → Restart), retry. Для совсем больших файлов — split на ≤15 KB chunks.

**T3. `Filesystem:read_multiple_files` silent truncation.** Файлы > ~16 KB обрезаются без warning. Workaround: использовать `read_text_file` с `view_range` или `head/tail`.

**T4. `Filesystem:edit_file` requires exact match.** `oldText` должен совпадать byte-to-byte. Workaround: read файл первым (с view_range на нужную секцию), скопировать exact string, потом edit.

**T5. Chrome MCP timeouts в long sessions.** Browser automation tools (`computer`, `tabs_context_mcp`, etc.) консистентно timeout'ятся когда сессия > ~50% context. Workaround: Chrome operations — fresh conversation only.

**T6. bash_tool работает только в Claude container, не на Windows.** Все file operations на машине Игоря — через Filesystem MCP.

---

## 9. Сценарии когда compact действительно нужен

Из CHAT_PLAYBOOK §7, расширено по опыту:

**Обязательно:**
- После Code-финализации спринта (смена режима спека → реализация → приёмка)
- Перед визуальной приёмкой (даже если Code только что отчитался — приёмка отдельная сессия)
- При смене типа задачи (планирование → bugfix → рефакторинг)
- Если userMemories отстают от файлов > 1 minor version

**Полезно но не критично:**
- Перед крупной новой спекой если current use ≥30%
- После debug-сессии с длинными чтениями (heap snapshots, log dumps)

**Не нужно (overhead):**
- Между "написал спеку" и "выдал handoff" — это один ход мысли
- Между атомарными вопросами уточнения по той же спеке
- Сразу после старта новой сессии (нечего компактить)

**Признак передозировки compact:** Игорь делает compact каждые 3-5 сообщений. Это значит контекст слишком быстро забывается. Скорее всего есть "context bloat" в стартовом пакете — слишком много KB читается заранее. Уменьшить пакет.

---

## 10. Связанные документы

- `CHAT_PLAYBOOK_CORE.md` — общий регламент Chat (этот документ — расширение §3)
- `CHAT_PLAYBOOK_APPENDIX.md` — файловая гигиена (§4), антипаттерны (§6), формат ответов (§8)
- `docs/ACCEPTANCE_ALGORITHM.md` — детальная процедура визуальной приёмки
- `docs/_TEMPLATE_SPEC.md` — шаблон спеки
- `TECH_DEBT.md` — категория `TD-TOOLS` для tool limitations
- `BUGS.md` — операционный трекер регрессий
- `RELEASES.md` — журнал по версиям (блок на версию), финализируется при приёмке спринта
- `ANCHORS.md` — фундаментальные решения ⚓

---

**Дата создания:** 29 апреля 2026
**Обновлено:** 01.05.2026 (под новую структуру документации: CHAT_PLAYBOOK_CORE/APPENDIX, RELEASES.md, ANCHORS.md в STOP-фразе и финализации)
**Источник:** систематизация проблем Sprint X / 1.7 / Map-WS / Import Start Screen (апрель 2026)
**Версия документа:** 1.1 — обновление под реструктуризацию документации

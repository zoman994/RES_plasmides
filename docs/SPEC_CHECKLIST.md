# SPEC_CHECKLIST.md — pre-handoff чеклист для спеки

> **Как использовать:** Chat прогоняет этот чеклист **перед** тем как отдать спеку Code (handoff). Если хоть один пункт fail — спека не готова, добираем недостающее.
>
> **Размер:** короткий намеренно. Расширенная логика — `docs/CODE_HANDOFF_PROTOCOL.md` §1.

---

## Architecture & integration

- [ ] **Все mutations к store** перечислены с **каждой UI-точкой вызова**. Не только сам reducer, но и где он триггерится. *(Поймает Sprint X-style баги: store правильный, UI не подключён.)*
- [ ] **Lifecycle paths** покрыты: создание → правка → удаление → re-creation. Не только happy path. *(Поймает V27-style баги: тестировали apply, не тестировали undo applied.)*
- [ ] **useEffect зависимости** stable. Если есть debounce/setTimeout/async — указано как избежать infinite re-render. *(Поймает 14GB leak.)*
- [ ] **Existing call sites** при изменении store shape — список через grep, не "всё что нужно".

## Acceptance scenarios

- [ ] **Negative paths** (что НЕ должно произойти) — минимум 2-3
- [ ] **Lifecycle test** (apply → undo → verify) — минимум 1
- [ ] **Visual criteria** для UI-output в текстовой форме. Не "красивая карта", а "subarc renders с цветом из featurePalette[type]"
- [ ] **Regression coverage** для соседних модулей которые могут сломаться

## Verification commands

- [ ] Точные `npx vitest run <pattern>` команды
- [ ] Manual verification steps если Vitest не покрывает
- [ ] Memory profiling steps если spec затрагивает useEffect/timer

## Spec hygiene

- [ ] Размер 20-30 KB
- [ ] Никаких copy-paste кода >10 строк
- [ ] §0 "Размеры затрагиваемых модулей" — `list_directory_with_sizes` сделан
- [ ] §5 "Предположения" заполнен с источниками и статусом проверки
- [ ] §STOP-условие явно описано
- [ ] Формат отчёта Code упомянут (со ссылкой на CODE_HANDOFF_PROTOCOL §4)

## Handoff message

- [ ] Перечислены **все** файлы которые Code должен прочитать
- [ ] Явная **STOP-фраза** ("после KN остановись, не финализируй PROJECT_STATE/RELEASES/DECISIONS/ANCHORS/BUGS")
- [ ] Запрет на изменение спеки ("docs/SPRINT_<NAME>.md не переписывай")
- [ ] Verification commands перечислены

---

## Если спека incomplete — что делать

**Соблазн:** "это маленький fix, пропущу один пункт".

**Правильное действие:** **переложить fix на Code без спеки**. Если задача настолько маленькая что не оправдывает полную спеку — она маленькая для прямого handoff'а тоже:

> "Fix V27 в EditorPanels.jsx:97 — кнопка ✕ должна revert mutation через `revertMutation(commitId)` reducer. Тест: apply мутацию, нажать ✕, sequence должна вернуться к baseSnapshot. Один файл, ≤30 строк изменений, +2 теста."

Это не спека. Это direct task. И это **окей** для true-мелочей.

**Но:** если ты ловишь себя на "это вроде маленькое, но касается interaction X с Y" — это уже не маленькое. Пиши спеку или не делай.

---

**Last updated:** 01.05.2026 (под новую структуру документации: STOP-фраза включает RELEASES.md и ANCHORS.md)

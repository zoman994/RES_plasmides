# CODE REPORT — Math/Bio аудит + фиксы (сессия 2026-05-28)

> **Для Chat. Транзиентный handoff Code → Chat.** Прочитай, разнеси в канонику
> (BUGS.md OPEN→FIXED ротация, PROJECT_STATE, RELEASES), потом **удали этот файл**.
> Статусы багов уже в `BUGS.md` (на диске). Это — манифест сессии: какие файлы
> тронуты, какие тесты добавлены, как верифицировано.
>
> **НЕ закоммичено** (по решению Игоря — пишем на диск, без git). Все правки уже
> на диске. Готово к коммиту по команде (ровно перечисленные ниже файлы).

---

## Что сделано: math/bio аудит → 6 фиксов, 1 отзыв, 1 отложен

Полный аудит ЖИВЫХ алгомодулей (Tm, sequence-utils, restriction-db, golden-gate,
local-primer-design, orf-detection, codons, domain-detection, predicted-detection,
auto-annotate). Реестр V118–V126 — детали в `BUGS.md`.

| Bug | Статус | Файл фикса | Тест |
|-----|--------|-----------|------|
| V123 overlap/Gibson хвосты + self-closure | ✅ FIXED | `local-primer-design.js` | `local-primer-design-overlap.test.js` (реконструкция ампликонов) |
| V124 Golden Gate rev-хвост (recognition без rc) | ✅ FIXED | `local-primer-design.js` | `primer-tail-orientation.test.js` (Type IIS sim) |
| V125 RE-ligation fwd-хвост (literal) | ✅ FIXED | `local-primer-design.js` | `primer-tail-orientation.test.js` |
| V118 sequence-utils IUPAC complement | ✅ FIXED | `sequence-utils.js` | `iupac-revcomp.test.js` + `sequence-utils.test.js` (переписан) |
| V126 auto-annotate стоп-кодон формула | ✅ FIXED | `auto-annotate.js` | `auto-annotate-stop.test.js` |
| V122 digest аннотации через рез (linearize) | ✅ FIXED | `restriction-db.js` | `restriction-digest.test.js` (+straddle тест) |
| V119 вырожденно-палиндромные RE «double-count» | ❌ ОТОЗВАН — НЕ БАГ | — | — |
| V120 ORF circular wrap | ⏸ ОТЛОЖЕН (feature-sized) | — | — |
| V121 SapI cutOffset (мёртвые метаданные) | ⚪ не трогал (косметика) | — | — |

**Главное:** системный дефект ориентации цепи в `overlapTail` закрыт во ВСЕХ
ветках хвостов (overlap / Golden Gate / RE-ligation / self-closure). Тесты теперь
проверяют биологию (соберётся ли продукт / порежется ли фермент), а не строки.

**Честная коррекция V119:** при попытке фикса эмпирическая проверка показала, что
`findSitesInSequence` использует СОБСТВЕННЫЙ локальный `reverseComplement`
(`restriction-db.js:108-113`, полная IUPAC-таблица), а НЕ sequence-utils-версию.
Двойного счёта нет. Исходный диагноз ошибочно предполагал общий revComp. Отозвано,
причина задокументирована в BUGS.md.

---

## Файлы, тронутые ЭТОЙ сессией (на диске, не закоммичены)

**Код (src):**
- `gui/designer/src/local-primer-design.js` — V123 (overlap split/only/overlapSequence + self-closure) + V124 (GG rev) + V125 (RE)
- `gui/designer/src/sequence-utils.js` — V118 (полная IUPAC `COMPLEMENT_MAP`)
- `gui/designer/src/auto-annotate.js` — V126 (формула последнего кодона)
- `gui/designer/src/restriction-db.js` — V122 (`_shiftAnnotations` split straddling)

**Тесты (новые):**
- `gui/designer/src/__tests__/primer-tail-orientation.test.js` — V124/V125 (Type IIS симулятор дайджеста)
- `gui/designer/src/__tests__/iupac-revcomp.test.js` — V118 + regression guard
- `gui/designer/src/__tests__/auto-annotate-stop.test.js` — V126

**Тесты (изменены):**
- `local-primer-design-overlap.test.js` — V123 biology-invariant + переписаны 2 теста (фиксировали инвертированные хвосты)
- `local-primer-design.test.js` — V123 self-closure хвосты
- `restriction-digest.test.js` — +straddle тест (V122)
- `sequence-utils.test.js` — переписан тест, фиксировавший старое `complement→N`

**Трекеры:**
- `BUGS.md` — V118–V126 записи + статусы (FIXED/ОТОЗВАН/ОТЛОЖЕН)

---

## Верификация

- **Full Vitest: 4094 pass / 17 skip / 0 fail** (425 файлов). pytest не запускался — backend не задет (всё фронтовый JS).
- **`npx vite build`: clean** (только pre-existing warnings DagWorkspace/chunk-size).
- Каждый фикс — TDD: red (тест ловит баг) → green (фикс) → full suite.

---

## Осталось (для Chat/Игоря)

1. **V120** (circular ORF) — отложен: нужен проброс topology через `detectORFs`/`runPredictors` + wrap-координаты аннотаций. Низшая severity. Отдельная задача.
2. **V122 excise-ветка** — `_exciseTwoEnzymes`/`_exciseSameEnzyme` всё ещё дропают straddling-аннотации (lossy, но не corrupting). Split там — отдельная правка.
3. **V121** SapI cutOffset — мёртвые метаданные, фикс не нужен функционально.
4. **pydna-оракул** — не поднимался (тяжёлые Python-deps); вместо него JS-нативный Type IIS симулятор в тестах. Полноценный оракул в backend-pytest — отдельная задача, если нужен.

---

## Контекст: эта сессия шла поверх двух более ранних (тоже не закоммичены)

- **Снос v0.5-верстака** (44 файла, ~404 КБ) — см. `CODE_REPORT_2026-05-28_dead-code.md`.
- **partial seed-extend** (`feature-detection.js` v0.8.4) — см. низ `CURRENT_TASK.md`, ждёт визуальной приёмки.

Плюс в рабочем дереве лежат pre-existing uncommitted-правки от прошлых сессий
(SequenceView wrap-tail, Library, CanvasSkeleton и др.) — НЕ мои, их не трогал.
При коммите моих фиксов их мешать не нужно — коммитить ровно перечисленные выше файлы.

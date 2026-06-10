# SPEC — V105: Wallace → SantaLucia в `primer-derive.js`

**Тип:** C (правка primer-design — алгоритмическая зона §3, реализует Code).
**Версия:** v0.8.3-alpha. **Дата:** 23.05.2026.
**Закрывает:** `BUGS.md` V105 (walkthrough overlap-PCR WT-B-3).
**Решение Игоря (23.05.2026):** «SantaLucia везде, Wallace убиваем как метод расчёта».
**Источник:** `docs/WALKTHROUGH_OVERLAP_PCR_2026_05_23.md` §E — эта спека = вынос §E в отдельный файл, сверена с кодом `primer-derive.js` + `tm-calculator.js`.

---

## §0 Размеры затрагиваемых модулей

| Файл | Размер | Лимит | Примечание |
|---|---|---|---|
| `components/CanvasSkeleton/lib/primer-derive.js` | 6.14 KB | .js 25/20 | запас большой |
| `tm-calculator.js` | ~7 KB | — | эталон, НЕ трогаем |

Декомпозиция не нужна.

---

## §1 Контекст / корень

В проекте сосуществуют две модели Tm:
- `tm-calculator.js` — SantaLucia 1998 NN (ΔH/ΔS nearest-neighbor + поправки соль/Mg²⁺ Owczarzy 2008). Канонический Tm. Экспорт `calcTm(seq)` = `calcTmNN(seq)` (docstring: «Drop-in replacement for all simpleTm/calcTm calls»).
- `primer-derive.js` — локальная `tmEstimate(binding)` (`4·GC + 2·AT`, Wallace). `makePrimer` ставит `tm: tmEstimate(binding)` (единственный callsite `tmEstimate`).

Авто-праймеры overlap-сборки («Auto-собрать» → `deriveAutoPrimers`) получают Tm по Wallace, мимо `tm-calculator.js`. Тот же праймер в редакторе праймера (K13) показывается по NN — **один праймер, два разных Tm в двух местах UI.** Рассинхрон, не просто «грубо».

NN уже используется в `tm-calculator.js`, `operation-pcr-bridge.js`, `assembly-primer-utils.js`. **НЕ проверен грепом** `local-primer-design.js` (v0.5 primer-core) — docstring `operation-pcr-bridge.js` утверждает «tm via tm-calculator (SantaLucia NN)», но это требует подтверждения.

---

## §2 Стратегия

Удалить локальный Wallace из `primer-derive.js`, перевести на канонический `calcTm`. Одна модель Tm на весь проект.

---

## §3 Где задача сядет (связи)

- **`primer-derive.js`** — `tmEstimate` (удалить), `makePrimer` (1 строка). Уже импортирует `reverseComplement` из `'../../../sequence-utils'` — путь `'../../../tm-calculator'` валиден с той же глубины.
- Ничего нового не создаётся. `tm-calculator.js` уже существует, переиспользуется.
- Греп нужен, чтобы убедиться: нет других локальных Wallace-расчётов в primer-путях.

## Scope IN
- `primer-derive.js`: удалить `tmEstimate`; `import { calcTm } from '../../../tm-calculator'`; в `makePrimer` — `tm: tmEstimate(binding)` → `tm: calcTm(binding)`.
- Греп репозитория на Wallace-остатки: паттерны `4 * gc` / `4*gc` / `2 * at` / `2*at`, имена `tmEstimate` / `simpleTm` / `wallace`. Любой найденный локальный Wallace-расчёт Tm → на `calcTm`. Особо проверить `local-primer-design.js`.
- Тесты `primer-derive.js` (`__tests__`): Tm-ассерты сменятся с Wallace-целых на NN-десятичные → обновить под NN.

## Scope OUT
- `tm-calculator.js` — НЕ трогать (канонический эталон).
- Геометрия праймеров (`sequence`/`binding`/`tail`/хвосты) — НЕ трогать.
- UI-формат показа Tm (округление и т.п.) — вне scope.

---

## §4 Архитектурные решения

1. Единственная модель Tm проекта — SantaLucia NN из `tm-calculator.js`. Wallace удаляется как метод расчёта везде, где встречается локально.
2. `calcTm(seq)` принимает строку, возвращает °C (NN, дефолтные условия 50 mM Na⁺ / 250 nM oligo). Drop-in замена для `tmEstimate`.

---

## §5 Side-effects (Code обязан учесть)

- Показываемые Tm авто-праймеров изменятся: Wallace-целые → NN-десятичные (пример из прогона: `asm-fwd-2` `70°` → ~`63°`). **Ожидаемо, не регресс** — в этом смысл правки.
- Тесты, ассертящие конкретные Tm-значения авто-праймеров, **сломаются** — переписать ожидания под NN (вызвать `calcTm` на том же binding и сверять с ним, а не с захардкоженным числом).

---

## §6 Тесты

- `deriveAutoPrimers`: для известного binding `tm` совпадает с `calcTm(binding)` из `tm-calculator.js` (не с Wallace `4·GC+2·AT`).
- Регрессия геометрии: `sequence` / `binding` / `tail` каждого праймера для overlap_pcr-группы из 2 кусков **не меняются** относительно текущего поведения — правка трогает только поле `tm`.
- Обновление существующих Tm-ассертов `primer-derive.js` под NN.

---

## §7 Порядок выполнения

1. Греп репозитория на Wallace-паттерны, зафиксировать список мест.
2. `primer-derive.js`: удалить `tmEstimate`, импорт `calcTm`, правка `makePrimer`.
3. Прочие найденные грепом места — на `calcTm`.
4. Обновить тесты под NN. Полный Vitest + `vite build`.

---

## §8 STOP-условие и формат отчёта

После зелёного полного Vitest + `vite build` clean — **STOP**, отчёт в `CURRENT_TASK.md`: список найденных грепом Wallace-мест и какие правлены; Vitest counters (pass/skip/fail); `vite build`; size budget `primer-derive.js`. Координационные файлы не финализировать.

---

## §9 Запрещённые зоны для Code

`tm-calculator.js`; координационные файлы (`CLAUDE/BUGS/CURRENT_TASK/PROJECT_STATE/DECISIONS/TECH_DEBT/COMPONENT_MAP/CHAT_PLAYBOOK`); `docs/WALKTHROUGH_OVERLAP_PCR_2026_05_23.md`.

---

## §10 Риски

- **R1 — греп пропустит локальный Wallace в неочевидном модуле.** Митигация: грепить и по формуле (`4*gc`/`2*at`), и по именам (`tmEstimate`/`simpleTm`/`wallace`); `local-primer-design.js` проверить явно.
- **R2 — Tm-зависимые тесты вне `primer-derive.test` сломаются.** Митигация: полный Vitest — любой упавший Tm-ассерт переписать под NN, зафиксировать в отчёте.

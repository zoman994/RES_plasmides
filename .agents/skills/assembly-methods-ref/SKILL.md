---
name: assembly-methods-ref
description: Reference content for assembly methods in BodgeGene. Loads when Code plans or implements features related to PCR primer design, junction logic, Gibson/Golden Gate/KLD/RE-ligation workflows, fragment amplification, adaptive overlap, self-closure primers, or merged fragments. Activates on work in local-primer-design.js, assembly-utils.js, golden-gate.js, validate.js, or any *.jsx that handles Assembly/Junction/Primer props.
---

# Справочник методов сборки BodgeGene

Что берём за готовую биологию, чтобы не переизобретать в каждом K-шаге. Полные правила — `bio-invariants` skill, здесь — таблицы и константы.

## Таблица методов

| Топология | Junction type | Метод в UI | Key файл |
|-----------|---------------|------------|----------|
| Linear | overlap | Overlap PCR (OV-PCR) | `local-primer-design.js` |
| Circular | overlap | Gibson Assembly (Gibson) | `local-primer-design.js` |
| Any | golden_gate | Golden Gate | `golden-gate.js` + `local-primer-design.js` |
| Circular + backbone | kld | KLD | `mutagenesis.js` |
| Circular + backbone | ligation | Restriction Cloning (RE) | `restriction-db.js` + `local-primer-design.js` |
| Any | re_ligation | RE лигирование | `restriction-db.js` |
| Circular/Any | overlap | **SLIC** | переиспользует gibson op + overlap-праймеры; отличие — протокол (T4 pol 3′-экзо chew-back, без лигазы in vitro) |
| Any | golden_gate | **MoClo** | переиспользует golden_gate op (Type IIS, дефолт BsaI); стандартизованные 4-нт fusion-сайты |

**SLIC / MoClo (#111, /loop 28.06):** тонкие методы поверх существующих op-kinds — **НЕ новый движок**. Реестр: `CLOSURE_METHODS` (junction-derive) += `slic`,`moclo`; `METHOD_TO_JUNCTION`/`METHOD_TO_OP_KIND` (zone-pieces-to-dag): slic→overlap/gibson, moclo→golden_gate/golden_gate; `defaultEnzymeForMethod`: moclo→BsaI; `META`+`enzymeKeysFor` в CircularizeModal; `validateClosure` (slic как overlap-гомология, moclo как GG internal-site). НЕ в `INTERNAL_METHODS` (kind-пикер дал бы дубли overlap/golden_gate). Выбираются в модалке замыкания.

`chooseStrategy(fragment, junction)` должна учитывать оба аргумента: тип junction **и** topology/backbone-flag фрагмента.

## Overlap длины

По умолчанию overlap = **15 bp** (соседи амплифицируются). При наличии соседа-«без ПЦР» (no-amplification fragment, `needsAmplification === false`) — overlap автоматически **30 bp** (full overlap, так как нельзя добавить тейл к неамплифицируемому соседу).

Если **оба** соседа — «без ПЦР» → warning «overlap невозможен». Исключение: ligation junctions не подчиняются правилу overlap, у них свой RE-сайт на стыке.

## Self-closure для single circular (V24)

Если сборка состоит из **одного** circular фрагмента → это self-closure PCR: праймеры с 15-bp tails, замыкающие конец на начало. Badge в ActionBar: «Режим: Self-closure (+30 bp замыкающий overlap)». Не early-return с пустым primers[].

Фикс в `local-primer-design.js` (Sprint X K6): branch `fragments.length === 1 && circular` перед existing early-return. `purpose: 'self-closure'` на обоих праймерах.

## Tag-aware primer design

`findBindingTagAware()` в `local-primer-design.js`: если 5'-конец фрагмента содержит low-complexity tag (polyG, polyH tract и т.п.), binding region расширяется **за** tag до стабильной sequence. Иначе Tm получится некорректным (low-complexity регионы искажают NN-оценку).

## Tm расчёт

SantaLucia 1998 NN (nearest-neighbor), `tm-calculator.js`. Target Tm для праймеров: **60 °C ± 2**, разница между forward/reverse в паре: ≤ **3 °C**. Это не hard-правило, а signal: если разница >3 °C → отметить в logs/warnings, не молча продолжать.

## KLD-специфика

Требования:
1. Circular topology.
2. Один backbone фрагмент (длина >= остальных, или явно помечен как backbone).
3. Site-directed mutagenesis кон��ракт (точечные/короткие изменения), не переписывание больших регионов.

Primers: **phosphorylated 5'-ends** (упоминается в протоколе), без overlap-tails (это не Gibson).

## RE ligation — двойной digest

`checkDoubleDigest(enzyme1, enzyme2)` проверяет buffer/temperature совместимость по таблице буферов из `restriction-db.js`. Если несовместимы → sequential digest рекомендуется в протоколе, не одновременный.

`checkInsertSites(insertSeq, enzyme1, enzyme2)` ищет **внутренние** сайты тех же ферментов в insert'е → это разрушит insert при digest → warning.

`generateRETail(enzyme)` → tail с protective bases (обычно 4 nt стандартных) + RE site + biological seq. `checkReadingFrame(enzyme)` — для CDS insert'ов, смещает tail-length для сохранения рамки.

## Merged fragments

Склейка Ctrl+Click через **overlap** (не через ligation — см. bio-invariants Правило 3). На выходе — M-блок (merged, `subFragments: [...]`, `needsAmplification: false`).

Merge через Gibson junction — OK, результат амплифицируется как один.
Merge через GG junction — OK, амплифицируется как один.
Merge через **ligation/re_ligation** — блокируется.

## Где добавлять новый метод

Если появляется новый метод сборки (например, MoClo, SLIC):

1. В `chooseStrategy` — новая ветка с topology/junction матчингом.
2. В таблицу выше (обновить этот skill).
3. В AGENTS.md «Методы сборки» (через Chat в следующем спринте).
4. Отдельный primer-design path если отличается от overlap/GG/KLD/RE.
5. Тесты на биологическую корректность (topology requirement, enzyme compatibility).

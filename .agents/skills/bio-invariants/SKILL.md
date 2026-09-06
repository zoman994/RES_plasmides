---
name: bio-invariants
description: Biological safety rails for BodgeGene. Applies whenever Code modifies assembly logic, junction selection, mutagenesis, restriction cloning, Golden Gate, KLD, primer design, enzyme databases, or merged fragment operations. Loads on any work touching golden-gate.js, restriction-db.js, mutagenesis.js, assembly-utils.js, local-primer-design.js, validate.js.
---

# Биологические инварианты BodgeGene

Жёсткие правила, нарушение которых — научная ошибка, не стилистика. Проверяются до написания кода, не в code review.

## Правило 1: GG_ENZYMES и RE_ENZYMES не смешиваются

Два словаря, две разные биологии, два отдельных файла:

- **GG_ENZYMES** (`golden-gate.js`): Type IIS — BsaI, BpiI, BsmBI, BtgZI, SapI. Режут **вне** своего сайта узнавания. Только для Golden Gate.
- **RE_ENZYMES** (`restriction-db.js`): 461 классический фермент Type IIP — REBASE-каталог (`restriction-db-rebase.js`, 459 коммерческих) ⊕ 62 curated override (EcoRI, BamHI, HindIII, DpnII, MboI…); custom-ферменты пользователя накладываются через `effectiveEnzymes()`. Режут **внутри** сайта. Только для restriction-ligation cloning. Type IIS сюда не входят.

**Correct:**
```js
import { GG_ENZYMES } from './golden-gate.js';
const enzyme = GG_ENZYMES.BsaI;
```

**Incorrect:**
```js
// Объединённый lookup — биологически бессмысленно
const allEnzymes = { ...GG_ENZYMES, ...RE_ENZYMES };
```

Если функция принимает имя фермента — она работает ровно с одним словарём. Если оба нужны — два отдельных аргумента/параметра.

## Правило 2: Topology определяет допустимые методы

| Топология | Junction | Метод |
|-----------|----------|-------|
| Линейная | overlap | Overlap PCR |
| Кольцевая | overlap | Gibson Assembly |
| Любая | golden_gate | Golden Gate |
| **Кольцевая + backbone** | kld | KLD |
| **Кольцевая + backbone** | ligation | Restriction Cloning |

**KLD и RE-ligation требуют** circular topology **и** наличие backbone фрагмента. На линейных фрагментах — биологически невозможно. `chooseStrategy` обязан знать контекст фрагмента (topology + backbone flag), не только тип junction.

## Правило 3: Merge через ligation junction невозможен

Ligation junction = вставленный RE-сайт (напр. GAATTC) на стыке. Склейка через ligation = потеря RE-сайта = разрушение restriction cloning.

Если `junction.type === 'ligation' || 're_ligation'` — merge **блокируется** с warning. Не «спрашиваем пользователя», а блокируем.

## Правило 4: Аннотации — 3-level, без `domains[]`

Модель: `region > detail > point`. Всё в одном массиве `annotations[]` с полем `level`. Отдельного `domains[]` не существует.

**Incorrect:**
```js
fragment.domains = [...]; // НЕТ такого поля
```

**Correct:**
```js
fragment.annotations.push({ level: 'detail', type: 'domain', ... });
```

Переменная `domains` в импортёре/парсере — сигнал ошибки. Выносим в `annotations` с `level: 'detail'` до коммита.

## Правило 5: Expert mode always ON

Гейтов «вы уверены?» для биологически корректных операций нет. Разрешаем или блокируем — полутонов нет. Подтверждения остаются только для destructive действий (удаление фрагмента, сброс undo), не для биологически спорных.

## Правило 6: Короткие фрагменты ≥ 18 bp

Фрагмент короче 18 bp не амплифицируется (праймеры длиннее). UI — warning «merge с соседом (Ctrl+Click)», логика сборки — forced merge либо ошибка. Не тихое продолжение с нерабочими праймерами.

## Pre-commit check

Правка assembly / junction / mutagenesis / restriction → пробежать 6 правил. Нарушение → **STOP**, обсудить с Chat до коммита. Это корректность, не стиль.

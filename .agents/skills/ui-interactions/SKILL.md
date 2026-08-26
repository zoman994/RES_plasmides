---
name: ui-interactions
description: UX interaction conventions for BodgeGene. Loads when Code adds or modifies user-facing interactions — buttons, modals, keyboard handlers, drag-and-drop, wizards, ActionBar, QuickStart, ImportDecisionModal, or new workflow entry points. Applies to work in components/*.jsx that introduces new user actions, dialogs, or view modes.
---

# UX-соглашения BodgeGene

Базовый принцип: **не больше двух кликов** до любой операции. Expert mode always ON — нет гейтов «вы уверены?» для биологически корректных операций (см. `bio-invariants` Правило 5).

## Двух-кликовые операции

| Действие | Как |
|----------|-----|
| Добавить фрагмент | Drag из палитры |
| Удалить | Click → Del |
| Редактировать | Double-click |
| Перевернуть | Click → R |
| Склеить (merge) | Ctrl+Click + Ctrl+Click → floating pill |
| Развернуть merged | Double-click |
| Настроить junction | Click junction |
| Переключить view | Ctrl+1/2/3/4/5 |

Если новая операция требует 3+ кликов — что-то не так с дизайном. Либо операцию можно упростить, либо она требует wizard (и тогда идёт через presetMode bypass).

## Клавиши — стандартные соответствия

- `Click` → select
- `Double-click` → edit (FragmentEditor / AnnotationEditor / JunctionEditor)
- `R` → rotate (invert strand)
- `E` → edit (альтернатива double-click для клавиатурного flow)
- `Del` / `Backspace` → delete (selected fragment/annotation)
- `Ctrl+Click` → toggle merge selection
- `Ctrl+C` / `Ctrl+D` — стандартные copy/duplicate (не переопределять)
- `Ctrl+1..5` → view modes (Blocks/Sequence/Map/Racetrack/Flow)

Новая клавиша — только если нельзя уложиться в существующую раскладку. Фиксируется в AGENTS.md при добавлении.

## Модал vs inline

**Модал только для:**
- Multi-step wizards (PlasmidUseWizard, RestrictionCloningWizard, ImportDecisionModal).
- Destructive confirms (hard delete, reset undo history).
- Крупных форм с >5 полями и валидацией (AddFragmentModal).

**Inline для:**
- Одно-двух-полевых правок (переименование, изменение Tm target).
- Toggle-состояний (on/off, mode switcher).
- Выбора из ≤5 опций (радио-кнопки в панели).

Модал всегда закрывается по `Esc` и click-outside, не только по явной кнопке «Закрыть». Фокус при открытии — на первое осмысленное поле, не на кнопку «Закрыть».

## presetMode bypass

Wizard'ы поддерживают `presetMode` для мгновенных actions: «Клонировать» из PlasmidViewer footer пропускает меню выбора режима и сразу идёт в `mode: 'clone'`. Если новый wizard — добавить поддержку preset'а для всех его режимов (не «потом в v1.1»).

Источники preset'а: QuickStart кнопки, PlasmidViewer footer, ImportDecisionModal actions.

## Sticky ActionBar

Появляется **после** расчёта праймеров, prop-driven (`primers.length > 0`). Содержит ровно 4 действия: Протокол / Заказ олигов / GenBank / Завершить сборку. Порядок стабилен — не менять на основе usage statistics, не А/B-тестить.

Badge слева от действий (когда применимо): «Режим: ⟨статус⟩» — например, «Режим: Self-closure (+30 bp замыкающий overlap)» при single-circular сборке (см. `assembly-methods-ref`).

## QuickStart

Появляется при **пустом canvas** (`fragments.length === 0`). 7 workflow actions + каталог SnapGene. Это вход в продукт, не второстепенный helper — внешний вид равен по значимости главному Canvas'у.

При добавлении нового первичного workflow → добавить в QuickStart. Если workflow слишком узкий для первой страницы → не добавлять, пусть пользователь идёт через библиотеку.

## File drop → ImportDecisionModal

Drag-and-drop файла на любое место canvas → `ImportDecisionModal`. Содержание зависит от topology:
- **Circular**: 6 действий (restriction / backbone / mutagenesis / view / library / disassemble).
- **Linear**: 2 действия (view / library).

Новый тип операции с импортированной плазмидой → пункт в этом меню, не отдельный flow «под капотом».

## Breadcrumb: Проект → Сборка

Навигация между Construct view и Flow view через breadcrumb в header. Не через отдельную кнопку «Переключить режим». Breadcrumb остаётся актуальным — при создании multi-step assembly последний элемент обновляется на текущее имя сборки.

## Settings dropdown

Polymerase + primer prefix + прочие «настройки на лету» — в `⚙️ Настройки` dropdown в header (top-full, не обрезается overflow). **Не** в модале, **не** в отдельной странице. Всё что пользователь может захотеть изменить по ходу сессии — в dropdown.

## Pre-commit check для UI правок

1. Операция укладывается в ≤2 клика?
2. Если есть клавиша — из стандартной раскладки (см. таблицу)?
3. Модал/inline выбран по критериям?
4. Wizard поддерживает `presetMode`?
5. Если ActionBar/QuickStart/ImportDecisionModal правится — соблюдён контракт (prop-driven, стабильный порядок, topology-aware)?


# DESIGN_SYSTEM.md — дизайн-система BodgeGene v2

> **Статус:** активный draft, дата 29 апреля 2026. Создан после согласования с Игорем: вариант B (tokens + компоненты + правила), обязательный light/dark, сохраняем концепцию v0.5, перерабатываем визуал. Inspiration: Notion (логика), GitHub (структура), Figma (детали).
>
> **Назначение:** single source of truth для всех дизайн-решений в BodgeGene v0.6+. На него опираются дизайн-сессии (M-A → M-I), реализация Code, Storybook (если будет).
>
> **При расхождении с другими документами** — `ARCHITECTURE_v2.md` побеждает по логике, **этот документ** побеждает по визуалу.
>
> **Эволюция:** документ растёт по мере дизайн-сессий. Каждое новое решение → запись в DECISIONS.md (DEC-DS-NN).

---

## 0. TL;DR

BodgeGene — **информационно-плотный desktop-class инструмент** для биологов. Не lifestyle-app, не enterprise-SaaS. Эстетика: Linear / GitHub / Figma — функциональная плотность, не декоративность. Primary accent — **тёплый янтарь** (биология + bodge-character), нейтральная база — slate. Шрифты: Inter (UI) + JetBrains Mono (sequences). Light + dark обязательны и эквивалентны (не "dark = afterthought").

**Принципы в одной фразе:** каждый пиксель оправдывает себя информацией или affordance'ом. Декорация без функции = шум.

---

## 1. Принципы (immutable ⚓)

**1.1 Information density > airy minimalism.** Биолог хочет видеть много контекста одновременно — features, sequence, primers, junctions, properties. Минимизируем chrome, максимизируем content. Но не SnapGene-tight: читабельность важнее.

**1.2 Functional > decorative.** Никаких градиентов "потому что красиво", никаких теней без depth-reasoning, никаких эмодзи в UI (за исключением emoji в user content типа ⚓ в commit message). Всё что не несёт функцию — убирается.

**1.3 Light = dark.** Не "тёмная тема как опция", а **two equally-considered modes**. Любая иконка, любой компонент проверяется в обоих. Нельзя спроектировать что-то только для light и потом "адаптировать".

**1.4 Сохраняем концепцию v0.5, перерабатываем визуал.** Reaction-class colors на junctions, feature-палитра по типам (CDS/promoter/terminator/RBS), визуальный язык DesignCanvas — концептуально остаются. Конкретные значения цветов / шрифтов / отступов — пересматриваются под общую систему.

**1.5 Desktop-first, mobile not in scope.** BodgeGene — для большого экрана с мышью и клавиатурой. Touch / responsive < 1024px не приоритет. Это окей: SnapGene и Benchling тоже desktop-first.

**1.6 Accessibility — minimum, не headline-feature.** Visible focus rings, контраст ≥ 4.5:1 для текста, keyboard navigation там где имеет смысл. Не пытаемся быть WCAG AAA. Не громко рекламируем — просто делаем разумно.

**1.7 Anti-skeuomorphic.** Не пытаемся имитировать "лабораторный журнал на бумаге", "молекулярный микроскоп", "таблицу Менделеева". Это инструмент, а не симулятор лаборатории. Чистые геометрические формы, прямые линии, читаемые таблицы.

**1.8 Self-deprecating warmth.** В соответствии с .bodge-character: дружелюбные UI-надписи без корпоративного тона, but professional execution. "Создать проект" а не "Создание нового проекта пользователя". Без формализма, но и без жаргона.

---

## 2. Design Tokens

Все токены — CSS variables в `:root` (light) и `[data-theme="dark"]` (dark). Tailwind config — derived от них. Никаких hardcoded hex'ов в компонентах.

### 2.1 Colors

**Базовая нейтральная шкала — `slate`** (Tailwind-compatible, но переопределяется как наша palette):

| Token | Light | Dark | Использование |
|-------|-------|------|---------------|
| `--surface-base` | `#fafaf9` (slate-50) | `#0c0c0d` | Body background |
| `--surface-1` | `#ffffff` | `#171717` | Cards, panels |
| `--surface-2` | `#f5f5f4` | `#1f1f1e` | Inputs, hover states |
| `--surface-3` | `#e7e5e4` | `#2a2a28` | Active hover, secondary cards |
| `--border-subtle` | `#e7e5e4` | `#2a2a28` | Дividers, table rows |
| `--border-default` | `#d6d3d1` | `#3f3f3a` | Card borders, input borders |
| `--border-strong` | `#a8a29e` | `#57574f` | Active borders, selected |
| `--text-primary` | `#1c1917` | `#f5f5f4` | Body text, headings |
| `--text-secondary` | `#57534e` | `#a8a29e` | Muted text, captions |
| `--text-tertiary` | `#78716c` | `#78716c` | Hints, placeholders |
| `--text-disabled` | `#a8a29e` | `#57574f` | Disabled state |

**Accent — теплый янтарь `amber`:**

Выбор обоснован: (а) янтарь = биологический материал (древняя смола, fossilized DNA references), (б) тёплый цвет, не агрессивный, (в) хорошо работает в обоих режимах, (г) отличается от Benchling-blue / SnapGene-orange-red — не имитируем конкурентов, (д) хорошо передаёт "warm bodge character".

| Token | Light | Dark | Использование |
|-------|-------|------|---------------|
| `--accent-50` | `#fffbeb` | `#1c1306` | Backgrounds (subtle highlight) |
| `--accent-100` | `#fef3c7` | `#2a1d09` | Hover backgrounds |
| `--accent-300` | `#fcd34d` | `#a16207` | Borders, dim accent |
| `--accent-500` | `#f59e0b` | `#d97706` | **Primary accent**, buttons, focus rings |
| `--accent-700` | `#b45309` | `#fbbf24` | Hover/active accent, links |
| `--accent-text` | `#78350f` | `#fde68a` | Text on accent backgrounds |

**Semantic colors:**

| Token | Light | Dark | Использование |
|-------|-------|------|---------------|
| `--success-bg` | `#dcfce7` | `#0a2818` | Success states, valid junctions |
| `--success-fg` | `#15803d` | `#86efac` | Success text/icons |
| `--warning-bg` | `#fef3c7` | `#2a1d09` | Warning bg (то же что accent — близкие domain) |
| `--warning-fg` | `#a16207` | `#fbbf24` | Warning text |
| `--danger-bg` | `#fee2e2` | `#2c0d0d` | Error states, invalid |
| `--danger-fg` | `#b91c1c` | `#fca5a5` | Error text/icons |
| `--info-bg` | `#dbeafe` | `#0a1d33` | Info messages |
| `--info-fg` | `#1d4ed8` | `#93c5fd` | Info text |

**Reaction class colors** (для JunctionDNA, DAG edges, MixWorkspace):

Эти цвета консистентны во всех контекстах где встречается reaction. Каждый имеет ramp 100/300/500/700:

| Reaction | Color hex (500) | Light bg | Dark bg | Reasoning |
|----------|----------------|----------|---------|-----------|
| Gibson / overlap | `#10b981` (emerald) | `#d1fae5` | `#022c22` | Зелёный = "natural homology" |
| Golden Gate | `#8b5cf6` (violet) | `#ede9fe` | `#2e1065` | Фиолетовый = "engineered, IIS sites" |
| RE-ligation | `#f97316` (orange) | `#ffedd5` | `#431407` | Оранжевый = "classic, traditional" |
| KLD | `#06b6d4` (cyan) | `#cffafe` | `#083344` | Голубой = "mutagenesis, refresh" |
| Blunt ligation | `#737373` (neutral) | `#f5f5f4` | `#262626` | Серый = "neutral, simple" |
| Overlap PCR | `#10b981` (emerald) | — | — | Тот же что Gibson (homology-based) |
| PCR amplify | `#3b82f6` (blue) | `#dbeafe` | `#0a1d33` | Синий = "amplify/copy" |

**Feature class colors — A+v2 «warm sepia + 4 fixes»** (для PartBlock на canvas, аннотаций в Container Window, plasmid arc/MiniMap fills).

Approved Игорем 02.05.2026 после визуального ревью M-B.2 (см. `docs/design_assets/feature-palette-comparison.html` — A vs A+v2 vs B vs C side-by-side). Сохраняем v0.5 desaturated «paper-background» эстетику, но с 4-мя точечными правками + per-name shade-вариацией.

**Stroke (общий для всех арок):** `#3A2F1F` (warm sepia), сохраняется из v0.5.

**Base palette (15 типов + misc):**

| Feature type | Light hex | Изменение vs v0.5 |
|--------------|-----------|-------------------|
| CDS | `#B0C84A` | ↑ ярче (был `#C8D570`) |
| promoter | `#FFC400` | ↑ насыщенный янтарь, отделить от ori (был `#F2C84B`) |
| ori (rep_origin) | `#E8B333` | = (тот же) |
| terminator | `#D97B3B` | = (тот же) |
| resistance | `#D9836B` | ⇒ коралл, ушёл из зелёного кластера (был `#9BC07C`) |
| reporter | `#5DA5C4` | ⇒ sky-cyan, ушёл из зелёного — теперь зелёный только у CDS (был `#7CB49E` мятный) |
| LTR | `#ECB383` | = |
| enhancer | `#F2CDA9` | = |
| signal (RBS / sig_peptide / polyA) | `#B8AA8A` | = |
| tag (FLAG/HA/Myc/V5) | `#E091A2` | = |
| his (6×His/GST/MBP/SUMO) | `#B884B8` | = |
| linker (GS-linker/TEV/T2A/NLS) | `#C4B8A8` | = |
| primer_bind | `#9EBAD9` | = |
| operator | `#6DA4C4` | = |
| cap (CAP/CRP/GATA bind) | `#A5CFD5` | = |
| misc_feature | `#EEE7D5` | = (ivory, never gray) |

**Dark-mode варианты** — в текущей итерации не введены отдельной таблицей (M-B.2 deferred). Палитра приемлемо читается на обеих темах; конкретные dark-overrides — через `[data-theme="dark"]` CSS-vars в будущей дизайн-сессии после визуального тестирования на тёмном.

**Shade-by-name (M-B.2 follow-up).** Plasmid-arc consumers (`PlasmidMap` + `PlasmidMiniMap`) применяют `featureColorShaded(type, name)` → base hex со сдвигом в HSL по детерминированному хешу canonical-key:
- lightness ±10%, hue ±6° (saturation сохраняется)
- три CDS / два promoter / два resistance на одной плазмиде получают видимо разные оттенки в рамках одного hue
- семейство сохраняется (биолог сразу читает «несколько CDS», просто разных)

**Canonical-key collapse.** Перед хешем имя пропускается через `canonicalFeatureKey(name)`:
- `AmpR` ≡ `ApR` ≡ `bla` ≡ `TEM-1` → один canonical `bla` → одинаковый shade (один underlying ген = один цвет)
- `KanR` ≡ `NeoR` ≡ `nptII` ≡ `aphA` → `nptII`
- `pUC ori` ≡ `ColE1` ≡ `pBR322 ori` → `pMB1`
- ~30 entries покрывают типичные synonyms (resistance / promoters / origins / tags / fluorescent proteins). Полный список — `gui/designer/src/feature-palette.js::CANONICAL_FEATURE_KEYS`. Расширяется при появлении новых синонимов из реальных файлов.

Chip-list consumers (`AnnotationEditor`, `FileSummaryCard`, `SequencePane`, OverviewTab) используют `featureColor` (base без shade) — там per-name shade-вариация была бы шумом.

### 2.2 Typography

**Шрифты:**

```css
--font-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Menlo', 'Consolas', monospace;
```

Inter — для всего UI (читабельный sans-serif с хорошими цифрами для числовых данных).
JetBrains Mono — для DNA/RNA sequences, кода, IDs. Хорошо различает 0 vs O, 1 vs l vs I.

**Type scale** (минимально, без fluid-typography сейчас):

| Token | Size | Line height | Weight | Use |
|-------|------|-------------|--------|-----|
| `--text-xs` | 11px | 16px | 400 | Меtadata, captions, tiny labels |
| `--text-sm` | 12px | 18px | 400 | Secondary text, table cells, badges |
| `--text-base` | 13px | 20px | 400 | Body, default UI text |
| `--text-md` | 14px | 22px | 400/500 | Emphasized body, buttons, inputs |
| `--text-lg` | 16px | 24px | 500 | Subheadings, panel titles |
| `--text-xl` | 20px | 28px | 500 | Section titles |
| `--text-2xl` | 24px | 32px | 600 | Page titles |
| `--text-3xl` | 32px | 40px | 600 | Hero titles (только стартовый экран) |

Note: 13px как default — это GitHub/Linear плотность. Не 16px (Notion) — у нас больше контента на экран.

**Mono scale:**

```
--text-mono-sm: 11px / 16px;   /* Sequence в hover-tooltip */
--text-mono-base: 12px / 18px; /* Sequence в основных view */
--text-mono-lg: 14px / 20px;   /* Sequence в больших sequence-view */
```

Mono — всегда weight 400. Не 500. Bold mono читается хуже.

**Font weights:**

Используем только три:
- `400` regular — для всего основного
- `500` medium — для emphasis, headings, labels
- `600` semibold — только для page-titles

Никаких 700/800/900. Никаких 300 (тонкий выглядит плохо в dark mode).

**Letter spacing:**

- UI text: `0` (default Inter)
- Mono sequences: `0.025em` (чуть разреженные нуклеотиды для читабельности)
- ALL CAPS labels (если используем — редко): `0.05em`

### 2.3 Spacing

Базовая единица — **4px** (стандарт Tailwind / большинство систем).

```
--space-0: 0;
--space-1: 4px;     /* Минимальный gap между inline-элементами */
--space-2: 8px;     /* Default padding inputs, gap кнопок */
--space-3: 12px;    /* Card padding inner */
--space-4: 16px;    /* Section gap */
--space-5: 20px;
--space-6: 24px;    /* Большой section gap */
--space-8: 32px;    /* Между крупными зонами */
--space-12: 48px;   /* Hero spacing */
--space-16: 64px;
```

**Container widths:**
- `--container-sm`: 640px (narrow modals)
- `--container-md`: 768px (forms)
- `--container-lg`: 1024px (settings panels)
- `--container-xl`: 1280px (default fullscreen)
- Без `2xl/3xl` — мы desktop-first, заполняем доступное пространство

### 2.4 Border radius

```
--radius-sm: 3px;      /* Inputs, tags, small badges */
--radius-md: 6px;      /* Buttons, cards, panels (DEFAULT) */
--radius-lg: 8px;      /* Modals, dialogs */
--radius-xl: 12px;     /* Large containers, hero panels */
--radius-pill: 9999px; /* Pills, primer-tags, status badges */
```

Note: 6px как default. Не 4px (слишком острый), не 8px (слишком "Stripe-like soft"). 6px — Linear/Figma standard.

### 2.5 Shadows

Минималистичные. Никаких dramatic shadows. Light mode имеет subtle elevation, dark mode — почти нет (используется border вместо).

```
--shadow-sm:  0 1px 2px rgba(0,0,0,0.05);                        /* Inputs subtle depth */
--shadow-md:  0 2px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);  /* Cards */
--shadow-lg:  0 8px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04); /* Dropdowns, popovers */
--shadow-xl:  0 16px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06);/* Modals */
--shadow-focus: 0 0 0 3px rgba(245, 158, 11, 0.25);              /* Focus ring (accent) */
```

**Dark mode:**

```
--shadow-sm:  0 1px 2px rgba(0,0,0,0.3);
--shadow-md:  0 2px 4px rgba(0,0,0,0.4);
--shadow-lg:  0 8px 16px rgba(0,0,0,0.5);
--shadow-xl:  0 16px 32px rgba(0,0,0,0.6);
--shadow-focus: 0 0 0 3px rgba(251, 191, 36, 0.35);
```

Note: dark mode shadows менее выражены, потому что depth там создаётся surface-color difference (surface-1 vs surface-2), не тенями.

### 2.6 Motion

Animation timings — короткие. Биолог не должен ждать.

```
--motion-instant: 0ms;        /* Hard state changes без transition */
--motion-fast: 100ms;         /* Hover states, focus */
--motion-base: 150ms;         /* Default для большинства transitions */
--motion-slow: 250ms;         /* Drawer slide-in, modal fade */
--motion-slowest: 400ms;      /* Только fullscreen-переходы между views */

--ease-default: cubic-bezier(0.16, 1, 0.3, 1);   /* "easeOutExpo" — natural deceleration */
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

**Что анимируется:**
- Color transitions (hover, focus): `150ms ease-out`
- Drawer / modal open/close: `250ms ease-default`
- Fullscreen view transitions: `400ms ease-default` (slide horizontal)
- DAG node positions (когда меняется layout): `300ms ease-default`
- Hover scale на cards: НЕ используем (раздражает)

**Что НЕ анимируется:**
- Border color на input focus (instant — feels responsive)
- Cursor blink (browser default)
- Sequence updates (instant — нужна точность)
- Anything связанное с data input (форма не "плавно появляется" — instant)

**Reduced motion:**

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0ms !important; transition-duration: 0ms !important; }
}
```

Безусловный override. Уважаем accessibility setting.

### 2.7 Z-index scale

```
--z-base: 0;
--z-raised: 10;        /* Cards, hover states */
--z-sticky: 20;        /* Sticky headers, top bar */
--z-overlay: 30;       /* Drawer backdrop */
--z-drawer: 40;        /* Drawer content */
--z-modal-backdrop: 50;/* Modal backdrop */
--z-modal: 60;         /* Modal content */
--z-popover: 70;       /* Tooltips, dropdowns */
--z-toast: 80;         /* Toasts/notifications */
--z-debug: 9999;       /* Debug overlays (только в dev) */
```

---

## 3. Components

Базовые UI-компоненты. Реализация — React + Tailwind, но описание здесь — agnostic.

### 3.1 Button

**Variants:** `primary` | `secondary` | `ghost` | `danger` | `link`

**Sizes:** `sm` (24px) | `md` (32px) | `lg` (40px)

**Anatomy:**
- Padding: `sm` = 8px/12px, `md` = 8px/16px, `lg` = 12px/20px
- Border-radius: `--radius-md` (6px)
- Font: `--text-sm` weight 500 (sm), `--text-md` weight 500 (md/lg)
- Icon (optional): 16px (sm), 16px (md), 20px (lg), gap 6px от текста

**States:**
- Default
- Hover: background shift (one shade darker for primary, surface-2 for ghost)
- Active: pressed (background -1 shade)
- Focus: visible ring `--shadow-focus`
- Disabled: 50% opacity, cursor not-allowed
- Loading: spinner вместо иконки, текст dim'ed

**Variants colors (light):**
```
primary:    bg=accent-500, text=white, hover=accent-700
secondary:  bg=surface-2, text=text-primary, hover=surface-3, border=border-default
ghost:      bg=transparent, text=text-primary, hover=surface-2
danger:     bg=danger-fg, text=white, hover=darker
link:       bg=transparent, text=accent-500, hover=accent-700, underline-on-hover
```

**Examples in BodgeGene:**
- "Создать проект" (стартовый экран): `primary lg`
- "Открыть .bodge" (стартовый): `secondary lg`
- "+ Импорт файла" (DAG topbar): `secondary md` с иконкой
- "Завершить сборку" (Mix Workspace): `primary md`
- "Discard draft": `ghost md`
- "Delete container?" (confirm dialog): `danger md`

**Don'ts:**
- ❌ Кнопки без явного label (только иконка) кроме toolbar/topbar — accessibility
- ❌ Длинные label'ы (> 4 слова) — переформулировать
- ❌ ВЕРХНИЙ РЕГИСТР как стиль — не наш visual language

### 3.2 Input

**Variants:** `text` | `textarea` | `number` | `search` | `sequence` (mono!)

**Sizes:** `sm` (28px) | `md` (32px, default) | `lg` (40px)

**Anatomy:**
- Padding: 6px/10px (sm), 8px/12px (md), 10px/16px (lg)
- Border: `1px solid --border-default`
- Border-radius: `--radius-md`
- Font: `--text-md`. **Sequence variant — `--font-mono` `--text-mono-base`**
- Background: `--surface-1`

**States:**
- Default
- Hover: border `--border-strong`
- Focus: border `--accent-500` + ring `--shadow-focus`, NO background change
- Disabled: bg `--surface-2`, text `--text-disabled`
- Invalid: border `--danger-fg`, helper-text `--danger-fg`

**Sequence input** — особенность:
- Font-family: `--font-mono`
- Letter-spacing: `0.025em`
- Auto-uppercase для DNA (display, не storage)
- Sanitize on paste (только IUPAC)
- Inline IUPAC validation (red highlight invalid chars)

**Helper text:** ниже инпута, `--text-xs`, `--text-secondary` (default) или `--danger-fg` (error).

### 3.3 Select / Dropdown

Используем custom (не browser native) для consistent look.

**Anatomy:**
- Trigger выглядит как input но с chevron-down icon (16px, `--text-tertiary`)
- Dropdown menu: `--surface-1`, border `--border-default`, `--shadow-lg`, `--radius-md`
- Item: 32px height, padding 8px/12px, hover bg `--surface-2`
- Selected item: bg `--accent-50`, text `--accent-text`, checkmark icon справа
- Max-height: 320px, scroll при превышении
- Search input в dropdown: автоматически если ≥ 10 items

**Examples:**
- Reaction class в Mix Workspace: select с reaction-class color icons
- Enzyme picker в Golden Gate: select с long list + search
- Origin select в Importer: 6-7 origin options

### 3.4 Modal / Dialog

**Sizes:** `sm` (480px) | `md` (640px, default) | `lg` (800px) | `xl` (1024px) | `fullscreen` (95vw × 90vh)

**Anatomy:**
- Backdrop: rgba(0,0,0,0.4) light / rgba(0,0,0,0.6) dark
- Container: `--surface-1`, `--radius-lg`, `--shadow-xl`, max-height 90vh (fullscreen — фиксированно 90vh)
- Header: padding 20px, title `--text-lg` weight 500, close-icon (16px) top-right
- Body: padding 20px, scroll если нужно
- Footer: padding 12px/20px, border-top `--border-subtle`, buttons right-aligned, gap 8px
- Animation: `250ms ease-default` fade-in + scale 0.95 → 1
- **Fullscreen variant:** скруглённые углы `--radius-lg`, padding выше (16px/16px), backdrop opacity 0.5 / 0.7 (более тёмный для read-only embedded views)

**Keyboard:**
- Escape closes (если не destructive)
- Tab cycles within modal (focus trap)
- Enter triggers primary action

**Examples:**
- Settings (md)
- Container picker (md)
- Confirmation dialogs (sm)
- **Cross-project import — fullscreen** (DAG view проекта-донора в read-only режиме, см. ARCHITECTURE_v2.md §3.4)

**Don'ts:**
- ❌ Modals на modals (max 1 layer)
- ❌ Modal'ы для основной работы кроме fullscreen-варианта (fullscreen — для read-only embedded experiences типа cross-project picker)

### 3.5 Drawer / Side panel

**Variants:** `right` (default) | `left` (для side-list)

**Sizes:** `narrow` (320px) | `default` (400px) | `wide` (480px)

**Anatomy:**
- Slide-in animation: `250ms ease-default`
- Backdrop: только для overlay-режима (по default — drawer pushes content, не overlays)
- Header: 48px высота, padding 12px/16px, title left, close-icon right
- Body: scroll, padding 16px
- Border: `1px solid --border-default` со стороны открытия

**Pinning:**
- Drawer'ы могут быть pin'нутыми (всегда видны) или collapsible
- В Mix Workspace Primer Pool drawer — pinnable
- В Container Window Commit history — pinnable

**Examples:**
- Primer Pool drawer (right, default)
- Commit history (right, default)
- Side-list контейнеров в DAG (left, narrow)
- Annotations side-panel (right, default)

### 3.6 Dropdown menu (context menus)

**Anatomy:**
- Trigger: button или right-click
- Menu: `--surface-1`, `--shadow-lg`, `--radius-md`, min-width 160px
- Item: 32px, padding 6px/12px
- Separator: 1px `--border-subtle`, margin 4px/0
- Icon (optional): 16px left, gap 8px
- Shortcut (optional): right-aligned, `--text-xs`, `--text-tertiary`

**Sub-menus:** flyout right на hover, 100ms delay before open

**Examples:**
- Right-click контейнера на DAG: Use in mix / PCR / Digest / Duplicate / Delete / Rename / Tag
- Topbar меню "Меню": Settings / Library / Importer / Primer Pool / Export

### 3.7 Badge / Tag

**Variants:** `neutral` | `accent` | `success` | `warning` | `danger` | `info`

**Sizes:** `sm` (20px) | `md` (24px)

**Anatomy:**
- Padding: 2px/8px (sm), 4px/10px (md)
- Border-radius: `--radius-pill` (полностью круглые края)
- Font: `--text-xs` weight 500 (sm), `--text-sm` weight 500 (md)
- Optional dot indicator: 6px circle, 4px gap

**Removable:** добавляется ✕ icon (12px) с padding-left 4px, hover background. Click — remove handler.

**Examples:**
- Origin badge на контейнере: `accent` "imported"
- Topology badge: `neutral` "circular" / "linear"
- Reaction class на DAG ребре: соответствующий reaction color
- Primer tag: `neutral` removable
- Validation status на junction: `success`/`warning`/`danger`

### 3.8 Card / Panel

Базовый container.

**Anatomy:**
- Background: `--surface-1`
- Border: `1px solid --border-default`
- Border-radius: `--radius-md`
- Padding: 12px (default), 16px (large), 8px (compact)
- Shadow: `--shadow-sm` (default), нет (flat variant), `--shadow-md` (raised на hover)

**Header (optional):**
- Padding 8px/12px, border-bottom `--border-subtle`
- Title `--text-md` weight 500
- Right slot для actions (kebab menu, close button)

**Examples:**
- Container preview cards (DAG side-list)
- Primer cards (Primer Pool drawer)
- Library entry cards
- Recent project cards (стартовый экран)

### 3.9 List item

Для списков: containers, primers, library entries, recent projects.

**Heights:**
- `compact` — 32px
- `default` — 40px
- `comfortable` — 56px (для primers/containers с метаданными)

**Anatomy:**
- Padding: 6px/12px (compact), 8px/12px (default), 12px/16px (comfortable)
- Hover bg: `--surface-2`
- Selected bg: `--accent-50`, border-left 2px `--accent-500`
- Border-bottom: `1px solid --border-subtle` (между items)

**Slots:**
- Left: optional icon/avatar (16px / 20px / 24px)
- Main: title + optional subtitle/metadata
- Right: optional badges, actions, kebab menu

**Examples:**
- DAG side-list контейнеров: comfortable, иконка topology, title=name, subtitle=length+ends, right=tags
- Primer Pool drawer: default, title=name, subtitle=Tm + length, right=usage count
- Recent projects: comfortable, title=project name, subtitle=updated date

### 3.10 Toast / Alert

Для feedback и уведомлений.

**Anatomy:**
- Width: 320px (mobile) / 400px (desktop)
- Padding: 12px/16px
- Border-radius: `--radius-md`
- Border-left: 4px по semantic color
- Icon (16px) left, content right
- Close-icon top-right
- Auto-dismiss: 5s (success/info), 8s (warning), manual only (error)

**Variants:** `info` (default) | `success` | `warning` | `error`

**Position:** bottom-right (не блокирует UI)

**Examples:**
- "Проект сохранён" — success, 3s
- "Junction'ы не валидируются" — warning, 8s
- "Ошибка парсинга .dna" — error, manual

### 3.11 Tooltip

Для пояснений на hover (DAG nodes, badges, icon-only buttons).

**Anatomy:**
- Background: `--text-primary` (inverted — dark в light mode, light в dark mode)
- Text: contrast color
- Padding: 4px/8px
- Border-radius: `--radius-sm`
- Font: `--text-xs`
- Arrow: optional, 4px triangle
- Delay: 500ms before show, instant hide

**Example uses:**
- Topology icon → "Circular plasmid, 5421 bp"
- Origin badge → "Imported from pUC19.dna on 28 Apr 2026"
- Disabled button → reason for disable

### 3.12 Toolbar

Для top of fullscreens (под App topbar) и contextual actions.

**Anatomy:**
- Height: 40px
- Padding: 4px/12px
- Background: `--surface-2` (subtly differentiated от content)
- Border-bottom: `1px solid --border-subtle`
- Buttons: `sm` size, gap 4px
- Separators: 1px vertical line `--border-default`, height 24px, margin 4px/8px

**Examples:**
- Container Window: view-mode toggles (Circular / Linear / Sequence) + zoom + translation overlay toggle
- Mix Workspace: view-mode toggles + reaction-class indicator + validate button + commit button
- DAG: filter toolbar + layout button + multi-select tools

### 3.13 Breadcrumb

В App topbar для stack-навигации.

**Anatomy:**
- Items separated by chevron-right (12px, `--text-tertiary`)
- Item: button-link style, hover underline
- Current item: bold, no link
- Font: `--text-sm`

**Example:** `Project ▸ Mix Workspace ▸ Primer Pool` (current = bold)

---

## 4. Domain Components (BodgeGene-specific)

Компоненты, которые встречаются только в нашем приложении.

### 4.1 ContainerNode (узел DAG)

Контейнер на DAG canvas.

**Default state:**
- Rectangle: 160px × 64px (default), может расти от текста
- Border-radius: `--radius-md`
- Background: `--surface-1`
- Border: `2px solid --border-default`
- Shadow: `--shadow-sm`

**Anatomy:**
- Top: title `--text-md` weight 500, ellipsis if long
- Mid: metadata `--text-xs` (length + topology indicator)
- Bottom: optional badges (origin, tags)
- Topology indicator: circular icon (○) или linear icon (—) сразу после имени, 12px
- Ends visualization (для linear): два маленьких "tongue" слева и справа, цвет от overhang

**States:**
- Selected: border `--accent-500`, ring `--shadow-focus`
- Hover: border `--border-strong`, shadow `--shadow-md`
- Multi-selected: same as selected

**Variants:**
- Linear: ends shown, optional overhang sequence в hover-tooltip
- Circular: no ends, "○" indicator
- Amplicon: subtle "PCR" tag in corner

### 4.2 ProjectCommitNode (рёбра DAG)

Промежуточный узел на DAG, представляющий ProjectCommit.

**Anatomy:**
- Diamond shape (rotated square): 32px × 32px
- Background: reaction-class color (одна из gibson/gg/re/kld/blunt/pcr)
- Border: `2px solid` darker variant of same color
- Inner icon (12px): уникальный per type (двойная стрелка для mix, ножницы для digest, copy icon для clone)
- Label: ниже узла, `--text-xs`, semantic name ("Gibson", "PCR", "Digest")

**Edges:**
- Input edge: from container to commit-node, solid line, color = reaction-class
- Output edge: from commit-node to container, solid line + arrow head

### 4.3 PartBlock (в Mix Workspace)

Контейнер как фрагмент в Mix Workspace canvas. **Переиспользуем v0.5 PartBlock.jsx**, обновляем стили под новые tokens.

Уже существующая anatomy сохраняется. Изменения:
- Borders: используем `--radius-md`, не текущее значение
- Colors: feature class colors из §2.1
- Hover/select: `--shadow-focus` для selected
- Font: `--font-ui` `--text-sm` для labels, `--font-mono` `--text-mono-sm` для sequence

### 4.4 JunctionDNA (визуализация стыка)

**Переиспользуем v0.5 JunctionDNA.jsx**, обновляем под новые tokens.

Особенности:
- Background panel при expanded: `--surface-2`, `--radius-md`, padding 12px
- Sequence rendering: `--font-mono` `--text-mono-sm`
- Tail (overlap): teal-ish color (`--accent-300`-equivalent для tails)
- Binding region: `--text-primary` в bold weight 500
- Match bars: `--accent-500` thin lines

Цвета overhang/tail/binding должны быть консистентны с reaction-class.

### 4.5 EndsBadge (концы контейнера)

Маленький UI-element на ContainerNode (DAG) и в Container Window header.

**Visual:**
- Linear: пара "tongue" иконок по краям, color по типу (sticky 5'/3' = colored, blunt = neutral)
- Circular: chain-link icon (○-shaped)
- Hover tooltip: показывает overhang sequence (5 nt) или "Blunt" / "Circular"

**Examples:**
```
[5'──ATCG──3']  linear sticky 5' overhang
[5'    blunt    3']  linear blunt
[──○ circular ○──]   circular
```

### 4.6 PrimerCard (в Primer Pool)

Card для отображения primer в drawer / standalone.

**Anatomy (default mode):**
- 64px height card
- Padding 8px/12px
- Title (name): `--text-sm` weight 500
- Sequence preview (mono, truncated 5'-end + "...": `--font-mono` `--text-mono-sm` `--text-secondary`)
- Right: Tm badge (small), origin icon, usage count

**Anatomy (full mode, в standalone Primer Pool):**
- 96px height
- + GC%, length
- + Last used (relative date)
- + tag chips inline

### 4.7 AnnotationStrip (в Container Window sequence view)

Горизонтальная полоска под sequence, показывающая annotations поверх позиций.

**Visual:**
- Strip height: 16px (compact) / 24px (default)
- Annotation rect: feature-class color, border-radius `--radius-sm`
- Label inside (если помещается): `--text-xs` weight 500, white text on coloured bg

### 4.8 ReactionClassPicker

Picker для выбора reaction class в Mix Workspace.

**Visual:**
- 6 option-cards в row (Gibson / GG / RE / KLD / Blunt / Overlap-PCR)
- Каждая card: 80px × 80px, reaction-class color background, icon 24px, name `--text-xs`
- Selected: border 2px `--accent-500`, ring
- Hover: shadow `--shadow-md`

---

## 5. Layout patterns

### 5.1 Fullscreen layout

Базовый layout всех фулскринов.

```
┌─────────────────────────────────────────────────┐
│ App topbar (48px)                               │
├─────────────────────────────────────────────────┤
│ Toolbar (40px, optional)                        │
├──────────┬──────────────────────────────────────┤
│ Side-    │                                      │
│ panel    │ Main content (scrollable)            │
│ (drawer) │                                      │
│ optional │                                      │
└──────────┴──────────────────────────────────────┘
```

**Variants:**
- DAG: side-list left + main DAG canvas + Primer Pool drawer right (optional)
- Container Window: main sequence + annotations side-panel right + commit history drawer right (overlay)
- Mix Workspace: main canvas + Primer Pool drawer right (optional)
- Library / Importer / Primer Pool standalone: main + filters left, no drawer

### 5.2 Modal layout

```
┌─────────────────────────────┐
│ ❌ Title                     │  ← header
├─────────────────────────────┤
│                             │
│ Body content (scrollable)   │
│                             │
├─────────────────────────────┤
│            [Cancel] [OK]   │  ← footer
└─────────────────────────────┘
```

### 5.3 Drawer layout

```
┌──────────────┐
│ Title    [×] │  ← 48px header
├──────────────┤
│              │
│ Body         │
│ (scrollable) │
│              │
├──────────────┤
│ Footer       │  ← optional sticky actions
└──────────────┘
```

---

## 6. Iconography

Используем **lucide-react** (уже в стеке v0.5). Не используем emoji в UI.

**Размеры:** 12px / 14px / 16px (default) / 20px / 24px

**Stroke width:** 1.5px (lucide default) — не меняем

**Color inheritance:** иконки наследуют `currentColor` от parent text (использовать `--text-secondary` для muted)

**Discouraged:**
- ❌ Emoji в кнопках, заголовках, меню (иконки lucide вместо)
- ❌ Цветные иконки кроме semantic (success-checkmark зелёный, error-X красный)
- ❌ Microsoft-style icons (Office UI Fabric)
- ❌ Material icons mixed with lucide (consistency)

**Domain icons mapping (часть, расширяется):**
- Container linear: `Minus` или custom SVG
- Container circular: `Circle` или `RefreshCw` (для visibility)
- Mix operation: `Combine` / `Merge`
- PCR: `Copy` или custom
- Digest: `Scissors`
- Library: `Library`
- Importer: `Upload`
- Settings: `Settings`
- Save: `Save`
- Search: `Search`
- Filter: `Filter`
- Back: `ChevronLeft`
- Drawer toggle: `PanelRight`/`PanelLeft`
- More actions (kebab): `MoreVertical`
- Ends/overhang: custom SVG (нужно нарисовать)
- Reaction class indicators: custom SVG per type

---

## 7. Accessibility

Минимум который мы соблюдаем:

**7.1 Focus rings.** Каждый interactive element получает visible focus ring (`--shadow-focus`) на keyboard focus. Не используем `outline: none` без replacement.

**7.2 Color contrast.** Текст на background ≥ 4.5:1. Большой текст (≥18px or 14px+bold) ≥ 3:1. Проверяем в обоих режимах.

**7.3 Keyboard navigation.**
- Tab cycles через interactive elements в visual order
- Escape закрывает modals/drawers
- Enter triggers primary button
- Стрелки для навигации в lists/dropdowns
- Cmd/Ctrl+S для save

**7.4 ARIA labels.** Icon-only buttons ОБЯЗАТЕЛЬНО имеют `aria-label`. Modal'ы — `role="dialog"` + `aria-modal="true"`.

**7.5 Reduced motion.** `prefers-reduced-motion: reduce` отключает все animations.

**7.6 Не делаем:**
- Polly screen-reader optimization (не наша audience)
- High-contrast mode (полагаемся на dark mode + standard contrast)
- AAA color contrast (AA достаточно для нашего use case)

---

## 8. Dark mode

**Все компоненты ОБЯЗАТЕЛЬНО проверяются в обоих режимах.**

### 8.1 Tooling

Реализация — стандартный стек React + Tailwind 4:

**Базовые слои:**
- **CSS variables как single source of truth.** Все цвета токенов в `:root` (light) и `[data-theme="dark"]` (dark). Никаких hardcoded hex'ов в компонентах.
- **Tailwind 4** в `selector`-mode: `darkMode: ['selector', '[data-theme="dark"]']`. Это позволяет использовать `dark:` префиксы в JSX, синхронизированные с CSS variables.
- **`next-themes`** (~3 KB, Vite-совместим, не требует Next.js) для управления режимом: чтение `prefers-color-scheme`, переключение через `useTheme()` hook, persist в localStorage. Дефакто стандарт для React + Tailwind в 2025-2026.
- **lucide-react** для иконок — `currentColor` inheritance работает естественно с обоими темами.

**Минимальная имплементация:**

```jsx
// app entry
import { ThemeProvider } from 'next-themes';

<ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
  <App />
</ThemeProvider>

// theme toggle компонент
import { useTheme } from 'next-themes';
const { theme, setTheme } = useTheme();
```

```css
/* tokens.css */
:root { --surface-1: #ffffff; ... }
[data-theme="dark"] { --surface-1: #171717; ... }
```

**Не используем:**
- ❌ shadcn/ui — отличная штука, но imposes готовые компоненты с готовым визуалом. У нас своя дизайн-концепция. Можно посмотреть на их CSS-vars approach как на референс, но не копировать компоненты.
- ❌ Material UI / Chakra / Mantine — imposed visual language, тяжёлые.
- ❌ Свой 30-строчный hook вместо next-themes — решённая проблема, не изобретаем велосипед.

### 8.2 Storage стратегия (важная архитектурная граница)

**Persistent project data** (containers, commits, primers, library) → IndexedDB / `.bodge` ZIP.

**Volatile UI preferences** (theme, drawer-open-states, DAG viewport zoom, recently-toggled side-panels) → **localStorage**.

**Reasoning:** один и тот же `.bodge` файл может открываться разными людьми (отправил коллеге). Theme — user-level настройка, не project-level. Не должна сохраняться в файле проекта. То же про drawer state — это персональная привычка работы.

`next-themes` использует localStorage по умолчанию, что совпадает с нашим решением. Не переопределяем.

### 8.3 Defaults и переключение

- На первом запуске — `system` (следуем prefers-color-scheme)
- При явном переключении пользователем — `light` или `dark` запоминается, system override отключается
- Опция "Reset to system" в settings возвращает к `system`-режиму
- SSR-safe (next-themes имеет встроенную защиту от FOUC) — впрочем, у нас Vite-SPA, FOUC проблема минимальна

### 8.4 Принципы цвета

**Never:**
- ❌ Pure black (#000) для backgrounds в dark mode — слишком резко. Используем `#0c0c0d` или `#171717`.
- ❌ Pure white (#fff) для backgrounds в light mode — `#fafaf9` лучше (slate-50), меньше fatigue.
- ❌ Pure saturated colors в dark mode — используем pastel-leaning variants.
- ❌ Inverted colors (просто всё наоборот) — это не дизайн, это hack.

**Image-rendering:** logos / illustrations имеют отдельные dark variants если нужно (логотип BodgeGene должен быть проверен в обоих).

### 8.5 Tooling для подбора и проверки цветов

Для дизайн-сессий полезны:
- **Realtime Colors** (realtimecolors.com) — preview palette в обоих режимах одновременно
- **Tailwind Color Palette** (tailwindcolor.com) — все стандартные shades для inspiration
- **OKLCH Color Picker** (oklch.com) — современный color space (Tailwind 4 на нём)
- **WebAIM Contrast Checker** — проверка пары цветов на ≥4.5:1
- **Chrome DevTools** → Rendering → "Emulate CSS prefers-color-scheme" — переключить режим вручную для тестирования

---

## 9. Anti-patterns (don'ts)

Чего не делаем — список растёт по мере появления искушений.

**9.1 Decorative gradients.** Никаких "красивых градиентов" на cards, backgrounds, кнопках. Solid colors only. Exception: scientific visualizations (heatmaps в DAG если будут).

**9.2 Drop-shadows для глубины-ради-глубины.** Тени имеют функцию (отделить modal от content, indicate elevation). Декоративные glows / neon — нет.

**9.3 Crossed icon + emoji.** Никогда. Только icons (lucide) ИЛИ только emoji-в-content (юзеру разрешено в commit messages, project names).

**9.4 Inline styles в коде.** Всё через design tokens (CSS vars или Tailwind classes). Никаких `style={{ color: '#...' }}` в компонентах.

**9.5 Animation на каждый чих.** Hover scale на cards, bouncy buttons, animated icons — НЕТ. Только functional animations (drawer slide, view transition).

**9.6 Tooltips на всё подряд.** Tooltip на кнопку с очевидным label = шум. Tooltip только когда контекст НЕ очевиден из UI.

**9.7 Форма ради формы.** Радиусы 16px+, sphere shapes, gimmicky-cards — нет. Простые прямоугольники с 6px скруглением — наш визуальный язык.

**9.8 Цветовая иерархия только на цвет.** Никогда не передаём важность только цветом (color-blindness). Всегда дублируется shape / weight / position / icon.

**9.9 Sticky анимации.** Hover-state, который "залипает" после mouse leave — нет. Hover на mouse over, off на leave.

**9.10 Loading states "spinner forever".** Если operation > 2s — показываем progress (% или steps). > 10s — даём cancel. Skeleton-screens где имеет смысл (lists, не canvas).

---

## 10. Open questions (для дизайн-сессий)

1. **BodgeGene logo / wordmark.** Не существует. Делаем в дизайн-сессии M-A или позже.
2. **App icon (favicon).** Связано с logo.
3. **Onboarding visuals.** Иллюстрации для empty states (DAG пустой, нет primers, нет проектов). Стиль — TBD.
4. **Animation для DAG layout changes.** Когда узел появляется/удаляется — fade in/out vs spring vs instant. TBD после M-D.
5. **Точные tokens для feature-class colors.** Сейчас наследие v0.5. В дизайн-сессии может пересмотреться под общую палитру.
6. **Hex для reaction-class colors.** Базовые цвета зафиксированы (Gibson=emerald, GG=violet, RE=orange, KLD=cyan, blunt=neutral, PCR=blue), но точные shade'ы могут уточниться.
7. **Иконки для domain (linear/circular topology, ends/overhang)** — большинство нужно нарисовать самим, не lucide.
8. **Custom cursor для DAG canvas** (grab/grabbing когда pan). Стандартные браузерные cursors или кастомные?
9. **Loading animation BodgeGene** — какой характер? Pulsing dots / spinner / DNA-helix loading?
10. **Empty state illustrations** — стиль (line-art / geometric / minimal text-based)?

---

## 11. Связанные документы

- `ARCHITECTURE_v2.md` — архитектура (логика). Этот документ — визуал.
- `DECISIONS.md` — архитектурные решения. Дизайн-решения тоже фиксируются туда (DEC-DS-NN).
- `CHAT_PLAYBOOK.md` — регламент работы.
- `docs/windows-v2.drawio` — schema взаимодействия окон.
- (будущее) `docs/DESIGN_SESSION_M-A.md` — wireframes + design proposal первого окна.
- (будущее) `gui/designer/src/styles/tokens.css` — реализация tokens.
- (будущее) `gui/designer/src/styles/themes.css` — light/dark switching.

---

**Дата создания:** 29 апреля 2026
**Версия документа:** 1.0 — initial draft
**Статус:** активный, эволюционирует через дизайн-сессии M-A → M-I

_При любом дизайн-решении после этой даты — обновить соответствующую секцию + зафиксировать в DECISIONS.md как DEC-DS-NN._
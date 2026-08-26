---
name: design-system
description: Visual design system for BodgeGene UI. Loads when Code adds or modifies any React component, CSS class, color value, font, spacing, shadow, or icon. Applies to work in gui/designer/src/components/*.jsx, theme.js, feature-palette.js, i18n.js (for UI strings), or when Code is tempted to use Tailwind arbitrary colors like text-gray-500 / bg-slate-800.
---

# Design system BodgeGene

Источник истины для рабочего UI — тематические CSS-токены в `gui/designer/src/index.css`. Основной акцент BodgeGene — **янтарная шкала**. Старые teaser-файлы можно использовать только как композиционные референсы; терракотовая палитра `#B85C3E` / `#DAA18A` не является канонической и не должна попадать в новый код или fallback-значения.

Рабочий принцип — **«панк в душе, удобство в chrome»**: punk-эстетика остаётся в маркетинговых артефактах, рабочий интерфейс — спокойный и пригодный для многочасовой работы. Цвета в компонентах брать через тематические токены, не через произвольные Tailwind-классы или inline hex.

## Base palette

```
--surface-base:    #FAFAF9
--surface-1:       #FFFFFF
--surface-2:       #F5F5F4
--surface-3:       #E7E5E4
--border-subtle:   #E7E5E4
--border-default:  #D6D3D1
--border-strong:   #A8A29E
--text-primary:    #1C1917
--text-secondary:  #57534E
--text-tertiary:   #78716C
--text-disabled:   #A8A29E
```

Для dark theme использовать соответствующие значения тех же токенов из `index.css`; не создавать отдельные компонентные палитры. В JSX/CSS компонентов не хардкодить `#000000`, `#FFFFFF`, `text-black`, `bg-white`, `text-gray-*`, `bg-slate-*`, `border-zinc-*`. `#FFFFFF` допустим в центральном определении `--surface-1`, но consumers должны обращаться через токен.

## Янтарный accent / статусные цвета

```
Light:
  --accent-50:    #FFFBEB
  --accent-100:   #FEF3C7
  --accent-300:   #FCD34D
  --accent-500:   #F59E0B   /* primary actions, active state, focus */
  --accent-700:   #B45309
  --accent-text:  #78350F

Dark:
  --accent-50:    #1C1306
  --accent-100:   #2A1D09
  --accent-300:   #A16207
  --accent-500:   #D97706
  --accent-700:   #FBBF24
  --accent-text:  #FDE68A
```

- Для primary/active/focus использовать только `--accent-*`; не добавлять новые терракотовые fallback-значения.
- На яркой янтарной заливке подбирать контрастный текст через тематический токен; не считать белый текст автоматически допустимым.
- Янтарный может присутствовать и в warning-палитре, но семантику выражать через `--warning-bg` / `--warning-fg`, иконку и текст. Не использовать `--accent-*` как замену warning-токенам.
- Success, danger и info оформлять через `--success-*`, `--danger-*`, `--info-*` из `index.css`.

## PUNK palette — только в teaser-артефактах

PUNK-цвета (`#F4D53C` yellow / `#D93A28` red / `#4EB963` green) существуют **только в `design_teasers/aesthetics_PUNK.html`** как маркетинговый образ проекта. В рабочий UI **не попадают**. Это осознанное решение (⚓ DECISIONS.md 21.04.2026): для 8-часовой работы нужна спокойная эстетика, панк остаётся в философии («rebellion against bureaucracy of cloning», но не в chrome).

Для primary, success, warning, danger и info использовать соответственно `--accent-*`, `--success-*`, `--warning-*`, `--danger-*`, `--info-*`. Не использовать PUNK-цвета.

## Typography

```
--serif:   'Fraunces', Georgia, serif           /* display headers, hero text */
--font-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif
--mono:    'JetBrains Mono', ui-monospace       /* sequences, code, numbers */
--display: 'Anton', 'Inter', sans-serif         /* teaser only, не рабочий UI */
```

**Правила:**
- Body text — `--font-ui` всегда.
- Nucleotide sequences / primers / coordinates — `--mono` всегда (моноширина критична для DNA).
- Секционные H1/H2 в «важных» экранах (PlasmidViewer hero, QuickStart) — `--serif`.
- `--display` (Anton) — **только в teaser**, не в рабочем UI.

Font features включены в body: `font-feature-settings: "ss01", "cv11"` (геометрические варианты). Не переопределять в компонентах без причины.

## Feature palette — семейство-based, SnapGene-compliant (⚓ 21.04.2026)

Ключевой принцип: **оттенки единого семейственного цвета для функционально близких типов**. Биолог видит «жёлто-оранжевая область = регуляция экспрессии» и внутри различает promoter/ori/terminator. Цвета созвучны SnapGene-convention, где 170k+ плазмид Addgene уже раскрашены.

```
Yellow family — regulatory / expression initiation
  --bio-promoter:    #F2C84B   warm yellow
  --bio-ori:         #E8B333   deeper amber
  --bio-terminator:  #D97B3B   burnt orange

Green family — coding
  --bio-cds:         #C8D570   chartreuse (generic CDS)
  --bio-resistance:  #9BC07C   sage green (AmpR, KanR, etc.)
  --bio-reporter:    #7CB49E   teal green (GFP, mCherry)

Peach family — regulatory / signaling
  --bio-ltr:         #ECB383   warm peach
  --bio-enhancer:    #F2CDA9   light peach
  --bio-signal:      #B8AA8A   warm taupe (signal peptide, poly-A)

Rose–lilac — tags / fusion
  --bio-tag:         #E091A2   rose (FLAG, HA, Myc)
  --bio-his:         #B884B8   lilac (6xHis, GST, MBP)
  --bio-linker:      #C4B8A8   warm gray (GS, TEV)

Cool blues — binding sites
  --bio-primer:      #9EBAD9   sky blue
  --bio-operator:    #6DA4C4   medium blue
  --bio-cap:         #A5CFD5   cyan (CAP/CRP/GATA)

Other
  --bio-poly-a:      #C4C0B8   gray
  --bio-misc:        #EEE7D5   ivory (unknown / misc_feature)
```

Единый stroke `FEATURE_STROKE = '#3A2F1F'` (warm dark brown, не чёрный) для label text, direction-arrow markers, highlight-ring.

**Контракт:** все UI-компоненты, которые рисуют region-цвета, должны ходить через `featureColor(type, name)` из `src/feature-palette.js`, **не через собственные словари**. Текущие consumers: `PlasmidMap` sub-arcs, `SequencePane` region chips. Планируемые (Sprint UX-1): `PartBlock`, `JunctionBlock`, `AnnotationEditor`, `PlasmidViewer`, `CatalogPanel`.

## Legacy `theme.js` Okabe-Ito — deprecating

До Sprint UX-1 `theme.js` используется в canvas Blocks view (`PartBlock`, `JunctionBlock`, `MergedBlock`) — Okabe-Ito colorblind-safe пары. Это legacy, **мигрирует на `feature-palette.js` V2 в UX-1**. До миграции — не добавлять новых consumers `theme.js`, новые компоненты сразу через `featureColor`.

## Spacing / radius / shadows

- Base spacing unit: 4 px. Тайлы от 4/8/12/16/24/32 px.
- Border radius: компактный (`rounded-md` ≈ 6 px для кнопок, `rounded-lg` ≈ 8 px для карточек). Не pill-shaped без причины.
- Shadows: очень субтильные, через `rgba(28,25,23, .06–.10)`. Не `shadow-xl`, не Tailwind `shadow-2xl`. Paper-эстетика не терпит heavy shadows.

## Иконки

- Единый источник UI-иконок: `gui/designer/src/components/icons/Icon.jsx`.
- Использовать `<Icon name="..." />` из центрального реестра. Семейство `chrome` предназначено для оболочки приложения, семейство `domain` — для ДНК, праймеров, рестрикции, топологии и операций сборки.
- Для стандартных биологических частей использовать SBOL-глифы из `gui/designer/src/sbol-glyphs.jsx`.
- Перед созданием SVG проверить `ICON_GROUPS`, SBOL registry и существующие operation/feature glyphs. Если глифа нет — расширить подходящий центральный реестр и его тест, а не заводить локальный набор в компоненте.
- Размер inline: 16 px. В компактных кнопках — 14 px.
- Цвет наследовать через `currentColor`; active/primary-состояние получает янтарный цвет от окружающего токена.
- Не импортировать `lucide-react` напрямую и не смешивать центральные иконки с emoji, Unicode-символами или Material Icons в UI chrome.
- Существующие `Align/icons.jsx` и `CanvasSkeleton/canvas/op-icons.jsx` считать переходными локальными наборами; не добавлять в них новые общеупотребительные chrome/domain-глифы.

## Pre-commit check для UI правок

1. Primary/active/focus использует янтарные `--accent-*`, без `#B85C3E` / `#DAA18A` и их rgba-вариантов?
2. Surface, text и border берутся через theme tokens, без произвольных Tailwind-серых и inline hex?
3. Warning/success/danger/info используют семантические токены, а не маскируются под accent?
4. Шрифт для sequences — mono?
5. PUNK-цвета не используются в рабочем UI?
6. Feature color взят через `featureColor(type, name)` из `feature-palette.js`, не через собственный словарь?
7. Иконка взята из `components/icons/Icon.jsx`, SBOL registry или существующего domain-glyph реестра; emoji в UI chrome не добавлены?
8. Новый токен цвета добавлен централизованно, а не inline в JSX?

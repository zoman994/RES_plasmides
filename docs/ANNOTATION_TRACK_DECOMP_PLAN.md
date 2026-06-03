# AnnotationTrack декомпозиция — под SBOL Visual glyph-render

> **Тип:** декомпозиция-план (mandatory-first для glyph-спринта). **Дата:** 02.06.2026.
> **Зачем:** `CANVAS_DESIGN_PROPOSAL.md` §4.2 требует SBOL-глифы вместо одинаковых rect'ов. Но `tracks/AnnotationTrack.jsx` = **48.54 КБ > hard 40** (.jsx). Size-budget (CLAUDE.md §7): дописывать в over-hard файл **запрещено** → декомпозиция ПЕРЕД расширением. Эта спека — шаг 0 любого glyph-спринта.
> **Уважает ⚓:** DEC-ANN-10 (3-level annotations, coords), TD-ANNOTATIONTRACK-DECOMPOSE-V2.

## 1. Текущее состояние

`AnnotationTrack.jsx` (~1037 строк, 48.54 КБ) — практически **один монолитный компонент** `AnnotationTrack` (стр. 120–1035) + приклеенные:
- константы (ROW_HEIGHT, GLYPH_SIZE, MAX_VISIBLE_ROWS, SHORT_VISIBLE_THRESHOLD, LEADER_LINE_LENGTH_PX…);
- pure-хелперы: `regionKey`, `labelLengthChars`, `chevronPath(strand,x,y,h)`, `ensureColor`, `darkenColor`;
- sub-компонент `LabelText` (стр. 1046+);
- exports: `default memo(AnnotationTrack)`, `MAX_VISIBLE_ROWS`.

Внутри монолита (по чтению): row-packing (раскладка пересекающихся фич по рядам ≤ MAX_VISIBLE_ROWS), label-placement (inside/leader-line/hidden по ширине), chevron-стрелки strand-aware, цвет, hover/click/right-click, partial `_part_` суффиксы. Всё в одном render.

## 2. Целевая структура (seam под глифы)

| Новый модуль | Что переносим | Тип | ~KB |
|---|---|---|---|
| `tracks/annotation-colors.js` | `ensureColor`, `darkenColor` (+ re-export `featureColorShaded`) | pure | ~3 |
| `tracks/annotation-geometry.js` | `chevronPath` + glyph bbox-математика, leader-line геометрия | pure | ~4 |
| `tracks/annotation-layout.js` | row-packing, `labelLengthChars`, `regionKey`, MAX_VISIBLE_ROWS, visible-threshold, label inside/leader/hidden-решение | pure | ~6 |
| `tracks/AnnotationLabel.jsx` | `LabelText` sub-компонент | view | ~3 |
| **`tracks/FeatureGlyph.jsx`** (НОВЫЙ) | SBOL Visual SVG-примитивы (paraSBOLv-стиль) + `type→glyph` мапа + `soTerm` | view+data | ~6 |
| `tracks/AnnotationTrack.jsx` (slim) | оркестратор: layout → render `<FeatureGlyph>`+`<AnnotationLabel>` | view | **~20** |

Итог: монолит 48.5 → ~20 КБ (под soft 30, под hard 40), + переиспользуемые pure-модули (тестируемы изолированно) + **`FeatureGlyph` — точка расширения** для глифов.

## 3. FeatureGlyph (новый primitive, проект под §2.1 предложения)

```jsx
// tracks/FeatureGlyph.jsx
// Параметрический SVG-глиф (path + baseline-endpoint), paraSBOLv-идиома.
export function FeatureGlyph({ type, role, x, width, height, strand, color }) { ... }

// data-driven мапа type→glyph (НЕ классы — как TOOLKIT_REGISTRY)
const GLYPH = {
  CDS:         { shape: 'cds',        so: 'SO:0000316' },   // прямоуг.+скос-стрелка
  marker:      { shape: 'cds',        so: 'SO:0000316' },   // как CDS, различение лейбл+цвет
  reporter:    { shape: 'cds',        so: 'SO:0000316' },
  promoter:    { shape: 'promoter',   so: 'SO:0000167' },   // загнутая стрелка
  terminator:  { shape: 'terminator', so: 'SO:0000141' },   // T
  rep_origin:  { shape: 'origin',     so: 'SO:0000296' },   // круг
  RBS:         { shape: 'rbs',        so: 'SO:0000139' },   // полуовал
  primer_bind: { shape: 'primer',     so: 'SO:0005850' },
  protein_bind:{ shape: 'operator',   so: 'SO:0000409' },
  misc_feature:{ shape: 'unspecified',so: 'SO:0000001' },   // generic rect (fallback)
};
```
Правила SBOL (нормативные, §2.2 предложения): specific-not-generic (generic только для `misc_feature`), reverse-strand = rotate 180°, bbox касается backbone. `feature.soTerm` хранится additive.

## 4. План (фазы, TDD-first, size-gated)

1. **P1 — extract pure** (`annotation-colors`, `annotation-geometry`, `annotation-layout`), тела **байт-в-байт**; `AnnotationTrack` импортирует. **Гейт: full Vitest зелёный + AnnotationTrack < hard 40** (подтвердить размер). Без правки поведения (как decomp feature-match-core в common-features). При регрессии — это импорты, не логика.
2. **P2 — extract `AnnotationLabel.jsx`** (LabelText) + тест рендера лейбла.
3. **P3 — `FeatureGlyph.jsx`** + `type→glyph` мапа + unit-тесты геометрии (path для каждого shape, strand-rotation, bbox-baseline-касание). Пока НЕ подключён к рендеру (за флагом).
4. **P4 — swap render:** rect → `<FeatureGlyph>` в `AnnotationTrack`; reverse-strand rotation; цвет из palette. Визуальная приёмка (light/dark, color-blind: различимы формой не только цветом — ⚓ 9.8).
5. **P5 (опц.) — polypeptide detail-глифы** (tag/his/linker/2A как chevron внутри CDS, SO:0000839) — совпадает с 3-level annotations.

## 5. Риски / заметки
- **AnnotationTrack hot-path** (рендерится на каждый кадр SequenceView, 10k+ DOM на большой плазмиде) — extract не должен добавить аллокаций в render-цикле; pure-хелперы вызывать в useMemo как сейчас.
- **Партиал-суффиксы** (`_part_`, V134/V136) и hover/click — остаются в slim-оркестраторе, не в pure-модулях.
- **paraSBOLv** (MIT, PMC8546602) — референс генерации параметрических глифов; брать идиому (функция→path), не зависимость.
- После P1 закрывается формальная часть TD-ANNOTATIONTRACK-DECOMPOSE-V2 (под-hard); глиф-расширение (P3-P5) — отдельная фича.

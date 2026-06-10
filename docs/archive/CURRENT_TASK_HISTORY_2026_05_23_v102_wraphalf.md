# CURRENT_TASK.md

## 🔵 Статус: Хендофф Code — V102 wrap-половина рисует все элементы треков (23.05.2026)

Тип B, многокомпонентная. Затенение wrap-половины (предыдущий сабтаск V102) Code сдал, зелёное (3998 pass / 18 skip / 0 fail, build clean), ждёт визуальной приёмки. Эта задача — следующий шаг V102: на wrap-половине bridge-строки сейчас рисуется ДНК и линейка, но НЕ рисуются аннотации (частично), праймеры, сайты рестрикции. Wrap-tail затевался ради переноса элементов через ориджин — без этого фича бессмысленна.

**TL;DR для Code:** прочитай `CLAUDE.md` → `BUGS.md` (V102) → этот файл → `docs/SPEC_V102_WRAPTAIL_GATE.md`. Сделай wrap-awareness в трёх треках + проброс пропсов. Эталон координат — `RulerTrack.jsx` (уже wrap-aware). Спеку не переписывай. После зелёного полного Vitest + `vite build` clean — **STOP**, отчёт сюда. Координационные файлы не финализируй.

---

## Порядок чтения для Code

1. `CLAUDE.md` → `BUGS.md` (запись V102) → этот файл.
2. `docs/SPEC_V102_WRAPTAIL_GATE.md` — спека (тип B): общий паттерн §4 + per-track правила §5.

---

## Задача — V102: рендер всех элементов на wrap-половине bridge-строки

**Спека:** `docs/SPEC_V102_WRAPTAIL_GATE.md` (тип B).

**Корень.** `buildWrapBridgeLine` строит последнюю строку кольцевой плазмиды как `[реальный конец][wrap-символы начала]` (`wrapsOrigin:true`, разделитель ▶1 на колонке `wrapAt`). Контент-треки фильтруют содержимое в реальный диапазон строки `[lineStart, lineEnd)` (≈260…390) и не видят wrap-половину `[0, wrapWidthChars)`:
- `AnnotationTrack` — `stackAnnotations(_, lineStart, lineEnd)` выкидывает фичи начала плазмиды; `wrapSegmentInfo` (рендер wrap-куска) выполняется только для уже-застекованных регионов → фича-«только начало» (MCS) на wrap-половине не рисуется.
- `PrimerTrack`, `RestrictionTrack` — фильтруют по `[lineStart, lineEnd)`, wrap-пропсов не получают вообще.
- `RulerTrack` — wrap-aware, работает (эталон). `StrandsTrack` — ДНК-буквы рисуются (wrap-символы в `line.seq`).

**Фикс.** Каждый контент-трек делает wrap-awareness внутри себя (один SVG/div, два сегмента — реальный `[lineStart,seqLength)` в колонках `[0,wrapAt)` + wrap `[0,wrapWidthChars)` в колонках `[wrapAt,lineLen)`). Координатная математика — §4 спеки.

**Чеклист (§5/§6 спеки):**
- [x] `SequenceLine.jsx` — пробросить `wrapsOrigin`/`wrapAt`/`seqLength` в `PrimerTrack` и `RestrictionTrack` (в `RulerTrack`/`AnnotationTrack` уже идут; `AATrack` — НЕ трогать). §5.4.
- [x] `AnnotationTrack.jsx` — заменить `wrapSegmentInfo`-костыль на полноценный второй стек wrap-половины (`stackAnnotations(parentRegions, 0, wrapWidthChars)`), рендер в колонках `[wrapAt,lineLen)`. §5.1. Файл уже над hard 40 — правка net-нейтральна, декомпозицию НЕ делать.
- [x] `PrimerTrack.jsx` — wrap-awareness: реальные + wrap хиты, колонка из сегмента. §5.2.
- [x] `RestrictionTrack.jsx` — wrap-awareness: реальные + wrap сайты, `renderCi` из сегмента. §5.3.
- [x] Тесты: bridge-строка рисует фичу/праймер/сайт на wrap-половине; НЕ-bridge строки без изменений; регрессия wrap-tail/bridge/veil зелёная. §6.
- [x] Полный Vitest + `vite build`.

**AATrack — НЕ трогать** (вынесен в OUT, §3 спеки: 38.91 KB вплотную к лимиту + крупная правка + низкая ценность АА на ~30 п.о. контекста). Если потребуется — отдельный follow-up.

---

## Контекст состояния кода

- **База:** working-tree, branch `feature/m-x-7a-library-structure-v2`. Vitest baseline после затенения — **3998 pass / 18 skip / 0 fail**, `vite build` clean.
- Working-tree несёт нескоммиченные S1+S2+S3 + V96 + V97–V100 + V102 (always-on/200bp + затенение) + M-FORMAT-V2 — всё ждёт визуальной приёмки.
- Задача — рендер-ядро `SequenceView/tracks`, с assembly-зоной (S1–S3) не пересекается.
- §0 размеры: `AnnotationTrack.jsx` **48.54 KB (над hard 40, preexisting TD)**, `AATrack.jsx` 38.91, `PrimerTrack.jsx` 10.14, `RestrictionTrack.jsx` 19.74, `RulerTrack.jsx` 5.05, `SequenceLine.jsx` 18.6.

---

## STOP-условие и формат отчёта

После IN-scope §3 спеки + зелёного полного Vitest + `vite build` clean — **STOP**. Отчёт в этот файл отдельной секцией:
- commit range (или working-tree);
- Vitest counters (pass / skip / fail);
- `vite build` результат;
- spec deviations — если отступал, явно;
- size budget по 4 файлам, особо `AnnotationTrack.jsx` (вырос/нет относительно 48.54 KB).

Визуальная приёмка — **отдельная Chat-сессия**, не в этой.

---

## ✅ Отчёт Code — V102 §5 (23.05.2026)

**Статус:** IN-scope §3 спеки выполнен, зелёный полный Vitest + `vite build` clean. **STOP.**

### Что сделано (§5.1–§5.4)

- **`SequenceLine.jsx` (§5.4):** `wrapsOrigin`/`wrapAt`/`seqLength` проброшены в `RestrictionTrack` (1 вызов) и в оба `PrimerTrack` (forward + reverse). `RulerTrack`/`AnnotationTrack` уже получали; `AATrack` — не тронут.
- **`AnnotationTrack.jsx` (§5.1):** `wrapSegmentInfo`-костыль удалён, заменён на полноценный второй стек wrap-половины — `stackAnnotations(parentRegions, 0, wrapWidthChars)`, рендер в колонках `[wrapAt, lineLen)` (`xLeft = (labelChars + wrapAt + wVisStart)·charPx`). Реальный стек теперь клипается к `Math.min(lineEnd, seqLength)`. `rowsCount = max(realStack, wrapStack)`. Wrap-сегмент = rect + chevron + inside-label (sub-features / drag-handles / preview / rename остались на реальном сегменте). Шеврон wrap-сегмента по правилу `(strand=+1 && region.end ≤ wrapWidthChars) || (strand=−1 && wVisStart === region.start)`.
- **`PrimerTrack.jsx` (§5.2):** добавлены пропсы wrap; helper `clipHit(h, lo, hi, colBase, seg)` тегирует `_seg`/`_visStart`/`_visEnd`/`_colStart`. `lineHits` = реальные (`[lineStart, min(lineEnd,seqLength))`, colBase 0) ∪ wrap (`[0, wrapWidthChars)`, colBase `wrapAt`). Праймер через ориджин даёт оба хита (две стрелки). Вписанные буквы — абсолютный `upper.slice(_visStart,_visEnd)`. React-key включает `_seg`.
- **`RestrictionTrack.jsx` (§5.3):** добавлены пропсы wrap. `lineSites` — массив пар `{site, renderCi}` (реальные `renderCi = position − lineStart` ∪ wrap `renderCi = wrapAt + position`), отсортирован по `renderCi`. `computeLabelSlots` читает `item.renderCi`/`item.site`. **Сайт-объект не мутируется** — `onSiteClick` получает оригинальную ссылку.

### Тесты (§6)

- **Новый файл** `__tests__/wrap-bridge-tracks-v102.test.jsx` (4 теста): PrimerTrack — праймер у начала плазмиды рисуется на wrap-половине (`translate(201.6…)`, буквы из абсолютного среза) + не-bridge без изменений (`translate(57.6…)`); RestrictionTrack — сайт в wrap-позиции рисует cut-tick по wrap-колонке (`renderCi = wrapAt+pos`) + не-bridge без изменений.
- **Обновлён** `__tests__/wrap-bridge-render.test.jsx`: тест №3 (бывш. «label rendered once on the wider segment» — тестировал удалённый `labelGoesOnWrap`) перепрофилирован в «start-only feature (never in real range) still renders on wrap-half» — прямая проверка фичи, которую старый костыль терял (MCS). Тесты №1/№2/№4 (crossing-origin two-rects / real-only / non-bridge) проходят без правок; обновлён docstring.

### Результаты гейта

- **Vitest:** **4002 passed / 18 skipped / 0 failed** (412 файлов; +4 теста к baseline 3998). Известный flake `primer-wizard.test.jsx::2` (TD-PRIMER-WIZARD-FLAKE) в этом прогоне не сработал.
- **`vite build`:** clean (`✓ built`, PWA сгенерирован). Предупреждения `INEFFECTIVE_DYNAMIC_IMPORT` (DagWorkspace) и chunk > 500 KB — preexisting, не связаны с треками.
- **Коммит:** working-tree (нескоммичено, поверх ветки `feature/m-x-7a-library-structure-v2`) — как и весь предшествующий V102/editable-assembly пакет.

### Spec deviations (явно)

1. **`AnnotationTrack.jsx` вырос +0.92 KB** (48.54 → 49.46 KB), а не net-нейтрально. Причина: standalone wrap-стек заново вычисляет per-region стиль-переменные (`isPredicted`/`fill`/`stroke`/…), которые старый `wrapSegmentInfo` переиспользовал из охватывающего scope реального региона. Сделан good-faith trim комментариев (был +1.34 → стал +0.92). Декомпозицию **НЕ делал** (§8 спеки: «Если растёт — фиксировать в отчёте, декомпозицию НЕ делать»).
2. **Dual-label на фиче через ориджин.** Два независимых стека (§5.1) ⇒ механизм единственного label (`labelGoesOnWrap`) удалён вместе с `wrapSegmentInfo`; теперь каждый сегмент подписывает себя сам. Wrap-сегмент рисует только inside-label (без leader/glyph/kids) — по букве §5.1 «rect + chevron + label». Обязало обновить устаревший M-X.5 тест №3 (см. выше).
3. **`RestrictionTrack` — паттерн `{site, renderCi}` пары** вместо спред-тега `_renderCi` на сайте. Первая реализация (`{...s, _renderCi}`) протекала во внешний `onSiteClick` и уронила `skeleton-restriction-sites.test.jsx` (toEqual на чистый сайт). Исправлено выносом `renderCi` в slot-метаданные — сайт-объект остаётся неизменным. Функционально эквивалентно §5.3, чище по контракту.

### Size budget (4 файла)

| Файл | Было | Стало | Δ | Лимит |
|---|---|---|---|---|
| `tracks/AnnotationTrack.jsx` | 48.54 KB | **49.46 KB** | **+0.92** | .jsx hard 40 (preexisting TD — над лимитом и до задачи) |
| `tracks/PrimerTrack.jsx` | 10.14 KB | 12.16 KB | +2.02 | .jsx 40/30 — запас |
| `tracks/RestrictionTrack.jsx` | 19.74 KB | 21.65 KB | +1.91 | .jsx 40/30 — запас |
| `SequenceLine.jsx` | 18.6 KB | 19.12 KB | +0.52 | .jsx 40/30 — запас |

**Новые нарушители hard:** нет (AnnotationTrack уже был над hard до задачи). **Warning signal (>5 KB за задачу):** нет. `AATrack.jsx` — не тронут (38.91 KB, OUT).

---

## Что НЕ трогать

- Координационные файлы — `PROJECT_STATE.md` / `BUGS.md` / `DECISIONS.md` / `RELEASES.md` / `ANCHORS.md` / `TECH_DEBT.md` / `CLAUDE.md` / `COMPONENT_MAP.md`. Финализирует Chat.
- Спеки в `docs/` — не переписывать.
- `AATrack.jsx` — НЕ трогать (§3 OUT спеки).
- `wrap-tail.js`, `index.jsx` — НЕ трогать (always-on / 200 п.о. готовы).
- `wrap-bridge-veil` / inline-структура bridge-строки / `buildWrapBridgeLine` / `buildWrapTailLines` — НЕ трогать (готово).
- `StrandsTrack`, `RulerTrack` — НЕ трогать (ДНК и линейка на wrap-половине уже корректны).
- `OutOfRangeMaskOverlay` / V98 — не трогать.
- editable-assembly working-tree (S1–S3) — не откатывать, не трогать.
- Алгоритмические зоны (§3 CHAT_PLAYBOOK) — не задеты.

---

## При регрессии

Тест ломается — не глушить, не править «под результат». Падение зафиксировать в отчёте (тест / причина), Chat разбирает.

---

## Следующее (контекст — не выполнять сейчас)

После V102 и визуальной приёмки editable-assembly wave: **bio-фикс `overlapTail`** (RC-инверсия overlap-конвенции, тип C — разбор в `docs/archive/CURRENT_TASK_HISTORY_2026_05_22_editable_assembly_s1_s2_s3.md`, секция «РАЗРЕШЕНИЕ БЛОКЕРА») → **консолидация калькулятора праймеров**.

---

## Отложенные визуальные приёмки (не терять)

Принимаются серией приёмочных сессий:
- **editable-assembly S1+S2+S3** — `docs/archive/CURRENT_TASK_HISTORY_2026_05_22_editable_assembly_s1_s2_s3.md`.
- **V102** — wrap-tail виден для кольцевых (включая короткие), не мигает, выделение работает (Ctrl+A до разделителя, drag на псевдоначало), wrap-половина bridge-строки затенена, **и — после этой задачи — на wrap-половине рисуются аннотации / праймеры / сайты рестрикции**.
- **V96** overlay-геометрия — `docs/archive/CODE_REPORT_V96_OVERLAY_2026_05_22.md`.
- **V97–V100 + 3 фичи** — `docs/archive/CURRENT_TASK_HISTORY_2026_05_22_v97_v100_batch.md`.
- **M-FORMAT-V2 + 3×CLEANUP** — `docs/archive/CURRENT_TASK_HISTORY_2026_05_20_format_v2_and_cleanup.md`.

---

**Дата:** 23.05.2026. **Версия:** v0.8.3-alpha. **Статус:** готов к выдаче Code.

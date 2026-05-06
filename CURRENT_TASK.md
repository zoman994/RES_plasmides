# CURRENT_TASK.md

## Sprint M-X.3 — Wrap-tail rendering for circular plasmids in SequenceView

**Статус:** 🟢 IN PROGRESS (06.05.2026, ветка `feature/sequence-view-feature-strip` от HEAD `253420a` v0.7.2 release).
**Спека:** `docs/SPRINT_M-X.3_WRAPTAIL_RENDERING.md`.
**Закрывает:** TD-WRAPTAIL-RENDERING.
**Не закрывает:** TD-CIRCULAR-SELECTION (отдельно), TD-ANNOTATIONTRACK-DECOMPOSE-V2 (M-X.3 trick — feature filtering at SequenceLine level, AnnotationTrack не трогаем).

---

## TL;DR

Биолог проектирует праймер на стыке через origin pUC19 (e.g. tail на 2580..18 — спан **через 0**). Сейчас линейный SequenceView обрывается на seqLength → биолог теряет контекст начала. Этот sprint рендерит **2 leading wrap-tail lines** (последние ~160 nt plasmid'а) ПЕРЕД первой реальной строкой и **2 trailing wrap-tail lines** (первые ~160 nt) ПОСЛЕ последней — приглушенно (opacity 0.5 + italic numbers + pointer-events: none). Origin marker (dashed accent-500 line + label «origin / 1») на стыках wrap-tail ↔ main. Auto-disable когда plasmid + 3 reserve lines умещается в viewport. Linear topology — никаких изменений.

---

## K-план

### K1 — `lib/wrap-tail.js` pure helpers + tests (TDD-first)
- [ ] `shouldEnableWrapTail({ circular, seqLength, cpl, viewportHeight, lineHeight })` → bool
- [ ] `pickWrapTailLines({ totalMainLines })` → 0/1/2
- [ ] `buildWrapTailLines({ fullSeq, cpl, leadingCount, trailingCount })` → `{leading: [], trailing: []}`
- [ ] `filterAnnotationsForLine(annotations, lineStart, lineEnd)` → filtered array
- [ ] `wrap-tail.test.js` — ~7 unit tests, все green

### K2 — Wire wrap-tail lines into SequenceView render
- [ ] `SequenceView/index.jsx` — импорт helpers, useMemo wrapTailLines, [...leading, ...main, ...trailing] linesJsx
- [ ] `SequenceLine.jsx` — `kind` prop ('main' | 'leading-wrap' | 'trailing-wrap'), wrapper opacity 0.5 + italic numbers + pointer-events:none при kind!=='main', `data-wraptail-kind={kind}`
- [ ] `wrap-tail-render.test.jsx` — 3 render tests (circular long → leading+main+trailing, linear → main only, circular short auto-disabled)

### K3 — `OriginMarkerOverlay`
- [ ] Новый файл `overlays/OriginMarkerOverlay.jsx`
- [ ] Mount в SequenceView ниже CaretOverlay (z-index)
- [ ] `origin-marker.test.jsx` — 3 tests

### K4 — Caret + selection фильтрация по `data-wraptail-kind="main"`
- [ ] `CaretOverlay.jsx` — querySelector добавить `[data-wraptail-kind="main"]`
- [ ] `useSelectionState.js` — coord-from-pointer ignore non-main lines
- [ ] `caret-overlay.test.jsx` + `selection-state.test.jsx` — 2 tests

### K5 — Edge cases + ResizeObserver wiring
- [ ] viewportHeight state в SequenceView, ResizeObserver
- [ ] `wrapTailEnabled` через `shouldEnableWrapTail`
- [ ] `wrap-tail-edge.test.jsx` — 2 edge tests

### K6 — Visual acceptance + integration
- [ ] `wrap-tail-integration.test.jsx` — 3 fixture tests (pUC19)
- [ ] Биолог проходит 6 visual scenarios (см. §3 K6 спеки)
- [ ] PASS → финализация (RELEASES.md блок, archive спеки, bump version)

---

## Команды verification

```bash
cd gui/designer && npx vitest run && npx vite build
```

Цель к концу K6: vitest 1422 + ~20 = ~1442 passing.

---

**Запуск:** Code начинает с K1 (pure helpers + TDD). После каждого K — отчёт в этот файл (отметка `[x]` + 1-3 строки итога).

**Дата:** 06.05.2026.

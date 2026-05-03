# План — Этап 1.2: TYPE_MAP пересмотр в import-annotations.js

**Ветка:** `feat/type-map-1.2` (создать от main)
**Источник:** `CURRENT_TASK.md` (спека v2 от 18.04.2026, Chat)

---

## Grep-проверки (до кода)

| Проверка | Результат | Вывод |
|---|---|---|
| `gene.*CDS` в `tests/` | 0 matches | Backend-тесты не проверяют `gene→CDS`. Diff `_TYPE_MAP` безопасен. |
| `ncRNA:` в `auto-annotate.js` | 1 match (строка 380, `'#14B8A6'`) | Ключ уже есть — НЕ перезаписывать. |
| `normalizeType(` в `src/` | 1 использование в `import-annotations.js:133` + 8 в тестах | Сигнатуру менять безопасно. |
| `normalizeDetailType(` в `src/` | 3 использования в `import-annotations.js:180,195,234` + тесты | В 3 push нужен `strand`. |
| `REGION_RENDER_RULES` | Только декларация в `annotation-model.js:16`, нет consumers | OUT из scope 1.2 (согласовано в спеке). |

---

## Карта изменений (файлы)

1. `src/pvcs/snapgene_parser.py` — 1 строка: `'gene': 'CDS'` → `'gene': 'gene'`
2. `gui/designer/src/import-annotations.js` — переписать `REGION_TYPES`, `DETAIL_TYPES`, `TYPE_MAP`, `DETAIL_TYPE_MAP`, `normalizeType`, gene-filter, `extractColor`, 3 push-объекта (strand), `EXON_BEARING_TYPES`; добавить `normalizeGeneType`, `GENE_CHILD_TYPES`
3. `gui/designer/src/auto-annotate.js` — добавить ~13 новых ключей в `ANNOTATION_COLORS` (НЕ трогать `ncRNA`, `variation`, `modified_base`)
4. `gui/designer/src/__tests__/import-annotations.test.js` — 5 правок (normalizeType с feat, normalizeDetailType новые значения, test «gene WITHOUT CDS» переписать)
5. `gui/designer/src/__tests__/import-annotations-typemap.test.js` — новый файл, ~20 тестов (Group A–E)
6. Координирующие: `BUGS.md`, `PROJECT_STATE.md`, `DECISIONS.md`, `CURRENT_TASK.md`

---

## Порядок (TDD-first, с чекпоинтами)

1. **Backend diff** (Шаг 1 спеки) + `pytest tests/ -x` → 112 ✅
2. **Тесты красные (red):** обновить существующие + создать новый тест-файл → `npx vitest run` → падения ожидаемые
3. **Код (green):** по Шагам 2–11 спеки в одном коммите (маленький blast radius — один файл `import-annotations.js` + `auto-annotate.js` colors)
4. `npx vitest run` → ~603 ✅
5. `npx vite build` → clean
6. Обновить координирующие .md (Шаг 14)
7. Финальная регрессия (Шаг 15)

---

## Ответы на «Вопросы к Chat» (defaults спеки, жду подтверждения)

1. **Gene с CDS + уникальный `/product`:** gene пропускаем, CDS использует своё `/label`/`/product`. Имя gene теряется. **Default: OK.**
2. **`exon` feature напрямую:** пропускаем (INSDC уже даёт `/exons` в CDS через `join()`). **Default: OK.**
3. **Heuristic «large unknown → region»:** оставляем как safety-net. **Default: OK.**

---

## Риски (все закрыты в спеке)
R1 SBOL fallback ✅ · R2 color fallback ✅ · R3 REGION_RENDER_RULES ✅ · R4 legacy catalytic — known limitation · R5 backend — минимальный diff · R6 gene-дубли — расширенный фильтр

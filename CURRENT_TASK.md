# CURRENT_TASK.md — MUTWIZ-SANITIZE quick-fix

**Статус:** ✅ РЕАЛИЗОВАНО 20.04.2026
**Автор спеки:** Claude Chat, 19.04.2026
**Приоритет:** MED (нарушение контракта Этапа 1.1)
**Оценка времени:** 15–20 минут / Фактическое: ~20 минут
**Ветка:** `feature/racetrack-canvas` (прямо в рабочей ветке после Sprint 1)
**Предыдущий этап:** Sprint 1 ✅ (634 Vitest)

---

## Что сделано

В `MutagenesisWizard.jsx` два legacy inline-regex заменены на централизованный `sanitizeSequence` из `sequence-utils.js` — контракт Этапа 1.1 (sanitize-at-entry) восстановлен.

### Правки

1. **Импорт:** добавлен `import { sanitizeSequence } from '../sequence-utils';` в `MutagenesisWizard.jsx:5`.
2. **Template textarea (строка 129):** `e.target.value.replace(/[^ATCGatcg]/g, '').toUpperCase()` → `sanitizeSequence(e.target.value)`.
3. **Insert DNA input (строка 238):** `e.target.value.toUpperCase().replace(/[^ATCG]/g, '')` → `sanitizeSequence(e.target.value)`. Placeholder расширен: `"CACCATCACCATCACCAT (6xHis) или CACCATNNKCATCAC (saturation)"`.

### Биологический эффект

Теперь IUPAC-коды (NNK, NNN, MNN, NDT для saturation mutagenesis, R/Y/S/W/K/M/B/D/H/V для ambiguity) **сохраняются** при вставке в template и insert-поля. До фикса `CACCATNNKCATCAC` молча превращался в `CACCATCATCAC` — мусор, нарушающий логику degenerate-codon libraries.

### Тесты

Новый файл `src/__tests__/mutagenesis-wizard-sanitize.test.jsx`, 3 render-based integration-теста:
1. Template textarea сохраняет IUPAC (NNK/RRY) и нормализует (BOM/whitespace/case).
2. Template textarea строго отбрасывает не-IUPAC (цифры, пунктуация, `z`).
3. Insert input в step 2 → type=insertion сохраняет `NNK` в saturation-кодоне.

Vitest: **634 → 637** (+3) ✅. Build: clean.

### Коммит

SHA: (см. git log)

---

## Что дальше

Пауза до Sprint 2 HANDOFF от Chat (V7 InsertionClock + V1/V2/V6 circular map polish, ~12–15 ч).

**Конец.**

# Sprint M-B.1 — Importer (simple/advanced + MoleculeWorkspace foundation)

**Статус:** ✅ РЕАЛИЗОВАНО 02.05.2026 (M-B.1 K1..K6 commits `1e25c7d` → `65aada3`, ветка `feature/racetrack-canvas`).

> **Архивная копия исходной спеки v1.1 от 02.05.2026 (после prototype v2/v3 critique).** M-B.1 baseline был superseded M-B.2 rework'ом (single-screen 4-column layout) в той же сессии 02.05.2026 — см. `docs/archive/SPRINT_M-B.2_IMPORTER_REWORK.md`. M-B.1 K1 (file-import refactor + primerSlice unified pool + Dexie v3) + K3 (simple-import) + K6 (AutonameModal + PrimerWizardStepModal) переиспользованы в M-B.2 as-is. K2 Step1Source + K4 MoleculeWorkspace + K5 Step2Combined + MultiFileList — выпилены / заменены в M-B.2.
>
> **Финальные результаты после v0.7.0 финализации:**
> - M-B.1 baseline: Vitest 834/834, build clean — `RELEASES.md` v0.6.4 sprint block.
> - V49 50-сек hang при default open Step2Combined (5333 bp / 12 регионов) обнаружен на pre-acceptance review → запустил M-B.2 rework через lazy-mount табов.
> - DEC-IMP-11 ⚓ (unified primer pool) + DEC-IMP-12 ⚓ (MoleculeWorkspace layout-only) сохранены в ANCHORS.md как M-B Kickoff fundamentals.
>
> **Где смотреть итоги:** `RELEASES.md` v0.6.4 + v0.7.0 sprint blocks; `BUGS.md` FIXED V49; `TECH_DEBT.md` DONE TD-V49-IMPORTER-HANG; `DECISIONS.md` Sprint M-B FINAL block (DEC-IMP-13..18); `ANCHORS.md` Sprint M-B FINAL (3 ⚓: DEC-IMP-15 lazy-mount tabs / DEC-DS-02 palette A+v2 / DEC-CAT-04 folder-as-slash-path).

---

# (Исходная спека ниже, не правится)

**Тип:** feature (новый workflow + foundation для Container Window M-C/M-D)
**База:** v0.6.3-alpha, финал Sprint M-A.3 (см. RELEASES.md). Bump после реализации: v0.6.3 → v0.7.0.
**Предпосылка:** Первая фундаментальная фича M-B милстоуна — точка входа внешних данных в BodgeGene. Без неё v0.6 застрял на M-A: пустые `+ New project` без способа загрузить плазмиду. Скоуп зафиксирован в DEC-IMP-01..05 + DEC-LIB-08 + DEC-REUSE-01 (ANCHORS.md), kickoff 01.05.2026 закрыл 9 развилок (§0.5), prototype v2/v3 critique 02.05.2026 закрыл архитектурные развилки (§0.6).

> **Статус (на момент написания):** 🟢 Готова к реализации. Prototype v3 approved. CURRENT_TASK.md обновлён. Code старт после approve финального текста спеки.

[остальное содержимое спеки v1.1 не приводится в архивной копии для экономии места — полный текст лежит в git history до момента архивации, smb checkout `feature/racetrack-canvas` коммит до архивации этого файла. Если нужна точная формулировка какого-то решения — ищи в `DECISIONS.md` Sprint M-B FINAL block + ANCHORS.md Sprint M-B Kickoff (DEC-IMP-01..05 + DEC-LIB-08 + DEC-REUSE-01) + ANCHORS.md Sprint M-B FINAL (3 новых ⚓).]

_Архивный stub создан 02.05.2026 при v0.7.0 финализации. Код v0.5 ImportStartScreen прочитан Chat'ом до написания спеки M-B.2 (правило userMemories: перед спекой на любой компонент с v0.5 аналогом — `Filesystem:read_text_file` на v0.5 код или скриншот, без исключений)._

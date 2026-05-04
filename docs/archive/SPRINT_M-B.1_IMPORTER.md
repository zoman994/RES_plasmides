# Sprint M-B.1 — Importer (simple/advanced + MoleculeWorkspace foundation)

**Статус:** ✅ РЕАЛИЗОВАНО 02.05.2026 (M-B.1 K1..K6 commits `1e25c7d` → `65aada3` на ветке `feature/racetrack-canvas`).

**Этот файл — заглушка-redirect.** Полный архивный stub с post-implementation summary живёт в `docs/archive/SPRINT_M-B.1_IMPORTER.md`. Где смотреть итоги:

- `RELEASES.md` блок **v0.6.4** — M-B.2 Importer Rework + post-acceptance polish (M-B.1 baseline в составе).
- `RELEASES.md` блок **v0.7.0** — M-B finale: catalog tree rewrite + folder-in-folder + auto-annotate cleanup.
- `BUGS.md` FIXED — V49 50-сек hang (закрыт через M-B.2 K4 lazy-mount).
- `TECH_DEBT.md` DONE — TD-V49-IMPORTER-HANG, TD-V05-IMPORTSTARTSCREEN-DELETE.
- `DECISIONS.md` Sprint M-B FINAL block — DEC-IMP-13..14, DEC-IMP-16..18, DEC-CAT-01..03, DEC-AA-01, DEC-MB-01..02 (sprint-level).
- `ANCHORS.md` Sprint M-B FINAL — 3 ⚓ (DEC-IMP-15 lazy-mount tabs, DEC-DS-02 palette A+v2, DEC-CAT-04 folder-as-slash-path) + Sprint M-B Kickoff (DEC-IMP-01..05 + DEC-LIB-08 + DEC-REUSE-01).

**Note.** M-B.1 baseline был superseded M-B.2 rework'ом в той же сессии 02.05.2026 (single-screen 4-column layout заменил Step1→Step2 двухэкранный flow). M-B.1 K1 (file-import refactor + primerSlice + Dexie v3) + K3 (simple-import) + K6 (AutonameModal + PrimerWizardStepModal) переиспользованы в M-B.2 as-is. K2/K4/K5 (Step1Source / MoleculeWorkspace mount / Step2Combined + MultiFileList) выпилены или заменены.

**Этот стаб может быть удалён вручную** (Filesystem MCP не имеет delete-операции). При следующей ротации: `Remove-Item docs\SPRINT_M-B.1_IMPORTER.md`.

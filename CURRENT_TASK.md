# CURRENT_TASK.md

## v0.7.2 финализирован 06.05.2026

**Статус:** ✅ ЗАКРЫТ — `feature/sequence-view-feature-strip` на коммите `322031c`, версия в `package.json` + `lib/version.js` бампнута 0.7.0 → 0.7.2.
**Что вошло:** см. `RELEASES.md` блок v0.7.2 — M-X.2 Annotation Editing + embedded Annotator (three-level LevelPanel + ghost drill-in) + UX-1/2/3 + perf wave (predictor Worker + idle prewarm + content-visibility removal) + animation polish.
**Тесты:** 1421/1422 (1 pre-existing flake `primer-wizard.test.jsx:79`). Build clean. Predictor.worker chunk 12.62 KB.
**Архив спек:** `docs/SPRINT_M-X.2_ANNOTATION_EDITING_AND_ANNOTATOR.md` + `docs/SPRINT_M-X.2-FIX_ARCH_CLEANUP.md` → `docs/archive/` со штампом `**Статус:** ✅ РЕАЛИЗОВАНО 06.05.2026`.

---

## Следующий цикл — биолог решает

**Кандидаты (по `PROJECT_STATE.md` «Что дальше» + `docs/ARCHITECTURE_v2.md` §7 Roadmap):**

1. **M-X.3 Wrap-tail rendering** — circular plasmid SequenceView wraps от 3' до 5' конца через origin (TD-WRAPTAIL-RENDERING).
2. **M-X.4 Library Save Flow** — overwrite / save as version / migration accepted ghosts → confirmed annotations в `entry.payload.annotations` (закроет TD-LIBRARY-WRITE-API).
3. **M-C Container Window kickoff** — следующий milestone по Roadmap. Использует SequenceView (B.3) + caret sync (DEC-SV-01) + scrollIntoView pattern (DEC-SV-02). Промоция кандидатов ⚓ DEC-LIB-11 / DEC-EDIT-PARITY-01 / DEC-IMPORTER-TARGETS-01 если паттерн повторяется.
4. **AnnotationTrack декомпозиция** (TD-ANNOTATIONTRACK-DECOMPOSE-V2) — 41.6 KB hard violation остался, разнести на ~3 sub-modules (predicted styling / drag handlers / hover overlays). Может идти параллельно с любым выше.
5. **NCBI GenBank integration** (TD-OPEN-PLASMID-REPOS) — public domain, fungal-focused queries для тематики Игоря.

**До старта следующего:** биолог открывает CHAT_PLAYBOOK_CORE.md §1, перечисляет приоритеты, Chat пишет спеку в `docs/SPRINT_*.md` и копирует задачи сюда.

---

**Дата:** 06.05.2026.
**Финализатор:** Claude (loop /loop тик).

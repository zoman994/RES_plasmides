# Sprint M-B.2 — Importer Rework: single-screen + lazy tabs

**Статус:** ✅ РЕАЛИЗОВАНО 02.05.2026 (K1..K6 commits `f2554fd` → `c36d7bc` на ветке `feature/racetrack-canvas`, поверх M-B.1 baseline + 2 fix-коммита).

**Этот файл — заглушка-redirect.** Полный архивный stub с post-implementation summary живёт в `docs/archive/SPRINT_M-B.2_IMPORTER_REWORK.md`. Где смотреть итоги:

- `RELEASES.md` блок **v0.6.4** — M-B.2 K1..K6 + 3 round'а post-acceptance polish (Игорь напрямую с Code: catalog scroll-anchor, Library wipe + TagsEditor, palette A+v2 + canonical-key, StartScreen UX, simple-mode rip).
- `RELEASES.md` блок **v0.7.0** — M-B finale: catalog tree rewrite (no drilldown / depth-tint / file-manager hover-icons / folder-as-slash-path) + drag-and-drop library cards + auto-annotate cleanup + AnnotationEditor critical fixes + UI mini-map polish + LinearFeatureBar greedy-pack + origin-rotate moved on SequenceTab.
- `BUGS.md` FIXED — V49 50-сек hang (закрыт через M-B.2 K4 lazy-mount, регрессия-guard `lazy-tabs.test.jsx::default-overview-no-annotation-editor`).
- `TECH_DEBT.md` DONE — TD-V49-IMPORTER-HANG, TD-V05-IMPORTSTARTSCREEN-DELETE; новые OPEN — TD-DRAG-DROP-LIBRARY-CARDS (M-H), TD-PER-CDS-SIGNALIP (M-D), TD-MINE-TAG-GROUPING-DEPRECATED (M-H, post-mortem default approval ошибки).
- `DECISIONS.md` Sprint M-B FINAL block — sprint-level DEC-IMP-13..14, DEC-IMP-16..18, DEC-CAT-01..03, DEC-AA-01, DEC-MB-01..02.
- `ANCHORS.md` Sprint M-B FINAL — 3 ⚓ (DEC-IMP-15 lazy-mount tabs, DEC-DS-02 palette A+v2 + canonical-key, DEC-CAT-04 folder-as-slash-path), counter 48 → 51.

**Note про процесс.** Цикл M-B оказался ≥6 итераций (M-B.1 v1.0 → M-B.1 v1.1 prototype-driven → 2 fix-коммита → M-B.2 K1..K6 single-screen rewrite → 3 round'а direct Code polish → v0.7.0 catalog tree rewrite + drag-and-drop + AnnotationEditor critical). Рабочий вывод (зафиксирован в userMemories + кандидат правила в CHAT_PLAYBOOK.md): после того как baseline собран архитектурным спринтом — UI fine-tuning идёт direct Code editing напрямую, не Chat-spec. Chat возвращается на: новая архитектурная развилка, неочевидный bug, кросс-компонентная инвариантность. Tag-grouping default approval по §10.1 спеки (sub-grouping «Моя библиотека» по `entry.tags`) был ошибкой Chat'а — не проверил готовность tag-search infrastructure. v0.7.0 catalog tree rewrite фактически заменил tag-grouping на folder-as-slash-path без отдельной Chat-спеки. Antipattern 7 «эстетика подменяет функцию» из CHAT_PLAYBOOK §6 поймал бы это, не сработал.

**Этот стаб может быть удалён вручную** (Filesystem MCP не имеет delete-операции). При следующей ротации: `Remove-Item docs\SPRINT_M-B.2_IMPORTER_REWORK.md`.

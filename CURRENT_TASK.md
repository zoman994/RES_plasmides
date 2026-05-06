# CURRENT_TASK.md

## v0.7.3 финализирован 06.05.2026

**Статус:** ✅ ЗАКРЫТ — `feature/sequence-view-feature-strip` на коммите `20f1c7f`, версия в `package.json` + `lib/version.js` бампнута 0.7.2 → 0.7.3.
**Что вошло:** см. `RELEASES.md` блок v0.7.3 — Sprint M-X.3 K1-K6 Wrap-tail rendering + 11 раундов polish (caret-transition gating, shift-anchor leading, scroll-handle filter, perf wave PERF-1/3/4/5, MetaColumn TopologyPill, last-char fix, wrap-aware selection, boundary collapse, inline wrap-bridge, frame-merge epsilon).
**Тесты:** ~1455/1455 passing (+27 нетто vs v0.7.2). pytest 112/112. Build clean.
**Архив спеки:** `docs/SPRINT_M-X.3_WRAPTAIL_RENDERING.md` → `docs/archive/` со штампом `**Статус:** ✅ РЕАЛИЗОВАНО 06.05.2026`.

---

## Следующий цикл — биолог решает

**Кандидаты (по `PROJECT_STATE.md` «Что дальше» + `docs/ARCHITECTURE_v2.md` §7 Roadmap):**

1. **TD-WRAP-BRIDGE-WRAP-AWARE-TRACKS** — wrap-half bridge line сейчас не рендерит annotations / primers / RE / AA (только DNA strands + ruler корректно). Если features часто пересекают origin (биолог регулярно работает с такими) — следующий приоритет. Требует расширения filtering логики в каждом из 4 треков (~1-2 дня).

2. **TD-CIRCULAR-SELECTION** — полноценная wrap-aware navigation. Round-8 partial: drag-extend через wrap-tail работает, но click on wrap-tail остаётся blocked. Для click-to-place caret в wrap-tail row либо для shift+click extend через origin нужен дополнительный код. Также keyboard wrap (стрелка ←/→ через 0/seqLen). Совместимо с TD-1.

3. **M-X.4 Library Save Flow** — overwrite / save as version / migration accepted ghosts → confirmed annotations в `entry.payload.annotations` (закроет TD-LIBRARY-WRITE-API).

4. **M-C Container Window kickoff** — следующий milestone по Roadmap. Использует SequenceView (B.3) + caret sync (DEC-SV-01) + scrollIntoView pattern (DEC-SV-02) + wrap-tail (DEC-WRAPTAIL-01..03). Промоция кандидатов ⚓ при reuse.

5. **AnnotationTrack декомпозиция** (TD-ANNOTATIONTRACK-DECOMPOSE-V2) — 41.6 KB hard violation остался. Параллельно с любым выше.

6. **NCBI GenBank integration** (TD-OPEN-PLASMID-REPOS) — public domain, fungal-focused queries для тематики Игоря.

**До старта следующего:** биолог открывает CHAT_PLAYBOOK_CORE.md §1, перечисляет приоритеты, Chat пишет спеку в `docs/SPRINT_*.md` и копирует задачи сюда.

---

**Дата:** 06.05.2026.
**Финализатор:** Claude (auto mode после round-11 принятия).

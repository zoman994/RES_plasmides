# Sprint M-B.2 — Importer Rework: single-screen + lazy tabs

**Статус:** ✅ РЕАЛИЗОВАНО 02.05.2026 (M-B.2 K1..K6 commits `f2554fd` → `c36d7bc`, ветка `feature/racetrack-canvas`).

> **Архивная копия исходной спеки v1.0 от 02.05.2026.** Реализована Code one-shot за одну сессию (881 тест, build clean). После M-B.2 acceptance baseline прошёл 3 round'а post-acceptance polish напрямую с Code (Игорь правил UI fine-tuning без Chat-spec — см. CHAT_PLAYBOOK §13 type C/D классификация) и затем v0.7.0 catalog tree rewrite (DEC-CAT-01..04). Финальная версия после всего цикла — v0.7.0, 885 тестов.
>
> **Корневой триггер M-B.2:** M-B.1 на pre-acceptance review показал (а) UX-mismatch с v0.5 single-screen эталоном — Step1→Step2 двухэкранный flow расходился с привычным workflow биолога; (б) V49 50-сек hang на default open Step2Combined (5333 bp / 12 регионов) из-за heavy MoleculeWorkspace mount. M-B.2 закрыл оба провала одним rework'ом UI слоя поверх стабильной M-B.1 K1+K3+K6 infrastructure.
>
> **Решённые архитектурные вопросы (sprint-level → DECISIONS.md Sprint M-B FINAL):**
> - DEC-IMP-13 single-screen 4-column layout
> - DEC-IMP-14 CatalogColumn 4 sources
> - DEC-IMP-16 perFileEdits as edit channel
> - DEC-IMP-17 SessionSummary footer accumulating
> - DEC-IMP-18 MoleculeWorkspace keep but not imported in Importer
>
> **⚓ Fundamental decisions (→ ANCHORS.md Sprint M-B FINAL):**
> - DEC-IMP-15 lazy-mount heavy tab content as performance & memory invariant
>
> **Финал v0.7.0 после polish + catalog tree rewrite (→ DECISIONS.md / ANCHORS.md Sprint M-B FINAL):**
> - DEC-CAT-01..03 sprint-level (no drilldown / depth-tint / file-manager hover-icons)
> - DEC-CAT-04 ⚓ folder-as-slash-path
> - DEC-DS-02 ⚓ feature palette A+v2 + canonical-key
> - DEC-AA-01 sprint-level (auto-annotate cleanup)
> - DEC-MB-01 sprint-level (Library fullscreen wipe → Importer CatalogColumn)
> - DEC-MB-02 sprint-level (origin-rotate moved from MetaColumn to SequenceTab)
>
> **Где смотреть итоги:**
> - `RELEASES.md` v0.6.4 sprint block (M-B.2 + 3 polish round'а) + v0.7.0 sprint block (catalog tree rewrite + folder-in-folder + auto-annotate cleanup).
> - `BUGS.md` FIXED V49.
> - `TECH_DEBT.md` DONE TD-V49-IMPORTER-HANG, новые TD: TD-DRAG-DROP-LIBRARY-CARDS, TD-PER-CDS-SIGNALIP, TD-MINE-TAG-GROUPING-DEPRECATED.

---

# (Исходная спека v1.0 от 02.05.2026 ниже, не правится)

**Тип:** refactor (UI rewrite поверх M-B.1 infrastructure) + регрессионный bugfix
**База:** v0.6.3, ветка `feature/racetrack-canvas`, M-B.1 финальный коммит `65aada3` (K6).

§0.5 kickoff Q&A (immutable snapshot 02.05.2026), §0.6 approval defaults по §10.1-10.4, §1 контекст про M-B.1 pre-acceptance review + V49 root cause, §2 стратегия (single-screen 4-column + lazy tabs), §3 IN/OUT scope, §4 архитектурные решения DEC-IMP-13..18, §5 предположения, §6 K1..K6 задачи, §7 порядок K1→K6, §8 STOP + формат отчёта, §9 риски, §10 open questions (closed by §0.6 approval defaults).

[Полный текст спеки v1.0 (53 KB) не дублируется в архивной копии для экономии места — лежит в git history до момента архивации. Все архитектурные решения зафиксированы в `DECISIONS.md` Sprint M-B FINAL block + `ANCHORS.md` Sprint M-B FINAL block. Если нужна точная формулировка scope IN/OUT или K-шага — ищи в git log по дате 2026-05-02.]

**Post-mortem (≥2 итераций цикл).**

Цикл M-B имел **6+ итераций** between Chat и Code:
1. M-B.1 spec v1.0 (Chat) → Code one-shot K1..K6.
2. Pre-acceptance review (Chat) — обнаружил UX-mismatch + V49 hang → переход в M-B.2.
3. M-B.2 spec v1.0 (Chat, 53 KB) → Code one-shot K1..K6.
4. Post-acceptance polish round 1 «Critical» (Code+Игорь напрямую): AppShell layout fix, addCatalogItem props, EmptyInspector context-aware.
5. Post-acceptance polish round 2 «Visual + simple-mode rip» (Code+Игорь напрямую): simple/advanced toggle убран, uppercase labels recolor, AnnotationsTab feature-bar v0.5-style.
6. Post-acceptance polish round 3 «Palette A+v2» (Code+Игорь напрямую): feature palette переписана, shade-by-canonical-key, DESIGN_SYSTEM §2.1.
7. v0.7.0 catalog tree rewrite (Code+Игорь напрямую): drilldown → fully inline, depth-tint, folder-as-slash-path, file-manager hover-icons.
8. v0.7.0 auto-annotate cleanup (Code+Игорь напрямую): linker / promoter / terminator sub-features удалены.
9. v0.7.0 catalog perf (Code+Игорь напрямую): React.memo + ItemRow comparator + inline vbox sync.
10. v0.7.0 drag-drop + read-only protections (Code+Игорь напрямую).

**Root causes не выловленные в спеках:**
- M-B.1 спеку v1.0 Chat писал без чтения v0.5 ImportStartScreen кода — пропустил single-screen эталон. **Болевой урок:** перед спекой на любой компонент с v0.5 аналогом — `Filesystem:read_text_file` на v0.5 код ИЛИ скриншот, без исключений (зафиксировано в userMemories 02.05.2026).
- M-B.2 спека v1.0 (53 KB) переразмерна по сравнению с план-целью §13 CHAT_PLAYBOOK type A (20-30 KB). Принято в «красном режиме» при approval Игоря. После v0.7.0 — стало ясно что для UI fine-tuning после baseline собран Chat-spec process не оправдан: rounds 1-3 + v0.7.0 polish сделаны Игорем напрямую с Code за минуты, аналог Chat-spec → Code-implement цикла занял бы часы.
- DEC-IMP-14 default approval по §10.1 (sub-grouping «Моя библиотека» по `entry.tags`) был ошибкой Chat'а — не проверил что tag-search infrastructure готова. Биолог явно сказал «таги вообще лишнее, пока поиск по тегам не реализован». v0.7.0 catalog tree rewrite фактически исправил выбор без Chat-spec — antipattern 7 (эстетика подменяет функцию) из CHAT_PLAYBOOK §6.

**Вывод:**
- Для архитектурных слоёв (state hook refactor, lazy-mount strategy, multi-source CatalogColumn) Chat-spec оправдан и работает.
- Для UI fine-tuning после baseline собран — direct Code editing default. Chat подключается обратно когда: (а) появилась новая архитектурная развилка; (б) баг с неочевидной причиной; (в) кросс-компонентная инвариантность ломается. Простое «подкрути цвет / добавь поле / переставь блок» — Code напрямую.
- Третий sanity-вопрос §2 CHAT_PLAYBOOK (решит ли это проблему / сделает хуже) должен ловить case'ы как DEC-IMP-14 default tag-grouping. Не поймал — не проверил готовность инфраструктуры. Пополнить опыт.

_Архивный stub создан 02.05.2026 при v0.7.0 финализации._

# CURRENT_TASK — SEARCH-GAPPED-DNA

**Статус:** 🟡 ГОТОВО К ИСПОЛНЕНИЮ
**Дата:** 17.07.2026
**Спека:** [`docs/specs/SPEC_GAPPED_DNA_SEARCH.md`](docs/specs/SPEC_GAPPED_DNA_SEARCH.md)
**Scope:** только DNA Search; код вне перечисленного scope не трогать.
**Предыдущая задача:** глобальная очистка завершена 17.07.2026; история сохранена в Git/checkpoint.

## Цель

Сделать единый query-global / target-local DNA-поиск, в котором один порог сходства одинаково учитывает substitutions, insertions и deletions для коротких/длинных запросов, обеих цепей, IUPAC и кольцевых молекул.

Контрольный пользовательский сценарий:

- exact 20 нт → 100%;
- одна лишняя буква → 20/21 = 95,24%, hit остаётся при 80%;
- четыре замены → 80%, hit остаётся;
- пять замен → 75%, hit исчезает.

## Неподвижные решения

1. Весь query выравнивается; partial seed не является hit.
2. Concrete identity: `M / (M + X + I + D)`.
3. При ambiguity: `identity=null`, порог применяется к compatibility.
4. Float threshold нормализуется один раз в integer basis points; boundary 80,00% не зависит от float drift.
5. `maxMismatches` больше не конкурирует с identity threshold в DNA Search.
6. Один core используется global Library search и SequenceSearchPopover.
7. Heavy compute только в worker; cancel/stale-drop/incomplete/strict-final-AND не ломать.
8. `library-search.js` и `query-classify.js` новой логикой не расширять; `LibraryWorkspace.jsx` — только SearchHost wiring с нулевой/отрицательной дельтой.
9. Новый алгоритм — в отдельных модулях под size budget.
10. Любой resource/candidate cutoff без полного scan → incomplete, не «0 совпадений».
11. Код строго TDD: RED → GREEN → focused → full/build/browser.

## Разрешённая поверхность

Новые:

- `gui/designer/src/lib/dna-approx-scan.js`;
- `gui/designer/src/lib/dna-gapped-align.js`;
- `gui/designer/src/lib/dna-gapped-search.js`;
- тестовые helpers/fixtures и тесты этих модулей.

Существующие — только по необходимости спеки:

- `gui/designer/src/lib/seq-match.js`;
- `gui/designer/src/lib/sequence-search-bio.js` — exact fast path, без расширения fuzzy-логики;
- `gui/designer/src/lib/search-types.js`;
- `gui/designer/src/lib/search-prefs.js`;
- `gui/designer/src/lib/search-worker-core.js`;
- `gui/designer/src/lib/search-worker-client.js`;
- `gui/designer/src/lib/search-facade.js` — только session failure/incomplete wiring;
- `gui/designer/src/lib/search-provider-failures.js` — только typed `RESOURCE_LIMIT`;
- `gui/designer/src/lib/search-provider-contract.js` — только sequence metrics/edit-run validation без регрессии protein/enzyme;
- `gui/designer/src/lib/search-result-format.js`;
- `gui/designer/src/lib/search-result-vm.js`;
- `gui/designer/src/components/Library/LibrarySmartSearchBar.jsx`;
- `gui/designer/src/components/Library/SearchSettingsModal.jsx`;
- `gui/designer/src/components/SequenceSearchPopover.jsx`;
- `gui/designer/src/components/SequenceView/overlays/SearchHitsOverlay.jsx`;
- `gui/designer/src/components/Library/LibraryWorkspace.jsx` — только SearchHost wiring; при росте сначала вынести SearchHost в новый leaf;
- соответствующие search tests, i18n keys;
- `docs/guides/USER_GUIDE_SEARCH.md` и `docs/guides/TECHNICAL_GUIDE_SEARCH.md` только в K4;
- `BUGS.md` и `docs/BACKLOG.md` по процессу закрытия.

Любой дополнительный production-файл → STOP с доказательством необходимости.

## K0 — baseline и RED-контракт

- [ ] Перечитать спеку целиком.
- [ ] Активировать `tdd-enforce`, `size-budget`, `scope-stop`; для UI — `design-system`/`ui-interactions`.
- [ ] Снять актуальные sizes, git state, focused/full test и build baseline.
- [ ] Записать BG-020 в `BUGS.md` до исправления либо подтвердить уже созданную запись.
- [ ] Characterisation: доказать short-indel miss, short threshold bypass и отрицательную/100%-при-gap метрику старого engine.
- [ ] Создать test-only exhaustive/Pareto glocal oracle, оптимизирующий нормативную identity tuple, а не только edit distance.
- [ ] Добавить RED-матрицу §6 спецификации; тестировать переходы/позиции параметризованно, а не по одному примеру.

**Gate K0:** дефекты воспроизводятся ожидаемым RED; production code ещё не написан.

## K1 — concrete linear engine

- [ ] Bit-parallel approximate-substring candidate scan без обязательного exact seed.
- [ ] Bounded glocal traceback.
- [ ] Canonical edit runs `= / X / I / D`.
- [ ] Один occurrence на `(strand, normalizedStart)`; лучший end/alignment по tuple из спеки.
- [ ] Full-query coverage, overlaps, stable tie-break.
- [ ] Симметричные, неотрицательные metrics.
- [ ] Differential/property tests против oracle.
- [ ] Mutation gates: снять I, снять D, вернуть query-length denominator, потребовать 8-mer seed.

**Gate K1:** concrete linear matrix зелёная; каждая обязательная мутация RED; новые модули ниже size limits.

## K2 — IUPAC, strands, circular, budgets

- [ ] IUPAC bit masks и operation `~`.
- [ ] Honest compatibility/identityLowerBound.
- [ ] Reverse complement, mapping query indices, `bothStrands:false`.
- [ ] Palindrome merge только для эквивалентного alignment.
- [ ] Circular origin, gapped wrap, два segments, запрет second lap.
- [ ] Low-complexity streaming, deterministic limit.
- [ ] Typed `RESOURCE_LIMIT`: worker/inline отбрасывают sequence hits и дают deferred metadata + incomplete.
- [ ] Детерминированный benchmark 1 Mb; отдельный stress 10 Mb.

**Gate K2:** alphabet/topology/property/mutation cluster зелёный; production scan не работает в UI thread.

## K3 — production integration

- [ ] `seq-match.js` использует unified core для всех fuzzy DNA lengths/topologies.
- [ ] Threshold 100% MAY использовать доказанно эквивалентный exact fast path.
- [ ] Worker/facade сохраняют strict AND, provider failures, pending, cancel и stale-drop.
- [ ] Worker/inline boundary валидирует sequence metrics/edit runs; malformed payload → incomplete.
- [ ] Search prefs v2: миграция v1, удалить DNA `maxMismatches`, сохранить остальные значения.
- [ ] Сохранение Settings немедленно пересчитывает текущий query.
- [ ] Result metrics используют alignmentLength и объясняют substitutions/indels/IUPAC.
- [ ] Best occurrence применяет нормативный tie-break.
- [ ] SequenceSearchPopover использует тот же core через worker, без sync DP в `useMemo`.
- [ ] Popover получает topology; SearchHitsOverlay использует canonical segments/edit runs и корректно рисует wrap.
- [ ] Global и Popover parity tests.

**Gate K3:** один и тот же query/target/settings даёт одинаковые locations/metrics в обеих поверхностях.

## K4 — acceptance и закрытие

- [ ] Вся TDD-матрица и mutation proof.
- [ ] Focused search cluster.
- [ ] Полный frontend test.
- [ ] `npx vite build`.
- [ ] Scoped lint.
- [ ] Size report; новые hard-нарушители запрещены.
- [ ] Browser smoke: exact, insertion start/middle/end, deletion, 4/5 substitutions, reverse strand, circular origin, IUPAC, live prefs.
- [ ] Отдельно назвать test-covered и live-verified состояния.
- [ ] Обновить оба Search guide по фактическому поведению.
- [ ] Закрыть BG-020 и убрать реализованный backlog-пункт только после зелёной приёмки.
- [ ] Финальный sprint-report, затем STOP. Другие функции поиска не начинать.

## Запрещено

- Писать новый gap-код в `library-search.js` или старый near-hard `sequence-search.js`.
- Полный DP `query × target` в production.
- Silent heuristic/candidate cutoff.
- Считать `N/R/Y` доказанной identity.
- Оставить short query на отдельном `maxMismatches`-контракте.
- Менять protein/cut/primer/alignment/intron functionality.
- Добавлять Rust/WASM без измеренного gate.
- Ослаблять тесты/timeout ради зелёного отчёта.
- Делать commit/stage без прямого разрешения пользователя.

## Формат каждого отчёта Code

1. **Что изменилось.**
2. **Что это даёт биологу.**
3. **Какой риск устранён.**
4. **Как проверить вручную.**
5. RED→GREEN, mutation proof, focused/full/build/browser.
6. Sizes и точный git state.
7. Честные отклонения и что проверено только harness-тестом.

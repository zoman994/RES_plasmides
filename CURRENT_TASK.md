# CURRENT_TASK.md — Sprint 1: Читаемые метки, чистые стыки, настоящий мутагенез

**Статус:** ✅ РЕАЛИЗОВАНО 20.04.2026
**Автор спеки:** Claude Chat, 19.04.2026 (две части: `CURRENT_TASK_PART2.md` дополняла первую)
**Приоритет:** V5 (MED, quick win) → V3 (MED, quick win) → V4 (CRIT, core workflow)
**Оценка времени:** 10–12 часов / Фактическое: ~3 часа
**Ветка:** работа выполнена на `feature/racetrack-canvas` (`feat/sprint1-complete` не создавалась из-за грязного рабочего дерева).
**Предыдущий этап:** 1.2 TYPE_MAP ✅ (`5837801`)

---

## Итог по коммитам

| # | SHA | Коммит | Тесты |
|---|---|---|---|
| 1 | `7521dcb` | `feat(v5): contrast-aware annotation bar text` | 604 → 611 (+7) |
| 2 | `50d8bf0` | `fix(v3): reset junction fields on type switch` | 611 → 617 (+6) |
| 2b | `67ae2ee` | `fix(v3-bulk): reset junction fields in bulk gg-switch (App.jsx)` | 617 → 618 (+1) |
| 3 | `e0f48cd` | `feat(v4-helper): buildMutagenesisPayload + app isMutagenesis guard` | 618 → 624 (+6) |
| 4 | `20e7df0` | `fix(v4-wizard): wire mutagenesis strategy from wizard to canvas` | 624 → 627 (+3) |
| 5 | `ea96ca2` | `feat(v4-overlap): local-primer-design respects junction.overlapSequence` | 627 → 629 (+2) |
| 6 | `2f66348` | `fix(v4-inplace): handleSaveFragment uses full strategy with fragment split` | 629 → 634 (+5) |

**Итог:** Vitest 604 → **634 ✅** (+30, точно как в прогнозе спеки). Pytest **112 ✅**. Build clean на каждом коммите.

---

## Изменённые файлы

### Source (6)
- `gui/designer/src/lib/color-utils.js` **[новый]** — `getTextColor(bgHex)` helper
- `gui/designer/src/lib/junction-utils.js` **[новый]** — `resetJunctionForType(j, newType)` helper
- `gui/designer/src/lib/mutagenesis-payload.js` **[новый]** — `buildMutagenesisPayload(result, ctx)` helper
- `gui/designer/src/components/AnnotationEditor.jsx` — inline `color: getTextColor(color)` (линия 236)
- `gui/designer/src/components/JunctionBlock.jsx` — 6 call-sites через helper
- `gui/designer/src/components/MutagenesisWizard.jsx` — onComplete payload расширен
- `gui/designer/src/App.jsx` — bulk GG-switch через helper + isMutagenesis guard в useEffect
- `gui/designer/src/hooks/useFragmentHandlers.js` — handleMutagenesis + handleSaveFragment через strategy
- `gui/designer/src/local-primer-design.js` — приоритет `junction.overlapSequence` в split-mode

### Тесты (6, +30 тестов)
- `gui/designer/src/__tests__/color-utils.test.js` **[новый]** — 7
- `gui/designer/src/__tests__/junction-utils.test.js` **[новый]** — 7 (6 базовых + 1 bulk)
- `gui/designer/src/__tests__/mutagenesis-payload.test.js` **[новый]** — 6
- `gui/designer/src/__tests__/handle-mutagenesis.test.js` **[новый]** — 3 integration
- `gui/designer/src/__tests__/local-primer-design-overlap.test.js` **[новый]** — 2
- `gui/designer/src/__tests__/handle-save-fragment.test.js` **[новый]** — 5 integration

### Координация
- `BUGS.md`, `PROJECT_STATE.md`, `DECISIONS.md`, `CURRENT_TASK.md`

---

## Что ждёт визуальной проверки Игорем

### V5 — проверка opportunistic
pUC118/pET-28a → жёлтый AmpR-промотор → подпись читается тёмным; синий CDS → белым.

### V3 + 2b
1. 3 фрагмента с ligation (NcoI+KpnI) → context-menu переключить один на Golden Gate → метки NcoI/KpnI очистились, BsaI overhang появился.
2. Bulk «Перевести всю сборку в Golden Gate» → все стыки очистились от reEnzyme, все показывают BsaI с auto-designed overhang.
3. Обратное переключение → поле фермента пустое.
4. `overlapLength`/`overlapMode` сохраняются через все переключения.

### V4 — Wizard-путь
1. **Single KLD** (E245A): `IS001_mut_fwd_AmpR` + `IS002_mut_rev_AmpR` в primer panel; протокол: Обратная ПЦР → DpnI 1 ч 37°C → KLD 25°C 30 мин → Трансформация → Colony PCR → Секвенирование.
2. **Double close (<100 bp):** KLD с warning «Обе мутации закодированы в fwd-праймере».
3. **Double distant (>100 bp):** two_fragment → 2 фрагмента на canvas, overlap-стык с `containsMutation: true`; auto-design подхватывает `overlapSequence` и генерирует primers с мутацией в tail.
4. **Triple distant:** multi_fragment → 3 фрагмента, 2 overlap-стыка.

### V4 — In-place путь **(критично)**
1. **Single KLD in-place на 1-fragment canvas:** двойной клик → FragmentEditor → Мутагенез → 1 замена → Apply → фрагмент остался, 2 мутагенезных олига, олиги НЕ стираются при re-render (**V4-A guard**).
2. **In-place на многофрагментной сборке:** 3 фрагмента, двойной клик по одному, 1 мутация → мутагенезные олиги добавлены к существующим, через 1 сек auto-design их не стирает, в протоколе и overlap-PCR шаги и KLD-шаги.
3. **Two-fragment in-place:** product circular → FragmentEditor → 2 далёкие мутации → Apply → **фрагмент разбился на 2**, overlap-стык между ними с `containsMutation`, auto-design кладёт мутацию в primer tail (V4-E), протокол — overlap PCR без DpnI.
4. **No-PCR guard:** фрагмент помечен без ПЦР → 2 далёкие мутации → появляется apiWarning «без ПЦР — многофрагментный мутагенез невозможен»; canvas не меняется.
5. **Повторный мутагенез:** мутагенез → ещё один мутагенез на том же фрагменте → старые мутагенезные олиги заменены новыми (non-mutagenesis сохранены).

**Критерий приёмки:** пункты 1–5 V4 in-place проходят полностью.

---

## Новый баг, зарегистрированный после спринта

- **MUTWIZ-SANITIZE (MED):** `MutagenesisWizard.jsx` textarea использует legacy regex `/[^ATCGatcg]/g` вместо `sanitizeSequence` — нарушение контракта Этапа 1.1 (IUPAC теряется). Добавлен в BUGS.md OPEN. Quick fix на будущий спринт.

---

## После подтверждения визуальной проверки

Переместить:
- `CURRENT_TASK.md` → `docs/archive/CURRENT_TASK_SPRINT1.md`
- `CURRENT_TASK_PART2.md` → `docs/archive/CURRENT_TASK_SPRINT1_PART2.md`
- `HANDOFF_SPRINT1.md` → `docs/archive/HANDOFF_SPRINT1.md`

Создать новый `CURRENT_TASK.md` для Sprint 2 (V7 InsertionClock + V1/V2/V6 как side-effects).

---

**Следующий шаг:** Chat пишет спеку Sprint 2, когда Игорь подтвердит визуальные проверки V4 in-place.

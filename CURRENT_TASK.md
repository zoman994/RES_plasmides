# CURRENT_TASK.md — Sprint 1.5 «Мутагенез v2»

**Статус:** 🚧 В РАБОТЕ (начат 2026-04-21)
**Спека:** `docs/SPRINT_1_5_MUTAGENESIS_V2.md`
**Приоритет:** HIGH — блокирует Sprint 2 (V7 InsertionClock)
**Оценка:** 6–8 часов, 4 коммита
**Ветка:** `feature/racetrack-canvas`
**Предыдущий этап:** Sprint 1 ✅ + MUTWIZ-SANITIZE ✅ (637 Vitest)

---

## Цель

Исправить три архитектурных и один data-баг мутагенеза, найденных визуальной приёмкой Sprint 1:

- **V14** `chooseStrategy` → не знает контекст фрагмента (линейный кусок в сборке получает KLD)
- **V12** FragmentEditor смешивает bookkeeping-правку sequence и мутагенез в одном UI
- **V13** «Мутагенез» в footer PlasmidViewer открывает пустой Wizard
- **V11** KLD-олиги приходят с `tmBinding: 0, gcPercent: 0`

После Sprint 1.5 мутагенез корректен по всем трём UX-путям (Wizard, in-place FragmentEditor, PlasmidViewer footer).

---

## Коммиты

### K1 — V14 strategy context (2 ч)
- [ ] `chooseStrategy(mutations, fragmentContext)` с default `{topology:'circular', isStandalone:true}`
- [ ] `computeMutagenesisStrategy` прокидывает `options.fragmentContext`
- [ ] `handleSaveFragment` собирает context из active.circular, fragments.length, length
- [ ] `MutagenesisWizard.compute` передаёт `{topology:'circular', isStandalone:true}`
- [ ] +5 unit-тестов strategy, regression на существующих
- [ ] `fix(v14): chooseStrategy respects fragment topology and isStandalone context`

### K2 — V12 FragmentEditor mode switcher (3 ч) — **ВИЗУАЛЬНАЯ ПРОВЕРКА ДО КОММИТА**
- [ ] State `mode: 'edit' | 'mutagenesis'` + радио над tabs
- [ ] Mode=edit: клик по нт = inline input, AA отключён, quick actions активны
- [ ] Mode=mutagenesis: popup'ы DNA+AA, quick actions disabled
- [ ] Confirm при переключении если mutations.length > 0
- [ ] Раздельные `handleSaveEdit` (без mutations, +editHistory) и `handleSaveMutagenesis` (через strategy)
- [ ] +6 integration-тестов через @testing-library/react
- [ ] **STOP до визуала**: показать Игорю → коммитить только после подтверждения
- [ ] `feat(v12): FragmentEditor mode switcher separates edit from mutagenesis`

### K3 — V13 Wizard template passthrough (1 ч)
- [ ] MutagenesisWizard props: `initialTemplateSeq/Name/Organism/CdsStart/CdsEnd`
- [ ] Step = 2 если initialTemplateSeq задан
- [ ] App.jsx прокидывает wizardPlasmid при presetMode='mutate'
- [ ] +2 integration-теста
- [ ] `fix(v13): PlasmidViewer mutate button passes template to MutagenesisWizard`

### K4 — V11 KLD Tm (30 мин)
- [ ] `makeKLDStrategy`: `tmBinding/tmFull = Math.round(calcTmNN(seq))`, `gcPercent` через regex
- [ ] +2 теста (KLD primer Tm > 50 && < 80)
- [ ] `fix(v11): KLD primers report real Tm and GC% instead of placeholder zeros`

---

## Regression guard

- Все существующие 637 Vitest тестов остаются зелёными
- После каждого коммита: `cd gui/designer && npx vitest run && npx vite build`

## После всех коммитов

- BUGS.md: V11/V12/V13/V14 → FIXED с датой 21.04.2026
- PROJECT_STATE.md: журнал сессии Sprint 1.5
- DECISIONS.md: подтверждение 4 решений из спеки Chat
- Переместить `docs/SPRINT_1_5_MUTAGENESIS_V2.md` → `docs/archive/` после визуального подтверждения Игорем

---

## Команда на старт

> Начинаем с K1. Отчёт Chat после K1 с результатом теста «linear fragment in Gibson assembly → two_fragment split».

# V05_PROTOCOLS_RECAP.md

> **Назначение.** Recap того что было в v0.5 protocols. Что работало / что нет / что забрать в M-PROTOCOLS-MVP (Wave 2) / что переосмыслить.
>
> **Зачем сейчас.** Через 6+ месяцев Игорь забудет что было в v0.5 — code ещё в репо, но recall context потерян. Если зафиксировать **сейчас пока в памяти свежо** — M-PROTOCOLS-MVP начнётся с готового understanding what to harvest и what to redesign.
>
> **Action для Игоря:** найти v0.5 protocol code в `gui/designer/src/` (legacy зона), прочитать ключевые файлы, заполнить sections ниже. Не нужно делать все сразу — заполняй по мере того как открываешь files.
>
> **Создан:** 12.05.2026 — shell by Chat, content fills in by Игорь.

---

## 1. Где живёт v0.5 protocol code

По userMemories, v0.5 algorithm core + UI wizards живут в `gui/designer/src/`:

**Algorithm core (запрещённая зона для Chat, harvest через adapter):**
- `local-primer-design.js` — primer design logic.
- `tm-calculator.js` — melting temperature.
- `restriction-db.js` — restriction enzymes database.
- `golden-gate.js` — Golden Gate assembly logic.
- `mutagenesis.js` — mutagenesis logic.

**UI wizards (по DEC-CANVAS-08 ⚓ — выкидывать, переписывать inline):**
- `PlasmidUseWizard.jsx` — что делал?
- `MutagenesisWizard.jsx` — что делал?
- `OligoManager.jsx` — что делал?
- `PrimerPanel.jsx` — что делал?
- `JunctionBlock.jsx` — палитра 9 типов junction'ов (уже harvested в `canvas/junction-styles.js` — DEC-CANVAS-V2-JUNCTION-PALETTE-V05-01).

**Не уверен что ещё было.** Возможно `RestrictionDigestPanel`, `GibsonPanel` либо подобные — поискать через `find . -name "*Wizard*"` либо `find . -name "*Protocol*"`.

---

## 2. Per-protocol recap (заполняет Игорь)

### PCR

**Что было в v0.5 (заполни):**
- Algorithm: `local-primer-design.js::?`
- UI: `?` (какой wizard / panel)
- Workflow: какие шаги, какие inputs, какие outputs.

**Что хорошо работало:**
- (заполни)

**Что плохо работало:**
- (заполни — friction, modal-overuse, missing features, edge cases)

**Что забрать в M-CANVAS-OPS PCROpPopup / M-PROTOCOLS-MVP:**
- Algorithm core: `designPrimerPair(...)` если есть pure function — harvest как is.
- Data structures: step shape (annealing temp / extension time / cycles).
- Defaults: typical Phusion / Q5 / Taq parameters.

**Что переосмыслить:**
- UI from wizard → inline popup (DEC-CANVAS-08 ⚓).

---

### Restriction digest

**Что было в v0.5 (заполни):**

**Что хорошо работало:**

**Что плохо работало:**

**Что забрать:**
- Algorithm core: `restriction-db.js` — uses NEB-style data. Harvest через adapter.
- Enzyme combo logic (multiple enzymes simultaneously).

**Что переосмыслить:**

---

### Gibson assembly

**Что было в v0.5 (заполни):**

**Что хорошо работало:**

**Что плохо работало:**

**Что забрать:**
- Algorithm core: `golden-gate.js` (для GG Type IIS) — harvest. Gibson overlap detection — может live в `golden-gate.js` либо отдельно.
- Overhang detection logic.

**Что переосмыслить:**
- Wizard-style → inline popup с **DragReorderList** для fragments + method select + preview-section (см. SPRINT_M_CANVAS_OPS_PREVIEWS.md).

---

### Ligation (sticky + blunt)

**Что было в v0.5 (заполни):**

**Что хорошо работало:**

**Что плохо работало:**

**Что забрать:**

**Что переосмыслить:**

---

### Mutagenesis (point + indel)

**Что было в v0.5 (заполни):**
- Algorithm core: `mutagenesis.js::?`
- UI: `MutagenesisWizard.jsx`.

**Что хорошо работало:**

**Что плохо работало:**
- Wizard как modal forced biolog out of context — типичная anti-paradigma.

**Что забрать в M-CANVAS-MUTAGENESIS:**
- Algorithm core: `applyMutations(sequence, mutations)` — harvest pure function.
- Mutation data shape (position / from / to / type).

**Что переосмыслить:**
- Point mutations through canvas Mutagenesis operation **либо** editor mutagenesis tab (intra-region) — две разные surface.
- Saturation mutagenesis (20 amino acids batch) — single popup с position + «All 20» button + Execute.

---

### KLD (Kinase / Ligase / DpnI for site-directed mutagenesis)

**Что было в v0.5 (заполни):**

**Что хорошо работало:**

**Что плохо работало:**

**Что забрать:**
- KLD primer pair design — может в `local-primer-design.js` либо отдельный helper.
- DpnI digest step logic.

**Что переосмыслить:**
- Inline popup с template + primer pair + DpnI checkbox + Execute.

---

## 3. UI wizards — что выкидываем

Все по DEC-CANVAS-08 ⚓ (anchor 11.05.2026): UI v0.5 wizards выбрасываются, operations переписываются inline в OpPopups (hard cap 8 KB на popup).

**Конкретные wizards к выкидыванию:**
- `PlasmidUseWizard.jsx` (заполни — что делал)
- `MutagenesisWizard.jsx` (заполни)
- `OligoManager.jsx` (заполни — primer management was modal либо panel?)
- `PrimerPanel.jsx` (заполни — отличается от OligoManager?)

**Не выкидывать:**
- `JunctionBlock.jsx` — палитра 9 типов harvested в `canvas/junction-styles.js`. v0.5 file может остаться до M-CANVAS-MERGE.

---

## 4. Algorithm core — что harvest'аем

Все pure functions из v0.5 algorithm core — **harvest через adapter** в `canvas/operations/lib-adapters.js` (план M-CANVAS-OPS K1+K6-K10).

**K1 разведка OPS sprint'а** уже сделана Code, отчёт в `docs/SPRINT_M_CANVAS_OPS_K1_DISCOVERY.md` — посмотреть когда понадобится конкретика какая функция coupling-free и какая требует extraction.

**Что точно harvestable (по general knowledge):**
- `restriction-db.js::lookup(enzymeName)` — pure data lookup.
- `tm-calculator.js::calculateTm(sequence)` — pure calculation.

**Что может coupling-bound (K1 проверит):**
- `local-primer-design.js::designPrimerPair(...)` — может зависеть от store preferences (target Tm range, ignore primer self-binding flag).
- `mutagenesis.js::applyMutations(...)` — может зависеть от annotation-model для feature offset adjustments.
- `golden-gate.js::detectOverhangs(...)` — может зависеть от restriction-db lookup, что pure через cascade.

---

## 5. Data structures из v0.5 — что забрать

**Step shape (заполни Игорь):**
- Что было в v0.5 protocol step? Какие fields?
- Пример: `{description: string, duration_seconds: number, temperature_C: number, reagents: [{name, concentration, volume}], notes: string, optional: boolean}`?

**Reagent shape (заполни):**

**Protocol metadata (заполни):**
- name, description, author, version, source PMID?

**Это всё нужно в M-PROTOCOLS-MVP для Protocol entity shape.**

---

## 6. UX patterns которые не работали (выкидываем)

**Anti-patterns:**
- Modal multi-step wizards (forced biolog out of context) — выкидываем, заменяем inline.
- Separate tools для каждой operation (PrimerPanel + OligoManager + MutagenesisWizard + ...) — заменяем единой архитектурой OpPopups.
- (заполни Игорь — что ещё было frustrating)

**Что v0.5 делал хорошо (carry over):**
- Algorithm core: harvest as is.
- Junction palette (9 types): harvested.
- (заполни — что ещё было хорошо)

---

## 7. Migration plan v0.5 → M-PROTOCOLS-MVP

**Phase 1 (M-CANVAS-OPS, в работе):** algorithm core harvested через `lib-adapters.js`. UI wizards заменены OpPopups.

**Phase 2 (M-PROTOCOLS-MVP, Wave 2):** Protocol entity встроена; default templates per operation kind generated automatically; biolog может override. Markdown export.

**Phase 3 (Wave 4+ если нужно):** robotic protocol execution (Opentrons), advanced reagent tracking.

---

## 8. Action для Игоря

1. Открыть v0.5 protocol files (если ещё на disk):
   - `git log --oneline gui/designer/src/PlasmidUseWizard.jsx` — view history.
   - `cat gui/designer/src/PlasmidUseWizard.jsx | head -100` — quick recap.
   - То же для MutagenesisWizard / OligoManager / PrimerPanel.

2. Заполнить sections 2 (per-protocol) и 3 (UI wizards) данным **из памяти** + быстрый просмотр кода.

3. Когда M-PROTOCOLS-MVP sprint планируется (через 6-9 месяцев) — Chat использует этот recap как input для design decisions.

**Не надо делать все сразу.** Per-protocol section заполняется когда вспомнил что-то — раз в неделю по одной section. Через месяц recap будет complete.

---

_Создан 12.05.2026 поздний вечер. Shell by Chat. Content fills in by Игорь по мере работы._

# IDEAS_PARKING_LOT.md

> **Назначение.** Generic dump для идей которые не fit'ят specific backlog'ам (`KNOWLEDGE_BACKLOG.md`, `V05_PROTOCOLS_RECAP.md`, `DESIGN_BACKLOG_POLISH.md`). Append-only с monthly triage в specific backlog'и либо в roadmap.
>
> **Зачем сейчас.** Идеи теряются между sessions. Чат-обсуждения forget'ятся через неделю. Этот файл — **single drain** для всего что мелькнуло «о, классная идея». Append moment of inspiration, triage later.
>
> **Правила.**
> - **Append-only.** Не редактируем — добавляем новые entries сверху (newest first).
> - **Format каждой entry:** дата + 1-2 sentence description + tag (если знаем category).
> - **Tags:** `[POLISH]` `[WAVE-2]` `[WAVE-3]` `[WAVE-4+]` `[REJECT]` `[OPEN-QUESTION]` `[DESIGN]` `[KNOWLEDGE]` `[PROTOCOLS]`.
> - **Низкий barrier.** Сомневаешься «вообще это идея» — добавь, через неделю решишь.
> - **Monthly triage.** Раз в месяц — переноси в specific backlog либо помечай `[DONE]` либо `[REJECT]`.
> - **Reject section.** Идеи которые явно отбросили — храним в section 2 для tracking что обсуждалось.
>
> **Создан:** 12.05.2026. Seed entries из сегодняшнего диалога Игорь ↔ Chat.

---

## 1. Active ideas (newest first)

**[2026-05-12] `[KNOWLEDGE]`** — База знаний должна включать **не только restriction enzymes**. Игорь: «ребята кроме рестриктаз есть еще куча моментов». Семантика — knowledge integration глубокая (CAZy + Pfam + papers + promoters + secretion signals), а не surface-level lookup. ⇒ Перенесено в `KNOWLEDGE_BACKLOG.md` (sections 1-9).

**[2026-05-12] `[DESIGN]`** — Затенение «что удаляем» в Cut operation либо подсветка «что копируется» в PCR — на ContainerBlock прямо на canvas, **не только** в OpPopup preview. То есть preview-mode переключаемый: «show me what this operation will do to this template» как hover-state над container'ом когда operation active. Сейчас preview только в popup. ⇒ Возможный enhancement к M-CANVAS-OPS-PREVIEWS либо M-CANVAS-POLISH.

**[2026-05-12] `[DESIGN]`** — Expanded ContainerBlock на canvas — circular minimap для plasmids, linear ribbon для fragments. Toggle compact/expanded в canvas toolbar. Compact для N≥5 containers, expanded для review с reading features. ⇒ Кандидат M-CANVAS-CONTAINER-VIZ sprint в Wave 1 либо M-CANVAS-POLISH.

**[2026-05-12] `[REJECT]`** — Полумесяцы стыковки containers на canvas (визуально показывать что containers «уже соединены» через physical полумесяцы). Misleading semantics — pipeline это plan, не результат; собранные containers создаются как **outputs operations**, не как modified original containers. Honest design = junction line + kind badge, polumesyatsy = иллюзия.

**[2026-05-12] `[OPEN-QUESTION]` `[POLISH]`** — Operation re-execute: новая operation manually либо button «Re-execute» на existing с pre-filled params? OPS sprint Q1 default — manual new operation. Polish-time reconsider.

**[2026-05-12] `[OPEN-QUESTION]` `[POLISH]`** — Operation draft state visualisation: dashed ромб на canvas (текущий default) либо separate panel «Pending operations»? Default — canvas. Reconsider если biolog с N=10+ dashed ромбами найдёт это chaotic.

**[2026-05-12] `[POLISH]`** — Multi-template PCR (overlap-extension PCR через несколько templates с одной primer pair). Out of scope для M-CANVAS-OPS, кандидат POLISH либо future track.

**[2026-05-12] `[WAVE-2/3]`** — Saturation mutagenesis batch (20 amino acids за раз для одной position). Single popup с position select + «All 20» button + «Custom selection» fallback + Execute. 20 containers как visual cluster на canvas, expand/collapse. ⇒ M-CANVAS-MUTAGENESIS sprint в Wave 2.

**[2026-05-12] `[POLISH]`** — Сборка из праймеров без template (NOTES Q1). Primer-pair-only operation → output container-amplicon без template (synthetic genes, phosphorothioate cloning). Kind в OpKindPicker либо variant PCR с «no template» checkbox. ⇒ M-CANVAS-POLISH.

**[2026-05-12] `[POLISH]`** — Operation collapse/expand для multi-fragment Gibson. Если Gibson с 5+ fragments — visual cluster collapses в single icon в Layout view. ⇒ M-CANVAS-POLISH.

**[2026-05-12] `[POLISH]`** — Drop entry на уже filled container (NOTES Q5). Default — клон рядом, но с popup «Заменить / Создать клон / Отмена». Per-session «не спрашивать снова». ⇒ M-CANVAS-POLISH.

**[2026-05-12] `[POLISH]`** — Instance counter UX на ContainerBlock когда `origin.sourceEntryId` повторяется. Counter `(2)` либо badge `⎘` + hover «Копия pUC19». Info-only, не предлагает удаление. ⇒ M-CANVAS-POLISH.

**[2026-05-12] `[POLISH]`** — BsaI/BsmBI overhangs auto-detection в Gibson popup → если все fragments имеют 4-nt type IIS overhangs, popup предлагает Golden Gate как default method. ⇒ M-CANVAS-POLISH.

**[2026-05-12] `[POLISH]`** — «+ кнопка» добавления placeholder вручную (NOTES §3). Сейчас placeholders только starting 2 + drag создаёт новый. Manual add — toolbar right-side либо right-click меню «Добавить контейнер». ⇒ M-CANVAS-POLISH.

**[2026-05-12] `[WAVE-3]`** — Camera capture для lab journal: phone/laptop camera → photo + auto-OCR метаданных (date, sample IDs от labels) + temporal proximity linkage к recent operation. Biolog подтверждает «yes from PCR operation #17». ⇒ M-LAB-CAPTURE-MVP (Wave 3).

**[2026-05-12] `[WAVE-3]`** — ML классификация геля: success / partial / fail / unclear. Coarse-grained, не quantification. Local CNN либо via institutional cluster. ⇒ M-LAB-CAPTURE-ML (Wave 3).

**[2026-05-12] `[WAVE-3]`** — Plate colony counter — photo agar plate → ML count. Linked к Transform operation. ⇒ M-LAB-CAPTURE-ML (Wave 3).

**[2026-05-12] `[WAVE-3]`** — Sequencing chromatogram (.ab1/.scf) upload → auto-alignment с expected mutant → highlight differences → linked к Mutagenesis/KLD. Biopython parsing existing libraries. ⇒ M-LAB-CAPTURE (Wave 3).

**[2026-05-12] `[WAVE-2]`** — Codon adaptation operation на canvas — `CodonOptimizeOpPopup` с organism select. Adapter calls codon table. Output — new container с optimized sequence + annotation diff vs original. ⇒ M-MULTIORGANISM-FOUNDATION (Wave 2).

**[2026-05-12] `[WAVE-2]`** — Promoter strength estimation для well-known fungal promoters (glaA / cbh1 / gpdA / amyB / gla1). Auto-detection при container load → annotation «known promoter, expected strength X-fold». ⇒ M-FUNGAL-SPECIFIC-FOUNDATION (Wave 2).

**[2026-05-12] `[WAVE-2]`** — Glycosylation pattern prediction для filamentous fungi. N-linked sites detection (regex level, fast) + optional ML model для prediction patterns. ⇒ M-FUNGAL-SPECIFIC-FOUNDATION (Wave 2).

**[2026-05-12] `[WAVE-2]`** — Secretion signal prediction integration. Local SignalP-style model для filamentous fungi либо institutional cluster SLURM-job DeepTMHMM. Auto-runs при addition CDS annotation либо on-demand button «Predict secretion signal». ⇒ M-FUNGAL-SPECIFIC-FOUNDATION (Wave 2).

**[2026-05-12] `[WAVE-4+]`** — Robotic protocol execution (Opentrons, Hamilton). Не sprint, **separate track** после стабилизации Wave 2-3. Possibly never if не нужно lab user'ам.

**[2026-05-12] `[WAVE-4+]`** — HPLC / mass-spec / flow-cytometry data import → linkage с operations. Wave 4+ separate analysis track.

**[2026-05-12] `[OPEN-QUESTION]`** — Public service vs self-hostable (Q-STRAT-01 из PRODUCT_BACKLOG). Критическое решение **до M-CANVAS-MERGE**. Игорь имеет institutional cluster access — это слегка склоняет к self-hostable + optional cluster compute. Но не закрывает вопрос.

**[2026-05-12] `[OPEN-QUESTION]`** — Open source vs proprietary vs hybrid licensing (Q-STRAT-02). Влияет на community engagement и paper-knowledge integration attribution rights.

**[2026-05-12] `[OPEN-QUESTION]`** — Audience expansion timing (Q-STRAT-05): когда / как расширяться за пределы fungi (E. coli, yeast, mammalian)? Foundation already laid (multi-organism architecture), но timing critical.

---

## 2. Явно отбросили (для tracking что обсуждалось)

**[2026-05-12] `[REJECT]`** — Полумесяцы стыковки containers на canvas. Misleading semantics. См. section 1 для context.

**[2026-05-12] `[REJECT]`** — Wizard multi-step для operations. Anti-paradigma DEC-CANVAS-08 ⚓ — DEC-CANVAS-08 явно говорит «UI v0.5 wizards выкидывается, operations переписываются inline». Inline > wizard всегда когда возможно.

**[2026-05-12] `[REJECT]`** — Real-time multi-user collaborative editing (Benchling-style). Battle lost ahead of time. PRODUCT_BACKLOG anti-positioning.

**[2026-05-12] `[REJECT]`** — Mobile native apps. ARCHITECTURE_v2 DEC-V2-19 + PRODUCT_BACKLOG.

**[2026-05-12] `[REJECT]`** — 3D protein structure visualization. PyMOL territory.

**[2026-05-12] `[REJECT]`** — Drug discovery / molecular docking. Schrodinger territory.

**[2026-05-12] `[REJECT]`** — Clinical-grade / FDA / GMP compliance. Regulatory mountain, не investigator-grade tool.

**[2026-05-12] `[REJECT]`** — High-throughput screening automation (j5 / Twist / Inscripta territory).

**[2026-05-12] `[REJECT]`** — AI-coding-assistant который пишет primers за биолога без understanding. Principle P7 — biolog decides.

**[2026-05-12] `[REJECT]`** — Wet-lab inventory tracking (reagent stock, expiry, ordering). Separate track ever.

---

## 3. Monthly triage notes

**Next triage:** ~12.06.2026 (примерно один месяц с момента создания).

**Triage actions:**
1. Re-read all active ideas.
2. Что-то выполнено в OPS sprint'е? Mark `[DONE]`.
3. Что-то outdated либо superseded? Mark `[REJECT]` + reason.
4. Что-то готово promote в specific backlog (KNOWLEDGE / PROTOCOLS / DESIGN_POLISH)? Move + cross-ref.
5. Что-то требует strategic decision? Note в `PRODUCT_BACKLOG_INTEGRATED_WORKBENCH.md` open questions.

**Triage log:**
- (placeholder для monthly entries — append каждый месяц)

---

_Создан 12.05.2026 поздний вечер. Seed entries из дискуссии Игорь ↔ Chat 12.05.2026. Append от Игорь по мере появления идей._

# KNOWLEDGE_BACKLOG.md

> **Назначение.** Накапливающий список knowledge items для будущей M-KNOWLEDGE-MVP sprint (Wave 2). Append-only. Растёт по мере того как Игорь работает с проектами.
>
> **Зачем сейчас.** Через 3-6 месяцев когда Wave 2 стартует, M-KNOWLEDGE-MVP начнётся с готового seed material. Без этого file — пустой старт.
>
> **Правила.**
> - **Append-only.** Не редактируем existing entries, только добавляем.
> - **Дата каждой entry.**
> - **Низкий barrier.** Если сомневаешься «может это полезно» — добавь.
> - **Monthly review.** Раз в месяц — re-read, group, prioritize.
> - **Cross-ref в чат.** Когда добавляешь — упомяни «добавлено в KNOWLEDGE_BACKLOG».
>
> **Создан:** 12.05.2026. Seed entries by Chat из контекста Игоря (Aspergillus niger / Trichoderma reesei, GH18 chitinases, fungal expression PhD work).

---

## 1. Restriction enzymes — приоритет для M-KNOWLEDGE-MVP

**Target:** ~600 enzymes total. Приоритет — fungal-relevant subset (~50-80).

**Common workhorses (high priority):**
- EcoRI — G^AATTC, sticky 5' overhang AATT
- BamHI — G^GATCC, sticky 5' overhang GATC
- HindIII — A^AGCTT, sticky 5' overhang AGCT
- SalI — G^TCGAC, sticky 5' overhang TCGA
- XhoI — C^TCGAG, sticky 5' overhang TCGA, compatible with SalI
- NotI — GC^GGCCGC, 8-bp recognition, sticky 5' overhang GGCC
- NcoI — C^CATGG, useful для start codon cloning (ATG в site)
- NdeI — CA^TATG, useful для start codon (CATATG includes ATG)
- BglII — A^GATCT, compatible c BamHI sticky ends
- KpnI — GGTAC^C, 3' overhang
- SpeI — A^CTAGT
- PstI — CTGCA^G

**Golden Gate Type IIS (high priority для M-CANVAS-OPS Gibson popup):**
- BsaI — GGTCTC(N1)↓, 4-nt overhang customizable
- BsmBI — CGTCTC(N1)↓, 4-nt overhang customizable
- SapI — GCTCTTC(N1)↓, 3-nt overhang
- BbsI — GAAGAC(N2)↓, 4-nt overhang

**Methylation-sensitive (medium priority):**
- DpnI — Gm6A^TC, cuts только methylated DNA (used в KLD protocol для template removal)
- DpnII — ^GATC, cuts только unmethylated
- MboI — ^GATC, blocked by methylation

**Star activity warnings (note in DB):**
- EcoRI* (под high glycerol / low salt — расширенная specificity)
- BamHI* (similar conditions)

**Fields per enzyme:** name, recognition_site (regex pattern), cut_position, overhang_type (5'_sticky | 3'_sticky | blunt), overhang_sequence, isoschizomers, neoschizomers, optimal_buffer, methylation_sensitivity, star_activity_conditions, supplier, price_per_unit, notes.

**Source:** NEB website API либо bundled JSON dump.

_Добавлено 12.05.2026 — seed by Chat._

---

## 2. CAZy families — fungal-focused subset

**Target:** all CAZy GH / GT / PL / CE / AA families, но **prioritized data** для fungal-relevant.

**GH (Glycoside Hydrolases) — high priority для Trichoderma / Aspergillus:**
- **GH18 chitinases** — личный интерес Игоря (Drosera PhD). Aspergillus fumigatus chiB, ChiA, Trichoderma chi18 series.
- **GH7 cellobiohydrolases** — T. reesei Cel7A (CBH1) — major cellulase.
- **GH6 cellobiohydrolases** — Cel6A (CBH2), complementary к GH7.
- **GH5 endoglucanases** — широкий family.
- **GH61 / AA9 (LPMOs)** — Lytic polysaccharide monooxygenases.
- **GH10 / GH11 xylanases** — hemicellulose degradation.

**GH (others, medium priority):**
- GH3 β-glucosidases
- GH12 endoglucanases (small, secreted, no CBM)
- GH26 mannanases
- GH62 α-L-arabinofuranosidases

**GT (Glycosyltransferases):** GT2 / GT8 chitin synthase, GT41 α-1,3-glucan synthase.

**Auxiliary Activities (AA) — important для lignocellulose:**
- AA9 (LPMOs cellulose-acting)
- AA10 (chitin-acting)
- AA11 (xylan-acting)
- AA13 (starch-acting)

**Fields per family:** family number + EC numbers, typical substrates, catalytic mechanism (retaining / inverting), known fungal members (with PMIDs), signal peptides, CBMs commonly fused.

**Source:** CAZy database public API + manual curation.

_Добавлено 12.05.2026 — seed by Chat._

---

## 3. Pfam domains — fungal expression-relevant

**Target:** ~500 fungal-relevant Pfam domains.

**Signal peptides + secretion:** SignalP-style motifs, CBM Pfam entries (CBM1 / CBM6 / CBM10).

**Common catalytic domains:**
- PF00150 (Cellulase) — GH family scaffold.
- PF00457 (Glyco_hydro_11) — GH11 xylanases.
- PF00704 (Glyco_hydro_18) — GH18 chitinases (Игорь interest).
- PF00734 (CBM_1) — fungal cellulose-binding module.
- PF02817 (Pyr_redox_dim) — для cytochrome P450s secondary metabolism.

**Promoter recognition:** Pfam entries для known fungal transcription factors (XlnR, CreA).

**Source:** Pfam API + manual curation. Cross-reference с CAZy.

_Добавлено 12.05.2026 — placeholder, fill in by Игорь during real work._

---

## 4. Fungal promoters — strength data + context

**Target:** ~30-50 well-characterized fungal promoters с measured strength data.

**High priority (most used):**
- **glaA** (A. niger) — glucoamylase, **strong, starch-inducible**. Most common для A. niger industrial expression.
- **gpdA** (A. nidulans, often heterologous) — constitutive, **strong**. Glyceraldehyde-3-P dehydrogenase.
- **amyB** (A. oryzae) — α-amylase, starch-inducible.
- **cbh1** (T. reesei) — cellobiohydrolase 1, **very strong**, cellulose-inducible. Most common для T. reesei.
- **cdna1** (T. reesei) — moderate constitutive.
- **xyn3** (T. reesei) — xylanase, xylose-inducible.
- **gla1** (A. niger) — similar к glaA.
- **alcA** (A. nidulans) — alcohol dehydrogenase, ethanol-inducible. Useful for conditional expression.
- **niiA** / **niaD** (A. nidulans) — nitrate reductase regulon, nitrate-inducible.

**Medium priority:**
- **TEF1** (T. reesei) — translation elongation factor 1α, constitutive.
- **pyr4** (T. reesei) — orotidine-5'-phosphate decarboxylase, used для marker selection.
- **PgpdA** (A. niger) — glyceraldehyde-3-P dehydrogenase.
- **PtrpC** (A. nidulans) — trpC promoter, moderate constitutive.

**Synthetic / hybrid promoters:** tunable promoter libraries (Aspergillus / Trichoderma synthetic biology kits, recent papers).

**Fields per promoter:** source organism + native gene, induction conditions, measured strength (relative), reference PMIDs, compatibility, length (bp) + recommended cloning region.

**Source:** literature reviews (Punt et al., Nevalainen et al., Meyer et al.).

_Добавлено 12.05.2026 — seed by Chat._

---

## 5. Secretion signals для filamentous fungi

**Target:** ~20 well-characterized fungal signal peptides.

**Most used:**
- **GlaA SP** (A. niger glucoamylase) — MSFRSLLALSGLVCTGLANV — workhorse для A. niger heterologous secretion.
- **GlaA SP + pro-region** — sometimes c pro-region для enhanced secretion.
- **CBH1 SP** (T. reesei) — MYRKLAVISAFLATARA — для T. reesei.
- **CBH2 SP** (T. reesei) — alternative к CBH1.
- **α-Mating factor SP** (S. cerevisiae) — often heterologously.

**Less common:** A. niger amyA / amyB SPs, A. oryzae taa SP, T. reesei xyn1 / xyn2 SPs.

**Carrier-fusion strategies:**
- GlaA-linker-cargo — fusion с full glucoamylase as carrier, sometimes improves titre dramatically.
- CBH1 catalytic core-linker-cargo — для T. reesei.
- Kex2 cleavage site (KR) — для intracellular processing.

**Include in `secretion-signals.json`:** DNA sequence + amino acid + source organism + processing site + references.

_Добавлено 12.05.2026._

---

## 6. Codon tables — fungal expression targets

**Target:** codon usage tables для codon-optimization operation.

**High priority hosts:**
- **Aspergillus niger** — codon usage из highly-expressed genes (glaA, niaD).
- **Aspergillus oryzae** — slightly different usage.
- **Trichoderma reesei** — cellulase-derived usage.
- **Pichia pastoris** — methanol utilization pathway-derived.
- **Yarrowia lipolytica** — lipase-derived.
- **Saccharomyces cerevisiae** — для comparison.

**Source:** Kazusa Codon Usage Database либо HEG (Highly Expressed Genes) datasets per organism.

_Добавлено 12.05.2026._

---

## 7. Backbones / vectors — most-used templates

**Target:** ~30-50 well-characterized expression vectors для fungal systems.

**A. niger vectors:**
- **pAN52 series** — based on glaA promoter.
- **pBARGPE1** — gpdA promoter, bar selection (basta resistance).
- **pAB4-1** — pyrG-based selection.

**T. reesei vectors:**
- **pTrex series** — cbh1 promoter.
- **pTrex3g** — improved pTrex variant.

**P. pastoris vectors (если расширяем audience):**
- pPIC9, pPICZα — AOX1 promoter, methanol-inducible.

**Common backbone elements:** AMA1 (autonomously replicating sequence — Aspergillus); arg2 / pyrG / pyr4 / hph / bar — selection markers.

**Source:** Addgene if ToS permits + manual curation from literature.

**Ethical note (userMemories):** Addgene scraping ToS violation; official API request submitted. Use only public-facing metadata либо manual entry.

_Добавлено 12.05.2026._

---

## 8. Reference papers — curated reading list для M-KNOWLEDGE-PAPERS

**Target:** ~500-1000 papers seed для M-KNOWLEDGE-PAPERS (Wave 3). Growing list.

**Fungal expression reviews (must-read):**
- Punt P.J. et al. — A. niger expression reviews.
- Nevalainen H. et al. — Trichoderma expression reviews.
- Meyer V. et al. — Aspergillus secretion reviews.
- Cherry & Fidantsef 2003 — directed evolution in fungal expression.

**CAZyme + GH18 (Игорь PhD context):**
- (placeholder — fill in from Игорь's PhD reference list)

**Specific construct success stories:**
- (placeholder — collect during literature review)

**Action:** Игорь добавляет PMIDs + 1-line description как encounter в работе.

_Добавлено 12.05.2026._

---

## 9. Examples / case studies — для inline UX suggestions

**Target:** ~100-200 worked examples «вот как кто-то решил схожую проблему».

**Format per example:**
- Goal (1-line): «express GH18 chitinase in A. niger with secretion».
- Construct: backbone + insert + tags + promoter + secretion signal.
- Result: titre / activity / observations.
- PMID reference.
- Tags: organism, technique, gene family.

**Action:** seed gradually. When working on own construct — пиши 1-paragraph «what I did» entry. Через 6 months — 30-50 examples accumulated, becomes valuable inline context.

_Добавлено 12.05.2026._

---

## 10. Open questions для monthly review

- Какие categories most-populated через 1 month?
- Какие categories empty — deprioritize?
- Что готово promote в M-KNOWLEDGE-MVP priority list?
- Sources которые работают хорошо (Kazusa, CAZy, Pfam, NEB) — что добавить?

---

_Создан 12.05.2026 поздний вечер. Seed entries by Chat based on Игорь's context. Растёт от Игорь monthly._

# BUGS.md — BodgeGene

Баги → сюда. Починены → `[x]`. Claude Code читает при старте сессии.

---

## OPEN

### Критичные

- [ ] **BUG-58:** `handleSaveFragment` стирает assembly primers. useFragmentHandlers.js: `updateActive({ primers: kldPrimers })` заменяет все 6 assembly primers на 2 KLD. Fix: добавлять KLD к существующим, не заменять.

### Высокие

- [ ] **BUG-47:** validate.js `.includes(site)` не матчит IUPAC. Fix: `siteToRegex(site).test()`.

- [ ] **BUG-54:** `flipFragment` не зеркалит annotations. Fix: `new_start = seqLen - old_end; new_end = seqLen - old_start`.

- [ ] **BUG-55:** PlasmidUseWizard "replace" — цельный backbone вместо двух фланков гомологии.

- [ ] **BUG-62:** PCRNode `primerFwd`/`primerRev` = undefined навсегда. PCR Planning Panel — все "?".

- [ ] **BUG-63:** Ноды flow canvas нельзя редактировать. `updateFlowNodeData()` в store есть, не вызывается.

- [ ] **BUG-64:** AssemblyNode `assemblyId: null` навсегда. Double-click → ничего.

### Средние

- [ ] **BUG-48:** golden-gate overhang из концов фрагмента, не из cutOffset.
- [ ] **BUG-50:** KLD не кодирует вторую мутацию (< 100bp gap).
- [ ] **BUG-51:** exportProtocol primer indexing после BUG-40 fix.
- [ ] **BUG-56:** PlasmidUseWizard sets `primers: []`.
- [ ] **BUG-65:** MIRO+ dropdown — только PCR/Gibson/GG. Нет: RE, KLD, ligation, transformation.

### Низкие

- [ ] **BUG-49:** findBinding для seq < 15bp — нет warning.
- [ ] **BUG-52:** genbank-parser multiline qualifier — пробел в /translation.
- [ ] **BUG-53:** autoAdjustJunctions не обновляет overlapLength.
- [ ] **BUG-61:** Две реализации findBinding (15-30bp vs 18-35bp).
- [ ] **BUG-66:** Нет концепции шага/этапа в flow DAG.

---

## FIXED

- [x] **BUG-01..46:** Sessions 22-24.
- [x] **BUG-17:** checkHairpin ΔG filtering.
- [x] **BUG-57:** `handleFragmentSplit` теряет annotations при split. Fix: split/replace_part1 переносят annotations.
- [x] **BUG-67:** Off-by-one .dna import. Fix: `server.py` → `f.start - 1`.
- [x] **BUG-68:** Feature naming priority. Fix: `label→product→gene→note` + enrichment с homology naming.
- [x] **BUG-69:** `infer_feature_type` false positives. Fix: regex `\b` word boundaries.
- [x] **BUG-71:** Нет detail-level enrichment после .dna import. Fix: enrichment всегда (homology + detail).
- [x] **Click = select.** PartBlock.jsx: click → clearFragSelection + toggleFragSelection + shift-range.

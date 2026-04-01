# BUGS.md — BodgeGene

Баги → сюда. Починены → `[x]`. Claude Code читает при старте сессии.

---

## OPEN

### Критичные

(нет)

### Высокие

(нет)

### Средние

(нет)

### Низкие

- [ ] **BUG-66:** Нет концепции шага/этапа в flow DAG. (дизайн-задача, не баг)

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
- [x] **BUG-58:** KLD primers стирали assembly primers. Fix: merge `[...existingNonMut, ...kldPrimers]`.
- [x] **BUG-47:** `.includes(site)` не матчит IUPAC. Fix: `siteToRegex().test()` в JunctionBlock.
- [x] **BUG-54:** `flipFragment` не зеркалил annotations. Fix: `start: seqLen - end, end: seqLen - start`.
- [x] **BUG-55:** PlasmidUseWizard "replace" — 1 backbone вместо 2 фланков. Fix: left flank + right flank.
- [x] **BUG-56:** PlasmidUseWizard sets `primers: []`. Fix: убран `asm.primers = []` из handleReplace.
- [x] **BUG-62:** PCRNode primer fields undefined. Fix: init primerFwd/Rev/tmFwd/tmRev в addFlowPCR.
- [x] **BUG-63:** Flow nodes нельзя редактировать. Fix: double-click → inline edit form + updateFlowNodeData.
- [x] **BUG-64:** AssemblyNode assemblyId null. Fix: newAssembly() в addFlowAssembly, real assemblyId.
- [x] **BUG-48:** GG overhang из концов фрагмента. Fix: документация + комментарий (design decision, sites добавляются как primer tails).
- [x] **BUG-49:** findBinding для seq < 15bp. Fix: minLen поднят до 18bp, warning сохранён.
- [x] **BUG-50:** KLD не кодировал 2ю мутацию. Fix: если gap < bindingLength — мутация кодируется в fwd primer.
- [x] **BUG-51:** exportProtocol primer indexing. Fix: поиск по имени фрагмента вместо primerIdx.
- [x] **BUG-52:** genbank-parser multiline /translation. Fix: нет пробела для sequence-like qualifiers.
- [x] **BUG-53:** autoAdjustJunctions overlapLength. Fix: overlapLength = 30 при left_only/right_only.
- [x] **BUG-61:** Две реализации findBinding. Fix: frontend minLen = 18 (как backend).
- [x] **BUG-65:** MIRO+ dropdown. Fix: добавлены RE, KLD, лигирование, трансформация.

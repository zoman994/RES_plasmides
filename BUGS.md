# BUGS.md — BodgeGene v0.6+

Баги → сюда. Починены → `[x]`. Claude Code читает при старте сессии.

**Trekking новой архитектуры (v0.6+).** v0.5 баги архивированы в `docs/archive/BUGS_v05.md` — большинство закрывается через wipe data + полный rewrite frontend под новую data model (DEC-V2-01 / DEC-V2-12). Открытые v0.5 баги, которые могут проявиться в v0.6 (биологические alg-баги P6 mutagenesis triplet, V20 split-PCR micro-fragments, V23 GG orthogonal palindromes), переоткрываются здесь по факту воспроизведения на v0.6 коде.

---

## OPEN

### Критичные

(пусто на старте v0.6)

### Высокие

(пусто на v0.7.0)

### Средние

(пусто на старте v0.6)

### Низкие

(пусто на старте v0.6)

---

## FEATURE REQUESTS

(пусто на старте v0.6 — фичи живут в `docs/ARCHITECTURE_v2.md` §7 Roadmap до момента, когда становятся конкретным дизайн-вопросом)

---

## FIXED

**V50 — Parser double-+1 на start coordinate, длины CDS не кратны 3 → AA-translation broken** (FIXED 03.05.2026 PRE-K1, ветка `feature/racetrack-canvas`).
- **Корень:** каскадный off-by-1 в backend pipeline. `src/pvcs/snapgene_parser.py` хранил координаты из SnapGene .dna XML как **1-based inclusive** (хотя комментарий говорил «0-based»). Затем `src/pvcs/parser.py` поверх ещё раз делал `+1` на start. Итог: каждый CDS сдвинут на 2 nt → длина не кратна 3 → reading frame ехал → ATG real-стартового кодона не попадал в позицию которую ожидал AA-translation → AmpR / lacZα reverse-strand CDS отображались без M, ложные STOP-кодоны в середине, ATG'и на pUC19 не подсвечивались как M.
- **Фикс:** в `snapgene_parser.py` — `xml_start - 1` чтобы получить настоящий 0-based, как у `snapgene_reader.snapgene_file_to_dict()` и BioPython. Контракт по всему pipeline теперь: **0-based exclusive end** (длина `= end - start`, для CDS `(end - start) % 3 === 0`).
- **Верификация на pUC19:** lacZα 147..469 (322, ✗ не÷3) → 146..469 (324 ÷3 ✓); AmpR 1627..2486 (859 ✗) → 1626..2486 (861 ÷3 ✓); AmpR promoter 2488..2591 (103) → 2487..2591 (105) ✓.
- **Strand был ОК изначально** — кастомный pvcs.snapgene_parser даёт `int(-1)` правильно. Подозрение про '-'/'+' строки относилось к другому parser path не используемому в основном flow.
- **Тесты:** pytest 112/112 PASS, vitest 947/947 PASS. Backend перезапущен.
- **Связанная сессия Code (03.05.2026 morning):** последовательная отладка 4 фиксов — (A) ruler line-end label убран целиком (major ticks 10 bp покрывают), (B) `buildCdsAAMap` поддерживает strand=-1 через `frame = (seqLen − end) % 3` + walkCodons antisense от 3'-конца, (C) regression test reverse-strand CDS показывает M на правом краю, (D) AA-track render разнесён по (strand, frame) на свои строки, ORF fallback убран как noise. **Эта V50 — root cause всего каскада** — после её фикса все 4 sub-фикса работают на правильных координатах.
- **Регрессия-guard:** `aa-track.test.jsx::reverse-strand CDS shows M at the 3'-end of top strand` (новый 02.05.2026), `aa-track.test.jsx::single renders M for EACH forward CDS`. Backend regression — pytest на pvcs/parser/snapgene_parser.

---

**V49 — 50-секундный hang при default open M-B.1 Step2Combined на 5333 bp / 12 регионов** (FIXED 02.05.2026, M-B.2 K4 коммит `4351552`).
- **Корень:** Step2Combined default mount `<MoleculeWorkspace>` → `<SequenceMapView>` (двуцепочечная 5333×2 + ~1700 AA codon rows) + `<AnnotationEditor>` (compact + hideBar) → ~12-15K DOM nodes на default render.
- **Фикс:** lazy mount табов в M-B.2. SequenceTab и AnnotationsTab создаются ТОЛЬКО при `activeTab === 'sequence'` / `=== 'annotations'` через React conditional render. Default tab `'overview'` рендерит лёгкий PlasmidMiniMap + categorized summary inline (~50-100 nodes).
- **Регрессия-guard:** `Importer/inspector/__tests__/lazy-tabs.test.jsx::default-overview-no-annotation-editor` PASS (M-B.2 K4).

---

История FIXED v0.5 → `docs/archive/BUGS_v05.md` (38 KB, последняя запись 28.04.2026: Sprint Catalog Polish + FIX cycle закрыл 11 import-related багов V35–V48).

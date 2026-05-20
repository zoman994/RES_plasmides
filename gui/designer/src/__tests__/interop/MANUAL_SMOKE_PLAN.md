# K14 — Manual Smoke Test Plan (.bodge v2 + SnapGene Round-Trip)

> **Why manual?** Steps 2–4 require third-party tools (SnapGene, ApE,
> Geneious Prime, NCBI Entrez, pLannotate) that cannot run inside the
> Vitest jsdom environment. K0/K13 cover the worst-case reformatter
> simulators; K14 confirms real tools behave at least as gently.
>
> **Who runs this?** Igor (biolog), once per major .bodge format change
> or when adding a new third-party tool to the support matrix.
>
> **Result:** filled-in §6.4 loss matrix + visual confirmation of each
> step's pass/fail. Drop a screenshot + matrix into Chat after each run
> to feed back into spec.

## Prerequisites

| Tool | Where | Notes |
|------|-------|-------|
| BodgeGene v0.9.0+ | `npm run dev`, [http://127.0.0.1:3000](http://127.0.0.1:3000) | Avoid `localhost:3000` if AmneziaVPN is up (V79) |
| SnapGene 6+ | Local install | Free educational license OK |
| ApE 3+ | Local install | Free |
| Geneious Prime | Local install (optional) | Trial license OK |
| NCBI Entrez | https://www.ncbi.nlm.nih.gov/nuccore/ | Browser only |
| pLannotate | https://plannotate.barricklab.org/ | Browser only |

## Test fixture

Use the K0 reference container: `gui/designer/src/__tests__/interop/fixtures/snapgene-export/pET-28b-bodge.gb`. Inject a real provenance COMMENT by running:

```bash
cd gui/designer
npm test -- --run src/lib/__tests__/bodge-snapgene-loss-detect.test.js
# The K0 test "decode recovers the exact payload after in-memory round-trip"
# logs out the synthetic .gb with provenance. Capture it.
```

Or just open BodgeGene v0.9, create a new project with one container, export to .bodge, then unzip and pull `containers/<id>.gb` — that's your test file.

## Steps (5)

### 1. v1 → v2 migrate

1. Open BodgeGene v0.9.0+.
2. File → Open → pick `v0.8.2-pks4.bodge` (any v1 .bodge from before this sprint).
3. Confirm migration modal: «Файл `pks4.bodge` создан в v1 формате. Конвертировать?» → **Конвертировать**.
4. Verify toast: «Файл успешно конвертирован в v2. Backup сохранён как `pks4.bodge.v1-backup`.»
5. Verify `pks4.bodge.v1-backup` exists alongside the original.

✅ PASS if migration completes without console errors and the project loads with all assemblies / containers / library entries intact.

❌ FAIL if any container is missing, sequence differs, or the app crashes mid-migration.

### 2. SnapGene opens container.gb

1. After migration, unzip `pks4.bodge` (rename to `.zip` or use 7-Zip / WinRAR).
2. Open `containers/c01XYZ.gb` in **SnapGene**.
3. Verify SnapGene shows:
   - LOCUS / DEFINITION matches the BodgeGene name + description.
   - Topology = circular (if it was circular in BodgeGene).
   - All features render with their /label and /color.
   - Click a feature → bottom panel shows /bodge_id qualifier (custom).
   - COMMENT section contains the `##BodgeGene-Provenance-START##` markers.

✅ PASS if features + sequence + COMMENT are visible and editable.

❌ FAIL if SnapGene refuses to open the file, strips features silently, or mangles the COMMENT region (record the exact behavior).

### 3. External edit → re-import → detect

1. In SnapGene, edit the container (change a feature label or insert 1 nt).
2. Export back to `.gb` (File → Export → GenBank).
3. In BodgeGene: Library → Import .gb → pick the SnapGene-edited file.
4. Verify toast: «External edit detected. Last BodgeGene state: <date>. Sequence differs from provenance baseline» with three buttons.
5. Click **Treat as new baseline** → confirm the new sequence is in the library and the resourceHash is updated.

✅ PASS if BodgeGene detects the edit and offers the three-option toast.

❌ FAIL if BodgeGene silently overwrites OR refuses to import.

### 4. Single-assembly export → `.bodgeassembly`

1. In BodgeGene, open a project with 2+ assemblies.
2. File → Export → choose «Single assembly».
3. Select one zone → Export.
4. Verify the saved file has extension `.bodgeassembly` (or `.bodge` with manifest.exportType='assembly').
5. Unzip it → verify only ONE `assemblies/*.json` is present + only referenced containers + only referenced primers.

✅ PASS if the exported archive contains exactly the chosen assembly's transitive closure.

❌ FAIL if other zones leak in or referenced containers are missing.

### 5. `.bodgeassembly` import into fresh project

1. In BodgeGene, create a new empty project.
2. File → Import .bodgeassembly → pick the file from step 4.
3. Verify:
   - The imported zone appears in the new project.
   - Containers used by the zone appear in Library.
   - Primers used by ops appear in primer pool with badge "из проекта <source-project-name>".

✅ PASS if the zone + containers + primers materialize correctly.

❌ FAIL if any cross-reference dangles or the zone fails to render.

## Reporting

For each step, fill in:

```
Step 1 (v1 → v2 migrate):    PASS / FAIL — <notes>
Step 2 (SnapGene opens .gb): PASS / FAIL — <notes>
Step 3 (external edit):      PASS / FAIL — <notes>
Step 4 (.bodgeassembly):     PASS / FAIL — <notes>
Step 5 (.bodgeassembly in):  PASS / FAIL — <notes>
```

## §6.4 loss matrix (fill after step 2 for each tool)

| Tool | Sequence | Features | /bodge_id | /color | COMMENT |
|------|----------|----------|-----------|--------|---------|
| SnapGene 6 | | | | | |
| ApE 3 | | | | | |
| Geneious Prime | | | | | |
| NCBI Entrez | | | | | |
| pLannotate | | | | | |

✓ = preserved verbatim
↻ = preserved via multi-line reassembly (K0 normalizer engaged)
∅ = stripped (loss confirmed)

Drop the filled matrix into Chat after the run.

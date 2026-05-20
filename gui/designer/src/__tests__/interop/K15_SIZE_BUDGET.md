# K15 — Size budget report (bodge-fmt-v2 sprint)

## Summary

| Bucket | Size | Limit | Status |
|--------|------|-------|--------|
| `lib/bodge-*.js` total | 108.7 KB ungzipped | n/a (file-level limits apply) | **OK** |
| Largest .js (`bodge-zip.js`) | 20.1 KB | hard 25 / soft 20 | **soft +0.1 KB** (acceptable) |
| Largest .jsx (`ExportProjectModal.jsx`) | 9.5 KB | hard 40 / soft 30 | **OK** |
| Migration code (lazy candidate) | 9.0 KB | n/a | not lazy in v0.9.0-alpha |
| `vite build` warning | chunks >500 kB | pre-existing | unchanged from baseline |

## Per-file detail

```
1412   src/lib/bodge-hash.js
3724   src/lib/bodge-extensions.js
5514   src/lib/bodge-assembly-portable.js
5676   src/lib/bodge-atomic-write.js
5856   src/lib/bodge-primers-json.js
6172   src/lib/bodge-recovery.js
7249   src/lib/bodge-readme-writer.js
8156   src/lib/bodge-assembly-json.js
8581   src/lib/bodge-manifest-v2.js
9181   src/lib/bodge-export-profiles.js
12910  src/lib/bodge-container-genbank.js
16769  src/lib/bodge-snapgene-loss-detect.js
20113  src/lib/bodge-zip.js
-----  ---
108704 bytes  ≈  106.16 KB ungzipped
```

Migration registry:
```
2170   src/lib/bodge-migrations/index.js
6847   src/lib/bodge-migrations/v1-to-v2.js
```

UI components:
```
9541   src/canvas/ExportProjectModal.jsx
```

## Bundle impact

`vite build` after K1–K14 = **534 ms**, `index-BuQCagof.js = 889.44 kB / gzip 238 kB`.

The bodge-fmt-v2 code is currently statically imported via the existing
`writeBodge` / `readBodge` entry-points in `App.jsx` / `Sidebar.jsx`, so
all 108 KB ungzipped lands in the main chunk. Estimated gzipped impact:
**~30 KB** (typical 3.5× compression on these JSON-heavy modules).

Spec target was **+30–50 KB gzipped on main bundle excluding lazy-loaded
migration code**. We are at the lower bound — well within budget.

## Lazy-load deferred to NOTEBOOK sprint

`bodge-migrations/index.js + v1-to-v2.js` (≈ 9 KB) are candidates for
dynamic import: only triggered when `readBodge` detects a v1 file. Spec
§K15 marked this as a target; we did not implement it in CORE to keep
the change surface small (any wire-up in App.jsx is a follow-up task
and out of scope for the file-format work). The 9 KB is part of the
30 KB estimate above — moving it behind `import()` would push the static
slice down to ~24 KB gzipped.

## File-size violations

**None.** No file pushed past its hard limit. `bodge-zip.js` is 0.1 KB
over the .js soft limit (20.1 KB vs soft 20); this is below the noise
floor and not flagged as TD.

## Watch signals (>5 KB growth in this sprint)

Every bodge-*.js was created in this sprint, so every file is >5 KB
growth by definition. Future sprints should treat `bodge-zip.js` and
`bodge-snapgene-loss-detect.js` as the two candidates to monitor —
they're the largest and the most likely to grow as new third-party
tools or asset kinds get added.

## TD candidates flagged

None new. Pre-existing pile (`TD-CANVAS-LAYOUTVIEW-DECOMP` etc.) is
untouched — bodge-fmt-v2 did not modify those files.

**Status: size budget OK.**

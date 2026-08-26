---
name: size-budget
description: Assess BodgeGene JavaScript and JSX file-size risk before edits and at package handoff. Use the soft and hard thresholds as architecture signals without forcing mechanical decomposition of stable legacy files.
---

# Size budget

| File type | Soft | Hard |
|---|---:|---:|
| `.jsx` component | 30 KiB | 40 KiB |
| `.js` helper or algorithm | 20 KiB | 25 KiB |
| dictionaries, locales, generated/static data | not limited | not limited |

Measure bytes before and after the package for every changed `.js` or `.jsx` file.

## Interpretation

- Below soft: normal change.
- Soft to hard: allowed with an ownership/risk note. Prefer extraction when the change introduces a separable responsibility.
- Existing hard exceedance: not an automatic command to split a stable file. Assess whether the file is in active backlog, growing quickly, or causing unrelated breakage.
- New hard exceedance: do not introduce it without an explicit architectural decision.

Decomposition is mandatory when at least one is true:

- the file is already named in active backlog for decomposition;
- the package adds a new independent responsibility;
- the file is growing rapidly across packages;
- changing one concern repeatedly breaks another.

Split by ownership or dependency boundary, not by arbitrary line count. Do not perform broad extraction inside a bugfix merely to satisfy a number.

## Handoff

Report changed files only:

```text
path/file.jsx: before → after bytes (soft/hard status)
```

Also report:

- new soft-zone entrants;
- new hard-zone entrants;
- files that grew by more than 5 KiB;
- any deferred decomposition and its canonical `docs/BACKLOG.md` entry.
